// 그림일기 채택·발행 공통 계약.
// 수동 실험실 버튼과 밤 추천작 자동 발행이 반드시 같은 검증·하루 1장 영수증을 쓴다.

import { dispatchToThreads, type ThreadsEnv } from './_threads-client.ts';
import { appendPublishLog } from './_publish-log.ts';
import {
  attachBranch, memoryKey, validateDayMemory, type DayMemory,
} from './_memory-event.ts';
import { TRIAL_R2_PREFIX } from './_image-provider.ts';

export interface SketchPubRecord {
  date: string;
  at: number;
  ok: boolean;
  sourceKey: string;
  publicKey: string;
  memoryEventId: string;
  withText: boolean;
  requestedBy: string;
  errorCode: string | null;
}

export interface SketchPublishEnv extends ThreadsEnv {
  CAPTURES?: R2Bucket;
  CAPTURES_PUBLIC_BASE?: string;
}

export interface SketchPublishResult {
  ok: boolean;
  status: number;
  date: string;
  skipped?: 'already_published' | 'no_recommended_pick';
  error?: string;
  imageUrl?: string;
  imageKey?: string;
  withText?: boolean;
  threads?: { ok: boolean; errorCode: string | null; requestId: string | null };
}

interface DailyReco {
  status?: string;
  picks?: { seed?: number; r2Key?: string }[];
  reco?: { pick?: number | null; reasons?: string; verdicts?: string[] } | null;
}

const FEED_KEY = 'feed';
const MAX_POSTS = 60;
export const SKETCH_PUB_KEY = 'sketch_publish_log';
const SKETCH_PUB_KEEP = 60;

/** 같은 날짜의 성공 발행이 이미 있는가. 실패 기록은 상한을 소모하지 않는다. */
export function alreadyPublished(log: { date: string; ok: boolean }[], date: string): boolean {
  return log.some((record) => record.date === date && record.ok);
}

/** 판정기가 추천한 1장의 실제 R2 키. 전부 불합격·불완전 기록이면 null. */
export function recommendedSketchKey(value: unknown): string | null {
  if (!value || typeof value !== 'object') return null;
  const daily = value as DailyReco;
  if (daily.status !== 'done' || !Array.isArray(daily.picks)) return null;
  const pick = Number(daily.reco?.pick);
  if (!Number.isInteger(pick) || pick < 1 || pick > daily.picks.length) return null;
  const key = daily.picks[pick - 1]?.r2Key;
  return typeof key === 'string' && key.startsWith(TRIAL_R2_PREFIX) && !key.includes('..') ? key : null;
}

const parseLog = (raw: string | null): SketchPubRecord[] => {
  try { const value = raw ? JSON.parse(raw) : []; return Array.isArray(value) ? value : []; }
  catch { return []; }
};

function matchPublishedText(
  runs: { imageKey?: string | null; invokedAt?: number; threads?: { ok?: boolean } }[],
  feed: { text?: string; t?: number }[],
  photoKey: string | null,
): string | null {
  if (!photoKey) return null;
  const run = runs.find((entry) => entry.imageKey === photoKey && entry.threads?.ok);
  if (!run) return null;
  const post = feed.find((entry) => Math.abs((entry.t ?? 0) - (run.invokedAt ?? 0)) < 120_000);
  return post?.text?.trim() || null;
}

/** 추천작을 그날 기억의 그림 갈래에 붙인다. 사람이 이미 채택한 그림은 덮지 않는다. */
export async function adoptRecommendedSketch(
  env: SketchPublishEnv, date: string, reco: unknown,
): Promise<{ ok: boolean; sourceKey?: string; skipped?: 'no_recommended_pick'; error?: string }> {
  const dayRaw = await env.PLANET.get(memoryKey(date));
  if (!dayRaw) return { ok: false, error: `no_memory:${date}` };
  let day: DayMemory;
  try { day = JSON.parse(dayRaw) as DayMemory; } catch { return { ok: false, error: 'invalid_memory_json' }; }

  const sourceKey = day.event.sketchDiary || recommendedSketchKey(reco);
  if (!sourceKey) return { ok: true, skipped: 'no_recommended_pick' };
  if (!sourceKey.startsWith(TRIAL_R2_PREFIX) || sourceKey.includes('..')) return { ok: false, error: 'bad_sketch_key' };
  if (!env.CAPTURES || !(await env.CAPTURES.head(sourceKey))) return { ok: false, error: `sketch_missing:${sourceKey}` };

  if (!day.event.sketchDiary) day = attachBranch(day, 'sketchDiary', sourceKey);
  if (!day.event.selectedPhoto && day.photoKey) day = attachBranch(day, 'selectedPhoto', day.photoKey);
  if (!day.event.diaryText) {
    try {
      const [publishRaw, feedRaw] = await Promise.all([
        env.PLANET.get('publish_log'), env.PLANET.get(FEED_KEY),
      ]);
      const text = matchPublishedText(
        publishRaw ? JSON.parse(publishRaw) : [],
        feedRaw ? JSON.parse(feedRaw) : [],
        day.photoKey,
      );
      if (text) day = attachBranch(day, 'diaryText', text);
    } catch { /* 글 역추적 실패는 추천작 채택을 막지 않는다 */ }
  }

  const errors = validateDayMemory(day);
  if (errors.length) return { ok: false, error: `invalid_memory:${errors.join('|')}` };
  await env.PLANET.put(memoryKey(date), JSON.stringify(day));
  return { ok: true, sourceKey };
}

