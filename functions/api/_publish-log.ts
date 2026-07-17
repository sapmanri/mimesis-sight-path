// BUILD 422-OPS-A — Publish Audit Log
// 정본: docs/BUILD_422_OPS_OBSERVER_CONSOLE.md §3-2
//
// 하나의 발행 이벤트를 한 레코드로 저장하고, 두 층으로 읽는다:
//   Layer 1 운영 로그 (개발자)  = runId·scheduledFor·httpStatus·result·threads.errorCode·requestId
//   Layer 2 별이 일지 (우리)     = textIndex·imageKey·result
//
// 저장 금지(하드룰): 액세스 토큰 · PUBLISH_KEY · Threads 응답 전문 · 응답 헤더 원문 · IP · UA.
// Threads 결과는 errorCode(Meta) · HTTP 상태 · requestId 요약만.

export interface PublishLogEnv {
  PLANET: KVNamespace;
}

const LOG_KEY = 'publish_log';
const LOG_KEEP = 90; // ≈ 30일 × 3회
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const SLOT_HOURS_KST = [8, 18, 22] as const; // cron-job.org와 수동 동기
const MISSED_GRACE_MS = 10 * 60 * 1000;

const K_401_TTL_S = 24 * 60 * 60;
const SLOT_401_MS = 10 * 60 * 1000; // 10분 버킷

export type PublishResult = 'success' | 'threads_failed' | 'key_missing';

export interface PublishLogRecord {
  runId: string;
  /** 가장 가까운 예정 슬롯 (KST ISO). 크론 정시 호출 기준 */
  scheduledFor: string | null;
  invokedAt: number;
  result: PublishResult;
  httpStatus: number;
  /** Layer 2 — 별이 일지용 */
  textIndex: number | null;
  imageKey: string | null;
  /** Layer 1 — 운영 로그용. 원문 message는 절대 담지 않는다. */
  threads: {
    attempted: boolean;
    ok: boolean;
    errorCode: string | null;
    requestId: string | null;
  };
}

/** 공개 URL을 R2 키로 되돌린다 (별이 일지엔 키만, 원문 URL 노출 최소화) */
function toImageKey(img: string | null): string | null {
  if (!img) return null;
  const m = img.match(/captures\/[^?#]+/);
  return m ? m[0] : img.replace(/^https?:\/\/[^/]+\//, '');
}

/** invokedAt에 가장 가까운 예정 슬롯(KST)을 ±40분 안에서 찾는다. 없으면 null(수동 호출 등) */
function nearestScheduledSlot(invokedAt: number): string | null {
  const kst = new Date(invokedAt + KST_OFFSET_MS);
  const y = kst.getUTCFullYear(), mo = kst.getUTCMonth(), d = kst.getUTCDate();
  let best: number | null = null;
  for (const h of SLOT_HOURS_KST) {
    const slotUtc = Date.UTC(y, mo, d, h, 0, 0) - KST_OFFSET_MS;
    if (best === null || Math.abs(invokedAt - slotUtc) < Math.abs(invokedAt - best)) best = slotUtc;
  }
  if (best === null || Math.abs(invokedAt - best) > 40 * 60 * 1000) return null;
  return kstIso(best);
}

function kstIso(utcMs: number): string {
  const k = new Date(utcMs + KST_OFFSET_MS);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${k.getUTCFullYear()}-${p(k.getUTCMonth() + 1)}-${p(k.getUTCDate())}T${p(k.getUTCHours())}:${p(k.getUTCMinutes())}:00+09:00`;
}

/** 정상 크론 / 503 결과 1건 기록 (최신순, 최대 LOG_KEEP) */
export async function appendPublishLog(
  env: PublishLogEnv,
  rec: Omit<PublishLogRecord, 'runId' | 'scheduledFor'>,
): Promise<void> {
  const record: PublishLogRecord = {
    runId: `pub_${rec.invokedAt}`,
    scheduledFor: nearestScheduledSlot(rec.invokedAt),
    ...rec,
  };
  const raw = await env.PLANET.get(LOG_KEY);
  const log: PublishLogRecord[] = raw ? JSON.parse(raw) : [];
  const next = [record, ...log].slice(0, LOG_KEEP);
  await env.PLANET.put(LOG_KEY, JSON.stringify(next));
}

/** 401은 건별 기록 금지 — 10분 슬롯 카운터만. IP·헤더·UA 저장하지 않는다. */
export async function bump401Bucket(env: PublishLogEnv, now: number): Promise<void> {
  const slot = Math.floor(now / SLOT_401_MS) * SLOT_401_MS;
  const key = `publish_401:${slot}`;
  const raw = await env.PLANET.get(key);
  const count = raw ? (parseInt(raw, 10) || 0) : 0;
  await env.PLANET.put(key, String(count + 1), { expirationTtl: K_401_TTL_S });
}

/** 예정 슬롯 중 최근 24h에서 run 레코드가 없는(유예 경과) 슬롯을 missed로 추론 */
export function computeMissedSlots(log: PublishLogRecord[], now: number): string[] {
  const present = new Set(log.map((r) => r.scheduledFor).filter(Boolean) as string[]);
  const missed: string[] = [];
  for (let dayBack = 0; dayBack <= 1; dayBack++) {
    const base = new Date(now + KST_OFFSET_MS);
    base.setUTCDate(base.getUTCDate() - dayBack);
    const y = base.getUTCFullYear(), mo = base.getUTCMonth(), d = base.getUTCDate();
    for (const h of SLOT_HOURS_KST) {
      const slotUtc = Date.UTC(y, mo, d, h, 0, 0) - KST_OFFSET_MS;
      if (slotUtc > now - MISSED_GRACE_MS) continue; // 아직 유예 안 지남 → 판정 보류
      if (now - slotUtc > K_401_TTL_S * 1000) continue; // 24h 밖은 무시
      const iso = kstIso(slotUtc);
      if (!present.has(iso)) missed.push(iso);
    }
  }
  return missed.sort().reverse();
}

export const publishLogConfig = { LOG_KEY, LOG_KEEP, SLOT_HOURS_KST, MISSED_GRACE_MS };
