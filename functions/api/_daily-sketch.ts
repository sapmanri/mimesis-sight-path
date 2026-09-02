// BUILD 431 — Daily Sketch ("별이가 기억한 오늘")
// 제안·규칙 확정: Vase 2026-07-19 심야
//
// 이것은 "AI 그림 한 장 추가"가 아니다. 행동 → 기억 → 표현이 처음으로 한 덩어리가 되는 자리다.
// 그래서 하드룰 하나가 전부를 정한다:
//
//   그림일기는 별도 콘텐츠가 아니다. 하나의 기억(MemoryEvent)에서 글·사진·그림이
//   세 갈래로 나온다. 셋이 각각 다른 사건을 만들면 실패다.
//
// 429-E와 같은 패턴: 프롬프트는 창작물이 아니라 **파생물**이다. 아래 그림체는 손으로
// 쓰지 않고 SKETCH_RULES + 별이의 Selection에서 기계 번역된다. 그림을 바꾸려면 규칙을 바꿔야 한다.
//
// 범위: 이 모듈은 **무엇을 그릴지 고르고 프롬프트를 만든다**. 이미지 생성은 하지 않는다
// (만리서재 기준 컷과 같은 경로 — 스펙은 코드가, 촬영은 외부 도구가).

import type { SelectionFocus, GenomeContext } from './_genome-identity.ts';

export const SKETCH_VERSION = '431-v1';

/* ═══ 별이의 그림 습관 ═══════════════════════════════════════════
   "어떤 AI가 그린 그림"이 아니라 "별이가 그린 그림"이 되게 하는 고정 규칙.
   매일 생성하면 스타일이 흔들리므로, 그림체를 취향이 아니라 **습관**으로 못박는다. */

export const SKETCH_RULES = [
  '흰색 또는 옅은 모눈종이 바탕',
  '남색 계열의 거친 외곽선',
  '색은 4~6개만 사용',
  '그림자와 사실적 입체 표현은 거의 없음',
  '주요 대상 1~3개만 크게 그림',
  '별, 선, 점 같은 작은 낙서가 주변에 있음',
  '비율이 정확하지 않아도 됨',
  '그날 중요하지 않았던 배경은 생략',
  '빼콩이는 실제보다 조금 더 작고 장난스럽게',
  '별이 자신은 얼굴을 세밀하게 그리지 않음',
] as const;

/**
 * 같은 규칙의 영어 렌더링. 한국어가 원본(사람이 읽고 고치는 계약)이고 영어는 **기계 번역본**이다.
 * 이미지 모델은 영어로 학습돼 있어 한국어 프롬프트를 주면 "한글 텍스트가 들어간 그림"으로
 * 오해한다(1차 시험 실패: 노란 접시에 깨진 한글이 나왔다). 인덱스가 SKETCH_RULES와 1:1이어야 한다.
 */
export const SKETCH_RULES_EN = [
  'pale graph paper with clearly visible grid lines',
  'rough navy-blue ink outlines',
  'a flat palette of four to six colors',
  'flat even fills, plain shapes',
  'one to three main subjects drawn large',
  'small doodles nearby — stars, short strokes, dots',
  'loose wobbly hand-drawn proportions',
  'bare background, only what mattered that day',
  'the cat companion small and playful',
  'the girl’s face left simple — a few dots and lines',
] as const;

/**
 * 부정문을 쓰지 않는다. 확산 모델에 `no text`라고 쓰면 "text" 개념이 오히려 활성화된다
 * (2차 실패: no text를 넣었는데 모델이 "Ppaekong" 서명을 그려 넣었다).
 * 원하지 않는 것을 말하는 대신 **원하는 결과 상태만** 서술한다.
 */
export const SKETCH_POSITIVE = [
  'drawn on unmarked pale graph paper',
  'flat scan, top-down, the drawing fills the frame',
] as const;

