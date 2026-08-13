// BUILD 425-B/C — 답글 정책 테스트 (node --experimental-strip-types --test)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  categorize, maskUsername, mergeReplies, draftEligibility,
  replyBoundary, WORLD_FACTS, type ReplyRecord,
} from './_replies.ts';

const NOW = Date.parse('2026-07-18T21:00:00+09:00');

function rec(over: Partial<ReplyRecord> = {}): ReplyRecord {
  return {
    sourceCommentId: 'c1', sourcePostId: 'p1',
    text: '저 벤치가 왠지 쓸쓸해 보여요.', commentCreatedAt: NOW - 3600_000,
    detectedAt: NOW, authorIdHash: 'h1', authorMask: 'u***e',
    category: 'observation', decision: 'collected', reason: null,
    generatedText: null, bookmarked: false,
    approvedAt: null, publishedAt: null,
    threads: { errorCode: null, requestId: null }, modelVersion: null,
    ...over,
  };
}

test('categorize: 스팸·민감·이모지·질문·관찰', () => {
  assert.equal(categorize('맞팔해요 https://x.com'), 'spam');
  assert.equal(categorize('이 약 처방 받아도 되나요'), 'sensitive');
  assert.equal(categorize('ㅋㅋㅋㅋ 👍👍'), 'light');
  assert.equal(categorize('별이는 오늘 뭐 봤나요?'), 'question');
  assert.equal(categorize('오늘도 잘 보고 가요'), 'greeting');
  assert.equal(categorize('저 벤치가 왠지 쓸쓸해 보여요'), 'observation');
});

test('maskUsername: 원문 노출 없음', () => {
  assert.equal(maskUsername('rainlover'), 'r***r');
  assert.equal(maskUsername('ab'), 'a*');
});

test('mergeReplies: sourceCommentId 멱등 + 최신순 유지', () => {
  const first = mergeReplies([], [rec({ sourceCommentId: 'a' }), rec({ sourceCommentId: 'b' })]);
  assert.equal(first.added, 2);
  const again = mergeReplies(first.log, [rec({ sourceCommentId: 'a' }), rec({ sourceCommentId: 'c' })]);
  assert.equal(again.added, 1);
  assert.equal(again.log.length, 3);
});

test('draftEligibility: 수량·숙성·계정·카테고리 상한 없이 미처리 댓글은 별이가 판단한다', () => {
  const base: ReplyRecord[] = [];
  for (let i = 0; i < 10; i++) base.push(rec({ sourceCommentId: `c${i}`, authorIdHash: `h${i}`, commentCreatedAt: NOW - (i + 2) * 600000 }));
  const AUTO = { automated: true };
  assert.equal(draftEligibility(rec({ category: 'spam' }), base, NOW), null);
  assert.equal(draftEligibility(rec({ category: 'sensitive' }), base, NOW), null);
  assert.equal(draftEligibility(rec({ commentCreatedAt: NOW - 60000 }), base, NOW), null);
  assert.equal(draftEligibility(rec({ category: 'spam' }), base, NOW, AUTO), null);
  assert.equal(draftEligibility(rec({ category: 'sensitive' }), base, NOW, AUTO), null);
  assert.equal(draftEligibility(rec({ category: 'light' }), base, NOW, AUTO), null);
  assert.equal(draftEligibility(rec({ decision: 'published' }), base, NOW), 'already_handled');
  assert.equal(draftEligibility(rec({ decision: 'ignored' }), base, NOW, AUTO), 'already_handled');
});

/* ── 2026-07-20 실사고 회귀: "펫이 없으므로" 오판 ── */

test('세계의 사실에 빼콩이가 선언돼 있다 — 지어내지 않기의 전제는 실제를 아는 것', () => {
  // 빼콩이가 예시가 아니라 사실로 존재해야 한다 (예시 한 줄만 있던 것이 오판의 원인)
  assert.match(WORLD_FACTS, /빼콩이/);
  assert.match(WORLD_FACTS, /펫이 없다.*판단하지 마라|"데리고 다니는 펫이 없다"고 판단하지 마라/);
});

test('외부 답글 경계는 취향이 아니라 중복 노출 사고 형태만 막는다', () => {
  assert.equal(replyBoundary('한참 비어 있었어. 그래서 조금 더 오래 봤어.'), null);
  assert.equal(replyBoundary('여기 봐 https://example.com'), 'url');
  assert.equal(replyBoundary('연락은 010-1234-5678'), 'phone');
  assert.equal(replyBoundary('x'.repeat(301)), 'too_long');
});
