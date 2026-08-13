// Meta Threads 공식 API 클라이언트.
//
// 발행 시간표나 편집 판단을 모른다. 인증 계정이 정확히 @byeoli_log인지 확인하고,
// 호출자가 이미 결정한 글/답글을 Meta에 전달하는 일만 맡는다. 이 분리 덕분에 폐기된
// /api/autopost 고정 슬롯 경로를 다시 열지 않고도 모든 실제 발행선이 같은 안전장치를 쓴다.

export interface ThreadsEnv {
  PLANET: KVNamespace;
  THREADS_APP_SECRET?: string;
  THREADS_TOKEN?: string;
  THREADS_USER_ID?: string;
  BYEOLI_THREADS_HANDLE?: string;
}

export interface ThreadsAuth {
  token: string;
  userId: string;
  username: string;
  refreshedAt: number;
}

export interface ThreadsResult {
  attempted: boolean;
  ok: boolean;
  detail: string;
  errorCode: string | null;
  requestId: string | null;
}

type MetaResp = {
  id?: string;
  error?: {
    code?: number;
    error_subcode?: number;
    fbtrace_id?: string;
    message?: string;
  };
};

const THREADS_AUTH_KEY = 'threads_auth';
const THREADS_API = 'https://graph.threads.net/v1.0';
const REFRESH_AFTER_MS = 7 * 24 * 3_600_000;

const expectedHandle = (env: Pick<ThreadsEnv, 'BYEOLI_THREADS_HANDLE'>) =>
  (env.BYEOLI_THREADS_HANDLE ?? 'byeoli_log').replace(/^@/, '').toLowerCase();

function metaErrorCode(payload: MetaResp, httpStatus: number): string {
  const error = payload?.error;
  if (error?.code != null) {
    return error.error_subcode != null
      ? `${error.code}/${error.error_subcode}`
      : String(error.code);
  }
  return `http_${httpStatus}`;
}

export async function getThreadsAuth(env: ThreadsEnv): Promise<ThreadsAuth | null> {
  const raw = await env.PLANET.get(THREADS_AUTH_KEY);
  let auth: ThreadsAuth | null = null;
  if (raw) {
    try { auth = JSON.parse(raw) as ThreadsAuth; } catch { auth = null; }
  }

  // Cloudflare secret로 받은 장기 토큰은 /me가 확인한 실제 사용자 ID와 이름으로만 KV에 옮긴다.
  if ((!auth || !auth.token) && env.THREADS_TOKEN) {
    try {
      const profile = new URL(`${THREADS_API}/me`);
      profile.searchParams.set('fields', 'id,username');
      profile.searchParams.set('access_token', env.THREADS_TOKEN);
      const response = await fetch(profile.toString());
      const payload = await response.json() as { id?: string; username?: string };
      if (response.ok && payload.id && payload.username) {
        auth = {
          token: env.THREADS_TOKEN,
          userId: payload.id,
          username: payload.username,
          refreshedAt: Date.now(),
        };
        await env.PLANET.put(THREADS_AUTH_KEY, JSON.stringify(auth));
      }
    } catch { /* 아래의 null 반환으로 닫힌다 */ }
  }
  if (!auth?.token || !auth.userId) return null;

  // 옛 레코드에 username이 없거나 다른 계정으로 토큰이 바뀐 경우, /me가 확인되기 전엔 쓰지 않는다.
  try {
    const profile = new URL(`${THREADS_API}/me`);
    profile.searchParams.set('fields', 'id,username');
    profile.searchParams.set('access_token', auth.token);
    const response = await fetch(profile.toString());
    const payload = await response.json() as { id?: string; username?: string };
    if (!response.ok || !payload.id || !payload.username || payload.id !== auth.userId) return null;
    if (auth.username !== payload.username) {
      auth = { ...auth, username: payload.username };
      await env.PLANET.put(THREADS_AUTH_KEY, JSON.stringify(auth));
    }
  } catch { return null; }

  if (auth.username.replace(/^@/, '').toLowerCase() !== expectedHandle(env)) return null;

  // 장기 토큰은 60일 전에 자동 갱신한다. 실패해도 기존 토큰을 즉시 지우지는 않는다.
  if (Date.now() - auth.refreshedAt > REFRESH_AFTER_MS) {
    try {
      const refresh = new URL('https://graph.threads.net/refresh_access_token');
      refresh.searchParams.set('grant_type', 'th_refresh_token');
      refresh.searchParams.set('access_token', auth.token);
      const response = await fetch(refresh.toString());
      const payload = await response.json() as { access_token?: string };
      if (response.ok && payload.access_token) {
        auth = { ...auth, token: payload.access_token, refreshedAt: Date.now() };
        await env.PLANET.put(THREADS_AUTH_KEY, JSON.stringify(auth));
      }
    } catch { /* 아직 유효한 기존 토큰으로 계속 */ }
  }
  return auth;
}

