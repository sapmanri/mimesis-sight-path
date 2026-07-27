// 오늘 음악을 찾는 이유 — 게놈이 검색어를 정한다 (Vase 설계 2026-07-27)
//
// 이 파일이 뒤집는 것: 보통의 추천은 "조건에 맞는 곡을 카탈로그에서 계산해 뽑는다"이다.
// 여기서는 **별이가 오늘을 먼저 해석하고, 그 해석으로 웹을 뒤진다.** 서가(YouTube·Spotify)는
// 마지막에 음원이 있는지 확인하는 곳일 뿐 음악을 발견하는 두뇌가 아니다.
//
// ⚠ **게놈을 새로 만들지 않는다.** `_genome-identity.ts`에 이미 있고 규칙도 서 있다:
//     PACK_SELECTION.byeoli = ['light','movement','texture','distance']
//     "Daily는 순서만 바꿀 수 있고, 없던 것을 새로 보게 만들지는 못한다"
//   음악을 찾을 때도 그 규칙이 그대로다. 별이는 자기가 보는 것으로만 음악을 찾는다.
//   같은 빈 의자를 봐도 다른 팩은 다른 방향을 찾는다 — 그게 게놈이 관점이라는 뜻이다.
//
// ⚠ 검색어는 **지어내지 않는다.** 모든 `seek` 항목은 (오늘의 관찰 줄 × 게놈의 초점)에서
//   나오고, 어디서 왔는지를 `from`·`because`로 달고 다닌다. 출처 없는 검색어는 버린다.

import { selectFrom, type SelectionFocus } from './_genome-identity.ts';
import type { DayMemory } from './_memory-event.ts';
import { recentlyChosen, seen, type SongArchive } from './_song-archive.ts';

/** 초점이 음악에서는 무엇을 뜻하는가. 어휘지 검열이 아니다 — 실제 문구는 별이가 만든다.
    (사전을 두는 이유: 초점이 곧바로 검색어가 되면 'light'가 그대로 나가버린다) */
export const FOCUS_MUSIC_HINTS: Record<SelectionFocus, string[]> = {
  light:      ['빛의 세기', '아침인지 저녁인지', '밝기의 변화'],
  movement:   ['움직임이 있는지 멎었는지', '오가는 것', '반복되는 걸음'],
  texture:    ['소리의 결', '악기의 질감', '거칠거나 부드러운 녹음'],
  distance:   ['가까움과 멂', '떨어져 있음', '다가오는 것'],
  quantity:   ['많고 적음', '쌓인 것', '비어 있음'],
  position:   ['어디에 놓였는지', '자리'],
  object:     ['사물 자체', '남겨진 물건'],
  structure:  ['짜임', '반복되는 구조'],
  line:       ['이어짐', '끊김'],
  proportion: ['균형', '한쪽으로 기욺'],
  time:       ['머무름', '지나감', '아직 끝나지 않음'],
};

/** 이 팩이 **음악에서 늘 피하는 것**. 오늘과 무관하게 서 있는 성향이다.
    ⚠ 고를 것보다 안 고를 것을 먼저 정하는 게 선곡에서 더 강하다 (Vase). */
export const STANDING_AVOID: Record<string, string[]> = {
  byeoli: ['절망적인 이별', '과도하게 밝은 음악', '직접적인 위로'],
  'dry-report': ['감정 과잉', '서사적인 해설'],
};

export interface SeekTerm {
  term: string;                 // 찾을 방향 (별이의 말)
  from: SelectionFocus;         // 어느 초점에서 나왔나
  because: string;              // 오늘의 어느 관찰 줄에서 나왔나 — 출처
}

export interface SearchIntent {
  date: string;
  pack: string;
  /** 오늘의 한 장면. 검색의 중심이 되는 이미지 */
  centralImage: string | null;
  seek: SeekTerm[];
  avoid: string[];
  /** 이 초점 순서로 본다 — 게놈이 정하고 오늘이 순서만 바꾼다 */
  focusOrder: SelectionFocus[];
  /** 최근 고른 곡 — 웹에서 후보를 모을 때 이미 제외한다 */
  excludeKeys: string[];
  /** 오늘의 관찰 줄 그대로. 별이가 검색어를 지을 때 쓰는 재료 */
  material: string[];
}

