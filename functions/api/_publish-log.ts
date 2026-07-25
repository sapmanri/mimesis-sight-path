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

export type PublishResult = 'success' | 'threads_failed' | 'key_missing' | 'slot_duplicate';

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

/* ── 슬롯 영수증 (홈즈 처방 ③, 2026-07-26) ──────────────────
   ⚠ **이것은 원자적 잠금이 아니다.** 홈즈 판정(07-26 00:44): 두 호출이 동시에 `read=null`을
     보면 **둘 다 발행한다.** 이건 재시도·시간차 중복 방지 장치이지 동시 멱등이 아니다.
     "멱등 완료"라고 부르지 마라. 병행 검증 때는 새 Worker를 정각이 아니라 +5분에 때려
     먼저 온 경로의 영수증이 보이게 하고, 병행 기간은 한 슬롯 실측에 필요한 만큼만 짧게 둔다.
     복수 발행자가 상시화되면 Durable Object나 D1 unique constraint 같은 원자적 조정자가 필요하다.

   자동발행이 21시간 죽었던 사고(07-25)의 근본 결함은 크론이 아니라 **전달 보장·멱등성 부재**였다.
   지금 autopost는 인증만 통과하면 무조건 발행한다 — 같은 슬롯을 두 번 때리면 별이가 두 번 말한다.

   ⚠ 이 영수증이 ②(스케줄러 Worker 신설)의 **선행 조건**이다. 외부 크론을 살려둔 채 새 Worker를
     병행 검증하려면, 두 경로가 같은 슬롯에 겹쳐도 한 번만 나가야 한다. 멱등이 먼저다.

   슬롯 정의는 새로 만들지 않는다 — 이 파일의 `SLOT_HOURS_KST`·`nearestScheduledSlot`을
   그대로 쓴다(워치독 `threads-watchdog.sh`의 `SLOTS="8 18 22"`와 같은 값).
   ⚠ ±40분 창은 **넓히지 마라** (홈즈 판정 07-26). 그 창은 외부 크론의 시각을 추정하는
     레거시 휴리스틱일 뿐, 전달 보장의 식별자가 되어서는 안 된다. 늦은 보충은 창을 넓혀서가 아니라
     새 Worker가 **의도한 `scheduledFor`를 명시**하고 Pages가 그것을 검증해서 처리한다
     (그래야 18:50의 보충이 18:00 슬롯을 채우고, 다음 호출도 같은 영수증에 막힌다).
     ±40분은 기존 외부 크론이 살아 있는 병행 기간에만 유지한다. */

const RECEIPT_TTL_S = 7 * 24 * 60 * 60;
export const receiptKey = (slotIso: string) => `publish_receipt:${slotIso}`;

/** 이 호출이 속한 예정 슬롯. null이면 비정시(수동) 호출 — 멱등 대상이 아니다. */
export function slotOf(invokedAt: number): string | null {
  return nearestScheduledSlot(invokedAt);
}

export interface SlotReceipt {
  slot: string;
  at: number;
  textIndex: number | null;
}

export async function readSlotReceipt(env: PublishLogEnv, slot: string): Promise<SlotReceipt | null> {
  const raw = await env.PLANET.get(receiptKey(slot));
  if (!raw) return null;
  try { return JSON.parse(raw) as SlotReceipt; } catch { return null; }
}

/**
 * 영수증은 **실제 발행에 성공했을 때만** 쓴다.
 * 실패한 슬롯에 영수증을 남기면 재시도·자동 보충이 영영 막힌다 — 멱등이 침묵으로 바뀐다.
 */
export async function writeSlotReceipt(env: PublishLogEnv, r: SlotReceipt): Promise<void> {
  await env.PLANET.put(receiptKey(r.slot), JSON.stringify(r), { expirationTtl: RECEIPT_TTL_S });
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
  // 홈즈 판정 07-26: 정본은 "로그가 있나"가 아니라 **"성공했나"**다.
  // threads_failed·key_missing·slot_duplicate 레코드가 남아 있어도 그 슬롯은 여전히 보충 대상이다
  // (실패 로그를 '발행됨'으로 세면 누락이 조용히 사라진다 — 침묵이 버그다).
  const present = new Set(
    log.filter((r) => r.result === 'success').map((r) => r.scheduledFor).filter(Boolean) as string[],
  );
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
