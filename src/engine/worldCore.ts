// MIMESIS Sight Path — World Core (BUILD 073)
//
// 철학: 오브젝트는 주인공이 아니다. 길이 주인공이다. 길도 주인공이 아니다.
// 걷는 시간이 주인공이다.
//
// 이 모듈은 프레임워크(R3F)와 무관한 순수 three.js로 세계를 만든다.
// 하나의 연속된 CatmullRom 커브 → 하나의 절벽 둑길 지오메트리.
// "조각을 이어붙인 느낌"은 구조적으로 사라진다 (Path Generator V3).
//
// 검증: 이 모듈은 headless-gl로 실제 렌더링해 레퍼런스와 비교하며 다듬었다.

import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { ObservationScene } from '../data/jeju';
import { isGeneratorEnabled, JEJU_SPEC, type RoadMaterialId, type WorldGeneratorId, type WorldPalette, type WorldSpec } from './worldSpec';
import { ASSET_SETS, type AssetSet } from './worldSets';

/**
 * BUILD 084: AssetSet 조립기 — Set의 배치 규칙을 해석해 THREE 그룹을 만든다.
 * 조각(piece)은 시드 난수로 순환 선택된다. 원본 그룹은 절대 변형하지 않는다 (clone만).
 */
function buildAssetSet(set: AssetSet, pieceOf: (key: string) => THREE.Group, rnd: () => number): THREE.Group {
  const g = new THREE.Group();
  const pick = () => pieceOf(set.pieces[Math.floor(rnd() * set.pieces.length)]);
  if (set.rule.kind === 'wall') {
    for (const row of set.rule.rows) {
      for (let i = 0; i < row.count; i += 1) {
        const s = pick().clone(true);
        s.position.set(row.startX + i * row.stepX + (rnd() - 0.5) * row.jitter, row.y, (rnd() - 0.5) * 0.03);
        s.rotation.y = rnd() * Math.PI * 2;
        s.scale.multiplyScalar(row.scale[0] + rnd() * (row.scale[1] - row.scale[0]));
        g.add(s);
      }
    }
  } else {
    for (let i = 0; i < set.rule.count; i += 1) {
      const s = pick().clone(true);
      s.position.set((rnd() - 0.5) * set.rule.spreadX, 0, (rnd() - 0.5) * set.rule.spreadZ);
      s.rotation.y = rnd() * Math.PI * 2;
      s.scale.multiplyScalar(set.rule.scale[0] + rnd() * (set.rule.scale[1] - set.rule.scale[0]));
      g.add(s);
    }
  }
  return g;
}

// BUILD 082: 팔레트의 원본은 이제 worldSpec에 있다.
// PALETTE는 "현재 빌드 중인 세계의 활성 팔레트" — buildWorld(spec)가 갈아끼운다.
export const PALETTE: WorldPalette = { ...JEJU_SPEC.palette };

// 현재 빌드 중인 세계의 명세. buildWorld 진입 시 교체된다.
let SPEC: WorldSpec = JEJU_SPEC;
// 모든 프로시저럴 시드의 오프셋. seed=0 이면 레거시 제주와 동일 출력.
let WORLD_SEED = 0;
const worldRng = (base: number) => seededRandom(base + WORLD_SEED);

export type WorldAnchor = {
  p: THREE.Vector3;
  tan: THREE.Vector3;
  nor: THREE.Vector3;
  w: number;
};

export type BuiltWorld = {
  group: THREE.Group;
  curve: THREE.CatmullRomCurve3;
  anchors: WorldAnchor[];
  sun: THREE.DirectionalLight;
  fogColor: THREE.Color;
  /** scene-index progress (0..scenes.length-1) → curve t (0..1) */
  progressToT: (progress: number) => number;
  /** 모든 실물 모델 로드/배치 완료 시점 (실패해도 resolve — 프록시 폴백 유지) */
  ready: Promise<void>;
  /** BUILD 141: 바람에 흐르는 하늘 구름들 */
  clouds: THREE.Object3D[];
};




// ---------- BUILD 080: 높이 안개 (진짜로 잠기는 안개) ----------
// 버텍스 칠하기가 아니라, 조명 계산이 끝난 픽셀을 높이에 따라 안개색으로 섞는다.
// 경계선이 사라지고, 모든 오브젝트가 같은 높이에서 함께 잠긴다.
// BUILD 082: 원본은 spec.atmosphere — buildWorld 진입 시 갱신된다.
const HEIGHT_FOG = {
  top: JEJU_SPEC.atmosphere.heightFogTop,     // 이 높이부터 잠기기 시작
  bottom: JEJU_SPEC.atmosphere.heightFogBottom, // 이 높이에서 완전히 안개
  strength: 1, // BUILD 131: 전역 세기 0~1 — 재질 컴파일 시점에 구워진다 (스펙 변경 → 세계 재건 → 재컴파일)
};

export function applyHeightFog(mat: THREE.MeshStandardMaterial, strength = 1) { // BUILD 129: strength<1 = 안개에 덜 잠긴다 (열차 차체용)
  // 주의: mix는 sRGB 인코딩된 최종 색 위에서 돌므로, 안개색도 sRGB 값 그대로 써야 배경과 정확히 섞인다
  const hex = parseInt(PALETTE.fog.slice(1), 16);
  const c = { r: ((hex >> 16) & 255) / 255, g: ((hex >> 8) & 255) / 255, b: (hex & 255) / 255 };
  // BUILD 132: 값을 재질 생성 시점에 스냅샷 — 그리고 프로그램 캐시 키에 박는다.
  // THREE는 onBeforeCompile의 '함수 소스 문자열'로 셰이더 프로그램을 캐시한다. 값이 클로저 참조면
  // 소스가 항상 같아서 첫 컴파일 프로그램을 영원히 재사용 → 슬라이더가 헛돈다 (안개가 변하지 않던 사건의 진범).
  const top = HEIGHT_FOG.top;
  const bottom = HEIGHT_FOG.bottom;
  const str = strength * HEIGHT_FOG.strength;
  const glsl = (n: number) => n.toFixed(4);
  mat.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying float vHFy;')
      .replace('#include <fog_vertex>', '#include <fog_vertex>\nvHFy = (modelMatrix * vec4(transformed, 1.0)).y;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vHFy;')
      .replace(
        '#include <fog_fragment>',
        `#include <fog_fragment>\ngl_FragColor.rgb = mix(gl_FragColor.rgb, vec3(${glsl(c.r)}, ${glsl(c.g)}, ${glsl(c.b)}), (1.0 - smoothstep(${glsl(bottom)}, ${glsl(top)}, vHFy)) * ${glsl(str)});`,
      );
  };
  mat.customProgramCacheKey = () => `hfog|${top.toFixed(4)}|${bottom.toFixed(4)}|${str.toFixed(4)}|${PALETTE.fog}`;
  return mat;
}

// ---------- BUILD 076: 프로시저럴 표면 질감 ----------
// 레퍼런스의 "낡음"은 모델이 아니라 표면에 있다.
// DataTexture라 브라우저/헤드리스 양쪽에서 동일하게 생성·검증된다.

function makeValueNoise(w: number, h: number, seed: number) {
  const rnd = seededRandom(seed);
  const g = 16; // lattice
  const lattice: number[] = [];
  for (let i = 0; i < (g + 1) * (g + 1); i += 1) lattice.push(rnd());
  const lerp = (a: number, b: number, t: number) => a + (b - a) * (t * t * (3 - 2 * t));
  return (x: number, y: number, freq: number) => {
    const fx = ((x / w) * freq * g) % g;
    const fy = ((y / h) * freq * g) % g;
    const x0 = Math.floor(fx), y0 = Math.floor(fy);
    const tx = fx - x0, ty = fy - y0;
    const i = (xx: number, yy: number) => lattice[((yy % g) + g) % g * (g + 1) + (((xx % g) + g) % g)];
    return lerp(lerp(i(x0, y0), i(x0 + 1, y0), tx), lerp(i(x0, y0 + 1), i(x0 + 1, y0 + 1), tx), ty);
  };
}

/** BUILD 124: 길 상판 — 소재별 질감. 평균은 흰색(버텍스컬러 보존).
 * sand 모랫길(원본) · asphalt 골재 스페클 · concrete 신축이음 · woodplank 널판+나뭇결 · mud 젖은 얼룩 · glass 매끈+빗금 하이라이트 */
