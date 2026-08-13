// GET: 별이가 볼 수 있는 자기 Threads·감성찾아삽만리 YouTube 공개 선반과 마지막 갱신 영수증.
// POST: X-Pulse-Key로 공식 API를 다시 읽어 선반을 갱신한다. 게시·댓글 쓰기는 여기서 하지 않는다.

import { refreshThreadsShelf, refreshYoutubeShelf, type RadioSocialEnv } from '../_radio-social';
import {
  THREADS_RECEIPT_KEY, THREADS_SHELF_KEY, YOUTUBE_RECEIPT_KEY, YOUTUBE_SHELF_KEY,
} from '../_radio-social-types';

interface Env extends RadioSocialEnv { PULSE_KEY?: string }
const FRESH_MS = 30 * 60 * 1000;
const HEADERS = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' };
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: HEADERS });

export const onRequestGet: PagesFunction<Env> = async ({ env }) => {
  const [threads, youtube, threadsReceipt, youtubeReceipt] = await Promise.all([
    env.PLANET.get(THREADS_SHELF_KEY, 'json'),
    env.PLANET.get(YOUTUBE_SHELF_KEY, 'json'),
    env.PLANET.get(THREADS_RECEIPT_KEY, 'json'),
    env.PLANET.get(YOUTUBE_RECEIPT_KEY, 'json'),
  ]);
  return json(200, { ok: true, threads, youtube, receipts: { threads: threadsReceipt, youtube: youtubeReceipt } });
};

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  if (!env.PULSE_KEY) return json(500, { ok: false, error: 'PULSE_KEY not configured' });
  if (request.headers.get('X-Pulse-Key') !== env.PULSE_KEY) return json(403, { ok: false, error: 'forbidden' });
  let source = 'all';
  try { source = String(((await request.json()) as { source?: string }).source ?? 'all'); } catch { /* 빈 본문 허용 */ }
  if (!['all', 'threads', 'youtube'].includes(source)) return json(400, { ok: false, error: 'bad_source' });
  const [threadsRaw, youtubeRaw] = await Promise.all([
    env.PLANET.get(THREADS_RECEIPT_KEY, 'json'), env.PLANET.get(YOUTUBE_RECEIPT_KEY, 'json'),
  ]) as [null | { at?: number; ok?: boolean }, null | { at?: number; ok?: boolean }];
  const fresh = (receipt: null | { at?: number; ok?: boolean }) =>
    receipt?.ok === true && Date.now() - Number(receipt.at ?? 0) < FRESH_MS;
  const wantsThreads = source === 'all' || source === 'threads';
  const wantsYoutube = source === 'all' || source === 'youtube';
  const threads = wantsThreads
    ? (fresh(threadsRaw) ? { ...threadsRaw, skipped: 'fresh' } : await refreshThreadsShelf(env))
    : null;
  const youtube = wantsYoutube
    ? (fresh(youtubeRaw) ? { ...youtubeRaw, skipped: 'fresh' } : await refreshYoutubeShelf(env))
    : null;
  return json(200, { ok: (!threads || threads.ok) && (!youtube || youtube.ok), threads, youtube, freshnessMs: FRESH_MS });
};