/** 숫자가 density보다 명확하다 — "2개 이내"는 해석의 여지가 있고 "one cat"은 없다. */
const NUM_WORD = ['zero', 'one', 'two', 'three', 'four', 'five'];
export function subjectClause(subjects: string[], max: number): string {
  const list = subjects.slice(0, max).filter(Boolean);
  if (!list.length) return `Exactly ${NUM_WORD[Math.min(max, 5)]} subject${max > 1 ? 's' : ''}, nothing else.`;
  // 숫자를 아라비아 숫자로 못박는다 — "one girl"이 두 명으로 그려진 적이 있다(7차).
  const named = `The whole drawing contains exactly ${list.map((s) => `1 ${s}`).join(', ')}.`;
  if (list.length === 1) return `${named} Just this single subject fills the page.`;
  return `${named} These ${NUM_WORD[Math.min(list.length, 5)]} are everything on the page.`;
}

/**
 * 9차(2026-07-20): 숫자 없는 캐릭터가 복제·혼성됐다(별이 2명, 별이-고양이 잡종) —
 * 별이·빼콩이 수를 **항상** 못박는다. density 예산(maxSubjects)은 소품에만 적용된다.
 * 캐릭터는 예산 밖 — 항상 있는 존재라 "대상 수 2개 이내"와 자리 다툼을 벌이면
 * 안 된다(칩 2개에 별이 몸통이 사라진 실사고).
 */
export function pinnedSubjectClause(props: string[], maxProps: number): string {
  const cleaned = props
    .map((s) => s.trim().replace(/^1\s+/, ''))       // 칩이 "1 girl"꼴이어도 이중 숫자 방지
    .filter((s) => s && !/^(girl|(small\s+)?(white\s+)?cat)$/i.test(s))  // 캐릭터 중복 칩 흡수
    .slice(0, maxProps);
  const all = ['1 girl', '1 small white cat', ...cleaned.map((s) => `1 ${s}`)];
  return `The whole drawing contains exactly ${all.join(', ')}. Nothing else on the page.`;
}

/* ═══ 캐릭터 시트 — 그림체와 분리된 '누구인가' ═══════════════════
   참조 그림이 스타일까지 먹어버리는 문제가 있어(5차 관찰), 캐릭터는 그림에만 맡기지 않고
   문장으로도 고정한다. 참조가 흔들려도 이 문장은 흔들리지 않는다. */

export const CHARACTER_SHEET = [
  '별이: 볼터치 없이 맨 얼굴',
  '빼콩이: 온몸이 흰 고양이 (올화이트)',
] as const;

export const CHARACTER_SHEET_EN = [
  'the girl’s cheeks are plain bare skin, the same tone as the rest of her face',
  'the cat is entirely white — all-white fur from head to tail',
] as const;

/**
 * 고유명사 사전 — 번역기가 모르면 멋대로 옮긴다.
 * 6차 사고: "빼콩이가 흙을 먼저 밟았다" → "the puppy stepped on the soil first".
 * 빼콩이가 강아지가 됐고, Subjects의 one cat과 모순된 지시가 모델에 나갔다.
 */
export const CHARACTER_GLOSSARY: Record<string, string> = {
  '별이': 'the girl',
  '빼콩이': 'the white cat',
  '빼콩': 'the white cat',
};

/** 번역 시스템 프롬프트에 붙일 사전 줄 */
export function glossaryLine(): string {
  return Object.entries(CHARACTER_GLOSSARY).map(([k, v]) => `"${k}" = ${v}`).join('; ');
}

/* ═══ 스타일 시트 — 캐릭터와 독립 ════════════════════════════════
   캐릭터 참조가 그림체까지 끌고 가므로, 그림체는 별도 축으로 계속 밀어 넣는다. */

export const STYLE_SHEET_EN = [
  'grid paper', 'blue ink', 'loose doodle', 'large empty space', 'child sketch',
] as const;

/* ═══ 낙서 언어 ══════════════════════════════════════════════════
   별이 그림에는 항상 작은 낙서가 있다. 장식이 아니라 **그림일기의 언어**다 —
   오늘 무엇을 봤는지가 기호로 남는다. */

