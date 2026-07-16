/**
 * 커밋 순서 계약 검증 — docs/BUILD_419A_OBSERVER_RECOVERY.md §4·§6.
 * 실행: node --test observer-registry/tests/  (node 24 type stripping)
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decideCommit, decidePrepare, decideRestore } from '../src/logic.ts';
import type { ObserverMeta } from '../src/types.ts';

const KEY_A = 'a'.repeat(64);
const KEY_B = 'b'.repeat(64);
const NOW = 1_784_000_000_000;

function prep(meta: ObserverMeta | null, over: Record<string, unknown> = {}, token = 'tok-1') {
  return decidePrepare(
    meta,
    { keyHash: KEY_A, baseRevision: 0, schemaVersion: 1, ...over } as never,
    NOW,
    token,
  );
}

test('신규 등록: prepare는 예약만 하고 currentRevision을 전진시키지 않는다', () => {
  const d = prep(null);
  assert.equal(d.ok, true);
  if (!d.ok) return;
  assert.equal(d.value.nextRevision, 1);
  assert.equal(d.value.previousRevision, 0);
  assert.equal(d.meta.currentRevision, 0); // 핵심: 커밋 전엔 0 유지
  assert.equal(d.meta.pending?.revision, 1);
});

test('commit이 currentRevision을 전진시키고 pending을 비운다', () => {
  const p = prep(null);
  assert.equal(p.ok, true);
  if (!p.ok) return;
  const c = decideCommit(p.meta, { keyHash: KEY_A, revision: 1, token: 'tok-1' }, NOW + 5);
  assert.equal(c.ok, true);
  if (!c.ok) return;
  assert.equal(c.value.revision, 1);
  assert.equal(c.value.previousRevision, 0);
  assert.equal(c.meta.currentRevision, 1);
  assert.equal(c.meta.pending, null);
  assert.equal(c.meta.serverSavedAt, NOW + 5);
});

test('미등록 관찰자에 baseRevision>0 백업 → observer_not_found', () => {
  const d = prep(null, { baseRevision: 3 });
  assert.deepEqual(d, { ok: false, code: 'observer_not_found' });
});

test('선점된 id에 타 키 등록 시도(base 0) → observer_taken', () => {
  const p = prep(null);
  if (!p.ok) return assert.fail();
  const d = prep(p.meta, { keyHash: KEY_B, baseRevision: 0 });
  assert.deepEqual(d, { ok: false, code: 'observer_taken' });
});

test('타 키로 기존 revision 백업 → observer_key_mismatch', () => {
  const p = prep(null);
  if (!p.ok) return assert.fail();
  const d = prep(p.meta, { keyHash: KEY_B, baseRevision: 1 });
  assert.deepEqual(d, { ok: false, code: 'observer_key_mismatch' });
});

function committedMeta(revision: number): ObserverMeta {
  let meta: ObserverMeta | null = null;
  for (let r = 0; r < revision; r++) {
    const p = prep(meta, { baseRevision: r }, `t${r}`);
    if (!p.ok) throw new Error('prep failed');
    const c = decideCommit(p.meta, { keyHash: KEY_A, revision: r + 1, token: `t${r}` }, NOW + r);
    if (!c.ok) throw new Error('commit failed');
    meta = c.meta;
  }
  return meta!;
}

test('baseRevision 불일치 → 409 backup_conflict + 현재 revision 반환 (무조건 덮어쓰기 금지)', () => {
  const meta = committedMeta(5);
  const d = prep(meta, { baseRevision: 3 });
  assert.deepEqual(d, { ok: false, code: 'backup_conflict', revision: 5 });
});

test('force: confirmedRevision === current → 통과', () => {
  const meta = committedMeta(5);
  const d = prep(meta, { baseRevision: 3, force: true, confirmedRevision: 5 });
  assert.equal(d.ok, true);
  if (!d.ok) return;
  assert.equal(d.value.nextRevision, 6);
});

test('force: 확인 모달이 열린 사이 또 갱신 → confirmedRevision 불일치 → 재409', () => {
  const meta = committedMeta(6); // 확인 시점엔 5였는데 그새 6이 됨
  const d = prep(meta, { baseRevision: 3, force: true, confirmedRevision: 5 });
  assert.deepEqual(d, { ok: false, code: 'backup_conflict', revision: 6 });
});

test('동시 백업 레이스: 나중 prepare가 예약을 대체 → 앞선 commit은 token 불일치로 거부', () => {
  const meta = committedMeta(2);
  const pA = prep(meta, { baseRevision: 2 }, 'token-A');
  assert.equal(pA.ok, true);
  if (!pA.ok) return;
  // 기기 B가 같은 baseRevision으로 prepare — A의 예약을 대체
  const pB = prep(pA.meta, { baseRevision: 2 }, 'token-B');
  assert.equal(pB.ok, true);
  if (!pB.ok) return;
  // A의 commit → 거부 (A가 쓴 KV blob은 고아 — 무해)
  const cA = decideCommit(pB.meta, { keyHash: KEY_A, revision: 3, token: 'token-A' }, NOW);
  assert.deepEqual(cA, { ok: false, code: 'backup_conflict', revision: 2 });
  // B의 commit → 성공, revision은 한 번만 전진
  const cB = decideCommit(pB.meta, { keyHash: KEY_A, revision: 3, token: 'token-B' }, NOW);
  assert.equal(cB.ok, true);
  if (!cB.ok) return;
  assert.equal(cB.meta.currentRevision, 3);
});

test('예약 없는 commit / 완료된 commit 재시도 → backup_conflict', () => {
  const meta = committedMeta(3);
  const d = decideCommit(meta, { keyHash: KEY_A, revision: 3, token: 't2' }, NOW);
  assert.deepEqual(d, { ok: false, code: 'backup_conflict', revision: 3 });
});

test('restore: 정상 경로 — revision·schemaVersion 반환, 메타 불변', () => {
  const meta = committedMeta(4);
  const d = decideRestore(meta, { keyHash: KEY_A });
  assert.equal(d.ok, true);
  if (!d.ok) return;
  assert.equal(d.value.revision, 4);
  assert.equal(d.value.schemaVersion, 1);
});

test('restore: 키 불일치 → observer_key_mismatch (남은 시도 수 등 부가정보 없음)', () => {
  const meta = committedMeta(2);
  const d = decideRestore(meta, { keyHash: KEY_B });
  assert.deepEqual(d, { ok: false, code: 'observer_key_mismatch' });
});

test('restore: 미등록 → observer_not_found', () => {
  assert.deepEqual(decideRestore(null, { keyHash: KEY_A }), {
    ok: false,
    code: 'observer_not_found',
  });
});

test('restore: 등록만 되고 커밋된 blob 없음(revision 0) → observer_not_found', () => {
  const p = prep(null); // 등록+예약만, 커밋 없음
  if (!p.ok) return assert.fail();
  const d = decideRestore(p.meta, { keyHash: KEY_A });
  assert.deepEqual(d, { ok: false, code: 'observer_not_found' });
});
