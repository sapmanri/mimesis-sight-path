// ---------- BUILD 207: PlanetSpec — 행성 세계의 악보 ----------
// 이전 에디터의 문법을 행성으로: 세계는 스펙이 정하고, 에디터는 스펙을 매만진다.
export type PlanetMemory = { title: string; text: string; t: number; stay: number };
// BUILD 214: 표면 배치물 — 방향(단위벡터)·반경으로 행성 표면에 못 박는다
export type PlanetProp = { id: string; obj: string; dir: [number, number, number]; r: number; rotY: number; scale: number; tilt?: number; lift?: number; title?: string; text?: string }; // title/text가 있으면 근처에서 폽 — 우연의 이벤트
// BUILD 216: 에디터 ↔ 세계 명령선 — 화면 좌표로 표면을 찍는다
export type PlanetApi = { pick: (clientX: number, clientY: number) => { dir: [number, number, number]; r: number } | null };
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
    };
  } catch {
    return { ...DEFAULT_PLANET_SPEC, memories: [], props: [] };
  }
}
export function savePlanetDraft(spec: PlanetSpec) {
  try { localStorage.setItem(KEY, JSON.stringify(spec)); } catch { /* 저장 실패는 조용히 */ }
}
