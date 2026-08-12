import test from 'node:test';
import assert from 'node:assert/strict';
import { buildToonPrompt, validateToonPosts, TOON_URL } from './_radio-toon.ts';
import { situationMessage, type RadioSituation } from './_radio.ts';

test('웹툰 읽기 프롬프트 — 그대로 추출·지어내기 금지·주소 고정', () => {
  const p = buildToonPrompt();
  assert.match(p, /그대로/);
  assert.ok(p.includes(TOON_URL));
  assert.match(p, /\{"posts": \[\]\}/);       // 못 읽으면 빈손 — 지어내지 않는다
  assert.match(p, /web_fetch로 펼쳐 읽고/);
});

test('웹툰 추출 검증 — 페이지를 실제로 안 펼쳤으면 인정하지 않는다', () => {
  const POSTS = { posts: [{ text: '오늘은 보리밥+청국장. 별이는 호!', when: '4시간 전' }] };
  const ok = validateToonPosts(POSTS, ['https://www.threads.com/@byeol.toon']);
  assert.equal(ok.posts.length, 1);
  assert.equal(ok.why, null);
  // 음성: fetched에 스레드가 없으면 읽은 척 — 버린다
  const fake = validateToonPosts(POSTS, ['https://example.com/other']);
  assert.deepEqual([fake.posts.length, fake.why], [0, 'page_not_fetched']);
  // 빈 목록은 유효(못 읽은 날) · JSON 불량은 실패
  assert.equal(validateToonPosts({ posts: [] }, ['https://www.threads.com/@x']).why, null);
  assert.equal(validateToonPosts(null, []).why, 'json_unreadable');
});

test('상황 메시지 — 웹툰 편은 실리되 말투 경계가 명시된다', () => {
  const s: RadioSituation = {
    timeLabel: '밤', todayLines: [], story: null, waitingCount: 0, recentScripts: [],
    webtoonPosts: [{ text: '오늘은 보리밥+청국장. 별이는 호…! 꿀맛!😊', when: '4시간 전' }],
  };
  const msg = situationMessage(s);
  assert.match(msg, /네 웹툰\(@byeol\.toon\)/);
  assert.match(msg, /청국장/);
  assert.match(msg, /모른 척하지 않는다/);
  assert.match(msg, /말투.*거기 옷/);   // 결 경계 — 이모지체 복제 금지
});
