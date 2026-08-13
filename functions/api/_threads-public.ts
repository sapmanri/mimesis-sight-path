// 별이가 Crawl4AI로 실제 읽은 외부 Threads 글을 Meta의 실제 reply_to_id와 대조한다.
// 이 파일은 외부 계정으로 쓰지 않는다. 반환한 ID도 @byeoli_log가 자기 이름으로 댓글을
// 남길지 판단할 때만 사용한다.

import { getThreadsAuth, type ThreadsEnv } from './_threads-client.ts';
import { TOON_HANDLE, type ToonShelf } from './_radio-toon.ts';

const THREADS_API = 'https://graph.threads.net/v1.0';

export interface ExternalCommentTarget {
  id: string;
  text: string;
  timestamp: string;
  permalink: string;
  username: string;
}

export interface ExternalTargetReceipt {
  ok: boolean;
  count: number;
  account: string;
  error: string | null;
}

interface Page<T> {
  data?: T[];
  paging?: { next?: string };
  error?: { code?: number; message?: string };
}

function postCode(value: string): string | null {
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase().replace(/^www\./, '');
    const match = url.pathname.replace(/\/+$/, '').match(/^\/@([^/]+)\/post\/([A-Za-z0-9_-]{5,80})$/);
    if (url.protocol !== 'https:' || !['threads.com', 'threads.net'].includes(host) || !match) return null;
    if (match[1].toLowerCase() !== TOON_HANDLE) return null;
    return match[2];
  } catch { return null; }
}

async function collect<T>(first: URL): Promise<T[]> {
  const rows: T[] = [];
  const seen = new Set<string>();
  let next: string | null = first.toString();
  while (next && !seen.has(next)) {
    seen.add(next);
    const url = new URL(next);
    if (url.protocol !== 'https:' || url.hostname !== 'graph.threads.net') {
      throw new Error('profile_posts_paging_host_invalid');
    }
    const response = await fetch(url.toString());
    const payload = await response.json() as Page<T>;
    if (!response.ok) {
      throw new Error(`profile_posts_${payload.error?.code ?? response.status}`);
    }
    rows.push(...(payload.data ?? []));
    next = typeof payload.paging?.next === 'string' && payload.paging.next
      ? payload.paging.next
      : null;
  }
  return rows;
}

/**
 * 읽은 링크와 Meta 실제 permalink의 shortcode가 같을 때만 댓글 대상으로 돌려준다.
 * profile discovery 권한이 없으면 빈 성공으로 꾸미지 않고 실패 영수증을 반환한다.
 */
export async function resolveObservedExternalTargets(
  env: ThreadsEnv, shelf: ToonShelf | null,
): Promise<{ receipt: ExternalTargetReceipt; targets: ExternalCommentTarget[] }> {
  const account = `@${TOON_HANDLE}`;
  if (!shelf?.posts?.length) {
    return { receipt: { ok: true, count: 0, account, error: null }, targets: [] };
  }
  const auth = await getThreadsAuth(env);
  if (!auth) {
    return {
      receipt: { ok: false, count: 0, account, error: 'auth_or_account_mismatch' }, targets: [],
    };
  }
  try {
    const url = new URL(`${THREADS_API}/profile_posts`);
    url.searchParams.set('username', TOON_HANDLE);
    url.searchParams.set('fields', 'id,text,timestamp,permalink,username,is_reply');
    url.searchParams.set('limit', '100');
    url.searchParams.set('access_token', auth.token);
    const rows = await collect<{
      id?: string; text?: string; timestamp?: string; permalink?: string;
      username?: string; is_reply?: boolean;
    }>(url);
    const observed = new Set(shelf.posts.map((post) => postCode(post.permalink)).filter(Boolean));
    const targets = rows.filter((row) => {
      const code = postCode(row.permalink ?? '');
      return !!row.id && !!row.text && row.is_reply !== true
        && String(row.username ?? '').replace(/^@/, '').toLowerCase() === TOON_HANDLE
        && !!code && observed.has(code);
    }).map((row) => ({
      id: row.id!, text: row.text!.slice(0, 500), timestamp: row.timestamp ?? '',
      permalink: row.permalink!, username: `@${TOON_HANDLE}`,
    }));
    return { receipt: { ok: true, count: targets.length, account, error: null }, targets };
  } catch (error) {
    return {
      receipt: {
        ok: false, count: 0, account,
        error: error instanceof Error ? error.message.slice(0, 160) : 'profile_posts_failed',
      },
      targets: [],
    };
  }
}

export const threadsPublicInternals = { postCode };
