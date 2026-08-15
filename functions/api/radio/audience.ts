// 별리라됴 청취 심박 창구 — GET/POST /api/radio/audience (공개)
//
// 공개 페이지는 실제 오디오가 재생 중일 때만 익명 세션 심박을 보낸다. 집계 정본은
// 방송 Worker의 Durable Object이며, 이 함수는 같은 출처 창구만 제공한다.

const AUDIENCE_URL = 'https://byeol-radio-ingest-v2.byulsarang.workers.dev/audience';
const MAX_BODY_BYTES = 1024;

const unavailable = () => new Response(JSON.stringify({ ok: false, error: 'audience_unavailable' }), {
  status: 503,
  headers: {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'retry-after': '3',
  },
});

async function proxyAudience(request: Request, method: 'GET' | 'POST'): Promise<Response> {
  let body: string | undefined;
  if (method === 'POST') {
    const declared = Number(request.headers.get('content-length') ?? 0);
    if (declared > MAX_BODY_BYTES) {
      return new Response(JSON.stringify({ ok: false, error: 'too_large' }), {
        status: 413,
        headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
      });
    }
    body = await request.text();
    if (new TextEncoder().encode(body).byteLength > MAX_BODY_BYTES) {
      return new Response(JSON.stringify({ ok: false, error: 'too_large' }), {
        status: 413,
        headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
      });
    }
  }

  let upstream: Response;
  try {
    upstream = await fetch(AUDIENCE_URL, {
      method,
      body,
      headers: method === 'POST'
        ? { 'content-type': 'application/json', 'user-agent': 'byeoli-station-audience/1' }
        : { 'user-agent': 'byeoli-station-audience/1' },
      cf: { cacheTtl: 0, cacheEverything: false },
    } as RequestInit);
  } catch {
    return unavailable();
  }

  const headers = new Headers({
    'content-type': upstream.headers.get('content-type') || 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
  });
  return new Response(upstream.body, { status: upstream.status, headers });
}

export const onRequestGet: PagesFunction = async ({ request }) => proxyAudience(request, 'GET');
export const onRequestPost: PagesFunction = async ({ request }) => proxyAudience(request, 'POST');
