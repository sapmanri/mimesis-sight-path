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

/* ── 슬롯 멱등 영수증 (홈즈 처방 ③, 2026-07-26) ── */

import { slotOf, receiptKey, readSlotReceipt, writeSlotReceipt } from './_publish-log.ts';

/** KV 스텁 — put/get만. expirationTtl이 실제로 넘어오는지도 본다. */
function kvStub() {
  const store = new Map<string, string>();
  const ttls: number[] = [];
  return {
    store, ttls,
    env: {
      PLANET: {
        get: async (k: string) => store.get(k) ?? null,
        put: async (k: string, v: string, o?: { expirationTtl?: number }) => {
          store.set(k, v);
          if (o?.expirationTtl) ttls.push(o.expirationTtl);
        },
      },
    } as never,
  };
}

test('슬롯 판정 — 정시 ±40분만 슬롯이고, 그 밖은 null(수동 호출은 멱등 대상 아님)', () => {
  const at8 = kstSlotUtc(2026, 7, 26, 8);
  assert.equal(slotOf(at8), '2026-07-26T08:00:00+09:00');
  assert.equal(slotOf(at8 + 30 * 60 * 1000), '2026-07-26T08:00:00+09:00', '08:30 재시도도 같은 슬롯');
  assert.equal(slotOf(at8 + 45 * 60 * 1000), null, '±40분 밖은 슬롯 없음 — 기존 동작 유지');
  assert.equal(slotOf(kstSlotUtc(2026, 7, 26, 13)), null, '비정시 호출');
  // 워치독(threads-watchdog.sh SLOTS="8 18 22")과 같은 세 슬롯인지
  assert.equal(slotOf(kstSlotUtc(2026, 7, 26, 18)), '2026-07-26T18:00:00+09:00');
  assert.equal(slotOf(kstSlotUtc(2026, 7, 26, 22)), '2026-07-26T22:00:00+09:00');
});

test('영수증 — 쓰면 읽히고, TTL이 붙고, 키가 슬롯별로 갈린다', async () => {
  const kv = kvStub();
  const slot = '2026-07-26T08:00:00+09:00';
  assert.equal(await readSlotReceipt(kv.env, slot), null, '처음엔 없다');
  await writeSlotReceipt(kv.env, { slot, at: 123, textIndex: 7 });
  const got = await readSlotReceipt(kv.env, slot);
  assert.equal(got?.textIndex, 7);
  assert.equal(got?.slot, slot);
  assert.ok(kv.ttls.length === 1 && kv.ttls[0] > 0, '영수증은 TTL과 함께 저장된다 (영구 누적 금지)');
  assert.equal(await readSlotReceipt(kv.env, '2026-07-26T18:00:00+09:00'), null, '다른 슬롯은 독립');
  assert.equal(receiptKey(slot), `publish_receipt:${slot}`);
});

test('깨진 영수증은 없는 것으로 읽는다 (음성 — 멱등이 발행을 영영 막으면 안 된다)', async () => {
  const kv = kvStub();
  const slot = '2026-07-26T22:00:00+09:00';
  kv.store.set(receiptKey(slot), '{깨진 JSON');
  assert.equal(await readSlotReceipt(kv.env, slot), null);
});

test('누락 판정의 정본은 로그 존재가 아니라 성공 (홈즈 판정 2026-07-26)', () => {
  const now = kstSlotUtc(2026, 7, 26, 22) + 30 * 60 * 1000;
  const failed = (slot: string): PublishLogRecord => ({ ...rec(slot), result: 'threads_failed', threads: { attempted: true, ok: false, errorCode: 'x', requestId: null } });
  // 세 슬롯 모두 레코드가 있지만 22시는 실패 → 여전히 보충 대상이어야 한다
  const log = [rec('2026-07-26T08:00:00+09:00'), rec('2026-07-26T18:00:00+09:00'), failed('2026-07-26T22:00:00+09:00')];
  assert.deepEqual(computeMissedSlots(log, now), ['2026-07-26T22:00:00+09:00']);
  // 성공 레코드로 바뀌면 누락 아님
  const ok = [rec('2026-07-26T08:00:00+09:00'), rec('2026-07-26T18:00:00+09:00'), rec('2026-07-26T22:00:00+09:00')];
  assert.deepEqual(computeMissedSlots(ok, now), []);
  // slot_duplicate도 '발행됨'이 아니다 — 그 슬롯의 성공은 별도 레코드가 증명해야 한다
  const dup: PublishLogRecord = { ...rec('2026-07-26T22:00:00+09:00'), result: 'slot_duplicate' };
  assert.deepEqual(computeMissedSlots([rec('2026-07-26T08:00:00+09:00'), rec('2026-07-26T18:00:00+09:00'), dup], now), ['2026-07-26T22:00:00+09:00']);
});
