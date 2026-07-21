// BUILD 431-PUB — POST /api/ops/sketch-publish (Ops 호스트 전용 · Access 뒤)
// 그림 승인 발행 — Vase 승인 조건표 (2026-07-21 밤):
//   ① 발행 대상은 채택된 그림만 (memory:<date>의 sketchDiary 갈래 — 시험 폴더의 나머지 불가)
//   ② Phase 1: 사람 승인 버튼으로만 — 자동·크론 연결 0 (publish-now 3호와 같은 표면 방식)
//   ③ 하루 1장 상한 — 같은 날짜의 성공 발행이 있으면 409
//   ④ 글은 그 기억의 diaryText 갈래만, 없으면 그림만 — 지어낸 캡션 금지
//   ⑤ 공개 승격은 승인 순간에만: sketch-trials/ → captures/sketch/<date>.png 복사, 원본 불변
//   ⑥ publish_log에 감사 기록 (수동 = scheduledFor null → 관측소 "(수동)" 표기)
//   ⑦ 자동 발행(Phase 2)은 채택 병행 운전으로 신뢰를 쌓은 뒤 별도 판정
//
// 자율 크론 경로는 무변경 — autopost의 export(dispatchToThreads)만 재사용한다 (3호 선례).

import { dispatchToThreads, type Env as AutopostEnv } from '../autopost';
import { appendPublishLog } from '../_publish-log';
import { memoryKey, type DayMemory } from '../_memory-event.ts';
import { TRIAL_R2_PREFIX } from '../_image-provider.ts';
import { alreadyPublished, type SketchPubRecord } from '../_sketch-pub.ts';

type Env = AutopostEnv;

const FEED_KEY = 'feed';
const MAX_POSTS = 60;
const SKETCH_PUB_KEY = 'sketch_publish_log';
const SKETCH_PUB_KEEP = 60;

const JSON_HEADERS = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' };
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const requestedBy = request.headers.get('cf-access-authenticated-user-email') ?? 'unknown';
  let body: { date?: string; confirm?: string };
  try { body = (await request.json()) as typeof body; } catch { return json(400, { ok: false, error: 'bad_json' }); }
  if (body.confirm !== 'publish-sketch') return json(400, { ok: false, error: 'confirm_required: {"confirm":"publish-sketch"}' });
  const date = body.date ?? '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return json(400, { ok: false, error: 'bad_date: YYYY-MM-DD (KST)' });

  // ① 채택된 그림만
  const dayRaw = await env.PLANET.get(memoryKey(date));
  if (!dayRaw) return json(404, { ok: false, error: `no_memory: ${date} — 하루가 없다` });
  const day = JSON.parse(dayRaw) as DayMemory;
  const sourceKey = day.event.sketchDiary;
  if (!sourceKey) return json(409, { ok: false, error: 'no_adopted_sketch: 채택된 그림이 없다 — 실험실에서 📌 먼저' });
  if (!sourceKey.startsWith(TRIAL_R2_PREFIX)) return json(400, { ok: false, error: 'bad_sketch_key' });

  // ③ 하루 1장
  const pubRaw = await env.PLANET.get(SKETCH_PUB_KEY);
  const pubLog: SketchPubRecord[] = pubRaw ? JSON.parse(pubRaw) : [];
  if (alreadyPublished(pubLog, date)) {
    return json(409, { ok: false, error: `already_published: ${date}의 그림은 이미 발행됐다 (하루 1장)` });
  }

  // ⑤ 공개 승격 — 승인 순간에만 복사, 원본 불변
  const base = (env.CAPTURES_PUBLIC_BASE ?? '').replace(/\/$/, '');
  if (!base) return json(500, { ok: false, error: 'captures_base_missing' });
  const obj = await env.CAPTURES!.get(sourceKey);
  if (!obj) return json(404, { ok: false, error: `sketch_missing: ${sourceKey}` });
  const publicKey = `captures/sketch/${date}.png`;
  await env.CAPTURES!.put(publicKey, await obj.arrayBuffer(), {
    httpMetadata: { contentType: obj.httpMetadata?.contentType ?? 'image/png' },
  });
  const img = `${base}/${publicKey}`;

  // ④ 글은 diaryText 갈래만 — 없으면 그림만, 캡션을 지어내지 않는다
  const text = (day.event.diaryText ?? '').trim();

  // 내부 feed에도 같은 게시물 (그림일기 아이콘)
  const now = Date.now();
  try {
    const feedRaw = await env.PLANET.get(FEED_KEY);
    const feed: unknown[] = feedRaw ? JSON.parse(feedRaw) : [];
    await env.PLANET.put(FEED_KEY, JSON.stringify([{
      id: `sketch-${now}`, t: now, title: '', text, img, icon: '🎨',
      likes: 0, comments: [],
    }, ...feed].slice(0, MAX_POSTS)));
  } catch { /* feed 실패가 발행을 막지 않는다 */ }

  const threads = await dispatchToThreads(env, text, img, false);

  // ⑥ 감사 기록 — 운영 로그 + 그림 발행 전용 로그(하루 1장 판정의 근거)
  await appendPublishLog(env, {
    invokedAt: now,
    result: threads.ok ? 'success' : 'threads_failed',
    httpStatus: 200,
    textIndex: null,
    imageKey: publicKey,
    threads: { attempted: threads.attempted, ok: threads.ok, errorCode: threads.errorCode, requestId: threads.requestId },
  }).catch(() => {});
  const record: SketchPubRecord = {
    date, at: now, ok: threads.ok, sourceKey, publicKey,
    memoryEventId: day.memoryEventId, withText: !!text, requestedBy,
    errorCode: threads.errorCode,
  };
  await env.PLANET.put(SKETCH_PUB_KEY, JSON.stringify([record, ...pubLog].slice(0, SKETCH_PUB_KEEP)));

  console.log(`ops/sketch-publish by=${requestedBy} date=${date} ok=${threads.ok} withText=${!!text}`);
  return json(200, {
    ok: threads.ok,
    date, memoryEventId: day.memoryEventId, img, withText: !!text,
    threads: { ok: threads.ok, errorCode: threads.errorCode, requestId: threads.requestId },
    note: threads.ok
      ? (text ? '그림일기가 글과 함께 나갔다.' : '그림만 나갔다 — 이 기억을 쓴 발행이 없어 글은 없다.')
      : `Threads 발행 실패 (${threads.errorCode}) — 공개 승격은 됐고, 재시도 가능 (하루 1장 판정은 성공만 센다).`,
  });
};
