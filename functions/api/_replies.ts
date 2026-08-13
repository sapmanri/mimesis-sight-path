// BUILD 425-B/C — Threads 댓글 수집·답글 정책 순수 로직
// 2026-08-13 Vase 판정: 수량·숙성·계정·게시물 상한은 전부 폐기한다.
// 댓글마다 별이가 답할지/지나갈지/기억할지를 직접 정한다. 기계는 중복 실행만 막는다.
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

/** 이 댓글을 다시 판단해도 되는가. 취향·수량 정책은 없다 — 이미 처리했는지만 본다. */
export function draftEligibility(
  rec: ReplyRecord, _log: ReplyRecord[], _now: number,
  _opts: { automated?: boolean } = {},
): string | null {
  if (rec.decision !== 'collected') return 'already_handled';
  return null;
}

/** 별이가 답하기로 한 뒤에도 기계가 막는 것은 외부 노출 사고 형태뿐이다.
 *  댓글 내용의 종류나 답글 빈도는 판단하지 않는다. */
export function replyBoundary(text: string): string | null {
  if (text.length > 300) return 'too_long';
  if (/https?:\/\/|www\./i.test(text)) return 'url';
  if (/[\w.+-]+@[\w-]+\.[\w.-]+/.test(text)) return 'email';
  if (/01[016789][-\.\s]?\d{3,4}[-\.\s]?\d{4}/.test(text)) return 'phone';
  return null;
}

export const repliesConfig = {
  LOG_KEY: 'reply_log',
  INGEST_META_KEY: 'reply_ingest_meta',
  PEPPER_KEY: 'reply_pepper',
  INGEST_MIN_MS: 25 * 60 * 1000, // 콘솔 폴링이 이보다 자주 와도 실제 수집은 25분 간격
  POSTS_TO_CHECK: 12,
};

/* ── 2026-07-20 — 답글 판단의 세계 사실·강제 후보 (threads-replies가 사용) ── */

/**
 * 세계의 사실 — "지어내지 않는다"의 기준선. 실사고: "펫 안 데리고 다니니?" 댓글에
 * 모델이 "실제로 데리고 다니는 펫이 없으므로"라고 오판해 무응답 — 빼콩이가 예시
 * 한 줄에만 있고 사실로 선언돼 있지 않았다. 지어내지 않기의 전제는 실제를 아는 것.
 */
export const WORLD_FACTS = `세계의 사실 (이건 실제다 — 지어내지 않기의 기준선):
- 네 곁에는 흰 고양이 '빼콩이'가 있다. 산책에 늘 따라다닌다. 그 외의 펫은 없다.
- 펫·고양이 얘기가 나오면 빼콩이가 답의 재료다. "데리고 다니는 펫이 없다"고 판단하지 마라.
- 너는 픽셀 동네를 걷고, 관찰한 것을 짧게 남긴다. 그 이상의 과거·계획은 지어내지 않는다.`;

/**
 * 운영자 강제 후보 — 무응답 레코드의 [후보 만들기]는 사람이 무응답 판단을 뒤집겠다는
 * 뜻이다. 정책 위반(비난·도발·정치·의료·법률·개인정보)만은 사람도 못 뒤집는다.
 */
