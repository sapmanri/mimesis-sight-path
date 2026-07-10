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

  return new Response(JSON.stringify({ ok: true, posted: chosen.text, index: pick, img: !!img }), {
    status: 200, headers: { ...CORS, 'Content-Type': 'application/json' },
  });
};
