// 422-OPS-A 순수 로직 검증 — 실행: node --experimental-strip-types --test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeMissedSlots, type PublishLogRecord } from './_publish-log.ts';

// KST 슬롯을 UTC ms로
function kstSlotUtc(y: number, mo: number, d: number, h: number) {
  return Date.UTC(y, mo - 1, d, h, 0, 0) - 9 * 60 * 60 * 1000;
}
function rec(scheduledFor: string | null): PublishLogRecord {
  return { runId: 'x', scheduledFor, invokedAt: 0, result: 'success', httpStatus: 200, textIndex: 1, imageKey: null, threads: { attempted: true, ok: true, errorCode: null, requestId: null } };
}

test('세 슬롯 다 있으면 missed 없음', () => {
  const now = kstSlotUtc(2026, 7, 17, 22) + 30 * 60 * 1000; // 22:30 KST
  const log = [rec('2026-07-17T08:00:00+09:00'), rec('2026-07-17T18:00:00+09:00'), rec('2026-07-17T22:00:00+09:00')];
  assert.deepEqual(computeMissedSlots(log, now), []);
});

test('22:00 run이 없고 유예(10분) 지나면 missed', () => {
  const now = kstSlotUtc(2026, 7, 17, 22) + 15 * 60 * 1000; // 22:15 — 유예 경과
  const log = [rec('2026-07-17T08:00:00+09:00'), rec('2026-07-17T18:00:00+09:00')];
  const missed = computeMissedSlots(log, now);
  assert.ok(missed.includes('2026-07-17T22:00:00+09:00'), `got ${JSON.stringify(missed)}`);
});

test('예정 시각 직후(유예 전)는 missed로 단정하지 않는다', () => {
  const now = kstSlotUtc(2026, 7, 17, 22) + 3 * 60 * 1000; // 22:03 — 유예 안 지남
  const log = [rec('2026-07-17T08:00:00+09:00'), rec('2026-07-17T18:00:00+09:00')];
  const missed = computeMissedSlots(log, now);
  assert.ok(!missed.includes('2026-07-17T22:00:00+09:00'), '유예 전엔 판정 보류해야 함');
});

test('24시간 밖 슬롯은 missed로 잡지 않는다', () => {
  const now = kstSlotUtc(2026, 7, 18, 8) + 15 * 60 * 1000; // 다음날 08:15
  const log = [rec('2026-07-18T08:00:00+09:00')];
  const missed = computeMissedSlots(log, now);
  // 전날 08:00은 24h 넘어 제외, 전날 18:00/22:00은 24h 안이라 missed
  assert.ok(!missed.includes('2026-07-17T08:00:00+09:00'), '24h 밖 제외');
  assert.ok(missed.includes('2026-07-17T22:00:00+09:00'), '전날 22:00은 missed');
});
