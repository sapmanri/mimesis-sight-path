// 별리라됴 낭독 서가 (사장 지시 2026-08-15: "지금 노래 하나 틀어놓을게. 하듯이
// 글 하나 읽어볼게. 하고 낭독 나오고 그런 식으로. 별이가 제목도 보고 제목 언급도 하고")
//
// GET  /api/radio/readings  (공개)   : 서가 목록 — 점검용. 주소는 어차피 공개 R2다.
// POST /api/radio/readings  (키 인증): 서가 전체 교체 — 채우는 손은 byeol-radio/readings-sync.sh.
//
// **곡 서가(songs.ts)와 같은 꼴이다.** 다른 점은 하나뿐:
//   곡은 사장이 확정한 자산이고, 낭독은 **별이 목소리로 미리 구운 우리 원고**다.
//   그래서 굽기는 방송 밖에서 미리 끝내고, 방송 중에는 파일만 갖다 쓴다 —
//   그게 이 서가의 존재 이유다(생산 비용 0인 재고).
//
// ⚠ 잠긴 원고(「남겨둔 것들」·「소고기 김밥」)는 여기 오면 안 된다.
//    본문을 굽는 순간 음성이 곧 원문이다. 채우는 손이 애초에 안 보내지만,
//    서버도 kind로 한 번 더 막는다(bookcase.ts의 이중 방벽과 같은 규율).

const READINGS_KEY = 'radio:readings';
const READINGS_MAX = 60;
// program.ts·songs.ts와 같은 잣대 — 서가가 남의 주소를 트는 일은 없어야 한다
const URL_OK = /^https:\/\/pub-8ec6440aae5545379fcfdd50a243847a\.r2\.dev\/radio\//;
// 낭독해도 되는 갈래만. 미발표·출품 중 원고는 이름부터 여기 못 들어온다.
const KIND_OK = new Set(['잠깐멈춰']);

interface RadioReading {
  title: string;
  url: string;
  dur: number;
  kind: string;
  /** 첫 줄 남짓 — 별이가 무슨 글인지 알고 고르라고 준다. 전문이 아니다. */
  opening?: string;
}
interface Env { PLANET: KVNamespace; PULSE_KEY?: string }

const JSON_HEADERS = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' };
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });

export const onRequestGet: PagesFunction<Env> = async ({ env }) => {
  const raw = await env.PLANET.get(READINGS_KEY);
  const readings: RadioReading[] = raw ? JSON.parse(raw) : [];
  return json(200, { ok: true, count: readings.length, readings });
};

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  if (!env.PULSE_KEY) return json(500, { ok: false, error: 'PULSE_KEY not configured' });
  if (request.headers.get('X-Pulse-Key') !== env.PULSE_KEY) return json(403, { ok: false, error: 'forbidden' });

  let body: { readings?: unknown };
  try { body = (await request.json()) as { readings?: unknown }; } catch { return json(400, { ok: false, error: 'bad_json' }); }
  if (!Array.isArray(body.readings) || body.readings.length > READINGS_MAX) {
    return json(400, { ok: false, error: 'bad_readings' });
  }

  const readings: RadioReading[] = [];
  for (const r of body.readings as Partial<RadioReading>[]) {
    const title = String(r.title ?? '').trim().slice(0, 60);
    const kind = String(r.kind ?? '').trim().slice(0, 20);
    const dur = Number(r.dur);
    if (!title) return json(400, { ok: false, error: 'bad_title' });
    if (!KIND_OK.has(kind)) return json(400, { ok: false, error: `kind_not_allowed: ${title}` });
    if (typeof r.url !== 'string' || !URL_OK.test(r.url)) return json(400, { ok: false, error: `bad_url: ${title}` });
    if (!Number.isFinite(dur) || dur <= 0 || dur > 1800) return json(400, { ok: false, error: `bad_dur: ${title}` });
    readings.push({
      title, url: r.url, dur, kind,
      opening: typeof r.opening === 'string' ? r.opening.slice(0, 120) : undefined,
    });
  }

  await env.PLANET.put(READINGS_KEY, JSON.stringify(readings));
  return json(200, { ok: true, count: readings.length });
};
