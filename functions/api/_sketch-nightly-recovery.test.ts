import test from 'node:test';
import assert from 'node:assert/strict';
import {
  detectVisionMediaType, foldedDayDecision, hasRecordedRecommendation,
  recoIsHonestTerminal, recoNeedsJudge,
} from './sketch-daily.ts';
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

// ⚠ 실사고 2026-08-11 밤: 접힌 적 없는 전날을 재시도 크론 둘이 400 not_folded로 24번
// 두드리며 밤을 태웠다. 과거 하루는 새로 접지 않는 게 계약 — 이 응답은 재시도 불가 종결이다.
test('접힌 적 없는 날의 재시도는 not_folded에서 즉시 종결한다', () => {
  assert.equal(terminalResult(400, { ok: false, error: 'not_folded: 2026-08-11 — 재시도 전용' }), 'not_folded');
  // 음성: 다른 400(bad_date)·불명 5xx·비JSON은 여전히 재시도 대상이다
  assert.equal(terminalResult(400, { ok: false, error: 'bad_date' }), null);
  assert.equal(terminalResult(500, { error: 'not_folded: x' }), null);
  assert.equal(terminalResult(400, null), null);
});

// ⚠ 실사고 2026-08-11 밤(08-05 동일): 본진의 정직한 no_observations 영수증을 심야 재시도의
// 「스케줄러 소진」이 덮어써 아침 감시자가 상류 결함 대신 엉뚱한 실패를 보고했다.
test('소진 영수증은 정당한 종료 기록을 덮지 않는다', () => {
  assert.equal(recoIsHonestTerminal({ skipped: 'no_observations' }), true);
  assert.equal(recoIsHonestTerminal({ skipped: 'human_day' }), true);
  assert.equal(recoIsHonestTerminal({ skipped: 'ownership_unknown' }), true);
  const picked = { pick: 2, reasons: '둘째가 맞다', verdicts: ['1장: 불합격', '2장: 합격'] };
  const allRejected = { pick: null, reasons: '전부 불합격', verdicts: ['1장: 불합격'] };
  assert.equal(hasRecordedRecommendation(picked), true);
  assert.equal(hasRecordedRecommendation(allRejected), true);
  assert.equal(recoIsHonestTerminal({ status: 'done', picks: [1, 2, 3], reco: picked }), true);
  assert.equal(recoIsHonestTerminal({ picks: [1, 2, 3], reco: allRejected }), true);
  // 음성: 무기록·부분 진행·실패 기록은 소진 영수증이 덮어야 한다 (그게 최종 상태다)
  assert.equal(recoIsHonestTerminal(null), false);
  assert.equal(recoIsHonestTerminal({ status: 'partial', picks: [1] }), false);
  assert.equal(recoIsHonestTerminal({ status: 'done', picks: [1, 2, 3], reco: null }), false);
  assert.equal(recoIsHonestTerminal({ status: 'done', picks: [1, 2, 3], reco: {} }), false);
  assert.equal(recoIsHonestTerminal({ status: 'images_ready', picks: [1, 2, 3] }), false);
  assert.equal(recoIsHonestTerminal({ picks: [1, 2, 3] }), false);
  assert.equal(recoIsHonestTerminal({ status: 'failed', failed: true }), false);
  assert.equal(recoIsHonestTerminal({ skipped: '' }), false);
});

test('옛 3장·무판정 기록은 그림을 다시 만들지 않고 판정 단계만 재개한다', () => {
  assert.equal(recoNeedsJudge({ status: 'done', picks: [1, 2, 3], reco: null }), true);
  assert.equal(recoNeedsJudge({ status: 'images_ready', picks: [1, 2, 3] }), true);
  assert.equal(recoNeedsJudge({ status: 'partial', picks: [1, 2] }), false);
  assert.equal(recoNeedsJudge({ skipped: 'human_day', picks: [1, 2, 3] }), false);
  assert.equal(recoNeedsJudge({
    status: 'done', picks: [1, 2, 3],
    reco: { pick: 1, reasons: '합격', verdicts: ['1장: 합격'] },
  }), false);
});

test('vision MIME은 파일명이 아니라 실제 바이트 시그니처로 정한다', () => {
  const bytes = (...values: number[]) => Uint8Array.from(values).buffer;
  assert.equal(detectVisionMediaType(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)), 'image/png');
  assert.equal(detectVisionMediaType(bytes(0xff, 0xd8, 0xff, 0xe0)), 'image/jpeg');
  assert.equal(detectVisionMediaType(bytes(
    0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50,
  )), 'image/webp');
  assert.equal(detectVisionMediaType(bytes(0x47, 0x49, 0x46, 0x38, 0x39, 0x61)), 'image/gif');
  assert.equal(detectVisionMediaType(bytes(1, 2, 3, 4)), null);
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