/** 이미 채택된 한 장을 공개 R2로 승격하고 Threads에 발행한다. */
export async function publishAdoptedSketch(
  env: SketchPublishEnv, date: string, requestedBy: string,
): Promise<SketchPublishResult> {
  const pubLog = parseLog(await env.PLANET.get(SKETCH_PUB_KEY));
  if (alreadyPublished(pubLog, date)) {
    return { ok: true, status: 200, date, skipped: 'already_published' };
  }
  const dayRaw = await env.PLANET.get(memoryKey(date));
  if (!dayRaw) return { ok: false, status: 404, date, error: `no_memory:${date}` };
  const day = JSON.parse(dayRaw) as DayMemory;
  const sourceKey = day.event.sketchDiary;
  if (!sourceKey) return { ok: false, status: 409, date, error: 'no_adopted_sketch' };
  if (!sourceKey.startsWith(TRIAL_R2_PREFIX) || sourceKey.includes('..')) {
    return { ok: false, status: 400, date, error: 'bad_sketch_key' };
  }

  const base = (env.CAPTURES_PUBLIC_BASE ?? '').replace(/\/$/, '');
  if (!base || !env.CAPTURES) return { ok: false, status: 500, date, error: 'captures_binding_missing' };
  const object = await env.CAPTURES.get(sourceKey);
  if (!object) return { ok: false, status: 404, date, error: `sketch_missing:${sourceKey}` };
  const publicKey = `captures/sketch/${date}.png`;
  await env.CAPTURES.put(publicKey, await object.arrayBuffer(), {
    httpMetadata: { contentType: object.httpMetadata?.contentType ?? 'image/png' },
  });
  const imageUrl = `${base}/${publicKey}`;
  const text = (day.event.diaryText ?? '').trim();
  const now = Date.now();
  const threads = await dispatchToThreads(env, text, imageUrl, false);

  await appendPublishLog(env, {
    invokedAt: now, scheduledFor: null,
    result: threads.ok ? 'success' : 'threads_failed', httpStatus: 200,
    textIndex: null, imageKey: publicKey,
    threads: { attempted: threads.attempted, ok: threads.ok, errorCode: threads.errorCode, requestId: threads.requestId },
    editorial: { source: 'schedule', action: 'post', targetPostId: null, reason: 'nightly sketch recommendation' },
  }).catch(() => {});

  const record: SketchPubRecord = {
    date, at: now, ok: threads.ok, sourceKey, publicKey,
    memoryEventId: day.memoryEventId, withText: !!text, requestedBy,
    errorCode: threads.errorCode,
  };
  await env.PLANET.put(SKETCH_PUB_KEY, JSON.stringify([record, ...pubLog].slice(0, SKETCH_PUB_KEEP)));

  if (threads.ok) {
    const feedRaw = await env.PLANET.get(FEED_KEY);
    let feed: unknown[] = [];
    try { feed = feedRaw ? JSON.parse(feedRaw) : []; } catch { feed = []; }
    await env.PLANET.put(FEED_KEY, JSON.stringify([{
      id: `sketch-${now}`, t: now, title: '', text, img: imageUrl, icon: '🎨',
      likes: 0, comments: [], lane: 'scheduled-sketch',
    }, ...feed].slice(0, MAX_POSTS)));
  }

  return {
    ok: threads.ok,
    status: threads.ok ? 200 : 502,
    date, imageUrl, imageKey: publicKey, withText: !!text,
    error: threads.ok ? undefined : `threads_failed:${threads.errorCode ?? 'unknown'}`,
    threads: { ok: threads.ok, errorCode: threads.errorCode, requestId: threads.requestId },
  };
}

/** 밤 판정 정본을 읽어 추천작 채택과 발행을 한 번에 수행한다. */
export async function autoPublishRecommendedSketch(
  env: SketchPublishEnv, date: string,
): Promise<SketchPublishResult> {
  const recoKey = `sketch_daily_reco:${date}`;
  const raw = await env.PLANET.get(recoKey);
  let reco: unknown = null;
  try { reco = raw ? JSON.parse(raw) : null; } catch { return { ok: false, status: 500, date, error: 'invalid_recommendation_json' }; }
  const adopted = await adoptRecommendedSketch(env, date, reco);
  let result: SketchPublishResult;
  if (adopted.skipped === 'no_recommended_pick') {
    result = { ok: true, status: 200, date, skipped: 'no_recommended_pick' };
  } else if (!adopted.ok) {
    result = { ok: false, status: 409, date, error: adopted.error ?? 'adoption_failed' };
  } else {
    result = await publishAdoptedSketch(env, date, 'nightly-recommendation');
  }
  if (reco && typeof reco === 'object') {
    await env.PLANET.put(recoKey, JSON.stringify({
      ...(reco as Record<string, unknown>),
      autoPublish: {
        at: Date.now(), ok: result.ok, skipped: result.skipped ?? null,
        imageKey: result.imageKey ?? null, error: result.error ?? null,
      },
    }));
  }
  return result;
}