function makeGroundTexture(mat: RoadMaterialId = 'sand') {
  const S = 256;
  const data = new Uint8Array(S * S * 4);
  const n = makeValueNoise(S, S, 7133 + WORLD_SEED);
  const rnd = worldRng(9241);
  // 소재의 손맛: 얼룩 세기 / 알갱이 세기 / 점 개수 / 어두운 점 비율 / 색온도(+따뜻 -차가움)
  const P: Record<RoadMaterialId, { bl: number; gr: number; dots: number; darkBias: number; warm: number }> = {
    sand:      { bl: 0.22, gr: 0.16, dots: 320, darkBias: 0.4,  warm: 1.0 },
    asphalt:   { bl: 0.07, gr: 0.26, dots: 520, darkBias: 0.25, warm: 0.0 },
    concrete:  { bl: 0.11, gr: 0.06, dots: 120, darkBias: 0.55, warm: 0.0 },
    woodplank: { bl: 0.10, gr: 0.05, dots: 0,   darkBias: 0.5,  warm: 1.6 },
    mud:       { bl: 0.34, gr: 0.06, dots: 90,  darkBias: 0.8,  warm: 1.2 },
    glass:     { bl: 0.03, gr: 0.02, dots: 0,   darkBias: 0.5,  warm: -0.6 },
    train:     { bl: 0.05, gr: 0.04, dots: 0,   darkBias: 0.5,  warm: 0.0 }, // 열차 길은 지오메트리가 말한다 — 질감은 조용히
  };
  const c = P[mat] ?? P.sand; // BUILD 159: 미지의 소재는 모랫길로 — 오타 하나가 세계를 죽여선 안 된다
  const BOARD = 21; // 널판 폭(px) — 길이축(v)을 가로지르는 판자
  for (let y = 0; y < S; y += 1) {
    const board = Math.floor(y / BOARD);
    const boardTone = (n(0, board * 37, 5) - 0.5) * 0.12; // 판마다 다른 나무색
    for (let x = 0; x < S; x += 1) {
      const blotch = n(x, y, 3) * 0.5 + n(x, y, 7) * 0.3 + n(x, y, 19) * 0.2;
      const grain = (rnd() - 0.5) * c.gr;
      let v = 1 + (blotch - 0.5) * c.bl + grain;
      if (mat === 'woodplank') {
        v += boardTone + (n(x, board * 53, 34) - 0.5) * 0.1; // 나뭇결은 판을 따라 흐른다
        if (y % BOARD < 1) v *= 0.7;                          // 널판 사이 틈
      }
      if (mat === 'concrete' && y % 64 < 2) v *= 0.82;        // 신축 이음
      if (mat === 'glass') v += (n(x + y, 0, 5) - 0.5) * 0.05; // 비스듬한 하이라이트 결
      const w = c.warm;
      const r = v * (1 + (blotch - 0.5) * 0.02 * w);
      const gr2 = v * (1 - (blotch - 0.5) * 0.06 * Math.abs(w));
      const b = v * (1 - (blotch - 0.5) * 0.12 * w);
      const idx = (y * S + x) * 4;
      data[idx] = Math.max(0, Math.min(255, r * 235));
      data[idx + 1] = Math.max(0, Math.min(255, gr2 * 233));
      data[idx + 2] = Math.max(0, Math.min(255, b * 228));
      data[idx + 3] = 255;
    }
  }
  // 드문 점: 모래의 자갈 / 아스팔트의 골재 / 진흙의 돌
  for (let k = 0; k < c.dots; k += 1) {
    const cx = Math.floor(rnd() * S), cy = Math.floor(rnd() * S);
    const dark = rnd() < c.darkBias;
    const rad = rnd() > 0.85 ? 2 : 1;
    for (let dy = -rad; dy <= rad; dy += 1) for (let dx = -rad; dx <= rad; dx += 1) {
      if (dx * dx + dy * dy > rad * rad) continue;
      const idx = ((((cy + dy) % S + S) % S) * S + (((cx + dx) % S + S) % S)) * 4;
      const m = dark ? 0.62 : 1.22;
      data[idx] = Math.min(255, data[idx] * m);
      data[idx + 1] = Math.min(255, data[idx + 1] * m);
      data[idx + 2] = Math.min(255, data[idx + 2] * m);
    }
  }
  // 진흙: 크고 부드러운 젖은 얼룩
  if (mat === 'mud') {
    for (let k = 0; k < 46; k += 1) {
      const cx = Math.floor(rnd() * S), cy = Math.floor(rnd() * S);
      const rad = 3 + Math.floor(rnd() * 6);
      for (let dy = -rad; dy <= rad; dy += 1) for (let dx = -rad; dx <= rad; dx += 1) {
        const d2 = dx * dx + dy * dy;
        if (d2 > rad * rad) continue;
        const soft = 1 - (0.22 * (1 - d2 / (rad * rad)));
        const idx = ((((cy + dy) % S + S) % S) * S + (((cx + dx) % S + S) % S)) * 4;
        data[idx] *= soft; data[idx + 1] *= soft; data[idx + 2] *= soft;
      }
    }
  }
  const tex = new THREE.DataTexture(data, S, S);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

/** 절벽면: 세로 침식 줄무늬 + 지층 띠 + 파임 자국. u=깊이방향, v=길이방향. */
function makeCliffTexture() {
  const S = 256;
  const data = new Uint8Array(S * S * 4);
  const n = makeValueNoise(S, S, 4517 + WORLD_SEED);
  const rnd = worldRng(3391);
  for (let y = 0; y < S; y += 1) {
    for (let x = 0; x < S; x += 1) {
      // x = 깊이(u): 위(0)가 밝고 아래로 침식. y = 길이(v): 세로 스트릭.
      const streak = n(0, y, 9) * 0.6 + n(0, y, 23) * 0.4;        // 길이축 세로줄
      const strata = n(x, 0, 5);                                    // 깊이축 지층
      const pit = n(x, y, 13);
      const fade = 1 - Math.pow(x / S, 1.6); // 아래로 갈수록 질감 소멸
      let v = 1 + ((streak - 0.5) * 0.3 + (strata - 0.5) * 0.16 + (pit - 0.5) * 0.14 + (rnd() - 0.5) * 0.06) * fade;
      // 상단 모서리 AO 띠 (u가 0 근처)
      const rim = Math.max(0, 1 - (x / S) * 7);
      v *= 1 - rim * 0.22;
      const idx = (y * S + x) * 4;
      const c = Math.max(0, Math.min(255, v * 226));
      data[idx] = c; data[idx + 1] = Math.max(0, c - 4); data[idx + 2] = Math.max(0, c - 10);
      data[idx + 3] = 255;
    }
  }
  const tex = new THREE.DataTexture(data, S, S);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

// ---------- BUILD 075: 실물 모델 시스템 ----------
// 원칙: 모델은 팔레트를 통과해야만 세계에 들어온다 (원색 반입 금지).
// 로드 실패 시 프로시저럴 프록시가 그대로 남는다 (폴백 안전).

export type ModelLoader = (file: string) => Promise<{ scene: THREE.Group; animations: THREE.AnimationClip[] }>;

type ModelSpec = {
  file: string;
  height: number;        // 정규화 목표 크기 (월드 유닛, 사람 키 = 0.9)
  tint: string;          // 텍스처/무채색 재질의 대체 틴트
  preRotateX?: number;   // 눕혀진 모델 세우기 등
  fitMaxDim?: boolean;   // 높이 대신 최대 치수 기준 (납작한 돌 등)
  strip?: string;        // BUILD 084: 이 부분문자열을 이름에 포함한 메시 제거 (원본 에셋의 조명판 등)
  keepLook?: boolean;    // BUILD 085: 팔레트 미적용 — 원래 텍스처/색 보존 (워커 등 주인공급)
  texture?: string;      // BUILD 085: 수동 바인딩할 텍스처 파일명 (FBX 변환에서 누락된 경우)
  clipSpeeds?: { walk: number; run: number }; // BUILD 091: 클립 고유속도 (원척, u/s)
};

// BUILD 124: 길의 소재 목록. 색이 없으면(sand) 팔레트를 따른다 — 겨울 테마가 길을 눈길로 만들 수 있게.
export const ROAD_MATERIALS: Record<RoadMaterialId, { label: string; top?: string; edge?: string }> = {
  sand: { label: '모랫길' },
  asphalt: { label: '아스팔트', top: '#4d5052', edge: '#404346' },
  concrete: { label: '콘크리트', top: '#9aa0a2', edge: '#898f92' },
  woodplank: { label: '나무판 다리', top: '#8a6f52', edge: '#755f45' },
  mud: { label: '진흙길', top: '#6e5b46', edge: '#5f4f3e' },
  glass: { label: '유리판', top: '#b5cdd2', edge: '#9fb8bd' },
  train: { label: '열차 길', top: '#6e5a4d', edge: '#57493f' }, // BUILD 126: 길 자체가 열차다
};

export const MODELS: Record<string, ModelSpec> = {
  suitcase: { file: 'Old_Suitcase.glb', height: 0.3, tint: '#7e937f', preRotateX: -Math.PI / 2 }, // BUILD 087: 여행용 캐리어 크기 (0.42는 길을 침범했다)
  cabin: { file: 'Snow_Cabin_iso.glb', height: 0.9, tint: '#ddd6c2', strip: 'areaLight,aiSkyDomeLight,camera,pCube10,Oak_Tree,nRigid' }, // BUILD 085: 디오라마 받침판(7.5유닛 pCube10)/나무/조명/카메라 제거 — 건물만
  lighthouse: { file: 'Lighthouse_island_toy.glb', height: 9, tint: PALETTE.white },
  stone: { file: 'stone11.glb', height: 0.24, tint: '#6e7268', fitMaxDim: true },
  rock0: { file: 'Rock0.glb', height: 0.3, tint: '#79766a', fitMaxDim: true },
  rockA: { file: 'RockA.glb', height: 0.22, tint: '#6b6e63', fitMaxDim: true },
  rockB: { file: 'RockB.glb', height: 0.22, tint: '#75725f', fitMaxDim: true },
  rockC: { file: 'RockC.glb', height: 0.22, tint: '#666a61', fitMaxDim: true },
  rockD: { file: 'RockD.glb', height: 0.22, tint: '#7c7666', fitMaxDim: true },
  caveA: { file: 'CaveA.glb', height: 1.15, tint: '#8a7d68', fitMaxDim: true },
  caveB: { file: 'CaveB.glb', height: 0.95, tint: '#7e7361', fitMaxDim: true },
  // BUILD 092/093: 걷는 사람들. clipSpeeds = 루트 이동거리 ÷ 시간 (원척 정확값).
  walker: { file: 'LittleBoy.glb', height: 0.9, tint: '#57534a', keepLook: true, texture: 'LittleBoy_texture.png', clipSpeeds: { walk: 1.48, run: 5.207 } },
  airplane: { file: 'Kawasaki.glb', height: 1.6, tint: '#c9d1cb', fitMaxDim: true },
  chair: { file: 'Chair.glb', height: 0.64, tint: '#7e937f' }, // BUILD 104: 마법 의자 — 앉을 때 샤라락
  // BUILD 110: 동물들 — 소만 걷는다(스킨+클립 5종 이식본). 나머지는 길가에 선 조각들.
  cow: { file: 'Cow.glb', height: 0.95, tint: '#c9c2b4', keepLook: true },
  dog: { file: 'Dog.glb', height: 0.34, tint: '#8a7a5f' },
  duck: { file: 'Duck.glb', height: 0.22, tint: '#d8d2bd' },
  chicky: { file: 'Chicky.glb', height: 0.17, tint: '#d9c98e' },
  horse: { file: 'horse.glb', height: 1.05, tint: '#7d6a52' },
  piggy: { file: 'Piggy.glb', height: 0.4, tint: '#c9a091' },
  bear: { file: 'bear.glb', height: 0.85, tint: '#6b5a48' },
  deer: { file: 'deer.glb', height: 0.8, tint: '#9a8365' },
  boar: { file: 'boar.glb', height: 0.5, tint: '#6e6154' },
  wolf: { file: 'wolf.glb', height: 0.55, tint: '#75787a' },
  // BUILD 113: 창고에서 깨어난 것들
  cowshed: { file: 'Cowshed.glb', height: 2.6, tint: '#8a7a63', fitMaxDim: true }, // BUILD 123: 1.7→2.6 — 단독 배치 시 소가 외양간을 내려다보던 문제
  moon: { file: 'Moon.glb', height: 1.2, tint: '#e9e4d4', fitMaxDim: true },
  // BUILD 117: Vase의 등불들
  handlantern: { file: 'HandLantern.glb', height: 0.16, tint: '#c9b795', keepLook: true },
  lamp: { file: 'Lamp.glb', height: 0.42, tint: '#5a5148' }, // BUILD 123: 1.35(사람 키)→0.42 — 남포등은 손에 드는 물건이다
  // BUILD 107: 카탈로그 확장 등록
  stone11: { file: 'stone11.glb', height: 0.5, tint: '#6b6e63', fitMaxDim: true },
  rogue: { file: 'RogueHooded.glb', height: 0.95, tint: '#8f8a7a', keepLook: true },
  scavenger: { file: 'Scavenger.glb', height: 0.95, tint: '#8f8a7a', keepLook: true },
  rock3: { file: 'Rock3.glb', height: 0.3, tint: '#6d6f64', fitMaxDim: true },
  rock7: { file: 'Rock7.glb', height: 0.3, tint: '#82796a', fitMaxDim: true },
  // BUILD 119: 겨울이 창고에서 깨어난다 — Snowy_house.FBX.zip(분할 컬렉션) + snwmnnn.fbx
  snowyhouse: { file: 'SnowyHouse.glb', height: 1.6, tint: '#cfd6d8', strip: 'Plane' }, // Plane = 6×6 눈밭 받침판 제거 (지형과 사각 충돌)
  snowman: { file: 'Snowman.glb', height: 0.55, tint: '#dfe4e6' }, // 원점=바닥 눈덩이 중심, normalizeModel이 접지
  pinesnow: { file: 'PineSnow.glb', height: 2.6, tint: '#5c6e60', fitMaxDim: true }, // 눈 소나무 3그루 군락 (141k verts, 한 덩어리)
  // BUILD 126: 철길의 것들 — Vase 업로드 (트레인1.zip / Signal_Lights.FBX / 기찻길.zip)
  trainloco: { file: 'TrainLoco.glb', height: 1.1, tint: '#6e5a4d' },
  wagon2: { file: 'Wagon2.glb', height: 0.95, tint: '#7a5f52' },
  signallight: { file: 'SignalLight.glb', height: 0.9, tint: '#5a5f5c' },
  railsection: { file: 'RailSection.glb', height: 2.4, tint: '#6b665e', fitMaxDim: true }, // 12u 길이가 지배 축
  windturbine: { file: 'Eolic.glb', height: 4.2, tint: '#c8cdd1' }, // BUILD 136: 부유섬 받침 포함 (Vase 업로드 eolic_OBJ)
  broom: { file: 'Broom.glb', height: 1.15, tint: '#7a5a3a', fitMaxDim: true }, // BUILD 145: 0.85→1.15 — 엉덩이에 가려질 크기였다. GLB 노드의 Rx(-90) 제거로 눕은 게 원본
  seagull: { file: 'Seagull.glb', height: 0.75, tint: '#e2e6e4', fitMaxDim: true }, // BUILD 149: 활공 자세 728정점 — 날개폭 0.75u. 갈매기는 날갯짓하지 않는다, 바람을 탄다
  // BUILD 169: 우체통 속의 시 — 런던 우체통(무텍스처 로우폴리, 팔레트 적합) + 빨간 포스트박스(자기 옷)
  mailbox: { file: 'Mailbox.glb', height: 0.85, tint: '#9e4f45' },
  postboxred: { file: 'PostboxRed.glb', height: 0.8, tint: '#a5433c', keepLook: true },
  phonebooth: { file: 'PhoneBooth.glb', height: 1.5, tint: '#a5433c', keepLook: true }, // 길가의 우연 보너스 — 들길의 빨간 전화부스
};

// ---------- BUILD 093: WALKER ROSTER ----------
// 여덟 아이가 번갈아 이 길을 걷는다. 로드마다 한 명이 뽑힌다 — 오늘의 걷는 사람.
// BUILD 098: Kid2 복권 — 열한 명이 걷는다
export const WALKER_ROSTER: ModelSpec[] = [
  MODELS.walker, // LittleBoy (BUILD 092)
  { file: 'Kid1.glb', height: 0.9, tint: '#57534a', keepLook: true, texture: 'Kid1_texture.png', clipSpeeds: { walk: 0.007, run: 0.023 } },
  { file: 'Kid3.glb', height: 0.9, tint: '#57534a', keepLook: true, texture: 'Kid3_texture.png', clipSpeeds: { walk: 0.007, run: 0.013 } },
  { file: 'Kid4.glb', height: 0.9, tint: '#57534a', keepLook: true, texture: 'Kid4_texture.png', clipSpeeds: { walk: 0.006, run: 0.017 } },
  { file: 'Kid5.glb', height: 0.9, tint: '#57534a', keepLook: true, texture: 'Kid5_texture.png', clipSpeeds: { walk: 0.044, run: 0.098 } },
  { file: 'Kid6.glb', height: 0.9, tint: '#57534a', keepLook: true, texture: 'Kid6_texture.png', clipSpeeds: { walk: 0.007, run: 0.013 } },
  { file: 'Kid7.glb', height: 0.9, tint: '#57534a', keepLook: true, texture: 'Kid7_texture.png', clipSpeeds: { walk: 0.028, run: 0.073 } },
  { file: 'Kid8.glb', height: 0.9, tint: '#57534a', keepLook: true, texture: 'Kid8_texture.png', clipSpeeds: { walk: 0.007, run: 0.024 } },
  // BUILD 097: Kid9(신규, 로우폴리 본체), Kid10(애니 미동봉 → c9 클립 이식, fbx 본체로 축 정합)
  { file: 'Kid9.glb', height: 0.9, tint: '#57534a', keepLook: true, texture: 'Kid9_texture.png', clipSpeeds: { walk: 0.0071, run: 0.0192 } },
  // BUILD 106: Kid10 벤치 — 이식 클립과 의상 지오메트리 불화로 다리 사이 천막 (GPU 실측 채움 69% vs 정상 23%).
  // 파일은 보존, 클로스 뼈 처리 익히면 복귀. { file: 'Kid10.glb', ... }
  // BUILD 098: Kid2 구제 — 자기 FBX 애니로 재빌드 (지난번 glb 경로가 문제였다).
  // 텍스처는 원래 없는 단색 디자인 (#e7e7e7 석고 아이). 고유속도는 월드 실측.
  { file: 'Kid2.glb', height: 0.9, tint: '#57534a', keepLook: true, clipSpeeds: { walk: 1.3328, run: 3.5529 } },
  // BUILD 158: 하이커 — 걷는 데 특화된 사람. 클립도 걷기 하나뿐, 그래서 이 세계의 적임자.
  // clipSpeeds.walk = 힙 트랙 실측 드리프트 5.13(원척)/1.0s. run은 같은 클립 두 배속 기준.
  { file: 'Hiker.glb', height: 0.95, tint: '#57534a', keepLook: true, texture: 'Hiker_texture.png', clipSpeeds: { walk: 5.13, run: 10.3 } },
];



const PALETTE_HUES = [0.07, 0.11, 0.29, 0.53]; // wood, sand, sage, teal

function remapHue(h: number) {
  let best = PALETTE_HUES[0];
  let bestD = 2;
  for (const p of PALETTE_HUES) {
    const d = Math.min(Math.abs(h - p), 1 - Math.abs(h - p));
    if (d < bestD) { bestD = d; best = p; }
  }
  return best;
}

/** 모든 재질을 팔레트 안으로 리맵. 명도는 살리고 색조를 우리 세계로 끌어온다. */
// BUILD 085: GLB에 밀수된 조명 제거 (KHR_lights_punctual).
// RockA-D/CaveA-B에 백색 포인트라이트가 내장돼 있었다 — "백색 괴물"과
// 빛 웅덩이(담/절벽/슬랩 아래 발광)의 진범. 빛은 이 세계의 Light Generator만 만든다.
function stripLights(group: THREE.Object3D) {
  const smuggled: THREE.Object3D[] = [];
  group.traverse((node) => { if ((node as THREE.Light).isLight) smuggled.push(node); });
  smuggled.forEach((n) => n.parent?.remove(n));
}

function applyPalette(group: THREE.Group, fallbackTint: string) {
  const fallback = new THREE.Color(fallbackTint);
  stripLights(group);
  group.traverse((node) => {
    const mesh = node as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    const remapped = mats.map((orig) => {
      const o = orig as THREE.MeshStandardMaterial;
      const c = new THREE.Color();
      const src = o.color;
      const isTexturedOrFlat = !!o.map || !src || (src.r > 0.92 && src.g > 0.92 && src.b > 0.92);
      if (isTexturedOrFlat) {
        c.copy(fallback);
      } else {
        const hsl = { h: 0, s: 0, l: 0 };
        src.getHSL(hsl);
        const h = hsl.s < 0.08 ? 0.11 : remapHue(hsl.h);
        const s = Math.min(hsl.s * 0.55, 0.34);
        // BUILD 084: 밝기 상한 0.82→0.52. 리니어 l>0.52는 태양광(1.35)+ACES에서
        // 백색으로 날아간다 — RockSet 담 "백색 괴물"과 Snow_Cabin 발광의 근본 원인이었다.
        const l = Math.min(0.52, Math.max(0.16, hsl.l));
        c.setHSL(h, s, l);
      }
      return applyHeightFog(new THREE.MeshStandardMaterial({ color: c, roughness: 1, metalness: 0, side: THREE.DoubleSide }));
    });
    mesh.material = Array.isArray(mesh.material) ? remapped : remapped[0];
  });
}

/** 바운딩박스 기준: 목표 높이로 스케일, 바닥을 y=0, 중심을 원점으로. */
function normalizeModel(group: THREE.Group, spec: ModelSpec) {
  if (spec.preRotateX) group.rotation.x = spec.preRotateX;
  group.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(group);
  const size = box.getSize(new THREE.Vector3());
  const denom = spec.fitMaxDim ? Math.max(size.x, size.y, size.z) : size.y;
  const s = spec.height / Math.max(denom, 1e-6);
  group.scale.setScalar(s);
  group.userData.normScale = s; // BUILD 091: 클립 속도 환산용
  group.updateMatrixWorld(true);
  const box2 = new THREE.Box3().setFromObject(group);
  const center = box2.getCenter(new THREE.Vector3());
  group.position.x -= center.x;
  group.position.z -= center.z;
  group.position.y -= box2.min.y;
  const wrapper = new THREE.Group();
  wrapper.add(group);
  return wrapper;
}

export const defaultLoader: ModelLoader = (file) =>
  new Promise((resolve, reject) => {
    new GLTFLoader().load(
      `/assets/models/${file}`,
      (gltf) => resolve({ scene: gltf.scene as unknown as THREE.Group, animations: gltf.animations }),
      undefined,
      reject,
    );
  });

/** BUILD 109: 클립 동반 로더 — 로밍하는 것들(나그네, 훗날의 동물들)을 위해 */
export async function loadKitModelWithClips(key: string, loadModel: ModelLoader) {
  const spec = MODELS[key];
  const loaded = await loadModel(spec.file);
  const raw = loaded.scene;
  if (spec.strip) {
    const needles = spec.strip.split(',');
    const doomed: THREE.Object3D[] = [];
    raw.traverse((n) => { if (needles.some((x) => n.name.includes(x))) doomed.push(n); });
    doomed.forEach((n) => n.parent?.remove(n));
  }
  if (spec.keepLook) applyKeepLook(raw);
  else applyPalette(raw, spec.tint);
  return { group: normalizeModel(raw, spec), animations: loaded.animations };
}

/** BUILD 111: 자기 무늬 문법 — 팔레트 미적용, 단 조명 밀수 차단·높이안개는 예외 없음 */
function applyKeepLook(raw: THREE.Group) {
  stripLights(raw);
  raw.traverse((node) => {
    const mesh = node as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.frustumCulled = false; // 스킨드 메시: 뼈 이동 시 오컬링 방지
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    mats.forEach((m) => {
      const std = m as THREE.MeshStandardMaterial;
      std.roughness = 1;
      std.metalness = 0;
      applyHeightFog(std);
      std.needsUpdate = true;
    });
  });
}

export async function loadKitModel(key: string, loadModel: ModelLoader) {
  const spec = MODELS[key];
  const raw = (await loadModel(spec.file)).scene;
  if (spec.strip) {
    const needles = spec.strip.split(',');
    const doomed: THREE.Object3D[] = [];
    raw.traverse((n) => { if (needles.some((x) => n.name.includes(x))) doomed.push(n); });
    doomed.forEach((n) => n.parent?.remove(n));
  }
  if (spec.keepLook) applyKeepLook(raw); // BUILD 111: 서 있는 소도 자기 무늬를 입는다
  else applyPalette(raw, spec.tint);
  return normalizeModel(raw, spec);
}

/** 워커 실물 (Peasant Nolant): 정규화된 그룹 + Walk/Idle 애니메이션 클립 */
export async function loadWalkerAsset(loadModel: ModelLoader = defaultLoader, character: number | 'random' = 'random') {
  // BUILD 093: 오늘의 걷는 사람 — 로스터에서 뽑는다
  const idx = character === 'random'
    ? Math.floor(Math.random() * WALKER_ROSTER.length)
    : Math.max(0, Math.min(WALKER_ROSTER.length - 1, character));
  const spec = WALKER_ROSTER[idx] ?? MODELS.walker;
  const gltf = await loadModel(spec.file);
  if (spec.keepLook) {
    // BUILD 085: 주인공은 팔레트를 통과하지 않는다 — 자기 옷을 입고 걷는다.
    // 단 조명 밀수 차단과 높이안개는 세계의 문법이므로 예외 없이 적용.
    stripLights(gltf.scene);
    let map: THREE.Texture | null = null;
    if (spec.texture) {
      map = new THREE.TextureLoader().load(`/assets/models/${spec.texture}`);
      map.flipY = false;
      map.colorSpace = THREE.SRGBColorSpace;
    }
    gltf.scene.traverse((node) => {
      const mesh = node as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.frustumCulled = false; // 스킨드 메시: 뼈 이동 시 오컬링 방지
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      mats.forEach((m) => {
        const std = m as THREE.MeshStandardMaterial;
        if (map && std.color) { std.map = map; std.color.set('#ffffff'); }
        std.roughness = 1;
        std.metalness = 0;
        applyHeightFog(std);
        std.needsUpdate = true;
      });
    });
  } else {
    applyPalette(gltf.scene, spec.tint);
  }
  const group = normalizeModel(gltf.scene, spec);
  const ns = (gltf.scene.userData.normScale as number) ?? 1;
  const clipSpeeds = spec.clipSpeeds
    ? { walk: spec.clipSpeeds.walk * ns, run: spec.clipSpeeds.run * ns }
    : null;
  // BUILD 158: 외길 어댑터 — 걷기 클립 하나뿐인 캐릭터(믹사모 단일 익스포트)를 로스터 규격으로.
  // Walk = 원클립(루트모션 벗김) / Running = 같은 클립(발 물림은 timeScale이 맞춘다) / Idle = 첫 자세 미세 루프.
  // 걷기밖에 모르는 캐릭터에게 개성 클립은 없다 — 걷기가 곧 개성이다.
  let animations = gltf.animations;
  const WALK_CAND = ['Walking_A', 'Walking', 'Walk'];
  if (spec.clipSpeeds && animations.length && !animations.some((a) => WALK_CAND.includes(a.name))) {
    const src = animations.find((a) => a.name.includes('mixamo.com'))
      ?? animations.reduce((m, a) => (a.duration > m.duration ? a : m), animations[0]);
    const walkC = src.clone();
    walkC.name = 'Walk';
    // 루트모션 벗기기: 힙 수평 드리프트의 선형 성분을 빼서 제자리 걸음으로 (Y의 바운스는 남긴다)
    const hipT = walkC.tracks.find((t) => /hips\.position$/i.test(t.name));
    if (hipT) {
      const times = hipT.times; const vals = hipT.values;
      const n = times.length; const T = (times[n - 1] - times[0]) || 1;
      const dx = vals[(n - 1) * 3] - vals[0];
      const dz = vals[(n - 1) * 3 + 2] - vals[2];
      for (let i = 0; i < n; i += 1) {
        const k = (times[i] - times[0]) / T;
        vals[i * 3] -= dx * k;
        vals[i * 3 + 2] -= dz * k;
      }
    }
    const runC = walkC.clone(); runC.name = 'Running';
    // BUILD 160: 진정제 — 0~2프레임 루프는 15Hz 진동(모기 날개)이었다. 다리가 모이는 통과 자세 한 프레임으로 정지
    const idleC = THREE.AnimationUtils.subclip(walkC, 'Idle', 7, 8, 30);
    animations = [walkC, runC, idleC]; // 조명 액션 등 부스러기는 태우지 않는다
  }
  return { group, animations, clipSpeeds };
}

function seededRandom(seed: number) {
  let v = seed % 2147483647;
  if (v <= 0) v += 2147483646;
  return () => ((v = (v * 16807) % 2147483647) - 1) / 2147483646;
}

function noise1(x: number) {
  return Math.sin(x * 1.7) * 0.55 + Math.sin(x * 3.7 + 1.3) * 0.3 + Math.sin(x * 7.1 + 4.2) * 0.15;
}

export function buildWorld(
  scenes: ObservationScene[],
  loadModel: ModelLoader = defaultLoader,
  spec: WorldSpec = JEJU_SPEC,
): BuiltWorld {
  // ---- 0. BUILD 082: 명세 활성화. 이 아래의 모든 생성기는 spec을 읽는다. ----
  SPEC = spec;
  WORLD_SEED = spec.meta.seed | 0;
  Object.assign(PALETTE, spec.palette);
  HEIGHT_FOG.top = spec.atmosphere.heightFogTop;
  HEIGHT_FOG.bottom = spec.atmosphere.heightFogBottom;
  HEIGHT_FOG.strength = spec.atmosphere.heightFogStrength ?? 1; // BUILD 131

  const group = new THREE.Group();

  // ---- 1. path: ONE continuous centripetal catmull-rom, with lead-in/out ----
  const P = spec.path;
  const pts = scenes.map((s, i) => {
    const meander = Math.sin(i * 1.35) * P.meanderA + Math.sin(i * 0.55 + 1.2) * P.meanderB;
    if (P.loop) {
      const N = scenes.length;
      const ang = (i / N) * Math.PI * 2;
      const style = P.loopStyle ?? 'ring';
      // BUILD 153: 매듭의 길 — 세잎 매듭. 길이 길 위를 세 번 건넌다 (교차 고도차 = 1.45×loopY)
      if (style === 'knot') {
        const sc = (N * P.sceneSpacing) / 25.53; // 세잎 매듭의 XZ 호길이 상수
        const h = P.loopY ?? 2.0;
        return new THREE.Vector3(
          (Math.sin(ang) + 2 * Math.sin(2 * ang)) * sc,
          -Math.sin(3 * ang) * h + s.position[1] * 1.2,
          (Math.cos(ang) - 2 * Math.cos(2 * ang)) * sc,
        );
      }
      const R = Math.max(4.5, (N * P.sceneSpacing) / (Math.PI * 2));
      // BUILD 153: 헤매는 길 — 원 위에 서로 어긋난 하모닉 넷을 겹치면, 걷는 눈엔 원이 사라진다
      if (style === 'wander') {
        const rng = worldRng(9137);
        const ph = [rng() * 6.28, rng() * 6.28, rng() * 6.28, rng() * 6.28];
        const rr = R * (1
          + (0.24 + rng() * 0.08) * Math.sin(2 * ang + ph[0])
          + (0.18 + rng() * 0.07) * Math.sin(3 * ang + ph[1])
          + (0.13 + rng() * 0.05) * Math.sin(5 * ang + ph[2])
          + (0.08 + rng() * 0.04) * Math.sin(7 * ang + ph[3])
        ) + s.position[0] * P.lateralScale * 0.6 + meander;
        const hy = P.loopY ?? 0.9; // 완만한 언덕 — 모르는 길은 오르내린다
        const y = hy * (0.6 * Math.sin(3 * ang + ph[1]) + 0.4 * Math.sin(7 * ang + ph[3])) + s.position[1] * 1.2;
        return new THREE.Vector3(Math.cos(ang) * rr, y, Math.sin(ang) * rr);
      }
      // BUILD 150: 동그라미 (기본) — 정직한 원. 이제는 셋 중 하나일 뿐
      const rr = R + s.position[0] * P.lateralScale * 0.6 + meander;
      return new THREE.Vector3(Math.cos(ang) * rr, s.position[1] * 1.2, Math.sin(ang) * rr);
    }
    return new THREE.Vector3(s.position[0] * P.lateralScale + meander, s.position[1] * 1.2, i * -P.sceneSpacing);
  });
  // BUILD 150: 순환의 길 — 커브를 닫으면 시작도 끝도 없다. 리드인/아웃도 필요 없다 (돌아오는 길이 리드인이므로)
  const loop = !!P.loop;
  const allPts = loop ? pts : (() => {
    const first = pts[0];
    const second = pts[1];
    const leadIn = first.clone().add(first.clone().sub(second).setLength(11));
    const last = pts[pts.length - 1];
    const prev = pts[pts.length - 2];
    const leadOut = last.clone().add(last.clone().sub(prev).setLength(14));
    return [leadIn, ...pts, leadOut];
  })();
  const curve = new THREE.CatmullRomCurve3(allPts, loop, 'centripetal', 0.5);
  const span = allPts.length - (loop ? 0 : 1);
  const tOf = (i: number) => (i + (loop ? 0 : 1)) / span;
  const progressToT = loop
    ? (progress: number) => { const n = scenes.length; const w = ((progress % n) + n) % n; return w / n; } // 감아 돈다
    : (progress: number) => tOf(Math.max(0, Math.min(scenes.length - 1, progress)));

  const SAMPLES = P.samples;
  type Frame = { t: number; p: THREE.Vector3; tan: THREE.Vector3; nor: THREE.Vector3 };
  const frames: Frame[] = [];
  for (let i = 0; i <= SAMPLES; i += 1) {
    const t = i / SAMPLES;
    const p = curve.getPoint(t);
    const tan = curve.getTangent(t).setY(0).normalize();
    const nor = new THREE.Vector3(-tan.z, 0, tan.x);
    frames.push({ t, p, tan, nor });
  }

  // width profile: 좁은 오솔길. 광장은 상시가 아니라 '중요한 기억을 만나는 순간'의 이벤트다.
  // importance가 낮은 장면은 거의 부풀지 않는다.
  const sceneT = pts.map((_, i) => tOf(i));
  const plazaBoost = scenes.map((s) => P.plazaBase + Math.max(0, (s.importance ?? 1) - 1.0) * P.plazaImportanceGain);
  const widthAt = (t: number) => {
    let w = P.baseHalfWidth;
    for (let k = 0; k < sceneT.length; k += 1) {
      const d = Math.abs(t - sceneT[k]) * span;
      w += plazaBoost[k] * Math.exp(-d * d * 4.2);
    }
    return w * (1 + noise1(t * 40) * P.widthNoise);
  };

  // ---- 이하 BUILD 083: 생성기 파이프라인. 순서는 WORLD_PIPELINE 참조. ----
  const on = (id: WorldGeneratorId) => isGeneratorEnabled(spec, id);

  // [terrain] 절벽 둑길 지오메트리
  if (on('terrain')) group.add(SPEC.path.material === 'train' ? buildTrainRoad(frames, widthAt) : buildTerrain(frames, widthAt)); // BUILD 126
  // [edge] 길 가장자리 풀잎
  if (on('edge')) group.add(buildEdgePlants(frames, widthAt));

  const anchors: WorldAnchor[] = sceneT.map((t) => {
    const p = curve.getPoint(t);
    const tan = curve.getTangent(t).setY(0).normalize();
    const nor = new THREE.Vector3(-tan.z, 0, tan.x);
    return { p, tan, nor, w: widthAt(t) };
  });

  // [memoryPoints] 장면별 기억 오브젝트 (kit 슬롯 + 비행기 앵커)
  const kitSlots: { kit: string; slot: THREE.Group; seed: number }[] = [];
  const wingSpots: { p: THREE.Vector3; tan: THREE.Vector3; nor: THREE.Vector3; side: number; sceneIndex: number }[] = [];
  if (on('memoryPoints')) {
    group.add(buildMemoryObjects(scenes, anchors, kitSlots));
    scenes.forEach((s, i) => {
      if (s.objectKit === 'airplane-wing-kit') {
        const a = anchors[i];
        wingSpots.push({ p: a.p.clone(), tan: a.tan.clone(), nor: a.nor.clone(), side: i % 2 === 0 ? 1 : -1, sceneIndex: i });
      }
    });
  }

  // [decoration] 바위 산란 지점: 절벽 모서리(rim)와 벽면(face)
  const rockSpots: { pos: THREE.Vector3; rotY: number; scale: number; face: boolean }[] = [];
  if (on('decoration')) {
    const rrnd = worldRng(6612);
    for (let k = 0; k < SPEC.decoration.rockCount; k += 1) {
      const i = Math.floor(rrnd() * frames.length);
      const f = frames[i];
      const w = widthAt(f.t);
      const side = rrnd() > 0.5 ? 1 : -1;
      const onFace = rrnd() > 0.55;
      const out = onFace ? w * (0.92 + rrnd() * 0.2) : w * (0.82 + rrnd() * 0.14);
      const y = onFace ? f.p.y - 0.12 - rrnd() * 0.28 : f.p.y - 0.03;
      const pos = f.p.clone().add(f.nor.clone().multiplyScalar(side * out)).setY(y);
      rockSpots.push({ pos, rotY: rrnd() * Math.PI * 2, scale: 0.35 + rrnd() * 0.85, face: onFace });
    }
  }

  // [decoration] BUILD 089: 식생 — 수풀과 작은 나무 (기억 앵커 주변은 비워둔다)
  if (on('decoration')) {
    group.add(buildVegetation(frames, widthAt, anchors.map((a) => a.p)));
  }

  // [decoration] BUILD 086: 벼랑 가장자리 담 스팟 — 길을 막지 않고 양옆을 따라간다
  // Vase: "돌담을 가로로 놓지 말고, 길 양끝 벼랑 쪽에 두 배 높이로"
  const edgeWallSpots: { pos: THREE.Vector3; rotY: number; scale: number }[] = [];
  if (on('decoration')) {
    const EW = SPEC.decoration.edgeWall;
    const ewRnd = worldRng(7781);
    // BUILD 087: 연속한 담 장면(돌담길·능소화 담장)은 하나의 구간으로 병합 —
    // 두 패턴이 겹치면 결국 만리장성이 된다.
    const spanT0 = (EW.spanScenes / Math.max(1, scenes.length - 1));
    const rawSpans = scenes
      .map((sc, i) => (sc.objectKit === 'stone-wall-kit' ? [sceneT[i] - spanT0, sceneT[i] + spanT0] : null))
      .filter((x): x is number[] => !!x)
      .sort((a, b) => a[0] - b[0]);
    const spans: number[][] = [];
    rawSpans.forEach((sp) => {
      const last = spans[spans.length - 1];
      if (last && sp[0] <= last[1]) last[1] = Math.max(last[1], sp[1]);
      else spans.push([...sp]);
    });
    spans.forEach(([spanStart, spanEnd]) => {
      // 곡선을 따라 걸으며 구간 리듬으로 담을 세운다.
      // BUILD 087: 만리장성이 아니다 — 한쪽 조금, 다른 쪽 조금, 가끔 양쪽, 그리고 빈틈.
      let walkT = Math.max(0, spanStart);
      const endT = Math.min(1, spanEnd);
      let prev = curve.getPoint(walkT);
      let segRemain = 0;   // 남은 담 구간 길이 (월드 유닛)
      let gapRemain = 0.3; // 남은 빈틈 길이 — 살짝 비운 채 시작
      let sides: number[] = [1];
      let segCourses = EW.courses;
      while (walkT < endT) {
        walkT += 0.0006;
        const pcur = curve.getPoint(walkT);
        const stepDist = pcur.distanceTo(prev);
        if (stepDist < EW.step) continue;
        prev = pcur;
        if (gapRemain > 0) { gapRemain -= stepDist; continue; }
        if (segRemain <= 0) {
          // 새 구간 개시: 어느 쪽에 설지, 몇 단으로 쌓을지 정한다
          segRemain = EW.segMin + ewRnd() * (EW.segMax - EW.segMin);
          const r = ewRnd();
          sides = r < EW.bothChance ? [-1, 1] : r < EW.bothChance + (1 - EW.bothChance) / 2 ? [-1] : [1];
          segCourses = Math.max(2, EW.courses - (ewRnd() < 0.4 ? 1 : 0));
        }
        segRemain -= stepDist;
        if (segRemain <= 0) gapRemain = EW.gapMin + ewRnd() * (EW.gapMax - EW.gapMin);
        const tanH = curve.getTangent(walkT).setY(0).normalize();
        const norH = new THREE.Vector3(-tanH.z, 0, tanH.x);
        const w = widthAt(walkT);
        for (const side of sides) {
          for (let c = 0; c < segCourses; c += 1) {
            // 위 단으로 갈수록 성긴다 — 손으로 쌓은 담. 구간 끝머리는 자연히 낮아진다
            if (c > 0 && ewRnd() < 0.22) continue;
            if (c === segCourses - 1 && segRemain < 0.5 && ewRnd() < 0.6) continue;
            const out = w - EW.inset - c * 0.03 + (ewRnd() - 0.5) * 0.05;
            const pos = pcur.clone()
              .add(norH.clone().multiplyScalar(side * out))
              .setY(pcur.y - 0.05 + c * EW.courseHeight);
            edgeWallSpots.push({
              pos,
              rotY: ewRnd() * Math.PI * 2,
              scale: EW.scale[0] + ewRnd() * (EW.scale[1] - EW.scale[0]),
            });
          }
        }
      }
    });
  }

  // [landscape] 원경 — 닿을 수 없는 기억
  const distant = on('landscape')
    ? buildDistantWorld(spec.weather?.kind ?? 'clear', spec.weather?.cloudAmount ?? 0.5)
    : { group: new THREE.Group(), lighthouseSlot: new THREE.Group(), clouds: [] as THREE.Object3D[] };
  if (on('landscape')) group.add(distant.group);

  // [assets] 실물 GLB 비동기 투입 (BUILD 075). 끄면 프록시만 남는 고속 프리뷰.
  const ready = on('assets')
    ? attachModels(kitSlots, distant.lighthouseSlot, rockSpots, wingSpots, edgeWallSpots, group, loadModel).catch(() => {})
    : Promise.resolve();

  // [light] 빛 생성기. sun은 BuiltWorld 계약상 항상 생성 (그림자 타겟 추적용).
  const L = spec.light;
  // BUILD 107: 날씨 — 흐리면 빛이 재를 머금고, 비가 오면 세계가 어두워진다
  const wKind = spec.weather?.kind ?? 'clear';
  const wDim = wKind === 'rain' ? 0.48 : wKind === 'cloudy' ? 0.72 : 1;
  const wGray = wKind === 'rain' ? 0.55 : wKind === 'cloudy' ? 0.35 : 0;
  const wTint = (hex: string) => new THREE.Color(hex).lerp(new THREE.Color('#8d979c'), wGray);
  // BUILD 115: 밤 — 태양의 자리를 달이 이어받는다. 그림자 리그는 그대로, 빛의 성질만 바뀐다.
  const night = (spec.weather?.time ?? 'day') === 'night';
  const lights = new THREE.Group();
  const hemiSky = night ? '#233245' : L.hemiSky;
  const hemiGround = night ? '#141a23' : L.hemiGround;
  lights.add(new THREE.HemisphereLight(wTint(hemiSky), wTint(hemiGround), L.hemiIntensity * (0.7 + wDim * 0.3) * (night ? 0.55 : 1)));
  const sunColor = night ? new THREE.Color('#c3d2ee').lerp(new THREE.Color('#8d979c'), wGray) : wTint(L.sunColor);
  const sun = new THREE.DirectionalLight(sunColor, L.sunIntensity * wDim * (night ? 0.3 : 1));
  sun.position.set(...L.sunPosition);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 60;
  sun.shadow.camera.left = -20;
  sun.shadow.camera.right = 20;
  sun.shadow.camera.top = 20;
  sun.shadow.camera.bottom = -20;
  sun.shadow.bias = -0.0005;
  sun.shadow.radius = 4;
  lights.add(sun);
  lights.add(sun.target);
  const fill = new THREE.DirectionalLight(wTint(L.fillColor), L.fillIntensity * wDim);
  fill.position.set(...L.fillPosition);
  lights.add(fill);
  if (on('light')) group.add(lights);

  const fogColor = new THREE.Color(PALETTE.fog).lerp(new THREE.Color('#48545c'), wGray);
  if (night) fogColor.lerp(new THREE.Color('#0d1420'), 0.75); // BUILD 115: 밤하늘·밤안개
  return { group, curve, anchors, sun, fogColor, progressToT, ready: ready as Promise<void> , clouds: distant.clouds };
}

async function attachModels(
  kitSlots: { kit: string; slot: THREE.Group; seed: number }[],
  lighthouseSlot: THREE.Group,
  rockSpots: { pos: THREE.Vector3; rotY: number; scale: number; face: boolean }[],
  wingSpots: { p: THREE.Vector3; tan: THREE.Vector3; nor: THREE.Vector3; side: number; sceneIndex: number }[],
  edgeWallSpots: { pos: THREE.Vector3; rotY: number; scale: number }[],
  worldGroup: THREE.Group,
  loadModel: ModelLoader,
) {
  const tasks: Promise<void>[] = [];

  // 바위 산란: 절벽 모서리와 벽면에 박힌 실물 바위
  tasks.push(Promise.all([
    loadKitModel('rock0', loadModel),
    loadKitModel('rock3', loadModel),
    loadKitModel('rock7', loadModel),
    loadKitModel('caveA', loadModel),
    loadKitModel('caveB', loadModel),
  ]).then((variants) => {
    const rockGroup = new THREE.Group();
    rockSpots.forEach((spot, i) => {
      // 대형 슬랩(CaveWalls)은 절벽면 전용 — 길 위에는 작은 바위만
      const isSlab = spot.face && i % 2 === 0;
      const r = variants[isSlab ? 3 + (i % 2) : i % 3].clone(true);
      r.position.copy(spot.pos);
      r.rotation.y = spot.rotY;
      r.scale.setScalar(isSlab ? spot.scale * 0.55 : spot.scale * (spot.face ? 1 : 0.6));
      rockGroup.add(r);
    });
    worldGroup.add(rockGroup);
  }).then(() => undefined));

  // 캐리어: 프록시 대신 진짜 낡은 캐리어
  const suitcaseSlots = kitSlots.filter((k) => k.kit === 'suitcase-kit');
  if (suitcaseSlots.length) {
    tasks.push(loadKitModel('suitcase', loadModel).then((model) => {
      suitcaseSlots.forEach((k) => { k.slot.clear(); k.slot.add(model.clone(true)); });
    }));
  }

  // 돌담: BUILD 086 — 길을 막지 않는다. 양쪽 벼랑 끝을 따라 쌓인 담 (edgeWallSpots)
  const wallSet = ASSET_SETS[SPEC.decoration.stoneWallSet] ?? ASSET_SETS['stone-wall-01'];
  const wallSlots = kitSlots.filter((k) => k.kit === 'stone-wall-kit');
  if (edgeWallSpots.length || wallSlots.length) {
    tasks.push(Promise.all(wallSet.pieces.map((p) => loadKitModel(p, loadModel))).then((loaded) => {
      wallSlots.forEach((k) => k.slot.clear()); // 가로막던 프록시 철거
      const wrnd = worldRng(7783);
      const wallGroup = new THREE.Group();
      edgeWallSpots.forEach((spot) => {
        const piece = loaded[Math.floor(wrnd() * loaded.length)].clone(true);
        piece.position.copy(spot.pos);
        piece.rotation.y = spot.rotY;
        piece.scale.multiplyScalar(spot.scale);
        wallGroup.add(piece);
      });
      worldGroup.add(wallGroup);
    }));
  }

  // 바다 끝 돌무더기: AssetSet 규칙 유지 (BUILD 084)
  const seaSlots = kitSlots.filter((k) => k.kit === 'sea-edge-kit');
  if (seaSlots.length) {
    const edgeSet = ASSET_SETS[SPEC.decoration.seaEdgeSet] ?? ASSET_SETS['sea-edge-01'];
    tasks.push(Promise.all(edgeSet.pieces.map((p) => loadKitModel(p, loadModel))).then((loaded) => {
      const pieceOf = (key: string) => loaded[edgeSet.pieces.indexOf(key)];
      seaSlots.forEach((k) => {
        const rnd = worldRng(k.seed);
        k.slot.clear();
        k.slot.add(buildAssetSet(edgeSet, pieceOf, rnd));
      });
    }));
  }

  // 길가의 오두막: 장면이 아니라 길 옆의 기억 (돌담길 부근)
  const cabinHost = kitSlots.find((k) => k.kit === 'stone-wall-kit');
  if (cabinHost) {
    tasks.push(loadKitModel('cabin', loadModel).then((cabin) => {
      cabin.position.set(1.6, -0.5, -1.4); // 길 옆, 살짝 아래 — 제 절벽 위에 앉은 느낌
      cabin.rotation.y = -0.6;
      cabinHost.slot.parent?.add(cabin);
      cabin.position.add(cabinHost.slot.position);
    }));
  }

  // 원경 등대섬
  tasks.push(loadKitModel('lighthouse', loadModel).then((lh) => {
    lighthouseSlot.add(lh);
  }));

  // 비행기: 길 옆 허공을 스쳐 지나가는 중 — 진행 방향과 나란히, 반쯤 안개 위
  if (wingSpots.length) {
    tasks.push(loadKitModel('airplane', loadModel).then((plane) => {
      wingSpots.forEach((w) => {
        const p = plane.clone(true);
        p.position.copy(w.p)
          .add(w.nor.clone().multiplyScalar(w.side * 9))
          .add(new THREE.Vector3(0, -0.15, 0)); // 허공 멀리, 안개에 반쯤 잠긴 채
        p.rotation.y = Math.atan2(w.tan.x, w.tan.z) + 0.25;
        p.rotation.z = 0.06;
        p.traverse((n) => { n.userData.sceneIndex = w.sceneIndex; }); // BUILD 109: 비행기도 클릭 선택
        worldGroup.add(p);
      });
    }));
  }

  await Promise.allSettled(tasks);
}

// ---------- terrain ----------
type Frame = { t: number; p: THREE.Vector3; tan: THREE.Vector3; nor: THREE.Vector3 };

// ---------- BUILD 126: 열차 길 ----------
// "길 자체가 열차여도 되. 열차 한동 한동씩이 이어져 있고 그 위를 걸어가는 것" — Vase.
// 차체는 강체다 — 커브의 굽이에서 동과 동 사이가 진짜 열차처럼 꺾인다.
// 동 사이 지붕엔 나무판자가 자동으로 걸린다. 발밑엔 바퀴, 창엔 불빛.
function buildTrainRoad(frames: Frame[], widthAt: (t: number) => number) {
  const g = new THREE.Group();
  // BUILD 129: 열차의 두 얼굴 — 낡은 열차(기본)와 테제베
  // BUILD 160: 세 얼굴 — 클래식(기본, Vase의 객차 GLB) / 낡은 열차 / 테제베
  const style: 'old' | 'tgv' | 'classic' = SPEC.path.trainStyle ?? 'classic';
  const CAR_LEN = style === 'tgv' ? 3.6 : style === 'classic' ? 2.9 : 2.7;
  const GAP = style === 'tgv' ? 0.22 : style === 'classic' ? 0.34 : 0.42;
  const PITCH = CAR_LEN + GAP;
  const CAR_W = style === 'tgv' ? 0.7 : style === 'classic' ? 0.55 : 0.74;
  const CAR_H = style === 'tgv' ? 0.5 : style === 'classic' ? 0.785 : 0.6; // classic: GLB 실측 비율(지붕→바퀴 밑 1.0) 기준 레일 높이 정합
  const rnd = worldRng(2611);

  // 누적 거리 → 프레임 보간
  const distAt: number[] = [0];
  for (let i = 1; i < frames.length; i += 1) distAt.push(distAt[i - 1] + frames[i].p.distanceTo(frames[i - 1].p));
  const total = distAt[distAt.length - 1];
  const atDist = (d: number) => {
    let lo = 0; let hi = distAt.length - 1;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (distAt[mid] < d) lo = mid + 1; else hi = mid; }
    const i = Math.max(1, lo);
    const t = (d - distAt[i - 1]) / Math.max(1e-6, distAt[i] - distAt[i - 1]);
    const p = frames[i - 1].p.clone().lerp(frames[i].p, t);
    const tan = frames[i - 1].tan.clone().lerp(frames[i].tan, t).setY(0).normalize();
    return { p, tan };
  };

  const pos: number[] = []; const col: number[] = []; const idx: number[] = [];
  const wpos: number[] = []; const wcol: number[] = []; const widx: number[] = [];
  const UP = new THREE.Vector3(0, 1, 0);
  /** 강체 박스를 버텍스컬러 버퍼에 민다. 면별 가짜 AO: 윗면 1.0 / 옆 0.82 / 앞뒤 0.74 / 바닥 0.55 */
  const pushBox = (arrP: number[], arrC: number[], arrI: number[], c: THREE.Vector3, f: THREE.Vector3, hl: number, hw: number, hh: number, color: THREE.Color) => {
    const r = new THREE.Vector3().crossVectors(f, UP).normalize();
    const corner = (sf: number, sr: number, su: number) => new THREE.Vector3()
      .copy(c).addScaledVector(f, sf * hl).addScaledVector(r, sr * hw).addScaledVector(UP, su * hh);
    const v = [
      corner(-1, -1, -1), corner(1, -1, -1), corner(1, 1, -1), corner(-1, 1, -1), // 아래 4
      corner(-1, -1, 1), corner(1, -1, 1), corner(1, 1, 1), corner(-1, 1, 1),     // 위 4
    ];
    const faces: [number[], number][] = [
      [[4, 5, 6, 7], 1.0],   // top
      [[0, 3, 2, 1], 0.55],  // bottom
      [[0, 1, 5, 4], 0.82],  // side
      [[2, 3, 7, 6], 0.82],  // side
      [[1, 2, 6, 5], 0.74],  // 앞
      [[3, 0, 4, 7], 0.74],  // 뒤
    ];
    faces.forEach(([q, shade]) => {
      const base = arrP.length / 3;
      q.forEach((vi) => {
        arrP.push(v[vi].x, v[vi].y, v[vi].z);
        arrC.push(color.r * shade, color.g * shade, color.b * shade);
      });
      arrI.push(base, base + 1, base + 2, base, base + 2, base + 3);
    });
  };

  const bodyColors = (style === 'tgv'
    ? ['#dfe3e8', '#dfe3e8', '#d6dbe1']            // 은백 — 테제베는 한 몸처럼 이어진다
    : ['#7d4b40', '#465e55', '#6b5f4b']            // BUILD 129: 낡은 열차 — 안개 보정 후에도 색이 남게 깊게
  ).map((c2) => new THREE.Color(c2));
  const roofC = new THREE.Color(style === 'tgv' ? '#c6ccd2' : '#8b8377');
  const stripeC = new THREE.Color('#3d5a80'); // 테제베 허리띠
  const glassC = new THREE.Color('#2e3438');  // 테제베 연속 창띠
  const plankC = new THREE.Color('#8a6f52');
  const windowC = new THREE.Color('#ffe2ae');
  const darkC = new THREE.Color('#3d3a35');

  const carCount = Math.max(1, Math.floor((total - GAP) / PITCH));
  const classicSlots: THREE.Group[] = []; // BUILD 160
  const roofEnds: { p: THREE.Vector3; tan: THREE.Vector3 }[] = []; // [앞끝, 뒷끝, 앞끝, ...] 판자용
  const wheelMats: THREE.Matrix4[] = [];

  for (let k = 0; k < carCount; k += 1) {
    const dc = GAP * 0.5 + k * PITCH + CAR_LEN / 2;
    const { p, tan } = atDist(dc);
    const color = bodyColors[k % bodyColors.length].clone().multiplyScalar(0.94 + rnd() * 0.12);
    const roofY = p.y - 0.015; // 걷는 면 — 커브 높이 바로 아래
    if (style === 'classic') {
      // BUILD 160: 몸통은 GLB — 슬롯만 심고, 객차는 아래 attach에서 내려앉는다
      const slot = new THREE.Group();
      slot.position.set(p.x, roofY, p.z);
      slot.rotation.y = Math.atan2(tan.x, tan.z);
      slot.userData.tint = ['#96604f', '#5c7d6e', '#867457'][k % 3]; // BUILD 163: 안개·밤 보정 후에도 살 만큼 밝게
      classicSlots.push(slot);
      g.add(slot);
    } else {
      const bodyC = new THREE.Vector3(p.x, roofY - CAR_H / 2 - 0.04, p.z);
      // 차체
      pushBox(pos, col, idx, bodyC, tan, CAR_LEN / 2, CAR_W / 2, CAR_H / 2, color);
      // 지붕 판 (걷는 면 — 살짝 밝고 살짝 좁다)
      pushBox(pos, col, idx, new THREE.Vector3(p.x, roofY - 0.02, p.z), tan, CAR_LEN / 2 - 0.05, CAR_W / 2 - 0.045, 0.02, roofC);
    }
    // 테제베: 연속 창띠 + 허리 스트라이프 + 스커트(바퀴를 감춘다)
    if (style === 'tgv') {
      const r2 = new THREE.Vector3().crossVectors(tan, UP).normalize();
      for (const sr of [-1, 1]) {
        const bandC = new THREE.Vector3().copy(p).addScaledVector(r2, sr * (CAR_W / 2 + 0.004));
        bandC.y = roofY - CAR_H * 0.3;
        pushBox(pos, col, idx, bandC, tan, CAR_LEN / 2 - 0.18, 0.005, 0.06, glassC);
        const strC = bandC.clone(); strC.y = roofY - CAR_H * 0.62;
        pushBox(pos, col, idx, strC, tan, CAR_LEN / 2 - 0.02, 0.005, 0.022, stripeC);
      }
      const skirt = new THREE.Vector3(p.x, roofY - CAR_H - 0.09, p.z);
      pushBox(pos, col, idx, skirt, tan, CAR_LEN / 2 - 0.08, CAR_W / 2 - 0.06, 0.1, bodyColors[0].clone().multiplyScalar(0.85));
      // 맨 앞: 유선형 코 — 낮아지며 좁아지는 쐐기 3단
      if (k === 0) {
        for (let nq = 0; nq < 3; nq += 1) {
          const noseC = new THREE.Vector3().copy(p).addScaledVector(tan, CAR_LEN / 2 + 0.14 + nq * 0.24);
          noseC.y = roofY - CAR_H * (0.42 + nq * 0.16);
          pushBox(pos, col, idx, noseC, tan, 0.14, (CAR_W / 2) * (0.82 - nq * 0.2), CAR_H * (0.5 - nq * 0.13), bodyColors[0]);
        }
      }
    }
    // 굴뚝 — 맨 앞 동은 기관차다 (낡은 열차만)
    if (style === 'old' && k === 0) {
      const chim = new THREE.Vector3().copy(p).addScaledVector(tan, CAR_LEN * 0.32);
      chim.y = roofY + 0.17;
      pushBox(pos, col, idx, chim, tan, 0.055, 0.055, 0.17, darkC);
      const cap = chim.clone(); cap.y += 0.19;
      pushBox(pos, col, idx, cap, tan, 0.085, 0.085, 0.03, darkC);
    }
    // 창문 — 옆면에 4개씩, 밤에 은은히 빛난다 (발광 재질 ≠ 광원: 보이기만 한다)
    const r = new THREE.Vector3().crossVectors(tan, UP).normalize();
    for (let w = 0; style === 'old' && w < 4; w += 1) {
      const off = (w - 1.5) * (CAR_LEN / 4.6);
      for (const sr of [-1, 1]) {
        if (rnd() < 0.22) continue; // 불 꺼진 창
        const wc = new THREE.Vector3().copy(p).addScaledVector(tan, off).addScaledVector(r, sr * (CAR_W / 2 + 0.004));
        wc.y = roofY - CAR_H * 0.42;
        pushBox(wpos, wcol, widx, wc, tan, 0.09, 0.006, 0.075, windowC);
      }
    }
    // 연결기 — 동 사이 아래쪽 어두운 이음쇠
    if (k > 0) {
      const jd = GAP * 0.5 + k * PITCH - GAP / 2;
      const j = atDist(jd);
      const jc = new THREE.Vector3(j.p.x, j.p.y - CAR_H - 0.02, j.p.z);
      pushBox(pos, col, idx, jc, j.tan, GAP / 2 + 0.06, 0.07, 0.05, darkC);
    }
    // 지붕 끝점 기록 (판자용)
    const front = new THREE.Vector3().copy(p).addScaledVector(tan, CAR_LEN / 2); front.y = roofY;
    const back = new THREE.Vector3().copy(p).addScaledVector(tan, -CAR_LEN / 2); back.y = roofY;
    roofEnds.push({ p: back, tan }, { p: front, tan });
    // 바퀴 자리 (인스턴스): 3축 × 양쪽
    for (const ax of style === 'old' ? [-0.36, 0, 0.36] : []) { // classic: 대차가 GLB에 있다
      for (const sr of [-1, 1]) {
        const wp = new THREE.Vector3().copy(p).addScaledVector(tan, ax * CAR_LEN).addScaledVector(r, sr * (CAR_W / 2 - 0.02));
        wp.y = roofY - CAR_H - 0.1;
        const m = new THREE.Matrix4().makeRotationY(Math.atan2(tan.x, tan.z));
        m.premultiply(new THREE.Matrix4().makeTranslation(0, 0, 0)); // 자리 이동은 아래서
        m.setPosition(wp);
        wheelMats.push(m);
      }
    }
  }

  // BUILD 134: 철길 — 열차 아래엔 레일이 있다. 커브를 따라 함께 굽이친다.
  // (Vase의 실사 PBR 텍스처 대신 프로시저럴 — 이 세계의 문법은 팔레트다)
  {
    const steelC = new THREE.Color('#63666a');
    const railY = (py: number) => py - 0.015 - CAR_H - 0.2; // 바퀴 바닥 높이
    const GAUGE = 0.34;
    for (let i = 0; i < frames.length - 1; i += 1) {
      const a = frames[i]; const b = frames[i + 1];
      const dir = b.p.clone().sub(a.p); const len = dir.length();
      if (len < 1e-5) continue;
      dir.setY(0).normalize();
      for (const sd of [-1, 1]) {
        const ca = a.p.clone().add(a.nor.clone().multiplyScalar(sd * GAUGE));
        const cb = b.p.clone().add(b.nor.clone().multiplyScalar(sd * GAUGE));
        const mid = ca.clone().lerp(cb, 0.5);
        mid.y = railY((a.p.y + b.p.y) / 2) + 0.022;
        pushBox(pos, col, idx, mid, dir, len / 2 + 0.012, 0.018, 0.022, steelC);
      }
    }
    // 침목 — 0.55u마다 하나, 어두운 나무
    const sleeperGeo = new THREE.BoxGeometry(0.86, 0.03, 0.14);
    const sleeperCount = Math.floor(total / 0.55);
    const sleepers = new THREE.InstancedMesh(sleeperGeo, applyHeightFog(new THREE.MeshStandardMaterial({ color: '#4a3f35', roughness: 0.9 })), sleeperCount);
    const SM = new THREE.Matrix4(); const SQ = new THREE.Quaternion(); const SE = new THREE.Euler(); const SV = new THREE.Vector3();
    for (let k = 0; k < sleeperCount; k += 1) {
      const { p, tan } = atDist(k * 0.55 + 0.2);
      SE.set(0, Math.atan2(tan.x, tan.z), 0); // BUILD 135: +90도 제거 — 긴 축(X)은 이미 가로였다. 침목은 레일을 가로지른다
      SQ.setFromEuler(SE);
      SV.set(p.x, railY(p.y) - 0.018, p.z);
      SM.compose(SV, SQ, new THREE.Vector3(1, 1, 1));
      sleepers.setMatrixAt(k, SM);
    }
    sleepers.instanceMatrix.needsUpdate = true;
    sleepers.receiveShadow = true;
    g.add(sleepers);
  }

  // 나무판자 — 동과 동 사이 지붕을 자동으로 잇는다 (한 틈에 두 장, 살짝 어긋나게)
  for (let k = 1; k < carCount; k += 1) {
    const a = roofEnds[k * 2 - 1]; // 앞 동의 앞끝
    const b = roofEnds[k * 2];     // 뒷 동의 뒷끝
    const mid = a.p.clone().lerp(b.p, 0.5);
    const dir = b.p.clone().sub(a.p);
    const len = dir.length(); dir.normalize();
    for (const so of [-0.14, 0.13]) {
      const r = new THREE.Vector3().crossVectors(dir, UP).normalize();
      const c2 = mid.clone().addScaledVector(r, so + (rnd() - 0.5) * 0.03);
      c2.y += 0.012;
      const pc = plankC.clone().multiplyScalar(0.92 + rnd() * 0.16);
      pushBox(pos, col, idx, c2, dir, len / 2 + 0.24, 0.11, 0.014, pc);
    }
  }

  g.add(colorMesh(pos, col, idx, { castShadow: true, receiveShadow: true })); // BUILD 133: 특례 철폐 — 안개는 이제 다이얼의 소관이다. 열차도 세계의 문법을 따른다 (BUILD 129의 0.35 상한은 다이얼이 없던 시절의 응급처치)
  // 창문: 발광 별도 메시
  if (wpos.length) {
    const wg = new THREE.BufferGeometry();
    wg.setAttribute('position', new THREE.Float32BufferAttribute(wpos, 3));
    wg.setAttribute('color', new THREE.Float32BufferAttribute(wcol, 3));
    wg.setIndex(widx);
    wg.computeVertexNormals();
    const wm = new THREE.Mesh(wg, new THREE.MeshStandardMaterial({ vertexColors: true, emissive: new THREE.Color('#ffd9a0'), emissiveIntensity: 0.6, roughness: 0.5 }));
    g.add(wm);
  }
  // 바퀴: 인스턴스 한 방
  if (wheelMats.length) {
    const wheelGeo = new THREE.CylinderGeometry(0.1, 0.1, 0.05, 10);
    wheelGeo.rotateZ(Math.PI / 2); // 축이 좌우를 향하게
    const wheels = new THREE.InstancedMesh(wheelGeo, applyHeightFog(new THREE.MeshStandardMaterial({ color: '#33302b', roughness: 0.85 })), wheelMats.length);
    wheelMats.forEach((m, i) => wheels.setMatrixAt(i, m));
    wheels.instanceMatrix.needsUpdate = true;
    wheels.castShadow = true;
    g.add(wheels);
  }

  // BUILD 160: 클래식 객차 내려앉히기 — Vase의 PassengerCar GLB (실루엣 검수 ★, BUILD 149)
  // 슬롯 원점 = 지붕 걷는 면. 실측 Box3로 스케일·오프셋을 잡는다 — 상수가 아니라 실측.
  if (classicSlots.length) {
    void defaultLoader('PassengerCar.glb').then((gltf) => {
      const proto = gltf.scene;
      proto.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(proto);
      const size = box.getSize(new THREE.Vector3());
      const center = box.getCenter(new THREE.Vector3());
      const long = Math.max(size.x, size.z);
      const lengthIsX = size.x >= size.z;
      const windowC2 = new THREE.MeshStandardMaterial({ color: '#ffe2ae', emissive: '#ffca6e', emissiveIntensity: 1.1, roughness: 0.6 });
      const wrnd = worldRng(4144);
      for (const slot of classicSlots) {
        const car = proto.clone(true);
        car.traverse((n) => {
          const mesh = n as THREE.Mesh;
          if (!mesh.isMesh) return;
          mesh.castShadow = true;
          mesh.receiveShadow = true;
          // 재질은 클론끼리 공유된다 — 색을 따로 입히려면 각자 옷을 가져야 한다
          mesh.material = Array.isArray(mesh.material) ? mesh.material.map((m) => m.clone()) : mesh.material.clone();
        });
        applyPalette(car, slot.userData.tint as string);
        const wrap = new THREE.Group();
        car.position.set(-center.x, -box.max.y, -center.z); // 지붕 꼭대기를 슬롯 원점에
        wrap.add(car);
        wrap.scale.setScalar(CAR_LEN / Math.max(1e-6, long));
        wrap.rotation.y = lengthIsX ? -Math.PI / 2 : 0; // 장축을 진행 방향(+Z)으로
        // BUILD 164: 중립 무대 — 측정은 언제나 자기 좌표계에서. 슬롯은 회전을 갖고 있어
        // 월드 박스로 재면 폭을 길이로 착각한다 (창문이 허공에 뜬 사건의 전말).
        // 회전 없는 임시 무대에서 조립·보정·실측을 끝낸 뒤에야 슬롯으로 옮긴다.
        const stage = new THREE.Group();
        stage.add(wrap);
        stage.updateMatrixWorld(true);
        const got = new THREE.Box3().setFromObject(wrap);
        const gotSize = got.getSize(new THREE.Vector3());
        const gotLen = Math.max(1e-6, gotSize.z); // 무대에서 +Z = 진행 방향 (wrap 자체 회전 포함)
        wrap.scale.multiplyScalar(CAR_LEN / gotLen);
        stage.updateMatrixWorld(true);
        got.setFromObject(wrap);
        wrap.position.y -= got.max.y; // 지붕 꼭대기 = 원점(걷는 면), 강제
        stage.updateMatrixWorld(true);
        got.setFromObject(wrap);
        const halfW = (got.max.x - got.min.x) / 2;
        const carH = got.max.y - got.min.y;
        slot.add(wrap); // 이제야 무대에서 내려와 제 자리에 선다
        const gwY = -carH * 0.42;
        for (let w = 0; w < 5; w += 1) {
          const off = (w - 2) * (CAR_LEN / 6.2);
          for (const sr of [-1, 1]) {
            if (wrnd() < 0.25) continue; // 불 꺼진 창
            const pane = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.13, 0.16), windowC2);
            pane.position.set(sr * (halfW * 0.8 + 0.004), gwY, off); // 지붕 처마(halfW)보다 몸통은 좁다 — 벽에 붙인다
            slot.add(pane);
          }
        }
      }
    }).catch(() => { /* 실패 시 판자와 레일의 길로 남는다 */ });
  }

  return g;
}

