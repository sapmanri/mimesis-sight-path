// BUILD 425-B/C — 답글 정책 테스트 (node --experimental-strip-types --test)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  categorize, maskUsername, mergeReplies, dailyReplyCap, draftEligibility,
  type ReplyRecord,
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

test('30% 상한: 오늘 신규 10건 → cap 3', () => {
  const log: ReplyRecord[] = [];
  for (let i = 0; i < 10; i++) log.push(rec({ sourceCommentId: `c${i}`, commentCreatedAt: NOW - i * 60000 }));
  const { cap, used } = dailyReplyCap(log, NOW);
  assert.equal(cap, 3);
  assert.equal(used, 0);
});

test('draftEligibility: 카테고리·숙성·상한·쿨다운', () => {
  const base: ReplyRecord[] = [];
  for (let i = 0; i < 10; i++) base.push(rec({ sourceCommentId: `c${i}`, authorIdHash: `h${i}`, commentCreatedAt: NOW - (i + 2) * 600000 }));

  assert.equal(draftEligibility(rec({ category: 'spam' }), base, NOW), 'category_spam');
  assert.equal(draftEligibility(rec({ category: 'sensitive' }), base, NOW), 'category_sensitive');
  assert.equal(draftEligibility(rec({ category: 'light' }), base, NOW), 'category_light');
  assert.equal(draftEligibility(rec({ commentCreatedAt: NOW - 60000 }), base, NOW), 'aging');
  assert.equal(draftEligibility(rec(), base, NOW), null); // 통과

  // 30% 상한은 자동 전용(enforceDailyCap) — 수동(기본값)은 상한 없음 (Vase 판정 07-19)
  // (다른 게시물로 두어 per_post 규칙과 분리 — 상한 규칙만 검증)
  const capped = base.map((r, i) => (i < 3 ? { ...r, publishedAt: NOW - 1000, decision: 'published' as const } : r));
  assert.equal(draftEligibility(rec({ sourceCommentId: 'x', sourcePostId: 'other', authorIdHash: 'hx' }), capped, NOW, { enforceDailyCap: true }), 'daily_cap');
  assert.equal(draftEligibility(rec({ sourceCommentId: 'x', sourcePostId: 'other', authorIdHash: 'hx' }), capped, NOW), null);

  // 같은 게시물 2건 발행 → per_post_cap
  const perPost = base.map((r, i) => (i < 2 ? { ...r, sourcePostId: 'pp', publishedAt: NOW - 1000 } : r));
  assert.equal(draftEligibility(rec({ sourcePostId: 'pp', sourceCommentId: 'y' }), perPost, NOW), 'per_post_cap');

  // 같은 계정 24h 내 발행 → cooldown
  const sameAuthor = [rec({ sourceCommentId: 'z0', authorIdHash: 'hh', publishedAt: NOW - 3600_000 }), ...base];
  assert.equal(draftEligibility(rec({ sourceCommentId: 'z1', authorIdHash: 'hh' }), sameAuthor, NOW), 'per_account_cooldown');
});