const DOODLE_BY_TOPIC: { match: RegExp; en: string }[] = [
  { match: /비|빗방울|rain/, en: 'short slanted rain ticks and a few dots' },
  { match: /달|밤|moon|night/, en: 'a few small stars scattered around' },
  { match: /책|글|book/, en: 'a few short straight lines like written strokes' },
  { match: /고양이|빼콩|cat/, en: 'small round paw dots trailing off' },
  { match: /꽃|화분|잎|flower|plant/, en: 'a few tiny stars and small dots' },
];

export function doodleFor(memory: MemoryEvent): string {
  const hay = [memory.targetLabel ?? '', ...memory.lines].join(' ');
  for (const d of DOODLE_BY_TOPIC) if (d.match.test(hay)) return d.en;
  return 'three small dots';
}

/**
 * Character Identity 체크리스트 — Style Identity를 PASS/FAIL 한 덩어리로 보지 않는다.
 * 세부로 쪼개야 "왜 같은 아이처럼 안 보이는지"를 추적할 수 있다 (Vase, 참조 단계 진입 시).
 * 대조군에서는 판정하지 않는다 — 참조 없이 같은 아이가 나올 이유가 없다.
 */
export const CHARACTER_IDENTITY_CHECKS = [
  '머리 모양', '얼굴 비율', '눈', '옷', '빼콩',
  '선 느낌', '색감', '기억의 단순화', '같은 아이처럼 보이는가',
] as const;

/** 기억한 만큼만 그린다 — 하루의 밀도가 그림의 복잡도가 된다. */
export const SKETCH_DENSITY = {
  quiet: { maxSubjects: 1, note: '아무 일도 없던 날 — 화분 하나만' },
  normal: { maxSubjects: 2, note: '보통의 하루' },
  full: { maxSubjects: 3, note: '특별한 사건이 있던 날 — 평소보다 복잡하게' },
} as const;
export type SketchDensity = keyof typeof SKETCH_DENSITY;

/* ═══ 기억 ═══════════════════════════════════════════════════════ */

/** 관찰 아카이브 한 줄 (walk의 logObservation 산출물과 같은 모양) */
export interface ArchiveEntry {
  observer: string;
  kind: string;                 // act | diary | rare | world | return
  line: string;
  targetId: string | null;
  targetType: string | null;
  targetLabel: string | null;
  duration: number | null;      // 머문 시간(초) — "가장 오래 머문 순간"의 근거
  mood: string | null;
  createdAt: number;
  date: string;
  eventId: string | null;
}

/** 하나의 기억에서 세 갈래가 나온다. 셋이 다른 사건을 만들면 안 된다. */
export interface MemoryEvent {
  date: string;
  momentAt: number;
  targetLabel: string | null;
  targetType: string | null;
  /** 그 순간의 관찰들 — 글·사진·그림이 공유하는 단일 출처 */
  lines: string[];
  density: SketchDensity;
  /** 세 갈래 */
  diaryText: string | null;
  selectedPhoto: string | null;
  sketchDiary: string | null;
}

const KINDS = new Set(['act', 'diary', 'rare', 'world', 'return']);
/**
 * 이벤트·희귀 관찰은 그 자체로 하루를 대표한다 — 머문 시간과 별개로 가중된다.
 * 눈금 근거: 실제 산책의 머무름은 2~3초, 길어야 10초 안팎이라 duration 점수는 20~100 범위다.
 * 월드 이벤트(쿨다운 12~24h)는 그 위에 있어야 한다 — 고질라가 지나간 날은 그게 하루다.
 */
const KIND_WEIGHT: Record<string, number> = { world: 150, rare: 80, act: 0, diary: 0, return: 15 };

/**
 * 오늘의 기억 후보 중 하나를 고른다 = **하루에 Selection을 적용하는 것.**
 * 기준: 오래 머물렀는가(duration) + 그 자체로 사건이었는가(kind) + 별이가 보는 것인가(focus).
 * 랜덤이 아니다 — 같은 하루는 같은 순간을 고른다.
 */
