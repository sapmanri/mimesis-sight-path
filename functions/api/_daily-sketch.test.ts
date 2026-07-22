// BUILD 431 — Daily Sketch · ImageProvider · 시험 경로 테스트
// 이 단계의 계약은 "잘 그린다"가 아니라 **"운영으로 새지 않는다"**이다. 그 경계를 테스트한다.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  selectMoment, densityOf, buildMemoryEvent, buildSketchPrompt,
  SKETCH_RULES, SKETCH_RULES_EN, SKETCH_POSITIVE, CHARACTER_IDENTITY_CHECKS,
  CHARACTER_SHEET, CHARACTER_SHEET_EN, STYLE_SHEET_EN, doodleFor, glossaryLine,
  buildImagePrompt, subjectClause, pinnedSubjectClause, type ArchiveEntry,
} from './_daily-sketch.ts';
import {
  selectProvider, trialKey, TRIAL_R2_PREFIX, manualProvider, workersAiProvider,
} from './_image-provider.ts';
import { validateTrialInput, hashPrompt, supportsReference, translateSubjects, orderCharacterRefs } from './ops/sketch-trial.ts';
import { isTrialKey } from './ops/sketch-image.ts';
import { groupByPrompt } from './ops/sketch-board.ts';
import { referenceKeyFor } from './ops/sketch-reference.ts';
import {
  capturesToEntries, buildDayMemory, attachBranch, validateDayMemory, kstDate, memoryEventId,
} from './_memory-event.ts';

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
  assert.ok(p.includes('drawn on unmarked pale graph paper'), '원하는 상태를 긍정으로 서술해야 한다');
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
    'The whole drawing contains exactly 1 girl, 1 cat, 1 flower pot. These three are everything on the page.');
  assert.match(subjectClause(['girl', 'cat', 'flower pot'], 2), /These two are everything/);
  assert.match(subjectClause([], 1), /Exactly one subject, nothing else\./);
  // 단수 처리 — "These one are everything" 같은 문장이 모델에 나가면 안 된다
  assert.equal(subjectClause(['flower pot'], 1),
    'The whole drawing contains exactly 1 flower pot. Just this single subject fills the page.');
});

/* ── 9차 회귀: 숫자 없는 캐릭터가 복제·혼성됐다 ── */

test('9차 — 캐릭터 수는 항상 못박고, density 예산은 소품에만 적용된다', () => {
  // 소품 없음 → 캐릭터만
  assert.equal(pinnedSubjectClause([], 2),
    'The whole drawing contains exactly 1 girl, 1 small white cat. Nothing else on the page.');
  // 칩이 "1 girl"꼴 이중 숫자·캐릭터 중복이어도 흡수된다 (실사용: 1 girl 칩이 "1 1 girl"로 나가던 것)
  assert.equal(pinnedSubjectClause(['1 girl', 'white cat', '1 utility pole'], 2),
    'The whole drawing contains exactly 1 girl, 1 small white cat, 1 utility pole. Nothing else on the page.');
  // 예산은 소품만 자른다 — 캐릭터는 예산 밖 (칩 2개에 별이 몸통이 사라진 실사고 회귀)
  const p = pinnedSubjectClause(['pole', 'broom', 'web'], 2);
  assert.ok(p.includes('1 girl') && p.includes('1 pole') && p.includes('1 broom'));
  assert.ok(!p.includes('web'), '소품 예산 초과분은 잘려야 한다');
});

test('buildImagePrompt에도 캐릭터 수가 박힌다', () => {
  const m = buildMemoryEvent([e()], DATE)!;
  const p = buildImagePrompt(m, null, 'a pot');
  assert.match(p, /exactly 1 girl, 1 small white cat/);
});

test('steps는 1~20 정수만 — 시험 한 번을 날리기 전에 잡는다', () => {
  const base = { confirm: 'trial', models: ['m'], useMemory: '9100-04-10' };
  assert.equal(validateTrialInput({ ...base, steps: 0 }).ok, false);
  assert.equal(validateTrialInput({ ...base, steps: 4.5 }).ok, false);
  const twelve = validateTrialInput({ ...base, steps: 12 });
  assert.ok(twelve.ok && twelve.value.steps === 12);
  const dflt = validateTrialInput(base);
  assert.ok(dflt.ok && dflt.value.steps === 4, '생략하면 기본 4');
});

