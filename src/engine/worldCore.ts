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
import { isGeneratorEnabled, JEJU_SPEC, type WorldGeneratorId, type WorldPalette, type WorldSpec } from './worldSpec';
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
};




// ---------- BUILD 080: 높이 안개 (진짜로 잠기는 안개) ----------
// 버텍스 칠하기가 아니라, 조명 계산이 끝난 픽셀을 높이에 따라 안개색으로 섞는다.
// 경계선이 사라지고, 모든 오브젝트가 같은 높이에서 함께 잠긴다.
// BUILD 082: 원본은 spec.atmosphere — buildWorld 진입 시 갱신된다.
const HEIGHT_FOG = {
  top: JEJU_SPEC.atmosphere.heightFogTop,     // 이 높이부터 잠기기 시작
  bottom: JEJU_SPEC.atmosphere.heightFogBottom, // 이 높이에서 완전히 안개
};

function applyHeightFog(mat: THREE.MeshStandardMaterial) {
  // 주의: mix는 sRGB 인코딩된 최종 색 위에서 돌므로, 안개색도 sRGB 값 그대로 써야 배경과 정확히 섞인다
  const hex = parseInt(PALETTE.fog.slice(1), 16);
  const c = { r: ((hex >> 16) & 255) / 255, g: ((hex >> 8) & 255) / 255, b: (hex & 255) / 255 };
  const glsl = (n: number) => n.toFixed(4);
  mat.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying float vHFy;')
      .replace('#include <fog_vertex>', '#include <fog_vertex>\nvHFy = (modelMatrix * vec4(transformed, 1.0)).y;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vHFy;')
      .replace(
        '#include <fog_fragment>',
        `#include <fog_fragment>\ngl_FragColor.rgb = mix(gl_FragColor.rgb, vec3(${glsl(c.r)}, ${glsl(c.g)}, ${glsl(c.b)}), 1.0 - smoothstep(${glsl(HEIGHT_FOG.bottom)}, ${glsl(HEIGHT_FOG.top)}, vHFy));`,
      );
  };
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

