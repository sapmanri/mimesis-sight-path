// 웹 탐색 실행 — 별이가 실제로 검색하고 읽는 자리 (Vase 설계 2026-07-27)
//
// `_music-curate.ts`는 **검사**만 한다. 이 파일이 **일을 시킨다.**
//   게놈 의도 → (LLM) 검색어 → 웹 검색 → 글을 읽음 → (LLM) 판정 → 저장소 항목
//
// ⚠ 이 파일의 존재 이유 한 줄:
//   **`fetchedUrls`를 모델이 말한 것에서 뽑지 않고 응답 블록에서 뽑는다.**
//   서버 도구(web_fetch)는 실제로 가져온 주소를 `web_fetch_tool_result`에 남긴다.
//   그 목록만 "읽은 것"으로 치기 때문에, 별이가 안 읽고 읽었다고 하면 `validateJudgement`가
//   반드시 잡는다. 검사기가 검사할 진짜 증거를 여기서 만든다.
//   (검색 결과에 뜬 주소는 **읽은 게 아니다** — 목록에서 본 것과 펼쳐 읽은 것은 다르다.)
//
// ⚠ 왜 서버 도구인가: 검색·읽기를 우리가 구현하면 별도 검색 키가 또 필요하고,
//   "무엇을 실제로 열었는가"를 우리가 기록해야 한다. 서버 도구는 그 기록을 응답에 남긴다.
//   즉 정직성 증거가 우리 코드의 성실성이 아니라 API 응답에 실린다.

import type { SearchIntent } from './_music-intent.ts';
import type { SongEntry } from './_song-archive.ts';
import {
  buildQueryPrompt, toEntries, validateJudgement, validateQueries,
  MAX_QUERIES, type Judgement, type QueryPlan,
} from './_music-curate.ts';

/** 고르는 일은 이 시스템에서 가장 판단이 무거운 자리다 — 여기서 모델을 아끼지 않는다.
    (다른 곳의 `claude-sonnet-5`는 문장 다듬기·번역이라 성격이 다르다) */
export const MUSIC_MODEL = 'claude-opus-5';

const API = 'https://api.anthropic.com/v1/messages';
const MAX_TOKENS = 16000;
/** 검색 5회·읽기 6회. 한 하루치 선곡에 이보다 더 필요하면 그건 방황이다. */
const MAX_SEARCH_USES = 5;
const MAX_FETCH_USES = 6;
/** 서버 도구가 제자리 도는 것을 막는 상한 (pause_turn 이어붙이기) */
const MAX_CONTINUATIONS = 4;

export type FetchLike = (url: string, init: unknown) => Promise<{
  ok: boolean; status: number; json: () => Promise<unknown>; text?: () => Promise<string>;
}>;

export interface MusicWebEnv {
  ANTHROPIC_API_KEY?: string;
  /** 시험에서 갈아끼운다. 없으면 진짜 fetch. */
  _fetch?: FetchLike;
}

// ── 응답 읽기 ────────────────────────────────────────────────────────────────

interface Block {
  type?: string;
  text?: string;
  name?: string;
  input?: { query?: string; url?: string };
  content?: unknown;
}

export interface Transcript {
  /** **실제로 펼쳐 읽은** 주소. 이것만 출처로 인정한다 */
  fetched: string[];
  /** 검색 결과에 뜬 주소. 읽은 것이 아니므로 출처로 인정하지 않는다 */
  seen: string[];
  /** 던진 검색어 */
  queriesRun: string[];
  /** 도구가 실패한 자리 — 조용히 넘어가지 않고 영수증에 남긴다 */
  toolErrors: string[];
  /** 별이가 마지막에 쓴 말 */
  text: string;
}

const asArray = (x: unknown): unknown[] => (Array.isArray(x) ? x : []);
const errCode = (x: unknown): string | null => {
  const c = x as { error_code?: string; type?: string } | null;
  return c && typeof c.error_code === 'string' ? c.error_code : null;
};