export async function dispatchToThreads(
  env: ThreadsEnv,
  text: string,
  imageUrl: string | null,
  draft: boolean,
  replyToId: string | null = null,
): Promise<ThreadsResult> {
  const auth = await getThreadsAuth(env);
  if (!auth) {
    return {
      attempted: false,
      ok: false,
      detail: 'Threads auth/account check failed',
      errorCode: 'auth_or_account_mismatch',
      requestId: null,
    };
  }

  // reply_to_id는 자기 루트 글 아래 이어 쓰기와 들어온 댓글에 대한 답글에 사용한다.
  // 대상 ID의 소유권/출처 검증은 호출자가 맡고, 이 클라이언트는 전달만 한다.
  const create = new URL(`${THREADS_API}/me/threads`);
  create.searchParams.set('text', text.slice(0, 500));
  if (imageUrl) {
    create.searchParams.set('media_type', 'IMAGE');
    create.searchParams.set('image_url', imageUrl);
  } else {
    create.searchParams.set('media_type', 'TEXT');
  }
  if (replyToId) {
    if (imageUrl) {
      return {
        attempted: false, ok: false, detail: 'image reply is not supported by this path',
        errorCode: 'reply_image_unsupported', requestId: null,
      };
    }
    create.searchParams.set('reply_to_id', replyToId);
  }
  create.searchParams.set('access_token', auth.token);

  let containerId = '';
  try {
    const response = await fetch(create.toString(), { method: 'POST' });
    const payload = await response.json() as MetaResp;
    if (!response.ok || !payload.id) {
      return {
        attempted: true,
        ok: false,
        detail: `container failed: ${payload.error?.message ?? response.status}`.slice(0, 240),
        errorCode: metaErrorCode(payload, response.status),
        requestId: payload.error?.fbtrace_id ?? null,
      };
    }
    containerId = payload.id;
  } catch (error) {
    return {
      attempted: true,
      ok: false,
      detail: `container error: ${String(error)}`.slice(0, 240),
      errorCode: 'network',
      requestId: null,
    };
  }

  if (draft) {
    return {
      attempted: true,
      ok: true,
      detail: `container ${containerId} created without publishing`,
      errorCode: null,
      requestId: containerId,
    };
  }

  const publish = new URL(`${THREADS_API}/${auth.userId}/threads_publish`);
  publish.searchParams.set('creation_id', containerId);
  publish.searchParams.set('access_token', auth.token);
  let lastDetail = '';
  let lastCode = 'unknown';
  let lastTrace: string | null = null;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    if (attempt > 0) await new Promise((resolve) => setTimeout(resolve, 3_000));
    try {
      const response = await fetch(publish.toString(), { method: 'POST' });
      const payload = await response.json() as MetaResp;
      if (response.ok && payload.id) {
        return {
          attempted: true,
          ok: true,
          detail: `published: ${payload.id}`,
          errorCode: null,
          requestId: payload.id,
        };
      }
      lastDetail = payload.error?.message ?? `HTTP ${response.status}`;
      lastCode = metaErrorCode(payload, response.status);
      lastTrace = payload.error?.fbtrace_id ?? null;
    } catch (error) {
      lastDetail = String(error);
      lastCode = 'network';
    }
  }
  return {
    attempted: true,
    ok: false,
    detail: `publish failed after retries: ${lastDetail}`.slice(0, 240),
    errorCode: lastCode,
    requestId: lastTrace,
  };
}
