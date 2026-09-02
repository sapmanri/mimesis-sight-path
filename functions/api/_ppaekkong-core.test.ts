import test from 'node:test';
import assert from 'node:assert/strict';
import { PPAEKKONG_CORE, ppaekkongCoreState } from './_ppaekkong-core.ts';

test('빼콩 Core는 한 존재·비대칭 관찰·증거 경계를 고정한다', () => {
  const state = ppaekkongCoreState();
  assert.equal(state.being, PPAEKKONG_CORE);
  assert.equal(state.authority, 'mimesis-sight-path');
  assert.equal(state.being.direction.observesByeoli, true);
  assert.equal(state.being.direction.byeoliObservesPpaekkong, false);
  assert.match(state.being.evidenceContract.boundary, /observe/);
});
