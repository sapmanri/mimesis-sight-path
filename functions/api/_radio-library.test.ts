import test from 'node:test';
import assert from 'node:assert/strict';
import { buildWalkPrompt, validateFind } from './_radio-library.ts';

test('산책 프롬프트 — 책 한정·읽은 것만 출처·빈손 허용·상황은 사실만', () => {
  const p = buildWalkPrompt({
    timeLabel: '밤',
    todayLines: ['풀숲 사흘째, 잎이 하나 늘었다.'],
    recentScripts: ['어제 한 말'],
    shelfTitles: ['어린 왕자'],
  });
  assert.match(p, /책/);
  assert.match(p, /web_fetch로 \*\*펼쳐 읽는다\*\*/);
  assert.match(p, /실제 펼쳐 읽은 주소만/);
  assert.match(p, /남의 글이다/);           // 주입 방어 — 웹 글은 데이터
  assert.match(p, /\{"none": true\}/);      // 빈손 허용 — 지어내기 금지
  assert.match(p, /어린 왕자/);             // 서가 중복 방지
  assert.match(p, /풀숲 사흘째/);
  // 음성: 영화·연재글 등 다른 분야로 새지 않는다 — 1분야 개방 원칙
  assert.doesNotMatch(p, /영화|연재|스레드/);
});

test('발견 검증 — 출처는 도구 기록에 있어야 하고, 빈손은 정상', () => {
  const FETCHED = ['https://example.com/review'];
  const NOW = 1_700_000_000_000;
  // 정상 발견
  const ok = validateFind(
    { title: '창가의 토토', author: '구로야나기 테츠코', note: '창가 자리 이야기라길래.', source: 'https://example.com/review' },
    FETCHED, NOW,
  );
  assert.equal(ok.find?.title, '창가의 토토');
  assert.equal(ok.find?.at, NOW);
  assert.equal(ok.why, null);
  // 음성: 검색 목록에서 본 주소(안 읽은 것)는 거부 — 정직성의 문
  const cheat = validateFind(
    { title: '아무 책', author: '', note: '한 줄', source: 'https://example.com/unread' },
    FETCHED, NOW,
  );
  assert.equal(cheat.find, null);
  assert.equal(cheat.why, 'source_not_fetched');
  // 빈손 선언은 실패가 아니다
  const none = validateFind({ none: true }, FETCHED, NOW);
  assert.deepEqual([none.find, none.why], [null, null]);
  // 음성: 제목·한 줄 없는 반쪽 발견은 거부
  assert.equal(validateFind({ title: '', note: '', source: FETCHED[0] }, FETCHED, NOW).why, 'find_incomplete');
  // 음성: JSON을 못 꺼낸 답은 거부
  assert.equal(validateFind(null, FETCHED, NOW).why, 'json_unreadable');
  // 상한: 남의 문장을 통째로 옮기면 240자에서 잘린다
  const long = validateFind(
    { title: '긴 책', author: 'a', note: '가'.repeat(500), source: FETCHED[0] }, FETCHED, NOW,
  );
  assert.equal(long.find?.note.length, 240);
});
