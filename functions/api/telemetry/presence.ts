// BUILD 422-OPS-D — POST /api/telemetry/presence (공개 수집, Ops 경계 밖 §6-3)
//
// 걷기 앱이 60초마다 보내는 heartbeat. "사용자"가 아니라 "브라우저 세션"이다.
// 하드룰: IP 원문·User-Agent 원문을 읽지도 저장하지도 않는다. Observer Code 금지.
// Authority에는 아무것도 기록하지 않는다 — 별이는 여전히 관찰자를 모른다.

interface Env {
  PLANET: KVNamespace;
}

const ANON_RE = /^[A-Za-z0-9_-]{8,40}$/;
const ACTIVE_TTL_S = 150;   // 활성 만료 (§6-3: 120~150초)
const MIN_BEAT_MS = 30_000; // 이보다 잦은 heartbeat는 무시 (폭주 방지)
const DAY_TTL_S = 26 * 3600;

const KST = 9 * 3600 * 1000;
function kstDay(now: number): string {
  const d = new Date(now + KST);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}`;
}

const JSON_HEADERS = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' };

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  let body: { anonId?: unknown; mode?: unknown };
  try { body = (await request.json()) as typeof body; } catch { return new Response('{"ok":false}', { status: 400, headers: JSON_HEADERS }); }
  const anonId = typeof body.anonId === 'string' && ANON_RE.test(body.anonId) ? body.anonId : null;
  if (!anonId) return new Response('{"ok":false}', { status: 400, headers: JSON_HEADERS });
  const mode = body.mode === 'live' ? 'live' : 'sandbox';
  const now = Date.now();

  const activeKey = `presence_on:${anonId}`;
  const last = await env.PLANET.get(activeKey);
  if (last && now - (parseInt(last, 10) || 0) < MIN_BEAT_MS) {
    return new Response('{"ok":true,"throttled":true}', { status: 200, headers: JSON_HEADERS });
  }
  await env.PLANET.put(activeKey, String(now), {
    expirationTtl: ACTIVE_TTL_S,
    metadata: { m: mode === 'live' ? 1 : 0 },
  });

  // 오늘(브라우저 세션 단위) — first/last/beats. metadata로 실어 list 집계 시 개별 GET을 피한다.
  const dayKey = `presence_day:${kstDay(now)}:${anonId}`;
  let day = { f: now, l: now, b: 0 };
  const dayRaw = await env.PLANET.get(dayKey);
  if (dayRaw) { try { day = JSON.parse(dayRaw); } catch { /* 재시작 */ } }
  day.l = now; day.b = (day.b || 0) + 1;
  await env.PLANET.put(dayKey, JSON.stringify(day), { expirationTtl: DAY_TTL_S, metadata: day });

  return new Response('{"ok":true}', { status: 200, headers: JSON_HEADERS });
};
