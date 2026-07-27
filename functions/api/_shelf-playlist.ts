// 서가에 담기 — YouTube 재생목록 (Vase 승인 2026-07-27)
//
// `_shelf-youtube.ts`는 **있는지 확인**만 한다(API 키로 충분). 이 파일은 **담는다** —
// 남의 계정에 쓰는 일이라 사용자 승인(OAuth)이 필요하고, 그래서 파일이 갈라져 있다.
//
// ⚠ 하루에 재생목록 하나. 별이한테 하루는 하나의 장면이고, 스레드에 링크를 걸 때도
//   그날 것만 가리키는 게 맞다. (한 곳에 쌓으면 "오늘"이 사라진다)
//
// ⚠ **비용은 확인보다 담는 쪽이 훨씬 비싸다.**
//     playlists.insert = 50 유닛 · playlistItems.insert = 50 유닛 (하루 10,000)
//   곡 5개면 50 + 250 = 300. 넉넉하지만, 실패한 걸 재시도로 갈아넣으면 금방 탄다.
//   그래서 실패는 재시도하지 않고 **영수증에 남기고 넘어간다.**
//
// ⚠ 순서대로 하나씩 넣는다. YouTube 재생목록은 **넣은 순서**를 지키므로, 병렬로 던지면
//   중심곡이 가운데로 밀린다. 빠른 것보다 순서가 중요하다.

const API = 'https://www.googleapis.com/youtube/v3';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';

export type FetchLike = (url: string, init: unknown) => Promise<{
  ok: boolean; status: number; json: () => Promise<unknown>;
}>;

export interface PlaylistEnv {
  YOUTUBE_OAUTH_CLIENT_ID?: string;
  YOUTUBE_OAUTH_CLIENT_SECRET?: string;
  YOUTUBE_OAUTH_REFRESH_TOKEN?: string;
  /** 시험에서 갈아끼운다 */
  _fetch?: FetchLike;
}

export const playlistUrl = (id: string) => `https://www.youtube.com/playlist?list=${id}`;

/** 오늘의 재생목록 이름. 날짜 + 그날의 장면 — 목록만 봐도 그날이 보이게. */
export function playlistTitle(date: string, centralImage: string | null): string {
  return centralImage ? `${date} — ${centralImage}` : date;
}

// ── 승인 ─────────────────────────────────────────────────────────────────────

/** refresh token으로 access token을 받는다. access token은 한 시간이면 죽으므로 매번 새로 받는다.
 *
 * ⚠ `invalid_grant`는 **조용히 넘어가면 안 되는 오류**다. 뜻은 셋 중 하나다:
 *   · 동의 화면이 아직 "테스트" 상태다 → 발급 7일 뒤 토큰이 죽는다
 *   · 사용자가 계정 설정에서 접근을 취소했다
 *   · refresh token을 잘못 저장했다
 *   어느 쪽이든 사람이 다시 승인해야 풀린다. 그래서 사유를 그대로 들고 올라간다. */
export async function getAccessToken(env: PlaylistEnv): Promise<{ token: string | null; error: string | null }> {
  const { YOUTUBE_OAUTH_CLIENT_ID: id, YOUTUBE_OAUTH_CLIENT_SECRET: secret, YOUTUBE_OAUTH_REFRESH_TOKEN: refresh } = env;
  if (!id || !secret || !refresh) return { token: null, error: 'oauth_not_configured' };

  const doFetch = env._fetch ?? ((u: string, i: unknown) => fetch(u, i as RequestInit));
  try {
    const res = await doFetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: id, client_secret: secret, refresh_token: refresh, grant_type: 'refresh_token',
      }).toString(),
    });
    const j = (await res.json()) as { access_token?: string; error?: string };
    if (!res.ok || !j.access_token) {
      return { token: null, error: `token_${j.error || res.status}` };
    }
    return { token: j.access_token, error: null };
  } catch (e) {
    return { token: null, error: `token_failed: ${(e as Error).message}` };
  }
}

// ── 담기 ─────────────────────────────────────────────────────────────────────

