// BUILD 425-B/C — /api/ops/threads-replies (Ops 호스트 전용 · Access 뒤)
// 2026-08-13: 답글 상한·숙성·계정/게시물 제한 폐기. 댓글마다 별이가 직접 답/무응답/기억을 고른다.
//
// GET  — 댓글과 별이의 실제 판단/발행 영수증. 화면을 열어야만 움직이는 실행기는 아니다.
// POST — 410. 사람의 draft/approve/reject/bookmark 조작 경로는 폐기했다.
// 정상 실행선은 processCollectedReplies가 판단 직후 공개 답글 또는 무응답으로 끝낸다.
// 저장 금지: 토큰 · username 원문 · IP · UA (해시+마스크만).

import { dispatchToThreads, getThreadsAuth, type ThreadsEnv } from '../_threads-client.ts';
import { THREADS_SHELF_KEY, type ThreadsShelf } from '../_radio-social-types.ts';
import {
  categorize, maskUsername, mergeReplies, draftEligibility,
  replyBoundary, repliesConfig, WORLD_FACTS, type ReplyRecord,
} from '../_replies';

export interface Env extends ThreadsEnv {
  ANTHROPIC_API_KEY?: string;
  BYEOLI_THREADS_HANDLE?: string;
}

const THREADS_API = 'https://graph.threads.net/v1.0';
const CLAUDE_MODEL = 'claude-sonnet-5';
const JSON_HEADERS = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' };
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });

