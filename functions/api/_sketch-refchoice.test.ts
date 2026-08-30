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
