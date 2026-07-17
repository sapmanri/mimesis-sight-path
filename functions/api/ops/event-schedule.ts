// BUILD 423-EVENTS — /api/ops/event-schedule (Ops 호스트 전용 · Access 뒤)
// 정본: docs/BUILD_423_EVENTS_WORLD_DIRECTOR.md
//
// 콘솔 read-only 원칙의 "명시적 예외" — 예약은 발동이 아니라 의도 기록이다(§5-2).
// 실제 수행은 /api/world-event/active 의 lazy 런타임이 조건 재검증 후 결정한다.
// 감사 하드룰: 누가·언제·무엇을 — Access 인증 이메일을 requestedBy로 기록한다.
// 루트 미들웨어가 비-ops 호스트의 /api/ops/*를 404로 숨긴다(§7-2).

import {
  loadSchedule, saveSchedule, parseFireAtKst, validateReservationInput,
  WORLD_EVENT_REGISTRY,
  type WorldEventEnv, type EventReservation,
} from '../_world-events';

const JSON_HEADERS = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' };

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

function registryMeta() {
  return WORLD_EVENT_REGISTRY.map((e) => ({
    id: e.id, label: e.label, rarity: e.rarity,
    cooldownSeconds: e.cooldownSeconds, durationSeconds: e.durationSeconds,
    eligibleTime: e.eligibleTime ?? null, eligibleWeather: e.eligibleWeather ?? null,
  }));
}

export const onRequestGet: PagesFunction<WorldEventEnv> = async ({ env }) => {
  const schedule = await loadSchedule(env);
  return json(200, { ok: true, generatedAt: Date.now(), events: registryMeta(), schedule });
};

interface PostBody {
  action?: 'create' | 'cancel';
  eventId?: string;
  /** KST ISO(+09:00) */
  fireAt?: string;
  id?: string;
}

export const onRequestPost: PagesFunction<WorldEventEnv> = async ({ request, env }) => {
  const now = Date.now();
  const requestedBy = request.headers.get('cf-access-authenticated-user-email') ?? 'unknown';
  let body: PostBody;
  try { body = (await request.json()) as PostBody; } catch { return json(400, { ok: false, error: 'bad_json' }); }

  const schedule = await loadSchedule(env);

  if (body.action === 'create') {
    const eventId = String(body.eventId ?? '');
    const fireAtMs = parseFireAtKst(String(body.fireAt ?? ''));
    const invalid = validateReservationInput(eventId, fireAtMs, now);
    if (invalid) return json(400, { ok: false, error: invalid });
    const rec: EventReservation = {
      id: `${now.toString(36)}${Math.random().toString(36).slice(2, 6)}`,
      eventId,
      fireAt: String(body.fireAt),
      fireAtMs: fireAtMs as number,
      requestedAt: now,
      requestedBy,
      status: 'pending',
      resolvedAt: null,
      skipReason: null,
      instance: null,
    };
    await saveSchedule(env, [rec, ...schedule]);
    return json(200, { ok: true, created: rec });
  }

  if (body.action === 'cancel') {
    const target = schedule.find((r) => r.id === body.id);
    if (!target) return json(404, { ok: false, error: 'not_found' });
    if (target.status !== 'pending') return json(409, { ok: false, error: 'not_pending' });
    target.status = 'cancelled';
    target.resolvedAt = now;
    await saveSchedule(env, schedule);
    return json(200, { ok: true, cancelled: target.id });
  }

  return json(400, { ok: false, error: 'unknown_action' });
};
