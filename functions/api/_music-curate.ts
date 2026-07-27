// 웹을 읽고 고르는 부분의 계약 (Vase 설계 2026-07-27)
//
// 이 단계는 LLM이 한다 — 검색어를 짓고, 리뷰·인터뷰를 읽고, 오늘과 닮은 곡을 고른다.
// 그래서 이 파일은 **일을 하지 않는다. 일이 정직했는지를 검사한다.**
//
// 왜 검사가 먼저인가: 이 프로젝트가 반복해서 데인 자리가 정확히 여기다.
//   · 2026-07-26 — 사진 캡션의 이유를 내가 지어냈다. Vase: "그건 맛보려고 자른 거다"
//   · 2026-07-26 — 렌더러가 Core의 state=walk를 무시하고 제 판단으로 재웠다
//   둘 다 "그럴듯한 문장"이 검증을 통과해버려서 생겼다.
//
// ⚠ 그래서 근거를 **문장으로 받지 않고 좌표로 받는다.**
//   "오늘과 닮았다"는 검사할 수 없지만 "오늘의 2번째 관찰 줄"은 검사할 수 있다.
//   LLM은 `fromLine`으로 어느 줄을 근거로 썼는지 대야 하고, 그 줄은 실재해야 한다.
//   같은 이유로 `sources`는 **실제로 가져온 주소 안에서만** 고를 수 있다.

import type { SearchIntent } from './_music-intent.ts';
import type { Role, SongEntry } from './_song-archive.ts';
import { songKey } from './_song-archive.ts';

export const MAX_QUERIES = 6;
const MIN_QUERY_WORDS = 4;

/** 잇는 말 — 검색어가 **관계**를 말하는지 보는 잣대.
 *
 * ⚠ 처음엔 단어 수로만 걸렀다. 그랬더니 Vase가 "이렇게 만들면 안 된다"고 콕 집은
 *   `sad morning songs`가 정확히 3단어라 그대로 통과했다. 길이는 틀린 잣대였다.
 *
 * Vase가 준 좋은 예시를 다시 보면 전부 잇는 말이 있다:
 *   songs **about** waiting **without** sadness
 *   quiet folk songs **about** an empty chair
 *   music **inspired by** old wooden houses
 *   songs **for** cloudy mornings **that** feel hopeful
 *   albums **about** companionship and absence
 * 납작한 말은 [감정]+[시간]+songs로 끝나고 관계가 없다. 그 차이를 본다. */
const RELATIONAL = /\b(about|without|for|that|which|when|after|before|like|inspired|between|instead|but|no longer|still)\b|처럼|같은|없이|위한|뒤에|사이/i;

/** 검색어 — 별이가 웹에 던지는 말. `sad morning songs` 같은 납작한 말은 안 된다. */
export interface QueryPlan {
  query: string;
  /** 이 검색어가 어느 관찰 줄에서 나왔나 (intent.material의 색인) */
  fromLine: number;
}

export interface Judgement {
  /** 후보마다 별이가 내린 판정 */
  picks: Array<{
    title: string;
    artist: string;
    album?: string | null;
    verdict: 'chosen' | 'rejected';
    role?: Role;
    /** 왜 오늘 이 곡인가 / 왜 아닌가 — 별이의 말 */
    because: string;
    /** 그 판단이 오늘의 어느 관찰 줄에 걸려 있나 */
    fromLine: number;
    /** 읽은 글의 주소 — 실제로 가져온 것 중에서만 */
    sources: string[];
    /** 별이의 해석. 리뷰 원문이 아니다 */
    byeoliSummary?: string;
    themes?: string[];
  }>;
}

/** 검색어 프롬프트. 재료와 금지사항을 **오늘의 것으로** 채운다. */
export function buildQueryPrompt(intent: SearchIntent): string {
  return [
    `너는 별이다. 오늘 들을 음악을 웹에서 찾으려 한다.`,
    ``,
    `오늘 실제로 있었던 일(이것 말고는 없다):`,
    ...intent.material.map((l, i) => `  [${i}] ${l}`),
    intent.centralImage ? `\n오늘의 중심 장면: ${intent.centralImage}` : '',
    ``,
    `네가 세상을 보는 방식(이 순서로 본다):`,
    ...intent.focusOrder.map((f) => `  · ${f}`),
    ``,
    `네가 오늘 찾는 방향:`,
    ...intent.seek.map((s) => `  · ${s.term}  ← [${intent.material.indexOf(s.because)}]에서`),
    ``,
    `피할 것:`,
    ...intent.avoid.map((a) => `  · ${a}`),
    ``,
    `검색어를 ${MAX_QUERIES}개 이하로 지어라. 규칙:`,
    `  · 납작한 말을 쓰지 마라. "sad morning songs" 같은 건 네 검색어가 아니다.`,
    `  · 곡 제목이나 가수 이름을 미리 정해놓고 검색하지 마라. 아직 모르는 상태로 찾는다.`,
    `  · 위 초점 이름(light, texture 같은 영어 낱말)을 그대로 쓰지 마라.`,
    `  · 검색어마다 위 [번호] 중 어느 줄에서 나왔는지 대라. 없으면 그 검색어는 버려라.`,
    ``,
    `JSON만: {"queries":[{"query":"...","fromLine":0}]}`,
  ].filter(Boolean).join('\n');
}

