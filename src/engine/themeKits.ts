// ---------- BUILD 121: THEME KIT — 계층의 마지막 층 ----------
// 원자산(창고) → 카탈로그 → 세트(118) → 테마.
// 테마는 세계의 계절이다: 팔레트·시간·날씨·세트·워커를 한 번에 갈아입는다.
// "Object 단위 제작 금지, 반드시 Set 단위" — 그 원칙의 끝은 세계 단위다.

import { JEJU_SPEC, type WorldPalette, type WorldSpec } from './worldSpec';
import { PROP_SETS, expandPropSet, type PlacedProp } from './props';

export type ThemeSetHint = {
  /** PROP_SETS id */
  setId: string;
  /** 커브 진행률 0~1 — 길의 어디쯤 내려앉을지 */
  at: number;
  /** 길의 왼쪽(-1)/오른쪽(1). 생략하면 번갈아 */
  side?: -1 | 1;
  /** 길에서 떨어지는 거리 (기본 0.35 — 길은 둑길이다, 멀리 밀면 허공에 뜬다) */
  spread?: number;
};

export type ThemeKit = {
  id: string;
  label: string;
  description: string;
  /** JEJU_SPEC 원본 위에 덮는다. 생략 = 원본 복원 */
  palette?: Partial<WorldPalette>;
  /** 날씨+시간 일괄. time 필드가 envTime 역할 */
  weather?: WorldSpec['weather'];
  /** BUILD 148: 공기의 소리 — 테마가 파도와 생명의 밀도까지 정한다 */
  ambience?: WorldSpec['ambience'];
  /** 길을 따라 내려앉는 세트들 */
  sets?: ThemeSetHint[];
  /** 걷는 사람이 등불을 든다 */
  walkerLantern?: boolean;
};

export const THEME_KITS: ThemeKit[] = [
  {
    id: 'jeju',
    label: '🌊 제주 (기본)',
    description: '안개 위 절벽 둑길 — 원본 팔레트와 맑은 낮으로 되돌린다',
    weather: { kind: 'clear', time: 'day' },
    ambience: { sea: 0.55, life: 1 },
  },
  {
    id: 'winter',
    label: '❄️ 겨울',
    description: '눈 내리는 길. 걷는 사람은 등불을 든다',
    palette: {
      fog: '#8fa3b0',
      sandTop: '#d8dde2',
      sandEdge: '#c4cbd2',
      cliffHigh: '#b4bcc4',
      cliffMid: '#8e979f',
      cliffLow: '#69727b',
      basalt: '#5a6066',
      doorGreen: '#6e8a77',
      mint: '#a5bdb8',
      white: '#eceef0',
      plant: '#5c7060',
      plantDark: '#485a4d',
      silhouette: '#454a50',
      hat: '#c3c9cf',
    },
    weather: { kind: 'snow', rainAmount: 0.55, cloudAmount: 0.7, time: 'day' },
    ambience: { sea: 0, life: 0.3 },
    sets: [
      { setId: 'winteryard', at: 0.28, side: 1 },
      { setId: 'grove', at: 0.52, side: -1 },
      { setId: 'winteryard', at: 0.78, side: -1 },
    ],
    walkerLantern: true,
  },
];

/** 테마의 환경을 스펙에 입힌다 (배치물은 건드리지 않는다 — 그건 expandThemeSets의 일) */
export function applyThemeEnv(spec: WorldSpec, theme: ThemeKit) {
  spec.palette = { ...JEJU_SPEC.palette, ...(theme.palette ?? {}) };
  if (theme.weather) spec.weather = { ...theme.weather };
  if (theme.ambience) spec.ambience = { ...theme.ambience };
  spec.walker.lantern = theme.walkerLantern || undefined;
}

/** 테마의 세트들을 커브 앵커를 따라 내려놓는다. 조각은 개별 PlacedProp — 언제든 따로 만질 수 있다. */
export function expandThemeSets(
  theme: ThemeKit,
  anchors: [number, number, number][],
  seedBase: number,
): PlacedProp[] {
  if (!theme.sets || anchors.length < 2) return [];
  const out: PlacedProp[] = [];
  theme.sets.forEach((hint, i) => {
    const setDef = PROP_SETS.find((s) => s.id === hint.setId);
    if (!setDef) return;
    const idx = Math.min(anchors.length - 1, Math.max(0, Math.round(hint.at * (anchors.length - 1))));
    const a = anchors[idx];
    const b = anchors[Math.min(anchors.length - 1, idx + 1)];
    // 길의 접선 → 수직 방향으로 밀어낸다 (길을 침범하지 않게)
    let tx = b[0] - a[0]; let tz = b[2] - a[2];
    const tl = Math.hypot(tx, tz) || 1;
    tx /= tl; tz /= tl;
    const side = hint.side ?? (i % 2 === 0 ? 1 : -1);
    const spread = hint.spread ?? 0.35; // BUILD 123: 앵커=광장 중심. 1.7은 절벽 밖 허공이었다
    const cx = a[0] + -tz * side * spread;
    const cz = a[2] + tx * side * spread;
    out.push(...expandPropSet(setDef, cx, a[1], cz, (seedBase + i * 977) % 100000));
  });
  return out;
}