function buildTerrain(frames: Frame[], widthAt: (t: number) => number) {
  const g = new THREE.Group();
  const roadMatId: RoadMaterialId = SPEC.path.material ?? 'sand'; // BUILD 124
  const roadMat = ROAD_MATERIALS[roadMatId] ?? ROAD_MATERIALS.sand; // BUILD 159: 같은 방어
  const groundTex = makeGroundTexture(roadMatId);
  const cliffTex = makeCliffTexture();
  const cSandTop = new THREE.Color(roadMat.top ?? PALETTE.sandTop);
  const cSandEdge = new THREE.Color(roadMat.edge ?? PALETTE.sandEdge);
  const strata = [
    new THREE.Color(PALETTE.cliffHigh),
    new THREE.Color(PALETTE.cliffMid),
    new THREE.Color(PALETTE.cliffLow),
    new THREE.Color(PALETTE.cliffDeep),
  ];
  const ringInsetBase = [0, 0.09, 0.26];
  const RINGS = SPEC.terrain.rings;

  type Ring = { L: THREE.Vector3; R: THREE.Vector3 };
  const cross: Ring[][] = frames.map((f, i) => {
    const w = widthAt(f.t);
    const depth = SPEC.terrain.cliffDepth + noise1(i * 0.05) * SPEC.terrain.cliffDepthNoise;
    const rings: Ring[] = [];
    for (let r = 0; r < RINGS; r += 1) {
      const v = r / (RINGS - 1);
      const drop = Math.pow(v, 1.35) * depth;
      const fine = Math.min(1, w * 1.15); // 좁을수록 침식도 섬세하게
      const chunkL = (noise1(i * 0.09 + r * 3.1) * 0.5 + noise1(i * 0.32 + r * 8.3) * 0.22) * fine;
      const chunkR = (noise1(i * 0.09 + r * 3.1 + 50) * 0.5 + noise1(i * 0.32 + r * 8.3 + 50) * 0.22) * fine;
      const inset = ringInsetBase[r] * w;
      // BUILD 102→103: 윗단 실루엣 — 굽이 + 잔니블 + '물어뜯김'(bite).
      // 레퍼런스의 핵심은 군데군데 깊게 떨어져 나간 요철이었다.
      const waveL = (noise1(i * 0.23) * 0.6 + noise1(i * 1.31) * 0.4) * 0.13 + 0.02;
      const waveR = (noise1(i * 0.23 + 77) * 0.6 + noise1(i * 1.31 + 77) * 0.4) * 0.13 + 0.02;
      const bnL = noise1(i * 0.115);
      const bnR = noise1(i * 0.115 + 31);
      const biteL = Math.max(0, bnL - 0.38) * 0.8 * w; // 문턱을 넘는 구간만 깊게 파인다
      const biteR = Math.max(0, bnR - 0.38) * 0.8 * w;
      const lipL = waveL - biteL;
      const lipR = waveR - biteR;
      const hwL = Math.max(0.06, w - inset + (r === 0 ? lipL : chunkL * (0.3 + v * 0.7)));
      const hwR = Math.max(0.06, w - inset + (r === 0 ? lipR : chunkR * (0.3 + v * 0.7)));
      const lipCrumb = (biteL + biteR) * 0.22; // 물린 자리는 턱도 살짝 주저앉는다
      const y = f.p.y - drop + (r === 0 ? noise1(i * 0.2) * 0.03 - lipCrumb : noise1(i * 0.18 + r * 7) * 0.3 * v);
      rings.push({
        L: f.p.clone().add(f.nor.clone().multiplyScalar(hwL)).setY(y),
        R: f.p.clone().add(f.nor.clone().multiplyScalar(-hwR)).setY(y),
      });
    }
    return rings;
  });

  // top ribbon
  {
    const pos: number[] = [];
    const col: number[] = [];
    const idx: number[] = [];
    const uv: number[] = [];
    const W = 6;
    let dist = 0;
    cross.forEach((rings, i) => {
      if (i > 0) dist += frames[i].p.distanceTo(frames[i - 1].p);
      for (let j = 0; j <= W; j += 1) {
        const a = j / W;
        const p = rings[0].L.clone().lerp(rings[0].R, a);
        p.y += noise1(i * 0.4 + j * 2.3) * 0.02;
        pos.push(p.x, p.y, p.z);
        uv.push(a * 0.9, dist * 0.55);
        const edge = Math.pow(Math.abs(a - 0.5) * 2, 2.2);
        // BUILD 102: 침식 밴드 — 가장자리로 갈수록 어둡고, 얼룩덜룩 파인 자국
        const nib = Math.max(0, noise1(i * 0.7 + j * 5.1)) * Math.pow(Math.abs(a - 0.5) * 2, 4) * 0.5;
        const c = cSandTop.clone().lerp(cSandEdge, Math.min(1, edge * 0.95 + nib));
        const tint = 1 + noise1(i * 0.9 + j * 3.1) * 0.035;
        col.push(c.r * tint, c.g * tint, c.b * tint);
      }
    });
    for (let i = 0; i < cross.length - 1; i += 1) {
      for (let j = 0; j < W; j += 1) {
        const a = i * (W + 1) + j;
        const b = a + W + 1;
        idx.push(a, b, a + 1, a + 1, b, b + 1);
      }
    }
    g.add(colorMesh(pos, col, idx, { receiveShadow: true, uv, map: groundTex }));
  }

  // BUILD 105: 크러스트 — 길과 '같은 재질'의 연장 판. 립 정점(ring 0)에 정확히 붙어
  // 바깥으로 뻗다 살짝 처진다. 별개 오브젝트가 아니라 부서진 길 표면 그 자체.
  {
    const pos: number[] = [];
    const col: number[] = [];
    const idx: number[] = [];
    const uv: number[] = [];
    let dist3 = 0;
    const distAt: number[] = [];
    cross.forEach((_, i) => {
      if (i > 0) dist3 += frames[i].p.distanceTo(frames[i - 1].p);
      distAt.push(dist3);
    });
    (['L', 'R'] as const).forEach((side, si) => {
      let i = 2;
      while (i < cross.length - 3) {
        const gate = noise1(i * 0.171 + si * 53);
        if (gate < 0.08) { i += 1; continue; } // 갈라진 틈 — 판이 없는 구간
        const len = 2 + Math.floor(Math.abs(noise1(i * 0.77 + si * 9)) * 3); // 2~4 프레임 길이 판
        const reach = 0.1 + Math.abs(noise1(i * 1.37 + si * 17)) * 0.2;      // 바깥으로 0.1~0.3
        const droop = 0.015 + Math.abs(noise1(i * 2.9 + si * 5)) * 0.05;     // 처짐
        const start = pos.length / 3;
        let added = 0;
        for (let k2 = 0; k2 <= len && i + k2 < cross.length; k2 += 1) {
          const fi = i + k2;
          const f = frames[fi];
          const inner = cross[fi][0][side];
          const norS = f.nor.clone().multiplyScalar(side === 'L' ? 1 : -1);
          const taper = k2 === 0 || k2 === len ? 0.35 : 1; // 판 양끝은 좁아진다 (갈라진 조각 모양)
          const outP = inner.clone().add(norS.multiplyScalar(reach * taper * (0.85 + noise1(fi * 3.3) * 0.3)));
          outP.y -= droop * taper + Math.abs(noise1(fi * 5.1)) * 0.012;
          // 안쪽 정점: 립과 동일 (용접) / 바깥 정점: 뻗음
          pos.push(inner.x, inner.y, inner.z, outP.x, outP.y, outP.z);
          const ua = side === 'L' ? 0 : 0.9;
          const ub = side === 'L' ? -0.14 : 1.04;
          uv.push(ua, distAt[fi] * 0.55, ub, distAt[fi] * 0.55);
          const cIn = cSandEdge.clone();
          const cOut = cSandEdge.clone().multiplyScalar(0.86 + noise1(fi * 1.9) * 0.06);
          col.push(cIn.r, cIn.g, cIn.b, cOut.r, cOut.g, cOut.b);
          added += 1;
        }
        for (let q = 0; q < added - 1; q += 1) {
          const a = start + q * 2;
          if (side === 'L') idx.push(a, a + 1, a + 2, a + 2, a + 1, a + 3);
          else idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
        }
        // BUILD 106: 두께 — 바깥 모서리 아래로 림을 내린다 (판마다 랜덤 0.03~0.09)
        {
          const thick = 0.045 + Math.abs(noise1(i * 6.7 + si * 13)) * 0.075;
          const rimStart = pos.length / 3;
          for (let q = 0; q < added; q += 1) {
            const topIdx = (start + q * 2 + 1) * 3; // 바깥 정점
            const x = pos[topIdx];
            const y = pos[topIdx + 1];
            const z = pos[topIdx + 2];
            pos.push(x, y, z, x, y - thick, z);
            const u2 = side === 'L' ? -0.14 : 1.04;
            uv.push(u2, q * 0.2, u2, q * 0.2 + thick * 0.5);
            const cT = cSandEdge.clone().multiplyScalar(0.86);
            const cB = cSandEdge.clone().multiplyScalar(0.62); // 아랫면은 그늘
            col.push(cT.r, cT.g, cT.b, cB.r, cB.g, cB.b);
          }
          for (let q = 0; q < added - 1; q += 1) {
            const a = rimStart + q * 2;
            if (side === 'L') idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
            else idx.push(a, a + 1, a + 2, a + 2, a + 1, a + 3);
          }
        }
        i += len + 1 + Math.floor(Math.abs(noise1(i * 4.4)) * 3); // 틈 (crack)
      }
    });
    const crust = colorMesh(pos, col, idx, { receiveShadow: true, castShadow: true, uv, map: groundTex });
    if (crust.material instanceof THREE.Material) (crust.material as THREE.MeshStandardMaterial).side = THREE.DoubleSide;
    g.add(crust);
  }

  // cliff sides
  (['L', 'R'] as const).forEach((side) => {
    const pos: number[] = [];
    const col: number[] = [];
    const idx: number[] = [];
    const uv: number[] = [];
    let dist2 = 0;
    cross.forEach((rings, i) => {
      if (i > 0) dist2 += frames[i].p.distanceTo(frames[i - 1].p);
      rings.forEach((ring, r) => {
        const p = ring[side];
        pos.push(p.x, p.y, p.z);
        uv.push((r / (RINGS - 1)) * 0.96, dist2 * 0.34);
        const v = r / (RINGS - 1);
        const si = Math.min(strata.length - 1, v * strata.length);
        const s0 = strata[Math.floor(si)];
        const s1 = strata[Math.min(strata.length - 1, Math.ceil(si))];
        const base = r === 0 ? cSandEdge : s0.clone().lerp(s1, si - Math.floor(si));
        const tint = 1 + noise1(i * 0.6 + r * 9.2 + (side === 'L' ? 0 : 40)) * 0.1 * (1 - v);
        // 아래로 갈수록 안개에 잠긴다 — 레퍼런스처럼 길 끄트머리 바로 밑까지
        const c = base.clone();
        col.push(c.r * tint, c.g * tint, c.b * tint);
      });
    });
    for (let i = 0; i < cross.length - 1; i += 1) {
      for (let r = 0; r < RINGS - 1; r += 1) {
        const a = i * RINGS + r;
        const b = a + RINGS;
        if (side === 'L') idx.push(a, a + 1, b, b, a + 1, b + 1);
        else idx.push(a, b, a + 1, a + 1, b, b + 1);
      }
    }
    g.add(colorMesh(pos, col, idx, { castShadow: true, uv, map: cliffTex }));
  });

  // underside
  {
    const pos: number[] = [];
    const col: number[] = [];
    const idx: number[] = [];
    const deep = new THREE.Color(PALETTE.fog);
    cross.forEach((rings) => {
      const lastRing = rings[rings.length - 1];
      pos.push(lastRing.L.x, lastRing.L.y, lastRing.L.z, lastRing.R.x, lastRing.R.y, lastRing.R.z);
      col.push(deep.r, deep.g, deep.b, deep.r, deep.g, deep.b);
    });
    for (let i = 0; i < cross.length - 1; i += 1) {
      const a = i * 2;
      idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
    }
    g.add(colorMesh(pos, col, idx, {}));
  }

  // ---------- BUILD 102: 길 끝단 자연화 — 부스러기·파편·자갈 ----------
  // 칼로 자른 단면을 깨는 세 겹: 턱에 걸친 부스러기, 떨어져 나가 떠 있는 파편,
  // 가장자리로 갈수록 빽빽해지는 잔자갈.
  {
    const rockGeo = new THREE.IcosahedronGeometry(1, 0);
    const mkInstG = (geo: THREE.BufferGeometry, color: string, count: number) => {
      const mesh = new THREE.InstancedMesh(geo, applyHeightFog(new THREE.MeshStandardMaterial({ color, roughness: 0.95, metalness: 0 })), count); // BUILD 165: 잔풀도 안개를 맞는다
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      return mesh;
    };
    const mkInst = (count: number, color: string, rough = 0.95) => {
      const mesh = new THREE.InstancedMesh(rockGeo, applyHeightFog(new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: 0 })), count); // BUILD 165: 잔자갈도
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      return mesh;
    };
    const M = new THREE.Matrix4();
    const Q = new THREE.Quaternion();
    const E = new THREE.Euler();
    const V = new THREE.Vector3();
    const S = new THREE.Vector3();
    const place = (mesh: THREE.InstancedMesh, k: number, p: THREE.Vector3, sc: THREE.Vector3, rot: number) => {
      E.set(noise1(rot) * 1.2, rot * 2.6, noise1(rot + 9) * 1.2);
      Q.setFromEuler(E);
      V.copy(p);
      S.copy(sc);
      M.compose(V, Q, S);
      mesh.setMatrixAt(k, M);
    };

    // 턱 부스러기: 가장자리에 걸치거나 반쯤 흘러내린 조각
    const lipCount = Math.min(80, Math.floor(frames.length / 5));
    const lip = mkInst(lipCount, '#' + cSandEdge.getHexString()); // BUILD 124: 소재를 따른다
    for (let k = 0; k < lipCount; k += 1) {
      const i = Math.floor((k / lipCount) * (frames.length - 1) + noise1(k * 3.7) * 5);
      const f = frames[Math.max(0, Math.min(frames.length - 1, i))];
      const w = widthAt(f.t);
      const side = k % 2 === 0 ? 1 : -1;
      const out = w * (1.02 + Math.abs(noise1(k * 1.9)) * 0.16); // BUILD 105: 길 위가 아니라 가장자리 바깥에
      const r = 0.035 + Math.abs(noise1(k * 2.3)) * 0.1;
      const p = f.p.clone().add(f.nor.clone().multiplyScalar(side * out));
      p.y += 0.01 - Math.abs(noise1(k * 4.1)) * r * 1.6; // 일부는 턱 아래로 반쯤 흘러내림
      place(lip, k, p, S.set(r * (1 + Math.abs(noise1(k)) * 0.6), r * 0.7, r * (1 + Math.abs(noise1(k + 5)) * 0.4)), k * 1.13);
    }
    lip.instanceMatrix.needsUpdate = true;
    g.add(lip);

    // 부유 파편: 떨어져 나가 아직 허공에 머무는 돌 (공중섬의 문법)
    const fragCount = Math.min(40, Math.floor(frames.length / 10));
    const frag = mkInst(fragCount, PALETTE.cliffHigh);
    for (let k = 0; k < fragCount; k += 1) {
      const i = Math.floor((k / fragCount) * (frames.length - 1) + noise1(k * 7.7) * 9);
      const f = frames[Math.max(0, Math.min(frames.length - 1, i))];
      const w = widthAt(f.t);
      const side = noise1(k * 3.3) > 0 ? 1 : -1;
      const r = 0.05 + Math.abs(noise1(k * 5.1)) * 0.1;
      const p = f.p.clone().add(f.nor.clone().multiplyScalar(side * w * (1.18 + Math.abs(noise1(k * 2.2)) * 0.45)));
      p.y -= 0.25 + Math.abs(noise1(k * 6.4)) * 0.75;
      place(frag, k, p, S.set(r, r * 0.8, r), k * 2.31);
    }
    frag.instanceMatrix.needsUpdate = true;
    g.add(frag);

    // 잔자갈: 가장자리로 갈수록 빽빽하게 (밀도 곡선 = 1 - rnd*rnd)
    const pebCount = Math.min(280, frames.length * 2);
    const peb = mkInst(pebCount, '#' + cSandEdge.getHexString(), 1.0); // BUILD 124
    for (let k = 0; k < pebCount; k += 1) {
      const i = Math.floor(Math.abs(noise1(k * 1.7)) * (frames.length - 1));
      const f = frames[i];
      const w = widthAt(f.t);
      const side = k % 2 === 0 ? 1 : -1;
      const towardEdge = 1 - Math.abs(noise1(k * 2.9)) * Math.abs(noise1(k * 4.3)); // 가장자리 편중
      const out = w * (0.5 + towardEdge * 0.44);
      const r = 0.012 + Math.abs(noise1(k * 3.1)) * 0.028;
      const p = f.p.clone().add(f.nor.clone().multiplyScalar(side * out));
      p.y += r * 0.4;
      place(peb, k, p, S.set(r * 1.3, r * 0.55, r), k * 0.77);
    }
    peb.instanceMatrix.needsUpdate = true;
    g.add(peb);

    // BUILD 103: 가장자리 초목 스필 — 레퍼런스의 진짜 주인공.
    // 턱에 걸터앉은 수풀 덩이 + 절벽면에 매달려 바깥으로 뻗은 풀.
    const greens = SPEC.decoration.vegetation.greens;
    const blobGeo = new THREE.IcosahedronGeometry(1, 0);
    const coneGeo = new THREE.ConeGeometry(0.011, 0.12, 3);
    const spillMeshes = greens.slice(0, 2).map((c) => mkInstG(blobGeo, c, 160));
    const hangMeshes = greens.slice(1, 3).map((c) => mkInstG(coneGeo, c, 130));
    const counters = [0, 0, 0, 0];
    // 턱 수풀: 2~4덩이 뭉치가 가장자리에 반쯤 걸쳐 있다
    const bushSpots = Math.min(52, Math.floor(frames.length / 8));
    for (let k = 0; k < bushSpots; k += 1) {
      const i = Math.floor(Math.abs(noise1(k * 5.3)) * (frames.length - 1));
      const f = frames[i];
      const w = widthAt(f.t);
      const side = k % 2 === 0 ? 1 : -1;
      const base = f.p.clone().add(f.nor.clone().multiplyScalar(side * w * (0.86 + Math.abs(noise1(k * 1.7)) * 0.17)));
      const n = 2 + Math.floor(Math.abs(noise1(k * 3.9)) * 3);
      for (let b2 = 0; b2 < n; b2 += 1) {
        const mi = (k + b2) % 2;
        const mesh = spillMeshes[mi];
        const r = 0.055 + Math.abs(noise1(k * 2.1 + b2 * 7)) * 0.075;
        V.set(base.x + noise1(k * 9 + b2 * 3) * 0.09, base.y + r * 0.42 - Math.abs(noise1(k + b2 * 11)) * 0.05, base.z + noise1(k * 4 + b2 * 5) * 0.09);
        E.set(0, noise1(k * 1.3 + b2) * 3, noise1(k * 2.7 + b2) * 0.25);
        Q.setFromEuler(E);
        S.set(r * (1 + Math.abs(noise1(b2 + k)) * 0.4), r * 0.62, r * (1 + Math.abs(noise1(b2 + k + 3)) * 0.4));
        M.compose(V, Q, S);
        mesh.setMatrixAt(counters[mi], M);
        counters[mi] += 1;
      }
    }
    // 매달린 풀: 절벽면에서 바깥·아래로 뻗는다
    const hangCount = Math.min(120, Math.floor(frames.length / 3.5));
    for (let k = 0; k < hangCount; k += 1) {
      const i = Math.floor(Math.abs(noise1(k * 6.1)) * (frames.length - 1));
      const f = frames[i];
      const w = widthAt(f.t);
      const side = k % 2 === 0 ? 1 : -1;
      const mi = k % 2;
      const mesh = hangMeshes[mi];
      const p2 = f.p.clone().add(f.nor.clone().multiplyScalar(side * w * (1.0 + Math.abs(noise1(k * 2.4)) * 0.05)));
      p2.y -= 0.03 + Math.abs(noise1(k * 3.8)) * 0.3;
      V.copy(p2);
      // 바깥으로 기울어 매달림: 법선 방향으로 눕는다
      const outYaw = Math.atan2(f.nor.x * side, f.nor.z * side);
      E.set(0, outYaw, -(0.7 + Math.abs(noise1(k * 1.9)) * 0.7));
      Q.setFromEuler(E);
      const sc = 0.8 + Math.abs(noise1(k * 4.4)) * 1.1;
      S.set(sc, sc, sc);
      M.compose(V, Q, S);
      mesh.setMatrixAt(counters[2 + mi], M);
      counters[2 + mi] += 1;
    }
    spillMeshes.forEach((m, i2) => { m.count = counters[i2]; m.instanceMatrix.needsUpdate = true; g.add(m); });
    hangMeshes.forEach((m, i2) => { m.count = counters[2 + i2]; m.instanceMatrix.needsUpdate = true; g.add(m); });
  }

  return g;
}

