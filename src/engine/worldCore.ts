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

export const PALETTE = {
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
} as const;

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
const HEIGHT_FOG = {
  top: -0.1,     // 이 높이부터 잠기기 시작
  bottom: -0.85, // 이 높이에서 완전히 안개
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
  const n = makeValueNoise(S, S, 7133);
  const rnd = seededRandom(9241);
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
  const n = makeValueNoise(S, S, 4517);
  const rnd = seededRandom(3391);
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

export type ModelLoader = (file: string) => Promise<THREE.Group>;

type ModelSpec = {
  file: string;
  height: number;        // 정규화 목표 크기 (월드 유닛, 사람 키 = 0.9)
  tint: string;          // 텍스처/무채색 재질의 대체 틴트
  preRotateX?: number;   // 눕혀진 모델 세우기 등
  fitMaxDim?: boolean;   // 높이 대신 최대 치수 기준 (납작한 돌 등)
};

const MODELS: Record<string, ModelSpec> = {
  suitcase: { file: 'Old_Suitcase.glb', height: 0.42, tint: PALETTE.mint, preRotateX: -Math.PI / 2 },
  cabin: { file: 'Snow_Cabin_iso.glb', height: 0.9, tint: '#ddd6c2' },
  lighthouse: { file: 'Lighthouse_island_toy.glb', height: 9, tint: PALETTE.white },
  stone: { file: 'stone11.glb', height: 0.24, tint: '#6e7268', fitMaxDim: true },
  rock0: { file: 'Rock0.glb', height: 0.3, tint: '#79766a', fitMaxDim: true },
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
function applyPalette(group: THREE.Group, fallbackTint: string) {
  const fallback = new THREE.Color(fallbackTint);
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
        const l = Math.min(0.82, Math.max(0.16, hsl.l));
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
      (gltf) => resolve(gltf.scene as unknown as THREE.Group),
      undefined,
      reject,
    );
  });

async function loadKitModel(key: string, loadModel: ModelLoader) {
  const spec = MODELS[key];
  const raw = await loadModel(spec.file);
  applyPalette(raw, spec.tint);
  return normalizeModel(raw, spec);
}

function seededRandom(seed: number) {
  let v = seed % 2147483647;
  if (v <= 0) v += 2147483646;
  return () => ((v = (v * 16807) % 2147483647) - 1) / 2147483646;
}

function noise1(x: number) {
  return Math.sin(x * 1.7) * 0.55 + Math.sin(x * 3.7 + 1.3) * 0.3 + Math.sin(x * 7.1 + 4.2) * 0.15;
}

