// Threads 게시 감사 로그.
//
// 별이의 자유 게시와 예약 미디어 발행은 같은 장부를 쓰되, 서로의 실행 조건을 공유하지 않는다.
// scheduledFor가 null이면 별이의 자유 판단/수동 발행이고, 값이 있으면 08·18·22 KST의
// 스크린샷 예약 슬롯이다. 시간표는 이 모듈의 슬롯 검증을 통과한 값만 기록한다.

export interface PublishLogEnv { PLANET: KVNamespace }

const LOG_KEY = 'publish_log';
const LOG_KEEP = 150;
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const SLOT_HOURS_KST = [8, 18, 22] as const;
const MISSED_GRACE_MS = 10 * 60 * 1000;
const RECEIPT_TTL_S = 7 * 24 * 60 * 60;
const RECONCILE_WINDOW_MS = 13 * 60 * 60 * 1000;

export type PublishResult =
  | 'success'
  | 'editorial_skip'
  | 'threads_failed'
  | 'key_missing'
  | 'slot_duplicate'
  | 'legacy_schedule_retired';

export interface PublishLogRecord {
  runId: string;
  /** null=자유/수동, ISO=검증된 스크린샷 예약 슬롯. */
  scheduledFor: string | null;
  invokedAt: number;
  result: PublishResult;
  httpStatus: number;
  textIndex: number | null;
  imageKey: string | null;
  threads: {
    attempted: boolean;
    ok: boolean;
    errorCode: string | null;
    requestId: string | null;
  };
  editorial?: {
    source: 'observation' | 'radio' | 'story' | 'schedule' | 'silence';
    action?: 'post' | 'comment' | 'silence';
    targetPostId?: string | null;
    reason: string;
  };
}

function kstIso(utcMs: number): string {
  const k = new Date(utcMs + KST_OFFSET_MS);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${k.getUTCFullYear()}-${p(k.getUTCMonth() + 1)}-${p(k.getUTCDate())}T${p(k.getUTCHours())}:${p(k.getUTCMinutes())}:00+09:00`;
}

/** 호출 시각에서 ±40분 안의 예약 슬롯. 비정시 수동 호출이면 null. */
export function nearestScheduledSlot(invokedAt: number): string | null {
  const kst = new Date(invokedAt + KST_OFFSET_MS);
  let best: number | null = null;
  for (const h of SLOT_HOURS_KST) {
    const slotUtc = Date.UTC(kst.getUTCFullYear(), kst.getUTCMonth(), kst.getUTCDate(), h) - KST_OFFSET_MS;
    if (best === null || Math.abs(invokedAt - slotUtc) < Math.abs(invokedAt - best)) best = slotUtc;
  }
  return best !== null && Math.abs(invokedAt - best) <= 40 * 60 * 1000 ? kstIso(best) : null;
}

/** 호출자가 명시한 슬롯이 허용 시각·미래 금지·13시간 보충창을 모두 만족하는지 검증한다. */
export function validateSlotIso(iso: string, now: number): string | null {
  const kstNow = new Date(now + KST_OFFSET_MS);
  for (let dayBack = 0; dayBack <= 1; dayBack += 1) {
    const base = new Date(kstNow);
    base.setUTCDate(base.getUTCDate() - dayBack);
    for (const h of SLOT_HOURS_KST) {
      const slotUtc = Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), base.getUTCDate(), h) - KST_OFFSET_MS;
      if (kstIso(slotUtc) !== iso) continue;
      if (slotUtc > now + 60_000 || now - slotUtc > RECONCILE_WINDOW_MS) return null;
      return iso;
    }
  }
  return null;
}

export const slotOf = (invokedAt: number) => nearestScheduledSlot(invokedAt);

export async function appendPublishLog(
  env: PublishLogEnv,
  record: Omit<PublishLogRecord, 'runId'>,
): Promise<void> {
  if (record.scheduledFor && !validateSlotIso(record.scheduledFor, record.invokedAt)) {
    throw new Error('invalid_scheduled_slot');
  }
  const raw = await env.PLANET.get(LOG_KEY);
  let log: PublishLogRecord[] = [];
  try { log = raw ? JSON.parse(raw) as PublishLogRecord[] : []; } catch { /* 새 로그로 회복 */ }
  const runId = `pub_${record.invokedAt}_${crypto.randomUUID().slice(0, 8)}`;
  await env.PLANET.put(LOG_KEY, JSON.stringify([{ runId, ...record }, ...log].slice(0, LOG_KEEP)));
}

export interface SlotReceipt { slot: string; at: number; textIndex: number | null }
export const receiptKey = (slot: string) => `publish_receipt:${slot}`;

export async function readSlotReceipt(env: PublishLogEnv, slot: string): Promise<SlotReceipt | null> {
  const raw = await env.PLANET.get(receiptKey(slot));
  if (!raw) return null;
  try { return JSON.parse(raw) as SlotReceipt; } catch { return null; }
}

export async function writeSlotReceipt(env: PublishLogEnv, receipt: SlotReceipt): Promise<void> {
  await env.PLANET.put(receiptKey(receipt.slot), JSON.stringify(receipt), { expirationTtl: RECEIPT_TTL_S });
}

export function hasSuccessfulRun(log: readonly PublishLogRecord[], slot: string): boolean {
  return log.some((r) => r.scheduledFor === slot && (r.result === 'success' || r.result === 'editorial_skip'));
}

/** 최근 24시간 예약 슬롯 중 성공 기록이 없고 10분 유예가 지난 슬롯. */
export function computeMissedSlots(log: PublishLogRecord[], now: number): string[] {
  const present = new Set(log
    .filter((r) => r.result === 'success' || r.result === 'editorial_skip')
    .map((r) => r.scheduledFor)
    .filter((v): v is string => !!v));
  const missed: string[] = [];
  for (let dayBack = 0; dayBack <= 1; dayBack += 1) {
    const base = new Date(now + KST_OFFSET_MS);
    base.setUTCDate(base.getUTCDate() - dayBack);
    for (const h of SLOT_HOURS_KST) {
      const slotUtc = Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), base.getUTCDate(), h) - KST_OFFSET_MS;
      if (slotUtc > now - MISSED_GRACE_MS || now - slotUtc > 24 * 60 * 60 * 1000) continue;
      const iso = kstIso(slotUtc);
      if (!present.has(iso)) missed.push(iso);
    }
  }
  return missed.sort().reverse();
}

export const publishLogConfig = { LOG_KEY, LOG_KEEP, SLOT_HOURS_KST, MISSED_GRACE_MS };
