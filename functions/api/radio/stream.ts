// 별리라됴 연속 방송 창구 — GET /api/radio/stream (공개)
//
// HLS 조각·재생목록 배달층을 폐기하고 Liquidsoap의 하나로 이어진 MP3 줄기를
// 같은 출처로 그대로 넘긴다. 본문을 읽거나 버퍼링하지 않고 스트림을 전달한다.

const STREAM_URL = 'https://byeol-radio-ingest-v2.byulsarang.workers.dev/live.mp3';

export const onRequestGet: PagesFunction = async ({ request }) => {
  const upstream = await fetch(STREAM_URL, {
    headers: {
      'user-agent': 'byeoli-station/continuous-1',
      'icy-metadata': request.headers.get('icy-metadata') ?? '0',
    },
    cf: { cacheTtl: 0, cacheEverything: false },
  } as RequestInit);
  if (!upstream.ok || !upstream.body) {
    upstream.body?.cancel();
    return new Response(JSON.stringify({ ok: false, error: 'radio_origin_unavailable' }), {
      status: 503,
      headers: {
        'content-type': 'application/json; charset=utf-8',
        'cache-control': 'no-store',
        'retry-after': '3',
      },
    });
  }
  return new Response(upstream.body, {
    status: 200,
    headers: {
      'content-type': upstream.headers.get('content-type') || 'audio/mpeg',
      'cache-control': 'no-store, no-cache, must-revalidate',
      'access-control-allow-origin': '*',
      'x-content-type-options': 'nosniff',
      'x-byeol-engine': 'liquidsoap',
    },
  });
};
