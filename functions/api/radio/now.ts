// 별리라됴 "지금 나가는 것" 창구 — GET /api/radio/now (공개)
// 스트림 생성기가 발행하는 진실(now.json): 제목·종류·재방송 여부·시작 시각·자막.
// 화면(HLS 모드)의 라벨·자막이 전부 이걸 마신다 — 편성표 추측 금지.
// (08-13 사장: "재방송 틀 때 라이브 표시 어떻게 할 건지 그런 거 다 생각하고 해라")

const NOW_URL = 'https://pub-8ec6440aae5545379fcfdd50a243847a.r2.dev/radio/stream/now.json';

export const onRequestGet: PagesFunction = async () => {
  const r = await fetch(`${NOW_URL}?t=${Date.now()}`, {   // r2.dev 캐시 무효 꼬리표 (stream.ts와 동일)
    cf: { cacheTtl: 0, cacheEverything: false },
  } as RequestInit);
  if (!r.ok) {
    return new Response(JSON.stringify({ kind: 'bed', title: '별리의 방', isReplay: false }), {
      headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
    });
  }
  return new Response(await r.text(), {
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'access-control-allow-origin': '*',
    },
  });
};
