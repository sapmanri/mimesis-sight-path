// 별리라됴 스트림 조각 창구 — GET /api/radio/stream-seg/<name> (공개)
// r2.dev 직결은 rate-limit이 있어 청취가 "조금 나오다 멈춘다"(08-13 실사고).
// 여기서 한 번 받아 **우리 도메인 CDN**에 캐시한다 — 조각 이름이 불변이라 완벽한 캐시 대상.
// 청취자가 몇이든 r2.dev에는 엣지당 한 번만 간다.

const R2_BASE = 'https://pub-8ec6440aae5545379fcfdd50a243847a.r2.dev/radio/stream';
const NAME_OK = /^seg\d{6,16}\.aac$/;

export const onRequestGet: PagesFunction = async ({ params }) => {
  const name = String(params.name ?? '');
  if (!NAME_OK.test(name)) return new Response('bad name', { status: 400 });
  const r = await fetch(`${R2_BASE}/${name}`, {
    // 실패 응답은 캐시 금지 — 업로드 직전의 404가 한 시간 눌어붙으면 그 조각은 영원히 침묵한다
    cf: { cacheEverything: true, cacheTtlByStatus: { '200-299': 3600, '400-599': 0 } },
  } as RequestInit);
  if (!r.ok) return new Response('gone', { status: 404, headers: { 'cache-control': 'no-store' } });
  return new Response(r.body, {
    headers: {
      'content-type': 'audio/aac',
      'cache-control': 'public, max-age=3600, immutable',
      'access-control-allow-origin': '*',
    },
  });
};
