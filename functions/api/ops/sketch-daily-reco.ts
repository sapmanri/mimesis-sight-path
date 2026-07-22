// BUILD 431-AUTO — GET /api/ops/sketch-daily-reco?date= (Ops · Access 뒤)
// 병행 운전(B)의 눈 — 판정기 추천을 읽기만 한다. 발행 권한 없음 (조건 ⑥).

interface Env { PLANET: KVNamespace }

const JSON_HEADERS = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' };

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const date = new URL(request.url).searchParams.get('date') ?? '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return new Response(JSON.stringify({ ok: false, error: 'bad_date' }), { status: 400, headers: JSON_HEADERS });
  }
  const raw = await env.PLANET.get(`sketch_daily_reco:${date}`);
  return new Response(raw ?? JSON.stringify({ ok: true, empty: true, date }), { status: 200, headers: JSON_HEADERS });
};
