// BUILD 431-M — /api/ops/memory (Ops 호스트 전용 · Access 뒤)
//
// 별이의 하루를 서버에 세운다. 지금까지 그림 시험은 사람이 손으로 하루를 지어냈다 —
// 이 엔드포인트가 그걸 대체한다. 하나의 기억에서 글·사진·그림 세 갈래가 나온다.
//
// 431-A(2026-07-21): action:"attach" — 채택된 그림을 sketchDiary 갈래로 붙인다.
// 정식 1호 통과 후 열린 배선 (Vase 지시: "실화면 결과가 통과한 뒤에만").
//
// ⛔ 자동 게시·크론 연결 없음. 기억을 세우고 읽고 갈래를 채울 뿐이다.

import {
  buildDayMemory, validateDayMemory, attachBranch, memoryKey, kstDate, MEMORY_VERSION,
  type DayMemory, type CaptureLike,
} from '../_memory-event.ts';
import { TRIAL_R2_PREFIX } from '../_image-provider.ts';

interface Env {
  PLANET: KVNamespace;
  CAPTURES: R2Bucket;
}

/** attach 사전 검증 — 시험 산출물(sketch-trials/)만 기억이 될 수 있다. */
export function validateAttachInput(body: Record<string, unknown>):
  { ok: true; date: string; sketch: string } | { ok: false; error: string } {
  const date = typeof body.date === 'string' ? body.date : '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { ok: false, error: 'bad_date: YYYY-MM-DD (KST)' };
  const sketch = typeof body.sketch === 'string' ? body.sketch : '';
  if (!sketch.startsWith(TRIAL_R2_PREFIX) || sketch.includes('..')) {
    return { ok: false, error: `bad_sketch: ${TRIAL_R2_PREFIX} 안의 키만 붙일 수 있다 (시험 산출물만 기억이 된다)` };
  }
  return { ok: true, date, sketch };
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

/**
 * POST {date?} — 그날의 기억을 세워 저장한다. 관찰이 없으면 세우지 않는다.
 * POST {action:"attach", date, sketch} — 채택된 그림을 sketchDiary 갈래로 붙인다.
 */
export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  let body: Record<string, unknown> = {};
  try { body = (await request.json()) as Record<string, unknown>; } catch { /* 빈 본문 허용 */ }

  if (body.action === 'attach') {
    const checked = validateAttachInput(body);
    if (!checked.ok) return json(400, { error: checked.error });
    const storedRaw = await env.PLANET.get(memoryKey(checked.date));
    if (!storedRaw) {
      return json(404, { error: `no_memory: ${checked.date} — 하루를 먼저 세운다. 그림은 기억이 있어야 붙는다.` });
    }
    const day = JSON.parse(storedRaw) as DayMemory;
    // 키만 믿지 않는다 — 실제로 있는 그림만 기억이 된다 (4차 사고의 교훈).
    const head = await env.CAPTURES.head(checked.sketch);
    if (!head) return json(404, { error: `sketch_missing: ${checked.sketch} — R2에 없는 그림은 붙일 수 없다` });
    const replaced = day.event.sketchDiary ?? null;
    const next = attachBranch(day, 'sketchDiary', checked.sketch);
    const errs = validateDayMemory(next);
    if (errs.length) return json(422, { error: 'invalid_memory', detail: errs });
    await env.PLANET.put(memoryKey(checked.date), JSON.stringify(next));
    return json(200, {
      ok: true, date: checked.date, memoryEventId: next.memoryEventId,
      attached: { branch: 'sketchDiary', value: checked.sketch },
      replaced,
      branches: {
        diaryText: Boolean(next.event.diaryText),
        selectedPhoto: Boolean(next.event.selectedPhoto),
        sketchDiary: true,
      },
      note: replaced
        ? '이전 채택을 교체했다 — 하루의 그림은 한 장이다.'
        : '그림이 기억에 붙었다. 글·사진·그림이 같은 사건을 가리키기 시작했다.',
    });
  }

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
