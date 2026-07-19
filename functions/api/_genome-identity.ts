// BUILD 429-D — Genome Runtime Package (Identity · Selection · Observation)
// 정본: docs/BUILD_429_GENOME_SEASONS.md · 순서 확정 Vase 2026-07-19 심야
//
// 왜 있는가: 429는 계약과 컴파일러를 만들고 판정까지 끝냈지만 `docs/429b-prototype/`에만
// 있었다(프로덕션 참조 0건). 그동안 라이브 Writer(425-D)는 엽서 메타만 받아 글을 썼다 —
// 즉 별이는 이미 스스로 글을 쓰지만 **아직 별이의 눈으로 쓰지는 않았다.**
// 이 모듈은 그 눈을 프로덕션이 읽을 수 있는 형태로 옮긴다.
//
// 범위 하드룰:
//   - `run5.mjs`를 서비스에 이식하지 않는다. **재사용 가능한 데이터와 인터페이스만** 뽑는다.
//   - 생성·네트워크·KV 없음. 순수 함수와 상수뿐 (429-A `_genome.ts`와 같은 결).
//   - 문장을 저장하지 않는다. **무엇을 선택하고 어떻게 바라보는지**를 전달한다.
//   - book은 별이의 주 언어가 아니라 검증된 안전망이다 (우선순위는 GENERATION_SOURCES 참조).

export const GENOME_VERSION = '429-v3.3';

/* ═══ Identity — 변하지 않는 축 ═══════════════════════════════════
   Daily Genome이 이 축을 건드리면 **조용히 덮어쓰지 않고 실패시킨다.**
   교훈(429 v3.2 전 슬롯 탈락 단일 원인): 정체성 편향은 억제 대상이 아니다.
   감각형 35% 상한이 "빛을 먼저 보는" Identity를 금지해 버렸다. */

export const IDENTITY_AXES = [
  'voice', 'selfPresence', 'observer', 'closure', 'emotion',
  'distance', 'observationDensity', 'association', 'judgement',
] as const;
export type IdentityAxis = (typeof IDENTITY_AXES)[number];

/** 오늘만 변하는 것. Identity 축과 교집합이 없어야 한다. */
export const DAILY_AXES = ['tempo', 'focusOrder'] as const;
export type DailyAxis = (typeof DAILY_AXES)[number];

export type IdentityProfile = Record<IdentityAxis, string>;

export const IDENTITY_GENOME: Record<string, IdentityProfile> = {
  byeoli: {
    voice: 'banmal', selfPresence: 'rare', observer: 'first_person', closure: 'open',
    emotion: 'indirect', distance: 'medium', observationDensity: 'medium',
    association: 'low', judgement: 'low',
  },
  // 대조군 — Genome이 문체가 아니라 '바라보는 방식'을 저장한다는 것의 음성 테스트용
  'dry-report': {
    voice: 'banmal', selfPresence: 'none', observer: 'third_person', closure: 'closed',
    emotion: 'none', distance: 'near', observationDensity: 'low',
    association: 'none', judgement: 'high',
  },
};

/** 우선순위는 상위 몇 개일 때만 의미가 있다. 10개 나열 = 정보 0. */
export const MAX_FOCUS = 4;

export interface DailyOverlay {
  tempo?: string;
  focusOrder?: string[];
  [axis: string]: unknown;
}

export interface ComposeResult {
  rules: (IdentityProfile & Partial<Record<DailyAxis, unknown>>) | null;
  errors: string[];
}

/** Identity(고정) + Daily(오늘) → 오늘의 규칙. Daily가 Identity 축을 바꾸려 하면 errors. */
export function composeGenome(packName: string, daily?: DailyOverlay | null): ComposeResult {
  const identity = IDENTITY_GENOME[packName];
  if (!identity) return { rules: null, errors: [`미등록 Identity Genome: ${packName}`] };
  const errors: string[] = [];
  for (const axis of IDENTITY_AXES) {
    if (daily && Object.prototype.hasOwnProperty.call(daily, axis) && daily[axis] !== identity[axis]) {
      errors.push(`Daily Genome이 Identity 축 "${axis}"를 바꾸려 했다: "${String(daily[axis])}" → 고정값 "${identity[axis]}"`);
    }
  }
  const rules: IdentityProfile & Partial<Record<DailyAxis, unknown>> = { ...identity };
  for (const axis of DAILY_AXES) if (daily && daily[axis] !== undefined) rules[axis] = daily[axis];
  return { rules, errors };
}

/* ═══ Selection — 무엇을 볼 것인가 ═══════════════════════════════
   429 최대 성과(Vase): Genome은 Observation만 만드는 게 아니라 Selection도 만든다.
   같은 숲에서 별이는 빛·움직임을 고르고, 건축가는 구조·선·비례를 고른다.
   Selection(무엇을) ≠ Observation(어떻게). 문체는 이 둘 뒤에서 결과로 생긴다. */

export const SELECTION_POOL = [
  'light', 'shadow', 'sound', 'movement', 'texture', 'color', 'temperature',
  'object', 'quantity', 'position', 'person', 'action', 'result',
  'structure', 'line', 'proportion', 'distance', 'time',
] as const;
export type SelectionFocus = (typeof SELECTION_POOL)[number];

