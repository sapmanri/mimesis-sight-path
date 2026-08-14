import test from 'node:test';
import assert from 'node:assert/strict';
import {
  appendPublishLog, computeMissedSlots, readSlotReceipt, validateSlotIso, writeSlotReceipt,
} from './_publish-log.ts';

function kvStub() {
  const store = new Map<string, string>();
  return {
    store,
    env: {
      PLANET: {
        get: async (key: string) => store.get(key) ?? null,
        put: async (key: string, value: string) => { store.set(key, value); },
      },
    } as never,
  };
}

const base = {
  invokedAt: Date.parse('2026-08-14T08:05:00+09:00'),
  result: 'success' as const,
  httpStatus: 200,
  textIndex: null,
  imageKey: 'captures/walk/a.jpg',
  threads: { attempted: true, ok: true, errorCode: null, requestId: 'thread-1' },
};

test('자유 게시 기록은 scheduledFor=null로 계속 남는다', async () => {
  const kv = kvStub();
  await appendPublishLog(kv.env, { ...base, scheduledFor: null });
  const log = JSON.parse(kv.store.get('publish_log') ?? '[]');
  assert.equal(log.length, 1);
  assert.equal(log[0].scheduledFor, null);
});

test('08/18/22 KST 예약 슬롯만 장부에 들어간다', async () => {
  const kv = kvStub();
  const slot = '2026-08-14T08:00:00+09:00';
  assert.equal(validateSlotIso(slot, base.invokedAt), slot);
  await appendPublishLog(kv.env, { ...base, scheduledFor: slot });
  const log = JSON.parse(kv.store.get('publish_log') ?? '[]');
  assert.equal(log[0].scheduledFor, slot);

  await assert.rejects(
    appendPublishLog(kv.env, { ...base, scheduledFor: '2026-08-14T09:00:00+09:00' }),
    /invalid_scheduled_slot/,
  );
});

test('성공 슬롯 영수증은 다시 읽혀 재발행을 막는다', async () => {
  const kv = kvStub();
  const receipt = { slot: '2026-08-14T08:00:00+09:00', at: base.invokedAt, textIndex: 3 };
  await writeSlotReceipt(kv.env, receipt);
  assert.deepEqual(await readSlotReceipt(kv.env, receipt.slot), receipt);
});

test('성공 없는 과거 슬롯만 누락으로 보인다', () => {
  const now = Date.parse('2026-08-14T18:20:00+09:00');
  const log = [{
    runId: 'x', ...base, invokedAt: Date.parse('2026-08-14T08:05:00+09:00'),
    scheduledFor: '2026-08-14T08:00:00+09:00',
  }];
  const missed = computeMissedSlots(log, now);
  assert.ok(missed.includes('2026-08-14T18:00:00+09:00'));
  assert.ok(missed.includes('2026-08-13T22:00:00+09:00'));
  assert.ok(!missed.includes('2026-08-14T08:00:00+09:00'), '성공한 아침 슬롯은 누락으로 세지 않는다');
});