/** 응답 블록에서 "무엇을 실제로 했는가"를 뽑는다. 모델의 서술이 아니라 도구 기록이다. */
export function readTranscript(content: unknown, into?: Transcript): Transcript {
  const t: Transcript = into ?? { fetched: [], seen: [], queriesRun: [], toolErrors: [], text: '' };
  const texts: string[] = t.text ? [t.text] : [];

  for (const raw of asArray(content)) {
    const b = raw as Block;
    if (b?.type === 'text' && typeof b.text === 'string') { texts.push(b.text); continue; }

    if (b?.type === 'server_tool_use') {
      if (b.name === 'web_search' && b.input?.query) t.queriesRun.push(b.input.query);
      continue;
    }

    if (b?.type === 'web_search_tool_result') {
      const e = errCode(b.content);
      // ⚠ 성공은 배열, 실패는 객체다 — 색인부터 하면 실패가 조용히 빈 결과로 둔갑한다
      if (e) { t.toolErrors.push(`search: ${e}`); continue; }
      for (const r of asArray(b.content)) {
        const u = (r as { url?: string })?.url;
        if (u && !t.seen.includes(u)) t.seen.push(u);
      }
      continue;
    }

    if (b?.type === 'web_fetch_tool_result') {
      const e = errCode(b.content);
      if (e) { t.toolErrors.push(`fetch: ${e}`); continue; }
      const u = (b.content as { url?: string } | null)?.url;
      if (u && !t.fetched.includes(u)) t.fetched.push(u);
      continue;
    }
  }

  t.text = texts.join('\n').trim();
  return t;
}

/** 말 사이에 섞여 나온 JSON을 꺼낸다. 못 꺼내면 null — 억지로 짜맞추지 않는다. */
export function extractJson<T = unknown>(text: string): T | null {
  const s = String(text ?? '').trim();
  if (!s) return null;
  const tryParse = (x: string): T | null => { try { return JSON.parse(x) as T; } catch { return null; } };

  const direct = tryParse(s);
  if (direct) return direct;

  const fenced = /```(?:json)?\s*([\s\S]*?)```/.exec(s);
  if (fenced) { const p = tryParse(fenced[1].trim()); if (p) return p; }

  // 마지막 수단 — 괄호 균형을 세어 가장 바깥 객체를 자른다 (문자열 안의 괄호는 세지 않는다)
  const start = s.indexOf('{');
  if (start < 0) return null;
  let depth = 0, inStr = false, esc = false;
  for (let i = start; i < s.length; i++) {
    const ch = s[i];
    if (esc) { esc = false; continue; }
    if (ch === '\\') { esc = true; continue; }
    if (ch === '"') { inStr = !inStr; continue; }
    if (inStr) continue;
    if (ch === '{') depth++;
    else if (ch === '}' && --depth === 0) return tryParse(s.slice(start, i + 1));
  }
  return null;
}

// ── API 호출 ─────────────────────────────────────────────────────────────────

interface ClaudeResult { content: unknown[]; stopReason: string | null; error: string | null }

interface SseEvent {
  type?: string;
  index?: number;
  content_block?: Record<string, unknown>;
  delta?: { type?: string; text?: string; thinking?: string; partial_json?: string; stop_reason?: string };
}

/**
 * 스트림을 읽어 완성된 content 블록으로 되돌린다.
 *
 * ⚠ **이 함수가 생긴 이유가 실사고다 (2026-07-27).** 웹 검색·읽기가 붙은 호출을
 *   스트리밍 없이 보냈다가 145초 만에 `524`(시간 초과)로 죽었다. 검색어 6개는 이미
 *   만들어진 뒤였는데 그 일이 통째로 버려졌다. 도구가 붙은 호출은 몇 분이 걸릴 수
 *   있고, 스트리밍은 그동안 연결을 살아 있게 한다.
 */
