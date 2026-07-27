import test from 'node:test';
import assert from 'node:assert/strict';
import { foldedDayDecision } from './sketch-daily.ts';
import { buildImagePrompt, NIGHTLY_POSE_VARIANTS, type MemoryEvent } from './_daily-sketch.ts';
import { terminalResult } from '../../workers/sketch-scheduler/index.mjs';

test('nightly provenance 또는 선행 run 영수증이면 reco가 없어도 재개한다', () => {
  assert.equal(foldedDayDecision({ foldedBy: 'nightly-auto' }, false), 'resume');
  assert.equal(foldedDayDecision({}, true), 'resume');
});

test('사람이 접은 하루만 human_day이며 legacy는 ownership_unknown이다', () => {
  assert.equal(foldedDayDecision({ foldedBy: 'human' }, false), 'human_day');
  assert.equal(foldedDayDecision({}, false), 'ownership_unknown');
});

test('scheduler는 성공과 증명된 skip에서만 종료한다', () => {
  assert.equal(terminalResult(200, { done: true }), 'done');
  assert.equal(terminalResult(200, { skipped: 'human_day' }), 'human_day');
  assert.equal(terminalResult(200, { skipped: 'no_observations' }), 'no_observations');
  assert.equal(terminalResult(200, { skipped: 'ownership_unknown' }), null);
  assert.equal(terminalResult(500, { done: true }), null);
  assert.equal(terminalResult(200, { failed: true }), null);
  assert.equal(terminalResult(200, null), null);
});

test('야간 3장은 같은 기억을 서로 다른 능동 포즈로 그린다', () => {
  const memory: MemoryEvent = {
    date: '2026-07-26', momentAt: 0, targetLabel: '개구리',
    targetType: 'animal', lines: ['비 오면 나오는 개구리를 봤다.'], density: 'normal',
    diaryText: null, selectedPhoto: null, sketchDiary: null,
  };
  const prompts = NIGHTLY_POSE_VARIANTS.map((pose) =>
    buildImagePrompt(memory, null, 'A frog appears in the rain.', ['frog'], { characters: 2 }, pose));
  assert.equal(new Set(prompts).size, 3);
  assert.match(prompts[0], /Deep squat/);
  assert.match(prompts[1], /asymmetrical step/);
  assert.match(prompts[2], /kneels or squats/);
  for (const prompt of prompts) {
    assert.match(prompt, /Use the sheets as a pose vocabulary/);
    assert.match(prompt, /Girl's action:/);
  }
});
