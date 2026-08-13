import { decodeWebObservationShelf } from './_radio-observations.ts';

export type SocialTriggerKind =
  | 'program_registered'
  | 'story_aired'
  | 'observation_arrived'
  | 'social_refreshed'
  | 'curiosity'
  | 'manual_start';

export interface SocialTrigger {
  kind: SocialTriggerKind;
  eventId: string;
  occurredAt: number;
  refId?: string | null;
}

const VALID_TRIGGERS = new Set<SocialTriggerKind>([
  'program_registered', 'story_aired', 'observation_arrived',
  'social_refreshed', 'curiosity', 'manual_start',
]);

export function parseSocialTrigger(raw: unknown, now = Date.now()): SocialTrigger | null {
  const value = raw as Partial<SocialTrigger> | null;
  if (!value || !VALID_TRIGGERS.has(value.kind as SocialTriggerKind)) return null;
  const eventId = String(value.eventId ?? '').trim().slice(0, 180);
  const occurredAt = Number(value.occurredAt);
  if (!/^[A-Za-z0-9._:-]{6,180}$/.test(eventId)) return null;
  if (!Number.isFinite(occurredAt) || occurredAt > now + 120_000 || occurredAt < now - 30 * 86_400_000) return null;
  const refId = value.refId == null ? null : String(value.refId).trim().slice(0, 120) || null;
  return { kind: value.kind as SocialTriggerKind, eventId, occurredAt, refId };
}

export function observationText(raw: unknown): string {
  const shelf = decodeWebObservationShelf(raw);
  return shelf.sources.slice(0, 5).flatMap((source) =>
    source.items.slice(0, 2).map((item) =>
      [`${source.label} — ${item.title}`.trim(), item.text].filter(Boolean).join('\n'),
    ),
  ).filter(Boolean).join('\n\n').slice(0, 5_000);
}

function normalized(text: string): string {
  return text.replace(/\s+/g, ' ').trim().toLowerCase();
}

export function isRecentDuplicate(text: string, recentTexts: string[]): boolean {
  const needle = normalized(text);
  return !!needle && recentTexts.some((recent) => normalized(recent) === needle);
}
