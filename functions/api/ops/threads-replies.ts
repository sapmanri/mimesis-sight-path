// BUILD 425-B/C — /api/ops/threads-replies (Ops 호스트 전용 · Access 뒤)
// 정본: docs/BUILD_425_THREADS_CAPTURE_AND_REPLY.md §4 + Vase 판정(상한 30% · 승인 발행)
//
// GET  — 댓글 목록·상한 현황. 마지막 수집 후 25분 지났으면 lazy 수집(관측소가 열려 있는 동안).
// POST — 쓰기 예외 4호. action:
//   draft   : 정책 통과한 댓글의 답글 후보를 Claude로 생성 (+⭐ 기억해둠 판정)
//   approve : Vase 승인 → 그 자리에서 Threads reply 발행 (Phase 1 — 승인 없이는 아무 말도 없다)
//   reject  : 후보 폐기 (이유 기록)
//   bookmark: ⭐ 토글 (발행 없음, 별이 내부 행위)
// 저장 금지: 토큰 · username 원문 · IP · UA (해시+마스크만).

import { getThreadsAuth, type Env as AutopostEnv } from '../autopost';
import {
  categorize, maskUsername, mergeReplies, dailyReplyCap, draftEligibility,
  repliesConfig, type ReplyRecord,
} from '../_replies';

interface Env extends AutopostEnv {
  ANTHROPIC_API_KEY?: string;
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

async function loadLog(kv: KVNamespace): Promise<ReplyRecord[]> {
  const raw = await kv.get(repliesConfig.LOG_KEY);
  return raw ? (JSON.parse(raw) as ReplyRecord[]) : [];
}
const saveLog = (kv: KVNamespace, log: ReplyRecord[]) =>
  kv.put(repliesConfig.LOG_KEY, JSON.stringify(log));

/* ── 수집 — 최근 발행물의 top-level 댓글 (Threads /replies) ── */
async function runIngest(env: Env): Promise<{ ok: boolean; error: string | null; added: number }> {
  const auth = await getThreadsAuth(env);
  if (!auth) return { ok: false, error: 'auth_missing', added: 0 };

  // 우리 계정 답글 제외용 username
  let myUsername = '';
  try {
    const meRes = await fetch(`${THREADS_API}/me?fields=username&access_token=${encodeURIComponent(auth.token)}`);
    const me = (await meRes.json()) as { username?: string };
    myUsername = me.username ?? '';
  } catch { /* 못 얻으면 제외 없이 진행 */ }

  // 대상 게시물: publish_log의 성공 발행 media id
  const publishRaw = await env.PLANET.get('publish_log');
  const runs = publishRaw ? (JSON.parse(publishRaw) as { threads?: { ok?: boolean; requestId?: string | null } }[]) : [];
  const mediaIds = [...new Set(
    runs.filter((r) => r.threads?.ok && r.threads.requestId).map((r) => r.threads!.requestId as string),
  )].slice(0, repliesConfig.POSTS_TO_CHECK);

  const incoming: ReplyRecord[] = [];
  const now = Date.now();
  for (const mediaId of mediaIds) {
    try {
      const u = new URL(`${THREADS_API}/${mediaId}/replies`);
      u.searchParams.set('fields', 'id,text,timestamp,username');
      u.searchParams.set('reverse', 'true');
      u.searchParams.set('access_token', auth.token);
      const res = await fetch(u.toString());
      if (!res.ok) continue;
      const data = (await res.json()) as { data?: { id: string; text?: string; timestamp?: string; username?: string }[] };
      for (const reply of data.data ?? []) {
        if (!reply.id || !reply.username) continue;
        if (myUsername && reply.username === myUsername) continue; // 별이 자신의 답글
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
          approvedAt: null, publishedAt: null,
          threads: { errorCode: null, requestId: null }, modelVersion: null,
        });
      }
    } catch { /* 게시물 하나 실패는 전체를 막지 않는다 */ }
  }

  const log = await loadLog(env.PLANET);
  const merged = mergeReplies(log, incoming);
  await saveLog(env.PLANET, merged.log);
  await env.PLANET.put(repliesConfig.INGEST_META_KEY, JSON.stringify({ lastIngestAt: now, added: merged.added, checked: mediaIds.length }));
  return { ok: true, error: null, added: merged.added };
}

