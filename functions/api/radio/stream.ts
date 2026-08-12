// 별리라됴 스트림 창구 — GET /api/radio/stream (공개)
// R2의 미닫이 재생목록(live.m3u8)을 캐시 금지로 넘겨준다. 조각 주소는 재생목록 안에
// 절대경로(R2 공개 도메인)로 박혀 있어 조각은 CDN 캐시를 그대로 누린다(불변 이름).
// ⚠ 재생목록만은 no-store여야 한다 — 엣지가 옛 목록을 물면 라이브가 몇 조각씩 얼어 보인다.
//
// 존재 이유(08-13 새벽): 파일 갈아끼우기 플레이어는 아이폰 잠금화면에서 원리적으로
// 라디오가 될 수 없다 — HLS는 운영체제가 직접 이어 받는다. 생성기는 byeol-radio/stream/.

interface Env { PLANET: KVNamespace }

const PLAYLIST = 'https://pub-8ec6440aae5545379fcfdd50a243847a.r2.dev/radio/stream/live.m3u8';

export const onRequestGet: PagesFunction<Env> = async () => {
  // 캐시 무효 꼬리표 — r2.dev가 같은 주소의 재생목록을 제멋대로 캐시한다 (08-13 실사고
  // "나오다가 안 나오다가": 낡은 목록 → 지워진 조각 404 → 침묵). 조각은 불변 이름이라 무해.
  const r = await fetch(`${PLAYLIST}?t=${Date.now()}`, { cf: { cacheTtl: 0, cacheEverything: false } } as RequestInit);
  if (!r.ok) {
    return new Response('#EXTM3U\n# 방송 준비 중\n', {
      status: 503,
      headers: { 'content-type': 'application/vnd.apple.mpegurl', 'cache-control': 'no-store' },
    });
  }
  return new Response(await r.text(), {
    headers: {
      'content-type': 'application/vnd.apple.mpegurl',
      'cache-control': 'no-store',
      'access-control-allow-origin': '*',
    },
  });
};
