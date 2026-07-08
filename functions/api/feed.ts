// BUILD 250: 공용 스레드 — 관찰자 삽만리의 목소리 (Vase)
// 방문자는 GET으로 '삽만리가 이 행성을 지켜보며 흘린 일기'를 읽는다. 모두 같은 스레드.
// 삽만리(에디터/Claude)는 POST로 글 하나를 올린다 — X-Publish-Key 보호.
// 페르소나 주민들의 댓글은 글에 함께 실려 온다. AI 호출은 이 파일 바깥(작성 시점)에서.
//
// KV 바인딩: PLANET (planet.ts와 공유). 저장 키: 'feed' (포스트 배열 JSON).

interface Env {
  PLANET: KVNamespace;
  PUBLISH_KEY?: string;
}

const FEED_KEY = 'feed';
const MAX_POSTS = 60; // 최근 60개만 보관 (오래된 건 흘려보낸다)
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-Publish-Key',
};

export const onRequestOptions: PagesFunction<Env> = async () =>
  new Response(null, { status: 204, headers: CORS });

// GET /api/feed — 공용 스레드 전체(최신순). 없으면 빈 배열.
export const onRequestGet: PagesFunction<Env> = async ({ env }) => {
  const raw = await env.PLANET.get(FEED_KEY);
  return new Response(raw ?? '[]', {
    status: 200,
    headers: { ...CORS, 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=10' },
  });
};

// POST /api/feed — 삽만리가 글 하나 발행. 본문: { title, text, img?, comments?, likes? }
// 서버가 id·시각을 붙이고, 최신이 앞에 오도록 prepend, MAX_POSTS로 자른다.
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
  let post: Record<string, unknown>;
  try {
    const p = await request.json() as Record<string, unknown>;
    if (typeof p !== 'object' || p === null || typeof p.text !== 'string' || !p.text) {
      throw new Error('need text');
    }
    post = {
      id: `sap-${Date.now()}`,
      t: Date.now(),
      title: typeof p.title === 'string' ? p.title : '',
      text: p.text,
      img: typeof p.img === 'string' ? p.img : null,
      icon: typeof p.icon === 'string' ? p.icon : '🌿',
      likes: typeof p.likes === 'number' ? p.likes : 0,
      comments: Array.isArray(p.comments) ? p.comments : [],
    };
  } catch {
    return new Response(JSON.stringify({ error: 'invalid post' }), {
      status: 400, headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }
  const raw = await env.PLANET.get(FEED_KEY);
  let list: unknown[] = [];
  try { list = raw ? JSON.parse(raw) : []; } catch { list = []; }
  list.unshift(post);
  if (list.length > MAX_POSTS) list = list.slice(0, MAX_POSTS);
  await env.PLANET.put(FEED_KEY, JSON.stringify(list));
  return new Response(JSON.stringify({ ok: true, id: post.id, count: list.length }), {
    status: 200, headers: { ...CORS, 'Content-Type': 'application/json' },
  });
};
