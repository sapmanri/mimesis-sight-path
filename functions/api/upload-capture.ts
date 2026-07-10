// BUILD 354: 씬 캡처 이미지를 R2에 올린다. 각 맵(행성·지역·동네)에서 찍은 SNS 사진의 저장 허브.
//   - POST: data-URL(jpg base64) 받아 R2에 captures/<map>/<ts>.jpg 로 저장, 공개 URL 반환.
//   - 포스트/여권엔 이 URL만 담는다(KV 팽창 방지). 방송(autopost)도 여기서 최근 이미지를 뽑아 쓴다.
//   - GET: 최근 캡처 URL 목록(autopost 이미지 풀용).
//
// R2 바인딩: CAPTURES (버킷 sapmanri-captures). 공개 URL 접두사: PUBLIC_BASE(env 또는 상수).

interface Env {
  CAPTURES: R2Bucket;
  PUBLISH_KEY?: string;
  CAPTURES_PUBLIC_BASE?: string; // 예: https://xxxx.r2.dev  (대시보드 r2.dev 공개 URL)
}

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-Publish-Key',
};

export const onRequestOptions: PagesFunction<Env> = async () =>
  new Response(null, { status: 204, headers: CORS });

// 공개 URL 접두사 — env에 없으면 안전하게 빈 문자열(키만 반환).
function publicBase(env: Env): string {
  return (env.CAPTURES_PUBLIC_BASE || '').replace(/\/$/, '');
}

// POST /api/upload-capture  { map: 'theatre'|'planet'|'region', dataUrl: 'data:image/jpeg;base64,...' }
// → { ok, key, url }
export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  if (!env.PUBLISH_KEY || request.headers.get('X-Publish-Key') !== env.PUBLISH_KEY) {
    return new Response(JSON.stringify({ ok: false, error: 'unauthorized' }), {
      status: 401, headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }
  let body: { map?: string; dataUrl?: string };
  try { body = await request.json(); } catch { return json({ ok: false, error: 'bad json' }, 400); }
  const map = (body.map || 'misc').replace(/[^a-z0-9_-]/gi, '');
  const dataUrl = body.dataUrl || '';
  const m = dataUrl.match(/^data:image\/jpeg;base64,(.+)$/);
  if (!m) return json({ ok: false, error: 'dataUrl must be jpeg base64' }, 400);

  // base64 → bytes
  const bin = atob(m[1]);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);

  const key = `captures/${map}/${Date.now()}.jpg`;
  await env.CAPTURES.put(key, bytes, { httpMetadata: { contentType: 'image/jpeg' } });

  const base = publicBase(env);
  const url = base ? `${base}/${key}` : key; // 공개 URL 미설정 시 키만
  return json({ ok: true, key, url });
};

// GET /api/upload-capture?map=theatre&limit=20 — 최근 캡처 URL 목록(autopost 이미지 풀용)
export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const u = new URL(request.url);
  const map = (u.searchParams.get('map') || '').replace(/[^a-z0-9_-]/gi, '');
  const limit = Math.min(50, Number(u.searchParams.get('limit')) || 20);
  const prefix = map ? `captures/${map}/` : 'captures/';
  const listed = await env.CAPTURES.list({ prefix, limit: 200 });
  const base = publicBase(env);
  // 최신순(키에 timestamp라 역정렬)
  const keys = listed.objects.map((o) => o.key).sort().reverse().slice(0, limit);
  const urls = keys.map((k) => (base ? `${base}/${k}` : k));
  return json({ ok: true, count: urls.length, urls });
};

function json(obj: unknown, status = 200): Response {
  return new Response(JSON.stringify(obj), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
}