async function readSse(body: ReadableStream<Uint8Array>): Promise<{ content: unknown[]; stopReason: string | null }> {
  const reader = body.getReader();
  const dec = new TextDecoder();
  const blocks: Array<Record<string, unknown>> = [];
  const partialJson: Record<number, string> = {};
  let buf = '';
  let stopReason: string | null = null;

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });

    let nl: number;
    while ((nl = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (!line.startsWith('data:')) continue;          // event: 줄과 빈 줄은 버린다
      const payload = line.slice(5).trim();
      if (!payload || payload === '[DONE]') continue;

      let ev: SseEvent;
      try { ev = JSON.parse(payload) as SseEvent; } catch { continue; }
      const i = ev.index ?? 0;

      if (ev.type === 'content_block_start') {
        blocks[i] = { ...(ev.content_block ?? {}) };
        partialJson[i] = '';
      } else if (ev.type === 'content_block_delta' && blocks[i]) {
        const d = ev.delta ?? {};
        if (d.type === 'text_delta') blocks[i].text = `${blocks[i].text ?? ''}${d.text ?? ''}`;
        else if (d.type === 'thinking_delta') blocks[i].thinking = `${blocks[i].thinking ?? ''}${d.thinking ?? ''}`;
        else if (d.type === 'input_json_delta') partialJson[i] += d.partial_json ?? '';
      } else if (ev.type === 'content_block_stop' && blocks[i] && partialJson[i]) {
        // 도구 입력은 조각난 JSON으로 온다 — 다 모인 뒤에 한 번 파싱한다
        try { blocks[i].input = JSON.parse(partialJson[i]); } catch { /* 못 읽으면 그대로 둔다 */ }
      } else if (ev.type === 'message_delta' && ev.delta?.stop_reason) {
        stopReason = ev.delta.stop_reason;
      }
    }
  }
  return { content: blocks.filter(Boolean), stopReason };
}

async function callClaude(
  env: MusicWebEnv, body: Record<string, unknown>, stream = false,
): Promise<ClaudeResult> {
  const doFetch = env._fetch ?? ((u: string, i: unknown) => fetch(u, i as RequestInit));
  try {
    const res = await doFetch(API, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': env.ANTHROPIC_API_KEY as string,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(stream ? { ...body, stream: true } : body),
    });
    if (!res.ok) return { content: [], stopReason: null, error: `claude_${res.status}` };

    // 스트림이 실제로 오면 읽고, 아니면(시험의 가짜 등) 평소대로 본문을 읽는다
    const rs = (res as { body?: ReadableStream<Uint8Array> }).body;
    if (stream && rs && typeof rs.getReader === 'function') {
      return { ...(await readSse(rs)), error: null };
    }
    const j = (await res.json()) as { content?: unknown[]; stop_reason?: string };
    return { content: j.content ?? [], stopReason: j.stop_reason ?? null, error: null };
  } catch (e) {
    return { content: [], stopReason: null, error: `claude_failed: ${(e as Error).message}` };
  }
}

/** 서버 도구는 제 한도에 걸리면 `pause_turn`으로 멈춘다. 그때는 이어서 다시 부른다.
    ⚠ "계속해"라고 새 사람 말을 덧붙이면 안 된다 — 지금까지의 답만 돌려주면 서버가 이어간다. */
async function runWithTools(
  env: MusicWebEnv, messages: unknown[], tools: unknown[],
): Promise<{ transcript: Transcript; error: string | null }> {
  const msgs = [...messages];
  const transcript = readTranscript([]);
  for (let i = 0; i <= MAX_CONTINUATIONS; i++) {
    // ⚠ 도구가 붙은 호출은 반드시 스트리밍이다. 안 그러면 524로 죽는다 (2026-07-27 실사고)
    const r = await callClaude(env, {
      model: MUSIC_MODEL, max_tokens: MAX_TOKENS,
      thinking: { type: 'adaptive' },
      tools, messages: msgs,
    }, true);
    if (r.error) return { transcript, error: r.error };
    readTranscript(r.content, transcript);
    if (r.stopReason !== 'pause_turn') return { transcript, error: null };
    msgs.push({ role: 'assistant', content: r.content });
  }
  // 상한까지 갔는데 안 끝났으면 못 끝냈다고 말한다 — 도중 결과를 완성본인 척하지 않는다
  return { transcript, error: 'paused_too_many_times' };
}

