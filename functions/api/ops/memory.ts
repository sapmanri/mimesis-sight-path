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

/**
 * 발행물 역추적 — 이 순간의 사진(photoKey)을 실제로 사용한 발행의 글을 찾는다.
 * 영수증 체인의 역방향: 엽서 → publish_log.imageKey → feed의 그 발행 문장.
 * 순수 함수 — 못 찾으면 null (그 순간이 발행에 쓰인 적이 없다는 정직한 답).
 */
export function matchPublishedText(
  runs: { imageKey?: string | null; invokedAt?: number; threads?: { ok?: boolean } }[],
  feed: { text?: string; t?: number }[],
  photoKey: string | null,
): string | null {
  if (!photoKey) return null;
  const run = runs.find((r) => r.imageKey === photoKey && r.threads?.ok);
  if (!run) return null;
  const post = feed.find((p) => Math.abs((p.t ?? 0) - (run.invokedAt ?? 0)) < 120000);
  return post?.text?.trim() || null;
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
    let next = attachBranch(day, 'sketchDiary', checked.sketch);

    // 431-M 완성(A, 2026-07-21): 그림 채택이 방아쇠 — 같은 사건의 사진·글 갈래도 함께 채운다.
    // 사진 = 하루를 세울 때 이미 골라둔 그 순간의 photoKey를 갈래로 승격.
    if (!next.event.selectedPhoto && next.photoKey) {
      next = attachBranch(next, 'selectedPhoto', next.photoKey);
    }
    // 글 = 발행물 역추적. 못 찾으면 비워 둔다 — 그 순간이 발행에 쓰인 적 없다는 정직한 답.
    if (!next.event.diaryText) {
      try {
        const [publishRaw, feedRaw] = await Promise.all([
          env.PLANET.get('publish_log'), env.PLANET.get('feed'),
        ]);
        const text = matchPublishedText(
          publishRaw ? JSON.parse(publishRaw) : [],
          feedRaw ? JSON.parse(feedRaw) : [],
          next.photoKey,
        );
        if (text) next = attachBranch(next, 'diaryText', text);
      } catch { /* 역추적 실패가 그림 채택을 막지 않는다 */ }
    }

    const errs = validateDayMemory(next);
    if (errs.length) return json(422, { error: 'invalid_memory', detail: errs });
    await env.PLANET.put(memoryKey(checked.date), JSON.stringify(next));
    const filled = [
      next.event.diaryText ? '글' : null,
      next.event.selectedPhoto ? '사진' : null,
      '그림',
    ].filter(Boolean);
    return json(200, {
      ok: true, date: checked.date, memoryEventId: next.memoryEventId,
      attached: { branch: 'sketchDiary', value: checked.sketch },
      replaced,
      branches: {
        diaryText: next.event.diaryText ?? null,
        selectedPhoto: next.event.selectedPhoto ?? null,
        sketchDiary: checked.sketch,
      },
      note: (replaced ? '이전 그림을 교체했다. ' : '') +
        (filled.length === 3
          ? '세 갈래가 모두 같은 사건을 가리킨다 — 하나의 기억, 세 표현.'
          : `채워진 갈래: ${filled.join('·')}. ${next.event.diaryText ? '' : '글은 이 순간을 쓴 발행이 없어 비워 둔다.'}`),
    });
  }

  const date = typeof body.date === 'string' ? body.date : kstDate(Date.now());
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return json(400, { error: 'bad_date: YYYY-MM-DD (KST)' });

  const captures = await loadCaptures(env);
  let day = buildDayMemory(captures, date);
  if (!day) {
    return json(404, {
      error: 'no_observations',
      detail: `${date}에 서버에 남은 관찰이 없다. 빈 기억을 지어내지 않는다.`,
    });
  }

  // 재빌드 가드(2026-07-22 자정): 새 DayMemory의 갈래는 전부 null이라, 채택 후
  // 무심코 다시 세우면 붙여둔 그림·글이 소리 없이 사라진다. 같은 사건이면 갈래를
  // 승계하고, 사건이 바뀌는데 갈래가 차 있으면 확인(force) 없이는 덮지 않는다.
  const prevRaw = await env.PLANET.get(memoryKey(date));
  if (prevRaw) {
    const prev = JSON.parse(prevRaw) as DayMemory;
    const prevBranches = {
      diaryText: prev.event.diaryText ?? null,
      selectedPhoto: prev.event.selectedPhoto ?? null,
      sketchDiary: prev.event.sketchDiary ?? null,
    };
    const hasBranches = Boolean(prevBranches.diaryText || prevBranches.selectedPhoto || prevBranches.sketchDiary);
    if (hasBranches && prev.memoryEventId === day.memoryEventId) {
      day = { ...day, event: { ...day.event, ...prevBranches } };   // 같은 사건 — 갈래 승계
    } else if (hasBranches && body.force !== true) {
      return json(409, {
        error: 'branches_would_be_lost',
        detail: `저장된 하루(${prev.memoryEventId})에 채택된 갈래가 있는데, 다시 세우면 사건이 ${day.memoryEventId}(으)로 바뀌며 갈래가 사라진다. 정말 새로 세우려면 {"force":true}.`,
        prev: { memoryEventId: prev.memoryEventId, branches: prevBranches },
      });
    }
  }

  const errs = validateDayMemory(day);
  if (errs.length) return json(422, { error: 'invalid_memory', detail: errs });

  await env.PLANET.put(memoryKey(date), JSON.stringify(day));
  return json(200, {
    ok: true, date, stored: day,
    next: 'sketch-trial 요청에 useMemory:"<date>" 를 넣으면 이 하루로 그린다.',
  });
};
