import test from 'node:test';
import assert from 'node:assert/strict';
import { isRecentDuplicate, observationText, parseSocialTrigger } from './_byeoli-social-agent-logic.ts';

test('자율 실행 사건은 고정 슬롯이 아니라 실제 사건/자기 알람만 받는다', () => {
  const now = Date.now();
  assert.equal(parseSocialTrigger({ kind: 'curiosity', eventId: 'curiosity:abc123', occurredAt: now }, now)?.kind, 'curiosity');
  assert.equal(parseSocialTrigger({ kind: 'fixed_0800', eventId: 'fixed:abc123', occurredAt: now }, now), null);
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
