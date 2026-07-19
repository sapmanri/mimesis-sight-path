// BUILD 423-EVENTS — World Director 로직 테스트 (node --experimental-strip-types --test)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseFireAtKst, validateReservationInput, resolveDue, resolveNatural, naturalRoll,
  worldEventConfig, type EventReservation,
} from './_world-events.ts';

const NOW = Date.parse('2026-07-18T22:00:00+09:00');

function res(over: Partial<EventReservation>): EventReservation {
  return {
    id: 'r1', eventId: 'meteor-shower',
    fireAt: '2026-07-18T22:00:00+09:00', fireAtMs: NOW,
    requestedAt: NOW - 3600_000, requestedBy: 'vase@test',
    status: 'pending', resolvedAt: null, skipReason: null, instance: null,
    ...over,
  };
}

test('parseFireAtKst: +09:00 고정 — 다른 표기는 거부', () => {
  assert.equal(parseFireAtKst('2026-07-18T22:00:00+09:00'), NOW);
  assert.equal(parseFireAtKst('2026-07-18T22:00+09:00'), NOW);
  assert.equal(parseFireAtKst('2026-07-18T22:00:00Z'), null);
  assert.equal(parseFireAtKst('2026-07-18T22:00:00'), null);
  assert.equal(parseFireAtKst('nonsense'), null);
});

test('validateReservationInput: 사전 검증', () => {
  assert.equal(validateReservationInput('no-such-event', NOW + 1000, NOW), 'unknown_event');
  assert.equal(validateReservationInput('ufo', null, NOW), 'bad_fire_at');
  assert.equal(validateReservationInput('ufo', NOW - 1, NOW), 'fire_at_past');
  assert.equal(validateReservationInput('ufo', NOW + worldEventConfig.MAX_AHEAD_MS + 1, NOW), 'fire_at_too_far');
  assert.equal(validateReservationInput('ufo', NOW + 1000, NOW), null);
});

test('미래 예약은 건드리지 않는다', () => {
  const { activated, changed } = resolveDue(
    [res({ fireAtMs: NOW + 60_000 })],
    { now: NOW, phase: 'night', weather: 'clear', sequence: 7 },
  );
  assert.equal(activated, null);
  assert.equal(changed, false);
});

test('만기 + 조건 충족 → fired, 결정론 인스턴스', () => {
  const { schedule, activated } = resolveDue(
    [res({})], { now: NOW, phase: 'night', weather: 'clear', sequence: 7 },
  );
  assert.ok(activated);
  assert.equal(activated.eventInstanceId, 'res-r1');
  assert.equal(activated.endsAt - activated.startedAt, 14_000); // meteor-shower duration 14s
  assert.equal(activated.sequence, 7);
  assert.equal(schedule[0].status, 'fired');
  assert.deepEqual(schedule[0].instance, activated);
});

test('조건 미충족(낮/비) → 유예 안에서는 pending 유지, 세계 불변', () => {
  for (const ctx of [
    { now: NOW, phase: 'day', weather: 'clear', sequence: 1 },
    { now: NOW, phase: 'night', weather: 'rain', sequence: 1 },
  ]) {
    const { schedule, activated, changed } = resolveDue([res({})], ctx);
    assert.equal(activated, null);
    assert.equal(schedule[0].status, 'pending');   // 판결이 아니라 '아직'
    assert.equal(schedule[0].skipReason, null);
    assert.equal(changed, false);                  // 쓸 것이 없다 = KV 쓰기 없음
  }
});

test('조건 미충족으로 대기하다 조건이 오면 개시된다 (60초 하루의 핵심)', () => {
  // 낮에 만기 → pending 유지 → 같은 예약이 밤 폴링에서 살아난다
  const day = resolveDue([res({})], { now: NOW, phase: 'day', weather: 'clear', sequence: 1 });
  assert.equal(day.schedule[0].status, 'pending');
  const night = resolveDue(day.schedule, { now: NOW + 30_000, phase: 'night', weather: 'clear', sequence: 2 });
  assert.ok(night.activated);
  assert.equal(night.activated.eventInstanceId, 'res-r1');
  assert.equal(night.schedule[0].status, 'fired');
});

test('유예를 넘기면 조건 대기도 끝난다 → expired', () => {
  const { schedule, activated } = resolveDue(
    [res({ fireAtMs: NOW - worldEventConfig.FIRE_GRACE_MS - 1 })],
    { now: NOW, phase: 'day', weather: 'clear', sequence: 1 },
  );
  assert.equal(activated, null);
  assert.equal(schedule[0].status, 'skipped');
  assert.equal(schedule[0].skipReason, 'expired');
});

test('알 수 없는 이벤트는 대기하지 않는다 → skipped(conditions)', () => {
  const { schedule } = resolveDue(
    [res({ eventId: 'no-such-event' })],
    { now: NOW, phase: 'night', weather: 'clear', sequence: 1 },
  );
  assert.equal(schedule[0].status, 'skipped');
  assert.equal(schedule[0].skipReason, 'conditions');
});

test('유예(15분) 경과 → skipped(expired) — 조건이 맞아도 늦은 발사는 없다', () => {
  const { schedule, activated } = resolveDue(
    [res({ fireAtMs: NOW - worldEventConfig.FIRE_GRACE_MS - 1 })],
    { now: NOW, phase: 'night', weather: 'clear', sequence: 1 },
  );
  assert.equal(activated, null);
  assert.equal(schedule[0].skipReason, 'expired');
});

