// BUILD 422-OPS-D — GET /api/ops/presence (Ops 호스트 전용 · Access 뒤)
// 집계값만 반환한다. 개별 anonId·개별 세션 정보는 응답에 싣지 않는다.
// 표기 계약(§6-3): "세션"이지 "사람"이 아니다 — 콘솔 문구가 이를 지킨다.

interface Env {
  PLANET: KVNamespace;
}

const KST = 9 * 3600 * 1000;
function kstDay(now: number): string {
  const d = new Date(now + KST);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}`;
}

const JSON_HEADERS = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' };

export const onRequestGet: PagesFunction<Env> = async ({ env }) => {
  const now = Date.now();

  const active = await env.PLANET.list({ prefix: 'presence_on:', limit: 1000 });
  let liveSessions = 0;
  for (const k of active.keys) {
    if ((k.metadata as { m?: number } | undefined)?.m === 1) liveSessions += 1;
  }

  const day = await env.PLANET.list({ prefix: `presence_day:${kstDay(now)}:`, limit: 1000 });
  let durSum = 0, durMax = 0, durN = 0;
  for (const k of day.keys) {
    const m = k.metadata as { f?: number; l?: number } | undefined;
    if (m && typeof m.f === 'number' && typeof m.l === 'number' && m.l >= m.f) {
      const d = m.l - m.f;
      durSum += d; durN += 1; if (d > durMax) durMax = d;
    }
  }

  return new Response(JSON.stringify({
    ok: true,
    generatedAt: now,
    active: { sessions: active.keys.length, live: liveSessions },
    today: {
      sessions: day.keys.length,
      avgMs: durN ? Math.round(durSum / durN) : 0,
      maxMs: durMax,
    },
  }), { status: 200, headers: JSON_HEADERS });
};
