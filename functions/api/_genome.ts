// BUILD 429-A — Observation Genome · SentenceBook 계약 (경계면만)
//
// 429의 목표는 "Claude를 붙인다"가 아니라 "오늘 별이는 어떤 말투로 세상을 바라보는가"
// (Vase 판정 2026-07-18, docs/BUILD_429_GENOME_SEASONS.md).
// 이 모듈은 타입과 구조 검증만 가진다 — 생성(429-C)·KV(429-D)는 여기 없다.
//
// 하드룰: Genome에는 라이브 별이 상태만 들어간다. 관찰자 개인 로그·식별 정보 금지(419-A §0-2).

export const BOOK_SLOTS = ['morning', 'afternoon', 'sunset', 'night'] as const;
export type BookSlot = (typeof BOOK_SLOTS)[number];

export const SEASONS = ['spring', 'summer', 'autumn', 'winter'] as const;
export type Season = (typeof SEASONS)[number];

/** 라이브 별이의 오늘 — Writing Studio의 유일한 입력. 관찰자 데이터 아님. */
export interface DailyGenome {
  date: string;                          // KST YYYY-MM-DD
  season: Season;
  weatherMix: Partial<Record<'clear' | 'cloudy' | 'fog' | 'rain' | 'snow', number>>; // 그날 비율, 합≈1
  map: string;                           // 현재 존/맵 id
  observeCount: number;                  // 오늘 관찰량
  photoCount: number;                    // 오늘 사진량
  targetDist: Record<string, number>;    // registry id → 오늘 마주친 횟수 (분포 상위만)
  events: string[];                      // 그날 world event id들
}

/** 하루 한 문체로 쓰인 시간대별 문장집. 클라이언트는 이것을 캐시해 선택만 한다. */
export interface SentenceBook {
  contractVersion: 1;
  date: string;                          // KST YYYY-MM-DD — genome.date와 일치
  slot: BookSlot;
  style: {
    rhythm: string;                      // 오늘의 문체 — 리듬 (감사·재현용 기록)
    mood: string;                        //             — 톤
  };
  sentences: Record<string, string[]>;   // 대상(registry id)·상황 키 → 문장들
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_SENTENCE_LEN = 80;             // 일기 한 줄 — 발행 글(120자)보다 짧다

/** 구조 검증. 오류 목록 반환 — 빈 배열 = 통과. 실패한 문장집은 쓰지 않고 Rule 폴백(429-F). */
export function validateSentenceBook(x: unknown): string[] {
  const errs: string[] = [];
  if (typeof x !== 'object' || x === null) return ['not an object'];
  const b = x as Record<string, unknown>;
  if (b.contractVersion !== 1) errs.push('contractVersion must be 1');
  if (typeof b.date !== 'string' || !DATE_RE.test(b.date)) errs.push('date must be YYYY-MM-DD');
  if (!BOOK_SLOTS.includes(b.slot as BookSlot)) errs.push(`slot must be one of ${BOOK_SLOTS.join('/')}`);
  const style = b.style as Record<string, unknown> | undefined;
  if (!style || typeof style.rhythm !== 'string' || !style.rhythm.trim()
      || typeof style.mood !== 'string' || !style.mood.trim()) {
    errs.push('style.rhythm/mood required — 문체 없는 문장집은 429의 목표 위반');
  }
  const s = b.sentences;
  if (typeof s !== 'object' || s === null || Array.isArray(s)) {
    errs.push('sentences must be an object map');
  } else {
    const keys = Object.keys(s as object);
    if (keys.length === 0) errs.push('sentences is empty');
    for (const k of keys) {
      const arr = (s as Record<string, unknown>)[k];
      if (!Array.isArray(arr) || arr.length === 0) { errs.push(`sentences["${k}"] must be a non-empty array`); continue; }
      for (const line of arr) {
        if (typeof line !== 'string' || !line.trim()) { errs.push(`sentences["${k}"] has a non-string/empty line`); break; }
        if (line.length > MAX_SENTENCE_LEN) { errs.push(`sentences["${k}"] has a line over ${MAX_SENTENCE_LEN} chars`); break; }
        if (/[#@]|https?:\/\//.test(line)) { errs.push(`sentences["${k}"] contains hashtag/mention/url`); break; }
      }
    }
  }
  return errs;
}

/** KV 키 규약 (429-D에서 사용) — 시간대 분할: 밤에 아침 문장이 나오지 않게. */
export function bookKey(date: string, slot: BookSlot): string {
  return `book:${date}:${slot}`;
}
