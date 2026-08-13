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

export type PublishResult = 'success' | 'editorial_skip' | 'threads_failed' | 'key_missing' | 'slot_duplicate';

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
  /** 별이가 어떤 공개 재료를 골랐는지. 원문·토큰 없이 선택과 이유만. */
  editorial?: { source: 'observation' | 'radio' | 'story' | 'schedule' | 'silence'; reason: string };
}

/** 공개 URL을 R2 키로 되돌린다 (별이 일지엔 키만, 원문 URL 노출 최소화) */
function toImageKey(img: string | null): string | null {
  if (!img) return null;
  const m = img.match(/captures\/[^?#]+/);
  return m ? m[0] : img.replace(/^https?:\/\/[^/]+\//, '');
}

/** invokedAt에 가장 가까운 예정 슬롯(KST)을 ±40분 안에서 찾는다. 없으면 null(수동 호출 등) */
export function nearestScheduledSlot(invokedAt: number): string | null {
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
  rec: Omit<PublishLogRecord, 'runId'>,
): Promise<void> {
  /* scheduledFor는 **호출자가 안다. 여기서 시각으로 추정하지 않는다.**
     08-09 실사고: 스케줄러의 보충 호출(어제 22:00 대상)이 08:05에 들어왔는데,
     여기서 invokedAt으로 슬롯을 재계산해 「오늘 08:00 slot_duplicate」로 적혔다.
     같은 순간 진짜 08:00 발행은 메타 일시 장애로 실패했고 — 장부에는
     「08:00은 이미 나갔다」와 「08:00 발행 실패」가 동시에 남아 콘솔이 모순을 보였다.
     장부가 거짓말하면 사람이 크론을 의심한다. 진실은 호출자만 안다. */
  const record: PublishLogRecord = {
    runId: `pub_${rec.invokedAt}`,
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

/** 이 호출이 속한 예정 슬롯. null이면 비정시(수동) 호출 — 영수증 대상이 아니다. */
export function slotOf(invokedAt: number): string | null {
  return nearestScheduledSlot(invokedAt);
}

/** 보충 허용 기간 — 지난 슬롯을 얼마나 거슬러 채울 수 있나. 하루 지난 글을 새로 올리지 않는다. */
export const RECONCILE_WINDOW_MS = 13 * 60 * 60 * 1000;

/**
 * 호출자가 **의도한 슬롯**을 검증한다 (홈즈 판정 07-26).
 *
 * 늦은 보충을 현재 시각으로 부르면 `slotOf(now)`가 과거 누락 슬롯을 알 수 없다 —
 * 18:50의 보충이 18:00 슬롯을 채우려면 호출자가 그 슬롯을 명시하고 서버가 검증해야 한다.
 *
 * 통과 조건: 허용된 08/18/22 KST 슬롯의 정확한 표기여야 하고, 미래가 아니어야 하며,
 * 보충 허용 기간 안이어야 한다. 하나라도 어긋나면 null — 호출자가 아무 슬롯이나 찍지 못한다.
 */
export function validateSlotIso(iso: string, now: number): string | null {
  const kstNow = new Date(now + KST_OFFSET_MS);
  for (let dayBack = 0; dayBack <= 1; dayBack++) {
    const base = new Date(kstNow);
    base.setUTCDate(base.getUTCDate() - dayBack);
    for (const h of SLOT_HOURS_KST) {
      const slotUtc = Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), base.getUTCDate(), h, 0, 0) - KST_OFFSET_MS;
      if (kstIso(slotUtc) !== iso) continue;
      if (slotUtc > now + 60 * 1000) return null;              // 미래 슬롯 금지
      if (now - slotUtc > RECONCILE_WINDOW_MS) return null;    // 너무 오래된 슬롯 금지
      return iso;
    }
  }
  return null;
}

export interface SlotReceipt {
  slot: string;
  at: number;
  textIndex: number | null;
}

/**
 * 이 슬롯이 **실제로 발행됐는가**를 발행 로그에서 확인한다.
 *
 * ⚠ 실사고 2026-07-26 08:05 — 별이가 한 슬롯 아침에 두 번 말했다.
 *   보충(`reconcileMissedSlots`)이 07-25 22:00 슬롯을 "누락"으로 보고 채웠는데,
 *   그 슬롯은 누락된 적이 없다. **영수증 장부가 그때 아직 없었을 뿐이다**(00:40 배포).
 *   → **영수증 부재 ≠ 누락.** 장부가 없던 시절과, 영수증 쓰기가 실패한 경우(쓰기는
 *     `.catch`로 삼킨다)까지 같은 구멍이다. 그래서 보충 전에 **더 오래된 증인**인
 *     publish_log를 함께 본다. 둘 중 하나라도 "발행됨"이면 보충하지 않는다.
 */
export function hasSuccessfulRun(log: readonly PublishLogRecord[], slotIso: string): boolean {
  return log.some((r) => r.scheduledFor === slotIso && (r.result === 'success' || r.result === 'editorial_skip'));
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
    log.filter((r) => r.result === 'success' || r.result === 'editorial_skip').map((r) => r.scheduledFor).filter(Boolean) as string[],
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
