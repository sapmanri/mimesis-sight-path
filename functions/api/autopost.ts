// BUILD 277: 자율 삽만리 봇 — 외부 Cron이 이 엔드포인트를 정시에 때리면,
// 별리 문장 풀(113개)에서 하나 랜덤으로 골라 공용 피드에 발행한다.
// 에디터를 안 켜도 별리 화자가 스스로 스레드를 쌓는다. AI 호출 없음(문장 풀 방식).
//
// 보호: X-Publish-Key (feed.ts와 동일 키). 외부 Cron에 키를 심어 호출.
// KV 바인딩: PLANET. 키: 'feed'(공용 스레드), 'bot_recent'(최근 발행 인덱스 — 중복 회피).

import byeolliPosts from './byeolli_posts.json';

interface Env {
  PLANET: KVNamespace;
  PUBLISH_KEY?: string;
  CAPTURES?: R2Bucket;            // BUILD 355: R2 캡처 버킷 — 방송 이미지를 여기서 뽑는다
  CAPTURES_PUBLIC_BASE?: string; // r2.dev 공개 URL 접두사
  THREADS_APP_SECRET?: string;   // BUILD 417: 토큰 자동 갱신용 (threads-auth.ts와 동일 앱)
  THREADS_TOKEN?: string;        // BUILD 417: (선택) 대시보드 토큰 생성기로 만든 장기 토큰 — 첫 실행 시 KV로 이관
  THREADS_USER_ID?: string;      // BUILD 417: (선택) 위 토큰의 Threads user id
}

const FEED_KEY = 'feed';
const RECENT_KEY = 'bot_recent';
const MAX_POSTS = 60;
const RECENT_KEEP = 25; // 최근 25개는 다시 안 뽑는다 (반복 체감 방지)

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-Publish-Key',
};

// 봇이 붙일 수 있는 이미지 풀 — 별리 산책 스크린샷 8장 (public/byeolli/).
// 봇이 1/2 확률로 랜덤 첨부.
const IMAGE_POOL: string[] = [
  'https://mimesis-sight-path.pages.dev/byeolli/walk01.jpg',
  'https://mimesis-sight-path.pages.dev/byeolli/walk02.jpg',
  'https://mimesis-sight-path.pages.dev/byeolli/walk03.jpg',
  'https://mimesis-sight-path.pages.dev/byeolli/walk04.jpg',
  'https://mimesis-sight-path.pages.dev/byeolli/walk05.jpg',
  'https://mimesis-sight-path.pages.dev/byeolli/walk06.jpg',
  'https://mimesis-sight-path.pages.dev/byeolli/walk07.jpg',
  'https://mimesis-sight-path.pages.dev/byeolli/walk08.jpg',
];

const POSTS: { text: string }[] = (byeolliPosts as { posts: { text: string }[] }).posts;

/* =====================================================================
   BUILD 417 — 진짜 Threads 발행 (Meta Threads API 직접, 무료)
   내부 KV 피드 발행은 그대로 유지하고, 같은 내용을 실제 Threads(@mimesis_op)로
   보낸다. cron이 이 엔드포인트를 때리는 순간 별리가 진짜 SNS에 등장한다.
   · 토큰: /api/threads-auth 로 1회 발급 → KV('threads_auth') 저장.
     이후 크론이 돌 때마다 7일 지났으면 자동 갱신 (60일 만료 훨씬 이전).
   · 발행: 컨테이너 생성(/threads) → 발행(/threads_publish) 2단계.
     미디어 처리 지연 대비 발행은 3초 간격 최대 5회 재시도.
   · ?draft=1: 컨테이너 생성까지만 — 공개 게시 없이 인증·미디어 파이프 검증.
   · Threads 실패가 내부 피드 발행을 깨지 않는다 — 결과만 응답에 보고.
   ===================================================================== */
const THREADS_AUTH_KEY = 'threads_auth';
const THREADS_API = 'https://graph.threads.net/v1.0';
const REFRESH_AFTER_MS = 7 * 24 * 3600 * 1000; // 7일마다 갱신 (만료 60일)

