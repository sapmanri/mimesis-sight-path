// ---------- BUILD 207: PlanetSpec — 행성 세계의 악보 ----------
// 이전 에디터의 문법을 행성으로: 세계는 스펙이 정하고, 에디터는 스펙을 매만진다.
export type PlanetMemory = { title: string; text: string; t: number; stay: number };
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
  moon: { size: number; dist: number; period: number; tilt: number; light: number };
  sun: { az: number; el: number }; // 방위·고도 (deg)
  memories: PlanetMemory[];
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
  moon: { size: 0.273, dist: 34, period: 150, tilt: 15, light: 2.2 },
  sun: { az: 40, el: 52 },
  memories: [],
};

const KEY = 'mimesis.planetDraft.v1';
export function loadPlanetDraft(): PlanetSpec {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULT_PLANET_SPEC, memories: [] };
    const p = JSON.parse(raw) as Partial<PlanetSpec>;
    return {
      ...DEFAULT_PLANET_SPEC,
      ...p,
      moon: { ...DEFAULT_PLANET_SPEC.moon, ...(p.moon ?? {}) },
      sun: { ...DEFAULT_PLANET_SPEC.sun, ...(p.sun ?? {}) },
      memories: Array.isArray(p.memories) ? p.memories : [],
    };
  } catch {
    return { ...DEFAULT_PLANET_SPEC, memories: [] };
  }
}
export function savePlanetDraft(spec: PlanetSpec) {
  try { localStorage.setItem(KEY, JSON.stringify(spec)); } catch { /* 저장 실패는 조용히 */ }
}
