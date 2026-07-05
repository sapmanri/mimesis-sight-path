// ---------- BUILD 084: ASSET SET ----------
// 홈즈 설계문서 원칙: "Object 단위 제작 금지. 반드시 Set 단위 제작."
// 각 Set 안에는 이미 랜덤 배치 규칙이 있다.
//
// 이 파일은 순수 데이터다. 조립(THREE 그룹 생성)은 worldCore.buildAssetSet이 한다.
// 에디터는 이 레지스트리를 열거해 Set 선택 UI를 만든다.

/** 배치 규칙 — Set의 심장. 규칙이 있어야 Set이지, 없으면 그냥 오브젝트 묶음이다. */
export type AssetSetRule =
  | {
      /** 담: 줄 단위로 쌓는다 */
      kind: 'wall';
      rows: {
        count: number;
        y: number;
        startX: number;
        stepX: number;
        jitter: number;          // 위치 흔들림
        scale: [number, number]; // [최소, 최대]
      }[];
    }
  | {
      /** 무리: 한 지점 주변에 흩뿌린다 */
      kind: 'cluster';
      count: number;
      spreadX: number;
      spreadZ: number;
      scale: [number, number];
    };

export type AssetSet = {
  id: string;
  label: string;
  /** worldCore MODELS의 키들. 조각은 시드 난수로 순환 선택된다. */
  pieces: string[];
  rule: AssetSetRule;
};

export const ASSET_SETS: Record<string, AssetSet> = {
  // 기존 stone11 담 (BUILD 075~083의 담, 레거시 보존)
  'stone-wall-01': {
    id: 'stone-wall-01',
    label: 'Stone Wall Set 01 — stone11',
    pieces: ['stone'],
    rule: {
      kind: 'wall',
      rows: [
        { count: 8, y: 0, startX: -0.49, stepX: 0.14, jitter: 0.02, scale: [0.85, 1.15] },
        { count: 6, y: 0.11, startX: -0.35, stepX: 0.14, jitter: 0.02, scale: [0.7, 0.98] },
      ],
    },
  },
  // RockSet06 담 재투입 (BUILD 084) — "백색 괴물"의 원인은 applyPalette 밝기 상한이었다.
  // 조각 4종이 순환되며 제주 돌담의 불규칙함이 살아난다.
  'stone-wall-02': {
    id: 'stone-wall-02',
    label: 'Stone Wall Set 02 — RockSet06',
    pieces: ['rockA', 'rockB', 'rockC', 'rockD'],
    rule: {
      kind: 'wall',
      rows: [
        { count: 8, y: 0, startX: -0.49, stepX: 0.14, jitter: 0.02, scale: [0.85, 1.15] },
        { count: 6, y: 0.11, startX: -0.35, stepX: 0.14, jitter: 0.02, scale: [0.7, 0.98] },
      ],
    },
  },
  // 바다 끝 낮은 돌무더기
  'sea-edge-01': {
    id: 'sea-edge-01',
    label: 'Sea Edge Set 01 — 낮은 돌무더기',
    pieces: ['stone'],
    rule: { kind: 'cluster', count: 3, spreadX: 0.5, spreadZ: 0.2, scale: [0.7, 1.2] },
  },
};

// ---------- MEMORY SET (상위 구조, Phase 4 예비) ----------
// "AI는 Object를 배치하지 않는다. Memory Set을 조합한다."
// Story 생성기가 이야기 유형(Travel/Childhood/Dream)에 맞는 Memory Set을 고르고,
// Memory Set이 장면(Memory Point)에 들어갈 kit/set 후보를 제공한다.
// 아직 소비자 없음 — 에디터의 Story 탭이 이 데이터를 읽게 될 예정.

export type MemorySet = {
  id: string;
  label: string;
  /** 이 기억 유형에 어울리는 objectKit / AssetSet id 후보 */
  members: string[];
};

export const MEMORY_SETS: Record<string, MemorySet> = {
  travel: {
    id: 'travel',
    label: 'Travel — 여행의 기억',
    members: ['door-kit', 'suitcase-kit', 'person-kit', 'airplane-wing-kit', 'stone-wall-02', 'sea-edge-01', 'book-kit', 'cd-shelf-kit'],
  },
};
