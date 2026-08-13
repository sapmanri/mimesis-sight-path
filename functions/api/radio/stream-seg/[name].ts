// 별리라됴 스트림 조각 창구 — GET /api/radio/stream-seg/<name> (공개)
// 송출 Worker에서 한 번 받아 **우리 도메인 CDN**에 캐시한다. 공개 플레이어는 외부 저장소
// 주소를 알 필요가 없고, 조각 이름이 불변이라 안전한 캐시 대상이다.

const STREAM_BASE = 'https://byeol-radio-ingest-v2.byulsarang.workers.dev/stream-seg';
const NAME_OK = /^seg\d{6,16}\.aac$/;

export const onRequestGet: PagesFunction = async ({ params }) => {
  const name = String(params.name ?? '');
  if (!NAME_OK.test(name)) return new Response('bad name', { status: 400 });
  const r = await fetch(`${STREAM_BASE}/${name}`, {
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
