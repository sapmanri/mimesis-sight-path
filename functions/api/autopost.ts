// 예약 미디어 발행선.
//
// 별이가 자유롭게 글·댓글·침묵을 고르는 Social Director와는 별개다. 이 경로는 오래전부터
// 약속된 08·18·22 KST 스크린샷/엽서 게시만 복구한다. Worker가 의도한 슬롯을 명시하고,
// 슬롯 영수증이 성공한 게시를 중복 실행하지 않게 막는다.

import byeolliPosts from './byeolli_posts.json';
import { dispatchToThreads, type ThreadsEnv } from './_threads-client.ts';
import { writeByeoliPost } from './_byeoli-writer.ts';
import {
  appendPublishLog, hasSuccessfulRun, publishLogConfig, readSlotReceipt,
  validateSlotIso, writeSlotReceipt, type PublishLogRecord,
} from './_publish-log.ts';
import { appendCaptureMeta, observationIdOf } from './_capture-meta.ts';
import { kstDate, stashPendingDiary } from './_memory-event.ts';

interface Env extends ThreadsEnv {
  PUBLISH_KEY?: string;
  CAPTURES?: R2Bucket;
  CAPTURES_PUBLIC_BASE?: string;
  ANTHROPIC_API_KEY?: string;
}

interface CaptureMeta {
  captureId?: string;
  r2Key: string;
  capturedAt?: number;
  skyPhase?: string | null;
  weather?: string | null;
  byeoliAction?: string | null;
  targetLabel?: string | null;
  diaryLines?: string[];
}

const POSTS: { text: string }[] = (byeolliPosts as { posts: { text: string }[] }).posts;
const FEED_KEY = 'feed';
const RECENT_KEY = 'bot_recent';
const META_KEY = 'capture_meta';
const MAX_POSTS = 60;
const RECENT_KEEP = 25;
const STATIC_WALKS = Array.from({ length: 8 }, (_, i) =>
  `https://mimesis-sight-path.pages.dev/byeolli/walk${String(i + 1).padStart(2, '0')}.jpg`);
const HEADERS = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' };
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: HEADERS });

const parseArray = <T>(raw: string | null): T[] => {
  try { const value = raw ? JSON.parse(raw) : []; return Array.isArray(value) ? value as T[] : []; }
  catch { return []; }
};