function colorMesh(
  pos: number[],
  col: number[],
  idx: number[],
  { castShadow = false, receiveShadow = false, uv, map, hfog = 1 }: { castShadow?: boolean; receiveShadow?: boolean; uv?: number[]; map?: THREE.Texture; hfog?: number },
) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  if (uv) geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  const mat = applyHeightFog(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0, map: map ?? null }), hfog);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.castShadow = castShadow;
  mesh.receiveShadow = receiveShadow;
  return mesh;
}

function buildEdgePlants(frames: Frame[], widthAt: (t: number) => number) {
  const g = new THREE.Group();
  const rnd = worldRng(4177);
  const matA = applyHeightFog(new THREE.MeshStandardMaterial({ color: PALETTE.plant, roughness: 1 })); // BUILD 165: 가장자리 풀도
  const matB = applyHeightFog(new THREE.MeshStandardMaterial({ color: PALETTE.plantDark, roughness: 1 }));
  const geo = new THREE.ConeGeometry(0.016, 0.16, 3); // 풀잎 한 가닥
  for (let k = 0; k < SPEC.decoration.grassCount; k += 1) {
    const i = Math.floor(rnd() * frames.length);
    const f = frames[i];
    const w = widthAt(f.t);
    const side = rnd() > 0.5 ? 1 : -1;
    const p = f.p.clone().add(f.nor.clone().multiplyScalar(side * (w - 0.08 - rnd() * 0.15)));
    const cluster = new THREE.Group();
    const n = 4 + Math.floor(rnd() * 4);
    for (let c = 0; c < n; c += 1) {
      const m = new THREE.Mesh(geo, rnd() > 0.5 ? matA : matB);
      const lean = 0.18 + rnd() * 0.35;
      m.position.set((rnd() - 0.5) * 0.07, 0.07 * (0.8 + rnd() * 0.5), (rnd() - 0.5) * 0.07);
      m.scale.set(1, 0.7 + rnd() * 1.1, 1);
      m.rotation.set((rnd() - 0.5) * lean, rnd() * Math.PI, (rnd() - 0.5) * lean);
      m.castShadow = true;
      cluster.add(m);
    }
    cluster.position.copy(p);
    g.add(cluster);
  }
  return g;
}