test('Workers AI 경계는 전면 영어 — 한글 소품은 번역 불가 시 흘리지 않고 뺀다', async () => {
  // 영어만 → 그대로, 조용히
  const en = await translateSubjects({}, ['utility pole', 'broom']);
  assert.deepEqual(en.subjects, ['utility pole', 'broom']);
  assert.equal(en.notes.length, 0);
  // 키 없음 + 한글 → 모델에 흘리는 대신 빼고, 뺀 사실을 남긴다 (조용한 삭제 금지)
  const ko = await translateSubjects({}, ['utility pole', '빗자루']);
  assert.deepEqual(ko.subjects, ['utility pole']);
  assert.equal(ko.notes.length, 1);
  assert.match(ko.notes[0], /빗자루/);
});

/* ── 포즈 시트 시대 — 캐릭터 2장 지칭·정렬 ── */

test('캐릭터 참조 2장이면 별이=image 0, 빼콩이=image 1로 지칭·정렬된다', () => {
  // 정렬: 업로드·목록 순서와 무관하게 이름으로
  assert.deepEqual(
    orderCharacterRefs([
      'sketch-trials/reference/ppaekong_poses.png',
      'sketch-trials/reference/byeoli_poses.png',
    ]),
    ['sketch-trials/reference/byeoli_poses.png', 'sketch-trials/reference/ppaekong_poses.png'],
  );
  // 프롬프트: 각자 지칭 + 포즈 선택 지시 (참조가 자세까지 베끼던 문제의 해독제)
  const m = buildMemoryEvent([e()], DATE)!;
  const p2 = buildImagePrompt(m, null, 'a pot', [], { characters: 2, styles: 0 });
  assert.match(p2, /image 0 is the girl/);
  assert.match(p2, /image 1 is the white cat/);
  assert.match(p2, /do not copy any single panel/);
  // 1장이어도 시트일 수 있다 — 포즈 선택 지시가 들어간다
  const p1 = buildImagePrompt(m, null, 'a pot', [], { characters: 1, styles: 0 });
  assert.match(p1, /choose the pose that fits the scene/);
});

test('장면 번역이 없어도 프롬프트는 만들어진다 (번역 실패가 시험을 막지 않게)', () => {
  const m = buildMemoryEvent([e()], DATE)!;
  const p = buildImagePrompt(m, null, null);
  assert.ok(!/[가-힣]/.test(p));
  assert.match(p, /Scene: /);
});

/* ── 3차 실패 회귀: 물건 이름이 스프링 공책을 그리게 했다 ── */

test('공책이라는 물건이 아니라 종이 표면을 말한다', () => {
  const m = buildMemoryEvent([e()], DATE)!;
  const p = buildImagePrompt(m, null, 'a pot', ['flower pot']);
  for (const obj of ['sketchbook', 'notebook', 'spiral', 'binding']) {
    assert.ok(!p.toLowerCase().includes(obj), `물건 이름이 남아 있다: ${obj}`);
  }
  assert.ok(p.includes('graph paper'), '표면은 말해야 한다');
});

test('기준 그림 키는 슬러그와 확장자만 허용한다', () => {
  assert.equal(referenceKeyFor('byeoli', 'image/png'), 'sketch-trials/reference/byeoli.png');
  assert.equal(referenceKeyFor('ppaekong', 'image/jpeg'), 'sketch-trials/reference/ppaekong.jpg');
  assert.equal(referenceKeyFor('../evil', 'image/png'), null, '경로 조작');
  assert.equal(referenceKeyFor('Byeoli', 'image/png'), null, '대문자 시작 금지');
  assert.equal(referenceKeyFor('byeoli', 'text/html'), null, '이미지가 아닌 타입');
});

test('Character Identity는 세부 항목으로 쪼개져 있다', () => {
  assert.equal(CHARACTER_IDENTITY_CHECKS.length, 9);
  assert.ok(CHARACTER_IDENTITY_CHECKS.includes('빼콩'));
  assert.ok(CHARACTER_IDENTITY_CHECKS.includes('같은 아이처럼 보이는가'));
});