/** 길 상판: 모래알 그레인 + 흙 얼룩 + 드문 자갈점. 평균은 흰색(버텍스컬러 보존). */
function makeGroundTexture() {
  const S = 256;
  const data = new Uint8Array(S * S * 4);
  const n = makeValueNoise(S, S, 7133 + WORLD_SEED);
  const rnd = worldRng(9241);
  for (let y = 0; y < S; y += 1) {
    for (let x = 0; x < S; x += 1) {
      const blotch = n(x, y, 3) * 0.5 + n(x, y, 7) * 0.3 + n(x, y, 19) * 0.2; // 얼룩
      const grain = (rnd() - 0.5) * 0.16;                                     // 모래알
      let v = 1 + (blotch - 0.5) * 0.22 + grain;
      let r = v, gr = v * (1 - (blotch - 0.5) * 0.06), b = v * (1 - (blotch - 0.5) * 0.12);
      const idx = (y * S + x) * 4;
      data[idx] = Math.max(0, Math.min(255, r * 235));
      data[idx + 1] = Math.max(0, Math.min(255, gr * 233));
      data[idx + 2] = Math.max(0, Math.min(255, b * 228));
      data[idx + 3] = 255;
    }
  }
  // 드문 자갈/부스러기 점
  for (let k = 0; k < 320; k += 1) {
    const cx = Math.floor(rnd() * S), cy = Math.floor(rnd() * S);
    const dark = rnd() > 0.4;
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

const MODELS: Record<string, ModelSpec> = {
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
  // BUILD 091: KayKit Rogue Hooded (CC0) — 전문 제작 클립 76개. 걸음을 빌려 입는다.
  // clipSpeeds: 원척 기준 클립 고유속도 실측값 (스탠스 발 후방속). 정규화 스케일 곱해 사용.
  walker: { file: 'RogueHooded.glb', height: 0.9, tint: '#57534a', keepLook: true, clipSpeeds: { walk: 0.674, run: 3.484 } }, // 접지 기준 정밀 실측
  airplane: { file: 'Kawasaki.glb', height: 1.6, tint: '#c9d1cb', fitMaxDim: true },
  rock3: { file: 'Rock3.glb', height: 0.3, tint: '#6d6f64', fitMaxDim: true },
  rock7: { file: 'Rock7.glb', height: 0.3, tint: '#82796a', fitMaxDim: true },
};

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

const defaultLoader: ModelLoader = (file) =>
  new Promise((resolve, reject) => {
    new GLTFLoader().load(
      `/assets/models/${file}`,
      (gltf) => resolve({ scene: gltf.scene as unknown as THREE.Group, animations: gltf.animations }),
      undefined,
      reject,
    );
  });

export async function loadKitModel(key: string, loadModel: ModelLoader) {
  const spec = MODELS[key];
  const raw = (await loadModel(spec.file)).scene;
  if (spec.strip) {
    const needles = spec.strip.split(',');
    const doomed: THREE.Object3D[] = [];
    raw.traverse((n) => { if (needles.some((x) => n.name.includes(x))) doomed.push(n); });
    doomed.forEach((n) => n.parent?.remove(n));
  }
  applyPalette(raw, spec.tint);
  return normalizeModel(raw, spec);
}

/** 워커 실물 (Peasant Nolant): 정규화된 그룹 + Walk/Idle 애니메이션 클립 */
export async function loadWalkerAsset(loadModel: ModelLoader = defaultLoader) {
  const spec = MODELS.walker;
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
  return { group, animations: gltf.animations, clipSpeeds };
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

  const group = new THREE.Group();

  // ---- 1. path: ONE continuous centripetal catmull-rom, with lead-in/out ----
  const P = spec.path;
  const pts = scenes.map((s, i) => {
    const meander = Math.sin(i * 1.35) * P.meanderA + Math.sin(i * 0.55 + 1.2) * P.meanderB;
    return new THREE.Vector3(s.position[0] * P.lateralScale + meander, s.position[1] * 1.2, i * -P.sceneSpacing);
  });
  const first = pts[0];
  const second = pts[1];
  const leadIn = first.clone().add(first.clone().sub(second).setLength(11));
  const last = pts[pts.length - 1];
  const prev = pts[pts.length - 2];
  const leadOut = last.clone().add(last.clone().sub(prev).setLength(14));
  const allPts = [leadIn, ...pts, leadOut];
  const curve = new THREE.CatmullRomCurve3(allPts, false, 'centripetal', 0.5);
  const span = allPts.length - 1;
  const tOf = (i: number) => (i + 1) / span;
  const progressToT = (progress: number) => tOf(Math.max(0, Math.min(scenes.length - 1, progress)));

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
  if (on('terrain')) group.add(buildTerrain(frames, widthAt));
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
  const wingSpots: { p: THREE.Vector3; tan: THREE.Vector3; nor: THREE.Vector3; side: number }[] = [];
  if (on('memoryPoints')) {
    group.add(buildMemoryObjects(scenes, anchors, kitSlots));
    scenes.forEach((s, i) => {
      if (s.objectKit === 'airplane-wing-kit') {
        const a = anchors[i];
        wingSpots.push({ p: a.p.clone(), tan: a.tan.clone(), nor: a.nor.clone(), side: i % 2 === 0 ? 1 : -1 });
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
    ? buildDistantWorld()
    : { group: new THREE.Group(), lighthouseSlot: new THREE.Group() };
  if (on('landscape')) group.add(distant.group);

  // [assets] 실물 GLB 비동기 투입 (BUILD 075). 끄면 프록시만 남는 고속 프리뷰.
  const ready = on('assets')
    ? attachModels(kitSlots, distant.lighthouseSlot, rockSpots, wingSpots, edgeWallSpots, group, loadModel).catch(() => {})
    : Promise.resolve();

  // [light] 빛 생성기. sun은 BuiltWorld 계약상 항상 생성 (그림자 타겟 추적용).
  const L = spec.light;
  const lights = new THREE.Group();
  lights.add(new THREE.HemisphereLight(new THREE.Color(L.hemiSky), new THREE.Color(L.hemiGround), L.hemiIntensity));
  const sun = new THREE.DirectionalLight(new THREE.Color(L.sunColor), L.sunIntensity);
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
  const fill = new THREE.DirectionalLight(new THREE.Color(L.fillColor), L.fillIntensity);
  fill.position.set(...L.fillPosition);
  lights.add(fill);
  if (on('light')) group.add(lights);

  return { group, curve, anchors, sun, fogColor: new THREE.Color(PALETTE.fog), progressToT, ready: ready as Promise<void> };
}

async function attachModels(
  kitSlots: { kit: string; slot: THREE.Group; seed: number }[],
  lighthouseSlot: THREE.Group,
  rockSpots: { pos: THREE.Vector3; rotY: number; scale: number; face: boolean }[],
  wingSpots: { p: THREE.Vector3; tan: THREE.Vector3; nor: THREE.Vector3; side: number }[],
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
        worldGroup.add(p);
      });
    }));
  }

  await Promise.allSettled(tasks);
}

