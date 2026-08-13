// 별리라됴 "지금 나가는 것" 창구 — GET /api/radio/now (공개)
// Liquidsoap의 실제 on-track 사건을 feeder가 Worker에 기록한다. 편성 시각이나
// HLS 재생목록을 추측하지 않고 실제 출력 엔진의 사실만 전달한다.

const NOW_URL = 'https://byeol-radio-ingest-v2.byulsarang.workers.dev/now.json';

export const onRequestGet: PagesFunction = async () => {
  const response = await fetch(`${NOW_URL}?t=${Date.now()}`, {
    cf: { cacheTtl: 0, cacheEverything: false },
  } as RequestInit);
  if (!response.ok) {
    return new Response(JSON.stringify({ kind: 'bed', title: '별리의 방', isReplay: false, engine: 'liquidsoap' }), {
      headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
    });
  }
  return new Response(await response.text(), {
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store, no-cache, must-revalidate',
      'access-control-allow-origin': '*',
      'x-byeol-engine': 'liquidsoap',
    },
  });
};
