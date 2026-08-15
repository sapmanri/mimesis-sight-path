import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeRadioNow } from './_now-state.ts';

test('an active programme stays current through its duration and short delivery grace', () => {
  const startedAt = 1_000_000;
  assert.equal(normalizeRadioNow({
    kind: 'story', startedAt, updatedAt: startedAt, dur: 60, isReplay: true,
  }, startedAt + 90_000)?.available, true);
  assert.equal(normalizeRadioNow({
    kind: 'story', startedAt, updatedAt: startedAt, dur: 60, isReplay: true,
  }, startedAt + 106_000), null);
});

test('a bed marker may bridge the normal replay gap but not a powered-off Mac', () => {
  const updatedAt = 2_000_000;
  assert.equal(normalizeRadioNow({ kind: 'bed', updatedAt }, updatedAt + 5 * 60_000)?.available, true);
  assert.equal(normalizeRadioNow({ kind: 'bed', updatedAt }, updatedAt + 7 * 60_000), null);
});

test('a malformed timeless marker is never presented as live', () => {
  assert.equal(normalizeRadioNow({ kind: 'story', title: 'old' }, 9_000_000), null);
});
