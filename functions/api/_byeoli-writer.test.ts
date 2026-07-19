// BUILD 429-E — Writer Genome 배선 테스트 (node --experimental-strip-types --test)
// 네트워크는 타지 않는다. 프롬프트 파생과 출력 검증만 — 둘 다 순수 함수다.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { genomeSystemPrompt, validateWriterOutput, type PostContext } from './_byeoli-writer.ts';
import { buildGenomeContext } from './_genome-identity.ts';

const ctx = buildGenomeContext('byeoli', null).context!;
const dry = buildGenomeContext('dry-report', null).context!;

function post(over: Partial<PostContext> = {}): PostContext {
  return {
    targetLabel: '라벤더', byeoliAction: 'observe', skyPhase: 'dusk', weather: 'clear',
    diaryLines: ['해질녘 라벤더가 한쪽으로만 기울어 있었다.'],
    recentTexts: [], ...over,
  };
}

test('프롬프트는 Genome에서 파생된다 — 손으로 쓴 문체가 아니다', () => {
  const p = genomeSystemPrompt(ctx);
  assert.match(p, /반말로 쓴다/);                 // voice: banmal
  assert.match(p, /결론을 내지 않고/);            // closure: open
  assert.match(p, /감정을 직접 말하지 않는다/);    // emotion: indirect
  assert.match(p, /빛 · 움직임 · 질감 · 거리/);    // selection 순서 그대로
});

test('다른 Genome은 다른 프롬프트를 만든다 (배선이 실제로 걸렸는가)', () => {
  const a = genomeSystemPrompt(ctx);
  const b = genomeSystemPrompt(dry);
  assert.notEqual(a, b);
  assert.match(b, /3인칭 관찰 기록/);
  assert.match(b, /판단을 분명히 적는다/);
  assert.doesNotMatch(b, /빛 · 움직임/);
});

test('통과: 계약을 지킨 글', () => {
  const r = validateWriterOutput('라벤더가 한쪽으로만 기울어 있었다.\n바람은 벌써 지나간 뒤였다.', ctx, post());
  assert.equal(r.pass, true, r.errors.join(' / '));
});

test('말투 드리프트: banmal 계약에 존댓말이 나오면 실패', () => {
  const r = validateWriterOutput('라벤더가 기울어 있었습니다.', ctx, post());
  assert.equal(r.pass, false);
  assert.match(r.errors[0], /voice_drift/);
});

test('selfPresence rare: 1인칭이 잦으면 실패', () => {
  const r = validateWriterOutput('나는 라벤더를 봤다.\n내가 나도 모르게 멈췄다.', ctx, post());
  assert.equal(r.pass, false);
  assert.ok(r.errors.some((e) => e.startsWith('self_presence')));
});

test('메타 소유권: 해시태그·이모지는 본문에 못 들어온다', () => {
  for (const bad of ['라벤더가 기울었다 #산책', '라벤더가 기울었다 🌿']) {
    const r = validateWriterOutput(bad, ctx, post());
    assert.equal(r.pass, false, bad);
    assert.ok(r.errors.some((e) => e.startsWith('meta_leak')));
  }
});

test('관찰 중복: 최근 문장과 크게 겹치면 실패', () => {
  const line = '라벤더가 한쪽으로만 기울어 있었다.';
  const r = validateWriterOutput(line, ctx, post({ recentTexts: [line] }));
  assert.equal(r.pass, false);
  assert.ok(r.errors.some((e) => e.startsWith('observation_repeat')));
});

test('사실성: 엽서와 겹치는 말이 하나도 없으면 실패', () => {
  const r = validateWriterOutput('빼콩이가 지붕 위에서 한참 울었다.', ctx, post());
  assert.equal(r.pass, false);
  assert.ok(r.errors.some((e) => e.startsWith('grounding')));
});

test('길이: 상한 초과는 경고, 크게 넘으면 실패', () => {
  const base = '라벤더가 한쪽으로만 기울어 있었다. ';   // 18자
  const warn = validateWriterOutput(base.repeat(8), ctx, post());   // 144자 — 상한 120 초과
  assert.equal(warn.pass, true);
  assert.ok(warn.warnings.some((w) => w.startsWith('length')));
  const fail = validateWriterOutput(base.repeat(20), ctx, post());
  assert.equal(fail.pass, false);
  assert.ok(fail.errors.some((e) => e.startsWith('length')));
});

test('검증기가 조용히 꺼지지 않는다 — 빈 근거에도 오작동하지 않음', () => {
  // diaryLines·targetLabel이 전부 비면 grounding 검사는 건너뛰되 다른 축은 살아 있어야 한다
  const bare = post({ targetLabel: null, diaryLines: [] });
  assert.equal(validateWriterOutput('조용한 저녁이었다.', ctx, bare).pass, true);
  assert.equal(validateWriterOutput('조용한 저녁이었습니다.', ctx, bare).pass, false);
});
