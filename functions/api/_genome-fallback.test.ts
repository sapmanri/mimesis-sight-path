// BUILD 429-F — 폴백 체인 테스트 (node --experimental-strip-types --test)
// 핵심 음성 테스트: book이 주 언어로 승격되지 않는가, 오래된/다른 슬롯 문장집이 새어나오지 않는가.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pickFromBook, resolvePostText, slotForPhase, type BookPickContext } from './_genome-fallback.ts';

const DATE = '2026-07-19';

function book(over: Record<string, unknown> = {}) {
  return {
    contractVersion: 1, date: DATE, slot: 'sunset',
    style: { rhythm: '느리게', mood: '담담' },
    sentences: { 라벤더: ['라벤더가 한쪽으로만 기울어 있었다.'], 벤치: ['벤치는 아직 따뜻했다.'] },
    ...over,
  };
}

function ctx(over: Partial<BookPickContext> = {}): BookPickContext {
  return { targetLabel: '라벤더', diaryLines: ['해질녘 라벤더가 기울어 있었다.'], recentTexts: [], date: DATE, slot: 'sunset', ...over };
}

test('slotForPhase: 하늘 phase → 발행 슬롯', () => {
  assert.equal(slotForPhase('dusk'), 'sunset');
  assert.equal(slotForPhase('night'), 'night');
  assert.equal(slotForPhase('day'), 'afternoon');
  assert.equal(slotForPhase(null), null);
  assert.equal(slotForPhase('nonsense'), null);
});

test('사건과 겹치는 키를 우선 고른다', () => {
  const p = pickFromBook(book(), ctx());
  assert.equal(p.reason, 'ok');
  assert.match(p.text!, /라벤더/);
});

test('어제 문장집은 쓰지 않는다', () => {
  const p = pickFromBook(book({ date: '2026-07-18' }), ctx());
  assert.equal(p.text, null);
  assert.match(p.reason, /stale_book/);
});

test('밤에 아침 문장이 나오지 않는다 (슬롯 강제)', () => {
  const p = pickFromBook(book({ slot: 'morning' }), ctx({ slot: 'night' }));
  assert.equal(p.text, null);
  assert.match(p.reason, /slot_mismatch/);
});

test('구조 검증에 실패한 문장집은 쓰지 않는다', () => {
  for (const bad of [book({ style: { rhythm: '', mood: '' } }), book({ sentences: {} }), book({ contractVersion: 2 })]) {
    const p = pickFromBook(bad, ctx());
    assert.equal(p.text, null);
    assert.match(p.reason, /invalid_book/);
  }
});

test('안전망이 반복기가 되면 안 된다 — 최근과 겹치면 제외', () => {
  const only = book({ sentences: { 라벤더: ['라벤더가 한쪽으로만 기울어 있었다.'] } });
  const p = pickFromBook(only, ctx({ recentTexts: ['라벤더가 한쪽으로만 기울어 있었다.'] }));
  assert.equal(p.text, null);
  assert.match(p.reason, /all_recent_repeats/);
});

test('사건에 맞는 키가 소진되면 무관한 문장을 끌어오지 않는다', () => {
  // 라벤더 사진에 벤치 문장을 붙이느니 다음 순위로 내려간다 (사실성 > 문장 확보)
  const p = pickFromBook(book(), ctx({ recentTexts: ['라벤더가 한쪽으로만 기울어 있었다.'] }));
  assert.equal(p.text, null);
  assert.match(p.reason, /all_recent_repeats/);
});

test('매칭 키가 없을 때만 문장집 전체에서 찾는다', () => {
  const p = pickFromBook(book(), ctx({
    targetLabel: '구름', diaryLines: ['구름이 낮게 지나갔다.'],
    recentTexts: ['라벤더가 한쪽으로만 기울어 있었다.'],   // 둘 중 하나를 막는다
  }));
  assert.equal(p.reason, 'ok');
  assert.match(p.text!, /벤치/);            // 어느 키가 뽑혔든 막히지 않은 쪽이 나온다
});

test('결정론: 같은 날·같은 문장집은 같은 결과', () => {
  const a = pickFromBook(book(), ctx());
  const b = pickFromBook(book(), ctx());
  assert.equal(a.text, b.text);
});

/* ── 체인 순서 ── */

test('1순위: live가 있으면 book·pool은 쳐다보지 않는다', () => {
  const r = resolvePostText({ liveText: '오늘의 문장', book: book(), poolText: '풀 문장', ctx: ctx() });
  assert.equal(r.text, '오늘의 문장');
  assert.equal(r.provenance.generationSource, 'genome-live');
  assert.deepEqual(r.trail, ['genome-live: ok']);
});

test('2순위: live 실패 → 검증된 book', () => {
  const r = resolvePostText({ liveText: null, book: book(), poolText: '풀 문장', ctx: ctx() });
  assert.equal(r.provenance.generationSource, 'genome-book');
  assert.match(r.text, /라벤더/);
  assert.ok(r.trail.includes('genome-live: failed'));
});

test('3순위: book도 못 쓰면 풀. 발행은 절대 멈추지 않는다', () => {
  const r = resolvePostText({ liveText: null, book: null, poolText: '풀 문장', ctx: ctx() });
  assert.equal(r.text, '풀 문장');
  assert.equal(r.provenance.generationSource, 'rule-fallback');
  assert.ok(r.trail.some((t) => t.startsWith('genome-book: no_book')));
});

test('빈 문자열 live는 성공이 아니다 (조용한 통과 금지)', () => {
  const r = resolvePostText({ liveText: '   ', book: null, poolText: '풀 문장', ctx: ctx() });
  assert.equal(r.provenance.generationSource, 'rule-fallback');
});

test('trail이 내려온 경로를 남긴다 (감사)', () => {
  const r = resolvePostText({ liveText: null, book: book({ date: '2026-01-01' }), poolText: '풀', ctx: ctx() });
  assert.deepEqual(r.trail.length, 3);
  assert.match(r.trail[1], /stale_book/);
});