interface ThreadsAuth { token: string; userId: string; refreshedAt: number }

async function getThreadsAuth(env: Env): Promise<ThreadsAuth | null> {
  const raw = await env.PLANET.get(THREADS_AUTH_KEY);
  let auth: ThreadsAuth | null = null;
  if (raw) { try { auth = JSON.parse(raw); } catch { auth = null; } }
  // env 부트스트랩 — Meta 대시보드 "사용자 토큰 생성기"로 만든 토큰을
  // CF env에 넣으면 첫 실행 때 KV로 옮겨 앉는다. 이후 갱신은 KV에서.
  if ((!auth || !auth.token) && env.THREADS_TOKEN && env.THREADS_USER_ID) {
    auth = { token: env.THREADS_TOKEN, userId: env.THREADS_USER_ID, refreshedAt: Date.now() };
    await env.PLANET.put(THREADS_AUTH_KEY, JSON.stringify(auth));
  }
  if (!auth || !auth.token || !auth.userId) return null;
  // 자동 갱신 — 토큰이 24시간 이상 묵어야 갱신 가능하므로 7일 주기가 안전
  if (Date.now() - auth.refreshedAt > REFRESH_AFTER_MS) {
    try {
      const u = new URL('https://graph.threads.net/refresh_access_token');
      u.searchParams.set('grant_type', 'th_refresh_token');
      u.searchParams.set('access_token', auth.token);
      const r = await fetch(u.toString());
      if (r.ok) {
        const j = (await r.json()) as { access_token?: string };
        if (j.access_token) {
          auth = { ...auth, token: j.access_token, refreshedAt: Date.now() };
          await env.PLANET.put(THREADS_AUTH_KEY, JSON.stringify(auth));
        }
      }
      // 갱신 실패 시 기존 토큰으로 계속 — 60일 안이면 여전히 유효
    } catch { /* 갱신 실패 무시 */ }
  }
  return auth;
}

async function dispatchToThreads(
  env: Env, text: string, img: string | null, draft: boolean,
): Promise<{ attempted: boolean; ok: boolean; detail: string }> {
  const auth = await getThreadsAuth(env);
  if (!auth) return { attempted: false, ok: false, detail: 'threads auth not configured — GET /api/threads-auth?key=... 먼저' };

  // 1) 컨테이너 생성 — Threads 본문 한도 500자
  const create = new URL(`${THREADS_API}/${auth.userId}/threads`);
  create.searchParams.set('text', text.slice(0, 500));
  if (img) { create.searchParams.set('media_type', 'IMAGE'); create.searchParams.set('image_url', img); }
  else create.searchParams.set('media_type', 'TEXT');
  create.searchParams.set('access_token', auth.token);
  let containerId = '';
  try {
    const r = await fetch(create.toString(), { method: 'POST' });
    const j = (await r.json()) as { id?: string; error?: { message?: string } };
    if (!r.ok || !j.id) {
      return { attempted: true, ok: false, detail: `container failed: ${j?.error?.message ?? r.status}` };
    }
    containerId = j.id;
  } catch (e) { return { attempted: true, ok: false, detail: `container error: ${String(e)}` }; }

  if (draft) return { attempted: true, ok: true, detail: `container ${containerId} created (not published — draft mode)` };

  // 2) 발행 — 미디어 처리 지연 대비 재시도
  const publish = new URL(`${THREADS_API}/${auth.userId}/threads_publish`);
  publish.searchParams.set('creation_id', containerId);
  publish.searchParams.set('access_token', auth.token);
  let lastDetail = '';
  for (let attempt = 0; attempt < 5; attempt += 1) {
    if (attempt > 0) await new Promise((res) => setTimeout(res, 3000));
    try {
      const r = await fetch(publish.toString(), { method: 'POST' });
      const j = (await r.json()) as { id?: string; error?: { message?: string } };
      if (r.ok && j.id) return { attempted: true, ok: true, detail: `published: ${j.id}` };
      lastDetail = j?.error?.message ?? `HTTP ${r.status}`;
    } catch (e) { lastDetail = String(e); }
  }
  return { attempted: true, ok: false, detail: `publish failed after retries: ${lastDetail.slice(0, 200)}` };
}

