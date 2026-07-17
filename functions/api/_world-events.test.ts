// BUILD 423-EVENTS — World Director 로직 테스트 (node --experimental-strip-types --test)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseFireAtKst, validateReservationInput, resolveDue,
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

test('조건 미충족(낮/비) → skipped(conditions), 세계 불변', () => {
  for (const ctx of [
    { now: NOW, phase: 'day', weather: 'clear', sequence: 1 },
    { now: NOW, phase: 'night', weather: 'rain', sequence: 1 },
  ]) {
    const { schedule, activated } = resolveDue([res({})], ctx);
    assert.equal(activated, null);
    assert.equal(schedule[0].status, 'skipped');
    assert.equal(schedule[0].skipReason, 'conditions');
  }
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

test('cancelled/fired 상태는 재평가하지 않는다', () => {
  const { changed } = resolveDue(
    [res({ status: 'cancelled' }), res({ id: 'r9', status: 'skipped', skipReason: 'expired' })],
    { now: NOW, phase: 'night', weather: 'clear', sequence: 1 },
  );
  assert.equal(changed, false);
});
