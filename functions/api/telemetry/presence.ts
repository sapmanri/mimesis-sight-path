// BUILD 422-OPS-D — POST /api/telemetry/presence (공개 수집, Ops 경계 밖 §6-3)
// BUILD 431-P — KV 쓰기 폭주 수정 (Vase 승인 2026-07-20)
//
// 걷기 앱이 보내는 heartbeat. "사용자"가 아니라 "브라우저 세션"이다.
// 하드룰: IP 원문·User-Agent 원문을 읽지도 저장하지도 않는다. Observer Code 금지.
// Authority에는 아무것도 기록하지 않는다 — 별이는 여전히 관찰자를 모른다.
//
// ⚠ 431-P가 고친 것: beat마다 KV 쓰기 2건 × 60초 주기 = 탭 하나로 2,880 writes/day.
// Free 플랜 KV 쓰기 한도가 1,000/day라 탭 하나가 한도의 2.88배를 썼다. 한도를 넘으면
// 그날 자정(UTC)까지 **모든 KV 쓰기가 실패**한다 — feed(Threads 발행) · capture_meta ·
// world_event_schedule · threads_auth 가 조용히 같이 죽는다.
//
// 원인은 목적이 둘인데 경로가 하나였다는 것:
//   실시간 접속 여부(짧은 TTL 상태)  ≠  일 방문 통계(하루 1회 기록)
// 이제 갈라 놓는다:
//   presence_on   — heartbeat마다 갱신. 현재 접속 상태만.
//   presence_day  — 그날 첫 진입에만 1회. 누적 카운트를 beat마다 쓰지 않는다.
//
// 예상 쓰기(탭 1개·하루): 288(heartbeat) + 1(첫 진입) = 289 writes/day.
// 다른 자율 시스템 몫으로 700 이상 남긴다.

interface Env {
  PLANET: KVNamespace;
}

const ANON_RE = /^[A-Za-z0-9_-]{8,40}$/;
/** 활성 만료 — heartbeat 주기(5분)보다 넉넉히 길어야 깜빡이지 않는다 */
export const ACTIVE_TTL_S = 12 * 60;
/** heartbeat 주기 (클라이언트 presence-sync.js와 맞춘다) */
export const BEAT_INTERVAL_MS = 5 * 60_000;
/** 이보다 잦은 heartbeat는 쓰기 없이 무시 (폭주 방지). 정상 주기는 통과해야 한다. */
export const MIN_BEAT_MS = 4 * 60_000;
const DAY_TTL_S = 26 * 3600;

const KST = 9 * 3600 * 1000;
export function kstDay(now: number): string {
  const d = new Date(now + KST);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}`;
}

const JSON_HEADERS = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' };

/** 하루 예상 KV 쓰기 — 탭 1개 기준. 회귀 테스트가 이 식을 검증한다. */
export function expectedWritesPerTabPerDay(beatIntervalMs = BEAT_INTERVAL_MS): number {
  const beats = Math.floor((24 * 3600_000) / beatIntervalMs);
  return beats /* presence_on */ + 1 /* presence_day 첫 진입 */;
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  let body: { anonId?: unknown; mode?: unknown };
  try { body = (await request.json()) as typeof body; } catch { return new Response('{"ok":false}', { status: 400, headers: JSON_HEADERS }); }
  const anonId = typeof body.anonId === 'string' && ANON_RE.test(body.anonId) ? body.anonId : null;
  if (!anonId) return new Response('{"ok":false}', { status: 400, headers: JSON_HEADERS });
  const mode = body.mode === 'live' ? 'live' : 'sandbox';
  const now = Date.now();

  const activeKey = `presence_on:${anonId}`;
  const prev = (await env.PLANET.get(activeKey, { type: 'json' })) as { at?: number; f?: number } | null;
  if (prev && typeof prev.at === 'number' && now - prev.at < MIN_BEAT_MS) {
    return new Response('{"ok":true,"throttled":true}', { status: 200, headers: JSON_HEADERS });
  }

  // 세션 시작 시각을 이어받는다 — 접속 지속시간을 **추가 쓰기 없이** 계산하려면 이게 필요하다.
  const sessionStart = prev && typeof prev.f === 'number' ? prev.f : now;

  // ① 현재 접속 상태 — heartbeat마다 갱신하는 유일한 쓰기
  await env.PLANET.put(activeKey, JSON.stringify({ at: now, f: sessionStart }), {
    expirationTtl: ACTIVE_TTL_S,
    metadata: { m: mode === 'live' ? 1 : 0, f: sessionStart },
  });

  // ② 일 방문 통계 — 그날 **첫 진입에만** 1회. beat마다 누적을 다시 쓰지 않는다.
  const dayKey = `presence_day:${kstDay(now)}:${anonId}`;
  let dayWritten = false;
  if (!(await env.PLANET.get(dayKey))) {
    await env.PLANET.put(dayKey, JSON.stringify({ f: now }), {
      expirationTtl: DAY_TTL_S,
      metadata: { f: now },
    });
    dayWritten = true;
  }

  return new Response(JSON.stringify({ ok: true, firstVisitToday: dayWritten }), { status: 200, headers: JSON_HEADERS });
};