// ---------- BUILD 089: VERDANT ----------
// 릴 실측: 초록이 화면의 13%를 차지하며 세계를 살아 있게 한다.
// 수풀(낮은 덤불)과 작은 나무를 벼랑 가장자리에 심는다 — 절차 생성, 에셋 불요.
function buildVegetation(frames: Frame[], widthAt: (t: number) => number, anchors: THREE.Vector3[]) {
  const g = new THREE.Group();
  const V = SPEC.decoration.vegetation;
  const rnd = worldRng(9317);
  const mats = V.greens.map((c) => std(c));
  const trunkMat = std('#6d5638');
  const blobGeo = new THREE.IcosahedronGeometry(1, 0);
  const nearAnchor = (p: THREE.Vector3) => anchors.some((a) => a.distanceTo(p) < 1.3);

  // 수풀: 눌린 다면체 2~4덩이 뭉치
  for (let k = 0; k < V.bushCount; k += 1) {
    const f = frames[Math.floor(rnd() * frames.length)];
    const w = widthAt(f.t);
    const side = rnd() > 0.5 ? 1 : -1;
    const p = f.p.clone().add(f.nor.clone().multiplyScalar(side * (w - 0.12 - rnd() * 0.2)));
    if (nearAnchor(p)) continue;
    const bush = new THREE.Group();
    const n = 2 + Math.floor(rnd() * 3);
    for (let b = 0; b < n; b += 1) {
      const m = new THREE.Mesh(blobGeo, mats[Math.floor(rnd() * 2)]); // 짙은/중간 톤만
      const r = 0.09 + rnd() * 0.1;
      m.scale.set(r * (1 + rnd() * 0.4), r * 0.62, r * (1 + rnd() * 0.4));
      m.position.set((rnd() - 0.5) * 0.16, r * 0.5, (rnd() - 0.5) * 0.16);
      m.rotation.y = rnd() * Math.PI;
      m.castShadow = true;
      m.receiveShadow = true;
      bush.add(m);
    }
    bush.position.copy(p);
    g.add(bush);
  }

  // 작은 나무: 밑동 + 눌린 캐노피 2~3층 — 릴의 둥근 활엽 실루엣
  for (let k = 0; k < V.treeCount; k += 1) {
    const f = frames[Math.floor(rnd() * frames.length)];
    const w = widthAt(f.t);
    const side = rnd() > 0.5 ? 1 : -1;
    const p = f.p.clone().add(f.nor.clone().multiplyScalar(side * (w - 0.1 - rnd() * 0.12)));
    if (nearAnchor(p)) continue;
    const tree = new THREE.Group();
    const h = 0.55 + rnd() * 0.5;
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.042, h * 0.42, 5), trunkMat);
    trunk.position.y = h * 0.21;
    trunk.castShadow = true;
    tree.add(trunk);
    const layers = 2 + (rnd() > 0.5 ? 1 : 0);
    for (let c = 0; c < layers; c += 1) {
      const m = new THREE.Mesh(blobGeo, mats[Math.min(2, c + (rnd() > 0.6 ? 1 : 0))]);
      const r = (0.2 - c * 0.045) * (h / 0.8);
      m.scale.set(r * (1 + rnd() * 0.3), r * 0.7, r * (1 + rnd() * 0.3));
      m.position.set((rnd() - 0.5) * 0.06, h * 0.42 + c * r * 0.95, (rnd() - 0.5) * 0.06);
      m.rotation.y = rnd() * Math.PI;
      m.castShadow = true;
      tree.add(m);
    }
    tree.rotation.z = (rnd() - 0.5) * 0.08; // 바닷바람에 살짝 기운
    tree.position.copy(p);
    g.add(tree);
  }
  return g;
}

