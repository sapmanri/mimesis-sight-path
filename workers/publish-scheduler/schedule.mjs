export const LIVENESS_GUARD_MS = 12 * 60 * 60 * 1000;
export const MIN_WAKE_DELAY_MS = 1_000;
export const MAX_CONTINUATION_DELAY_MS = 10 * 60 * 1000;

function timestamp(value) {
  if (value == null || value === '') return null;
  const at = Number(value);
  return Number.isFinite(at) ? at : null;
}

function futureChosenWake(value, now) {
  const at = timestamp(value);
  return at !== null && at > now ? Math.trunc(at) : null;
}

function preservedWake(value, now) {
  const at = timestamp(value);
  if (at === null) return null;
  return Math.max(now + MIN_WAKE_DELAY_MS, Math.trunc(at));
}

export function isAgencyDirectorWake(kind) {
  return kind === 'curiosity' || kind === 'manual_start' || kind === 'liveness_guard';
}

/**
 * 한 Durable Object alarm에 댓글 백로그, 별이가 고른 다음 확인, 생존 확인을 함께 싣는다.
 * 생존 확인은 게시 시각표가 아니다. 별이가 다음 확인을 고르지 않았고 실제 사건도 오지 않을 때
 * 판단 기회를 다시 여는 최후 안전망이며, 글·댓글·침묵 선택은 Social Agent가 그대로 맡는다.
 */
export function planDirectorWake({
  now,
  triggerKind,
  editorialNext,
  continuationPending,
  continuationDelayMs,
  existingSelfWakeAt,
  existingLivenessWakeAt,
}) {
  const agencyWake = isAgencyDirectorWake(triggerKind);
  const selfWakeAt = agencyWake
    ? futureChosenWake(editorialNext, now)
    : preservedWake(existingSelfWakeAt, now);
  let livenessWakeAt = agencyWake ? null : preservedWake(existingLivenessWakeAt, now);
  if (!selfWakeAt && !livenessWakeAt) livenessWakeAt = now + LIVENESS_GUARD_MS;

  const requestedDelay = Number(continuationDelayMs);
  const continuationDelay = Number.isFinite(requestedDelay)
    ? Math.min(MAX_CONTINUATION_DELAY_MS, Math.max(MIN_WAKE_DELAY_MS, Math.trunc(requestedDelay)))
    : MIN_WAKE_DELAY_MS;
  const continuationAt = continuationPending ? now + continuationDelay : null;
  const candidates = [continuationAt, selfWakeAt, livenessWakeAt]
    .filter((at) => Number.isFinite(at) && at > now);

  return {
    selfWakeAt,
    livenessWakeAt,
    nextLookAt: candidates.length ? Math.min(...candidates) : now + LIVENESS_GUARD_MS,
  };
}

export function alarmTriggerKind(state) {
  if (state?.continuationPending) return 'backlog_continue';
  const selfWakeAt = timestamp(state?.selfWakeAt);
  const livenessWakeAt = timestamp(state?.livenessWakeAt);
  if (selfWakeAt !== null && (livenessWakeAt === null || selfWakeAt <= livenessWakeAt)) {
    return 'curiosity';
  }
  return 'liveness_guard';
}
