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

import { slotOf, receiptKey, readSlotReceipt, writeSlotReceipt, hasSuccessfulRun } from './_publish-log.ts';

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

test('별이가 침묵을 고른 슬롯은 누락이 아니라 완수다', () => {
  const slot = '2026-07-26T22:00:00+09:00';
  const skipped: PublishLogRecord = { ...rec(slot), result: 'editorial_skip', threads: { attempted: false, ok: false, errorCode: null, requestId: null } };
  assert.equal(hasSuccessfulRun([skipped], slot), true);
  const now = kstSlotUtc(2026, 7, 26, 22) + 30 * 60 * 1000;
  const log = [rec('2026-07-26T08:00:00+09:00'), rec('2026-07-26T18:00:00+09:00'), skipped];
  assert.deepEqual(computeMissedSlots(log, now), []);
});

/* ── 명시적 scheduledFor 검증 (홈즈 판정 2026-07-26) ── */

import { validateSlotIso, RECONCILE_WINDOW_MS } from './_publish-log.ts';

test('명시 슬롯 — 허용 슬롯·과거·보충 기간 안일 때만 통과', () => {
  const s18 = kstSlotUtc(2026, 7, 26, 18);
  const now = s18 + 50 * 60 * 1000;   // 18:50 — ±40분 밖이라 slotOf로는 못 잡는 시각
  assert.equal(slotOf(now), null, '전제: 이 시각은 레거시 휴리스틱으로 잡히지 않는다');
  assert.equal(validateSlotIso('2026-07-26T18:00:00+09:00', now), '2026-07-26T18:00:00+09:00',
    '18:50의 보충이 18:00 슬롯을 채울 수 있어야 한다');
  assert.equal(validateSlotIso('2026-07-26T08:00:00+09:00', now), '2026-07-26T08:00:00+09:00', '같은 날 지난 슬롯도 보충 대상');
});

test('명시 슬롯 음성 — 미래·비허용 시각·기간 밖·쓰레기는 전부 거부', () => {
  const s18 = kstSlotUtc(2026, 7, 26, 18);
  const now = s18 + 10 * 60 * 1000;
  assert.equal(validateSlotIso('2026-07-26T22:00:00+09:00', now), null, '미래 슬롯 금지');
  assert.equal(validateSlotIso('2026-07-26T15:00:00+09:00', now), null, '허용 시각(8/18/22)이 아니면 거부');
  assert.equal(validateSlotIso('2026-07-26T18:00:00+00:00', now), null, '표기가 다르면 거부 — 문자열이 곧 계약');
  assert.equal(validateSlotIso('아무거나', now), null);
  assert.equal(validateSlotIso('', now), null);
  // 보충 허용 기간 밖
  const late = s18 + RECONCILE_WINDOW_MS + 60 * 1000;
  assert.equal(validateSlotIso('2026-07-26T18:00:00+09:00', late), null, '너무 오래된 슬롯은 되살리지 않는다');
});

test('스케줄러 Worker와 Pages가 같은 슬롯 문자열을 만든다 (계약 일치)', async () => {
  const w = await import('../../workers/publish-scheduler/index.mjs');
  const s22 = kstSlotUtc(2026, 7, 26, 22);
  // Worker가 만든 표기를 Pages가 그대로 받아들여야 한다 — 어긋나면 보충이 통째로 죽는다
  const iso = w.kstIso(s22);
  assert.equal(iso, '2026-07-26T22:00:00+09:00');
  assert.equal(validateSlotIso(iso, s22 + 5 * 60 * 1000), iso);
  // recentSlots: 22:05에는 [22:00, 18:00] 순
  const got = w.recentSlots(s22 + 5 * 60 * 1000, 2).map(w.kstIso);
  assert.deepEqual(got, ['2026-07-26T22:00:00+09:00', '2026-07-26T18:00:00+09:00']);
  // 08:05에는 전날 22:00으로 넘어간다 (날짜 경계)
  const s8 = kstSlotUtc(2026, 7, 26, 8);
  const got2 = w.recentSlots(s8 + 5 * 60 * 1000, 2).map(w.kstIso);
  assert.deepEqual(got2, ['2026-07-26T08:00:00+09:00', '2026-07-25T22:00:00+09:00']);
});

test('보충의 두 번째 증인 — 영수증 부재를 곧바로 누락으로 읽지 않는다 (실사고 07-26 08:05)', () => {
  const slot = '2026-07-25T22:00:00+09:00';
  // 장부가 없던 시절의 슬롯: 영수증은 없지만 발행 로그에는 성공이 남아 있다
  const log = [rec(slot)];
  assert.equal(hasSuccessfulRun(log, slot), true, '발행 로그가 두 번째 증인이 되어야 한다');
  // 실패 기록만 있으면 여전히 보충 대상
  const failed: PublishLogRecord[] = [{ ...rec(slot), result: 'threads_failed', threads: { attempted: true, ok: false, errorCode: 'x', requestId: null } }];
  assert.equal(hasSuccessfulRun(failed, slot), false);
  // 다른 슬롯의 성공은 이 슬롯을 증명하지 않는다
  assert.equal(hasSuccessfulRun([rec('2026-07-26T08:00:00+09:00')], slot), false);
  assert.equal(hasSuccessfulRun([], slot), false, '아무 기록도 없으면 보충 대상이 맞다');
});