// ---------- terrain ----------
type Frame = { t: number; p: THREE.Vector3; tan: THREE.Vector3; nor: THREE.Vector3 };

function buildTerrain(frames: Frame[], widthAt: (t: number) => number) {
  const g = new THREE.Group();
  const groundTex = makeGroundTexture();
  const cliffTex = makeCliffTexture();
  const cSandTop = new THREE.Color(PALETTE.sandTop);
  const cSandEdge = new THREE.Color(PALETTE.sandEdge);
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
      const hwL = Math.max(0.06, w - inset + (r === 0 ? 0 : chunkL * (0.3 + v * 0.7)));
      const hwR = Math.max(0.06, w - inset + (r === 0 ? 0 : chunkR * (0.3 + v * 0.7)));
      const y = f.p.y - drop + (r === 0 ? noise1(i * 0.2) * 0.03 : noise1(i * 0.18 + r * 7) * 0.3 * v);
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
        const c = cSandTop.clone().lerp(cSandEdge, edge * 0.85);
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

  return g;
}

function colorMesh(
  pos: number[],
  col: number[],
  idx: number[],
  { castShadow = false, receiveShadow = false, uv, map }: { castShadow?: boolean; receiveShadow?: boolean; uv?: number[]; map?: THREE.Texture },
) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  if (uv) geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  const mat = applyHeightFog(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0, map: map ?? null }));
  const mesh = new THREE.Mesh(geo, mat);
  mesh.castShadow = castShadow;
  mesh.receiveShadow = receiveShadow;
  return mesh;
}

function buildEdgePlants(frames: Frame[], widthAt: (t: number) => number) {
  const g = new THREE.Group();
  const rnd = worldRng(4177);
  const matA = new THREE.MeshStandardMaterial({ color: PALETTE.plant, roughness: 1 });
  const matB = new THREE.MeshStandardMaterial({ color: PALETTE.plantDark, roughness: 1 });
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

// ---------- memory object kits ----------
function buildMemoryObjects(
  scenes: ObservationScene[],
  anchors: WorldAnchor[],
  kitSlots: { kit: string; slot: THREE.Group; seed: number }[],
) {
  const g = new THREE.Group();
  scenes.forEach((scene, i) => {
    const a = anchors[i];
    const kit = KITS[scene.objectKit] ?? KITS.default;
    const obj = kit(worldRng(100 + i * 37));
    const side = i % 2 === 0 ? 1 : -1;
    obj.position.copy(a.p).add(a.nor.clone().multiplyScalar(side * a.w * 0.45));
    obj.rotation.y = Math.atan2(a.tan.x, a.tan.z) + (side > 0 ? 0.4 : -0.4);
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
  return applyHeightFog(new THREE.MeshStandardMaterial({ color, roughness: 1, metalness: 0 }));
}

type KitFn = (rnd: () => number) => THREE.Group;

const KITS: Record<string, KitFn> = {
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
function buildDistantWorld(): { group: THREE.Group; lighthouseSlot: THREE.Group } {
  const g = new THREE.Group();
  const lighthouseSlot = new THREE.Group();
  const rnd = worldRng(9010);
  const fogC = new THREE.Color(PALETTE.fog);

  const topMat = std('#' + new THREE.Color(PALETTE.sandEdge).lerp(fogC, 0.3).getHexString());
  const rockMat = std('#' + new THREE.Color(PALETTE.cliffMid).lerp(fogC, 0.35).getHexString());

  // 부유 섬 제거 (BUILD 080). 원경의 주인공은 이제 등대와 구름이다.
  lighthouseSlot.position.set(-13, -0.4, -42);
  g.add(lighthouseSlot);

  const cloudMat = new THREE.MeshBasicMaterial({ color: '#e3eae8', transparent: true, opacity: 0.2, depthWrite: false });
  for (let i = 0; i < 9; i += 1) {
    const c = new THREE.Mesh(new THREE.CircleGeometry(1, 24), cloudMat);
    c.scale.set(9 + rnd() * 12, 1.1 + rnd() * 1.1, 1);
    c.position.set((rnd() - 0.5) * 40, 3 + rnd() * 8, -30 - rnd() * 40);
    g.add(c);
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

  return { group: g, lighthouseSlot };
}