const imageKeyOf = (url: string | null): string | null => {
  if (!url) return null;
  const captures = url.match(/captures\/[^?#]+/)?.[0];
  if (captures) return captures;
  try { return new URL(url).pathname.replace(/^\//, '') || null; } catch { return null; }
};

async function chooseImage(env: Env, logs: PublishLogRecord[]): Promise<{
  url: string; key: string | null; meta: CaptureMeta | null;
}> {
  const base = (env.CAPTURES_PUBLIC_BASE ?? '').replace(/\/$/, '');
  const used = new Set(logs.filter((r) => r.result === 'success' && r.imageKey).slice(0, 18).map((r) => r.imageKey));
  const metas = parseArray<CaptureMeta>(await env.PLANET.get(META_KEY));
  const recent = metas
    .filter((m) => typeof m?.r2Key === 'string' && m.r2Key.startsWith('captures/') && !m.r2Key.startsWith('captures/sketch/'))
    .sort((a, b) => Number(b.capturedAt ?? 0) - Number(a.capturedAt ?? 0));
  const fresh = recent.filter((m) => !used.has(m.r2Key));
  const candidates = (fresh.length ? fresh : recent).slice(0, 40);
  if (base && candidates.length) {
    // 최신 40장 안에서만 섞는다. 오래된 정적 엽서로 계속 되돌아가지 않게 한다.
    const start = Math.floor(Math.random() * candidates.length);
    for (let i = 0; i < candidates.length; i += 1) {
      const meta = candidates[(start + i) % candidates.length];
      if (!env.CAPTURES || await env.CAPTURES.head(meta.r2Key).catch(() => null)) {
        return { url: `${base}/${meta.r2Key}`, key: meta.r2Key, meta };
      }
    }
  }

  // 메타가 유실됐어도 R2에 남아 있는 walk/관측소 캡처는 발행 후보로 살린다.
  if (base && env.CAPTURES) {
    const listed = await env.CAPTURES.list({ prefix: 'captures/', limit: 200 }).catch(() => null);
    const keys = (listed?.objects ?? [])
      .map((o) => o.key)
      .filter((key) => !key.startsWith('captures/sketch/') && !used.has(key))
      .sort().reverse();
    if (keys.length) {
      const key = keys[Math.floor(Math.random() * Math.min(keys.length, 40))];
      return { url: `${base}/${key}`, key, meta: null };
    }
  }

  const url = STATIC_WALKS[Math.floor(Math.random() * STATIC_WALKS.length)];
  return { url, key: imageKeyOf(url), meta: null };
}

async function duplicateResponse(env: Env, slot: string, priorAt: number) {
  await appendPublishLog(env, {
    invokedAt: Date.now(), scheduledFor: slot, result: 'slot_duplicate', httpStatus: 200,
    textIndex: null, imageKey: null,
    threads: { attempted: false, ok: false, errorCode: null, requestId: null },
    editorial: { source: 'schedule', reason: 'screenshot slot already published' },
  }).catch(() => {});
  return json(200, { ok: true, skipped: 'slot_already_published', slot, publishedAt: priorAt });
}

export const onRequestGet: PagesFunction<Env> = async () => json(200, {
  ok: true,
  lane: 'scheduled_screenshot_media',
  scheduleKst: [...publishLogConfig.SLOT_HOURS_KST],
  autonomy: 'unchanged',
});

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  if (!env.PUBLISH_KEY) return json(503, { ok: false, error: 'publish_key_missing' });
  if (request.headers.get('X-Publish-Key') !== env.PUBLISH_KEY) return json(401, { ok: false, error: 'unauthorized' });

  const invokedAt = Date.now();
  const requestedSlot = new URL(request.url).searchParams.get('scheduledFor') ?? '';
  const slot = validateSlotIso(requestedSlot, invokedAt);
  if (!slot) return json(400, { ok: false, error: 'bad_scheduled_for', got: requestedSlot });

  const [receipt, rawLog] = await Promise.all([
    readSlotReceipt(env, slot).catch(() => null),
    env.PLANET.get(publishLogConfig.LOG_KEY),
  ]);
  const logs = parseArray<PublishLogRecord>(rawLog);
  if (receipt) return duplicateResponse(env, slot, receipt.at);
  if (hasSuccessfulRun(logs, slot)) return duplicateResponse(env, slot, 0);

  const recent = parseArray<number>(await env.PLANET.get(RECENT_KEY));
  const recentSet = new Set(recent);
  let textCandidates = POSTS.map((_, i) => i).filter((i) => !recentSet.has(i));
  if (!textCandidates.length) textCandidates = POSTS.map((_, i) => i);
  const pick = textCandidates[Math.floor(Math.random() * textCandidates.length)];
  const image = await chooseImage(env, logs);

  const feed = parseArray<{ text?: unknown }>(await env.PLANET.get(FEED_KEY));
  let text = POSTS[pick].text;
  let textIndex: number | null = pick;
  if (image.meta) {
    const written = await writeByeoliPost(env, {
      targetLabel: image.meta.targetLabel ?? null,
      byeoliAction: image.meta.byeoliAction ?? null,
      skyPhase: image.meta.skyPhase ?? null,
      weather: image.meta.weather ?? null,
      diaryLines: Array.isArray(image.meta.diaryLines) ? image.meta.diaryLines : [],
      recentTexts: feed.slice(0, 5).map((p) => typeof p.text === 'string' ? p.text : '').filter(Boolean),
    });
    if (written?.text) { text = written.text; textIndex = null; }
  }

  const threads = await dispatchToThreads(env, text, image.url, false);
  await appendPublishLog(env, {
    invokedAt, scheduledFor: slot,
    result: threads.ok ? 'success' : 'threads_failed', httpStatus: 200,
    textIndex, imageKey: image.key,
    threads: { attempted: threads.attempted, ok: threads.ok, errorCode: threads.errorCode, requestId: threads.requestId },
    editorial: { source: 'schedule', reason: 'three-times-daily screenshot lane' },
  }).catch(() => {});

  if (!threads.ok) {
    return json(502, { ok: false, slot, error: 'threads_failed', errorCode: threads.errorCode });
  }

  const now = Date.now();
  const healed = feed.map((post) => {
    const value = post.text;
    return value && typeof value === 'object' && typeof (value as { text?: unknown }).text === 'string'
      ? { ...post, text: (value as { text: string }).text }
      : post;
  });
  await Promise.all([
    env.PLANET.put(FEED_KEY, JSON.stringify([{
      id: `scheduled-media-${now}`, t: now, title: '', text, img: image.url, icon: '🌏',
      likes: 0, comments: [], lane: 'scheduled-screenshot',
    }, ...healed].slice(0, MAX_POSTS))),
    textIndex === null
      ? Promise.resolve()
      : env.PLANET.put(RECENT_KEY, JSON.stringify([pick, ...recent].slice(0, RECENT_KEEP))),
    writeSlotReceipt(env, { slot, at: now, textIndex }),
    stashPendingDiary(env, kstDate(Date.parse(slot)), { at: now, imageKey: image.key, text }).catch(() => {}),
  ]);

  if (image.meta) {
    const runId = `scheduled_media_${slot}`;
    await appendCaptureMeta(env, {
      captureId: `auto_${now}`,
      observationId: observationIdOf('autopost', runId, image.meta.captureId ?? image.key, now),
      source: 'autopost', sourceRunId: runId, observedAt: now,
      r2Key: image.key, photoKey: image.key,
      skyPhase: image.meta.skyPhase ?? null, weather: image.meta.weather ?? null,
      byeoliAction: image.meta.byeoliAction ?? null,
      targetId: null, targetType: null, targetLabel: image.meta.targetLabel ?? null,
      diaryLines: image.meta.diaryLines ?? [], uploadedBy: null, uploadedAt: now,
    }).catch(() => null);
  }

  return json(200, {
    ok: true, slot, lane: 'scheduled_screenshot_media', imageKey: image.key,
    generated: textIndex === null, threads: { ok: true, requestId: threads.requestId },
  });
};
