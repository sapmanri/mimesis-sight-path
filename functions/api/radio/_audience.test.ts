import test from 'node:test';
import assert from 'node:assert/strict';
import { onRequestGet, onRequestPost } from './audience.ts';

test('audience GET is forwarded without caching', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ schema: 'byeol-radio.audience.v1' }), {
    headers: { 'content-type': 'application/json' },
  });
  try {
    const response = await onRequestGet({ request: new Request('https://radio.sapmanri.com/api/radio/audience') } as never);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.equal((await response.json()).schema, 'byeol-radio.audience.v1');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('audience POST rejects an oversized signal before forwarding', async () => {
  const response = await onRequestPost({
    request: new Request('https://radio.sapmanri.com/api/radio/audience', {
      method: 'POST',
      headers: { 'content-length': '2048' },
      body: '{}',
    }),
  } as never);
  assert.equal(response.status, 413);
  assert.equal((await response.json()).error, 'too_large');
});