export function selectMoment(
  entries: ArchiveEntry[], date: string, focus: SelectionFocus[] = [],
): ArchiveEntry | null {
  const today = entries.filter((e) => e && e.observer === 'byeoli' && e.date === date && KINDS.has(e.kind) && e.line?.trim());
  if (!today.length) return null;
  const focusHint: Partial<Record<SelectionFocus, string[]>> = {
    light: ['빛', '그림자', '햇', '노을'], movement: ['움직', '흔들', '지나', '떨어'],
    texture: ['질감', '거칠', '젖', '마른'], distance: ['멀', '가까', '너머'],
  };
  const score = (e: ArchiveEntry) => {
    let s = (e.duration ?? 0) * 10 + (KIND_WEIGHT[e.kind] ?? 0);
    for (const f of focus) {
      if ((focusHint[f] ?? []).some((w) => e.line.includes(w))) { s += 8; break; }
    }
    return s;
  };
  // 동점이면 늦은 순간이 이긴다 — 하루를 돌아보는 시점에 더 가깝다
  return [...today].sort((a, b) => score(b) - score(a) || b.createdAt - a.createdAt)[0];
}

/** 하루의 밀도 — 관찰량과 사건 유무로 정한다. 규칙적 정각 생성이 아니라 그날의 리듬. */
export function densityOf(entries: ArchiveEntry[], date: string): SketchDensity {
  const today = entries.filter((e) => e?.date === date && e.observer === 'byeoli');
  if (today.some((e) => e.kind === 'world' || e.kind === 'rare')) return 'full';
  return today.length >= 6 ? 'normal' : 'quiet';
}

/** 그 순간을 둘러싼 관찰들 — 글·사진·그림이 공유할 단일 출처 */
export function buildMemoryEvent(
  entries: ArchiveEntry[], date: string, focus: SelectionFocus[] = [],
): MemoryEvent | null {
  const moment = selectMoment(entries, date, focus);
  if (!moment) return null;
  const WINDOW = 10 * 60 * 1000;   // 그 순간의 앞뒤 10분까지가 '같은 사건'
  const lines = entries
    .filter((e) => e?.date === date && e.observer === 'byeoli' && e.line?.trim()
      && Math.abs(e.createdAt - moment.createdAt) <= WINDOW)
    .sort((a, b) => a.createdAt - b.createdAt)
    .map((e) => e.line);
  return {
    date, momentAt: moment.createdAt,
    targetLabel: moment.targetLabel, targetType: moment.targetType,
    lines: [...new Set(lines)],
    density: densityOf(entries, date),
    diaryText: null, selectedPhoto: null, sketchDiary: null,
  };
}

/* ═══ 프롬프트 파생 ══════════════════════════════════════════════ */

const FOCUS_DRAW: Record<string, string> = {
  light: '빛이 닿은 자리를 가장 크게', movement: '움직인 것을 가장 크게',
  texture: '질감이 남은 것을 가장 크게', distance: '거리감이 느껴지게',
  shadow: '그림자를 크게', color: '색이 남은 것을 크게', sound: '소리가 난 쪽을 크게',
};

/**
 * SKETCH_RULES + 별이의 Selection + 그 순간 → 그림 프롬프트.
 * 손으로 쓰지 않는다. 정확한 복제가 아니라 **무엇을 크게 기억했는지**가 드러나야 한다.
 */
export function buildSketchPrompt(memory: MemoryEvent, genome: GenomeContext | null): string {
  const d = SKETCH_DENSITY[memory.density];
  const focus = (genome?.selection ?? []).map((f) => FOCUS_DRAW[f]).filter(Boolean).slice(0, 2);
  return [
    '별이의 그림일기 한 장. 완성된 일러스트가 아니라 공책에 그린 기억 스케치다.',
    '',
    '오늘 가장 오래 머문 순간:',
    ...memory.lines.map((l) => `- ${l}`),
    memory.targetLabel ? `가장 크게 그릴 것: ${memory.targetLabel}` : '',
    '',
    `대상 수: ${d.maxSubjects}개 이내 (${d.note})`,
    focus.length ? `별이가 보는 방식: ${focus.join(' / ')}` : '',
    '',
    '그림 습관 (반드시 지킬 것):',
    ...SKETCH_RULES.map((r) => `- ${r}`),
    '',
    '실제 장면을 정확히 복제하지 않는다. 오늘 중요하지 않았던 것은 그리지 않는다.',
  ].filter((l) => l !== '').join('\n');
}

