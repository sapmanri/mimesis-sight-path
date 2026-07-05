// ---------- BUILD 082: WORLD SPEC ----------
// 세계는 이제 코드가 아니라 문서에서 태어난다.
//
// 이 파일은 MIMESIS World Generator의 첫 번째 층위다.
// worldCore에 흩어져 있던 하드코딩 상수를 하나의 명세(WorldSpec)로 모았다.
// 제주 월드는 이 명세의 첫 번째 프리셋(JEJU_SPEC)일 뿐이다.
//
// 원칙 (홈즈 설계문서, 2026-07-05):
//   "Sight Path는 제품이 아니다. World Generator가 제품이고,
//    Sight Path는 Generator가 만들어내는 하나의 결과물이다."
//   "Everything is a Generator" — 길도, 하늘도, 원경도, 돌담도.
//
// 규칙:
//   1. WorldSpec은 항상 JSON 직렬화 가능해야 한다 (에디터 저장/불러오기 대비).
//   2. 새 시각 상수를 코드에 하드코딩하지 말 것 — 여기 스키마에 추가할 것.
//   3. seed = 0 은 "레거시 제주" — 기존 빌드와 픽셀 단위 동일함을 보장한다.

// ---------- BUILD 083: GENERATOR REGISTRY ----------
// "Everything is a Generator" — 길도, 지형도, 가장자리도, 원경도, 빛도.
// 이 목록은 순수 데이터다. 에디터는 이 목록을 열거해 토글 UI를 만든다.
// worldCore.buildWorld는 이 순서대로 생성기를 실행한다.

export type WorldGeneratorId =
  | 'path'         // 커브 + 프레임 + 길폭 + 앵커 (모든 것의 뼈대, 끌 수 없음)
  | 'terrain'      // 절벽 둑길 지오메트리 + 프로시저럴 표면
  | 'edge'         // 길 가장자리 풀잎 (홈즈 문서: Edge Generator — "매우 중요")
  | 'decoration'   // 바위 산란 (Phase 3에서 Set 구조로 확장)
  | 'memoryPoints' // 장면별 기억 오브젝트 (kit 슬롯)
  | 'landscape'    // 원경: 등대, 구름 — 닿을 수 없는 기억
  | 'light'        // 반구광 + 태양 + 보조광
  | 'assets';      // 실물 GLB 비동기 투입 (끄면 프록시 프리뷰 모드)

export const WORLD_PIPELINE: { id: WorldGeneratorId; label: string; required?: boolean }[] = [
  { id: 'path', label: 'Path Generator', required: true },
  { id: 'terrain', label: 'Terrain Generator' },
  { id: 'edge', label: 'Edge Generator' },
  { id: 'decoration', label: 'Decoration Generator' },
  { id: 'memoryPoints', label: 'Memory Point Generator' },
  { id: 'landscape', label: 'Landscape Generator' },
  { id: 'light', label: 'Light Generator' },
  { id: 'assets', label: 'Asset Generator' },
];

/** 생성기 활성 여부. required는 항상 켜짐, 나머지는 명시적 false만 꺼짐. */
export function isGeneratorEnabled(spec: WorldSpec, id: WorldGeneratorId): boolean {
  const entry = WORLD_PIPELINE.find((g) => g.id === id);
  if (entry?.required) return true;
  return spec.generators?.[id] !== false;
}

export type WorldPalette = {
  fog: string;
  sandTop: string;
  sandEdge: string;
  cliffHigh: string;
  cliffMid: string;
  cliffLow: string;
  cliffDeep: string;
  basalt: string;
  doorGreen: string;
  mint: string;
  white: string;
  plant: string;
  plantDark: string;
  silhouette: string;
  hat: string;
};

