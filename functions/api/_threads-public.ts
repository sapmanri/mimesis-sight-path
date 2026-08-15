// 외부 Threads 댓글 대상 해석기의 폐기 호환 껍데기.
// @byeol.toon은 별이가 직접 그리는 자기 웹툰이 연재되는 곳이지만 계정 접근은 읽기 전용이다.
// 과거에는 @byeoli_log 이름으로 댓글을 달 후보 ID를 만들었으나, 현재 계약은 읽기만 허용한다.
// 옛 호출부가 남아도 쓰기 후보가 되살아나지 않도록 항상 빈 대상만 반환한다.

import type { ThreadsEnv } from './_threads-client.ts';
import { TOON_HANDLE, type ToonShelf } from './_radio-toon.ts';

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
  mode?: 'read_only';
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

/**
 * 2026-08-15 계약: 외부 글은 댓글 대상으로 돌려주지 않는다.
 * 매개변수는 과거 호출부와의 소스 호환을 위해서만 남아 있다.
 */
export async function resolveObservedExternalTargets(
  _env: ThreadsEnv, _shelf: ToonShelf | null,
): Promise<{ receipt: ExternalTargetReceipt; targets: ExternalCommentTarget[] }> {
  const account = `@${TOON_HANDLE}`;
  return {
    receipt: { ok: true, count: 0, account, error: null, mode: 'read_only' },
    targets: [],
  };
}

export const threadsPublicInternals = { postCode };
