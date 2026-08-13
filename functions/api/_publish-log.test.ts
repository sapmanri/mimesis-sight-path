import test from 'node:test';
import assert from 'node:assert/strict';
import { appendPublishLog } from './_publish-log.ts';
import { onRequestPost as retiredAutopost } from './autopost.ts';

function kvStub() {
  const store = new Map<string, string>();
  return {
    store,
    env: {
      PLANET: {
        get: async (key: string) => store.get(key) ?? null,
        put: async (key: string, value: string) => { store.set(key, value); },
      },
    } as never,
  };
}

const base = {
  invokedAt: 1_800_000_000_000,
  scheduledFor: null,
  result: 'editorial_skip' as const,
  httpStatus: 200,
  textIndex: null,
  imageKey: null,
  threads: { attempted: false, ok: false, errorCode: null, requestId: null },
  editorial: { source: 'silence' as const, action: 'silence' as const, targetPostId: null, reason: '쉰다' },
};

test('새 게시 감사 기록은 고정 예정 시각 없이 남는다', async () => {
  const kv = kvStub();
  await appendPublishLog(kv.env, base);
  const log = JSON.parse(kv.store.get('publish_log') ?? '[]');
  assert.equal(log.length, 1);
  assert.equal(log[0].scheduledFor, null);
  assert.match(log[0].runId, /^pub_/);
});

test('고정 슬롯을 다시 쓰려는 호출은 실패한다', async () => {
  const kv = kvStub();
  await assert.rejects(
    appendPublishLog(kv.env, { ...base, scheduledFor: '2026-08-14T08:00:00+09:00' }),
    /fixed_schedule_records_are_retired/,
  );
  assert.equal(kv.store.has('publish_log'), false);
});

test('옛 /api/autopost 호출은 유효한 키여도 410이고 Threads 발행 없이 폐기 영수증만 남긴다', async () => {
  const kv = kvStub();
  const response = await retiredAutopost({
    request: new Request('https://example.test/api/autopost?scheduledFor=2026-08-14T08:00:00+09:00', {
      method: 'POST', headers: { 'X-Publish-Key': 'old-cron-key' },
    }),
    env: { ...kv.env, PUBLISH_KEY: 'old-cron-key' },
  } as never);
  assert.equal(response.status, 410);
  const body = await response.json() as { error?: string };
  assert.equal(body.error, 'fixed_schedule_retired');
  const log = JSON.parse(kv.store.get('publish_log') ?? '[]');
  assert.equal(log.length, 1);
  assert.equal(log[0].result, 'legacy_schedule_retired');
  assert.equal(log[0].threads.attempted, false);
});
