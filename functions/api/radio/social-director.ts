// Social Director 운영 창구. 공개 Worker 주소에 의존하지 않고 Pages service binding으로 연결한다.
// GET=상태, POST=첫 실행/명시적 깨우기. 둘 다 PULSE_KEY가 있어야 한다.

interface Env {
  PULSE_KEY?: string;
  BYEOLI_SOCIAL_DIRECTOR?: Fetcher;
}

const HEADERS = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store',
};
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: HEADERS });

function authorized(request: Request, env: Env): Response | null {
  if (!env.PULSE_KEY) return json(500, { ok: false, error: 'PULSE_KEY not configured' });
  if (request.headers.get('X-Pulse-Key') !== env.PULSE_KEY) {
    return json(403, { ok: false, error: 'forbidden' });
  }
  if (!env.BYEOLI_SOCIAL_DIRECTOR) {
    return json(503, { ok: false, error: 'BYEOLI_SOCIAL_DIRECTOR binding missing' });
  }
  return null;
}

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const blocked = authorized(request, env);
  if (blocked) return blocked;
  return env.BYEOLI_SOCIAL_DIRECTOR!.fetch('https://social-director.internal/state', {
    headers: { 'X-Pulse-Key': env.PULSE_KEY! },
  });
};

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const blocked = authorized(request, env);
  if (blocked) return blocked;
  let trigger: unknown = null;
  try { trigger = (await request.json() as { trigger?: unknown }).trigger ?? null; }
  catch { /* 빈 본문은 수동 시작 */ }
  return env.BYEOLI_SOCIAL_DIRECTOR!.fetch(
    trigger ? 'https://social-director.internal/wake' : 'https://social-director.internal/start',
    {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'X-Pulse-Key': env.PULSE_KEY! },
      body: trigger ? JSON.stringify({ trigger }) : '{}',
    },
  );
};