const FOCUS_DRAW_EN: Record<string, string> = {
  light: 'draw whatever the light touched the largest',
  movement: 'draw whatever moved the largest',
  texture: 'draw whatever kept its texture the largest',
  distance: 'let the sense of distance show',
  shadow: 'draw the shadow large', color: 'draw whatever kept its color large',
  sound: 'draw the side the sound came from large',
};

/**
 * 모델에 실제로 나가는 프롬프트 — 영어. `sceneEn`은 그 순간의 관찰을 영어로 옮긴 것으로,
 * 호출자가 넘긴다(없으면 대상 이름만으로 최소 구성). 규칙과 금지어는 여기서 붙인다.
 */
export interface RefRoles {
  /** 캐릭터 참조 장수 (image 0 부터) */
  characters?: number;
  /** 그림체 참조 장수 (캐릭터 다음 인덱스부터) */
  styles?: number;
}

/**
 * 야간 3장은 seed만 다른 복제 후보가 아니다. 같은 기억을 서로 다른 몸의 반응으로 그린다.
 * 포즈 시트가 있어도 행동을 지정하지 않으면 모델은 외형 보존이 쉬운 정면 정지 자세로 수렴한다
 * (2026-07-27 실사고: 개구리 기억 3장 모두 멀뚱히 서 있음).
 *
 * 금지문 대신 결과 자세를 긍정형으로 지정한다. 인덱스는 결정론 seed의 장 번호와 같다.
 */
export const NIGHTLY_POSE_VARIANTS = [
  'Deep squat beside the remembered event: both knees are sharply bent, her hips are lowered near her heels, her torso leans forward, and one hand touches the ground.',
  'Moving response pose: the girl takes an asymmetrical step toward the remembered event, with bent elbows and arms reacting to it.',
  'Close interaction pose: the girl kneels or squats at the event’s level and reaches one hand toward it, with her shoulders turned.',
] as const;