test('참조가 있을 때만 image 0을 지칭한다 (Character Identity의 핵심 한 줄)', () => {
  const m = buildMemoryEvent([e()], DATE)!;
  assert.ok(!buildImagePrompt(m, null, 'a pot', ['flower pot'], 0).includes('image 0'));
  const withRef = buildImagePrompt(m, null, 'a pot', ['flower pot'], 1);
  // 포즈 시트 시대 문구 — 외형은 고정하되 자세는 장면에 맞게 고른다
  assert.match(withRef, /Image 0 is a character reference for the same girl and the same cat/);
  assert.match(withRef, /same hair shape, same face, same body proportions, same clothes/);
});

/* ── 5차 관찰: 참조가 스타일까지 먹는다 → 캐릭터/스타일 분리 ── */

test('캐릭터 참조와 스타일 참조를 다른 인덱스로 지칭한다', () => {
  const m = buildMemoryEvent([e()], DATE)!;
  const p = buildImagePrompt(m, null, 'a pot', ['flower pot'], { characters: 1, styles: 1 });
  assert.match(p, /Image 0 is a character reference/);
  assert.match(p, /drawing style of image 1/);
});

test('스타일 참조가 없어도 그림체는 문장으로 계속 밀어 넣는다', () => {
  const m = buildMemoryEvent([e()], DATE)!;
  const p = buildImagePrompt(m, null, 'a pot', [], { characters: 1, styles: 0 });
  assert.match(p, /Drawing style: grid paper, blue ink, loose doodle/);
});

test('캐릭터 시트는 참조와 무관하게 항상 들어간다 (볼터치 없음 · 올화이트 빼콩)', () => {
  const m = buildMemoryEvent([e()], DATE)!;
  for (const refs of [0, { characters: 1, styles: 1 }] as const) {
    const p = buildImagePrompt(m, null, 'a pot', [], refs);
    assert.match(p, /cheeks are plain bare skin/);
    assert.match(p, /cat is entirely white/);
  }
  assert.equal(CHARACTER_SHEET.length, CHARACTER_SHEET_EN.length);
  assert.equal(STYLE_SHEET_EN.length, 5);
});

test('낙서는 그림일기의 언어 — 오늘 본 것에 따라 기호가 달라진다', () => {
  const mk = (line: string, label: string) => ({ ...buildMemoryEvent([e({ line, targetLabel: label })], DATE)! });
  assert.match(doodleFor(mk('비가 오래 내렸다.', '창문')), /rain ticks/);
  assert.match(doodleFor(mk('달이 낮게 떴다.', '달')), /small stars/);
  assert.match(doodleFor(mk('책을 오래 봤다.', '책')), /short straight lines/);
  assert.match(doodleFor(mk('화분 앞에 머물렀다.', '화분')), /tiny stars/);
  assert.equal(doodleFor(mk('그냥 걸었다.', '길')), 'three small dots');
});

test('낙서 문구가 프롬프트에 실린다', () => {
  const m = buildMemoryEvent([e()], DATE)!;
  assert.match(buildImagePrompt(m, null, 'a pot', [], 0), /Around the subjects add /);
});

test('스타일 참조가 여러 장이면 범위로 지칭하고 섞으라고 말한다', () => {
  const m = buildMemoryEvent([e()], DATE)!;
  const one = buildImagePrompt(m, null, 'a pot', [], { characters: 1, styles: 1 });
  assert.match(one, /Follow the drawing style of image 1 —/);
  const many = buildImagePrompt(m, null, 'a pot', [], { characters: 1, styles: 3 });
  assert.match(many, /Blend the drawing style of images 1–3 into one consistent hand/);
  // 한 장만 가리키면 그 그림을 베낀다 — 여러 장일 때 단일 지칭이 남으면 안 된다
  assert.ok(!/Follow the drawing style of image 1 —/.test(many));
});

test('고유명사 사전 — 빼콩이는 강아지가 아니다 (6차 사고)', () => {
  const g = glossaryLine();
  assert.match(g, /"빼콩이" = the white cat/);
  assert.match(g, /"별이" = the girl/);
  assert.ok(!/puppy|dog/i.test(g));
});

/* ── 431-M: 별이의 하루가 서버에 선다 ── */

