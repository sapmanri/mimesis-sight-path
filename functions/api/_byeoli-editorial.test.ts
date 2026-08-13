import test from 'node:test';
import assert from 'node:assert/strict';
import { editorialBoundary, parseEditorialDecision, radioEditorialCandidates } from './_byeoli-editorial.ts';

const candidates = [{ source: 'observation' as const, label: '관찰', text: '창가에 빛이 남았다.' }];

test('편집 판단 파싱 — 게시와 침묵을 모두 별이의 선택으로 받는다', () => {
  assert.deepEqual(parseEditorialDecision('{"source":"silence","action":"silence","text":null,"targetPostId":null,"reason":"오늘은 두고 싶다","nextLookInMinutes":73}', candidates), {
    source: 'silence', action: 'silence', text: null, targetPostId: null,
    reason: '오늘은 두고 싶다', nextLookInMinutes: 73,
  });
  assert.equal(parseEditorialDecision('{"source":"observation","action":"post","text":"창가에 빛이 남았다.","targetPostId":null,"reason":"지금 말하고 싶다","nextLookInMinutes":null}', candidates)?.source, 'observation');
  assert.equal(parseEditorialDecision('{"source":"radio","text":"없는 후보","reason":"x"}', candidates), null);
});

test('다음 확인은 고정 시각표가 아니라 별이의 1회 선택으로만 받는다', () => {
  assert.equal(parseEditorialDecision('{"source":"silence","action":"silence","text":null,"reason":"쉰다","nextLookInMinutes":1}', candidates)?.nextLookInMinutes, 1);
  assert.equal(parseEditorialDecision('{"source":"silence","action":"silence","text":null,"reason":"쉰다","nextLookInMinutes":999999}', candidates)?.nextLookInMinutes, 999999);
  assert.equal(parseEditorialDecision('{"source":"silence","action":"silence","text":null,"reason":"쉰다","nextLookInMinutes":-1}', candidates)?.nextLookInMinutes, null);
});

test('자기 글 아래 댓글은 자기 루트 글 ID에만 허용한다', () => {
  const own = [{ id: 'own-1', text: '창가에 빛이 남았다.', username: '@byeoli_log', ownership: 'self' as const }];
  const valid = parseEditorialDecision(
    '{"source":"observation","action":"comment","text":"조금 뒤에는 빛이 더 낮아졌어.","targetPostId":"own-1","reason":"이어 쓰고 싶다","nextLookInMinutes":null}',
    candidates, own,
  );
  assert.equal(valid?.action, 'comment');
  assert.equal(valid?.targetPostId, 'own-1');
  assert.equal(parseEditorialDecision(
    '{"source":"observation","action":"comment","text":"남의 글엔 쓰지 않아.","targetPostId":"someone-else","reason":"x","nextLookInMinutes":null}',
    candidates, own,
  ), null);
});

test('실제로 읽고 Meta ID가 확인된 외부 글에는 @byeoli_log 댓글을 고를 수 있다', () => {
  const targets = [{
    id: 'external-1', text: '오늘의 웹툰', username: '@byeol.toon', ownership: 'external_observed' as const,
  }];
  const valid = parseEditorialDecision(
    '{"source":"observation","action":"comment","text":"마지막 칸에 오래 머물렀어.","targetPostId":"external-1","reason":"읽고 한마디 남기고 싶다","nextLookInMinutes":null}',
    candidates, targets,
  );
  assert.equal(valid?.targetPostId, 'external-1');
  assert.equal(parseEditorialDecision(
    '{"source":"observation","action":"comment","text":"읽지 않은 곳엔 쓰지 않아.","targetPostId":"unseen","reason":"x","nextLookInMinutes":null}',
    candidates, targets,
  ), null);
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