// BUILD 100: 뭉게구름 — 알파 막이 아니라 덩어리. props 카탈로그에서도 쓴다.
export function makeCloudPuff(rnd: () => number, scale: number, color?: string) {
  const cloud = new THREE.Group();
  const mat = std(color ?? '#e9eef0');
  const geo = new THREE.IcosahedronGeometry(1, 0);
  const n = 4 + Math.floor(rnd() * 4);
  for (let i = 0; i < n; i += 1) {
    const m = new THREE.Mesh(geo, mat);
    const r = (0.45 + rnd() * 0.6) * scale;
    m.scale.set(r * (1 + rnd() * 0.5), r * 0.55, r * (1 + rnd() * 0.4));
    m.position.set((rnd() - 0.5) * scale * 1.9, (rnd() - 0.4) * scale * 0.35, (rnd() - 0.5) * scale * 1.1);
    m.rotation.y = rnd() * Math.PI;
    cloud.add(m);
  }
  return cloud;
}

// ---------- memory object kits ----------
function buildMemoryObjects(
  scenes: ObservationScene[],
  anchors: WorldAnchor[],
  kitSlots: { kit: string; slot: THREE.Group; seed: number }[],
) {
  const g = new THREE.Group();
  scenes.forEach((scene, i) => {
    if (scene.objectKit === 'none') return; // BUILD 128: 오브젝트 없는 기억 — 자리는 비어 있어도 기억은 있다
    const a = anchors[i];
    const kit = KITS[scene.objectKit] ?? KITS.default;
    const obj = kit(worldRng(100 + i * 37));
    const side = i % 2 === 0 ? 1 : -1;
    obj.position.copy(a.p).add(a.nor.clone().multiplyScalar(side * a.w * 0.45));
    // BUILD 099: 에디터 회전 — 기본 각 위에 사용자가 정한 각을 얹는다
    obj.rotation.y = Math.atan2(a.tan.x, a.tan.z) + (side > 0 ? 0.4 : -0.4) + (scene.objectRotY ?? 0);
    obj.rotation.x = scene.objectRotX ?? 0;
    obj.scale.setScalar(scene.scale || 1); // BUILD 100: 사물 크기 — 에디터 키보드
    obj.traverse((n) => { n.userData.sceneIndex = i; }); // BUILD 106: 에디터 클릭 선택용
    obj.traverse((m) => {
      if ((m as THREE.Mesh).isMesh) {
        m.castShadow = true;
        m.receiveShadow = true;
      }
    });
    kitSlots.push({ kit: scene.objectKit, slot: obj, seed: 500 + i * 91 });
    g.add(obj);
  });
  return g;
}