export type WorldSpec = {
  meta: {
    name: string;
    description?: string;
    specVersion: 1;
    /** 모든 프로시저럴 난수의 기준 시드. 0 = 레거시 제주 (기존 빌드와 동일 출력) */
    seed: number;
  };

  /**
   * BUILD 083: 생성기 토글. "Everything is a Generator."
   * 명시적으로 false인 생성기만 꺼진다 (생략 = 전부 켜짐).
   * required 생성기(path)는 끌 수 없다.
   * 예: { assets: false } → GLB 없이 프로시저럴 프록시만 (에디터 고속 프리뷰 모드)
   */
  generators?: Partial<Record<WorldGeneratorId, boolean>>;

  /** 세계의 색. 모든 오브젝트는 이 팔레트를 통과해야만 세계에 들어온다. */
  palette: WorldPalette;

  /** 대기. 높이 안개는 이 세계의 문법이다 — 잠기는 높이가 분위기를 정한다. */
  atmosphere: {
    /** 이 높이부터 잠기기 시작 */
    heightFogTop: number;
    /** 이 높이에서 완전히 안개 */
    heightFogBottom: number;
  };

  /** 길 생성기. 길은 시간을 감싸는 정도로 좁고 조용해야 한다. */
  path: {
    /** 장면 간 z 간격 (기억과 기억 사이의 거리) */
    sceneSpacing: number;
    /** 장면 x 좌표 증폭 */
    lateralScale: number;
    /** 사행(meander) 진폭 A/B — 길이 스스로 헤매는 정도 */
    meanderA: number;
    meanderB: number;
    /** 기본 반폭. 광장은 상시가 아니라 이벤트다. */
    baseHalfWidth: number;
    /** 광장 기본 부풀기 */
    plazaBase: number;
    /** importance 1.0 초과분 → 광장 크기 환산 계수 */
    plazaImportanceGain: number;
    /** 길폭 노이즈 비율 */
    widthNoise: number;
    /** 커브 샘플 수 */
    samples: number;
  };

  /** 지형 생성기 (절벽 둑길) */
  terrain: {
    /** 절벽 단면 링 수 (BUILD 079: 5→3, 안개가 길 끄트머리까지) */
    rings: number;
    /** 절벽 깊이 기본값 (BUILD 078: 2.9→0.85) */
    cliffDepth: number;
    /** 절벽 깊이 노이즈 진폭 */
    cliffDepthNoise: number;
  };

  /** 장식 생성기 — Set 단위 제작 원칙 (worldSets.ts의 ASSET_SETS 참조) */
  decoration: {
    /** 바위 산란 수 (절벽 rim/face) */
    rockCount: number;
    /** 풀잎 다발 수 (길 가장자리) */
    grassCount: number;
    /** BUILD 089: 릴 실측 초록 — 짙은 수풀 / 중간 잎 / 밝은 풀 (릴 화면 점유율 13%) */
    vegetation: {
      bushCount: number;
      treeCount: number;
      greens: [string, string, string];
    };
    /** 돌담 Set id (BUILD 084) */
    stoneWallSet: string;
    /** 바다 끝 Set id (BUILD 084) */
    seaEdgeSet: string;
    /** BUILD 086: 벼랑 가장자리 담 — 길을 막지 않고 양옆 벼랑을 따라 쌓인다 */
    edgeWall: {
      spanScenes: number;   // 담 장면 앵커 앞뒤로 몇 장면 폭만큼 이어지는가
      step: number;         // 돌 간격 (월드 유닛)
      courses: number;      // 단 수 (높이 = courses × courseHeight)
      courseHeight: number; // 단 높이
      inset: number;        // 벼랑 끝에서 안쪽으로 들어온 거리
      scale: [number, number];
      /** BUILD 087: 구간 리듬 — 담은 이어지다 끊어지다 한다 */
      segMin: number;       // 구간 최소 길이 (월드 유닛)
      segMax: number;
      gapMin: number;       // 빈틈 최소 길이
      gapMax: number;
      bothChance: number;   // 양쪽에 함께 설 확률 (나머지는 좌/우 반반)
    };
  };

  /** 빛 생성기 */
  light: {
    hemiSky: string;
    hemiGround: string;
    hemiIntensity: number;
    sunColor: string;
    sunIntensity: number;
    sunPosition: [number, number, number];
    fillColor: string;
    fillIntensity: number;
    fillPosition: [number, number, number];
  };

  /** 걷는 사람 — 이 세계의 주인공은 걷는 시간이다. */
  /** BUILD 088: 카메라 문법. 레퍼런스 릴 실측 — 카메라는 잠겨 있고(2초에 0px),
   *  캐릭터가 고정된 구도 속을 걸어 지나간다. 디오라마를 바라보는 시선. */
  camera: {
    mode: 'held' | 'follow';
    height: number;      // 관조 시점 높이
    baseDist: number;    // 기본 이격
    fitGain: number;     // 여정 길이가 길수록 물러나는 배율
    reframeSec: number;  // 다음 구도로 넘어가는 호흡
    drift: number;       // 구도 안에서 숨쉬는 미세 드리프트 진폭
  };

  walker: {
    /** 걸음 애니메이션 배속 (0.72 = 천천히 걷는다) */
    timeScale: number;
    /** BUILD 087: 호흡의 값들 — 에디터 Walker 패널에서 노출 예정 */
    walkSpeed: number; // 월드 유닛/초
    runSpeed: number;
  };
};

