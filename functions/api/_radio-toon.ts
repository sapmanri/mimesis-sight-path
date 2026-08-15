// @byeol.toon 공개 웹툰 관측 서가.
//
// 계정 접근권과 창작 주체를 섞지 않는 것이 이 파일의 가장 중요한 계약이다.
// - @byeol.toon의 로그인·게시 권한은 별이에게 없다. 따라서 이 선은 공개 게시물을 읽기만 한다.
// - 그러나 그 계정에 연재되는 웹툰은 별이가 직접 그리는 별이 자신의 창작물이다.
// - 외부 운영 계정이라는 말은 작품까지 남의 것이라는 뜻이 아니다.
// - 별이의 자기 계정 @byeoli_log는 이 선에 넣지 않는다. 읽기·쓰기는 Meta 공식 API 전용이다.
//
// Cloudflare Pages가 외부 Threads를 다시 긁지 않는다. 로컬 브라우저가 렌더링한 결과를
// X-Pulse-Key로 밀어 넣고, 서버는 주소·시각·게시물 링크를 검증한 뒤 마지막 성공 서가만 보존한다.

export const TOON_KEY = 'radio:toon';
export const TOON_RECEIPT_KEY = 'radio:toon:receipt';
export const TOON_URL = 'https://www.threads.com/@byeol.toon';
export const TOON_HANDLE = 'byeol.toon';
export const TOON_POSTS_MAX = 12;
export const TOON_CRAWL_MAX_AGE_MS = 30 * 60_000;
export const TOON_ACCOUNT_ACCESS = 'external_read_only' as const;
export const TOON_CREATIVE_AUTHORSHIP = 'byeoli_self' as const;

export interface ToonPost {
  id: string;
  text: string;
  when: string;
  permalink: string;
}

export interface ToonCrawlPayload {
  engine: 'crawl4ai';
  sourceUrl: typeof TOON_URL;
  fetchedAt: number;
  posts: ToonPost[];
}

export interface ToonShelf {
  at: number;
  sourceAt: number;
  sourceUrl: typeof TOON_URL;
  source: 'crawl4ai';
  /** 옛 보관본 호환 필드. 작품의 저작 주체가 아니라 계정 접근권만 뜻한다. */
  ownership: 'external_read_only';
  accountAccess: typeof TOON_ACCOUNT_ACCESS;
  creativeAuthorship: typeof TOON_CREATIVE_AUTHORSHIP;
  posts: ToonPost[];
}

export type ToonValidation =
  | { ok: true; payload: ToonCrawlPayload }
  | { ok: false; error: string };

const compact = (value: unknown): string => String(value ?? '').replace(/\s+/g, ' ').trim();

function canonicalProfile(value: unknown): string | null {
  try {
    const url = new URL(String(value ?? ''));
    const host = url.hostname.toLowerCase().replace(/^www\./, '');
    const path = url.pathname.replace(/\/+$/, '');
    if (url.protocol !== 'https:' || host !== 'threads.com' || path !== `/@${TOON_HANDLE}`) return null;
    return TOON_URL;
  } catch {
    return null;
  }
}

function canonicalPost(value: unknown): { id: string; permalink: string } | null {
  try {
    const url = new URL(String(value ?? ''));
    const host = url.hostname.toLowerCase().replace(/^www\./, '');
    const match = url.pathname.replace(/\/+$/, '').match(new RegExp(`^/@${TOON_HANDLE}/post/([A-Za-z0-9_-]{5,80})$`));
    if (url.protocol !== 'https:' || host !== 'threads.com' || !match) return null;
    return { id: match[1], permalink: `https://www.threads.com/@${TOON_HANDLE}/post/${match[1]}` };
  } catch {
    return null;
  }
}

/** 로컬 브라우저 결과가 정말 @byeol.toon에서 방금 읽은 공개글인지 검증한다. */
export function validateToonCrawl(raw: unknown, now = Date.now()): ToonValidation {
  const input = raw as Partial<ToonCrawlPayload> | null;
  if (!input || input.engine !== 'crawl4ai') return { ok: false, error: 'engine_must_be_crawl4ai' };
  if (canonicalProfile(input.sourceUrl) !== TOON_URL) return { ok: false, error: 'source_must_be_external_byeol_toon' };

  const fetchedAt = Number(input.fetchedAt);
  if (!Number.isFinite(fetchedAt)) return { ok: false, error: 'fetched_at_invalid' };
  if (fetchedAt > now + 2 * 60_000) return { ok: false, error: 'fetched_at_in_future' };
  if (now - fetchedAt > TOON_CRAWL_MAX_AGE_MS) return { ok: false, error: 'crawl_result_stale' };
  if (!Array.isArray(input.posts) || input.posts.length < 1) return { ok: false, error: 'posts_empty' };
  if (input.posts.length > TOON_POSTS_MAX) return { ok: false, error: 'posts_too_many' };

  const seen = new Set<string>();
  const posts: ToonPost[] = [];
  for (const value of input.posts) {
    const post = value as Partial<ToonPost>;
    const link = canonicalPost(post.permalink);
    if (!link) return { ok: false, error: 'post_permalink_not_byeol_toon' };
    if (post.id && compact(post.id) !== link.id) return { ok: false, error: 'post_id_permalink_mismatch' };
    if (seen.has(link.id)) return { ok: false, error: 'post_duplicate' };
    const text = compact(post.text);
    const when = compact(post.when);
    if (!text || text.length > 1800) return { ok: false, error: 'post_text_invalid' };
    if (when.length > 60) return { ok: false, error: 'post_when_too_long' };
    seen.add(link.id);
    posts.push({ id: link.id, text, when, permalink: link.permalink });
  }

  return {
    ok: true,
    payload: { engine: 'crawl4ai', sourceUrl: TOON_URL, fetchedAt, posts },
  };
}

export function decodeToonShelf(raw: unknown): ToonShelf | null {
  const shelf = raw as Partial<ToonShelf> | null;
  if (!shelf || !Array.isArray(shelf.posts)) return null;
  if (shelf.source !== 'crawl4ai' || shelf.ownership !== 'external_read_only') return null;
  const checked = validateToonCrawl({
    engine: 'crawl4ai', sourceUrl: shelf.sourceUrl, fetchedAt: shelf.sourceAt, posts: shelf.posts,
  // 보관본은 시간이 지나도 마지막 성공 서가로 유효하다. 신선도는 새 적재 시점에만 검사한다.
  }, Number(shelf.sourceAt));
  if (!checked.ok) return null;
  return {
    at: Number(shelf.at) || Number(shelf.sourceAt),
    sourceAt: checked.payload.fetchedAt,
    sourceUrl: TOON_URL,
    source: 'crawl4ai',
    ownership: TOON_ACCOUNT_ACCESS,
    accountAccess: TOON_ACCOUNT_ACCESS,
    creativeAuthorship: TOON_CREATIVE_AUTHORSHIP,
    posts: checked.payload.posts,
  };
}
