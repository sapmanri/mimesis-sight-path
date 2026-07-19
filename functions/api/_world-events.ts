// BUILD 423-EVENTS — World Director (lazy runtime, Authority 무변경)
// 정본: docs/BUILD_423_EVENTS_WORLD_DIRECTOR.md · 판정: Vase 2026-07-17 "예약 만들어" (§5-2 재판정)
//
// 예약(schedule)과 발동(수행)은 다른 행위다:
//   예약 = 운영자의 의도 기록 (Ops 경계 안, Access 뒤, 감사 필수)
//   수행 = 공개 폴링이 도달한 시점에 런타임이 조건·쿨다운을 재검증한 뒤에만 개시.
//         부적합하면 skipped(reason)로 기록하고 세계를 바꾸지 않는다.
// Authority DO는 이 파일을 모른다. 별이는 누가 예약했는지 모른다(관찰자 무지 원칙).

import { WORLD_EVENT_REGISTRY, getWorldEventById } from '../../src/worldEvents/worldEventRegistry.ts';

export interface WorldEventEnv {
  PLANET: KVNamespace;
}

const SCHEDULE_KEY = 'world_event_schedule';
const ACTIVE_KEY = 'world_event_active';
const SCHEDULE_KEEP = 60;
/** fireAt 이후 이 유예를 넘겨도 아무 시청 화면이 도달하지 않았으면 expired */
const FIRE_GRACE_MS = 15 * 60 * 1000;
/** 예약은 최대 30일 앞까지 */
const MAX_AHEAD_MS = 30 * 24 * 60 * 60 * 1000;

export type ReservationStatus = 'pending' | 'fired' | 'skipped' | 'cancelled';
export type SkipReason = 'expired' | 'conditions' | 'cooldown';

export interface ActiveInstance {
  eventId: string;
  eventInstanceId: string;
  startedAt: number;
  endsAt: number;
  sequence: number;
}

export interface EventReservation {
  id: string;
  eventId: string;
  /** KST ISO (+09:00 고정) */
  fireAt: string;
  fireAtMs: number;
  requestedAt: number;
  /** 감사: Cloudflare Access 인증 이메일. 단일 운영자라도 기록한다. */
  requestedBy: string;
  status: ReservationStatus;
  resolvedAt: number | null;
  skipReason: SkipReason | null;
  instance: ActiveInstance | null;
}

export interface DirectorContext {
  now: number;
  phase: string | null;
  weather: string | null;
  sequence: number;
}

/** KST(+09:00) ISO 문자열만 받는다 — 운영 UI가 KST 기준이므로 모호성 제거 */
export function parseFireAtKst(iso: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?\+09:00$/.test(iso)) return null;
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? ms : null;
}

export function validateReservationInput(
  eventId: string, fireAtMs: number | null, now: number,
): string | null {
  if (!getWorldEventById(eventId)) return 'unknown_event';
  if (fireAtMs === null) return 'bad_fire_at';
  if (fireAtMs <= now) return 'fire_at_past';
  if (fireAtMs > now + MAX_AHEAD_MS) return 'fire_at_too_far';
  return null;
}

function eligible(eventId: string, phase: string | null, weather: string | null): boolean {
  const def = getWorldEventById(eventId);
  if (!def) return false;
  if (def.eligibleTime && (!phase || !def.eligibleTime.includes(phase as never))) return false;
  if (def.eligibleWeather && (!weather || !def.eligibleWeather.includes(weather))) return false;
  return true;
}

function lastFiredAt(schedule: EventReservation[], eventId: string): number | null {
  let last: number | null = null;
  for (const r of schedule) {
    if (r.eventId === eventId && r.status === 'fired' && r.instance) {
      if (last === null || r.instance.startedAt > last) last = r.instance.startedAt;
    }
  }
  return last;
}

/**
 * 만기 예약을 순서대로 재검증한다. 한 번에 최대 1건만 개시(무대는 하나).
 * 반환: 갱신된 schedule, 새로 개시된 인스턴스(있다면), 변경 여부.
 */
export function resolveDue(
  schedule: EventReservation[], ctx: DirectorContext,
): { schedule: EventReservation[]; activated: ActiveInstance | null; changed: boolean } {
  let changed = false;
  let activated: ActiveInstance | null = null;
  const next = schedule.map((r) => ({ ...r }));
  const due = next
    .filter((r) => r.status === 'pending' && r.fireAtMs <= ctx.now)
    .sort((a, b) => a.fireAtMs - b.fireAtMs);

  for (const r of due) {
    if (ctx.now - r.fireAtMs > FIRE_GRACE_MS) {
      r.status = 'skipped'; r.skipReason = 'expired'; r.resolvedAt = ctx.now; changed = true;
      continue;
    }
    if (activated) continue; // 이번 턴 개시는 1건 — 나머지는 다음 폴링에서 재평가
    const def = getWorldEventById(r.eventId);
    if (!def) {
      r.status = 'skipped'; r.skipReason = 'conditions'; r.resolvedAt = ctx.now; changed = true;
      continue;
    }
    // 조건 불일치는 판결이 아니라 '아직'이다. 별이의 하루는 60초라 유예(15분) 안에
    // dusk/night가 여러 번 돌아온다 — pending을 유지하고 다음 폴링에서 다시 본다.
    // (유예를 넘기면 위에서 expired로 확정된다.)
    if (!eligible(r.eventId, ctx.phase, ctx.weather)) continue;
    const last = lastFiredAt(next, r.eventId);
    if (last !== null && ctx.now - last < def.cooldownSeconds * 1000) {
      r.status = 'skipped'; r.skipReason = 'cooldown'; r.resolvedAt = ctx.now; changed = true;
      continue;
    }
    activated = {
      eventId: r.eventId,
      eventInstanceId: `res-${r.id}`, // 예약 기반 결정론 ID — 동시 폴링이 같은 인스턴스로 수렴
      startedAt: ctx.now,
      endsAt: ctx.now + def.durationSeconds * 1000,
      sequence: ctx.sequence,
    };
    r.status = 'fired'; r.resolvedAt = ctx.now; r.instance = activated; changed = true;
  }
  return { schedule: next, activated, changed };
}

