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

  // 431-P: 지속시간은 **현재 접속 중인 세션**에서 계산한다. presence_day를 beat마다
  // 갱신하지 않게 되면서 그쪽의 last(l)가 사라졌기 때문 — 의미가 바뀐 지표는
  // today.* 가 아니라 active.* 로 옮긴다(승인 조건 6: 이름 분리).
  const active = await env.PLANET.list({ prefix: 'presence_on:', limit: 1000 });
  let liveSessions = 0;
  let durSum = 0, durMax = 0, durN = 0;
  for (const k of active.keys) {
    const m = k.metadata as { m?: number; f?: number } | undefined;
    if (m?.m === 1) liveSessions += 1;
    if (m && typeof m.f === 'number' && now >= m.f) {
      const d = now - m.f;
      durSum += d; durN += 1; if (d > durMax) durMax = d;
    }
  }

  const day = await env.PLANET.list({ prefix: `presence_day:${kstDay(now)}:`, limit: 1000 });

  return new Response(JSON.stringify({
    ok: true,
    generatedAt: now,
    active: {
      sessions: active.keys.length,
      live: liveSessions,
      // 접속 중인 세션이 지금까지 머문 시간 (예전 today.avgMs/maxMs와 의미가 다르다)
      avgMs: durN ? Math.round(durSum / durN) : 0,
      maxMs: durMax,
    },
    today: {
      // 그날 처음 진입한 브라우저 세션 수. 체류시간은 더 이상 여기서 계산하지 않는다.
      sessions: day.keys.length,
    },
  }), { status: 200, headers: JSON_HEADERS });
};
