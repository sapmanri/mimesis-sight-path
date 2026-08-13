// 별이가 선택적으로 참고하는 자기 Threads와 감성찾아삽만리 YouTube 선반.
// 읽기는 각 플랫폼의 공식 API만 사용한다. 실패하면 기존 선반을 지우지 않고 영수증만 갱신한다.

import { getThreadsAuth, type ThreadsEnv } from './_threads-client.ts';
import {
  THREADS_RECEIPT_KEY, THREADS_SHELF_KEY, YOUTUBE_RECEIPT_KEY, YOUTUBE_SHELF_KEY,
  type SocialRefreshReceipt, type ThreadsShelf, type YoutubeShelf,
} from './_radio-social-types.ts';

const THREADS_API = 'https://graph.threads.net/v1.0';
const YOUTUBE_API = 'https://www.googleapis.com/youtube/v3';

export interface RadioSocialEnv extends ThreadsEnv {
  YOUTUBE_API_KEY?: string;
  BYEOLI_THREADS_HANDLE?: string;
  BYEOLI_YOUTUBE_HANDLE?: string;
}

const handle = (value: string) => value.trim().replace(/^@/, '').toLowerCase();

interface ThreadsPage<T> {
  data?: T[];
  paging?: { next?: string };
  error?: { code?: number };
}

/**
 * 자기 계정 글을 임의 개수로 자르지 않는다. Meta가 주는 다음 페이지를 끝까지 읽되,
 * 같은 next URL이 되풀이되면 멈춰 API 이상으로 인한 무한 순환만 차단한다.
 */
async function collectThreadsPages<T>(first: URL): Promise<T[]> {
  const rows: T[] = [];
  const seen = new Set<string>();
  let next: string | null = first.toString();
  while (next && !seen.has(next)) {
    seen.add(next);
    const url = new URL(next);
    if (url.protocol !== 'https:' || url.hostname !== 'graph.threads.net') {
      throw new Error('posts_paging_host_invalid');
    }
    const response = await fetch(url.toString());
    const payload = await response.json() as ThreadsPage<T>;
    if (!response.ok) throw new Error(`posts_${payload.error?.code ?? response.status}`);
    rows.push(...(payload.data ?? []));
    next = typeof payload.paging?.next === 'string' && payload.paging.next
      ? payload.paging.next
      : null;
  }
  return rows;
}

async function saveReceipt(env: RadioSocialEnv, key: string, receipt: SocialRefreshReceipt) {
  await env.PLANET.put(key, JSON.stringify(receipt));
  return receipt;
}

export async function refreshThreadsShelf(env: RadioSocialEnv): Promise<SocialRefreshReceipt> {
  const at = Date.now();
  const expected = handle(env.BYEOLI_THREADS_HANDLE ?? 'byeoli_log');
  const auth = await getThreadsAuth(env);
  if (!auth) return saveReceipt(env, THREADS_RECEIPT_KEY, {
    at, ok: false, source: 'threads', count: 0, account: null, error: 'auth_missing',
  });
  try {
    const meUrl = new URL(`${THREADS_API}/me`);
    meUrl.searchParams.set('fields', 'id,username');
    meUrl.searchParams.set('access_token', auth.token);
    const meRes = await fetch(meUrl.toString());
    const me = (await meRes.json()) as { id?: string; username?: string; error?: { code?: number } };
    if (!meRes.ok || !me.id || !me.username) throw new Error(`profile_${me.error?.code ?? meRes.status}`);
    const actual = handle(me.username);
    if (actual !== expected) {
      return saveReceipt(env, THREADS_RECEIPT_KEY, {
        at, ok: false, source: 'threads', count: 0, account: `@${actual}`,
        error: `account_mismatch_expected_@${expected}`,
      });
    }

    const postsUrl = new URL(`${THREADS_API}/me/threads`);
    postsUrl.searchParams.set('fields', 'id,text,timestamp,permalink,media_type,is_reply');
    postsUrl.searchParams.set('limit', '100');
    postsUrl.searchParams.set('access_token', auth.token);
    const allPosts = await collectThreadsPages<{
      id?: string; text?: string; timestamp?: string; permalink?: string; is_reply?: boolean;
    }>(postsUrl);
    const posts = allPosts.filter((p) => p.id && p.text).map((p) => ({
      id: p.id!, text: p.text!.slice(0, 500), timestamp: p.timestamp ?? '',
      permalink: p.permalink ?? '', isReply: p.is_reply === true,
    }));
    const shelf: ThreadsShelf = {
      username: `@${actual}`,
      profileUrl: `https://www.threads.com/@${actual}`,
      refreshedAt: at,
      posts,
    };
    await env.PLANET.put(THREADS_SHELF_KEY, JSON.stringify(shelf));
    return saveReceipt(env, THREADS_RECEIPT_KEY, {
      at, ok: true, source: 'threads', count: posts.length, account: shelf.username, error: null,
    });
  } catch (error) {
    return saveReceipt(env, THREADS_RECEIPT_KEY, {
      at, ok: false, source: 'threads', count: 0, account: null,
      error: error instanceof Error ? error.message.slice(0, 120) : 'threads_refresh_failed',
    });
  }
}

