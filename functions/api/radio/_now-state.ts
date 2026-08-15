export interface RadioNowPayload {
  kind?: string;
  title?: string;
  isReplay?: boolean;
  startedAt?: number;
  updatedAt?: number;
  dur?: number;
  [key: string]: unknown;
}

const ACTIVE_GRACE_MS = 45_000;
const BED_MAX_AGE_MS = 6 * 60_000;

/**
 * The ingest Worker keeps the last object in R2.  A stopped Mac therefore
 * leaves a perfectly valid-looking old programme behind unless the Pages edge
 * checks its clock.  Only fresh on-air facts may reach the radio UI.
 */
export function normalizeRadioNow(
  value: unknown,
  now = Date.now(),
): (RadioNowPayload & { available: true; stale: false }) | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const payload = value as RadioNowPayload;
  const kind = String(payload.kind || '');
  const startedAt = Number(payload.startedAt || 0);
  const updatedAt = Number(payload.updatedAt || 0);
  const durationMs = Math.max(0, Number(payload.dur || 0) * 1000);

  let expiresAt = 0;
  if (kind && kind !== 'bed') {
    if (startedAt > 0) expiresAt = startedAt + durationMs + ACTIVE_GRACE_MS;
    else if (updatedAt > 0) expiresAt = updatedAt + ACTIVE_GRACE_MS;
  } else {
    const observedAt = updatedAt || startedAt;
    if (observedAt > 0) expiresAt = observedAt + BED_MAX_AGE_MS;
  }
  if (!expiresAt || now > expiresAt) return null;
  return { ...payload, available: true, stale: false };
}

export function unavailableRadioNow(reason: string) {
  return {
    kind: 'bed',
    title: '별리의 방',
    isReplay: false,
    engine: 'liquidsoap',
    available: false,
    stale: true,
    reason,
  };
}