function std(color: string) {
  // BUILD 162: 안개 면역 전수 해제 — std()를 쓰는 모든 프로시저럴(수풀·나무·잔풀·표지판 등)이 이제 안개를 맞는다
  return applyHeightFog(new THREE.MeshStandardMaterial({ color, roughness: 1, metalness: 0 }));
}

type KitFn = (rnd: () => number) => THREE.Group;

export const KITS: Record<string, KitFn> = {
  'door-kit': () => {
    const g = new THREE.Group();
    const postMat = std('#b9aa8a'); // BUILD 085: 더 밝고 따뜻한 낡은 목재 (Vase: 084 톤은 탁했다)
    const postGeo = new THREE.BoxGeometry(0.22, 1.15, 0.22);
    const p1 = new THREE.Mesh(postGeo, postMat);
    p1.position.set(-0.5, 0.57, 0);
    const p2 = new THREE.Mesh(postGeo, postMat);
    p2.position.set(0.5, 0.57, 0);
    g.add(p1, p2);
    for (let i = 0; i < 5; i += 1) {
      const plank = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.92, 0.05), std(PALETTE.doorGreen));
      plank.position.set(-0.34 + i * 0.17, 0.46, 0);
      plank.scale.y = 0.96 + Math.sin(i * 2.1) * 0.04;
      g.add(plank);
    }
    const rail = new THREE.Mesh(new THREE.BoxGeometry(0.86, 0.07, 0.06), std('#6d8a6f'));
    rail.position.set(0, 0.72, 0.03);
    const rail2 = rail.clone();
    rail2.position.y = 0.2;
    g.add(rail, rail2);
    return g;
  },
  'suitcase-kit': () => {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.62, 0.24), std(PALETTE.mint));
    body.position.y = 0.36;
    g.add(body);
    for (let i = 0; i < 3; i += 1) {
      const ridge = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.62, 0.26), std('#8fae94'));
      ridge.position.set(-0.12 + i * 0.12, 0.36, 0);
      g.add(ridge);
    }
    const handle = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.05, 0.05), std('#7a7466'));
    handle.position.y = 0.72;
    const stem1 = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.14, 0.03), std('#7a7466'));
    stem1.position.set(-0.08, 0.66, 0);
    const stem2 = stem1.clone();
    stem2.position.x = 0.08;
    g.add(handle, stem1, stem2);
    return g;
  },
  'person-kit': () => {
    const g = new THREE.Group();
    const coat = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.16, 0.52, 10), std(PALETTE.silhouette));
    coat.position.y = 0.42;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.09, 12, 10), std('#57544c'));
    head.position.y = 0.78;
    const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.025, 14), std(PALETTE.hat));
    brim.position.y = 0.83;
    const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.1, 0.09, 12), std(PALETTE.hat));
    crown.position.y = 0.88;
    const pack = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.26, 0.1), std('#3e434b'));
    pack.position.set(0, 0.52, -0.13);
    g.add(coat, head, brim, crown, pack);
    return g;
  },
  'airplane-wing-kit': () => new THREE.Group(), // 판자 제거 — 실물 비행기는 attachModels에서
  'stone-wall-kit': () => {
    // BUILD 086: 이 기억의 실체는 '담 사이를 걷는 것' — 담은 벼랑 담 생성기가 세운다.
    // 길을 가로막던 프록시는 철거.
    return new THREE.Group();
  },
  'sea-edge-kit': (rnd) => {
    const g = new THREE.Group();
    const mat = std(PALETTE.basalt);
    for (let i = 0; i < 4; i += 1) {
      const s = new THREE.Mesh(new THREE.DodecahedronGeometry(0.1, 0), mat);
      s.position.set((rnd() - 0.5) * 0.8, 0.06, (rnd() - 0.5) * 0.5);
      s.scale.set(1 + rnd(), 0.6 + rnd() * 0.3, 1);
      s.rotation.y = rnd() * 3;
      g.add(s);
    }
    return g;
  },
  'cloud-kit': () => new THREE.Group(), // 구름 장면: 길 위에는 아무것도 없다
  'fruit-kit': () => {
    const g = new THREE.Group();
    const melon = new THREE.Mesh(new THREE.SphereGeometry(0.14, 16, 12), std('#6f8f5a'));
    melon.position.y = 0.13;
    melon.scale.y = 0.92;
    g.add(melon);
    return g;
  },
  'cd-shelf-kit': () => {
    const g = new THREE.Group();
    const frame = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.72, 0.18), std('#8a7a63'));
    frame.position.y = 0.36;
    g.add(frame);
    for (let r = 0; r < 3; r += 1) {
      for (let c = 0; c < 2; c += 1) {
        const slot = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.16, 0.02), std(r % 2 ? '#d9d2bd' : '#5f6a70'));
        slot.position.set(-0.11 + c * 0.22, 0.14 + r * 0.22, 0.09);
        g.add(slot);
      }
    }
    return g;
  },
  'book-kit': (rnd) => {
    const g = new THREE.Group();
    const colors = ['#c8b894', '#9a8b72', '#b3a17f'];
    for (let i = 0; i < 3; i += 1) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.05, 0.24), std(colors[i]));
      b.position.set((rnd() - 0.5) * 0.05, 0.03 + i * 0.055, (rnd() - 0.5) * 0.05);
      b.rotation.y = (rnd() - 0.5) * 0.5;
      g.add(b);
    }
    return g;
  },
  default: () => {
    const g = new THREE.Group();
    const s = new THREE.Mesh(new THREE.DodecahedronGeometry(0.12, 0), std(PALETTE.basalt));
    s.position.y = 0.1;
    g.add(s);
    return g;
  },
};