export const onRequestOptions: PagesFunction<Env> = async () =>
  new Response(null, { status: 204, headers: CORS });

// GET — 상태 확인용 (문장 개수, 최근 발행 수). 발행은 안 함.
export const onRequestGet: PagesFunction<Env> = async ({ env }) => {
  const recentRaw = await env.PLANET.get(RECENT_KEY);
  const recent: number[] = recentRaw ? JSON.parse(recentRaw) : [];
  return new Response(JSON.stringify({ ok: true, poolSize: POSTS.length, recentCount: recent.length, images: IMAGE_POOL.length }), {
    status: 200, headers: { ...CORS, 'Content-Type': 'application/json' },
  });
};

// POST — 봇 발행. 외부 Cron이 X-Publish-Key와 함께 호출.
export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  if (!env.PUBLISH_KEY) {
    return new Response(JSON.stringify({ error: 'PUBLISH_KEY not configured' }), {
      status: 503, headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }
  if (request.headers.get('X-Publish-Key') !== env.PUBLISH_KEY) {
    return new Response(JSON.stringify({ error: 'unauthorized' }), {
      status: 401, headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }

  // 최근 발행 인덱스 로드 → 그걸 뺀 후보에서 랜덤
  const recentRaw = await env.PLANET.get(RECENT_KEY);
  const recent: number[] = recentRaw ? JSON.parse(recentRaw) : [];
  const recentSet = new Set(recent);
  let candidates = POSTS.map((_, i) => i).filter((i) => !recentSet.has(i));
  if (candidates.length === 0) candidates = POSTS.map((_, i) => i); // 다 돌았으면 리셋
  const pick = candidates[Math.floor(Math.random() * candidates.length)];
  const chosen = POSTS[pick];

  // BUILD 355: 이미지 — R2 최근 캡처 우선, 없으면 하드코딩 풀. 자주(4/5) 첨부.
  let imgPool: string[] = [];
  if (env.CAPTURES && env.CAPTURES_PUBLIC_BASE) {
    try {
      const listed = await env.CAPTURES.list({ prefix: 'captures/', limit: 200 });
      const base = env.CAPTURES_PUBLIC_BASE.replace(/\/$/, '');
      imgPool = listed.objects.map((o) => o.key).sort().reverse().slice(0, 40).map((k) => `${base}/${k}`);
    } catch { /* R2 실패 시 폴백 */ }
  }
  if (imgPool.length === 0) imgPool = IMAGE_POOL; // 폴백: 하드코딩 8장
  const img = imgPool.length > 0 && Math.random() < 0.8
    ? imgPool[Math.floor(Math.random() * imgPool.length)]
    : null;

  // 피드에 prepend
  const feedRaw = await env.PLANET.get(FEED_KEY);
  const feed: unknown[] = feedRaw ? JSON.parse(feedRaw) : [];
  const post = {
    id: `bot-${Date.now()}`,
    t: Date.now(),
    title: '',
    text: chosen.text,
    img,
    icon: '🌏',
    likes: Math.floor(Math.random() * 12) + 1,
    comments: [],
  };
  const nextFeed = [post, ...feed].slice(0, MAX_POSTS);
  await env.PLANET.put(FEED_KEY, JSON.stringify(nextFeed));

  // 최근 인덱스 갱신
  const nextRecent = [pick, ...recent].slice(0, RECENT_KEEP);
  await env.PLANET.put(RECENT_KEY, JSON.stringify(nextRecent));

  // BUILD 417: 같은 내용을 진짜 Threads로. ?draft=1 이면 초안으로만.
  const url = new URL(request.url);
  const draft = url.searchParams.get('draft') === '1';
  const threads = await dispatchToThreads(env, chosen.text, img, draft);

  return new Response(JSON.stringify({ ok: true, posted: chosen.text, index: pick, img: !!img, threads }), {
    status: 200, headers: { ...CORS, 'Content-Type': 'application/json' },
  });
};