async function call(
  env: PlaylistEnv, token: string, method: string, path: string, body?: unknown,
): Promise<{ data: Record<string, unknown> | null; error: string | null }> {
  const doFetch = env._fetch ?? ((u: string, i: unknown) => fetch(u, i as RequestInit));
  try {
    const headers: Record<string, string> = { authorization: `Bearer ${token}` };
    if (body !== undefined) headers['content-type'] = 'application/json';
    const res = await doFetch(`${API}${path}`, {
      method, headers, ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    // ⚠ delete는 204를 주고 **본문이 없다**. 무조건 json()을 부르면 성공한 자리에서 터진다.
    if (res.status === 204) return { data: {}, error: null };

    const j = (await res.json()) as Record<string, unknown> & { error?: { errors?: Array<{ reason?: string }> } };
    if (!res.ok) {
      // 구글은 왜 막혔는지를 reason으로 준다 — 상태 코드보다 이게 훨씬 쓸모 있다
      const reason = j?.error?.errors?.[0]?.reason;
      return { data: null, error: reason ? `${reason}` : `http_${res.status}` };
    }
    return { data: j, error: null };
  } catch (e) {
    return { data: null, error: `failed: ${(e as Error).message}` };
  }
}

const post = (env: PlaylistEnv, token: string, path: string, body: unknown) =>
  call(env, token, 'POST', path, body);

/** 이 승인이 **어느 채널에 묶였는지** 확인한다. 읽기 1유닛.
    ⚠ 브랜드 계정이 여럿이면 승인할 때 고른 것에 묶인다 — 눈으로 확인하지 않으면
      엉뚱한 채널에 재생목록이 쌓이는 걸 한참 뒤에나 안다. */
export async function getMyChannel(
  env: PlaylistEnv, token: string,
): Promise<{ id: string | null; title: string | null; error: string | null }> {
  const { data, error } = await call(env, token, 'GET', '/channels?part=snippet&mine=true');
  if (error) return { id: null, title: null, error };
  const items = (data?.items as Array<{ id?: string; snippet?: { title?: string } }>) ?? [];
  if (!items.length) return { id: null, title: null, error: 'no_channel' };
  return { id: items[0].id ?? null, title: items[0].snippet?.title ?? null, error: null };
}

/** 시험용으로 만든 재생목록을 치운다 (50유닛). 확인하면서 쓰레기를 남기지 않기 위해. */
export async function deletePlaylist(
  env: PlaylistEnv, token: string, id: string,
): Promise<{ ok: boolean; error: string | null }> {
  const { error } = await call(env, token, 'DELETE', `/playlists?id=${encodeURIComponent(id)}`);
  return { ok: !error, error };
}

export type Privacy = 'private' | 'unlisted' | 'public';

export async function createPlaylist(
  env: PlaylistEnv, token: string, title: string, description: string, privacy: Privacy,
): Promise<{ id: string | null; error: string | null }> {
  const { data, error } = await post(env, token, '/playlists?part=snippet,status', {
    snippet: { title, description }, status: { privacyStatus: privacy },
  });
  if (error) return { id: null, error };
  const id = (data?.id as string) || null;
  return id ? { id, error: null } : { id: null, error: 'playlist_id_missing' };
}

export async function addVideo(
  env: PlaylistEnv, token: string, playlistId: string, videoId: string,
): Promise<{ ok: boolean; error: string | null }> {
  const { error } = await post(env, token, '/playlistItems?part=snippet', {
    snippet: { playlistId, resourceId: { kind: 'youtube#video', videoId } },
  });
  return { ok: !error, error };
}

// ── 하루치 ───────────────────────────────────────────────────────────────────

export interface PlaylistTrack { videoId: string; title: string; artist: string }

export interface PlaylistReceipt {
  playlistId: string | null;
  url: string | null;
  added: PlaylistTrack[];
  /** 못 담은 곡 — 사유와 함께. 조용히 빠뜨리지 않는다 */
  failed: Array<{ track: PlaylistTrack; error: string }>;
  cost: number;
  error: string | null;
}

/** 유닛 계산 — 재생목록 만들기 50 + 곡마다 50 */
const UNIT_PLAYLIST = 50;
const UNIT_ITEM = 50;

/**
 * 오늘 고른 곡들을 재생목록으로 담는다.
 *
 * ⚠ **곡이 없으면 재생목록을 만들지 않는다.** 빈 목록을 만들어두면 "오늘도 돌긴 돌았다"는
 *   거짓 신호가 남는다 — 쉬는 날은 쉬는 날로 보여야 한다.
 * ⚠ 한 곡이 실패해도 나머지는 계속 담는다. 하나 때문에 하루를 통째로 버리지 않는다.
 */
export async function publishDayPlaylist(
  env: PlaylistEnv,
  opts: { date: string; centralImage: string | null; tracks: PlaylistTrack[]; description?: string; privacy?: Privacy },
): Promise<PlaylistReceipt> {
  const base: PlaylistReceipt = { playlistId: null, url: null, added: [], failed: [], cost: 0, error: null };
  if (!opts.tracks.length) return { ...base, error: 'no_tracks' };

  const { token, error: authError } = await getAccessToken(env);
  if (!token) return { ...base, error: authError };

  const title = playlistTitle(opts.date, opts.centralImage);
  const { id, error } = await createPlaylist(
    env, token, title, opts.description ?? '', opts.privacy ?? 'unlisted',
  );
  base.cost += UNIT_PLAYLIST;
  if (!id) return { ...base, error };

  base.playlistId = id;
  base.url = playlistUrl(id);

  // ⚠ 순서대로 하나씩. 병렬로 던지면 넣은 순서가 뒤섞여 중심곡이 가운데로 밀린다.
  for (const t of opts.tracks) {
    const r = await addVideo(env, token, id, t.videoId);
    base.cost += UNIT_ITEM;
    if (r.ok) base.added.push(t);
    else base.failed.push({ track: t, error: r.error ?? 'unknown' });
  }
  return base;
}
