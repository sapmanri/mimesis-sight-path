// 별이가 오늘 부를 상대를 고른다 — 계약 테스트 (사장 판정 2026-08-30 「별이가 선택하게 해」)
//
// 지키는 것: ① 별이의 선택은 그대로 존중한다(빈 선택 포함) ② 응답이 깨지면 null을 돌려
// 호출부가 **전부 부르기 폴백 + 사유 남기기**로 가게 한다 — 조용히 아무도 안 부르면 안 된다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseRefChoice, refPersonaName } from './sketch-daily.ts';

test('참조 파일 이름에서 상대를 알아본다', () => {
  assert.equal(refPersonaName('sketch-refs/byeol-front.png'), '별이');
  assert.equal(refPersonaName('sketch-refs/ppaekong-sit.png'), '빼콩이(고양이)');
  assert.equal(refPersonaName('sketch-refs/etc-thing.png'), 'etc-thing');
});

test('별이가 하나만 부르면 그대로 존중한다 (08-29 사고의 자리)', () => {
  const r = parseRefChoice('{"call":[1],"reason":"오늘 주인공은 개라 빼콩이는 안 부른다"}', 2);
  assert.deepEqual(r?.call, [1]);
  assert.match(r?.reason ?? '', /개/);
});

test('둘 다 부르는 것도, 아무도 안 부르는 것도 별이의 선택이다', () => {
  assert.deepEqual(parseRefChoice('{"call":[1,2],"reason":"둘 다 있었다"}', 2)?.call, [1, 2]);
  assert.deepEqual(parseRefChoice('{"call":[],"reason":"오늘은 사물만"}', 2)?.call, []);
});

test('범위 밖·중복 번호는 걸러낸다', () => {
  assert.deepEqual(parseRefChoice('{"call":[1,1,5,0,-2],"reason":"x"}', 2)?.call, [1]);
});

test('음성 — 깨진 응답은 null이다 (호출부가 전부 부르기로 폴백한다)', () => {
  assert.equal(parseRefChoice('그냥 말로 대답했다', 2), null);
  assert.equal(parseRefChoice('{"reason":"call이 없다"}', 2), null);
  assert.equal(parseRefChoice('{망가진 json', 2), null);
  assert.equal(parseRefChoice('', 2), null);
});

// ── 판정 응답 파싱 (08-30 실사고: 잘린 JSON 24회 → 그날 그림 무산)
import { parseJudgeText } from './sketch-daily.ts';

test('온전한 판정 JSON은 그대로 읽는다', () => {
  const r = parseJudgeText('앞말 {"verdicts":["1장: 좋다"],"pick":2,"reasons":"2번이 낫다"} 뒷말');
  assert.equal(r?.pick, 2);
  assert.equal(r?.reasons, '2번이 낫다');
});

test('잘린 JSON에서도 pick을 건져 낸다 (그날을 통째로 버리지 않는다)', () => {
  const cut = '{"verdicts":["1장: 개구리가 없어 불합격","2장: 고양이가 보여 불합격"],"pick":3,"reasons":"3번이 기억과 맞는';
  const r = parseJudgeText(cut);
  assert.equal(r?.pick, 3);
  assert.equal(r?.verdicts?.length, 2);
});

test('전부 불합격(pick null)도 잘린 채로 읽힌다', () => {
  const r = parseJudgeText('{"verdicts":["1장: 불합격"],"pick":null,"reasons":"전부');
  assert.notEqual(r, null);
  assert.equal(r?.pick, undefined);
});

test('음성 — pick 자체가 없으면 null이다(호출부가 사유를 영수증에 남긴다)', () => {
  assert.equal(parseJudgeText('그림이 참 좋네요 하지만 JSON은 안 드립니다'), null);
  assert.equal(parseJudgeText(''), null);
});

// ── 09-01 구조 교체: 마감 없는 큐 (findPendingDate)
import { findPendingDate, recoIsHonestTerminal } from './sketch-daily.ts';

const kv = (m: Record<string, unknown>) => async (k: string) => {
  const v = m[k];
  return v === undefined ? null : JSON.stringify(v);
};

test('가장 오래된 미완을 먼저 이어 그린다 (일기는 늦게 써도 그날 일기다)', async () => {
  const m = {
    'sketch_daily_reco:2026-08-29': { status: 'partial', picks: [1] },        // 미완 — 더 오래됨
    'sketch_daily_reco:2026-08-31': { status: 'partial', picks: [1, 2] },     // 미완
  };
  assert.equal(await findPendingDate(kv(m), '2026-09-01', 3), '2026-08-29');
});

test('끝난 하루는 건드리지 않는다', async () => {
  const done = { status: 'done', picks: [1], reco: { pick: 1, reasons: '합격', verdicts: ['1장: 합격'] } };
  const m = {
    'sketch_daily_reco:2026-08-30': done,
    'sketch_daily_reco:2026-08-31': { skipped: 'no_observations' },           // 정직한 건너뜀도 종결
  };
  assert.equal(await findPendingDate(kv(m), '2026-09-01', 3), null);
});

