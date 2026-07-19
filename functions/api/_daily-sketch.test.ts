// BUILD 431 — Daily Sketch · ImageProvider · 시험 경로 테스트
// 이 단계의 계약은 "잘 그린다"가 아니라 **"운영으로 새지 않는다"**이다. 그 경계를 테스트한다.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  selectMoment, densityOf, buildMemoryEvent, buildSketchPrompt,
  SKETCH_RULES, SKETCH_RULES_EN, SKETCH_POSITIVE, buildImagePrompt, subjectClause, type ArchiveEntry,
} from './_daily-sketch.ts';
import {
  selectProvider, trialKey, TRIAL_R2_PREFIX, manualProvider, workersAiProvider,
} from './_image-provider.ts';
import { validateTrialInput, hashPrompt, supportsReference } from './ops/sketch-trial.ts';
import { isTrialKey } from './ops/sketch-image.ts';
import { groupByPrompt } from './ops/sketch-board.ts';

const DATE = '9100-04-10';
let t = 1_700_000_000_000;

function e(over: Partial<ArchiveEntry> = {}): ArchiveEntry {
  t += 60_000;
  return {
    observer: 'byeoli', kind: 'act', line: '화분 앞에 오래 머물렀다.',
    targetId: 'pot-1', targetType: 'thing', targetLabel: '화분',
    duration: 2, mood: 'observe', createdAt: t, date: DATE, eventId: null, ...over,
  };
}

/* ── 기억 선택 ── */

test('가장 오래 머문 순간을 고른다', () => {
  const m = selectMoment([e({ duration: 1 }), e({ duration: 9, targetLabel: '벤치' }), e({ duration: 2 })], DATE);
  assert.equal(m?.targetLabel, '벤치');
});

test('월드 이벤트는 머문 시간과 별개로 하루를 대표한다', () => {
  const m = selectMoment([e({ duration: 9, targetLabel: '벤치' }), e({ kind: 'world', duration: 0, targetLabel: null, line: '산이 걸어갔다.' })], DATE);
  assert.match(m!.line, /산이 걸어갔다/);
});

test('별이가 보는 것(Selection)이 선택에 반영된다', () => {
  const a = e({ duration: 3, targetLabel: '벽', line: '벽이 거기 있었다.' });
  const b = e({ duration: 3, targetLabel: '의자', line: '햇빛이 의자 다리에만 걸려 있었다.' });
  assert.equal(selectMoment([a, b], DATE, ['light'])?.targetLabel, '의자');
});

test('다른 날 기억은 섞이지 않는다', () => {
  assert.equal(selectMoment([e({ date: '9100-04-09' })], DATE), null);
});

test('관찰자(빼콩)의 기록은 별이의 하루가 아니다', () => {
  assert.equal(selectMoment([e({ observer: 'ppae' })], DATE), null);
});

test('결정론 — 같은 하루는 같은 순간', () => {
  const day = [e({ duration: 4 }), e({ duration: 7, targetLabel: '꽃' }), e({ duration: 1 })];
  assert.equal(selectMoment(day, DATE)?.targetLabel, selectMoment(day, DATE)?.targetLabel);
});

/* ── 하루의 밀도 ── */

test('밀도: 조용한 날 / 보통 / 사건 있는 날', () => {
  assert.equal(densityOf([e()], DATE), 'quiet');
  assert.equal(densityOf(Array.from({ length: 7 }, () => e()), DATE), 'normal');
  assert.equal(densityOf([e(), e({ kind: 'rare' })], DATE), 'full');
});

/* ── 하나의 기억 → 세 갈래 ── */

test('MemoryEvent는 그 순간 앞뒤의 관찰을 한 덩어리로 묶는다', () => {
  const m = buildMemoryEvent([e({ line: '화분 앞에 머물렀다.' }), e({ line: '빼콩이가 흙을 밟았다.', duration: 8 })], DATE);
  assert.ok(m);
  assert.equal(m!.lines.length, 2);
  assert.deepEqual([m!.diaryText, m!.selectedPhoto, m!.sketchDiary], [null, null, null]); // 세 갈래는 아직 비어 있다
});

test('빈 하루는 기억을 만들지 않는다', () => {
  assert.equal(buildMemoryEvent([], DATE), null);
});

