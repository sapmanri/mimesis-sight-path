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