export const PACK_SELECTION: Record<string, SelectionFocus[]> = {
  byeoli: ['light', 'movement', 'texture', 'distance'],
  'dry-report': ['quantity', 'position', 'object'],
};

export interface SelectionContract {
  selected: SelectionFocus[] | null;
  rejected: string[];
  errors: string[];
}

/**
 * Identity가 무엇을 고르는 존재인지 + 오늘의 세계 → 오늘 볼 것.
 * Daily는 **순서만** 바꿀 수 있고, 없던 것을 새로 보게 만들지는 못한다.
 */
export function selectFrom(pack: string, dailyContext?: DailyOverlay | null): SelectionContract {
  const base = PACK_SELECTION[pack];
  if (!base) return { selected: null, rejected: [], errors: [`Selection 미정의 팩: ${pack}`] };
  const wanted = dailyContext?.focusOrder ?? [];
  const daily = wanted.filter((f): f is SelectionFocus => (base as string[]).includes(f));
  const selected = [...daily, ...base.filter((f) => !daily.includes(f))];
  const rejected = wanted.filter((f) => !(base as string[]).includes(f));
  return {
    selected,
    rejected,
    errors: rejected.length ? [`Daily가 Identity에 없는 것을 보려 했다: ${rejected.join(', ')}`] : [],
  };
}

/* ═══ Observation — 어떻게 볼 것인가 ═════════════════════════════
   형식(FORM)과 감각 채널의 상한. 총량이 아니라 **내부 편중**을 검사한다는 것이 핵심 —
   균등 분포를 강요하면 평범한 균형형 관찰자가 된다. */

export const FORM_GROUPS: Record<string, string[]> = {
  state: ['있다', '남아 있다', '그대로다'],
  change: ['바뀐다', '옮겨진다', '사라진다'],
  sense: ['보인다', '들린다', '느껴진다'],
  detail: ['한쪽만', '가장자리', '틈'],
};
export const FORM_KEYS = Object.keys(FORM_GROUPS);
export const CORE_FORMS = ['state', 'change', 'sense', 'detail'] as const;

export const SENSE_CHANNELS: Record<string, string[]> = {
  sight: ['빛', '그림자', '색', '움직임'],
  sound: ['소리', '울림'],
  touch: ['온도', '질감', '바람'],
};

/** 상한은 총량이 아니라 편중을 잡는다 (교훈: 35% 상한이 Identity를 금지했다). */
export const OBS_LIMITS = {
  maxChannelShare: 0.45,      // 한 감각 채널이 차지할 수 있는 최대 비율
  maxSameFormRepeat: 3,       // 같은 형식 구조 연속 반복
  maxFocusListed: MAX_FOCUS,
} as const;

/* ═══ Validation / 출처 기록 ═════════════════════════════════════
   429-F 대비: 어느 경로로 나온 문장인지 archive에 반드시 남는다.
   나중에 Threads 글을 보고 "이게 정말 Genome을 탄 글인지" 확인할 수 있어야 한다. */

export const GENERATION_SOURCES = ['genome-live', 'genome-book', 'rule-fallback'] as const;
export type GenerationSource = (typeof GENERATION_SOURCES)[number];

export interface ValidationResult {
  pass: boolean;
  errors: string[];
  warnings: string[];
}

export interface GenomeProvenance {
  generationSource: GenerationSource;
  genomeVersion: string;
  validation: 'pass' | 'fail';
}

export function provenance(source: GenerationSource, pass: boolean): GenomeProvenance {
  return { generationSource: source, genomeVersion: GENOME_VERSION, validation: pass ? 'pass' : 'fail' };
}

/**
 * Writer에 넘길 계약 묶음. 엽서 메타(eventContext)만 받던 425-D를 이 모양으로 넓힌다(429-E).
 * 여기서는 조립과 검증만 한다 — 생성은 하지 않는다.
 */
export interface GenomeContext {
  identity: IdentityProfile;
  selection: SelectionFocus[];
  observation: { formKeys: string[]; channels: string[]; limits: typeof OBS_LIMITS };
  daily: DailyOverlay | null;
}

export function buildGenomeContext(pack: string, daily?: DailyOverlay | null): {
  context: GenomeContext | null;
  result: ValidationResult;
} {
  const composed = composeGenome(pack, daily);
  const sel = selectFrom(pack, daily);
  const errors = [...composed.errors, ...sel.errors];
  if (!composed.rules || !sel.selected) {
    return { context: null, result: { pass: false, errors, warnings: [] } };
  }
  const warnings: string[] = [];
  if (sel.selected.length > MAX_FOCUS) {
    warnings.push(`Selection이 ${MAX_FOCUS}개를 넘는다 — 우선순위가 정보를 잃는다`);
  }
  // Identity 위반이 있으면 계약을 세우지 않는다. 조용히 덮어쓰는 것보다 실패가 낫다.
  if (errors.length) return { context: null, result: { pass: false, errors, warnings } };
  return {
    context: {
      identity: { ...(composed.rules as IdentityProfile) },
      selection: sel.selected.slice(0, MAX_FOCUS),
      observation: { formKeys: FORM_KEYS, channels: Object.keys(SENSE_CHANNELS), limits: OBS_LIMITS },
      daily: daily ?? null,
    },
    result: { pass: true, errors: [], warnings },
  };
}
