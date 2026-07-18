// BUILD 429-A — SentenceBook 계약 테스트 (node --experimental-strip-types --test)
// 검증기 자체를 음성 테스트로 검증한다 (작업수칙 4).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateSentenceBook, bookKey, BOOK_SLOTS, type SentenceBook } from './_genome.ts';

function book(over: Partial<SentenceBook> = {}): SentenceBook {
  return {
    contractVersion: 1,
    date: '2026-07-18',
    slot: 'morning',
    style: { rhythm: '짧게 끊고, 마지막 문장만 길게', mood: '비 온 뒤의 차분함' },
    sentences: {
      flower: ['꽃잎이 아직 젖어 있었다.', '오늘은 향기가 낮게 깔린다.'],
      bench: ['벤치가 비를 다 맞고도 그 자리다.'],
    },
    ...over,
  };
}

test('양성: 올바른 문장집은 통과', () => {
  assert.deepEqual(validateSentenceBook(book()), []);
  for (const slot of BOOK_SLOTS) assert.deepEqual(validateSentenceBook(book({ slot })), []);
});

test('음성: 객체가 아니면 즉시 실패', () => {
  assert.ok(validateSentenceBook(null).length > 0);
  assert.ok(validateSentenceBook('book').length > 0);
});

test('음성: 계약 버전·날짜·슬롯 불량', () => {
  assert.ok(validateSentenceBook({ ...book(), contractVersion: 2 }).length > 0);
  assert.ok(validateSentenceBook(book({ date: '07-18-2026' })).length > 0);
  assert.ok(validateSentenceBook({ ...book(), slot: 'midnight' }).length > 0);
});

test('음성: 문체 없는 문장집은 거부 — 429의 목표 위반', () => {
  assert.ok(validateSentenceBook({ ...book(), style: undefined }).length > 0);
  assert.ok(validateSentenceBook(book({ style: { rhythm: ' ', mood: '차분' } })).length > 0);
});

test('음성: sentences 구조 불량', () => {
  assert.ok(validateSentenceBook(book({ sentences: {} })).length > 0);
  assert.ok(validateSentenceBook(book({ sentences: { flower: [] } })).length > 0);
  assert.ok(validateSentenceBook(book({ sentences: { flower: ['좋다', ''] } })).length > 0);
});

test('음성: 발행 문체 위반 — 해시태그·URL·길이 초과', () => {
  assert.ok(validateSentenceBook(book({ sentences: { flower: ['#꽃스타그램'] } })).length > 0);
  assert.ok(validateSentenceBook(book({ sentences: { flower: ['보러 와 https://x.com'] } })).length > 0);
  assert.ok(validateSentenceBook(book({ sentences: { flower: ['가'.repeat(81)] } })).length > 0);
});

test('bookKey: 시간대 분할 키 규약', () => {
  assert.equal(bookKey('2026-07-18', 'night'), 'book:2026-07-18:night');
});