test('쿨다운 안이면 skipped(cooldown)', () => {
  const fired = res({
    id: 'r0', status: 'fired',
    instance: { eventId: 'meteor-shower', eventInstanceId: 'res-r0', startedAt: NOW - 3600_000, endsAt: NOW - 3600_000 + 14_000, sequence: 1 },
  });
  const { schedule, activated } = resolveDue(
    [fired, res({ id: 'r2' })], // meteor cooldown 12h — 1h 전 발사됨
    { now: NOW, phase: 'night', weather: 'clear', sequence: 2 },
  );
  assert.equal(activated, null);
  const r2 = schedule.find((r) => r.id === 'r2');
  assert.equal(r2?.status, 'skipped');
  assert.equal(r2?.skipReason, 'cooldown');
});

test('같은 턴 만기 2건 → 개시는 1건, 나머지는 pending 유지', () => {
  const { schedule, activated } = resolveDue(
    [res({ id: 'a', eventId: 'meteor-shower' }), res({ id: 'b', eventId: 'ufo', fireAtMs: NOW - 1000 })],
    { now: NOW, phase: 'night', weather: 'clear', sequence: 3 },
  );
  assert.ok(activated);
  assert.equal(activated.eventInstanceId, 'res-b'); // 먼저 만기된 쪽
  assert.equal(schedule.find((r) => r.id === 'a')?.status, 'pending');
});

/* ── 426-C 자연 발생 ── */
const SLOT = worldEventConfig.NATURAL_SLOT_MS;
function findSlot(eventId: string, pass: boolean): number {
  const p = worldEventConfig.NATURAL_P.rare;
  for (let i = 0; i < 5000; i++) {
    const slot = i * SLOT;
    const hit = naturalRoll(eventId, slot) < p;
    if (hit === pass) return slot;
  }
  throw new Error('slot not found');
}

test('자연 발생: 주사위 통과 슬롯 + 조건 충족 → 개시, requestedBy=world', () => {
  const slot = findSlot('meteor-shower', true);
  const { schedule, activated } = resolveNatural([], { now: slot + 1000, phase: 'night', weather: 'clear', sequence: 5 });
  assert.ok(activated);
  assert.equal(activated.eventId, 'meteor-shower');
  assert.equal(activated.eventInstanceId, `res-nat-meteor-shower-${slot}`);
  assert.equal(schedule[0].requestedBy, 'world');
  assert.equal(schedule[0].status, 'fired');
});

test('자연 발생: 같은 슬롯 재호출 = 멱등 (기록으로 결론남)', () => {
  const slot = findSlot('meteor-shower', true);
  const first = resolveNatural([], { now: slot + 1000, phase: 'night', weather: 'clear', sequence: 5 });
  const again = resolveNatural(first.schedule, { now: slot + 5000, phase: 'night', weather: 'clear', sequence: 6 });
  // meteor는 기록됨 — 같은 슬롯에서 meteor 재발 없음 (다른 이벤트가 우연히 통과할 수는 있음)
  assert.ok(!again.activated || again.activated.eventId !== 'meteor-shower');
});

test('자연 발생: 주사위 불통과 슬롯 → 아무 일도 없다', () => {
  // 세 이벤트 모두 불통과인 슬롯을 찾는다
  let slot = -1;
  for (let i = 0; i < 5000; i++) {
    const s = i * SLOT;
    if (naturalRoll('meteor-shower', s) >= worldEventConfig.NATURAL_P.rare
      && naturalRoll('ufo', s) >= worldEventConfig.NATURAL_P.rare
      && naturalRoll('godzilla', s) >= worldEventConfig.NATURAL_P.legendary) { slot = s; break; }
  }
  assert.ok(slot >= 0);
  const { activated, changed } = resolveNatural([], { now: slot + 1000, phase: 'night', weather: 'clear', sequence: 1 });
  assert.equal(activated, null);
  assert.equal(changed, false);
});

test('자연 발생: 조건 미충족이면 기록 없이 통과 (낮의 운석우는 없다)', () => {
  const slot = findSlot('meteor-shower', true);
  const { schedule, activated } = resolveNatural([], { now: slot + 1000, phase: 'day', weather: 'clear', sequence: 1 });
  assert.ok(!activated || activated.eventId !== 'meteor-shower');
  assert.ok(!schedule.some((r) => r.id === `nat-meteor-shower-${slot}`));
});

test('자연 발생: 쿨다운 안이면 개시 없음', () => {
  const slot = findSlot('meteor-shower', true);
  const recentFire: EventReservation = res({
    id: 'r0', status: 'fired',
    instance: { eventId: 'meteor-shower', eventInstanceId: 'x', startedAt: slot - 3600_000, endsAt: slot - 3600_000 + 14000, sequence: 1 },
  });
  const { activated } = resolveNatural([recentFire], { now: slot + 1000, phase: 'night', weather: 'clear', sequence: 1 });
  assert.ok(!activated || activated.eventId !== 'meteor-shower'); // 12h 쿨다운 — 1h 전 발사
});

test('cancelled/fired 상태는 재평가하지 않는다', () => {
  const { changed } = resolveDue(
    [res({ status: 'cancelled' }), res({ id: 'r9', status: 'skipped', skipReason: 'expired' })],
    { now: NOW, phase: 'night', weather: 'clear', sequence: 1 },
  );
  assert.equal(changed, false);
});
