// 별리라됴 연속 방송 창구 — GET /api/radio/stream (공개)
//
// HLS 조각·재생목록 배달층을 폐기하고 Liquidsoap의 하나로 이어진 MP3 줄기를
// 같은 출처로 그대로 넘긴다. 본문을 읽거나 버퍼링하지 않고 스트림을 전달한다.
// 원점이 꺼지면 R2에 영구 보관된 가장 최근 완성 방송 한 편을 그대로 내보낸다.

import {
  loadLatestCloudReplay,
  radioR2Key,
  resolvedByteRange,
  type CloudReplayEnv,
} from './_cloud-replay.ts';

const STREAM_URL = 'https://byeol-radio-ingest-v2.byulsarang.workers.dev/live.mp3';

interface Env extends CloudReplayEnv { CAPTURES?: R2Bucket }

const unavailable = (error: string) => new Response(JSON.stringify({ ok: false, error }), {
  status: 503,
  headers: {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'retry-after': '3',
  },
});

async function liveStream(request: Request): Promise<Response | null> {
  try {
    const upstream = await fetch(STREAM_URL, {
      headers: {
        'user-agent': 'byeoli-station/continuous-2',
        'icy-metadata': request.headers.get('icy-metadata') ?? '0',
      },
      cf: { cacheTtl: 0, cacheEverything: false },
    } as RequestInit);
    if (!upstream.ok || !upstream.body) {
      upstream.body?.cancel();
      return null;
    }
    return new Response(upstream.body, {
      status: 200,
      headers: {
        'content-type': upstream.headers.get('content-type') || 'audio/mpeg',
        'cache-control': 'no-store, no-cache, must-revalidate',
        'access-control-allow-origin': '*',
        'x-content-type-options': 'nosniff',
        'x-byeol-engine': 'liquidsoap',
        'x-byeol-mode': 'live',
      },
    });
  } catch {
    return null;
  }
}

async function r2Replay(request: Request, env: Env): Promise<Response | null> {
  const segment = await loadLatestCloudReplay(env);
  if (!segment) return null;
  const key = radioR2Key(segment.url);
  if (!key) return null;

  if (env.CAPTURES) {
    const object = await env.CAPTURES.get(key, { range: request.headers });
    if (!object || !('body' in object) || !object.body) return null;
    const headers = new Headers();
    object.writeHttpMetadata(headers);
    headers.set('etag', object.httpEtag);
    headers.set('accept-ranges', 'bytes');
    headers.set('cache-control', 'no-store, no-cache, must-revalidate');
    headers.set('access-control-allow-origin', '*');
    headers.set('x-content-type-options', 'nosniff');
    headers.set('x-byeol-engine', 'cloud-replay');
    headers.set('x-byeol-mode', 'replay');
    headers.set('x-byeol-replay-id', segment.id);
    if (object.range) {
      const range = resolvedByteRange(object.range, object.size);
      const end = range.offset + range.length - 1;
      headers.set('content-range', `bytes ${range.offset}-${end}/${object.size}`);
      headers.set('content-length', String(range.length));
      return new Response(object.body, { status: 206, headers });
    }
    headers.set('content-length', String(object.size));
    return new Response(object.body, { status: 200, headers });
  }

  // The binding is the production path. Keeping a streamed public-R2 fallback
  // makes preview deployments useful without copying or buffering the audio.
  const range = request.headers.get('range');
  const upstream = await fetch(segment.url, {
    headers: range ? { range } : undefined,
    cf: { cacheTtl: 3600, cacheEverything: true },
  } as RequestInit);
  if (!upstream.ok || !upstream.body) {
    upstream.body?.cancel();
    return null;
  }
  const headers = new Headers({
    'content-type': upstream.headers.get('content-type') || 'audio/mp4',
    'cache-control': 'no-store, no-cache, must-revalidate',
    'access-control-allow-origin': '*',
    'x-content-type-options': 'nosniff',
    'x-byeol-engine': 'cloud-replay',
    'x-byeol-mode': 'replay',
    'x-byeol-replay-id': segment.id,
  });
  for (const name of ['accept-ranges', 'content-length', 'content-range', 'etag', 'last-modified']) {
    const value = upstream.headers.get(name);
    if (value) headers.set(name, value);
  }
  return new Response(upstream.body, { status: upstream.status === 206 ? 206 : 200, headers });
}

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const live = await liveStream(request);
  if (live) return live;
  try {
    return await r2Replay(request, env) ?? unavailable('radio_and_replay_unavailable');
  } catch {
    return unavailable('cloud_replay_unavailable');
  }
};