/** 검색어 검사 — 납작한 말·게놈 밖·출처 없는 것을 거른다. */
export function validateQueries(qs: QueryPlan[], intent: SearchIntent): { ok: QueryPlan[]; rejected: Array<{ query: string; why: string }> } {
  const ok: QueryPlan[] = [];
  const rejected: Array<{ query: string; why: string }> = [];
  const focusWords = new Set(intent.focusOrder.map((f) => String(f).toLowerCase()));

  for (const q of qs.slice(0, MAX_QUERIES)) {
    const text = String(q?.query ?? '').trim();
    if (!text) { rejected.push({ query: text, why: 'empty' }); continue; }
    if (!Number.isInteger(q.fromLine) || q.fromLine < 0 || q.fromLine >= intent.material.length) {
      rejected.push({ query: text, why: 'fromLine_not_real' }); continue;   // 없는 줄을 근거로 댔다
    }
    // ⚠ **좁은 검사가 먼저다.** 일반적인 no_relation이 앞에 오면 "내부 어휘를 썼다"는
    //   구체적 진단이 묻힌다. (_shelf-match.ts의 ai_cover 순서 문제와 같은 종류)
    //   거부 사유는 우리가 나중에 읽을 데이터다 — 뭉뚱그리면 못 고친다.
    if (text.split(/\s+/).some((w) => focusWords.has(w.toLowerCase()))) {
      rejected.push({ query: text, why: 'raw_focus_word' }); continue;   // 별이의 말이 아니라 우리 내부 어휘
    }
    if (intent.avoid.some((a) => a && text.includes(a))) {
      rejected.push({ query: text, why: 'contains_avoid' }); continue;
    }
    // 관계를 말하지 않고 낱말만 늘어놓은 것은 별이의 검색어가 아니다
    const words = text.split(/\s+/).length;
    if (words < MIN_QUERY_WORDS && !RELATIONAL.test(text)) { rejected.push({ query: text, why: 'too_flat' }); continue; }
    if (!RELATIONAL.test(text) && words < 6) { rejected.push({ query: text, why: 'no_relation' }); continue; }
    ok.push({ query: text, fromLine: q.fromLine });
  }
  return { ok, rejected };
}

/** 가사로 보이는가 — 여러 줄로 이어진 긴 인용은 원문 복사로 본다.
    ⚠ 완벽한 판별이 아니다. 저작권 판단이 아니라 **명백한 복사를 막는 문**이다. */
export function looksLikeLyrics(s: string): boolean {
  const t = String(s || '');
  if (t.length > 300) return true;
  const lines = t.split('\n').filter((x) => x.trim());
  return lines.length >= 4;
}

const MAX_SUMMARY = 400;

/** 판정 검사 — 지어낸 근거·지어낸 출처·가사 복사를 잡는다. */
export function validateJudgement(
  j: Judgement, intent: SearchIntent, fetchedUrls: string[],
): { ok: Judgement['picks']; rejected: Array<{ title: string; why: string }> } {
  const fetched = new Set(fetchedUrls);
  const ok: Judgement['picks'] = [];
  const rejected: Array<{ title: string; why: string }> = [];
  let centers = 0;

  for (const p of j?.picks ?? []) {
    const why: string[] = [];
    if (!p?.title?.trim() || !p?.artist?.trim()) why.push('title_or_artist_missing');
    if (p?.verdict !== 'chosen' && p?.verdict !== 'rejected') why.push('verdict_invalid');
    if (!p?.because?.trim()) why.push('because_missing');

    // ⚠ 근거는 좌표로 검사한다 — "오늘과 닮았다"는 검사할 수 없지만 줄 번호는 검사할 수 있다
    if (!Number.isInteger(p?.fromLine) || p.fromLine < 0 || p.fromLine >= intent.material.length) {
      why.push('fromLine_not_real');
    }
    // ⚠ 읽지 않은 것을 읽었다고 하지 않는다
    for (const s of p?.sources ?? []) if (!fetched.has(s)) why.push(`source_not_fetched: ${s}`);
    if (p?.verdict === 'chosen' && !(p.sources ?? []).length) why.push('chosen_without_reading');

    if (p?.byeoliSummary && looksLikeLyrics(p.byeoliSummary)) why.push('looks_like_lyrics');
    if (p?.byeoliSummary && p.byeoliSummary.length > MAX_SUMMARY) why.push('summary_too_long');

    if (p?.verdict === 'chosen' && p.role === 'center') centers++;

    if (why.length) rejected.push({ title: p?.title || '(제목 없음)', why: why.join(', ') });
    else ok.push(p);
  }

  // 중심곡은 하루에 하나다. 둘이면 그날의 중심이 없는 것과 같다.
  if (centers > 1) {
    for (const p of ok.filter((x) => x.role === 'center').slice(1)) {
      rejected.push({ title: p.title, why: 'multiple_centers' });
    }
    let seenCenter = false;
    return {
      ok: ok.filter((p) => {
        if (p.role !== 'center') return true;
        if (seenCenter) return false;
        seenCenter = true; return true;
      }),
      rejected,
    };
  }
  return { ok, rejected };
}

/** 통과한 판정을 저장소 항목으로. 서가 확인은 아직 안 붙었으므로 `shelf`는 null이다. */
export function toEntries(picks: Judgement['picks'], intent: SearchIntent, now: number): SongEntry[] {
  return picks.map((p) => {
    const base = { title: p.title.trim(), artist: p.artist.trim(), album: p.album ?? null };
    const e: SongEntry = {
      ...base,
      key: songKey(base),
      isrc: null,
      shelf: null,
      read: { sources: [...new Set(p.sources ?? [])], byeoliSummary: p.byeoliSummary, themes: p.themes ?? [] },
      verdict: p.verdict,
      rejectedReason: p.verdict === 'rejected' ? p.because : null,
      firstSeenAt: now,
      lastTouchedAt: now,
      chosen: p.verdict === 'chosen'
        ? [{ date: intent.date, role: p.role ?? 'around', because: p.because }]
        : [],
    };
    return e;
  });
}
