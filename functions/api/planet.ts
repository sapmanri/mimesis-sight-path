// BUILD 248: dev/live 분리 — 세상에 반영 (Vase)
// 방문자는 GET으로 '지금 세상에 나간 행성'을 읽고, Vase는 PUT으로 발행한다.
// 에디터는 각자 localStorage에서 놀되, 발행 버튼을 눌러야 세상에 나간다 — 스테이징→프로덕션을 버튼 하나로.
//
// KV 바인딩 이름: PLANET (Cloudflare Pages 대시보드에서 연결 — Settings > Functions > KV namespace bindings)
// 저장 키: 'live' (현재 세상에 나간 스펙 하나)

interface Env {
  PLANET: KVNamespace;
  PUBLISH_KEY?: string; // 발행 보호 키 (환경변수). 없으면 발행 거부(읽기는 항상 허용).
}

const LIVE_KEY = 'live';
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, PUT, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-Publish-Key',
};

export const onRequestOptions: PagesFunction<Env> = async () =>
  new Response(null, { status: 204, headers: CORS });

// GET /api/planet — 지금 세상에 나간 행성 스펙. 없으면 204(방문자는 DEFAULT 사용).
export const onRequestGet: PagesFunction<Env> = async ({ env }) => {
  const raw = await env.PLANET.get(LIVE_KEY);
  if (!raw) return new Response(null, { status: 204, headers: CORS });
  return new Response(raw, {
    status: 200,
    headers: { ...CORS, 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=15' },
  });
};

// PUT /api/planet — 발행. 본문(JSON 스펙)을 live 슬롯에 저장. X-Publish-Key로 보호.
export const onRequestPut: PagesFunction<Env> = async ({ request, env }) => {
  if (!env.PUBLISH_KEY) {
    return new Response(JSON.stringify({ error: 'PUBLISH_KEY not configured' }), {
      status: 503, headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }
  const key = request.headers.get('X-Publish-Key');
  if (key !== env.PUBLISH_KEY) {
    return new Response(JSON.stringify({ error: 'unauthorized' }), {
      status: 401, headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }
  let body: string;
  try {
    const parsed = await request.json();
    // 최소 검증: 객체이고 theme/radius가 있어야 행성 스펙으로 인정
    if (typeof parsed !== 'object' || parsed === null || !('theme' in parsed) || !('radius' in parsed)) {
      throw new Error('not a planet spec');
    }
    body = JSON.stringify(parsed);
  } catch {
    return new Response(JSON.stringify({ error: 'invalid spec' }), {
      status: 400, headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }
  await env.PLANET.put(LIVE_KEY, body);
  return new Response(JSON.stringify({ ok: true, at: new Date().toISOString() }), {
    status: 200, headers: { ...CORS, 'Content-Type': 'application/json' },
  });
};