export async function loadSchedule(env: WorldEventEnv): Promise<EventReservation[]> {
  const raw = await env.PLANET.get(SCHEDULE_KEY);
  return raw ? (JSON.parse(raw) as EventReservation[]) : [];
}

export async function saveSchedule(env: WorldEventEnv, schedule: EventReservation[]): Promise<void> {
  // 최신 요청순 유지, pending은 절대 잘려나가지 않게 앞으로
  const sorted = [...schedule].sort((a, b) => {
    if ((a.status === 'pending') !== (b.status === 'pending')) return a.status === 'pending' ? -1 : 1;
    return b.requestedAt - a.requestedAt;
  });
  await env.PLANET.put(SCHEDULE_KEY, JSON.stringify(sorted.slice(0, SCHEDULE_KEEP)));
}

export async function loadActive(env: WorldEventEnv): Promise<ActiveInstance | null> {
  const raw = await env.PLANET.get(ACTIVE_KEY);
  return raw ? (JSON.parse(raw) as ActiveInstance) : null;
}

export async function saveActive(env: WorldEventEnv, instance: ActiveInstance): Promise<void> {
  await env.PLANET.put(ACTIVE_KEY, JSON.stringify(instance));
}

/* ── BUILD 426-C — 자연 발생 (세렌디피티) ─────────────────────────────
   예약(연출)과 별개로, 조건이 맞는 밤에 낮은 확률로 이벤트가 "그냥" 일어난다.
   결정론이 핵심: 시간 슬롯×이벤트 해시 주사위 — 시청 화면이 몇 개든 같은 슬롯은
   같은 결론에 수렴한다(시청자 수가 발생 확률에 영향을 주면 안 된다).
   예약이 항상 우선. 조건·쿨다운 재검증은 예약과 동일 규칙. */

const NATURAL_SLOT_MS = 60 * 60 * 1000; // 1시간 주사위
/** 적격 시간당 발생 확률 — 희귀도별. 쿨다운이 상한을 이중으로 지킨다. */
const NATURAL_P: Record<string, number> = { legendary: 0.02, rare: 0.035, uncommon: 0.05 };

/** FNV-1a 해시 → [0,1) — 슬롯·이벤트별 결정론 주사위 */
export function naturalRoll(eventId: string, slotStart: number): number {
  const s = `${eventId}:${slotStart}`;
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return (h >>> 0) / 0x100000000;
}

/**
 * 자연 발생 판정 — 이번 시간 슬롯의 주사위가 통과하고 조건·쿨다운이 맞으면 개시.
 * 같은 슬롯 재호출은 schedule의 nat-<id>-<slot> 기록으로 멱등(이미 기록됨 → 무시).
 */
export function resolveNatural(
  schedule: EventReservation[], ctx: DirectorContext,
): { schedule: EventReservation[]; activated: ActiveInstance | null; changed: boolean } {
  const slotStart = Math.floor(ctx.now / NATURAL_SLOT_MS) * NATURAL_SLOT_MS;
  for (const def of WORLD_EVENT_REGISTRY) {
    const natId = `nat-${def.id}-${slotStart}`;
    if (schedule.some((r) => r.id === natId)) continue;              // 이 슬롯은 이미 결론남
    const p = NATURAL_P[def.rarity] ?? 0;
    if (naturalRoll(def.id, slotStart) >= p) continue;               // 주사위 불통과
    if (!eligible(def.id, ctx.phase, ctx.weather)) continue;          // 조건 미충족 — 기록 없이 넘어감(다음 슬롯에 다시)
    const last = lastFiredAt(schedule, def.id);
    if (last !== null && ctx.now - last < def.cooldownSeconds * 1000) continue;
    const activated: ActiveInstance = {
      eventId: def.id,
      eventInstanceId: `res-${natId}`,                               // 결정론 — 동시 폴링 수렴
      startedAt: ctx.now,
      endsAt: ctx.now + def.durationSeconds * 1000,
      sequence: ctx.sequence,
    };
    const record: EventReservation = {
      id: natId, eventId: def.id,
      fireAt: new Date(slotStart + 9 * 3600 * 1000).toISOString().replace('Z', '+09:00'),
      fireAtMs: slotStart,
      requestedAt: slotStart,
      requestedBy: 'world',                                          // 자연 발생 — 사람이 아니라 세계가
      status: 'fired', resolvedAt: ctx.now, skipReason: null,
      instance: activated,
    };
    return { schedule: [record, ...schedule.map((r) => ({ ...r }))], activated, changed: true };
  }
  return { schedule, activated: null, changed: false };
}

export const worldEventConfig = {
  SCHEDULE_KEY, ACTIVE_KEY, SCHEDULE_KEEP, FIRE_GRACE_MS, MAX_AHEAD_MS, NATURAL_SLOT_MS, NATURAL_P,
};

export { WORLD_EVENT_REGISTRY, getWorldEventById };
