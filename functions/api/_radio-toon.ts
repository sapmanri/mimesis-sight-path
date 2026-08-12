// 별이 웹툰 읽기 — 자기 웹툰(@byeol.toon 스레드)의 최근 편을 별이가 알고 방송한다.
//
// 태생이 실사고다 (08-12 밤, Vase): 웹툰에 "오늘 청국장 먹었다" 편이 올라갔는데, 라디오
// 별이는 그걸 몰라서 사연으로 물어온 청취자에게 "사실이 아니야"라고 방송했다.
// "별이 웹툰 별이도 좀 보라고 한 거거든." — 그래서 웹툰을 상황에 실어 준다.
//
// ⚠ 결(게놈) 경계 — 이게 이 모듈의 제일 중요한 줄이다:
//   웹툰 별이의 말투(이모지·"꿀맛!😊" 류)는 그 채널의 옷이다. 라디오 별이의 결(담담 반말·
//   이모지 금지)과 다르다. **내용은 별이의 것이되, 말투는 관찰 전용·복제 금지** —
//   덕이 유행어와 같은 원칙. 상황 블록 문구가 그 경계를 세운다 (situationMessage 쪽).
//
// 읽기는 기계적 추출이다 — 별이 인격 없이, 서버 도구 web_fetch로 공개 프로필을 펼쳐
// 게시물 텍스트를 그대로 뽑는다 (08-12 실측: 스레드 공개 페이지는 도구로 읽힌다.
// 인스타는 로그인벽 — 같은 편이 올라가므로 스레드로 충분).

import { readTranscript, extractJson, runWithTools, type MusicWebEnv } from './_music-web.ts';

export const TOON_KEY = 'radio:toon';
export const TOON_URL = 'https://www.threads.com/@byeol.toon';
export const TOON_FRESH_MS = 3 * 3_600_000;
const TOON_MODEL = 'claude-sonnet-5';
const MAX_TOKENS = 3000;
const POSTS_MAX = 5;

export interface ToonPost { text: string; when: string }
export interface ToonReadReceipt {
  posts: ToonPost[];
  read: string[];
  toolErrors: string[];
  error: string | null;
}

export function buildToonPrompt(): string {
  return [
    `아래 주소는 웹툰 계정의 공개 스레드 프로필이다. web_fetch로 펼쳐 읽고,`,
    `보이는 최근 게시물의 **본문 텍스트를 그대로**(요약·수정 없이) 뽑아라. 최대 ${POSTS_MAX}개.`,
    TOON_URL,
    ``,
    `각 게시물의 상대 시각 표기(예: 4시간 전, 1일 전)가 보이면 when에 그대로 적는다. 없으면 빈 문자열.`,
    `게시물이 안 보이거나 페이지를 못 읽으면 {"posts": []} 라고만 답한다 — 지어내지 않는다.`,
    ``,
    `마지막 답으로 JSON 하나만: {"posts": [{"text": "", "when": ""}]}`,
  ].join('\n');
}

/** 추출 검증 — 페이지를 실제로 펼쳐 읽었을 때만 인정한다 (읽은 척 방지, 서재 산책과 같은 문). */
export function validateToonPosts(
  parsed: unknown, fetched: string[],
): { posts: ToonPost[]; why: string | null } {
  const p = parsed as { posts?: unknown } | null;
  if (!p || !Array.isArray(p.posts)) return { posts: [], why: 'json_unreadable' };
  if (!fetched.some((u) => u.includes('threads.'))) return { posts: [], why: 'page_not_fetched' };
  const posts: ToonPost[] = [];
  for (const raw of p.posts.slice(0, POSTS_MAX) as Partial<ToonPost>[]) {
    const text = String(raw.text ?? '').trim().slice(0, 400);
    if (!text) continue;
    posts.push({ text, when: String(raw.when ?? '').trim().slice(0, 20) });
  }
  return { posts, why: null };   // 빈 목록도 유효 — "오늘은 못 읽었다"가 지어내기보다 낫다
}

export async function runToonRead(env: MusicWebEnv): Promise<ToonReadReceipt> {
  const empty = readTranscript([]);
  if (!env.ANTHROPIC_API_KEY) {
    return { posts: [], read: [], toolErrors: [], error: 'anthropic_key_missing' };
  }
  const { transcript, error } = await runWithTools(
    env,
    [{ role: 'user', content: buildToonPrompt() }],
    // allowed_domains 명시 (08-12 밤 실측: 없으면 fetch: url_not_allowed — 검색 결과에서 온
    // 주소가 아닌 직접 지정 주소는 허용 목록이 있어야 열린다)
    [{ type: 'web_fetch_20260209', name: 'web_fetch', max_uses: 2,
       allowed_domains: ['threads.com', 'www.threads.com'] }],
    { model: TOON_MODEL, maxTokens: MAX_TOKENS },
  );
  if (error) return { posts: [], read: transcript.fetched, toolErrors: transcript.toolErrors, error };
  const { posts, why } = validateToonPosts(extractJson(transcript.text), transcript.fetched);
  return { posts, read: transcript.fetched, toolErrors: transcript.toolErrors, error: why };
}
