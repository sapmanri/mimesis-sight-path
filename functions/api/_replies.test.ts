// BUILD 425-B/C — 답글 정책 테스트 (node --experimental-strip-types --test)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  categorize, maskUsername, mergeReplies, dailyReplyCap, draftEligibility,
  WORLD_FACTS, FORCE_INSTRUCTION, type ReplyRecord,
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

test('draftEligibility: 수동은 전부 개방, 정책은 자동(automated) 전용', () => {
  const base: ReplyRecord[] = [];
  for (let i = 0; i < 10; i++) base.push(rec({ sourceCommentId: `c${i}`, authorIdHash: `h${i}`, commentCreatedAt: NOW - (i + 2) * 600000 }));
  const AUTO = { automated: true };

  // 수동(기본값): 이미 답한 것만 막는다 (Vase 판정 07-19 "사람이 할 때는 풀어놔")
  assert.equal(draftEligibility(rec({ category: 'spam' }), base, NOW), null);
  assert.equal(draftEligibility(rec({ category: 'sensitive' }), base, NOW), null);
  assert.equal(draftEligibility(rec({ commentCreatedAt: NOW - 60000 }), base, NOW), null);
  assert.equal(draftEligibility(rec({ decision: 'published' }), base, NOW), 'already_published');

  // 자동: 정책 전부 강제
  assert.equal(draftEligibility(rec({ category: 'spam' }), base, NOW, AUTO), 'category_spam');
  assert.equal(draftEligibility(rec({ category: 'sensitive' }), base, NOW, AUTO), 'category_sensitive');
  assert.equal(draftEligibility(rec({ category: 'light' }), base, NOW, AUTO), 'category_light');
  assert.equal(draftEligibility(rec({ commentCreatedAt: NOW - 60000 }), base, NOW, AUTO), 'aging');
  assert.equal(draftEligibility(rec(), base, NOW, AUTO), null); // 조건 없으면 자동도 통과

  // 30% 상한 (per_post·per_account와 분리된 픽스처)
  const capped = base.map((r, i) => (i < 3 ? { ...r, publishedAt: NOW - 1000, decision: 'published' as const } : r));
  assert.equal(draftEligibility(rec({ sourceCommentId: 'x', sourcePostId: 'other', authorIdHash: 'hx' }), capped, NOW, AUTO), 'daily_cap');
  assert.equal(draftEligibility(rec({ sourceCommentId: 'x', sourcePostId: 'other', authorIdHash: 'hx' }), capped, NOW), null);

  // 같은 게시물 2건 발행 → per_post_cap (자동만)
  const perPost = base.map((r, i) => (i < 2 ? { ...r, sourcePostId: 'pp', publishedAt: NOW - 1000 } : r));
  assert.equal(draftEligibility(rec({ sourcePostId: 'pp', sourceCommentId: 'y' }), perPost, NOW, AUTO), 'per_post_cap');
  assert.equal(draftEligibility(rec({ sourcePostId: 'pp', sourceCommentId: 'y' }), perPost, NOW), null);

  // 같은 계정 24h 내 발행 → cooldown (자동만)
  const sameAuthor = [rec({ sourceCommentId: 'z0', authorIdHash: 'hh', publishedAt: NOW - 3600_000 }), ...base];
  assert.equal(draftEligibility(rec({ sourceCommentId: 'z1', authorIdHash: 'hh' }), sameAuthor, NOW, AUTO), 'per_account_cooldown');
  assert.equal(draftEligibility(rec({ sourceCommentId: 'z1', authorIdHash: 'hh' }), sameAuthor, NOW), null);
});

/* ── 2026-07-20 실사고 회귀: "펫이 없으므로" 오판 ── */

test('세계의 사실에 빼콩이가 선언돼 있다 — 지어내지 않기의 전제는 실제를 아는 것', () => {
  // 빼콩이가 예시가 아니라 사실로 존재해야 한다 (예시 한 줄만 있던 것이 오판의 원인)
  assert.match(WORLD_FACTS, /빼콩이/);
  assert.match(WORLD_FACTS, /펫이 없다.*판단하지 마라|"데리고 다니는 펫이 없다"고 판단하지 마라/);
  // 강제 후보도 정책 위반만은 못 뒤집는다
  assert.match(FORCE_INSTRUCTION, /비난|정치|의료/);
  assert.match(FORCE_INSTRUCTION, /null로 두지 말/);
});
