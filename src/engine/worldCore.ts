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
};

function seededRandom(seed: number) {
  let v = seed % 2147483647;
  if (v <= 0) v += 2147483646;
  return () => ((v = (v * 16807) % 2147483647) - 1) / 2147483646;
}

function noise1(x: number) {
  return Math.sin(x * 1.7) * 0.55 + Math.sin(x * 3.7 + 1.3) * 0.3 + Math.sin(x * 7.1 + 4.2) * 0.15;
}

export function buildWorld(scenes: ObservationScene[]): BuiltWorld {
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

  // width profile: narrow causeway + plaza swells at each scene stop
  const sceneT = pts.map((_, i) => tOf(i));
  const widthAt = (t: number) => {
    let w = 0.62;
    for (const st of sceneT) {
      const d = Math.abs(t - st) * span;
      w += 1.7 * Math.exp(-d * d * 3.2);
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
  group.add(buildMemoryObjects(scenes, anchors));
  group.add(buildDistantWorld());

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

  return { group, curve, anchors, sun, fogColor: new THREE.Color(PALETTE.fog), progressToT };
}

// ---------- terrain ----------
type Frame = { t: number; p: THREE.Vector3; tan: THREE.Vector3; nor: THREE.Vector3 };

function buildTerrain(frames: Frame[], widthAt: (t: number) => number) {
  const g = new THREE.Group();
  const cSandTop = new THREE.Color(PALETTE.sandTop);
  const cSandEdge = new THREE.Color(PALETTE.sandEdge);
  const strata = [
    new THREE.Color(PALETTE.cliffHigh),
    new THREE.Color(PALETTE.cliffMid),
    new THREE.Color(PALETTE.cliffLow),
    new THREE.Color(PALETTE.cliffDeep),
  ];
  const ringInsetBase = [0, 0.05, 0.14, 0.3, 0.5];
  const RINGS = 5;

  type Ring = { L: THREE.Vector3; R: THREE.Vector3 };
  const cross: Ring[][] = frames.map((f, i) => {
    const w = widthAt(f.t);
    const depth = 4.2 + noise1(i * 0.05) * 1.6;
    const rings: Ring[] = [];
    for (let r = 0; r < RINGS; r += 1) {
      const v = r / (RINGS - 1);
      const drop = Math.pow(v, 1.35) * depth;
      const chunkL = noise1(i * 0.09 + r * 3.1) * 0.5 + noise1(i * 0.32 + r * 8.3) * 0.22;
      const chunkR = noise1(i * 0.09 + r * 3.1 + 50) * 0.5 + noise1(i * 0.32 + r * 8.3 + 50) * 0.22;
      const inset = ringInsetBase[r] * w;
      const hwL = Math.max(0.1, w - inset + (r === 0 ? 0 : chunkL * (0.3 + v * 0.7)));
      const hwR = Math.max(0.1, w - inset + (r === 0 ? 0 : chunkR * (0.3 + v * 0.7)));
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
    const W = 6;
    cross.forEach((rings, i) => {
      for (let j = 0; j <= W; j += 1) {
        const a = j / W;
        const p = rings[0].L.clone().lerp(rings[0].R, a);
        p.y += noise1(i * 0.4 + j * 2.3) * 0.02;
        pos.push(p.x, p.y, p.z);
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
    g.add(colorMesh(pos, col, idx, { receiveShadow: true }));
  }

  // cliff sides
  (['L', 'R'] as const).forEach((side) => {
    const pos: number[] = [];
    const col: number[] = [];
    const idx: number[] = [];
    cross.forEach((rings, i) => {
      rings.forEach((ring, r) => {
        const p = ring[side];
        pos.push(p.x, p.y, p.z);
        const v = r / (RINGS - 1);
        const si = Math.min(strata.length - 1, v * strata.length);
        const s0 = strata[Math.floor(si)];
        const s1 = strata[Math.min(strata.length - 1, Math.ceil(si))];
        const base = r === 0 ? cSandEdge : s0.clone().lerp(s1, si - Math.floor(si));
        const tint = 1 + noise1(i * 0.6 + r * 9.2 + (side === 'L' ? 0 : 40)) * 0.1;
        const c = r >= RINGS - 1 ? base.clone().lerp(new THREE.Color(PALETTE.fog), 0.45) : base.clone();
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
    g.add(colorMesh(pos, col, idx, { castShadow: true }));
  });

  // underside
  {
    const pos: number[] = [];
    const col: number[] = [];
    const idx: number[] = [];
    const deep = new THREE.Color(PALETTE.cliffDeep).lerp(new THREE.Color(PALETTE.fog), 0.5);
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
  { castShadow = false, receiveShadow = false }: { castShadow?: boolean; receiveShadow?: boolean },
) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0 });
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
  const geo = new THREE.ConeGeometry(0.09, 0.22, 5);
  for (let k = 0; k < 90; k += 1) {
    const i = Math.floor(rnd() * frames.length);
    const f = frames[i];
    const w = widthAt(f.t);
    const side = rnd() > 0.5 ? 1 : -1;
    const p = f.p.clone().add(f.nor.clone().multiplyScalar(side * (w - 0.08 - rnd() * 0.15)));
    const cluster = new THREE.Group();
    const n = 1 + Math.floor(rnd() * 3);
    for (let c = 0; c < n; c += 1) {
      const m = new THREE.Mesh(geo, rnd() > 0.5 ? matA : matB);
      m.position.set((rnd() - 0.5) * 0.12, 0.08 + rnd() * 0.05, (rnd() - 0.5) * 0.12);
      m.scale.setScalar(0.7 + rnd() * 0.9);
      m.rotation.z = (rnd() - 0.5) * 0.5;
      m.castShadow = true;
      cluster.add(m);
    }
    cluster.position.copy(p);
    g.add(cluster);
  }
  return g;
}

// ---------- memory object kits ----------
function buildMemoryObjects(scenes: ObservationScene[], anchors: WorldAnchor[]) {
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
    g.add(obj);
  });
  return g;
}

function std(color: string) {
  return new THREE.MeshStandardMaterial({ color, roughness: 1, metalness: 0 });
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

// ---------- distant world: 닿을 수 없는 기억 ----------
function buildDistantWorld() {
  const g = new THREE.Group();
  const rnd = seededRandom(9010);
  const fogC = new THREE.Color(PALETTE.fog);

  const topMat = std('#' + new THREE.Color(PALETTE.sandEdge).lerp(fogC, 0.3).getHexString());
  const rockMat = std('#' + new THREE.Color(PALETTE.cliffMid).lerp(fogC, 0.35).getHexString());

  for (let i = 0; i < 7; i += 1) {
    const island = new THREE.Group();
    const w = 2.5 + rnd() * 4;
    const top = new THREE.Mesh(new THREE.CylinderGeometry(w, w * 0.85, 0.5, 9), topMat);
    const under = new THREE.Mesh(new THREE.ConeGeometry(w * 0.85, w * 1.1, 9), rockMat);
    under.rotation.x = Math.PI;
    under.position.y = -0.8;
    island.add(top, under);
    const side = rnd() > 0.5 ? 1 : -1;
    if (i < 2) island.position.set((rnd() - 0.5) * 14, 1 + rnd() * 5, -55 - rnd() * 25);
    else island.position.set(side * (9 + rnd() * 16), -2 + rnd() * 7, -32 - rnd() * 46);
    island.rotation.y = rnd() * Math.PI;
    g.add(island);
  }

  const cloudMat = new THREE.MeshBasicMaterial({ color: '#dfe7e5', transparent: true, opacity: 0.14, depthWrite: false });
  for (let i = 0; i < 6; i += 1) {
    const c = new THREE.Mesh(new THREE.CircleGeometry(1, 24), cloudMat);
    c.scale.set(6 + rnd() * 8, 0.9 + rnd() * 0.8, 1);
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

  return g;
}
