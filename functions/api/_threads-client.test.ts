import test from 'node:test';
import assert from 'node:assert/strict';
import { dispatchToThreads } from './_threads-client.ts';
import { refreshThreadsShelf } from './_radio-social.ts';
import { resolveObservedExternalTargets, threadsPublicInternals } from './_threads-public.ts';
import type { ToonShelf } from './_radio-toon.ts';

function kvStub(username = 'byeoli_log') {
  const store = new Map<string, string>();
  store.set('threads_auth', JSON.stringify({
    token: 'test-token', userId: 'byeoli-user-1', username, refreshedAt: Date.now(),
  }));
  const PLANET = {
    get: async (key: string, type?: string) => {
      const value = store.get(key) ?? null;
      return type === 'json' && value ? JSON.parse(value) : value;
    },
    put: async (key: string, value: string) => { store.set(key, value); },
  } as unknown as KVNamespace;
  return { store, env: { PLANET, BYEOLI_THREADS_HANDLE: 'byeoli_log' } };
}

test('다른 Threads 계정이면 컨테이너 쓰기를 시작하지 않는다', async () => {
  const kv = kvStub('other_account');
  const originalFetch = globalThis.fetch;
  const calls: Array<{ url: string; method: string }> = [];
  globalThis.fetch = async (input, init) => {
    calls.push({ url: String(input), method: init?.method ?? 'GET' });
    return Response.json({ id: 'byeoli-user-1', username: 'other_account' });
  };
  try {
    const result = await dispatchToThreads(kv.env, '쓰면 안 되는 글', null, false);
    assert.equal(result.ok, false);
    assert.equal(result.attempted, false);
    assert.equal(result.errorCode, 'auth_or_account_mismatch');
    assert.equal(calls.length, 1);
    assert.equal(calls[0].method, 'GET');
    assert.match(calls[0].url, /\/me\?/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('@byeoli_log만 reply_to_id 댓글·답글을 실제 발행선에 보낸다', async () => {
  const kv = kvStub();
  const originalFetch = globalThis.fetch;
  const calls: Array<{ url: URL; method: string }> = [];
  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input));
    calls.push({ url, method: init?.method ?? 'GET' });
    if (url.pathname.endsWith('/me')) {
      return Response.json({ id: 'byeoli-user-1', username: 'byeoli_log' });
    }
    if (url.pathname.endsWith('/me/threads')) {
      return Response.json({ id: 'container-1' });
    }
    if (url.pathname.endsWith('/byeoli-user-1/threads_publish')) {
      return Response.json({ id: 'published-reply-1' });
    }
    return Response.json({ error: { code: 404 } }, { status: 404 });
  };
  try {
    const result = await dispatchToThreads(kv.env, '별이가 고른 답글', null, false, 'incoming-comment-1');
    assert.equal(result.ok, true);
    assert.equal(result.requestId, 'published-reply-1');
    const create = calls.find((call) => call.url.pathname.endsWith('/me/threads'));
    assert.ok(create);
    assert.equal(create.method, 'POST');
    assert.equal(create.url.searchParams.get('reply_to_id'), 'incoming-comment-1');
    assert.equal(create.url.searchParams.get('text'), '별이가 고른 답글');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('자기 Threads 선반은 임의 12개 제한 없이 Meta 다음 페이지를 끝까지 읽는다', async () => {
  const kv = kvStub();
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input) => {
    const url = new URL(String(input));
    if (url.pathname.endsWith('/me')) {
      return Response.json({ id: 'byeoli-user-1', username: 'byeoli_log' });
    }
    if (url.pathname.endsWith('/me/threads') && url.searchParams.get('after') === 'page-2') {
      return Response.json({
        data: Array.from({ length: 37 }, (_, index) => ({
          id: `post-${index + 101}`, text: `글 ${index + 101}`, timestamp: '', permalink: '', is_reply: false,
        })),
      });
    }
    if (url.pathname.endsWith('/me/threads')) {
      const next = new URL(url.toString());
      next.searchParams.set('after', 'page-2');
      return Response.json({
        data: Array.from({ length: 100 }, (_, index) => ({
          id: `post-${index + 1}`, text: `글 ${index + 1}`, timestamp: '', permalink: '', is_reply: false,
        })),
        paging: { next: next.toString() },
      });
    }
    return Response.json({ error: { code: 404 } }, { status: 404 });
  };
  try {
    const receipt = await refreshThreadsShelf(kv.env);
    assert.equal(receipt.ok, true);
    assert.equal(receipt.count, 137);
    const shelf = JSON.parse(kv.store.get('radio:social:threads') ?? '{}');
    assert.equal(shelf.posts.length, 137);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('외부 댓글 대상은 Crawl4AI가 읽은 링크와 Meta 실제 permalink가 일치해야 한다', async () => {
  const kv = kvStub();
  const shelf: ToonShelf = {
    at: Date.now(), sourceAt: Date.now(), sourceUrl: 'https://www.threads.com/@byeol.toon',
    source: 'crawl4ai', ownership: 'external_read_only',
    posts: [{
      id: 'ABC12345', text: '읽은 글', when: '방금',
      permalink: 'https://www.threads.com/@byeol.toon/post/ABC12345',
    }],
  };
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input) => {
    const url = new URL(String(input));
    if (url.pathname.endsWith('/me')) {
      return Response.json({ id: 'byeoli-user-1', username: 'byeoli_log' });
    }
    if (url.pathname.endsWith('/profile_posts')) {
      return Response.json({ data: [
        {
          id: 'meta-target-1', text: '읽은 글', username: 'byeol.toon', is_reply: false,
          permalink: 'https://www.threads.net/@byeol.toon/post/ABC12345', timestamp: '',
        },
        {
          id: 'meta-unseen-2', text: '읽지 않은 글', username: 'byeol.toon', is_reply: false,
          permalink: 'https://www.threads.net/@byeol.toon/post/UNSEEN999', timestamp: '',
        },
        {
          id: 'wrong-owner-3', text: '다른 계정 글', username: 'someone_else', is_reply: false,
          permalink: 'https://www.threads.net/@byeol.toon/post/ABC12345', timestamp: '',
        },
      ] });
    }
    return Response.json({ error: { code: 404 } }, { status: 404 });
  };
  try {
    const result = await resolveObservedExternalTargets(kv.env, shelf);
    assert.equal(result.receipt.ok, true);
    assert.equal(result.receipt.count, 1);
    assert.deepEqual(result.targets.map((target) => target.id), ['meta-target-1']);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('외부 Threads permalink 파서는 계정 소유권을 혼동하지 않는다', () => {
  assert.equal(
    threadsPublicInternals.postCode('https://www.threads.com/@byeol.toon/post/ABC12345'),
    'ABC12345',
  );
  assert.equal(
    threadsPublicInternals.postCode('https://www.threads.com/@byeoli_log/post/ABC12345'),
    null,
  );
});
