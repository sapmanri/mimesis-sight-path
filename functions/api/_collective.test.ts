// BUILD 422-OPS-E — Collective 로직 테스트 (node --experimental-strip-types --test)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  validateSnapshot, applySnapshot, kAnonView, emptyAgg, K_ANON,
  type CollectiveSnapshot, type SourceRecord,
} from './_collective.ts';

function snap(over: Partial<CollectiveSnapshot> = {}): CollectiveSnapshot {
  return {
    schemaVersion: 1, sourceRevision: 1,
    totals: { diary: 10, memories: 20, observedMs: 60000, pass: 5 },
    targets: { crow: { observe: 3, rest: 0, record: 1, wonder: 2 } },
    ...over,
  };
}

test('validateSnapshot: 형식·상한·키 화이트리스트', () => {
  assert.equal(validateSnapshot(null), null);
  assert.equal(validateSnapshot({ schemaVersion: 2, sourceRevision: 1 }), null);
  assert.equal(validateSnapshot({ schemaVersion: 1, sourceRevision: -1 }), null);
  const v = validateSnapshot({
    schemaVersion: 1, sourceRevision: 3,
    totals: { diary: 1.9, memories: -5, observedMs: 1e18 },
    targets: { 'crow': { observe: 2 }, 'BAD KEY!': { observe: 9 } },
  });
  assert.ok(v);
  assert.equal(v.totals.diary, 1);            // 내림
  assert.equal(v.totals.memories, 0);         // 음수 → 0
  assert.equal(v.totals.observedMs, 10_000_000_000); // 상한
  assert.ok(v.targets.crow);
  assert.equal(Object.keys(v.targets).length, 1); // 불량 키 제거
});

test('첫 snapshot: 참여자·기여자·합산', () => {
  const { agg, applied } = applySnapshot(emptyAgg(), null, snap(), 1000);
  assert.equal(applied, true);
  assert.equal(agg.participants, 1);
  assert.equal(agg.totals.diary, 10);
  assert.equal(agg.targets.crow.observe, 3);
  assert.equal(agg.targets.crow.contributors, 1);
});

test('같은 revision 재전송 = 멱등 (까마귀가 늘지 않는다)', () => {
  const first = applySnapshot(emptyAgg(), null, snap(), 1000);
  const again = applySnapshot(first.agg, first.src, snap(), 2000);
  assert.equal(again.applied, false);
  assert.deepEqual(again.agg, first.agg);
});

test('revision 증가 시 delta만 더한다 + 감소는 0 클램프', () => {
  const first = applySnapshot(emptyAgg(), null, snap(), 1000);
  const next = snap({
    sourceRevision: 2,
    totals: { diary: 12, memories: 15 /* 감소 */, observedMs: 90000, pass: 5 },
    targets: { crow: { observe: 5, rest: 0, record: 1, wonder: 2 } },
  });
  const second = applySnapshot(first.agg, first.src, next, 2000);
  assert.equal(second.applied, true);
  assert.equal(second.agg.totals.diary, 12);      // 10 + (12-10)
  assert.equal(second.agg.totals.memories, 20);   // 감소분 무시
  assert.equal(second.agg.targets.crow.observe, 5); // 3 + (5-3)
  assert.equal(second.agg.targets.crow.contributors, 1); // 기여자는 한 번만
  assert.equal(second.agg.participants, 1);
});

test('새 대상에 처음 기여할 때만 contributors 증가', () => {
  const first = applySnapshot(emptyAgg(), null, snap(), 1000);
  const withBench = snap({
    sourceRevision: 2,
    targets: { crow: { observe: 3, rest: 0, record: 1, wonder: 2 }, bench: { observe: 1, rest: 4, record: 0, wonder: 0 } },
  });
  const second = applySnapshot(first.agg, first.src, withBench, 2000);
  assert.equal(second.agg.targets.bench.contributors, 1);
  assert.equal(second.agg.targets.crow.contributors, 1);
});

test('k-익명: 참여자 5명 미만 → 전체 숨김, 항목별 기여자 5명 미만 → 항목 숨김', () => {
  let agg = emptyAgg();
  // 참여자 4명 → 숨김
  for (let i = 0; i < K_ANON - 1; i++) {
    agg = applySnapshot(agg, null, snap({ sourceRevision: 1 }), 1000).agg;
  }
  assert.equal(kAnonView(agg).hidden, true);
  // 5명째 → 공개, crow는 기여자 5명이라 노출
  agg = applySnapshot(agg, null, snap({ sourceRevision: 1 }), 1000).agg;
  const view = kAnonView(agg);
  assert.equal(view.hidden, false);
  assert.ok(view.targets?.crow);
  assert.equal(view.targets.crow.contributors, K_ANON);
  // 소수 기여 대상은 걸러진다
  const withRare = applySnapshot(agg, null, snap({
    sourceRevision: 1,
    targets: { crow: { observe: 1, rest: 0, record: 0, wonder: 0 }, lavender: { observe: 9, rest: 0, record: 0, wonder: 0 } },
  }), 1000).agg;
  const view2 = kAnonView(withRare);
  assert.ok(view2.targets?.crow);
  assert.equal(view2.targets?.lavender, undefined); // 기여자 1명 — 개인이 드러난다 → 숨김
});
