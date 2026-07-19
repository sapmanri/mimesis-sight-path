// BUILD 429-F — Permanent Fallback Chain
// 정본: docs/BUILD_429_GENOME_SEASONS.md · 순서 확정 Vase 2026-07-19 심야
//
//   1순위 genome-live   — Genome 기반 실시간 생성 (429-E)
//   2순위 genome-book   — 검증된 문장집. 별이의 주 언어가 아니라 **중간 안전망**이다
//   3순위 rule-fallback — byelli_posts 풀. 마지막 그물
//
// 이 모듈이 지키는 것: book이 주 언어로 승격되지 않게 한다. book은 오직
// live가 실패했을 때만, 그것도 오늘·이 시간대의 검증 통과분만 쓰인다.
// 밤에 아침 문장이 나오지 않게 slot을 강제한다(bookKey 규약).
//
// 순수 함수만. KV 읽기는 호출자(autopost)가 하고 여기엔 결과만 넘어온다.

import { validateSentenceBook, BOOK_SLOTS, type SentenceBook, type BookSlot } from './_genome.ts';
import { provenance, type GenomeProvenance } from './_genome-identity.ts';

/** 하늘 phase(별이 세계) → 문장집 slot(발행 구간) */
const PHASE_TO_SLOT: Record<string, BookSlot> = {
  dawn: 'morning', day: 'afternoon', dusk: 'sunset', night: 'night',
};

export function slotForPhase(skyPhase: string | null): BookSlot | null {
  return skyPhase ? (PHASE_TO_SLOT[skyPhase] ?? null) : null;
}

export interface BookPickContext {
  targetLabel: string | null;
  diaryLines: string[];
  recentTexts: string[];
  /** KST YYYY-MM-DD — book.date와 일치해야 한다 */
  date: string;
  slot: BookSlot | null;
}

const words = (s: string) => s.replace(/[.,!?…"']/g, ' ').split(/\s+/).filter((w) => w.length > 1);

/** 결정론 선택 — 같은 날·같은 키는 같은 문장으로 수렴한다(관찰자 수가 결과를 바꾸면 안 된다). */
function pickIndex(seed: string, len: number): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) { h ^= seed.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return (h >>> 0) % len;
}

export interface BookPick {
  text: string | null;
  reason: string;           // 왜 못 골랐는지 — 감사·디버깅용. 성공 시 'ok'
}

/**
 * 검증된 문장집에서 이 사건에 맞는 한 줄. 못 고르면 text=null (호출자는 다음 순위로).
 * book이 구조 검증에 실패하거나 날짜·슬롯이 어긋나면 아예 쓰지 않는다.
 */
export function pickFromBook(book: unknown, ctx: BookPickContext): BookPick {
  if (!book) return { text: null, reason: 'no_book' };
  const errs = validateSentenceBook(book);
  if (errs.length) return { text: null, reason: `invalid_book: ${errs[0]}` };
  const b = book as SentenceBook;
  if (b.date !== ctx.date) return { text: null, reason: `stale_book: ${b.date} ≠ ${ctx.date}` };
  if (ctx.slot && b.slot !== ctx.slot) return { text: null, reason: `slot_mismatch: ${b.slot} ≠ ${ctx.slot}` };

  // 이 사건과 겹치는 키 우선 — 없으면 문장집 전체에서 고른다
  const ground = [ctx.targetLabel ?? '', ...ctx.diaryLines].join(' ');
  const keys = Object.keys(b.sentences);
  const matched = keys.filter((k) => ground.includes(k) || ctx.diaryLines.some((l) => l.includes(k)));
  const pool = matched.length ? matched : keys;
  if (!pool.length) return { text: null, reason: 'empty_book' };

  // 최근 발행과 겹치는 문장은 제외 — 안전망이 반복기가 되면 안 된다
  const recentWords = ctx.recentTexts.map((t) => new Set(words(t)));
  const isRepeat = (line: string) => {
    const lw = words(line);
    if (!lw.length) return false;
    return recentWords.some((rw) => lw.filter((x) => rw.has(x)).length / lw.length >= 0.6);
  };

  const key = pool[pickIndex(`${b.date}:${b.slot}:key`, pool.length)];
  const lines = (b.sentences[key] ?? []).filter((l) => !isRepeat(l));
  if (!lines.length) {
    // 같은 pool 안에서만 한 번 더 찾는다 (한 번만 — 무한 탐색 금지).
    // pool이 '사건과 겹치는 키'로 좁혀져 있었다면 여기서 끝난다 — 라벤더 사진에 벤치
    // 문장을 붙이느니 다음 순위로 내려간다. 사실성이 문장 확보보다 앞선다.
    const alt = pool.filter((k) => k !== key).flatMap((k) => b.sentences[k] ?? []).filter((l) => !isRepeat(l));
    if (!alt.length) return { text: null, reason: 'all_recent_repeats' };
    return { text: alt[pickIndex(`${b.date}:${b.slot}:alt`, alt.length)], reason: 'ok' };
  }
  return { text: lines[pickIndex(`${b.date}:${b.slot}:${key}`, lines.length)], reason: 'ok' };
}

/* ═══ 체인 ═══════════════════════════════════════════════════════ */

export interface ChainInput {
  /** 429-E writeByeoliPost 결과. 실패했으면 null */
  liveText: string | null;
  /** KV에서 읽은 오늘·이 슬롯 문장집 (미검증 상태로 넘겨도 된다 — 여기서 검증한다) */
  book: unknown;
  /** 마지막 그물 — byelli_posts에서 이미 고른 문장 */
  poolText: string;
  ctx: BookPickContext;
}

export interface ChainResult {
  text: string;
  provenance: GenomeProvenance;
  /** 각 단계에서 왜 내려왔는지 — publish_log 감사용 */
  trail: string[];
}

/** 세 순위를 순서대로 내려간다. 어떤 실패도 발행을 멈추지 않는다(자율 시스템 보호). */
export function resolvePostText(input: ChainInput): ChainResult {
  const trail: string[] = [];

  if (input.liveText && input.liveText.trim()) {
    return { text: input.liveText, provenance: provenance('genome-live', true), trail: ['genome-live: ok'] };
  }
  trail.push('genome-live: failed');

  const picked = pickFromBook(input.book, input.ctx);
  if (picked.text) {
    trail.push('genome-book: ok');
    return { text: picked.text, provenance: provenance('genome-book', true), trail };
  }
  trail.push(`genome-book: ${picked.reason}`);

  trail.push('rule-fallback: used');
  return { text: input.poolText, provenance: provenance('rule-fallback', true), trail };
}

export { BOOK_SLOTS };
