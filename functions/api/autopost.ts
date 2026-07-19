// BUILD 277: 자율 삽만리 봇 — 외부 Cron이 이 엔드포인트를 정시에 때리면,
// 별리 문장 풀(113개)에서 하나 랜덤으로 골라 공용 피드에 발행한다.
// 에디터를 안 켜도 별리 화자가 스스로 스레드를 쌓는다. AI 호출 없음(문장 풀 방식).
//
// 보호: X-Publish-Key (feed.ts와 동일 키). 외부 Cron에 키를 심어 호출.
// KV 바인딩: PLANET. 키: 'feed'(공용 스레드), 'bot_recent'(최근 발행 인덱스 — 중복 회피).

import byeolliPosts from './byeolli_posts.json';
import { appendPublishLog, bump401Bucket } from './_publish-log';
import { writeByeoliPost } from './_byeoli-writer';
import { provenance, GENOME_VERSION, GENERATION_SOURCES, type GenomeProvenance } from './_genome-identity';
import { resolvePostText, slotForPhase } from './_genome-fallback';
import { bookKey } from './_genome';

// 422-OPS/425: ops publish-now가 같은 발행 파이프(dispatchToThreads)를 재사용한다.
// 크론 경로의 동작은 그대로 — export만 추가 (자율 시스템 무변경 원칙).
export interface Env {
  PLANET: KVNamespace;
  PUBLISH_KEY?: string;
  CAPTURES?: R2Bucket;            // BUILD 355: R2 캡처 버킷 — 방송 이미지를 여기서 뽑는다
  CAPTURES_PUBLIC_BASE?: string; // r2.dev 공개 URL 접두사
  THREADS_APP_SECRET?: string;   // BUILD 417: 토큰 자동 갱신용 (threads-auth.ts와 동일 앱)
  THREADS_TOKEN?: string;        // BUILD 417: (선택) 대시보드 토큰 생성기로 만든 장기 토큰 — 첫 실행 시 KV로 이관
  THREADS_USER_ID?: string;      // BUILD 417: (미사용 — /me 자동 조회로 대체. 남아 있어도 무해)
  ANTHROPIC_API_KEY?: string;    // BUILD 425-D: 별이 문장 작가 (없으면 문장 풀 폴백)
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

export async function getThreadsAuth(env: Env): Promise<ThreadsAuth | null> {
  const raw = await env.PLANET.get(THREADS_AUTH_KEY);
  let auth: ThreadsAuth | null = null;
  if (raw) { try { auth = JSON.parse(raw); } catch { auth = null; } }
  // env 부트스트랩 — Meta 대시보드 "사용자 토큰 생성기"로 만든 토큰을
  // CF env(THREADS_TOKEN)에 넣으면 첫 실행 때 /me로 실제 사용자 ID를 조회해
  // KV로 옮겨 앉는다. env의 THREADS_USER_ID는 신뢰하지 않는다 —
  // 앱 ID를 잘못 넣는 실수가 실제로 있었고, /me가 항상 정답이다.
  if ((!auth || !auth.token) && env.THREADS_TOKEN) {
    try {
      const meRes = await fetch(
        `https://graph.threads.net/v1.0/me?fields=id,username&access_token=${encodeURIComponent(env.THREADS_TOKEN)}`,
      );
      const me = (await meRes.json()) as { id?: string; username?: string };
      if (meRes.ok && me.id) {
        auth = { token: env.THREADS_TOKEN, userId: me.id, refreshedAt: Date.now() };
        await env.PLANET.put(THREADS_AUTH_KEY, JSON.stringify(auth));
      }
    } catch { /* 부트스트랩 실패 — 아래에서 null 반환 */ }
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

// detail: 개발자가 HTTP 응답에서 보는 라이브 요약(원문 message 포함 가능).
// errorCode·requestId: publish_log에 저장되는 구조화 요약 — 여기엔 원문 message를 담지 않는다.
type ThreadsResult = {
  attempted: boolean; ok: boolean; detail: string;
  errorCode: string | null; requestId: string | null;
};
type MetaResp = { id?: string; error?: { code?: number; error_subcode?: number; fbtrace_id?: string; message?: string } };
function metaErrorCode(j: MetaResp, httpStatus: number): string {
  const e = j?.error;
  if (e?.code != null) return e.error_subcode != null ? `${e.code}/${e.error_subcode}` : String(e.code);
  return `http_${httpStatus}`;
}

export async function dispatchToThreads(
  env: Env, text: string, img: string | null, draft: boolean,
): Promise<ThreadsResult> {
  const auth = await getThreadsAuth(env);
  if (!auth) return { attempted: false, ok: false, detail: 'threads auth not configured — GET /api/threads-auth?key=... 먼저', errorCode: 'auth_missing', requestId: null };

  // 1) 컨테이너 생성 — Threads 본문 한도 500자
  const create = new URL(`${THREADS_API}/${auth.userId}/threads`);
  create.searchParams.set('text', text.slice(0, 500));
  if (img) { create.searchParams.set('media_type', 'IMAGE'); create.searchParams.set('image_url', img); }
  else create.searchParams.set('media_type', 'TEXT');
  create.searchParams.set('access_token', auth.token);
  let containerId = '';
  try {
    const r = await fetch(create.toString(), { method: 'POST' });
    const j = (await r.json()) as MetaResp;
    if (!r.ok || !j.id) {
      return { attempted: true, ok: false, detail: `container failed: ${j?.error?.message ?? r.status}`, errorCode: metaErrorCode(j, r.status), requestId: j?.error?.fbtrace_id ?? null };
    }
    containerId = j.id;
  } catch (e) { return { attempted: true, ok: false, detail: `container error: ${String(e)}`, errorCode: 'network', requestId: null }; }

  if (draft) return { attempted: true, ok: true, detail: `container ${containerId} created (not published — draft mode)`, errorCode: null, requestId: containerId };

  // 2) 발행 — 미디어 처리 지연 대비 재시도
  const publish = new URL(`${THREADS_API}/${auth.userId}/threads_publish`);
  publish.searchParams.set('creation_id', containerId);
  publish.searchParams.set('access_token', auth.token);
  let lastDetail = '';
  let lastCode = 'unknown';
  let lastTrace: string | null = null;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    if (attempt > 0) await new Promise((res) => setTimeout(res, 3000));
    try {
      const r = await fetch(publish.toString(), { method: 'POST' });
      const j = (await r.json()) as MetaResp;
      if (r.ok && j.id) return { attempted: true, ok: true, detail: `published: ${j.id}`, errorCode: null, requestId: j.id };
      lastDetail = j?.error?.message ?? `HTTP ${r.status}`;
      lastCode = metaErrorCode(j, r.status);
      lastTrace = j?.error?.fbtrace_id ?? null;
    } catch (e) { lastDetail = String(e); lastCode = 'network'; }
  }
  return { attempted: true, ok: false, detail: `publish failed after retries: ${lastDetail.slice(0, 200)}`, errorCode: lastCode, requestId: lastTrace };
}

export const onRequestOptions: PagesFunction<Env> = async () =>
  new Response(null, { status: 204, headers: CORS });

// GET — 상태 확인용 (문장 개수, 최근 발행 수). 발행은 안 함.
// 429-F: genomeVersion·chain을 함께 노출한다. 발행을 트리거하지 않고 "지금 라이브에
// 어떤 Genome이 걸려 있는가"를 밖에서 확인할 수 있어야 한다 — 배포 검증의 유일한 무해 경로.
export const onRequestGet: PagesFunction<Env> = async ({ env }) => {
  const recentRaw = await env.PLANET.get(RECENT_KEY);
  const recent: number[] = recentRaw ? JSON.parse(recentRaw) : [];
  return new Response(JSON.stringify({
    ok: true, poolSize: POSTS.length, recentCount: recent.length, images: IMAGE_POOL.length,
    genomeVersion: GENOME_VERSION,
    chain: [...GENERATION_SOURCES],
  }), {
    status: 200, headers: { ...CORS, 'Content-Type': 'application/json' },
  });
};

// POST — 봇 발행. 외부 Cron이 X-Publish-Key와 함께 호출.
export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  if (!env.PUBLISH_KEY) {
    // 503 key_missing — 매 실행 기록 (422-OPS-A §3-2)
    await appendPublishLog(env, {
      invokedAt: Date.now(), result: 'key_missing', httpStatus: 503,
      textIndex: null, imageKey: null,
      threads: { attempted: false, ok: false, errorCode: null, requestId: null },
    }).catch(() => {});
    return new Response(JSON.stringify({ error: 'PUBLISH_KEY not configured' }), {
      status: 503, headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }
  if (request.headers.get('X-Publish-Key') !== env.PUBLISH_KEY) {
    // 401 key_mismatch — 건별 기록 금지, 10분 슬롯 카운터만 (헤더·IP·UA 저장 안 함)
    await bump401Bucket(env, Date.now()).catch(() => {});
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
  // BUILD 425-A: 엽서 우선 — capture_meta에 기록된(=장면·일기 문맥이 있는) 키가
  // 충분하면 그 풀에서만 뽑는다. 메타 없는 옛 수동 캡처는 자연 은퇴한다.
  if (imgPool.length > 0) {
    try {
      const metaRaw = await env.PLANET.get('capture_meta');
      if (metaRaw) {
        const metaKeys = new Set((JSON.parse(metaRaw) as { r2Key: string }[]).map((m) => m.r2Key));
        const postcardPool = imgPool.filter((u) => {
          const k = u.match(/captures\/[^?#]+/)?.[0];
          return !!k && metaKeys.has(k);
        });
        if (postcardPool.length >= 5) imgPool = postcardPool;
      }
    } catch { /* 메타 실패 시 기존 풀 유지 */ }
  }
  if (imgPool.length === 0) imgPool = IMAGE_POOL; // 폴백: 하드코딩 8장
  const img = imgPool.length > 0 && Math.random() < 0.8
    ? imgPool[Math.floor(Math.random() * imgPool.length)]
    : null;

  // 피드 로드 (425-D 작가의 반복 방지 문맥 + 아래 prepend에 재사용)
  const feedRaw = await env.PLANET.get(FEED_KEY);
  const feed: { text?: string }[] = feedRaw ? JSON.parse(feedRaw) : [];

  // BUILD 425-D: 엽서(메타 있는 이미지) 발행이면 Claude가 그 장면의 글을 쓴다.
  // 어떤 실패도 발행을 막지 않는다 — 문장 풀 폴백이 항상 살아 있다 (자율 시스템 보호).
  let text = chosen.text;
  let textIndex: number | null = pick;
  // 429-F 준비: 어느 경로로 나온 글인지. 기본은 풀 폴백이고, Writer가 성공하면 덮인다.
  let genomeSource: GenomeProvenance = provenance('rule-fallback', true);
  if (img) {
    try {
      const key = img.match(/captures\/[^?#]+/)?.[0];
      const cmRaw = key ? await env.PLANET.get('capture_meta') : null;
      const cm = cmRaw
        ? (JSON.parse(cmRaw) as { r2Key: string; targetLabel?: string | null; byeoliAction?: string | null; skyPhase?: string | null; weather?: string | null; diaryLines?: string[] }[])
          .find((m) => m.r2Key === key)
        : null;
      if (cm) {
        const recentTexts = feed.slice(0, 5).map((p) => p.text ?? '').filter(Boolean);
        const written = await writeByeoliPost(env, {
          targetLabel: cm.targetLabel ?? null,
          byeoliAction: cm.byeoliAction ?? null,
          skyPhase: cm.skyPhase ?? null,
          weather: cm.weather ?? null,
          diaryLines: cm.diaryLines ?? [],
          recentTexts,
        });
        // 429-F: genome-live → genome-book → rule-fallback. 세 순위를 순서대로 내려간다.
        const date = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10); // KST
        const slot = slotForPhase(cm.skyPhase ?? null);
        let bookRaw: unknown = null;
        if (!written && slot) {
          try { bookRaw = JSON.parse((await env.PLANET.get(bookKey(date, slot))) ?? 'null'); }
          catch { /* 문장집을 못 읽으면 다음 순위로 */ }
        }
        const resolved = resolvePostText({
          liveText: written?.text ?? null,
          book: bookRaw,
          poolText: text,
          ctx: { targetLabel: cm.targetLabel ?? null, diaryLines: cm.diaryLines ?? [], recentTexts, date, slot },
        });
        text = resolved.text;
        genomeSource = resolved.provenance;
        // 풀 인덱스는 실제로 풀 문장을 썼을 때만 유지 (로테이션 아끼기)
        if (resolved.provenance.generationSource !== 'rule-fallback') textIndex = null;
      }
    } catch { /* 폴백 유지 */ }
  }

  // 피드에 prepend
  const post = {
    id: `bot-${Date.now()}`,
    t: Date.now(),
    title: '',
    text,
    img,
    icon: '🌏',
    likes: Math.floor(Math.random() * 12) + 1,
    comments: [],
    // 429-F: "이게 정말 Genome을 탄 글인지" 나중에 확인할 수 있어야 한다.
    genome: genomeSource,
  };
  const nextFeed = [post, ...feed].slice(0, MAX_POSTS);
  await env.PLANET.put(FEED_KEY, JSON.stringify(nextFeed));

  // 최근 인덱스 갱신 — 풀 문장을 실제로 썼을 때만 (생성 글이면 풀 로테이션 아끼기)
  if (textIndex !== null) {
    const nextRecent = [pick, ...recent].slice(0, RECENT_KEEP);
    await env.PLANET.put(RECENT_KEY, JSON.stringify(nextRecent));
  }

  // BUILD 417: 같은 내용을 진짜 Threads로. ?draft=1 이면 초안으로만.
  const url = new URL(request.url);
  const draft = url.searchParams.get('draft') === '1';
  const threads = await dispatchToThreads(env, text, img, draft);

  // 정상 실행 1건 기록 — Layer1(운영)·Layer2(별이 일지) 소스 모두 담는다. draft는 로그 제외.
  if (!draft) {
    await appendPublishLog(env, {
      invokedAt: Date.now(),
      result: threads.ok ? 'success' : 'threads_failed',
      httpStatus: 200,
      textIndex,
      imageKey: img ? (img.match(/captures\/[^?#]+/)?.[0] ?? null) : null,
      threads: { attempted: threads.attempted, ok: threads.ok, errorCode: threads.errorCode, requestId: threads.requestId },
    }).catch(() => {});
  }

  return new Response(JSON.stringify({ ok: true, posted: text, index: textIndex, generated: textIndex === null, img: !!img, threads }), {
    status: 200, headers: { ...CORS, 'Content-Type': 'application/json' },
  });
};
