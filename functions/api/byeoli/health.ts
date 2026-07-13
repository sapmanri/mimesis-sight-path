interface Env {
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

export const onRequestGet: PagesFunction<Env> = async ({ env }) => {
  if (!env.BYEOLI_AUTHORITY) {
    return new Response(JSON.stringify({ error: 'authority_service_binding_missing' }), {
      status: 503,
      headers: { ...CORS, 'Content-Type': 'application/json; charset=utf-8' },
    });
  }

  const upstream = await env.BYEOLI_AUTHORITY.fetch('https://authority.internal/api/byeoli/health', {
    method: 'GET',
    headers: { accept: 'application/json' },
  });

  return new Response(upstream.body, {
    status: upstream.status,
    headers: {
      ...CORS,
      'Content-Type': upstream.headers.get('Content-Type') ?? 'application/json; charset=utf-8',
    },
  });
};