test('capture_meta → ArchiveEntry (관찰 줄이 그날의 조각이 된다)', () => {
  const cap = [
    { capturedAt: Date.parse('2026-07-20T01:00:00Z'), targetLabel: '라벤더', targetType: 'plant',
      byeoliAction: 'observe', diaryLines: ['라벤더가 한쪽으로 기울어 있었다.', '바람은 없었다.'], r2Key: 'captures/a.jpg' },
    { capturedAt: Date.parse('2026-07-19T01:00:00Z'), diaryLines: ['어제 것'] },   // 다른 날
    { capturedAt: Date.parse('2026-07-20T02:00:00Z'), diaryLines: [] },            // 빈 관찰
  ];
  const entries = capturesToEntries(cap, '2026-07-20');
  assert.equal(entries.length, 2, '오늘·비어있지 않은 것만');
  assert.equal(entries[0].observer, 'byeoli');
  assert.equal(entries[0].duration, 2, '대표 줄에만 대리 duration');
  assert.equal(entries[1].duration, null);
});

test('하루를 세운다 — 같은 순간의 사진이 함께 잡힌다', () => {
  const at = Date.parse('2026-07-20T01:00:00Z');
  const cap = [{ capturedAt: at, targetLabel: '라벤더', diaryLines: ['라벤더가 기울어 있었다.'], r2Key: 'captures/a.jpg' }];
  const day = buildDayMemory(cap, '2026-07-20');
  assert.ok(day);
  assert.equal(day!.event.targetLabel, '라벤더');
  assert.equal(day!.photoKey, 'captures/a.jpg', '글·그림과 같은 순간을 가리켜야 한다');
  assert.equal(day!.momentCount, 1);
});

test('관찰이 없으면 하루도 없다 — 빈 기억을 지어내지 않는다', () => {
  assert.equal(buildDayMemory([], '2026-07-20'), null);
  assert.equal(buildDayMemory([{ capturedAt: Date.now(), diaryLines: [] }], kstDate(Date.now())), null);
});

test('세 갈래는 같은 기억에 붙는다 (다른 사건을 만들면 실패)', () => {
  const at = Date.parse('2026-07-20T01:00:00Z');
  const day = buildDayMemory([{ capturedAt: at, targetLabel: '라벤더', diaryLines: ['기울어 있었다.'] }], '2026-07-20')!;
  const withText = attachBranch(day, 'diaryText', '오늘은 라벤더가 한쪽으로만 기울어 있었다.');
  const withBoth = attachBranch(withText, 'sketchDiary', 'sketch-trials/x.png');
  assert.equal(withBoth.event.diaryText, '오늘은 라벤더가 한쪽으로만 기울어 있었다.');
  assert.equal(withBoth.event.sketchDiary, 'sketch-trials/x.png');
  assert.equal(withBoth.event.momentAt, day.event.momentAt, '같은 순간이어야 한다');
});

test('깨진 하루는 저장하지 않는다', () => {
  assert.ok(validateDayMemory({}).length);
  assert.ok(validateDayMemory({ date: '2026-7-20' }).length);
  const at = Date.parse('2026-07-20T01:00:00Z');
  const ok = buildDayMemory([{ capturedAt: at, diaryLines: ['x가 있었다.'] }], '2026-07-20')!;
  assert.deepEqual(validateDayMemory(ok), []);
});

test('KST 경계 — UTC 오후는 다음날 KST다', () => {
  assert.equal(kstDate(Date.parse('2026-07-19T15:30:00Z')), '2026-07-20');
  assert.equal(kstDate(Date.parse('2026-07-19T14:00:00Z')), '2026-07-19');
});

test('사건 id — 같은 날의 다른 사건이 뒤섞이지 않는다', () => {
  const at = Date.parse('2026-07-20T14:23:10Z');
  assert.equal(memoryEventId(at, '화분'), '2026-07-20T14:23:10Z:화분');
  assert.equal(memoryEventId(at, null), '2026-07-20T14:23:10Z:moment');
  assert.equal(memoryEventId(at, 'Flower Pot!!'), '2026-07-20T14:23:10Z:flower-pot');
  // 같은 날 다른 순간 → 다른 id
  assert.notEqual(memoryEventId(at, '화분'), memoryEventId(at + 60_000, '화분'));
});

test('사건이 어느 관찰에서 파생됐는지 추적된다', () => {
  const at = Date.parse('2026-07-20T01:00:00Z');
  const day = buildDayMemory([
    { captureId: 'cap-1', capturedAt: at, targetLabel: '라벤더', diaryLines: ['기울어 있었다.'] },
    { captureId: 'cap-2', capturedAt: at + 60_000, diaryLines: ['바람은 없었다.'] },
    { captureId: 'cap-far', capturedAt: at + 40 * 60_000, diaryLines: ['한참 뒤 다른 일.'] },
  ], '2026-07-20')!;
  assert.match(day.memoryEventId, /^2026-07-20T/);
  assert.ok(day.sourceCaptureIds.includes('cap-1'));
  assert.ok(!day.sourceCaptureIds.includes('cap-far'), '사건 창 밖은 출처가 아니다');
});