/* ── 후보 생성 — 별이 문체 계약 (지시서 D) ── */
const STYLE_SYSTEM = `너는 '별이'다. 픽셀 세계를 천천히 걸으며 사물을 관찰하는 존재이고, 지금 네 산책 게시물에 달린 댓글 하나에 답할지 결정한다.

문체 규칙(절대):
- **반말.** 존댓말 절대 금지 — "~요", "~습니다", "~주셨네요" 같은 어미가 하나라도 나오면 실패다.
  네 게시글과 같은 말투: "파도 소리를 오래 들으면 아무 생각도 안 나. 그게 좋아서 자꾸 바다에 와."
- 한두 문장. 짧고 담담하게. 과장·이모지·감탄사 없음.
- 댓글을 이해했다는 흔적이 한 조각 들어간다.
- "고마워"류 인사 반복 금지. 과도한 친밀감 금지. 인간인 척 금지.
- 모르는 사실을 지어내지 않는다. 실제로 보지 않은 것을 봤다고 하지 않는다.
- 다음 행동을 약속하지 않는다. 상대와의 과거 관계를 기억한다고 말하지 않는다.
- 비난·도발·정치·의료·법률·개인정보성 댓글이거나 답이 애매하면 답하지 않는다.

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
      body: JSON.stringify({ model: CLAUDE_MODEL, max_tokens: 300, system: STYLE_SYSTEM, messages }),
    });
    if (!res.ok) return { error: `claude_http_${res.status}` };
    const data = (await res.json()) as { content?: { type: string; text?: string }[] };
    const text = data.content?.find((c) => c.type === 'text')?.text ?? '';
    const m = text.match(/\{[\s\S]*\}/);
    if (!m) return { error: 'claude_bad_output' };
    const out = JSON.parse(m[0]) as { reply?: unknown; bookmark?: unknown; reason?: unknown };
    const reply = typeof out.reply === 'string' && out.reply.trim() ? out.reply.trim().slice(0, 300) : null;
    return { reply, bookmark: out.bookmark === true, reason: String(out.reason ?? '').slice(0, 200) };
  } catch { return { error: 'claude_network' }; }
}

async function generateDraft(
  env: Env, rec: ReplyRecord, postText: string | null, diaryLines: string[],
): Promise<{ reply: string | null; bookmark: boolean; reason: string; model: string } | { error: string }> {
  if (!env.ANTHROPIC_API_KEY) return { error: 'claude_key_missing' };
  const context = [
    postText ? `원 게시물: ${postText}` : null,
    diaryLines.length ? `그 엽서의 관찰일기:\n${diaryLines.join('\n')}` : null,
    `댓글: ${rec.text}`,
  ].filter(Boolean).join('\n\n');

  let out = await callClaude(env, [{ role: 'user', content: context }]);
  if ('error' in out) return out;
  // 존댓말 가드 — 걸리면 한 번 더, 그래도 존댓말이면 실패 처리(승인 전 단계라 안전)
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
async function publishReply(env: Env, replyToId: string, text: string):
  Promise<{ ok: boolean; errorCode: string | null; requestId: string | null }> {
  const auth = await getThreadsAuth(env);
  if (!auth) return { ok: false, errorCode: 'auth_missing', requestId: null };
  const create = new URL(`${THREADS_API}/me/threads`);
  create.searchParams.set('media_type', 'TEXT');
  create.searchParams.set('text', text.slice(0, 500));
  create.searchParams.set('reply_to_id', replyToId);
  create.searchParams.set('access_token', auth.token);
  let containerId = '';
  try {
    const r = await fetch(create.toString(), { method: 'POST' });
    const j = (await r.json()) as { id?: string; error?: { code?: number; fbtrace_id?: string } };
    if (!r.ok || !j.id) return { ok: false, errorCode: String(j.error?.code ?? `http_${r.status}`), requestId: j.error?.fbtrace_id ?? null };
    containerId = j.id;
  } catch { return { ok: false, errorCode: 'network', requestId: null }; }
  const publish = new URL(`${THREADS_API}/${auth.userId}/threads_publish`);
  publish.searchParams.set('creation_id', containerId);
  publish.searchParams.set('access_token', auth.token);
  let last: { ok: boolean; errorCode: string | null; requestId: string | null } = { ok: false, errorCode: 'unknown', requestId: null };
  for (let attempt = 0; attempt < 6; attempt += 1) {
    if (attempt > 0) await new Promise((r) => setTimeout(r, 5000));
    try {
      const r = await fetch(publish.toString(), { method: 'POST' });
      const j = (await r.json()) as { id?: string; error?: { code?: number; fbtrace_id?: string } };
      if (r.ok && j.id) return { ok: true, errorCode: null, requestId: j.id };
      last = { ok: false, errorCode: String(j.error?.code ?? `http_${r.status}`), requestId: j.error?.fbtrace_id ?? null };
    } catch { last = { ok: false, errorCode: 'network', requestId: null }; }
  }
  return last;
}

/* ── GET — 목록 + lazy 수집 ── */
export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const now = Date.now();
  const metaRaw = await env.PLANET.get(repliesConfig.INGEST_META_KEY);
  const meta = metaRaw ? (JSON.parse(metaRaw) as { lastIngestAt?: number }) : {};
  const force = new URL(request.url).searchParams.get('force') === '1';
  let ingest: { ranNow: boolean; error: string | null; added: number } = { ranNow: false, error: null, added: 0 };
  if (force || now - (meta.lastIngestAt ?? 0) > repliesConfig.INGEST_MIN_MS) {
    const r = await runIngest(env);
    ingest = { ranNow: true, error: r.error, added: r.added };
  }
  const log = await loadLog(env.PLANET);
  const capInfo = dailyReplyCap(log, now);
  return json(200, {
    ok: true,
    generatedAt: now,
    lastIngestAt: ingest.ranNow ? now : (meta.lastIngestAt ?? null),
    ingest,
    cap: capInfo,
    claudeReady: !!env.ANTHROPIC_API_KEY,
    replies: log.slice(0, 60).map((r) => ({
      ...r,
      eligibility: r.decision === 'collected' ? draftEligibility(r, log, now) : null,
    })),
  });
};

/* ── POST — draft / approve / reject / bookmark (쓰기 예외 4호, Access 감사) ── */
interface PostBody { action?: string; sourceCommentId?: string; reason?: string }

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const requestedBy = request.headers.get('cf-access-authenticated-user-email') ?? 'unknown';
  let body: PostBody;
  try { body = (await request.json()) as PostBody; } catch { return json(400, { ok: false, error: 'bad_json' }); }
  const log = await loadLog(env.PLANET);
  const rec = log.find((r) => r.sourceCommentId === body.sourceCommentId);
  if (!rec) return json(404, { ok: false, error: 'not_found' });
  const now = Date.now();

  if (body.action === 'draft') {
    const blocked = draftEligibility(rec, log, now);
    if (blocked) return json(409, { ok: false, error: blocked });
    // 문맥: 원 게시물 텍스트(feed) + 엽서 일기(capture_meta)
    let postText: string | null = null;
    let diaryLines: string[] = [];
    try {
      const feedRaw = await env.PLANET.get('feed');
      const feed = feedRaw ? (JSON.parse(feedRaw) as { text?: string; img?: string; t?: number }[]) : [];
      const publishRaw = await env.PLANET.get('publish_log');
      const runs = publishRaw ? (JSON.parse(publishRaw) as { threads?: { requestId?: string | null }; invokedAt?: number; imageKey?: string | null }[]) : [];
      const run = runs.find((r) => r.threads?.requestId === rec.sourcePostId);
      if (run) {
        const post = feed.find((p) => Math.abs((p.t ?? 0) - (run.invokedAt ?? 0)) < 120000);
        postText = post?.text ?? null;
        if (run.imageKey) {
          const cmRaw = await env.PLANET.get('capture_meta');
          const cms = cmRaw ? (JSON.parse(cmRaw) as { r2Key: string; diaryLines?: string[] }[]) : [];
          diaryLines = cms.find((c) => c.r2Key === run.imageKey)?.diaryLines ?? [];
        }
      }
    } catch { /* 문맥 없이도 생성 가능 */ }
    const out = await generateDraft(env, rec, postText, diaryLines);
    if ('error' in out) return json(502, { ok: false, error: out.error });
    rec.bookmarked = rec.bookmarked || out.bookmark;
    rec.modelVersion = out.model;
    if (out.reply === null) {
      rec.decision = 'ignored'; rec.reason = `무응답 판단: ${out.reason}`;
    } else {
      rec.decision = 'drafted'; rec.generatedText = out.reply; rec.reason = out.reason;
    }
    await saveLog(env.PLANET, log);
    return json(200, { ok: true, record: rec });
  }

  if (body.action === 'approve') {
    if (rec.decision !== 'drafted' || !rec.generatedText) return json(409, { ok: false, error: 'not_drafted' });
    // 30% 상한은 자동 발행 전용(Vase 판정 07-19) — 사람의 승인은 막지 않는다.
    // Phase 2 자동 발행 경로가 생기면 그쪽에서 dailyReplyCap으로 daily_cap을 강제할 것.
    const result = await publishReply(env, rec.sourceCommentId, rec.generatedText);
    rec.approvedAt = now;
    rec.threads = { errorCode: result.errorCode, requestId: result.requestId };
    if (result.ok) { rec.decision = 'published'; rec.publishedAt = Date.now(); }
    else { rec.decision = 'failed'; rec.reason = `발행 실패 ${result.errorCode}`; }
    await saveLog(env.PLANET, log);
    console.log(`ops/reply-approve by=${requestedBy} comment=${rec.sourceCommentId} ok=${result.ok}`);
    return json(200, { ok: result.ok, record: rec, error: result.ok ? null : result.errorCode });
  }

  if (body.action === 'reject') {
    if (rec.decision !== 'drafted' && rec.decision !== 'collected') return json(409, { ok: false, error: 'not_rejectable' });
    rec.decision = 'ignored';
    rec.reason = (body.reason ?? '운영자 거절').slice(0, 200);
    await saveLog(env.PLANET, log);
    return json(200, { ok: true, record: rec });
  }

  if (body.action === 'bookmark') {
    rec.bookmarked = !rec.bookmarked;
    await saveLog(env.PLANET, log);
    return json(200, { ok: true, record: rec });
  }

  return json(400, { ok: false, error: 'unknown_action' });
};
