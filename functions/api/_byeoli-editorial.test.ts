import test from 'node:test';
import assert from 'node:assert/strict';
import { editorialBoundary, parseEditorialDecision, radioEditorialCandidates } from './_byeoli-editorial.ts';

const candidates = [{ source: 'observation' as const, label: '관찰', text: '창가에 빛이 남았다.' }];

test('편집 판단 파싱 — 게시와 침묵을 모두 별이의 선택으로 받는다', () => {
  assert.deepEqual(parseEditorialDecision('{"source":"silence","text":null,"reason":"오늘은 두고 싶다"}', candidates), {
    source: 'silence', text: null, reason: '오늘은 두고 싶다',
  });
  assert.equal(parseEditorialDecision('{"source":"observation","text":"창가에 빛이 남았다.","reason":"지금 말하고 싶다"}', candidates)?.source, 'observation');
  assert.equal(parseEditorialDecision('{"source":"radio","text":"없는 후보","reason":"x"}', candidates), null);
});

test('외부 게시 경계 — 연락처·링크 재노출만 막는다', () => {
  assert.equal(editorialBoundary('창가에 빛이 남았다.'), null);
  assert.equal(editorialBoundary('https://example.com'), 'url');
  assert.equal(editorialBoundary('010-1234-5678'), 'phone');
});

test('방송 후보 — 이미 방송된 말과 앞으로의 편성을 관찰 옆에 둔다', () => {
  const now = Date.parse('2026-08-13T00:00:00Z');
  const got = radioEditorialCandidates('관찰', [
    { kind: 'story', startAt: now - 1, title: '사연', script: '이미 방송된 사연' },
    { kind: 'song', startAt: now + 1000, title: '노래' },
  ], now);
  assert.deepEqual(got.map((c) => c.source), ['observation', 'story', 'schedule']);
});
