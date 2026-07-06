export type PathSegmentKind =
  | 'straight'
  | 'soft-curve'
  | 'deep-curve'
  | 'bridge'
  | 'stair'
  | 'threshold'
  | 'open-field';

export type SurfaceState =
  | 'dry-stone'
  | 'wet-stone'
  | 'mud'
  | 'sand'
  | 'grass-edge'
  | 'snow-thin'
  | 'rain-puddle'
  | 'moss-aged';

export type WeatherState =
  | 'clear-day'
  | 'soft-cloud'
  | 'rain-cloud'
  | 'drizzle'
  | 'moon-night'
  | 'sunset-fade'
  | 'fog-morning';

export type ObjectKit =
  | 'none'
  | 'door-kit'
  | 'person-kit'
  | 'cloud-kit'
  | 'suitcase-kit'
  | 'book-kit'
  | 'cup-kit'
  | 'stone-wall-kit'
  | 'cd-shelf-kit'
  | 'fruit-kit'
  | 'airplane-wing-kit'
  | 'sea-edge-kit';

export const pathSegmentPresets: Record<PathSegmentKind, { width: number; curve: number; roughness: number }> = {
  straight: { width: 1.08, curve: 0.05, roughness: 0.2 },
  'soft-curve': { width: 1.18, curve: 0.28, roughness: 0.32 },
  'deep-curve': { width: 1.28, curve: 0.62, roughness: 0.42 },
  bridge: { width: 0.82, curve: 0.12, roughness: 0.18 },
  stair: { width: 1.02, curve: 0.08, roughness: 0.36 },
  threshold: { width: 1.42, curve: 0.04, roughness: 0.26 },
  'open-field': { width: 1.72, curve: 0.18, roughness: 0.3 },
};

export const surfaceColor: Record<SurfaceState, string> = {
  'dry-stone': '#e2d8c5',
  'wet-stone': '#c7cec2',
  mud: '#b9aa91',
  sand: '#e3d4b8',
  'grass-edge': '#d5d7bc',
  'snow-thin': '#ebe9df',
  'rain-puddle': '#c7d9d3',
  'moss-aged': '#c8ccb0',
};

export const weatherFog: Record<WeatherState, { color: string; near: number; far: number }> = {
  'clear-day': { color: '#8fbab0', near: 5.5, far: 20 },
  'soft-cloud': { color: '#93bbb1', near: 4.8, far: 18 },
  'rain-cloud': { color: '#78928f', near: 3.6, far: 14 },
  drizzle: { color: '#84a8a4', near: 3.4, far: 13 },
  'moon-night': { color: '#647d82', near: 4, far: 15 },
  'sunset-fade': { color: '#b8a990', near: 4.5, far: 17 },
  'fog-morning': { color: '#8fbab0', near: 3.2, far: 13 },
};

export const objectKitVariants: Record<ObjectKit, string[]> = {
  none: ['empty'], // BUILD 128: 오브젝트 없이 기억만 있는 자리 — 그게 기본이다
  'person-kit': ['back-view'],
  'cloud-kit': ['empty'],
  'door-kit': ['door-panel', 'handle', 'threshold-shadow', 'weathered-frame'],
  'suitcase-kit': ['full-suitcase', 'half-buried', 'handle-only', 'wheel-track', 'strap-fragment'],
  'book-kit': ['open-book', 'closed-book', 'yellowed-page', 'page-stack'],
  'cup-kit': ['warm-cup', 'saucer', 'steam-line', 'coffee-ring'],
  'stone-wall-kit': ['low-wall', 'single-stone', 'moss-stone', 'wall-gap'],
  'cd-shelf-kit': ['shelf-block', 'disc-line', 'case-stack', 'dust-layer'],
  'fruit-kit': ['small-fruit', 'cut-slice', 'seed-dot', 'plate-shadow'],
  'airplane-wing-kit': ['wing-slice', 'window-glint', 'cloud-shadow'],
  'sea-edge-kit': ['water-strip', 'foam-line', 'horizon-chip', 'wet-stone'],
};