// ---------- 워커: 걷는 시간의 실체 ----------
// 카메라가 따라가는 사람. 자산 캐릭터가 오면 MODELS.walker로 교체 예정.
export function createWalkerFigure() {
  return KITS['person-kit'](seededRandom(77));
}

// ---------- distant world: 닿을 수 없는 기억 ----------
function buildDistantWorld(wKindD: string = 'clear', cloudAmt: number = 0.5, ): { group: THREE.Group; lighthouseSlot: THREE.Group; clouds: THREE.Object3D[] } {
  const g = new THREE.Group();
  const lighthouseSlot = new THREE.Group();
  const rnd = worldRng(9010);
  const fogC = new THREE.Color(PALETTE.fog);

  const topMat = std('#' + new THREE.Color(PALETTE.sandEdge).lerp(fogC, 0.3).getHexString());
  const rockMat = std('#' + new THREE.Color(PALETTE.cliffMid).lerp(fogC, 0.35).getHexString());

  // 부유 섬 제거 (BUILD 080). 원경의 주인공은 이제 등대와 구름이다.
  lighthouseSlot.position.set(-13, -0.4, -42);
  g.add(lighthouseSlot);

  // BUILD 100: 구름 재탄생 — 알파 막이 아니라 덩어리. 눌린 다면체 뭉치의 뭉게구름.
  const stormy = wKindD !== 'clear';
  const puffN = Math.round((stormy ? 8 : 4) + cloudAmt * (stormy ? 14 : 10));
  const clouds: THREE.Object3D[] = []; // BUILD 141: 바람이 밀 구름들
  for (let i = 0; i < puffN; i += 1) {
    const c = makeCloudPuff(rnd, (stormy ? 2.2 : 1.6) + rnd() * 2.6, stormy ? (wKindD === 'rain' ? '#59646b' : '#8b959a') : undefined);
    c.position.set((rnd() - 0.5) * 46, (stormy ? 3 : 4) + rnd() * (stormy ? 6 : 8), -24 - rnd() * 42);
    c.userData.drift = 0.4 + rnd() * 0.6; // 구름마다 제 속도
    g.add(c);
    clouds.push(c);
  }

  {
    const n = 60;
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i += 1) {
      pos[i * 3] = (rnd() - 0.5) * 70;
      pos[i * 3 + 1] = 6 + rnd() * 22;
      pos[i * 3 + 2] = -20 - rnd() * 60;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.PointsMaterial({ color: '#e9efe9', size: 0.09, transparent: true, opacity: 0.5, fog: false });
    g.add(new THREE.Points(geo, mat));
  }

  return { group: g, lighthouseSlot, clouds };
}
