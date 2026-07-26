// 사건 공책 읽기 — GET /api/byeoli/events?cursor=&limit=
//
// 경로가 **세 겹**이다: DO(`/events`) → Authority Worker(`/api/byeoli/events`) → 이 Pages Function.
// 2026-07-26에 앞의 두 겹만 붙여놓고 끝났다고 봤다. 공개 호스트는 Pages를 거치므로
// 이 파일이 없으면 라우트가 없는 것과 같다 — 404도 아니고 **SPA index.html이 200으로** 나가서
// "열린다"처럼 보였다. 상태코드가 아니라 실물(JSON)을 봐야 잡히는 결손이었다.
//
// state.ts·health.ts와 다른 점 하나: **쿼리를 그대로 넘긴다.** cursor가 안 넘어가면
// 커서가 항상 0이 되어 같은 사건을 영원히 다시 읽는다(멱등 섭취가 가려버려 조용히 틀린다).

interface Env {
  /** Existing Pages project service binding. Target service: mimesis-byeoli-authority. */
  BYEOLI_AUTHORITY: Fetcher;
}

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Cache-Control': 'no-store',
};

export const onRequestOptions: PagesFunction<Env> = async () =>
  new Response(null, { status: 204, headers: CORS });

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  if (!env.BYEOLI_AUTHORITY) {
    return new Response(JSON.stringify({ error: 'authority_service_binding_missing' }), {
      status: 503,
      headers: { ...CORS, 'Content-Type': 'application/json; charset=utf-8' },
    });
  }

  const search = new URL(request.url).search;
  const upstream = await env.BYEOLI_AUTHORITY.fetch(
    `https://authority.internal/api/byeoli/events${search}`,
    { method: 'GET', headers: { accept: 'application/json' } },
  );

  return new Response(upstream.body, {
    status: upstream.status,
    headers: {
      ...CORS,
      'Content-Type': upstream.headers.get('Content-Type') ?? 'application/json; charset=utf-8',
    },
  });
};
