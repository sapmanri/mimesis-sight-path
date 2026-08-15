import {
  DAY_KEY,
  DAYS_KEY,
  PROGRAM_KEY,
  type ProgramSegment,
} from '../_station.ts';

export interface CloudReplayEnv {
  PLANET: Pick<KVNamespace, 'get'>;
}

const RADIO_AUDIO_ORIGIN = 'pub-8ec6440aae5545379fcfdd50a243847a.r2.dev';
const REPLAY_KINDS = new Set(['talk', 'story', 'song']);
const ARCHIVE_DAYS_TO_TRY = 7;

function parseSegments(raw: string | null): ProgramSegment[] {
  if (!raw) return [];
  try {
    const value = JSON.parse(raw);
    return Array.isArray(value) ? value.filter((item) => item && typeof item === 'object') : [];
  } catch {
    return [];
  }
}

function parseDays(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const value = JSON.parse(raw);
    return Array.isArray(value)
      ? value.filter((day) => typeof day === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(day))
      : [];
  } catch {
    return [];
  }
}

export function radioR2Key(urlValue: unknown): string | null {
  if (typeof urlValue !== 'string') return null;
  try {
    const url = new URL(urlValue);
    if (url.protocol !== 'https:' || url.hostname !== RADIO_AUDIO_ORIGIN) return null;
    const key = decodeURIComponent(url.pathname.replace(/^\/+/, ''));
    return key.startsWith('radio/') && !key.includes('..') ? key : null;
  } catch {
    return null;
  }
}

export function resolvedByteRange(
  range: { offset?: number; length?: number; suffix?: number },
  size: number,
): { offset: number; length: number } {
  if (typeof range.suffix === 'number') {
    const length = Math.max(0, Math.min(size, range.suffix));
    return { offset: size - length, length };
  }
  const offset = Math.max(0, Math.min(size, Number(range.offset ?? 0)));
  const length = Math.max(0, Math.min(size - offset, Number(range.length ?? size - offset)));
  return { offset, length };
}

/**
 * Pick the newest broadcast that has actually finished. Future/current
 * programme entries are excluded so an origin failure cannot skip ahead into
 * audio that has not yet aired.
 */
export function selectLatestCompletedReplay(
  segments: ProgramSegment[],
  now = Date.now(),
): ProgramSegment | null {
  const byIdentity = new Map<string, ProgramSegment>();
  for (const segment of segments) {
    const startAt = Number(segment?.startAt);
    const dur = Number(segment?.dur);
    if (!REPLAY_KINDS.has(String(segment?.kind))) continue;
    if (!Number.isFinite(startAt) || !Number.isFinite(dur) || dur <= 0) continue;
    if (startAt + dur * 1000 > now) continue;
    const key = radioR2Key(segment?.url);
    if (!key) continue;
    const identity = `${key}|${Math.trunc(startAt)}`;
    byIdentity.set(identity, segment);
  }
  return [...byIdentity.values()].sort((left, right) =>
    Number(right.startAt) - Number(left.startAt)
      || String(right.id).localeCompare(String(left.id)),
  )[0] ?? null;
}

/**
 * The rolling programme key normally contains the newest two days. The
 * permanent day archive is only consulted if that rolling window is missing
 * or has no completed playable item, keeping the powered-off path cheap.
 */
export async function loadLatestCloudReplay(
  env: CloudReplayEnv,
  now = Date.now(),
): Promise<ProgramSegment | null> {
  const programme = selectLatestCompletedReplay(
    parseSegments(await env.PLANET.get(PROGRAM_KEY)),
    now,
  );
  if (programme) return programme;

  const days = parseDays(await env.PLANET.get(DAYS_KEY)).sort().reverse();
  for (const day of days.slice(0, ARCHIVE_DAYS_TO_TRY)) {
    const replay = selectLatestCompletedReplay(
      parseSegments(await env.PLANET.get(DAY_KEY(day))),
      now,
    );
    if (replay) return replay;
  }
  return null;
}

export function cloudReplayNow(segment: ProgramSegment, reason: string) {
  return {
    kind: segment.kind,
    title: segment.title || '가장 최근 방송',
    voiceNote: segment.voiceNote ?? null,
    script: segment.script,
    dur: segment.dur,
    mode: 'replay',
    isReplay: true,
    cloudFallback: true,
    sourceStartedAt: segment.startAt,
    replayId: segment.id,
    available: true,
    stale: false,
    reason,
  };
}