export function buildImagePrompt(
  memory: MemoryEvent, genome: GenomeContext | null, sceneEn: string | null,
  subjects: string[] = [], refs: RefRoles | number = 0, poseVariant: string | null = null,
  /**
   * 지난 장이 별이에게 물린 이유. 09-01 구조 교체 전에는 3장을 **같은 프롬프트로** 그렸다 —
   * 첫 장이 「개가 아니라 고양이가 나왔다」로 물리면 나머지 둘도 같은 이유로 물렸다.
   * 68일 중 21일이 「별이가 전부 물림」이었던 정체가 이것이다. 이제 물린 이유가 다음 장에 실린다.
   */
  avoid: string[] = [],
  /**
   * 그림체 층을 고른다 (사장 판정 2026-09-02 「그림체 전혀 아니야 … 모눈종이 하드코딩에서 빼버려 ·
   * 참조 그림을 최우선으로 · 나머지 flux 최적화 하드코딩도 빼버려 · **되돌릴 수 있게 잘 내비둬**」).
   *
   * ⚠ **flux 판(기본값)은 한 글자도 안 고쳤다.** `DAILY_IMAGE_PROVIDER`를 지우거나 workers-ai로
   *   두면 아래 상수도 이 함수도 예전 그대로 돈다 — 되돌리기는 환경변수 한 줄이다.
   */
  provider: 'workers-ai' | 'gemini' = 'workers-ai',
  /**
   * 별이가 **실제로 부른** 상대들(예: ['별이'] · ['빼콩이(고양이)'] · []).
   * 09-02 실사고: 별이가 「오늘 기억엔 우산·창·바구니뿐, 별이도 빼콩이도 등장하지 않는다」며
   * 아무도 안 불렀는데 **프롬프트는 여전히 「소녀의 동작」을 시켰다.** 참조 없이 아무 아이나
   * 그려졌고, 그걸 별이가 「별이 캐릭터가 아니다」로 물렸다 — 스스로 되풀이하는 모순 고리였다.
   * 이제 **부르지 않은 상대는 그림에서도 말하지 않는다** — 참조가 없으면 캐릭터도 없다.
   */
  characterNames: string[] = [],
): string {
  const roles: RefRoles = typeof refs === 'number' ? { characters: refs, styles: 0 } : refs;
  const nChar = roles.characters ?? 0;
  const nStyle = roles.styles ?? 0;
  const d = SKETCH_DENSITY[memory.density];
  const focus = (genome?.selection ?? []).map((f) => FOCUS_DRAW_EN[f]).filter(Boolean).slice(0, 2);
  const scene = (sceneEn ?? '').trim() || 'a quiet small moment';
  const hasGirl = characterNames.some((n) => n.includes('별이'));
  const hasCat = characterNames.some((n) => n.includes('빼콩'));
  if (provider === 'gemini') {
    /* 제미나이 판 — flux 최적화 잔재를 걷어낸 것들과 그 이유:
       · **모눈종이 세 줄**(SKETCH_RULES_EN[0] · SKETCH_POSITIVE[0] · STYLE_SHEET_EN의 'grid paper').
         사장 판정: 하드코딩에서 뺀다.
       · 'flat scan, top-down' — flux가 '공책을 찍은 사진'을 만들던 문제의 대응이었다.
       · **참조를 약하게 쓰라는 긴 지시**('pose vocabulary' · 'do not copy any single panel') —
         flux가 참조를 통째로 베끼던 문제의 대응이다. 제미나이에선 반대로 **참조가 최우선**이다.
       · 부정문 회피 규칙 — 확산 모델 특성이라 제미나이엔 해당 없다. 그래서 09-02 첫 판에서
         그림에 새겨진 'SHADE' 영어 글씨를 여기서는 곧장 금지한다(별이도 그 이유로 물렸다).
       남긴 것: 별이의 **그림 습관**(색 4~6·주제 1~3 크게·얼굴 단순·배경 비움·낙서)은 flux 최적화가
       아니라 별이의 결이고, 별이가 판정 기준으로도 쓴다. */
    return [
      'A hand-drawn diary sketch, drawn from memory.',
      `Scene: ${scene}`,
      hasGirl && poseVariant ? `Girl's action: ${poseVariant}` : '',
      pinnedSubjectClause(subjects, d.maxSubjects),
      focus.length ? `Emphasis: ${focus.join('; ')}.` : '',
      // 아무도 안 불렀으면 사람도 동물도 그리지 않는다 — 그날 남은 건 사물과 자리뿐이다
      nChar === 0
        ? 'No people and no animals in this picture — draw only the objects and the place that mattered today.'
        : '',
      // 참조가 그림체를 정한다 — 글로 그림체를 설명하지 않는다
      nChar >= 2
        ? 'Images 0 and 1 are the authoritative reference — image 0 is the girl, image 1 is the white cat. Match their drawing style, line quality, colouring and proportions as closely as you can: the reference decides how this picture looks. Keep the girl’s exact appearance and the cat’s all-white fur. Render one continuous scene.'
        : nChar === 1
          ? 'Image 0 is the authoritative reference for the characters and for the drawing style. Match its line quality, colouring and proportions as closely as you can. Render one continuous scene.'
          : '',
      // 별이의 그림 습관 — 그림체가 아니라 구성 규칙이라 참조와 다투지 않는다
      'A flat palette of four to six colours, flat even fills.',
      'One to three main subjects drawn large; bare background, only what mattered that day.',
      'The girl’s face stays simple — a few dots and lines, no fine detail.',
      // 부른 상대만 못박는다 (안 부른 상대의 생김새를 말하면 모델이 불러들인다)
      hasGirl ? 'The girl’s cheeks are plain bare skin, the same tone as the rest of her face.' : '',
      hasCat ? 'The cat is entirely white — all-white fur from head to tail.' : '',
      `Around the subjects add ${doodleFor(memory)}.`,
      avoid.length
        ? `Fix these problems from the previous attempts: ${avoid.slice(-3).map((a) => a.replace(/\s+/g, ' ').slice(0, 160)).join(' | ')}`
        : '',
      'Do not draw any text, letters, words or numbers anywhere in the picture.',
    ].filter((l) => l !== '').join('\n');
  }
  return [
    // "A page from a girl's diary"로 시작하면 모델이 '공책을 찍은 사진'을 만든다(2차 실패).
    // 그림 자체를 말한다 — sketch / drawing / illustration 비중을 앞으로.
    // 'sketchbook page' / 'notebook-style'는 **물건 이름**이라 모델이 스프링 공책을
    // 성실히 그려 넣는다(3차: 제본과 책상이 찍혔다). 물건이 아니라 표면만 말한다.
    'A simple hand-drawn sketch. Flat illustration drawn from memory.',
    `Scene: ${scene}`,
    poseVariant ? `Girl's action: ${poseVariant}` : '',
    // 9차: subjectClause → pinnedSubjectClause. 캐릭터 수는 항상 못박고, 예산은 소품에만.
    pinnedSubjectClause(subjects, d.maxSubjects),
    focus.length ? `Emphasis: ${focus.join('; ')}.` : '',
    `Style: ${SKETCH_RULES_EN.join(', ')}.`,
    // 참조는 인덱스로 지칭한다(flux-2는 image 0..3). **캐릭터와 스타일을 분리**한다 —
    // 5차 관찰: 캐릭터 참조 한 장이 그림체까지 먹어버려 상업 일러스트 쪽으로 갔다.
    // 포즈 시트 시대(2026-07-20 밤): 참조가 자세까지 베끼던 문제를 시트+지시로 푼다.
    // 캐릭터 2장이면 별이=image 0, 빼콩이=image 1 (sketch-trial이 이름으로 정렬해 보장).
    nChar >= 2
      ? `Images 0 and 1 are character reference sheets — image 0 is the girl, image 1 is the white cat. Keep their exact appearance: same hair shape, same face, same body proportions, same clothes for the girl; all-white fur for the cat. Use the sheets as a pose vocabulary and adapt the closest matching bent limbs, torso angle, and direction of gaze to the girl's action above; do not copy any single panel or the sheet layout. Render one continuous scene.`
      : nChar === 1
        ? `Image 0 is a character reference for the same girl and the same cat — same hair shape, same face, same body proportions, same clothes. Use its poses as a vocabulary: choose the pose that fits the scene and adapt its limbs, torso angle, and gaze to the girl's action above. Render one continuous scene.`
        : '',
    // 스타일 참조가 여러 장이면 **범위로 지칭하고 섞으라고** 말한다.
    // 한 장만 가리키면 그 그림 하나를 베끼게 되고, 결국 남의 그림체와 비슷해진다.
    nStyle > 1
      ? `Blend the drawing style of images ${nChar}–${nChar + nStyle - 1} into one consistent hand — ${STYLE_SHEET_EN.join(', ')}.`
      : nStyle === 1
        ? `Follow the drawing style of image ${nChar} — ${STYLE_SHEET_EN.join(', ')}.`
        : `Drawing style: ${STYLE_SHEET_EN.join(', ')}.`,
    // 캐릭터는 그림에만 맡기지 않는다. 참조가 흔들려도 이 문장은 흔들리지 않는다.
    `${CHARACTER_SHEET_EN.join('. ')}.`,
    // 낙서는 장식이 아니라 그림일기의 언어다 — 오늘 무엇을 봤는지가 기호로 남는다.
    `Around the subjects add ${doodleFor(memory)}.`,
    // 별이가 앞서 물린 이유 — 같은 실수를 되풀이하지 않는다(09-01 되먹임 고리)
    avoid.length
      ? `Fix these problems from the previous attempts: ${avoid.slice(-3).map((a) => a.replace(/\s+/g, ' ').slice(0, 160)).join(' | ')}`
      : '',
    `${SKETCH_POSITIVE.join(', ')}.`,
  ].filter((l) => l !== '').join('\n');
}
