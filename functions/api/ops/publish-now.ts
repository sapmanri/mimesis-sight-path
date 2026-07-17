// BUILD 425-A+ — POST /api/ops/publish-now (Ops 호스트 전용 · Access 뒤)
// 콘솔 쓰기 예외 3호: 선택한 엽서로 지금 즉시 Threads 발행 (Vase 요청 2026-07-18).
//
// 크론 발행과 같은 파이프를 탄다: 문장 풀(최근 제외 랜덤) → 내부 feed →
// dispatchToThreads → publish_log(수동 실행은 scheduledFor=null → 콘솔 "(수동)" 표기).
// 자율 크론 경로는 무변경 — autopost의 export만 재사용한다. 감사: Access 이메일.

import byeolliPosts from '../byeolli_posts.json';
import { dispatchToThreads, type Env as AutopostEnv } from '../autopost';
import { appendPublishLog } from '../_publish-log';
import type { CaptureMeta } from './capture';

type Env = AutopostEnv;

const POSTS: { text: string }[] = (byeolliPosts as { posts: { text: string }[] }).posts;
const FEED_KEY = 'feed';
const RECENT_KEY = 'bot_recent';
const META_KEY = 'capture_meta';
const MAX_POSTS = 60;
const RECENT_KEEP = 25;

const JSON_HEADERS = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' };
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const requestedBy = request.headers.get('cf-access-authenticated-user-email') ?? 'unknown';
  let body: { captureId?: string };
  try { body = (await request.json()) as typeof body; } catch { return json(400, { ok: false, error: 'bad_json' }); }
  if (!body.captureId) return json(400, { ok: false, error: 'no_capture_id' });

  const metaRaw = await env.PLANET.get(META_KEY);
  const metas: CaptureMeta[] = metaRaw ? JSON.parse(metaRaw) : [];
  const meta = metas.find((m) => m.captureId === body.captureId);
  if (!meta) return json(404, { ok: false, error: 'capture_not_found' });
  const base = (env.CAPTURES_PUBLIC_BASE ?? '').replace(/\/$/, '');
  if (!base) return json(500, { ok: false, error: 'captures_base_missing' });
  const img = `${base}/${meta.r2Key}`;

  // 문장: 크론과 같은 규칙 — 최근 발행 인덱스 제외 랜덤
  const recentRaw = await env.PLANET.get(RECENT_KEY);
  const recent: number[] = recentRaw ? JSON.parse(recentRaw) : [];
  const recentSet = new Set(recent);
  let candidates = POSTS.map((_, i) => i).filter((i) => !recentSet.has(i));
  if (candidates.length === 0) candidates = POSTS.map((_, i) => i);
  const pick = candidates[Math.floor(Math.random() * candidates.length)];
  const chosen = POSTS[pick];

  const now = Date.now();
  const feedRaw = await env.PLANET.get(FEED_KEY);
  const feed: unknown[] = feedRaw ? JSON.parse(feedRaw) : [];
  await env.PLANET.put(FEED_KEY, JSON.stringify([{
    id: `bot-${now}`, t: now, title: '', text: chosen.text, img, icon: '🌏',
    likes: Math.floor(Math.random() * 12) + 1, comments: [],
  }, ...feed].slice(0, MAX_POSTS)));
  await env.PLANET.put(RECENT_KEY, JSON.stringify([pick, ...recent].slice(0, RECENT_KEEP)));

  const threads = await dispatchToThreads(env, chosen.text, img, false);

  await appendPublishLog(env, {
    invokedAt: now,
    result: threads.ok ? 'success' : 'threads_failed',
    httpStatus: 200,
    textIndex: pick,
    imageKey: meta.r2Key,
    threads: { attempted: threads.attempted, ok: threads.ok, errorCode: threads.errorCode, requestId: threads.requestId },
  }).catch(() => {});

  console.log(`ops/publish-now by=${requestedBy} capture=${meta.captureId} ok=${threads.ok}`);
  return json(200, { ok: true, textIndex: pick, threads: { ok: threads.ok, errorCode: threads.errorCode } });
};