// ── 1단계: 검색어 ────────────────────────────────────────────────────────────

export interface QueryStep {
  queries: QueryPlan[];
  rejected: Array<{ query: string; why: string }>;
  error: string | null;
}

/** 게놈 의도로 검색어를 짓게 하고, 그 자리에서 검사해 통과한 것만 남긴다. */
export async function planQueries(env: MusicWebEnv, intent: SearchIntent): Promise<QueryStep> {
  if (!env.ANTHROPIC_API_KEY) return { queries: [], rejected: [], error: 'anthropic_key_missing' };

  const r = await callClaude(env, {
    model: MUSIC_MODEL, max_tokens: 2000,
    thinking: { type: 'adaptive' },
    messages: [{ role: 'user', content: buildQueryPrompt(intent) }],
  });
  if (r.error) return { queries: [], rejected: [], error: r.error };

  const parsed = extractJson<{ queries?: QueryPlan[] }>(readTranscript(r.content).text);
  if (!parsed) return { queries: [], rejected: [], error: 'query_json_unreadable' };

  const { ok, rejected } = validateQueries(parsed.queries ?? [], intent);
  return { queries: ok, rejected, error: null };
}

// ── 2단계: 찾아 읽고 판정 ────────────────────────────────────────────────────

/** 조사 프롬프트. **읽지 않고 고를 수 없다**는 규칙을 프롬프트에도 코드에도 동시에 둔다.
    (프롬프트만 두면 지킬 거라 믿는 것이고, 코드만 두면 왜 떨어졌는지 별이가 모른다) */
export function buildInvestigatePrompt(intent: SearchIntent, queries: QueryPlan[]): string {
  return [
    `너는 별이다. 오늘 들을 음악을 웹에서 직접 찾아 읽고 고른다.`,
    ``,
    `오늘 실제로 있었던 일(이것 말고는 없다):`,
    ...intent.material.map((l, i) => `  [${i}] ${l}`),
    intent.centralImage ? `오늘의 중심 장면: ${intent.centralImage}` : '',
    ``,
    `네가 지은 검색어:`,
    ...queries.map((q) => `  · ${q.query}   ← [${q.fromLine}]`),
    ``,
    `피할 것:`,
    ...intent.avoid.map((a) => `  · ${a}`),
    intent.excludeKeys.length ? `\n최근에 이미 고른 곡이 있다 — 같은 곡을 또 고르지 마라.` : '',
    ``,
    `하는 순서:`,
    `  1. web_search로 위 검색어를 던진다.`,
    `  2. 그중 실제로 읽을 값이 있는 글(리뷰·인터뷰·해설)을 web_fetch로 **펼쳐 읽는다.**`,
    `  3. 읽은 내용으로 곡을 고른다.`,
    ``,
    `⚠ 규칙 — 어기면 그 곡은 버려진다:`,
    `  · sources에는 **web_fetch로 실제로 펼쳐 읽은 주소만** 적어라.`,
    `    검색 결과 목록에서 본 주소는 읽은 것이 아니다. 기억나는 주소를 적어서도 안 된다.`,
    `  · 고른 곡(chosen)은 반드시 읽은 글이 하나 이상 있어야 한다. 읽지 않고 고를 수 없다.`,
    `  · fromLine은 위 [번호] 중 하나 — 그 판단이 오늘의 어느 줄에 걸려 있는지 대라.`,
    `  · byeoliSummary는 **네 해석**이다. 가사나 리뷰 원문을 옮기지 마라.`,
    `  · 중심곡(role: center)은 하루에 하나뿐이다. 나머지는 around.`,
    `  · 오늘과 닮지 않은 곡은 억지로 고르지 말고 verdict: "rejected"로 왜 아닌지 남겨라.`,
    `    ⚠ 아무것도 고르지 못했다면 picks를 빈 배열로 두어라. 지어내는 것보다 낫다.`,
    ``,
    `다 읽은 뒤 마지막 답으로 JSON만 내라:`,
    `{"picks":[{"title":"","artist":"","album":null,"verdict":"chosen","role":"center",`,
    `"because":"","fromLine":0,"sources":[""],"byeoliSummary":"","themes":[]}]}`,
  ].filter(Boolean).join('\n');
}

