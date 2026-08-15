import test from 'node:test';
import assert from 'node:assert/strict';
import {
  LIVENESS_GUARD_MS, alarmTriggerKind, planDirectorWake,
} from './schedule.mjs';

const NOW = Date.parse('2026-08-15T00:00:00Z');

test('별이가 다음 확인을 고르면 그 한 번만 예약하고 생존 알람은 겹치지 않는다', () => {
  const chosen = NOW + 73 * 60_000;
  const got = planDirectorWake({
    now: NOW, triggerKind: 'curiosity', editorialNext: chosen,
    continuationPending: false, continuationDelayMs: null,
    existingSelfWakeAt: null, existingLivenessWakeAt: null,
  });
  assert.deepEqual(got, { selfWakeAt: chosen, livenessWakeAt: null, nextLookAt: chosen });
  assert.equal(alarmTriggerKind({ ...got, continuationPending: false }), 'curiosity');
});

test('다음 확인을 고르지 않으면 게시 강제 없는 12시간 생존 알람만 둔다', () => {
  const got = planDirectorWake({
    now: NOW, triggerKind: 'curiosity', editorialNext: null,
    continuationPending: false, continuationDelayMs: null,
    existingSelfWakeAt: null, existingLivenessWakeAt: null,
  });
  assert.equal(got.selfWakeAt, null);
  assert.equal(got.livenessWakeAt, NOW + LIVENESS_GUARD_MS);
  assert.equal(got.nextLookAt, NOW + LIVENESS_GUARD_MS);
  assert.equal(alarmTriggerKind({ ...got, continuationPending: false }), 'liveness_guard');
});

test('방송·관찰 사건은 별이가 고른 다음 확인을 덮어쓰지 않는다', () => {
  const chosen = NOW + 4 * 60 * 60_000;
  const guard = NOW + 8 * 60 * 60_000;
  const got = planDirectorWake({
    now: NOW, triggerKind: 'observation_arrived', editorialNext: null,
    continuationPending: false, continuationDelayMs: null,
    existingSelfWakeAt: chosen, existingLivenessWakeAt: guard,
  });
  assert.equal(got.selfWakeAt, chosen);
  assert.equal(got.livenessWakeAt, guard);
  assert.equal(got.nextLookAt, chosen);
});

test('댓글 백로그 이어달리기는 편집·생존 알람보다 먼저 실행된다', () => {
  const got = planDirectorWake({
    now: NOW, triggerKind: 'backlog_continue', editorialNext: null,
    continuationPending: true, continuationDelayMs: 25_000,
    existingSelfWakeAt: NOW + 60 * 60_000, existingLivenessWakeAt: null,
  });
  assert.equal(got.nextLookAt, NOW + 25_000);
  assert.equal(alarmTriggerKind({ ...got, continuationPending: true }), 'backlog_continue');
});
