// BUILD 425-B/C — Threads 댓글 수집·답글 정책 순수 로직
// 정본: docs/BUILD_425_THREADS_CAPTURE_AND_REPLY.md §4 (Vase 판정: 상한 = 오늘 신규 댓글의 ~30%)
//
// 별이는 고객센터가 아니다. 모든 댓글에 답하지 않는다. 애매하면 답하지 않는다.
// Phase 1(현재): 후보는 기계가 만들고, 발행은 Vase 승인 클릭으로만 나간다(지시서 E항).

export const REPLY_RATIO = 0.3;            // 오늘 신규 댓글 대비 답글 상한
export const AGING_MS = 10 * 60 * 1000;    // 댓글 10분 숙성 후 후보
export const PER_ACCOUNT_MS = 24 * 3600 * 1000; // 같은 계정 24시간 1회
export const PER_POST_MAX = 2;             // 게시물당 최대 답글
export const LOG_KEEP = 200;

export type ReplyCategory = 'observation' | 'question' | 'greeting' | 'light' | 'spam' | 'sensitive';
export type ReplyDecision = 'collected' | 'drafted' | 'published' | 'ignored' | 'failed';

export interface ReplyRecord {
  sourceCommentId: string;
  sourcePostId: string;
  text: string;                 // 공개 댓글 원문 (≤500)
  commentCreatedAt: number;
  detectedAt: number;
  authorIdHash: string;         // sha256(pepper+username) — 원문 username은 저장하지 않는다
  authorMask: string;           // 표시용 마스킹 (u***e)
  category: ReplyCategory;
  decision: ReplyDecision;
  reason: string | null;
  generatedText: string | null;
  bookmarked: boolean;          // ⭐ 기억해둠 (발행 없음, 내부 행위)
  approvedAt: number | null;
  publishedAt: number | null;
  threads: { errorCode: string | null; requestId: string | null };
  modelVersion: string | null;
}

export function maskUsername(username: string): string {
  if (username.length <= 2) return username[0] + '*';
  return username[0] + '***' + username[username.length - 1];
}

/** 휴리스틱 분류 — 민감/스팸의 1차 필터. 생성 단계에서 Claude가 2차로 거른다. */
export function categorize(text: string): ReplyCategory {
  const t = text.trim();
  if (!t) return 'spam';
  if (/https?:\/\/|bit\.ly|팔로|맞팔|홍보|광고|수익|코인|주식|투자/i.test(t)) return 'spam';
  if (/병원|의사|약 |처방|변호사|소송|고소|대통령|정당|선거|정치|주민번호|전화번호/.test(t)) return 'sensitive';
  const stripped = t.replace(/[\p{Emoji_Presentation}\p{Extended_Pictographic}\sㅋㅎㅠㅜ.!~^]+/gu, '');
  if (stripped.length < 2) return 'light';                     // 이모지·ㅋㅋ뿐 — 기본 무응답
  if (/\?|나요|까요|어때|뭐예요|뭔가요|누구/.test(t)) return 'question';
  if (/잘 보고|잘보고|응원|왔어요|왔다감|좋아요|좋다|고마워/.test(t) && t.length < 30) return 'greeting';
  return 'observation';
}

/** 새로 가져온 댓글을 로그에 병합 — sourceCommentId 멱등, 최신순, LOG_KEEP 유지 */
export function mergeReplies(log: ReplyRecord[], incoming: ReplyRecord[]): { log: ReplyRecord[]; added: number } {
  const known = new Set(log.map((r) => r.sourceCommentId));
  const fresh = incoming.filter((r) => !known.has(r.sourceCommentId));
  const next = [...fresh, ...log]
    .sort((a, b) => b.commentCreatedAt - a.commentCreatedAt)
    .slice(0, LOG_KEEP);
  return { log: next, added: fresh.length };
}

const kstDayKey = (ms: number) => {
  const d = new Date(ms + 9 * 3600 * 1000);
  return `${d.getUTCFullYear()}-${d.getUTCMonth()}-${d.getUTCDate()}`;
};

/** 오늘 상한: ceil(오늘 신규 댓글 × 30%) — 상한이지 목표가 아니다 */
export function dailyReplyCap(log: ReplyRecord[], now: number): { cap: number; used: number; todayNew: number } {
  const today = kstDayKey(now);
  const todayNew = log.filter((r) => kstDayKey(r.commentCreatedAt) === today).length;
  const used = log.filter((r) => r.publishedAt && kstDayKey(r.publishedAt) === today).length;
  return { cap: Math.ceil(todayNew * REPLY_RATIO), used, todayNew };
}

/** 이 댓글에 답글 후보를 만들어도 되는가.
 *  정책 전부(30% 상한·10분 숙성·게시물당 2·계정당 24h·카테고리 필터)는
 *  **자동 발행 전용**이다(Vase 판정 07-19: "사람이 할 때는 그냥 풀어놔").
 *  수동(기본값)은 이미 답한 댓글만 막는다 — 판단은 승인 버튼을 쥔 사람의 것.
 *  Phase 2 자동 경로는 반드시 automated:true로 호출할 것 (enforceDailyCap 포함 개념). */
export function draftEligibility(
  rec: ReplyRecord, log: ReplyRecord[], now: number,
  opts: { automated?: boolean } = {},
): string | null {
  if (rec.decision === 'published') return 'already_published';
  if (!opts.automated) return null; // 수동: 전부 개방 — 카테고리는 라벨로만 보인다

  if (rec.category === 'spam') return 'category_spam';
  if (rec.category === 'sensitive') return 'category_sensitive'; // 자동 경로 금지 (지시서 C)
  if (rec.category === 'light') return 'category_light';
  if (now - rec.commentCreatedAt < AGING_MS) return 'aging';     // 10분 숙성
  const { cap, used } = dailyReplyCap(log, now);
  if (used >= cap) return 'daily_cap';                           // 오늘 30% 소진 (enforceDailyCap)
  const samePost = log.filter((r) => r.sourcePostId === rec.sourcePostId && r.publishedAt).length;
  if (samePost >= PER_POST_MAX) return 'per_post_cap';
  const sameAuthor = log.some((r) =>
    r.authorIdHash === rec.authorIdHash && r.publishedAt && now - r.publishedAt < PER_ACCOUNT_MS);
  if (sameAuthor) return 'per_account_cooldown';                 // 같은 계정 24h 1회
  return null;
}

export const repliesConfig = {
  LOG_KEY: 'reply_log',
  INGEST_META_KEY: 'reply_ingest_meta',
  PEPPER_KEY: 'reply_pepper',
  INGEST_MIN_MS: 25 * 60 * 1000, // 콘솔 폴링이 이보다 자주 와도 실제 수집은 25분 간격
  POSTS_TO_CHECK: 12,
};
