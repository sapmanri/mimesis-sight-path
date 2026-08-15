import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isAgencyWake, isRecentDuplicate, observationText, parseSocialTrigger,
} from './_byeoli-social-agent-logic.ts';
import { deferSocialWake } from './_byeoli-social-wake.ts';

test('자율 실행 사건은 고정 슬롯이 아니라 실제 사건/자기 알람만 받는다', () => {
  const now = Date.now();
  assert.equal(parseSocialTrigger({ kind: 'curiosity', eventId: 'curiosity:abc123', occurredAt: now }, now)?.kind, 'curiosity');
  assert.equal(parseSocialTrigger({ kind: 'liveness_guard', eventId: 'liveness:abc123', occurredAt: now }, now)?.kind, 'liveness_guard');
  assert.equal(parseSocialTrigger({ kind: 'backlog_continue', eventId: 'backlog:abc123', occurredAt: now }, now)?.kind, 'backlog_continue');
  assert.equal(parseSocialTrigger({ kind: 'fixed_0800', eventId: 'fixed:abc123', occurredAt: now }, now), null);
});

test('창작 판단은 별이 자신의 기상에서만 열린다', () => {
  assert.equal(isAgencyWake('manual_start'), true);
  assert.equal(isAgencyWake('curiosity'), true);
  assert.equal(isAgencyWake('liveness_guard'), true);
  assert.equal(isAgencyWake('backlog_continue'), false);
  assert.equal(isAgencyWake('observation_arrived'), false);
  assert.equal(isAgencyWake('program_registered'), false);
  assert.equal(isAgencyWake('story_aired'), false);
  assert.equal(isAgencyWake('social_refreshed'), false);
});

test('같은 글의 공백 차이는 다시 발행하지 않는다', () => {
  assert.equal(isRecentDuplicate('창가에  빛이 남았다.', ['창가에 빛이 남았다.']), true);
  assert.equal(isRecentDuplicate('다른 빛이 남았다.', ['창가에 빛이 남았다.']), false);
});

test('공개 관측 선반은 출처와 내용이 함께 편집 후보가 된다', () => {
  const text = observationText({
    version: 'web-observations-v1', updatedAt: 1,
    sources: [{
      id: 'public-source', label: '공개 서가', kind: 'web_page',
      sourceUrl: 'https://example.com/', fetchedAt: 1, engine: 'crawl4ai', ownership: 'read_only',
      items: [{ id: 'item-001', title: '창문', text: '비가 유리에 닿았다.', when: '', url: 'https://example.com/a' }],
    }],
  });
  assert.match(text, /공개 서가/);
  assert.match(text, /비가 유리에 닿았다/);
});

test('실제 사건은 감독을 깨우되 새 글 판단 여부는 사건 종류에서 분리된다', async () => {
  let waited: Promise<unknown> | null = null;
  const calls: Array<{ input: string; init?: RequestInit }> = [];
  deferSocialWake({ waitUntil: (promise) => { waited = promise; } }, {
    PULSE_KEY: 'test-pulse',
    BYEOLI_SOCIAL_DIRECTOR: {
      fetch: async (input: string | URL | Request, init?: RequestInit) => {
        calls.push({ input: String(input), init });
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      },
    } as never,
  }, {
    kind: 'observation_arrived', eventId: 'observation:test123', occurredAt: Date.now(), refId: 'test',
  }, 'test observation');
  assert.ok(waited);
  await waited;
  assert.equal(calls.length, 1);
  assert.match(calls[0].input, /social-director\.internal\/wake/);
  assert.equal(isAgencyWake('observation_arrived'), false);
});
