// ---------- BUILD 207: PlanetSpec — 행성 세계의 악보 ----------
// 이전 에디터의 문법을 행성으로: 세계는 스펙이 정하고, 에디터는 스펙을 매만진다.
export type PlanetMemory = { title: string; text: string; t: number; stay: number };
// BUILD 214: 표면 배치물 — 방향(단위벡터)·반경으로 행성 표면에 못 박는다
export type PlanetProp = { id: string; obj: string; dir: [number, number, number]; r: number; rotY: number; scale: number; tilt?: number; lift?: number; title?: string; text?: string }; // title/text가 있으면 근처에서 폽 — 우연의 이벤트
// BUILD 216: 에디터 ↔ 세계 명령선 — 화면 좌표로 표면을 찍는다
export type PlanetApi = { pick: (clientX: number, clientY: number) => { dir: [number, number, number]; r: number } | null; capture: () => string | null; demoComet?: () => void; demoShower?: () => void };
// 에디터 '발밑에 심기'가 읽는 현재 접점 (매 프레임 갱신)
export type PlanetContact = { dir: [number, number, number]; r: number; tan: [number, number, number] };
export type PlanetSpec = {
  theme: 'earth' | 'luna' | 'moon' | 'desert';
  radius: number;      // 행성 반지름 (u)
  relief: number;      // 굴곡 배율 (테마 기본 진폭에 곱)
  fogLevel: number;    // 방사 안개 수위 — 지표 위 몇 u까지 차오르나 (0 = 무안개)
  fogStrength: number; // 방사 안개 농도
  walkSpeed: number;   // 걸음 (u/s)
  wraps: number;       // 길이 행성을 감는 바퀴
  wobble: number;      // 위도 요동 배율
  ponderChance: number;// 교차로에서 저 길을 고를 확률
  roam: boolean;       // BUILD 219: 지구본 모드 — 길 없이 마음대로 배회
  clouds?: number;     // BUILD 234: 하늘의 흰 구름 수 (자유 구름)
  cloudFree?: number;  // BUILD 234: 구름의 자유 — 0=지형처럼 붙박이, 1=달처럼 독립 (기본 0.9)
  cloudOpacity?: number; // BUILD 237: 흰 구름 반투명도 (기본 1)
  rainEvery?: number;  // BUILD 234: 비 주기(s) — 0=안 옴, 주기마다 먹구름이 태어나 비를 데려온다
  snowEvery?: number;  // BUILD 234: 눈 주기(s)
  planeEvery?: number; // BUILD 244: 비행기 출현 주기(s) — 0=없음
  shipEvery?: number;  // BUILD 244: 배 출현 주기(s) — 0=없음
  runEvery: number;    // BUILD 224: 뛰기 주기 (s, 0=안 뜀) — 평균 이 간격으로 한바탕 달린다
  rideEvery: number;   // BUILD 224: 탈것 주기 (s, 0=안 탐) — 구름/빗자루에 올라 한 바퀴
  lingerEvery?: number;  // BUILD 282: 체류 빈도 — 다음 체류까지 걷는 시간(s). 작을수록 자주 멈춰 논다 (기본 3)
  lingerLength?: number; // BUILD 282: 체류 길이 — 한 자리 머무는 정도 배율. 클수록 오래 논다 (기본 1)
  pet: string;         // BUILD 224: 반려 ('none' | PET_ROSTER id)
  walker?: number;     // BUILD 251: 산책자 캐릭터 인덱스 (발행 시 고정 — 방문자 전원이 같은 아이를 본다). undefined/-1 = 랜덤
  moon: { size: number; dist: number; period: number; tilt: number; light: number; spin: number };
  sun: { az: number; el: number; period: number }; // 방위·고도 (deg), 공전 주기 (s · 0=고정 정오)
  viewDist: number;    // 시야 거리 (씬 안개 far, u)
  memories: PlanetMemory[];
  props: PlanetProp[]; // BUILD 214: 표면 소품
};

export const DEFAULT_PLANET_SPEC: PlanetSpec = {
  theme: 'earth',
  radius: 12,
  relief: 1.0,
  fogLevel: 0.30,
  fogStrength: 0.8,
  walkSpeed: 0.58,
  wraps: 4,
  wobble: 1.0,
  ponderChance: 0.5,
  roam: false,
  clouds: 5,
  cloudFree: 0.1, // BUILD 235: 구름은 그 좌표 위에 거의 고정 — 0.9는 호위무사를 낳았다
  cloudOpacity: 1,
  rainEvery: 0,
  snowEvery: 0,
  planeEvery: 40,
  shipEvery: 30,
  runEvery: 45,
  rideEvery: 120,
  lingerEvery: 3,   // BUILD 282: 평균 3초 걷고 멈춰 논다 (체류 중심)
  lingerLength: 1,  // BUILD 282: 체류 길이 기본 배율
  pet: 'none',
  moon: { size: 0.273, dist: 34, period: 150, tilt: 15, light: 2.2, spin: 1 },
  sun: { az: 40, el: 52, period: 0 },
  viewDist: 41, // 구판 고정값 R×3.4(=40.8)의 계승
  memories: [],
  props: [],
};

const KEY = 'mimesis.planetDraft.v1';
export function loadPlanetDraft(): PlanetSpec {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULT_PLANET_SPEC, memories: [], props: [] };
    const p = JSON.parse(raw) as Partial<PlanetSpec>;
    return {
      ...DEFAULT_PLANET_SPEC,
      ...p,
      moon: { ...DEFAULT_PLANET_SPEC.moon, ...(p.moon ?? {}) },
      sun: { ...DEFAULT_PLANET_SPEC.sun, ...(p.sun ?? {}) },
      memories: Array.isArray(p.memories) ? p.memories : [],
      props: Array.isArray(p.props) ? p.props : [],
      cloudFree: p.cloudFree === 0.9 ? 0.1 : p.cloudFree, // BUILD 235 이행: 234의 잘못된 기본값 교정
    };
  } catch {
    return { ...DEFAULT_PLANET_SPEC, memories: [], props: [] };
  }
}
export function savePlanetDraft(spec: PlanetSpec) {
  try { localStorage.setItem(KEY, JSON.stringify(spec)); } catch { /* 저장 실패는 조용히 */ }
}