/* ── 프롬프트 파생 ── */

test('프롬프트는 규칙에서 파생된다 — 손으로 쓴 그림체가 아니다', () => {
  const m = buildMemoryEvent([e({ duration: 5 })], DATE)!;
  const p = buildSketchPrompt(m, null);
  for (const rule of SKETCH_RULES) assert.ok(p.includes(rule), `규칙 누락: ${rule}`);
  assert.match(p, /정확히 복제하지 않는다/);
  assert.match(p, /화분/);
});

test('밀도가 대상 수를 정한다 (조용한 날엔 하나만)', () => {
  const quiet = buildSketchPrompt(buildMemoryEvent([e()], DATE)!, null);
  assert.match(quiet, /대상 수: 1개 이내/);
  const full = buildSketchPrompt(buildMemoryEvent([e(), e({ kind: 'world', duration: 9 })], DATE)!, null);
  assert.match(full, /대상 수: 3개 이내/);
});

/* ── 운영으로 새지 않는가 (이 단계의 핵심 계약) ── */

test('시험 산출물은 운영 captures/ 와 섞이지 않는다', () => {
  const k = trialKey('9100-04-10-abcd1234', '@cf/black-forest-labs/flux-1-schnell', 0);
  assert.ok(k.startsWith(TRIAL_R2_PREFIX));
  assert.ok(!k.startsWith('captures/'));
  assert.ok(!/[^a-z0-9._/-]/i.test(k), '키에 위험 문자가 있다');
});

test('AI 바인딩이 없으면 조용히 죽지 않고 manual로 내려간다', () => {
  assert.equal(selectProvider('workers-ai', {}).id, 'manual');
  assert.equal(selectProvider('workers-ai', { AI: { run: async () => null } }).id, 'workers-ai');
  assert.equal(workersAiProvider.available({}), false);
  assert.equal(manualProvider.available({}), true);
});

test('manual provider는 이미지를 만들지 않는다 (프롬프트만)', async () => {
  const art = await manualProvider.generate({}, {
    plan: { memory: buildMemoryEvent([e()], DATE)!, prompt: 'p', referenceKeys: [] },
    model: 'manual', params: {},
  });
  assert.ok(!('error' in art));
  assert.equal((art as { bytes: unknown }).bytes, null);
});

test('실수로 운영처럼 쓰이지 않게 confirm을 요구한다', () => {
  const memory = buildMemoryEvent([e()], DATE)!;
  assert.equal(validateTrialInput({ memory, models: ['m'] }).ok, false);
  const r = validateTrialInput({ confirm: 'trial', memory, models: ['m'], count: 1 });
  assert.equal(r.ok, true);
});

test('사용량 한도 존중 — 한 번에 많이 못 만든다', () => {
  const memory = buildMemoryEvent([e()], DATE)!;
  const r = validateTrialInput({ confirm: 'trial', memory, models: ['a', 'b'], count: 5 });
  assert.equal(r.ok, false);
  assert.match((r as { error: string }).error, /too_many/);
});

test('빈 기억으로는 시험할 수 없다', () => {
  assert.equal(validateTrialInput({ confirm: 'trial', memory: { lines: [] }, models: ['m'] }).ok, false);
});

test('density가 어긋나면 프롬프트 조립 전에 막는다 (500 대신 400)', () => {
  const memory = { ...buildMemoryEvent([e()], DATE)!, density: 'huge' as never };
  const r = validateTrialInput({ confirm: 'trial', memory, models: ['m'], count: 1 });
  assert.equal(r.ok, false);
  assert.match((r as { error: string }).error, /bad_density/);
});

test('참조를 못 받는 모델은 후보가 아니라 대조군이다', () => {
  assert.equal(supportsReference('@cf/black-forest-labs/flux-2-dev'), true);
  assert.equal(supportsReference('@cf/black-forest-labs/flux-1-schnell'), false);
  assert.equal(supportsReference('@cf/unknown/model'), false, '모르는 모델은 지원 안 함으로 본다');
});