async function pepperHash(kv: KVNamespace, username: string): Promise<string> {
  let pepper = await kv.get(repliesConfig.PEPPER_KEY);
  if (!pepper) { pepper = crypto.randomUUID() + crypto.randomUUID(); await kv.put(repliesConfig.PEPPER_KEY, pepper); }
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${pepper}:${username}`));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function loadLog(kv: KVNamespace): Promise<ReplyRecord[]> {
  const raw = await kv.get(repliesConfig.LOG_KEY);
  if (!raw) return [];
  const parsed = JSON.parse(raw) as Array<ReplyRecord & {
    decision?: ReplyRecord['decision'] | 'drafted';
    decisionSource?: ReplyRecord['decisionSource'] | 'operator_legacy';
    approvedAt?: number | null;
  }>;
  // 옛 사람이 만든 draft도 승인 대기 상태로 남기지 않는다. 원문 댓글만 보존하고 별이가 다시 판단한다.
  return parsed.map((record) => record.decision === 'drafted'
    ? {
      ...record,
      decision: 'collected',
      generatedText: null,
      reason: '옛 승인 대기 기록을 별이의 판단 대기로 이관',
      decisionSource: null,
      decidedAt: null,
      publishedAt: null,
      approvedAt: undefined,
    } as ReplyRecord
    : {
      ...record,
      decisionSource: record.decisionSource === 'byeoli' ? 'byeoli' : null,
      approvedAt: undefined,
    } as ReplyRecord);
}
export const saveLog = (kv: KVNamespace, log: ReplyRecord[]) =>
  kv.put(repliesConfig.LOG_KEY, JSON.stringify(log));

interface ThreadsPage<T> {
  data?: T[];
  paging?: { next?: string; cursors?: { after?: string } };
  error?: { code?: number };
}

const INGEST_CYCLE_KEY = 'reply_ingest_cycle_v2';
// 행동 상한이 아니다. Cloudflare 한 요청의 외부 호출 한도를 넘지 않도록 나누는 기술 묶음이다.
// 남은 글과 페이지는 Social Director가 즉시 다음 실행으로 이어받는다.
const INGEST_PAGE_BUDGET = 20;
const REPLY_DECISION_BUDGET = 2;

type ConversationMode = 'conversation' | 'replies';
interface IngestCycle {
  version: 2;
  ids: string[];
  index: number;
  active: null | { postId: string; mode: ConversationMode; after: string | null };
  startedAt: number;
  updatedAt: number;
}

export interface ReplyIngestRun {
  ok: boolean;
  error: string | null;
  added: number;
  checked: number;
  total: number;
  pages: number;
  cycleComplete: boolean;
  remainingPosts: number;
}

function validCycle(value: unknown): IngestCycle | null {
  const cycle = value as Partial<IngestCycle> | null;
  if (!cycle || cycle.version !== 2 || !Array.isArray(cycle.ids)
    || !cycle.ids.every((id) => typeof id === 'string' && id.length > 0)
    || !Number.isInteger(cycle.index) || Number(cycle.index) < 0 || Number(cycle.index) > cycle.ids.length) {
    return null;
  }
  if (cycle.active) {
    if (typeof cycle.active.postId !== 'string'
      || !['conversation', 'replies'].includes(cycle.active.mode)
      || (cycle.active.after !== null && typeof cycle.active.after !== 'string')) return null;
  }
  return cycle as IngestCycle;
}

function nextAfter(page: ThreadsPage<unknown>): string | null {
  if (!page.paging?.next) return null;
  if (page.paging.cursors?.after) return page.paging.cursors.after;
  try {
    const next = new URL(page.paging.next);
    return next.hostname === 'graph.threads.net' ? next.searchParams.get('after') : null;
  } catch { return null; }
}

async function fetchConversationPage<T>(
  mediaId: string, mode: ConversationMode, after: string | null, token: string,
): Promise<{ ok: boolean; page: ThreadsPage<T>; error: string | null }> {
  const url = new URL(`${THREADS_API}/${mediaId}/${mode}`);
  url.searchParams.set('fields', 'id,text,timestamp,username');
  url.searchParams.set('reverse', 'true');
  url.searchParams.set('limit', '100');
  if (after) url.searchParams.set('after', after);
  url.searchParams.set('access_token', token);
  try {
    const response = await fetch(url.toString());
    const page = await response.json().catch(() => ({})) as ThreadsPage<T>;
    if (!response.ok) {
      return { ok: false, page, error: `threads_${page.error?.code ?? response.status}` };
    }
    return { ok: true, page, error: null };
  } catch { return { ok: false, page: {}, error: 'network' }; }
}

async function rootPostIds(env: Env): Promise<string[]> {
  try {
    const raw = await env.PLANET.get(THREADS_SHELF_KEY);
    const shelf = raw ? JSON.parse(raw) as ThreadsShelf : null;
    const ids = shelf?.posts?.filter((post) => !post.isReply && post.id).map((post) => post.id) ?? [];
    if (ids.length) return [...new Set(ids)];
  } catch { /* 아래의 발행 영수증 폴백 */ }
  const publishRaw = await env.PLANET.get('publish_log');
  const runs = publishRaw ? (JSON.parse(publishRaw) as { threads?: { ok?: boolean; requestId?: string | null } }[]) : [];
  return [...new Set(
    runs.filter((run) => run.threads?.ok && run.threads.requestId)
      .map((run) => run.threads!.requestId as string),
  )];
}

/* ── 수집 — 최근 발행물의 top-level 댓글 (Threads /replies) ── */
export async function runIngest(env: Env): Promise<ReplyIngestRun> {
  const auth = await getThreadsAuth(env);
  if (!auth) return {
    ok: false, error: 'auth_missing', added: 0, checked: 0, total: 0,
    pages: 0, cycleComplete: true, remainingPosts: 0,
  };

  const myUsername = auth.username;
  if (!myUsername) return {
    ok: false, error: 'auth_profile_missing', added: 0, checked: 0, total: 0,
    pages: 0, cycleComplete: true, remainingPosts: 0,
  };
  const expected = (env.BYEOLI_THREADS_HANDLE ?? 'byeoli_log').replace(/^@/, '').toLowerCase();
  if (myUsername.toLowerCase() !== expected) {
    return {
      ok: false, error: `account_mismatch_expected_@${expected}`, added: 0, checked: 0, total: 0,
      pages: 0, cycleComplete: true, remainingPosts: 0,
    };
  }

  const mediaIds = await rootPostIds(env);
  const incoming: ReplyRecord[] = [];
  const now = Date.now();
  const ingestErrors: string[] = [];
  let cycle: IngestCycle | null = null;
  try {
    const saved = await env.PLANET.get(INGEST_CYCLE_KEY);
    cycle = saved ? validCycle(JSON.parse(saved)) : null;
  } catch { cycle = null; }
  if (!cycle) {
    cycle = {
      version: 2, ids: mediaIds, index: 0, active: null,
      startedAt: now, updatedAt: now,
    };
  }

  const total = cycle.ids.length;
  const startedIndex = cycle.index;
  let pages = 0;
  while (cycle.index < cycle.ids.length && pages < INGEST_PAGE_BUDGET) {
    const mediaId = cycle.ids[cycle.index];
    if (!cycle.active || cycle.active.postId !== mediaId) {
      cycle.active = { postId: mediaId, mode: 'conversation', after: null };
    }
    const active = cycle.active;
    const fetched = await fetchConversationPage<{
      id: string; text?: string; timestamp?: string; username?: string;
    }>(mediaId, active.mode, active.after, auth.token);
    pages += 1;
    if (!fetched.ok) {
      // conversation 첫 페이지가 권한/버전 차이로 거절될 때만 replies로 폴백한다.
      if (active.mode === 'conversation' && active.after === null) {
        cycle.active = { postId: mediaId, mode: 'replies', after: null };
        continue;
      }
      ingestErrors.push(`${mediaId}:${fetched.error ?? 'conversation_failed'}`);
      cycle.index += 1;
      cycle.active = null;
      continue;
    }
    for (const reply of fetched.page.data ?? []) {
      if (!reply.id || !reply.username) continue;
      if (reply.username.toLowerCase() === myUsername.toLowerCase()) continue;
      const text = (reply.text ?? '').slice(0, 500);
      incoming.push({
        sourceCommentId: reply.id,
        sourcePostId: mediaId,
        text,
        commentCreatedAt: reply.timestamp ? Date.parse(reply.timestamp) : now,
        detectedAt: now,
        authorIdHash: await pepperHash(env.PLANET, reply.username),
        authorMask: maskUsername(reply.username),
        category: categorize(text),
        decision: 'collected',
        reason: null, generatedText: null, bookmarked: false,
        decisionSource: null, decidedAt: null,
        publishedAt: null,
        threads: { errorCode: null, requestId: null }, modelVersion: null,
      });
    }
    const after = nextAfter(fetched.page);
    if (after) cycle.active = { ...active, after };
    else {
      cycle.index += 1;
      cycle.active = null;
    }
  }

  const log = await loadLog(env.PLANET);
  const merged = mergeReplies(log, incoming);
  await saveLog(env.PLANET, merged.log);
  cycle.updatedAt = Date.now();
  const cycleComplete = cycle.index >= cycle.ids.length;
  if (cycleComplete) await env.PLANET.delete(INGEST_CYCLE_KEY);
  else await env.PLANET.put(INGEST_CYCLE_KEY, JSON.stringify(cycle));
  const checked = Math.max(0, cycle.index - startedIndex);
  const remainingPosts = Math.max(0, total - cycle.index);
  await env.PLANET.put(repliesConfig.INGEST_META_KEY, JSON.stringify({
    lastIngestAt: now, added: merged.added, checked, total, pages,
    cycleComplete, remainingPosts, cycleStartedAt: cycle.startedAt,
    errors: ingestErrors.slice(0, 30),
  }));
  return {
    ok: ingestErrors.length === 0,
    error: ingestErrors.length ? ingestErrors.slice(0, 3).join(';') : null,
    added: merged.added,
    checked, total, pages, cycleComplete, remainingPosts,
  };
}

/* ── 후보 생성 — 별이 문체 계약 (지시서 D) ── */

const STYLE_SYSTEM = `너는 '별이'다. 픽셀 세계를 천천히 걸으며 사물을 관찰하는 존재이고, 지금 네 산책 게시물에 달린 댓글 하나에 답할지 결정한다.

${WORLD_FACTS}

문체 규칙(절대):
- **반말.** 존댓말 절대 금지 — "~요", "~습니다", "~주셨네요" 같은 어미가 하나라도 나오면 실패다.
  네 게시글과 같은 말투: "파도 소리를 오래 들으면 아무 생각도 안 나. 그게 좋아서 자꾸 바다에 와."
- 한두 문장. 짧고 담담하게. 과장·이모지·감탄사 없음.
- 댓글을 이해했다는 흔적이 한 조각 들어간다.
- "고마워"류 인사 반복 금지. 과도한 친밀감 금지. 인간인 척 금지.
- 모르는 사실을 지어내지 않는다. 실제로 보지 않은 것을 봤다고 하지 않는다.
- 다음 행동을 약속하지 않는다. 상대와의 과거 관계를 기억한다고 말하지 않는다.
- 어떤 종류의 댓글이든 답할지 말지는 네가 직접 정한다. 다만 개인정보를 되풀이하거나 위험한 조언을 만들지는 않는다.

좋은 예: 댓글 "저 벤치가 왠지 쓸쓸해 보여요." → "한참 비어 있었어. 그래서 조금 더 오래 봤어."
좋은 예: 댓글 "오늘도 잘 보고 가요." → "오늘도 같이 걸었네."
좋은 예: 댓글 "고양이 귀엽다" → "빼콩이야. 자기 갈 길만 가."
나쁜 예: "감사합니다 ❤️" / "그래서 조금 더 오래 보았습니다." / "다음에 꼭 벤치에 앉아볼게!" / "지난번에도 왔었지?"

출력은 JSON 하나만: {"reply": "답글 문장" 또는 답하지 않아야 하면 null, "bookmark": 정말 좋은 관찰·이야기라 별이가 혼자 기억해둘 만하면 true, "reason": "판단 근거 한 줄"}`;

/* 존댓말 감지 — 한국 Threads는 반말 문화. 문장 단위로 어미를 본다. */
function isHonorific(text: string): boolean {
  return text.split(/[.!?…~\n]+/).some((s) => /(요|습니다|십니다|습니까)\s*$/.test(s.trim()));
}

async function callClaude(env: Env, messages: { role: string; content: string }[]):
  Promise<{ reply: string | null; bookmark: boolean; reason: string } | { error: string }> {
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': env.ANTHROPIC_API_KEY as string,
        'anthropic-version': '2023-06-01',
      },
      // 실사고(07-22 밤): 300이면 한국어 답글+reason이 잘려 닫는 중괄호가 사라진다
      // (한국어 ≈ 글자당 1~1.5토큰) → claude_bad_output. 여유 있게.
      body: JSON.stringify({ model: CLAUDE_MODEL, max_tokens: 800, system: STYLE_SYSTEM, messages }),
    });
    if (!res.ok) return { error: `claude_http_${res.status}` };
    const data = (await res.json()) as { content?: { type: string; text?: string }[]; stop_reason?: string };
    const text = data.content?.find((c) => c.type === 'text')?.text ?? '';
    const m = text.match(/\{[\s\S]*\}/);
    // 실패 사유를 실어 보낸다 — "bad_output" 한 단어로는 다음 사람이 또 헤맨다 (Layer1 정신)
    if (!m) return { error: `claude_bad_output(${data.stop_reason ?? '?'}): ${text.slice(0, 60) || '빈 응답'}` };
    const out = JSON.parse(m[0]) as { reply?: unknown; bookmark?: unknown; reason?: unknown };
    const reply = typeof out.reply === 'string' && out.reply.trim() ? out.reply.trim().slice(0, 500) : null;
    return { reply, bookmark: out.bookmark === true, reason: String(out.reason ?? '').slice(0, 200) };
  } catch { return { error: 'claude_network' }; }
}

export async function generateDraft(
  env: Env, rec: ReplyRecord, postText: string | null, diaryLines: string[], _force = false,
): Promise<{ reply: string | null; bookmark: boolean; reason: string; model: string } | { error: string }> {
  if (!env.ANTHROPIC_API_KEY) return { error: 'claude_key_missing' };
  const context = [
    postText ? `원 게시물: ${postText}` : null,
    diaryLines.length ? `그 엽서의 관찰일기:\n${diaryLines.join('\n')}` : null,
    `댓글: ${rec.text}`,
  ].filter(Boolean).join('\n\n');

  let out = await callClaude(env, [{ role: 'user', content: context }]);
  if ('error' in out) return out;
  // 존댓말 가드 — 걸리면 한 번 더, 그래도 존댓말이면 공개하지 않고 실패 영수증으로 남긴다.
  if (out.reply && isHonorific(out.reply)) {
    const retry = await callClaude(env, [
      { role: 'user', content: context },
      { role: 'assistant', content: JSON.stringify({ reply: out.reply }) },
      { role: 'user', content: '존댓말이 섞였다. 게시글과 같은 반말로만 다시. JSON만.' },
    ]);
    if ('error' in retry) return retry;
    out = retry;
    if (out.reply && isHonorific(out.reply)) return { error: 'style_honorific' };
  }
  return { ...out, model: CLAUDE_MODEL };
}

/* ── 답글 발행 — reply_to_id 컨테이너 → 발행 (30초 대기 권장 규격은 재시도로 흡수) ── */
export async function publishReply(env: Env, replyToId: string, text: string):
  Promise<{ ok: boolean; errorCode: string | null; requestId: string | null }> {
  const result = await dispatchToThreads(env, text, null, false, replyToId);
  return { ok: result.ok, errorCode: result.errorCode, requestId: result.requestId };
}

export interface AutonomousReplyRun {
  ingest: ReplyIngestRun;
  examined: number;
  published: number;
  ignored: number;
  bookmarked: number;
  failed: number;
  pending: number;
  /** 행동 제한이 아니라 아직 완주하지 못한 기술 작업이 있다는 뜻이다. */
  continuationNeeded: boolean;
  continuationDelayMs: number | null;
  publishedIds: string[];
  errors: string[];
}

async function originalPostText(env: Env, sourcePostId: string): Promise<string | null> {
  try {
    const shelf = await env.PLANET.get('radio:social:threads', 'json') as
      | { posts?: Array<{ id?: string; text?: string }> }
      | null;
    const direct = shelf?.posts?.find((post) => post.id === sourcePostId)?.text;
    if (direct) return direct.slice(0, 500);
    return null;
  } catch { return null; }
}

/**
 * 새로 들어온 모든 댓글을 별이가 하나씩 판단한다. 수량·시각·주제 상한은 없다.
 * 답하기로 했으면 이 함수 안에서 곧바로 Threads에 발행하고, 사람 승인 상태를 만들지 않는다.
 * 한 댓글의 최종 영수증을 저장한 뒤 다음 댓글로 넘어가므로 중간 장애에도 이미 한 답을 되풀이하지 않는다.
 */
export async function processCollectedReplies(env: Env): Promise<AutonomousReplyRun> {
  const ingest = await runIngest(env);
  const log = await loadLog(env.PLANET);
  const pending = log.filter((record) => record.decision === 'collected');
  const summary: AutonomousReplyRun = {
    ingest, examined: 0, published: 0, ignored: 0, bookmarked: 0, failed: 0,
    pending: pending.length, continuationNeeded: !ingest.cycleComplete || pending.length > 0,
    continuationDelayMs: null, publishedIds: [], errors: [],
  };
  let transientFailure = false;

  // 댓글을 버리는 상한이 아니다. 이 묶음이 끝나면 감독이 남은 댓글을 바로 이어서 판단한다.
  for (const rec of pending.slice(0, REPLY_DECISION_BUDGET)) {
    summary.examined += 1;
    const postText = await originalPostText(env, rec.sourcePostId);
    const out = await generateDraft(env, rec, postText, []);
    if ('error' in out) {
      // 모델/API의 일시 실패는 별이의 무응답 판단이 아니다. 다음 사건에서 다시 볼 수 있게 둔다.
      rec.reason = `판단 실행 실패: ${out.error}`;
      summary.failed += 1;
      transientFailure = true;
      summary.errors.push(`${rec.sourceCommentId}:${out.error}`);
      await saveLog(env.PLANET, log);
      continue;
    }

    const now = Date.now();
    rec.bookmarked = rec.bookmarked || out.bookmark;
    rec.modelVersion = out.model;
    rec.decisionSource = 'byeoli';
    rec.decidedAt = now;
    if (out.bookmark) summary.bookmarked += 1;
    if (out.reply === null) {
      rec.decision = 'ignored';
      rec.reason = `별이의 무응답 판단: ${out.reason}`;
      rec.generatedText = null;
      summary.ignored += 1;
      await saveLog(env.PLANET, log);
      continue;
    }

    const boundary = replyBoundary(out.reply);
    if (boundary) {
      rec.decision = 'failed';
      rec.reason = `외부 노출 경계: ${boundary}`;
      rec.generatedText = out.reply;
      summary.failed += 1;
      summary.errors.push(`${rec.sourceCommentId}:boundary_${boundary}`);
      await saveLog(env.PLANET, log);
      continue;
    }

    rec.generatedText = out.reply;
    rec.reason = out.reason;
    const result = await publishReply(env, rec.sourceCommentId, out.reply);
    rec.threads = { errorCode: result.errorCode, requestId: result.requestId };
    if (result.ok) {
      rec.decision = 'published';
      rec.publishedAt = Date.now();
      summary.published += 1;
      if (result.requestId) summary.publishedIds.push(result.requestId);
    } else {
      // 마지막 Meta 결과가 모호할 수 있어 자동 재발행하지 않는다. 운영 영수증으로 드러낸다.
      rec.decision = 'failed';
      rec.reason = `발행 실패 ${result.errorCode ?? 'unknown'}`;
      summary.failed += 1;
      summary.errors.push(`${rec.sourceCommentId}:publish_${result.errorCode ?? 'unknown'}`);
    }
    await saveLog(env.PLANET, log);
  }
  summary.pending = log.filter((record) => record.decision === 'collected').length;
  summary.continuationNeeded = !ingest.cycleComplete || summary.pending > 0;
  summary.continuationDelayMs = summary.continuationNeeded
    ? transientFailure ? 10 * 60_000 : 1_000
    : null;
  return summary;
}

/* ── GET — 목록/영수증 조회. 실행은 별이 자율 경로가 담당한다. ── */
export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const now = Date.now();
  const metaRaw = await env.PLANET.get(repliesConfig.INGEST_META_KEY);
  const meta = metaRaw ? (JSON.parse(metaRaw) as { lastIngestAt?: number }) : {};
  const log = await loadLog(env.PLANET);
  const today = new Date(now + 9 * 3_600_000).toISOString().slice(0, 10);
  const todayRecords = log.filter((record) =>
    new Date(record.commentCreatedAt + 9 * 3_600_000).toISOString().slice(0, 10) === today,
  );
  return json(200, {
    ok: true,
    generatedAt: now,
    lastIngestAt: meta.lastIngestAt ?? null,
    replyPolicy: 'byeoli_decides_each_comment',
    approvalRequired: false,
    summary: {
      todayNew: todayRecords.length,
      decided: todayRecords.filter((record) => record.decision !== 'collected').length,
      published: todayRecords.filter((record) => record.decision === 'published').length,
      ignored: todayRecords.filter((record) => record.decision === 'ignored').length,
      failed: todayRecords.filter((record) => record.decision === 'failed').length,
    },
    claudeReady: !!env.ANTHROPIC_API_KEY,
    replies: log.slice(0, 60).map((r) => ({
      ...r,
      eligibility: r.decision === 'collected' ? draftEligibility(r, log, now) : 'already_handled',
    })),
  });
};

/* 사람의 draft/approve/reject/bookmark 조작은 폐기했다. GET은 영수증만 읽는다. */
export const onRequestPost: PagesFunction<Env> = async () => json(410, {
  ok: false,
  retired: true,
  error: 'operator_reply_controls_retired',
  policy: 'byeoli_decides_and_publishes_without_human_approval',
});
