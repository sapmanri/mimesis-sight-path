// Threads 게시 감사 로그.
//
// scheduledFor 필드는 2026-08-13 이전 기록을 읽기 위해서만 남긴다. 새 기록은 모두 null이며,
// 이 모듈에는 고정 시각 계산·누락 보충·슬롯 영수증이 없다. 게시 실행은 Social Director가
// 직렬화하고, 같은 사건은 social event 영수증으로 멱등 처리한다.

export interface PublishLogEnv { PLANET: KVNamespace }

const LOG_KEY = 'publish_log';
const LOG_KEEP = 120;

export type PublishResult =
  | 'success'
  | 'editorial_skip'
  | 'threads_failed'
  | 'legacy_schedule_retired';

export interface PublishLogRecord {
  runId: string;
  /** 과거 슬롯 기록 호환. 새 실행은 반드시 null. */
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
    action: 'post' | 'comment' | 'silence';
    targetPostId: string | null;
    reason: string;
  };
}

export async function appendPublishLog(
  env: PublishLogEnv,
  record: Omit<PublishLogRecord, 'runId'>,
): Promise<void> {
  if (record.scheduledFor !== null) {
    throw new Error('fixed_schedule_records_are_retired');
  }
  const raw = await env.PLANET.get(LOG_KEY);
  let log: PublishLogRecord[] = [];
  try { log = raw ? JSON.parse(raw) as PublishLogRecord[] : []; } catch { /* 새 로그로 회복 */ }
  const runId = `pub_${record.invokedAt}_${crypto.randomUUID().slice(0, 8)}`;
  await env.PLANET.put(LOG_KEY, JSON.stringify([{ runId, ...record }, ...log].slice(0, LOG_KEEP)));
}

export const publishLogConfig = { LOG_KEY, LOG_KEEP };