test('사건 id 없는 기억은 저장하지 않는다', () => {
  const at = Date.parse('2026-07-20T01:00:00Z');
  const ok = buildDayMemory([{ captureId: 'c', capturedAt: at, diaryLines: ['x가 있었다.'] }], '2026-07-20')!;
  assert.deepEqual(validateDayMemory(ok), []);
  assert.ok(validateDayMemory({ ...ok, memoryEventId: 'flowerpot' }).length, '형식 위반');
  assert.ok(validateDayMemory({ ...ok, sourceCaptureIds: 'x' as never }).length);
});

/* ── 431-A: 채택 → 기억 부착 ── */

test('attach 검증 — 시험 산출물만 기억이 될 수 있다', async () => {
  const { validateAttachInput } = await import('./ops/memory.ts');
  // 형식 오류·운영 경로·경로 조작은 서버 저장까지 가지 않는다
  for (const bad of [
    { date: '21-07-2026', sketch: 'sketch-trials/a/b.png' },   // 날짜 자릿수 (존재하지 않는 달은 어차피 no_memory 404)
    { date: '2026-07-21', sketch: 'captures/walk/x.jpg' },     // 운영 captures — 기억은 시험 산출물만
    { date: '2026-07-21', sketch: 'sketch-trials/../captures/x.png' }, // 경로 조작
    { date: '2026-07-21' },                                     // sketch 없음
  ]) {
    assert.equal(validateAttachInput(bad as Record<string, unknown>).ok, false);
  }
  const ok = validateAttachInput({ date: '2026-07-21', sketch: 'sketch-trials/t/img.png' });
  assert.ok(ok.ok && ok.sketch === 'sketch-trials/t/img.png');
});

test('발행물 역추적 — 이 순간을 쓴 발행의 글만, 없으면 null', async () => {
  const { matchPublishedText } = await import('./ops/memory.ts');
  const runs = [
    { imageKey: 'captures/walk/111.jpg', invokedAt: 1000_000, threads: { ok: true } },
    { imageKey: 'captures/walk/222.jpg', invokedAt: 2000_000, threads: { ok: false } }, // 발행 실패는 글이 아니다
  ];
  const feed = [
    { text: '까마귀들이 줄지어 앉았다.', t: 1000_500 },
    { text: '다른 날의 글', t: 9000_000 },
  ];
  assert.equal(matchPublishedText(runs, feed, 'captures/walk/111.jpg'), '까마귀들이 줄지어 앉았다.');
  assert.equal(matchPublishedText(runs, feed, 'captures/walk/222.jpg'), null, 'threads 실패 발행은 제외');
  assert.equal(matchPublishedText(runs, feed, 'captures/walk/999.jpg'), null, '안 쓰인 순간은 null');
  assert.equal(matchPublishedText(runs, feed, null), null);
});

test('그림 발행 — 하루 1장, 실패는 재시도 가능', async () => {
  const { alreadyPublished } = await import('./_sketch-pub.ts');
  const log = [
    { date: '2026-07-21', ok: true },
    { date: '2026-07-20', ok: false },  // 실패 기록은 상한을 소모하지 않는다
  ];
  assert.equal(alreadyPublished(log, '2026-07-21'), true, '성공한 날은 재발행 불가');
  assert.equal(alreadyPublished(log, '2026-07-20'), false, '실패한 날은 재시도 가능');
  assert.equal(alreadyPublished(log, '2026-07-22'), false);
  assert.equal(alreadyPublished([], '2026-07-21'), false);
});

test('일일 자동 seed — 날짜 결정론 (같은 날 같은 3장, 조건 ④)', async () => {
  const { dailySeed } = await import('./sketch-daily.ts');
  assert.equal(dailySeed('2026-07-22'), dailySeed('2026-07-22'));
  assert.notEqual(dailySeed('2026-07-22'), dailySeed('2026-07-23'));
  const s = dailySeed('2026-07-22');
  assert.ok(s >= 400000 && s < 490000);
});
