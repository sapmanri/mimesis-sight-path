import test from 'node:test';
import assert from 'node:assert/strict';
import { PROGRAM_KEY, type ProgramSegment } from '../_station.ts';
import { onRequestGet as streamRequest } from './stream.ts';
import { onRequestGet as nowRequest } from './now.ts';

const latest: ProgramSegment = {
  id: 'latest-finished',
  kind: 'talk',
  startAt: 1_000,
  dur: 30,
  title: '가장 최근 방송',
  script: '최근에 실제로 끝난 방송입니다.',
  url: 'https://pub-8ec6440aae5545379fcfdd50a243847a.r2.dev/radio/latest-finished.m4a',
};

const env = {
  PLANET: {
    get: async (key: string) => key === PROGRAM_KEY ? JSON.stringify([latest]) : null,
  },
};

test('stream falls through a dead live origin to the newest cloud audio', async () => {
  const originalFetch = globalThis.fetch;
  const seen: string[] = [];
  globalThis.fetch = async (input) => {
    const url = String(input);
    seen.push(url);
    if (url.includes('byeol-radio-ingest-v2')) {
      return new Response('origin down', { status: 502 });
    }
    return new Response(new Uint8Array([1, 2, 3, 4]), {
      status: 200,
      headers: { 'content-type': 'audio/mp4', 'content-length': '4' },
    });
  };
  try {
    const response = await streamRequest({
      request: new Request('https://radio.sapmanri.com/api/radio/stream'),
      env,
    } as never);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('x-byeol-mode'), 'replay');
    assert.equal(response.headers.get('x-byeol-replay-id'), latest.id);
    assert.deepEqual([...new Uint8Array(await response.arrayBuffer())], [1, 2, 3, 4]);
    assert.equal(seen.length, 2);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('now endpoint names the same cloud file as replay when live state is gone', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response('origin down', { status: 503 });
  try {
    const response = await nowRequest({ env } as never);
    const body = await response.json() as Record<string, unknown>;
    assert.equal(response.status, 200);
    assert.equal(body.mode, 'replay');
    assert.equal(body.cloudFallback, true);
    assert.equal(body.replayId, latest.id);
    assert.equal(body.title, latest.title);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