test('시도를 다 쓴 하루도 종결이다 — 큐가 무한히 자라지 않는다', async () => {
  const m = { 'sketch_daily_reco:2026-08-31': { status: 'failed', errorCode: 'attempts_exhausted' } };
  assert.equal(recoIsHonestTerminal(m['sketch_daily_reco:2026-08-31']), true);
  assert.equal(await findPendingDate(kv(m), '2026-09-01', 3), null);
});

test('영수증이 없는 날은 새로 접지 않는다 (과거 하루를 새로 만들지 않는다)', async () => {
  assert.equal(await findPendingDate(kv({}), '2026-09-01', 3), null);
});

test('오늘은 큐가 건드리지 않는다 (오늘 몫은 본진이 접는다)', async () => {
  const m = { 'sketch_daily_reco:2026-09-01': { status: 'partial', picks: [1] } };
  assert.equal(await findPendingDate(kv(m), '2026-09-01', 3), null);
});

test('3일 밖의 미완은 포기한다 (사장 판정 09-01)', async () => {
  const m = { 'sketch_daily_reco:2026-08-27': { status: 'partial', picks: [1] } };
  assert.equal(await findPendingDate(kv(m), '2026-09-01', 3), null);
});

test('경계 못박기 — 큐는 **어제(D-1)를 반드시** 본다 (09-01 하루 밀림 실사고)', async () => {
  // 옛 코드는 KST 자정에서 하루를 빼고 UTC로 찍어 D-2·D-3·D-4를 봤다 — 어제를 영영 놓쳤다.
  // 위 테스트들은 답이 우연히 같아 이 결함을 못 잡았다. 여기서 하루씩 못박는다.
  const only = (d: string) => kv({ [`sketch_daily_reco:${d}`]: { status: 'partial', picks: [1] } });
  assert.equal(await findPendingDate(only('2026-08-31'), '2026-09-01', 3), '2026-08-31'); // D-1
  assert.equal(await findPendingDate(only('2026-08-30'), '2026-09-01', 3), '2026-08-30'); // D-2
  assert.equal(await findPendingDate(only('2026-08-29'), '2026-09-01', 3), '2026-08-29'); // D-3
  assert.equal(await findPendingDate(only('2026-08-28'), '2026-09-01', 3), null);         // D-4는 밖
  // 달 넘김도 밀리지 않는다
  assert.equal(await findPendingDate(only('2026-07-31'), '2026-08-01', 3), '2026-07-31');
});

// ── 09-02 그림체 층: 되돌릴 수 있어야 한다 (사장 지시 「되돌릴 수 있게 잘 내비둬」)
import { buildImagePrompt, type MemoryEvent } from './_daily-sketch.ts';

const mem = { density: 'normal', lines: ['그늘 찾는 개'], targetLabel: '개' } as unknown as MemoryEvent;

test('flux 판은 한 글자도 안 바뀐다 — 기본값과 명시 지정이 같다', () => {
  const implicit = buildImagePrompt(mem, null, 'a dog in shade', ['a dog'], { characters: 2, styles: 0 }, null, []);
  const explicit = buildImagePrompt(mem, null, 'a dog in shade', ['a dog'], { characters: 2, styles: 0 }, null, [], 'workers-ai');
  assert.equal(implicit, explicit);
  assert.match(implicit, /graph paper/);        // 모눈종이는 flux 판에 그대로 남아 있다
  assert.match(implicit, /pose vocabulary/);    // 참조를 약하게 쓰라는 flux 대응도 그대로
});

test('제미나이 판은 모눈종이와 flux 대응을 걷어낸다', () => {
  const g = buildImagePrompt(mem, null, 'a dog in shade', ['a dog'], { characters: 2, styles: 0 }, null, [], 'gemini');
  assert.equal(/graph paper|grid paper/.test(g), false);   // 모눈종이 없음
  assert.equal(/pose vocabulary/.test(g), false);          // 참조 약화 지시 없음
  assert.equal(/flat scan|top-down/.test(g), false);       // 공책사진 대응 없음
});

test('제미나이 판은 참조를 최우선으로 세운다', () => {
  const g = buildImagePrompt(mem, null, 'a dog in shade', ['a dog'], { characters: 2, styles: 0 }, null, [], 'gemini');
  assert.match(g, /authoritative reference/);
  assert.match(g, /the reference decides how this picture looks/);
});

test('제미나이 판은 그림 속 글씨를 막는다 (09-02 「SHADE」가 그려진 사고)', () => {
  const g = buildImagePrompt(mem, null, 'a dog in shade', ['a dog'], { characters: 1, styles: 0 }, null, [], 'gemini');
  assert.match(g, /Do not draw any text/);
});

test('물린 이유는 두 판 모두에 실린다', () => {
  const why = ['1장: 개가 없다'];
  assert.match(buildImagePrompt(mem, null, 's', [], 1, null, why, 'workers-ai'), /개가 없다/);
  assert.match(buildImagePrompt(mem, null, 's', [], 1, null, why, 'gemini'), /개가 없다/);
});
