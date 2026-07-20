// BUILD 431-M — /api/ops/memory (Ops 호스트 전용 · Access 뒤)
//
// 별이의 하루를 서버에 세운다. 지금까지 그림 시험은 사람이 손으로 하루를 지어냈다 —
// 이 엔드포인트가 그걸 대체한다. 하나의 기억에서 글·사진·그림 세 갈래가 나온다.
//
// ⛔ 자동 게시·크론 연결 없음. 기억을 세우고 읽기만 한다.

import {
  buildDayMemory, validateDayMemory, memoryKey, kstDate, MEMORY_VERSION,
  type DayMemory, type CaptureLike,
} from '../_memory-event.ts';

interface Env {
  PLANET: KVNamespace;
}

const CAPTURE_META_KEY = 'capture_meta';
const JSON_HEADERS = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' };
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });

async function loadCaptures(env: Env): Promise<CaptureLike[]> {
  const raw = await env.PLANET.get(CAPTURE_META_KEY);
  if (!raw) return [];
  try { return JSON.parse(raw) as CaptureLike[]; } catch { return []; }
}

/** GET ?date=YYYY-MM-DD — 저장된 하루를 읽는다. 없으면 미리보기로 세워서 보여준다(저장 안 함). */
export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const url = new URL(request.url);
  const date = url.searchParams.get('date') ?? kstDate(Date.now());
  const storedRaw = await env.PLANET.get(memoryKey(date));
  const stored: DayMemory | null = storedRaw ? JSON.parse(storedRaw) : null;

  const captures = await loadCaptures(env);
  const preview = stored ? null : buildDayMemory(captures, date);

  return json(200, {
    ok: true,
    version: MEMORY_VERSION,
    date,
    stored,
    preview,
    captureCount: captures.filter((c) => c?.capturedAt && kstDate(c.capturedAt) === date).length,
    note: stored
      ? '저장된 하루다. 다시 세우려면 POST.'
      : (preview ? '아직 저장 전이다. POST로 확정한다.' : '그날 서버에 남은 관찰이 없다 — 하루를 지어내지 않는다.'),
    source: 'capture_meta (ops 콘솔이 엽서를 올릴 때만 쌓인다 — 출처 확장은 별도 판단)',
  });
};

/** POST {date?} — 그날의 기억을 세워 저장한다. 관찰이 없으면 세우지 않는다. */
export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  let body: Record<string, unknown> = {};
  try { body = (await request.json()) as Record<string, unknown>; } catch { /* 빈 본문 허용 */ }
  const date = typeof body.date === 'string' ? body.date : kstDate(Date.now());
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return json(400, { error: 'bad_date: YYYY-MM-DD (KST)' });

  const captures = await loadCaptures(env);
  const day = buildDayMemory(captures, date);
  if (!day) {
    return json(404, {
      error: 'no_observations',
      detail: `${date}에 서버에 남은 관찰이 없다. 빈 기억을 지어내지 않는다.`,
    });
  }
  const errs = validateDayMemory(day);
  if (errs.length) return json(422, { error: 'invalid_memory', detail: errs });

  await env.PLANET.put(memoryKey(date), JSON.stringify(day));
  return json(200, {
    ok: true, date, stored: day,
    next: 'sketch-trial 요청에 useMemory:"<date>" 를 넣으면 이 하루로 그린다.',
  });
};