export function buildWorld(scenes: ObservationScene[], loadModel: ModelLoader = defaultLoader): BuiltWorld {
  const group = new THREE.Group();

  // ---- 1. path: ONE continuous centripetal catmull-rom, with lead-in/out ----
  const pts = scenes.map((s, i) => {
    const meander = Math.sin(i * 1.35) * 2.6 + Math.sin(i * 0.55 + 1.2) * 1.4;
    return new THREE.Vector3(s.position[0] * 3.2 + meander, s.position[1] * 1.2, i * -7.2);
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

  const SAMPLES = 520;
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
  const plazaBoost = scenes.map((s) => 0.14 + Math.max(0, (s.importance ?? 1) - 1.0) * 0.95);
  const widthAt = (t: number) => {
    let w = 0.24;
    for (let k = 0; k < sceneT.length; k += 1) {
      const d = Math.abs(t - sceneT[k]) * span;
      w += plazaBoost[k] * Math.exp(-d * d * 4.2);
    }
    return w * (1 + noise1(t * 40) * 0.1);
  };

  group.add(buildTerrain(frames, widthAt));
  group.add(buildEdgePlants(frames, widthAt));

  const anchors: WorldAnchor[] = sceneT.map((t) => {
    const p = curve.getPoint(t);
    const tan = curve.getTangent(t).setY(0).normalize();
    const nor = new THREE.Vector3(-tan.z, 0, tan.x);
    return { p, tan, nor, w: widthAt(t) };
  });
  const kitSlots: { kit: string; slot: THREE.Group; seed: number }[] = [];
  group.add(buildMemoryObjects(scenes, anchors, kitSlots));

  // 바위 산란 지점: 절벽 모서리(rim)와 벽면(face)
  const rockSpots: { pos: THREE.Vector3; rotY: number; scale: number }[] = [];
  {
    const rrnd = seededRandom(6612);
    for (let k = 0; k < 46; k += 1) {
      const i = Math.floor(rrnd() * frames.length);
      const f = frames[i];
      const w = widthAt(f.t);
      const side = rrnd() > 0.5 ? 1 : -1;
      const onFace = rrnd() > 0.55;
      const out = onFace ? w * (0.92 + rrnd() * 0.2) : w * (0.82 + rrnd() * 0.14);
      const y = onFace ? f.p.y - 0.12 - rrnd() * 0.28 : f.p.y - 0.03;
      const pos = f.p.clone().add(f.nor.clone().multiplyScalar(side * out)).setY(y);
      rockSpots.push({ pos, rotY: rrnd() * Math.PI * 2, scale: 0.35 + rrnd() * 0.85 });
    }
  }
  const distant = buildDistantWorld();
  group.add(distant.group);

  // ---- 실물 모델 비동기 투입 (BUILD 075) ----
  const ready = attachModels(kitSlots, distant.lighthouseSlot, rockSpots, group, loadModel).catch(() => {});

  // ---- lights ----
  const lights = new THREE.Group();
  lights.add(new THREE.HemisphereLight(new THREE.Color('#b9d2d8'), new THREE.Color('#c8a97e'), 0.55));
  const sun = new THREE.DirectionalLight(new THREE.Color('#ffe7c2'), 1.35);
  sun.position.set(6, 11, 5);
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
  const fill = new THREE.DirectionalLight(new THREE.Color('#9fc4c9'), 0.22);
  fill.position.set(-5, 3, -4);
  lights.add(fill);
  group.add(lights);

  return { group, curve, anchors, sun, fogColor: new THREE.Color(PALETTE.fog), progressToT, ready: ready as Promise<void> };
}

async function attachModels(
  kitSlots: { kit: string; slot: THREE.Group; seed: number }[],
  lighthouseSlot: THREE.Group,
  rockSpots: { pos: THREE.Vector3; rotY: number; scale: number }[],
  worldGroup: THREE.Group,
  loadModel: ModelLoader,
) {
  const tasks: Promise<void>[] = [];

  // 바위 산란: 절벽 모서리와 벽면에 박힌 실물 바위
  tasks.push(Promise.all([
    loadKitModel('rock0', loadModel),
    loadKitModel('rock3', loadModel),
    loadKitModel('rock7', loadModel),
  ]).then((variants) => {
    const rockGroup = new THREE.Group();
    rockSpots.forEach((spot, i) => {
      const r = variants[i % variants.length].clone(true);
      r.position.copy(spot.pos);
      r.rotation.y = spot.rotY;
      r.scale.setScalar(spot.scale);
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

  // 돌담: dodecahedron 대신 진짜 돌 메시로 담 쌓기
  const wallSlots = kitSlots.filter((k) => k.kit === 'stone-wall-kit' || k.kit === 'sea-edge-kit');
  if (wallSlots.length) {
    tasks.push(loadKitModel('stone', loadModel).then((stone) => {
      wallSlots.forEach((k) => {
        const rnd = seededRandom(k.seed);
        k.slot.clear();
        // 담으로 읽히게: 아랫단 8개 촘촘히 + 윗단 6개 어긋나게
        if (k.kit === 'stone-wall-kit') {
          for (let i = 0; i < 8; i += 1) {
            const s = stone.clone(true);
            s.position.set(-0.49 + i * 0.14 + (rnd() - 0.5) * 0.02, 0, (rnd() - 0.5) * 0.03);
            s.rotation.y = rnd() * Math.PI * 2;
            s.scale.setScalar(0.85 + rnd() * 0.3);
            k.slot.add(s);
          }
          for (let i = 0; i < 6; i += 1) {
            const s = stone.clone(true);
            s.position.set(-0.35 + i * 0.14 + (rnd() - 0.5) * 0.02, 0.11, (rnd() - 0.5) * 0.03);
            s.rotation.y = rnd() * Math.PI * 2;
            s.scale.setScalar(0.7 + rnd() * 0.28);
            k.slot.add(s);
          }
        } else {
          for (let i = 0; i < 3; i += 1) {
            const s = stone.clone(true);
            s.position.set((rnd() - 0.5) * 0.5, 0, (rnd() - 0.5) * 0.2);
            s.rotation.y = rnd() * Math.PI * 2;
            s.scale.setScalar(0.7 + rnd() * 0.5);
            k.slot.add(s);
          }
        }
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
  const RINGS = 3;

  type Ring = { L: THREE.Vector3; R: THREE.Vector3 };
  const cross: Ring[][] = frames.map((f, i) => {
    const w = widthAt(f.t);
    const depth = 0.85 + noise1(i * 0.05) * 0.3;
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
  const rnd = seededRandom(4177);
  const matA = new THREE.MeshStandardMaterial({ color: PALETTE.plant, roughness: 1 });
  const matB = new THREE.MeshStandardMaterial({ color: PALETTE.plantDark, roughness: 1 });
  const geo = new THREE.ConeGeometry(0.016, 0.16, 3); // 풀잎 한 가닥
  for (let k = 0; k < 140; k += 1) {
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
    const obj = kit(seededRandom(100 + i * 37));
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
    const postMat = std(PALETTE.white);
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
  'airplane-wing-kit': () => {
    const g = new THREE.Group();
    const wing = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.05, 0.7), std('#dfe3e0'));
    wing.position.set(0, 0.5, 0);
    wing.rotation.z = 0.06;
    wing.rotation.y = 0.5;
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.052, 0.06), std('#c9b06a'));
    stripe.position.set(0, 0.5, 0.2);
    stripe.rotation.copy(wing.rotation);
    g.add(wing, stripe);
    return g;
  },
  'stone-wall-kit': (rnd) => {
    const g = new THREE.Group();
    const mat = std(PALETTE.basalt);
    for (let i = 0; i < 8; i += 1) {
      const s = new THREE.Mesh(new THREE.DodecahedronGeometry(0.12, 0), mat);
      s.position.set(-0.6 + i * 0.17 + (rnd() - 0.5) * 0.04, 0.1 + (i % 2) * 0.14, (rnd() - 0.5) * 0.05);
      s.scale.set(1 + rnd() * 0.5, 0.8 + rnd() * 0.4, 0.9);
      s.rotation.set(rnd() * 3, rnd() * 3, rnd() * 3);
      g.add(s);
    }
    return g;
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
  const rnd = seededRandom(9010);
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