export interface Investigation {
  picks: Judgement['picks'];
  rejected: Array<{ title: string; why: string }>;
  transcript: Transcript;
  error: string | null;
}

export async function investigate(
  env: MusicWebEnv, intent: SearchIntent, queries: QueryPlan[],
): Promise<Investigation> {
  const empty = readTranscript([]);
  if (!env.ANTHROPIC_API_KEY) return { picks: [], rejected: [], transcript: empty, error: 'anthropic_key_missing' };
  if (!queries.length) return { picks: [], rejected: [], transcript: empty, error: 'no_queries' };

  const { transcript, error } = await runWithTools(
    env,
    [{ role: 'user', content: buildInvestigatePrompt(intent, queries.slice(0, MAX_QUERIES)) }],
    [
      { type: 'web_search_20260209', name: 'web_search', max_uses: MAX_SEARCH_USES },
      { type: 'web_fetch_20260209', name: 'web_fetch', max_uses: MAX_FETCH_USES },
    ],
  );
  if (error) return { picks: [], rejected: [], transcript, error };

  const parsed = extractJson<Judgement>(transcript.text);
  if (!parsed) return { picks: [], rejected: [], transcript, error: 'judgement_json_unreadable' };

  // ⚠ 여기가 정직성의 문이다 — 출처는 `transcript.fetched`(도구 기록) 안에서만 인정된다
  const { ok, rejected } = validateJudgement(parsed, intent, transcript.fetched);
  return { picks: ok, rejected, transcript, error: null };
}

// ── 전체 ─────────────────────────────────────────────────────────────────────

export interface CurationReceipt {
  date: string;
  pack: string;
  entries: SongEntry[];
  queries: string[];
  /** 실제로 펼쳐 읽은 글 */
  read: string[];
  /** 떨어진 것들 — 사유와 함께. 조용히 버리지 않는다 */
  rejectedQueries: Array<{ query: string; why: string }>;
  rejectedPicks: Array<{ title: string; why: string }>;
  toolErrors: string[];
  error: string | null;
}

/** 오늘 하루의 선곡. 서가 확인(YouTube)은 아직 붙지 않았으므로 `entries[].shelf`는 null이다. */
export async function curateDay(
  env: MusicWebEnv, intent: SearchIntent, now: number,
): Promise<CurationReceipt> {
  const base: CurationReceipt = {
    date: intent.date, pack: intent.pack, entries: [], queries: [], read: [],
    rejectedQueries: [], rejectedPicks: [], toolErrors: [], error: null,
  };

  const q = await planQueries(env, intent);
  base.rejectedQueries = q.rejected;
  if (q.error) return { ...base, error: q.error };
  if (!q.queries.length) return { ...base, error: 'no_query_survived' };
  base.queries = q.queries.map((x) => x.query);

  const inv = await investigate(env, intent, q.queries);
  base.read = inv.transcript.fetched;
  base.toolErrors = inv.transcript.toolErrors;
  base.rejectedPicks = inv.rejected;
  if (inv.error) return { ...base, error: inv.error };

  return { ...base, entries: toEntries(inv.picks, intent, now) };
}