/** 오늘은 쉬는 날인가. **빈 하루를 지어내지 않는다** — 그림일기·심전도와 같은 규칙.
    관찰이 없으면 선곡도 없다. 매일 억지로 한 곡을 짜내면 그건 사는 게 아니라 뱉는 것이다. */
export function restReason(day: DayMemory | null): string | null {
  if (!day) return 'no_day';
  const lines = day.event?.lines ?? [];
  if (!lines.length) return 'no_observations';
  if (!day.event?.targetLabel && lines.length < 2) return 'too_thin';
  return null;
}

export interface IntentInput {
  day: DayMemory;
  pack: string;
  /** 오늘이 초점 **순서만** 바꾸는 자리. 없던 초점을 넣으면 게놈이 거부한다. */
  focusOrder?: SelectionFocus[];
  archive: SongArchive;
  todayKst: string;
  /** 며칠 안에 고른 곡을 피할지 */
  avoidDays?: number;
}

export function buildIntent(inp: IntentInput): { intent: SearchIntent | null; rest: string | null; errors: string[] } {
  const rest = restReason(inp.day);
  if (rest) return { intent: null, rest, errors: [] };

  const sel = selectFrom(inp.pack, inp.focusOrder ? { focusOrder: inp.focusOrder } : null);
  if (!sel.selected) return { intent: null, rest: null, errors: sel.errors };

  const lines = inp.day.event.lines;
  const seek: SeekTerm[] = [];
  // 초점 하나에 관찰 줄 하나를 짝짓는다. 짝이 없으면 그 초점은 오늘 쓰지 않는다 —
  // 재료 없는 검색어를 만들지 않기 위해서다.
  sel.selected.forEach((focus, i) => {
    const because = lines[i % lines.length];
    if (!because) return;
    for (const hint of FOCUS_MUSIC_HINTS[focus] ?? []) {
      seek.push({ term: hint, from: focus, because });
    }
  });

  const excludeKeys = [...recentlyChosen(inp.archive, inp.avoidDays ?? 7, inp.todayKst)];

  return {
    intent: {
      date: inp.day.date,
      pack: inp.pack,
      centralImage: inp.day.event.targetLabel,
      seek,
      avoid: [...(STANDING_AVOID[inp.pack] ?? [])],
      focusOrder: sel.selected,
      excludeKeys,
      material: lines,
    },
    rest: null,
    errors: sel.errors,     // 오늘이 게놈 밖을 보려 했으면 여기 남는다 (거부는 selectFrom이 한다)
  };
}

/** 웹에서 모은 후보 하나를 거른다. **저장소가 실제로 탐색에 영향을 준다** — 그게 저장소를 두는 이유다. */
export interface Candidate { key: string; title: string; artist: string; note?: string }

export function screen(
  c: Candidate, intent: SearchIntent, archive: SongArchive,
): { keep: boolean; why: string | null } {
  if (intent.excludeKeys.includes(c.key)) return { keep: false, why: 'recently_chosen' };

  const prev = seen(archive, c.key);
  // 전에 탈락시킨 곡은 그 사유를 그대로 들고 다시 걸린다 — 같은 조사를 두 번 하지 않는다
  if (prev?.verdict === 'rejected' && prev.rejectedReason) {
    return { keep: false, why: `rejected_before: ${prev.rejectedReason}` };
  }
  // 피하기로 한 것이 후보 설명에 그대로 있으면 거른다
  const hay = `${c.title} ${c.artist} ${c.note ?? ''}`;
  for (const a of intent.avoid) {
    if (a && hay.includes(a)) return { keep: false, why: `avoid: ${a}` };
  }
  return { keep: true, why: null };
}