/**
 * 프리셋 1호: JEJU 2024.
 * BUILD 073~081에서 손으로 튜닝된 모든 값의 원본 기록.
 * 이 값을 바꾸지 말 것 — 새 세계가 필요하면 새 프리셋을 만들 것.
 */
export const JEJU_SPEC: WorldSpec = {
  meta: {
    name: 'JEJU 2024',
    description: '안개 위 절벽 둑길. 문에서 시작해 바다에서 끝나는 기억.',
    specVersion: 1,
    seed: 0,
  },
  palette: {
    fog: '#4a7285',
    sandTop: '#d6c9a4',
    sandEdge: '#c2b490',
    cliffHigh: '#b0a181',
    cliffMid: '#8b7d66',
    cliffLow: '#66604f',
    cliffDeep: '#4f5a63',
    basalt: '#5d6159',
    doorGreen: '#7d9b7f',
    mint: '#9fbfa4',
    white: '#e8e4d8',
    plant: '#75906c',
    plantDark: '#5c7a58',
    silhouette: '#4a4842',
    hat: '#c9bda1',
  },
  atmosphere: {
    heightFogTop: -0.1,
    heightFogBottom: -0.85,
  },
  path: {
    sceneSpacing: 7.2,
    lateralScale: 3.2,
    meanderA: 2.6,
    meanderB: 1.4,
    baseHalfWidth: 0.24,
    plazaBase: 0.14,
    plazaImportanceGain: 0.95,
    widthNoise: 0.1,
    samples: 520,
  },
  terrain: {
    rings: 3,
    cliffDepth: 0.85,
    cliffDepthNoise: 0.3,
  },
  decoration: {
    rockCount: 46,
    grassCount: 230, // BUILD 089: 릴만큼 무성하진 않게, 그러나 살아 있게
    vegetation: {
      bushCount: 30,
      treeCount: 9,
      greens: ['#2e5a40', '#4a8761', '#7bb489'], // 릴 채집값 (밝은 톤은 물빛 제거 보정)
    },
    stoneWallSet: 'stone-wall-02', // BUILD 084: RockSet06 재투입 (백색 괴물 원인 해결됨)
    seaEdgeSet: 'sea-edge-01',
    // BUILD 086: Vase — "길 양끝 벼랑 쪽에, 두 배 높이로"
    // BUILD 087: 만리장성 금지 — 담은 구간으로 끊어진다. 한쪽 조금, 다른 쪽 조금, 가끔 양쪽.
    edgeWall: {
      spanScenes: 0.85, step: 0.21, courses: 3, courseHeight: 0.17, inset: 0.15, scale: [1.15, 1.55],
      segMin: 1.3, segMax: 3.0, gapMin: 0.9, gapMax: 2.4, bothChance: 0.2,
    },
  },
  light: {
    hemiSky: '#b9d2d8',
    hemiGround: '#c8a97e',
    hemiIntensity: 0.55,
    sunColor: '#ffe7c2',
    sunIntensity: 1.35,
    sunPosition: [6, 11, 5],
    fillColor: '#9fc4c9',
    fillIntensity: 0.22,
    fillPosition: [-5, 3, -4],
  },
  camera: {
    mode: 'held',
    height: 2.7,
    baseDist: 4.2,
    fitGain: 0.55,
    reframeSec: 2.4,
    drift: 0.05,
  },
  walker: {
    timeScale: 0.72,
    // BUILD 091: 클립 고유속도(걷기 0.31 · 뛰기 0.86, 정규화 후)의 자연 배속권.
    // 릴의 느린 호흡(0.96Hz)과도 맞는다 — 서두르지 않는 세계.
    // BUILD 092: 리틀보이의 자연 배속권 (걷기 고유 0.70 · 뛰기 2.45, 정규화 후)
    walkSpeed: 0.58,
    runSpeed: 2.1,
  },
};

/**
 * 시드 기반 난수 생성기 (mulberry32).
 * worldCore의 seededRandom과 동일 계열 — Generator들은 반드시 이걸 쓴다.
 * Math.random 사용 금지 (재현 불가능한 세계는 디버깅 불가능한 세계다).
 */
export function createRng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a += 0x6d2b79f5;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
