import test from 'node:test';
import assert from 'node:assert/strict';
import { foldedDayDecision } from './sketch-daily.ts';
import { buildImagePrompt, NIGHTLY_POSE_VARIANTS, type MemoryEvent } from './_daily-sketch.ts';
import { terminalResult, missionFor, kstDateStr } from '../../workers/sketch-scheduler/index.mjs';

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

// ⚠ 실사고 2026-07-31: 심야 재시도 크론이 date 없이 부르면 「새 하루를 접어버린다」.
// missionFor가 그 안전핀이다 — 본진(14:30 UTC)만 date 생략, 심야는 반드시 전날 명시.
test('스케줄러 임무: 본진은 오늘, 심야 재시도는 전날을 명시한다', () => {
  // 2026-07-31 14:30 UTC = 23:30 KST 본진
  const main = missionFor(Date.UTC(2026, 6, 31, 14, 30));
  assert.equal(main.kind, 'main');
  assert.equal(main.dateParam, '');
  // 2026-07-31 15:40 UTC = 08-01 00:40 KST → 전날(07-31) 재시도
  const retry1 = missionFor(Date.UTC(2026, 6, 31, 15, 40));
  assert.equal(retry1.kind, 'retry');
  assert.equal(retry1.dateParam, '?date=2026-07-31');
  // 2026-07-31 16:40 UTC = 08-01 01:40 KST → 역시 전날(07-31)
  const retry2 = missionFor(Date.UTC(2026, 6, 31, 16, 40));
  assert.equal(retry2.dateParam, '?date=2026-07-31');
  // 음성: 심야 재시도가 새 날짜(08-01)를 접겠다고 나서면 안 된다
  assert.notEqual(retry1.dateParam, '?date=2026-08-01');
  assert.equal(kstDateStr(Date.UTC(2026, 6, 31, 15, 0)), '2026-08-01'); // 참고: KST로는 이미 새 날
});