test('이미지 라우트는 sketch-trials/ 밖을 읽지 않는다', () => {
  assert.equal(isTrialKey('sketch-trials/2026-07-19-abcd/flux-0.png'), true);
  assert.equal(isTrialKey('captures/walk/1.jpg'), false, '운영 캡처를 읽으면 안 된다');
  assert.equal(isTrialKey('sketch-trials/../captures/walk/1.jpg'), false, '경로 탈출');
  assert.equal(isTrialKey('sketch-trials//x.png'), false);
  assert.equal(isTrialKey(null), false);
});

test('스타일 보드는 같은 프롬프트끼리만 묶는다', () => {
  const r = (promptHash: string, role: 'candidate' | 'control') =>
    ({ promptHash, role, model: 'm', r2Key: null } as never);
  const g = groupByPrompt([r('aaa', 'control'), r('bbb', 'candidate'), r('aaa', 'candidate')]);
  assert.equal(g.size, 2);
  assert.equal(g.get('aaa')!.length, 2);
});

test('스타일 비교는 프롬프트가 같아야 성립한다 — 해시가 그걸 보증', () => {
  assert.equal(hashPrompt('같은 프롬프트'), hashPrompt('같은 프롬프트'));
  assert.notEqual(hashPrompt('같은 프롬프트'), hashPrompt('다른 프롬프트'));
});

/* ── 1차 실패 회귀: 한국어 프롬프트가 모델에 나가면 안 된다 ── */

test('모델 프롬프트는 영어다 (한국어를 주면 글자가 그려진다)', () => {
  const m = buildMemoryEvent([e({ duration: 5 })], DATE)!;
  const p = buildImagePrompt(m, null, 'a small potted plant on a step');
  assert.ok(!/[가-힣]/.test(p), '한글이 남아 있다:\n' + p);
  assert.match(p, /a small potted plant on a step/);
});

test('영어 규칙표는 한국어 원본과 1:1로 대응한다', () => {
  assert.equal(SKETCH_RULES_EN.length, SKETCH_RULES.length);
});

test('부정문을 쓰지 않는다 — no/not 은 확산 모델에서 역효과 (2차 실패: 서명이 그려짐)', () => {
  const m = buildMemoryEvent([e()], DATE)!;
  const p = buildImagePrompt(m, null, 'a pot', ['flower pot']);
  // Avoid 줄만이 아니라 **프롬프트 전체**에 부정어가 없어야 한다 (규칙표 포함)
  for (const neg of [/\bno\b/, /\bnot\b/, /\bwithout\b/, /\bavoid\b/i, /\bnever\b/]) {
    assert.ok(!neg.test(p), `부정문이 남아 있다: ${neg}\n${p}`);
  }
  assert.ok(p.includes('an unmarked sketchbook page'), '원하는 상태를 긍정으로 서술해야 한다');
});

test('사진이 아니라 그림을 말한다 (2차 실패: 공책을 찍은 사진이 나옴)', () => {
  const m = buildMemoryEvent([e()], DATE)!;
  const p = buildImagePrompt(m, null, 'a pot');
  assert.match(p, /^A simple hand-drawn sketch/);
  assert.ok(p.includes('flat scan, top-down, the drawing fills the frame'));
  assert.ok(!/A page from/.test(p), "'page from a diary'는 사진을 유도한다");
});

test('숫자가 density보다 명확하다 — 대상을 세어서 못박는다', () => {
  assert.equal(subjectClause(['girl', 'cat', 'flower pot'], 3),
    'Subjects: one girl, one cat, one flower pot. Only these three subjects, nothing else.');
  assert.match(subjectClause(['girl', 'cat', 'flower pot'], 2), /Only these two subjects/);
  assert.match(subjectClause([], 1), /Exactly one subject, nothing else\./);
  // 단수 문법 — "Only these one subjects" 같은 문장이 모델에 나가면 안 된다
  assert.equal(subjectClause(['flower pot'], 1), 'Subjects: one flower pot. Only this one subject, nothing else.');
});

test('장면 번역이 없어도 프롬프트는 만들어진다 (번역 실패가 시험을 막지 않게)', () => {
  const m = buildMemoryEvent([e()], DATE)!;
  const p = buildImagePrompt(m, null, null);
  assert.ok(!/[가-힣]/.test(p));
  assert.match(p, /Scene: /);
});