export async function refreshYoutubeShelf(env: RadioSocialEnv): Promise<SocialRefreshReceipt> {
  const at = Date.now();
  const requested = env.BYEOLI_YOUTUBE_HANDLE ?? '@sapmanri';
  const normalized = requested.startsWith('@') ? requested : `@${requested}`;
  if (!env.YOUTUBE_API_KEY) return saveReceipt(env, YOUTUBE_RECEIPT_KEY, {
    at, ok: false, source: 'youtube', count: 0, account: normalized, error: 'no_api_key',
  });
  try {
    const channelUrl = new URL(`${YOUTUBE_API}/channels`);
    channelUrl.searchParams.set('part', 'snippet,contentDetails');
    channelUrl.searchParams.set('forHandle', normalized);
    channelUrl.searchParams.set('key', env.YOUTUBE_API_KEY);
    const channelRes = await fetch(channelUrl.toString());
    const channels = (await channelRes.json()) as {
      items?: Array<{ id?: string; snippet?: { title?: string }; contentDetails?: { relatedPlaylists?: { uploads?: string } } }>;
      error?: { code?: number };
    };
    const channel = channels.items?.[0];
    const channelId = channel?.id;
    const uploads = channel?.contentDetails?.relatedPlaylists?.uploads;
    if (!channelRes.ok || !channelId || !uploads) throw new Error(`channel_${channels.error?.code ?? channelRes.status}`);

    // search.list를 쓰지 않는다. 채널의 uploads 재생목록은 playlistItems.list로 1유닛에 읽힌다.
    const listUrl = new URL(`${YOUTUBE_API}/playlistItems`);
    listUrl.searchParams.set('part', 'snippet,contentDetails');
    listUrl.searchParams.set('playlistId', uploads);
    listUrl.searchParams.set('maxResults', '10');
    listUrl.searchParams.set('key', env.YOUTUBE_API_KEY);
    const listRes = await fetch(listUrl.toString());
    const list = (await listRes.json()) as {
      items?: Array<{
        snippet?: { title?: string; description?: string; publishedAt?: string; thumbnails?: { medium?: { url?: string }; default?: { url?: string } } };
        contentDetails?: { videoId?: string; videoPublishedAt?: string };
      }>;
      error?: { code?: number };
    };
    if (!listRes.ok) throw new Error(`videos_${list.error?.code ?? listRes.status}`);
    const videos = (list.items ?? []).filter((v) => v.contentDetails?.videoId).map((v) => {
      const id = v.contentDetails!.videoId!;
      return {
        id,
        title: (v.snippet?.title ?? '').slice(0, 160),
        description: (v.snippet?.description ?? '').slice(0, 800),
        publishedAt: v.contentDetails?.videoPublishedAt ?? v.snippet?.publishedAt ?? '',
        url: `https://www.youtube.com/watch?v=${id}`,
        thumbnail: v.snippet?.thumbnails?.medium?.url ?? v.snippet?.thumbnails?.default?.url ?? null,
      };
    });
    const shelf: YoutubeShelf = {
      handle: normalized,
      channelId,
      channelTitle: channel.snippet?.title ?? '감성찾아삽만리',
      channelUrl: `https://www.youtube.com/${normalized}`,
      refreshedAt: at,
      videos,
    };
    await env.PLANET.put(YOUTUBE_SHELF_KEY, JSON.stringify(shelf));
    return saveReceipt(env, YOUTUBE_RECEIPT_KEY, {
      at, ok: true, source: 'youtube', count: videos.length, account: normalized, error: null,
    });
  } catch (error) {
    return saveReceipt(env, YOUTUBE_RECEIPT_KEY, {
      at, ok: false, source: 'youtube', count: 0, account: normalized,
      error: error instanceof Error ? error.message.slice(0, 120) : 'youtube_refresh_failed',
    });
  }
}
