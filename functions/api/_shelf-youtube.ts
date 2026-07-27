// 서가 — YouTube (Vase 판정 2026-07-27: "YouTube로 하자. 스포티파이 언제 풀릴지 모른다")
//
// 서가는 **음원을 확인하고 재생목록을 만드는 곳**이지 음악을 발견하는 두뇌가 아니다.
// 그래서 이 파일은 얇다. 고르는 규칙은 전부 `_shelf-match.ts`에 있고 서가에 매이지 않는다 —
// Spotify가 풀리면 이 파일만 새로 쓰고 나머지는 그대로 둔다.
//
// ⚠ **하루 `search.list` 100회**가 진짜 한도다(유닛 10,000과 별개인 자체 한도).
//   그래서 한 곡에 검색을 한 번만 쓴다. 후보를 여러 개 받아 `videos.list`(1유닛)로
//   자세히 본 뒤 고른다 — 검색을 두 번 하는 대신 싼 조회를 한 번 더 하는 쪽이다.
//
// ⚠ `search.list`는 **러닝타임을 주지 않는다.** 길이가 없으면 '한 시간짜리 전곡 모음'을
//   못 거른다. 그래서 videos.list가 선택이 아니라 필수다.
//
// 재생목록 만들기는 OAuth(사용자 승인)가 필요하다. 확인만 하는 데는 API 키로 충분하므로
// 이 파일은 **확인까지만** 한다. 담는 것은 승인을 받은 뒤에 붙인다.

import { pickBest, type ShelfCandidate, type ShelfQuery, type MatchResult } from './_shelf-match.ts';

const API = 'https://www.googleapis.com/youtube/v3';
/** 음악 카테고리. 검색을 음악으로 좁혀 리액션·강좌가 덜 들어오게 한다. */
const MUSIC_CATEGORY = '10';
const SEARCH_MAX = 8;

export type FetchLike = (url: string) => Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>;

export interface YoutubeEnv {
  YOUTUBE_API_KEY?: string;
  /** 시험에서 갈아끼운다. 없으면 진짜 fetch. */
  _fetch?: FetchLike;
}

/** ISO 8601 재생시간(PT4M13S) → 초. 못 읽으면 null — 0으로 두면 '길이 0인 곡'이 된다. */
export function parseDuration(iso: string): number | null {
  const m = /^P(?:(\d+)D)?T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(String(iso || ''));
  if (!m) return null;
  const [, d, h, mi, s] = m;
  const total = (+(d || 0)) * 86400 + (+(h || 0)) * 3600 + (+(mi || 0)) * 60 + (+(s || 0));
  return total > 0 ? total : null;
}

/** 검색어 — 서가에서는 별이의 문장이 아니라 **정확한 이름**으로 찾는다.
    발견은 이미 끝났고 여기서는 그 녹음이 있는지만 확인한다. */
export const shelfQueryText = (q: ShelfQuery) =>
  [q.artist, q.title, q.want === 'live' ? 'live' : 'audio'].filter(Boolean).join(' ');

interface SearchItem { id?: { videoId?: string }; snippet?: { title?: string; channelTitle?: string } }
interface VideoItem {
  id?: string;
  snippet?: { title?: string; channelTitle?: string };
  contentDetails?: { duration?: string };
  status?: { privacyStatus?: string; embeddable?: boolean };
}

/**
 * 한 곡을 서가에서 확인한다. 검색 1회 + 상세 조회 1회.
 * 못 찾으면 `best: null` — **억지로 담지 않는다.**
 */
export async function verifyOnYoutube(
  env: YoutubeEnv, q: ShelfQuery,
): Promise<{ best: MatchResult | null; all: MatchResult[]; cost: { search: number; videos: number }; error: string | null }> {
  const key = env.YOUTUBE_API_KEY;
  const doFetch = env._fetch ?? ((u: string) => fetch(u));
  const cost = { search: 0, videos: 0 };
  if (!key) return { best: null, all: [], cost, error: 'no_api_key' };

  const su = `${API}/search?part=snippet&type=video&videoCategoryId=${MUSIC_CATEGORY}`
    + `&maxResults=${SEARCH_MAX}&q=${encodeURIComponent(shelfQueryText(q))}&key=${key}`;
  let ids: string[] = [];
  try {
    const r = await doFetch(su);
    cost.search = 1;
    if (!r.ok) return { best: null, all: [], cost, error: `search_${r.status}` };
    const j = (await r.json()) as { items?: SearchItem[] };
    ids = (j.items ?? []).map((i) => i.id?.videoId).filter((x): x is string => !!x);
  } catch (e) {
    return { best: null, all: [], cost, error: `search_failed: ${(e as Error).message}` };
  }
  if (!ids.length) return { best: null, all: [], cost, error: null };

  // ⚠ 여기가 필수다 — search는 러닝타임을 안 준다. 길이 없이는 전곡 모음을 못 거른다.
  let vids: VideoItem[] = [];
  try {
    const vu = `${API}/videos?part=snippet,contentDetails,status&id=${ids.join(',')}&key=${key}`;
    const r = await doFetch(vu);
    cost.videos = 1;
    if (!r.ok) return { best: null, all: [], cost, error: `videos_${r.status}` };
    vids = ((await r.json()) as { items?: VideoItem[] }).items ?? [];
  } catch (e) {
    return { best: null, all: [], cost, error: `videos_failed: ${(e as Error).message}` };
  }

  const cands: ShelfCandidate[] = vids
    // 남의 사이트에 못 붙거나 비공개인 것은 서가에 있다고 할 수 없다
    .filter((v) => v.status?.embeddable !== false && v.status?.privacyStatus !== 'private')
    .map((v) => ({
      id: v.id ?? '',
      title: v.snippet?.title ?? '',
      channel: v.snippet?.channelTitle ?? '',
      durationSec: parseDuration(v.contentDetails?.duration ?? ''),
    }))
    .filter((c) => c.id);

  return { ...pickBest(q, cands), cost, error: null };
}

export const watchUrl = (id: string) => `https://www.youtube.com/watch?v=${id}`;

/** 여러 곡을 한 번에 확인한다. **하루 검색 한도를 넘지 않게 상한을 둔다.**
    (넘겨야 할 곡이 많으면 확인 못 한 것을 `skipped`로 정직하게 돌려준다) */
export const DAILY_SEARCH_BUDGET = 100;

export async function verifyMany(
  env: YoutubeEnv, qs: ShelfQuery[], budget = 20,
): Promise<{ results: Array<{ q: ShelfQuery; best: MatchResult | null; error: string | null }>;
             skipped: ShelfQuery[]; used: { search: number; videos: number } }> {
  const results: Array<{ q: ShelfQuery; best: MatchResult | null; error: string | null }> = [];
  const used = { search: 0, videos: 0 };
  const skipped: ShelfQuery[] = [];

  for (const q of qs) {
    if (used.search >= budget) { skipped.push(q); continue; }
    const r = await verifyOnYoutube(env, q);
    used.search += r.cost.search;
    used.videos += r.cost.videos;
    results.push({ q, best: r.best, error: r.error });
  }
  return { results, skipped, used };
}
