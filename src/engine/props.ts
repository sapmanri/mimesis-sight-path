// ---------- BUILD 100: PROPS — 자유 배치 ----------
// "이게 되어야 나중에 세트 자동 배치가 의미가 있다" — Vase.
// 세계의 모든 사물을 카탈로그로 열고, 에디터가 어디든 놓을 수 있게 한다.
// 배치물은 문서(WorldDoc)에 저장된다: 자리·회전(좌우/상하)·크기·높이.

import * as THREE from 'three';
import {
  KITS, MODELS, loadKitModel, loadKitModelWithClips, makeCloudPuff, defaultLoader, applyHeightFog, type ModelLoader,
} from './worldCore';

export type PlacedProp = {
  id: string;              // 고유 id (에디터가 발급)
  obj: string;             // PROP_CATALOG의 id
  position: [number, number, number];
  rotY: number;            // 좌우 회전 (라디안)
  rotX: number;            // 위아래 기울임 (라디안)
  scale: number;           // 크기 배율
  /** BUILD 109: 애니 배치물의 자동 로밍 — 길을 따라 제멋대로 왔다갔다 */
  roam?: boolean;
};

export type PropDef = { id: string; label: string; cat: string };

/** BUILD 109: 애니메이션이 있는 배치물 — 로밍 AI를 켤 수 있다 (동물들이 오면 여기 등록) */
export const ANIMATED_PROPS = new Set(['rogue', 'scavenger', 'cow']);

function makeStreetlamp(rnd: () => number) {
  const g = new THREE.Group();
  const iron = std('#4a5049');
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.022, 1.15, 6), iron);
  pole.position.y = 0.575;
  pole.castShadow = true;
  g.add(pole);
  const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.22, 6), iron);
  arm.rotation.z = Math.PI / 2;
  arm.position.set(0.1, 1.13, 0);
  g.add(arm);
  const head = new THREE.Mesh(new THREE.ConeGeometry(0.075, 0.07, 6), iron);
  head.position.set(0.2, 1.12, 0);
  g.add(head);
  const bulb = new THREE.Mesh(
    new THREE.SphereGeometry(0.035, 8, 6),
    new THREE.MeshStandardMaterial({ color: '#ffe9b0', emissive: '#ffcf7a', emissiveIntensity: 1.4, roughness: 0.6 }),
  );
  bulb.position.set(0.2, 1.085, 0);
  g.add(bulb);
  // BUILD 109: 진짜 불빛 — 소소한 광원이 세계를 있어 보이게 한다 (Vase)
  const glow = new THREE.PointLight('#ffd9a0', 1.7, 3.4, 2);
  glow.position.copy(bulb.position);
  g.add(glow);
  g.rotation.y = rnd() * Math.PI * 2;
  return g;
}

function makeOldCar(rnd: () => number) {
  const g = new THREE.Group();
  const bodyCol = ['#7e937f', '#9a8a6a', '#7a8a96'][Math.floor(rnd() * 3)];
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.16, 0.3), std(bodyCol));
  body.position.y = 0.14;
  body.castShadow = true;
  g.add(body);
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.13, 0.26), std(bodyCol));
  cabin.position.set(-0.04, 0.28, 0);
  cabin.castShadow = true;
  g.add(cabin);
  const glass = new THREE.Mesh(new THREE.BoxGeometry(0.31, 0.08, 0.24), std('#b9c8c9'));
  glass.position.set(-0.04, 0.285, 0);
  g.add(glass);
  const wheelGeo = new THREE.CylinderGeometry(0.06, 0.06, 0.05, 8);
  const wheelMat = std('#3d3a35');
  [[0.2, 0.14], [0.2, -0.14], [-0.22, 0.14], [-0.22, -0.14]].forEach(([x, z], i) => {
    const wh = new THREE.Mesh(wheelGeo, wheelMat);
    wh.rotation.x = Math.PI / 2;
    // 낡은 차: 바퀴 하나는 바람이 빠졌다
    const flat = i === 3 ? 0.02 : 0;
    wh.position.set(x, 0.06 - flat, z);
    g.add(wh);
  });
  g.rotation.z = 0.02 + rnd() * 0.02; // 살짝 주저앉음
  g.rotation.y = rnd() * Math.PI * 2;
  return g;
}

function makeLantern(rnd: () => number) {
  const g = new THREE.Group();
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.016, 0.34, 5), std('#6d5638'));
  post.position.y = 0.17;
  post.castShadow = true;
  g.add(post);
  const cage = new THREE.Mesh(
    new THREE.BoxGeometry(0.07, 0.09, 0.07),
    new THREE.MeshStandardMaterial({ color: '#fff3cf', emissive: '#ffca6e', emissiveIntensity: 1.6, roughness: 0.5, transparent: true, opacity: 0.92 }),
  );
  cage.position.y = 0.38;
  g.add(cage);
  const cap = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.045, 4), std('#4a5049'));
  cap.position.y = 0.445;
  g.add(cap);
  const glow = new THREE.PointLight('#ffca6e', 1.4, 2.6, 2);
  glow.position.y = 0.38;
  g.add(glow);
  g.rotation.y = rnd() * Math.PI * 2;
  return g;
}

function makeCup(rnd: () => number) {
  const g = new THREE.Group();
  const col = ['#f4f0e7', '#a7b49a', '#c9a68a'][Math.floor(rnd() * 3)];
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.028, 0.06, 10), std(col));
  body.position.y = 0.03;
  body.castShadow = true;
  g.add(body);
  const handle = new THREE.Mesh(new THREE.TorusGeometry(0.018, 0.006, 6, 10), std(col));
  handle.position.set(0.04, 0.032, 0);
  g.add(handle);
  const coffee = new THREE.Mesh(new THREE.CircleGeometry(0.028, 10), std('#5a4632'));
  coffee.rotation.x = -Math.PI / 2;
  coffee.position.y = 0.058;
  g.add(coffee);
  g.rotation.y = rnd() * Math.PI * 2;
  return g;
}

export const PROP_CATALOG: PropDef[] = [
  // 자연
  { id: 'rock-small', label: '작은 바위', cat: '자연' },
  { id: 'rock-big', label: '큰 바위', cat: '자연' },
  { id: 'stone-tall', label: '선 돌', cat: '자연' },
  { id: 'slab', label: '바위 슬랩 (대형)', cat: '자연' },
  { id: 'bush', label: '수풀', cat: '자연' },
  { id: 'tree', label: '작은 나무', cat: '자연' },
  { id: 'grass', label: '풀 다발', cat: '자연' },
  // 구조물
  { id: 'cabin', label: '오두막', cat: '구조물' },
  { id: 'tent', label: '텐트 (캠프)', cat: '구조물' }, // BUILD 260: Vase 업로드 — 캠프셋용
  { id: 'lighthouse', label: '등대', cat: '구조물' },
  { id: 'door', label: '초록 대문', cat: '구조물' },
  { id: 'wall-stone', label: '돌담 조각', cat: '구조물' },
  { id: 'chair', label: '의자', cat: '구조물' },
  { id: 'streetlamp', label: '가로등 (불빛)', cat: '구조물' },
  { id: 'lantern', label: '랜턴 (불빛)', cat: '구조물' },
  { id: 'oldcar', label: '낡은 차', cat: '구조물' },
  { id: 'plane', label: '비행기', cat: '구조물' },
  // 기억 사물
  { id: 'suitcase', label: '캐리어', cat: '기억 사물' },
  { id: 'book', label: '책 무더기', cat: '기억 사물' },
  { id: 'cup', label: '찻잔', cat: '기억 사물' },
  { id: 'fruit', label: '과일', cat: '기억 사물' },
  { id: 'cd-shelf', label: 'CD 선반', cat: '기억 사물' },
  { id: 'sea-edge', label: '바다의 가장자리', cat: '기억 사물' },
  // 사람
  { id: 'person', label: '사람 실루엣', cat: '사람' },
  { id: 'rogue', label: '두건 나그네', cat: '사람' },
  { id: 'scavenger', label: '방랑자', cat: '사람' },
  // 동물 (BUILD 110) — 소는 로밍 가능, 나머지는 정적
  { id: 'rabbit', label: '토끼', cat: '동물' }, // BUILD 216
  { id: 'flag', label: '국기 깃발 (폽)', cat: '지구본' }, // BUILD 221: 제목에 나라 이름을 적으면 그 국기가 된다
  { id: 'cow', label: '젖소', cat: '동물' },
  { id: 'dog', label: '강아지', cat: '동물' },
  { id: 'duck', label: '오리', cat: '동물' },
  { id: 'chicky', label: '병아리', cat: '동물' },
  { id: 'horse', label: '말', cat: '동물' },
  { id: 'piggy', label: '돼지', cat: '동물' },
  { id: 'bear', label: '곰', cat: '동물' },
  { id: 'deer', label: '사슴', cat: '동물' },
  { id: 'boar', label: '멧돼지', cat: '동물' },
  { id: 'wolf', label: '늑대', cat: '동물' },
  // BUILD 113
  { id: 'cowshed', label: '외양간', cat: '구조물' },
  { id: 'moon', label: '달', cat: '하늘' },
  { id: 'lamp', label: '남포등 (불빛)', cat: '구조물' }, // BUILD 117
  // 철길 (BUILD 126) — Vase가 가져온 열차들
  { id: 'trainloco', label: '기관차', cat: '철길' },
  { id: 'wagon2', label: '객차', cat: '철길' },
  { id: 'signallight', label: '신호등', cat: '철길' },
  { id: 'railsection', label: '철길 조각', cat: '철길' },
  // 하늘 (BUILD 136)
  { id: 'windturbine', label: '풍력발전기 (부유·회전)', cat: '하늘' },
  // 겨울 (BUILD 119) — 창고에서 깨어난 것들
  { id: 'snowyhouse', label: '눈 덮인 집', cat: '겨울' },
  { id: 'snowman', label: '눈사람', cat: '겨울' },
  { id: 'pinesnow', label: '눈 소나무 군락', cat: '겨울' },
  // 하늘
  { id: 'cloud', label: '뭉게구름', cat: '하늘' },
  { id: 'cloud-dark', label: '먹구름', cat: '하늘' },
];

export const PROP_CATEGORIES = [...new Set(PROP_CATALOG.map((p) => p.cat))];

function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function std(color: string) {
  // BUILD 162: 배치물 프록시도 안개를 맞는다 — 세계의 문법에 예외 없음
  return applyHeightFog(new THREE.MeshStandardMaterial({ color, roughness: 0.92, metalness: 0 }));
}

const GREENS = ['#3f5b3f', '#547a4c', '#6f9a5d'];

function makeBush(rnd: () => number) {
  const bush = new THREE.Group();
  const blobGeo = new THREE.IcosahedronGeometry(1, 0);
  const n = 2 + Math.floor(rnd() * 3);
  for (let b = 0; b < n; b += 1) {
    const m = new THREE.Mesh(blobGeo, std(GREENS[Math.floor(rnd() * 2)]));
    const r = 0.09 + rnd() * 0.1;
    m.scale.set(r * (1 + rnd() * 0.4), r * 0.62, r * (1 + rnd() * 0.4));
    m.position.set((rnd() - 0.5) * 0.16, r * 0.5, (rnd() - 0.5) * 0.16);
    m.rotation.y = rnd() * Math.PI;
    m.castShadow = true;
    m.receiveShadow = true;
    bush.add(m);
  }
  return bush;
}

function makeTree(rnd: () => number) {
  const tree = new THREE.Group();
  const blobGeo = new THREE.IcosahedronGeometry(1, 0);
  const h = 0.55 + rnd() * 0.5;
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.042, h * 0.42, 5), std('#6d5638'));
  trunk.position.y = h * 0.21;
  trunk.castShadow = true;
  tree.add(trunk);
  const layers = 2 + (rnd() > 0.5 ? 1 : 0);
  for (let c = 0; c < layers; c += 1) {
    const m = new THREE.Mesh(blobGeo, std(GREENS[Math.min(2, c + (rnd() > 0.6 ? 1 : 0))]));
    const r = (0.2 - c * 0.045) * (h / 0.8);
    m.scale.set(r * (1 + rnd() * 0.3), r * 0.7, r * (1 + rnd() * 0.3));
    m.position.set((rnd() - 0.5) * 0.06, h * 0.42 + c * r * 0.95, (rnd() - 0.5) * 0.06);
    m.rotation.y = rnd() * Math.PI;
    m.castShadow = true;
    tree.add(m);
  }
  return tree;
}

function makeGrass(rnd: () => number) {
  const tuft = new THREE.Group();
  const mat = std(GREENS[1]);
  const n = 4 + Math.floor(rnd() * 4);
  for (let i = 0; i < n; i += 1) {
    const blade = new THREE.Mesh(new THREE.ConeGeometry(0.008, 0.09 + rnd() * 0.08, 3), mat);
    blade.position.set((rnd() - 0.5) * 0.06, 0.05, (rnd() - 0.5) * 0.06);
    blade.rotation.z = (rnd() - 0.5) * 0.5;
    tuft.add(blade);
  }
  return tuft;
}

// ---------- BUILD 118: PROP SETS — 홈즈 원칙을 에디터로. "Object 단위 제작 금지, 반드시 Set 단위." ----------
export type PropSetPiece = {
  obj: string;                    // PROP_CATALOG id
  dx: number; dz: number;         // 중심 기준 오프셋 (배치 규칙의 뼈대)
  jitter?: number;                // 위치 흔들림 반경
  scale?: [number, number];       // [최소, 최대]
  rotY?: number;                  // 기준 회전 (지터 ±0.4rad)
  roam?: boolean;
};
export type PropSet = {
  id: string;
  label: string;
  pieces: PropSetPiece[];
  /** 세트가 환경까지 바꾼다 (달밤 → 밤) */
  envTime?: 'day' | 'night';
};

export const PROP_SETS: PropSet[] = [
  {
    id: 'ranch', label: '🐄 목장',
    pieces: [
      { obj: 'cowshed', dx: 0, dz: -0.9, scale: [2.1, 2.5], rotY: 0.2 }, // BUILD 123: 기준치 2.6 반영 (net 5.5~6.5 유지)
      { obj: 'cow', dx: 0.9, dz: 0.5, jitter: 0.3, scale: [0.95, 1.05], roam: true },
      { obj: 'cow', dx: -0.8, dz: 0.8, jitter: 0.3, scale: [0.9, 1.0], roam: true },
      { obj: 'dog', dx: 0.4, dz: 1.1, jitter: 0.25, scale: [0.9, 1.1] },
      { obj: 'piggy', dx: -0.4, dz: 0.2, jitter: 0.3, scale: [0.9, 1.1] },
      { obj: 'grass', dx: 0.6, dz: -0.2, jitter: 0.5 },
      { obj: 'grass', dx: -0.9, dz: -0.4, jitter: 0.5 },
    ],
  },
  {
    id: 'moonnight', label: '🌙 달밤',
    envTime: 'night',
    pieces: [
      { obj: 'moon', dx: 1.5, dz: -3.5, scale: [1.6, 1.9] },   // y는 배치 후 하늘로 올린다
      { obj: 'lamp', dx: -0.5, dz: 0.3, jitter: 0.2 },
      { obj: 'lamp', dx: 0.8, dz: 1.4, jitter: 0.2 },
    ],
  },
  {
    id: 'grove', label: '🌲 숲 어귀',
    pieces: [
      { obj: 'tree', dx: -0.7, dz: -0.3, jitter: 0.3, scale: [1.0, 1.4] },
      { obj: 'tree', dx: 0.5, dz: -0.8, jitter: 0.3, scale: [0.9, 1.3] },
      { obj: 'tree', dx: 1.1, dz: 0.4, jitter: 0.3, scale: [1.1, 1.5] },
      { obj: 'bush', dx: -0.3, dz: 0.5, jitter: 0.4 },
      { obj: 'bush', dx: 0.2, dz: 0.9, jitter: 0.4 },
      { obj: 'bush', dx: -1.1, dz: 0.1, jitter: 0.4 },
      { obj: 'rock-small', dx: 0.7, dz: 0.1, jitter: 0.3, scale: [0.8, 1.3] },
      { obj: 'rock-small', dx: -0.5, dz: -0.9, jitter: 0.3, scale: [0.8, 1.3] },
    ],
  },
  {
    id: 'winteryard', label: '❄️ 겨울 마당',
    pieces: [
      { obj: 'snowyhouse', dx: 0, dz: -1.0, scale: [1.0, 1.15], rotY: 0.15 },
      { obj: 'snowman', dx: 0.7, dz: 0.5, jitter: 0.2, scale: [0.9, 1.1], rotY: -0.5 },
      { obj: 'pinesnow', dx: -1.2, dz: -0.5, jitter: 0.3, scale: [1.0, 1.3] },
      { obj: 'lamp', dx: 0.45, dz: 1.0, jitter: 0.15 },
    ],
  },
  {
    id: 'rest', label: '🪑 길가의 쉼터',
    pieces: [
      { obj: 'chair', dx: 0, dz: 0, rotY: 0.4 },
      { obj: 'book', dx: 0.35, dz: 0.15, jitter: 0.08, scale: [0.9, 1.0] },
      { obj: 'cup', dx: 0.28, dz: -0.18, jitter: 0.05 },
      { obj: 'lantern', dx: -0.35, dz: 0.1, jitter: 0.08 },
    ],
  },
];

/** 세트 → PlacedProp[] 확장. 각 조각은 배치 후 개별 사물 — 언제든 따로 만질 수 있다. */
export function expandPropSet(set: PropSet, cx: number, cy: number, cz: number, seed: number): PlacedProp[] {
  const rnd = rng(seed);
  return set.pieces.map((pc, i) => {
    const j = pc.jitter ?? 0;
    const sc = pc.scale ? pc.scale[0] + rnd() * (pc.scale[1] - pc.scale[0]) : 1;
    const isMoon = pc.obj === 'moon';
    return {
      // BUILD 130: id에 seed+난수 — 같은 밀리초에 세트 여러 개가 확장돼도(테마!) 절대 충돌하지 않는다.
      // Date.now()+i만 쓰던 시절, 테마의 세트 3개가 한 틱에 태어나 쌍둥이 id를 낳았다 → React 중복 키 → 지워지지 않는 유령.
      id: 'p' + Date.now().toString(36) + i.toString(36) + (seed % 1296).toString(36) + Math.floor(Math.random() * 1296).toString(36),
      obj: pc.obj,
      position: [
        +(cx + pc.dx + (rnd() - 0.5) * 2 * j).toFixed(2),
        isMoon ? +(cy + 7.5).toFixed(2) : +cy.toFixed(2), // 달은 하늘에 건다
        +(cz + pc.dz + (rnd() - 0.5) * 2 * j).toFixed(2),
      ] as [number, number, number],
      rotY: +(((pc.rotY ?? 0) + (rnd() - 0.5) * 0.8)).toFixed(2),
      rotX: 0,
      scale: +sc.toFixed(2),
      roam: pc.roam || undefined,
    };
  });
}

/** BUILD 117: 진짜 등불 (Vase 업로드 촛불 랜턴) — 실패 시 절차 등불 폴백 */
export async function loadHandLanternAsset(loadModel: ModelLoader = defaultLoader): Promise<THREE.Group> {
  try {
    const g = await loadKitModel('handlantern', loadModel);
    g.traverse((n) => {
      const mesh = n as THREE.Mesh;
      if (!mesh.isMesh) return;
      const m = mesh.material as THREE.MeshStandardMaterial;
      if (/flame/i.test(mesh.name) || /flame/i.test(m?.name ?? '')) {
        m.emissive = new THREE.Color('#ffd27a');
        m.emissiveIntensity = 2.4;
      }
      if (/glass/i.test(mesh.name) || /glass/i.test(m?.name ?? '')) {
        m.transparent = true;
        m.opacity = 0.35;
        m.emissive = new THREE.Color('#ffca6e');
        m.emissiveIntensity = 0.25;
      }
    });
    const glow = new THREE.PointLight('#ffca6e', 2.4, 6.5, 1.8);
    glow.position.y = 0.066; // 불꽃 실측 높이 (0.204/0.5 × 0.16)
    g.add(glow);
    return g;
  } catch {
    return makeHandLantern();
  }
}

/** BUILD 116: 손에 쥐는 등불 — 워커의 손 뼈에 매달린다. 밤길의 동반자 */
export function makeHandLantern(): THREE.Group {
  const g = new THREE.Group();
  const iron = std('#3c3f3a');
  // 고리 (손잡이)
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.028, 0.006, 6, 12), iron);
  ring.position.y = 0.0;
  g.add(ring);
  // 몸통 유리 (발광)
  const glassMat = new THREE.MeshStandardMaterial({ color: '#ffdf9e', emissive: '#ffca6e', emissiveIntensity: 1.6, roughness: 0.6 });
  const glass = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.036, 0.07, 8), glassMat);
  glass.position.y = -0.07;
  g.add(glass);
  // 지붕·바닥 캡
  const cap = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.03, 8), iron);
  cap.position.y = -0.025;
  g.add(cap);
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.038, 0.038, 0.012, 8), iron);
  base.position.y = -0.11;
  g.add(base);
  const glow = new THREE.PointLight('#ffca6e', 2.4, 6.5, 1.8);
  glow.position.y = -0.07;
  g.add(glow);
  return g;
}

/** 로밍용: 클립 동반 로드 */
export async function createPropAnimated(
  objId: string,
  loadModel: ModelLoader = defaultLoader,
): Promise<{ group: THREE.Group; animations: THREE.AnimationClip[] } | null> {
  try {
    if (objId === 'rogue') return await loadKitModelWithClips('rogue', loadModel);
    if (objId === 'scavenger') return await loadKitModelWithClips('scavenger', loadModel);
    if (objId === 'cow') return await loadKitModelWithClips('cow', loadModel); // BUILD 110
    return null;
  } catch {
    return null;
  }
}

/** 카탈로그 id → 3D 오브젝트. 에셋류는 비동기 로드, 절차류는 즉시. */
export async function createPropObject(
  objId: string,
  seed: number,
  loadModel: ModelLoader = defaultLoader,
): Promise<THREE.Group | null> {
  const rnd = rng(seed);
  try {
    switch (objId) {
      case 'rock-small': {
        const key = ['stone', 'rock0', 'rock3', 'rock7'][Math.floor(rnd() * 4)];
        return await loadKitModel(key, loadModel);
      }
      case 'rock-big': {
        const key = ['rockA', 'rockB', 'rockC', 'rockD'][Math.floor(rnd() * 4)];
        return await loadKitModel(key, loadModel);
      }
      case 'bush': return makeBush(rnd);
      case 'tree': return makeTree(rnd);
      case 'grass': return makeGrass(rnd);
      case 'cabin': return await loadKitModel('cabin', loadModel);
      case 'tent': return await loadKitModel('tent', loadModel);
      case 'lighthouse': return await loadKitModel('lighthouse', loadModel);
      case 'door': return KITS['door-kit'](rnd);
      case 'plane': return await loadKitModel('airplane', loadModel);
      case 'wall-stone': return KITS['stone-wall-kit'](rnd);
      case 'chair': return await loadKitModel('chair', loadModel);
      case 'suitcase': return await loadKitModel('suitcase', loadModel);
      case 'book': return await loadKitModel('book', loadModel);
      case 'cup': return makeCup(rnd);
      case 'fruit': return KITS['fruit-kit'](rnd);
      case 'cd-shelf': return KITS['cd-shelf-kit'](rnd);
      case 'person': return KITS['person-kit'](rnd);
      case 'sea-edge': return KITS['sea-edge-kit'](rnd);
      case 'cloud': return makeCloudPuff(rnd, 1.4 + rnd() * 1.8);
      case 'cloud-dark': {
        const c = makeCloudPuff(rnd, 1.6 + rnd() * 2.2);
        c.traverse((n) => {
          if ((n as THREE.Mesh).isMesh) {
            ((n as THREE.Mesh).material as THREE.MeshStandardMaterial) = std('#5d686e');
          }
        });
        return c;
      }
      case 'stone-tall': return await loadKitModel('stone11', loadModel);
      case 'slab': return await loadKitModel(rnd() > 0.5 ? 'caveA' : 'caveB', loadModel);
      case 'streetlamp': return makeStreetlamp(rnd);
      case 'lantern': return makeLantern(rnd);
      case 'oldcar': return makeOldCar(rnd);
      case 'rogue': return await loadKitModel('rogue', loadModel);
      case 'scavenger': return await loadKitModel('scavenger', loadModel);
      // BUILD 110: 동물들
      case 'cow': case 'dog': case 'duck': case 'chicky': case 'horse':
      case 'piggy': case 'bear': case 'deer': case 'boar': case 'wolf': case 'rabbit':
        return await loadKitModel(objId, loadModel);
      case 'cowshed': return await loadKitModel('cowshed', loadModel);
      // BUILD 119: 겨울
      case 'snowyhouse': case 'snowman': case 'pinesnow':
        return await loadKitModel(objId, loadModel);
      // BUILD 126: 철길
      case 'trainloco': case 'wagon2': case 'signallight': case 'railsection':
        return await loadKitModel(objId, loadModel);
      // BUILD 136: 풍력발전기 — 날개 3장을 허브 중심 로터로 재부모화, World가 Z축으로 돌린다
      case 'windturbine': {
        const g = await loadKitModel('windturbine', loadModel);
        g.updateMatrixWorld(true);
        // BUILD 142: 이름 매칭(1장만 잡혀 외날 셀프회전 사건) 대신 기하학 판별 —
        // 상부 절반에 통째로 떠 있는 메시 = 날개. 타워는 바닥부터 솟으니 자연히 제외된다.
        const gBox = new THREE.Box3().setFromObject(g);
        const midY = gBox.min.y + (gBox.max.y - gBox.min.y) * 0.5;
        const blades: THREE.Object3D[] = [];
        g.traverse((n) => {
          const mesh = n as THREE.Mesh;
          if (!mesh.isMesh) return;
          const b = new THREE.Box3().setFromObject(mesh);
          const w = Math.max(b.max.x - b.min.x, b.max.z - b.min.z);
          if (b.min.y > midY && (b.max.y - b.min.y) < (gBox.max.y - gBox.min.y) * 0.45 && w < (gBox.max.x - gBox.min.x) * 1.2) {
            // 상부에 떠 있고, 전체 높이의 절반을 넘지 않는 것 — 날개와 나셀
            if ((b.max.y - b.min.y) > 0.04 || w > 0.04) blades.push(mesh);
          }
        });
        if (blades.length) {
          const box = new THREE.Box3();
          blades.forEach((b) => box.expandByObject(b));
          const hub = box.getCenter(new THREE.Vector3());
          const rotor = new THREE.Group();
          const host = blades[0].parent ?? g;
          host.add(rotor);
          rotor.position.copy(host.worldToLocal(hub.clone()));
          rotor.updateMatrixWorld(true);
          blades.forEach((b) => rotor.attach(b)); // attach = 월드 자세 보존 재부모화
          g.userData.spinNode = rotor;
        }
        g.userData.floaty = true; // 공중에 둥둥
        return g;
      }
      case 'lamp': {
        const g = await loadKitModel('lamp', loadModel);
        const glow = new THREE.PointLight('#ffd9a0', 1.3, 2.4, 2); // BUILD 123: 몸집이 줄었으니 불빛도
        glow.position.y = 0.32;
        g.add(glow);
        return g;
      }
      case 'moon': {
        // BUILD 113: 달은 스스로 빛난다 — 은은한 자체발광, 밤 프리셋의 씨앗
        const g = await loadKitModel('moon', loadModel);
        g.traverse((n) => {
          const mesh = n as THREE.Mesh;
          if (!mesh.isMesh) return;
          const m = mesh.material as THREE.MeshStandardMaterial;
          m.emissive = new THREE.Color('#f2ecda');
          m.emissiveIntensity = 0.9;
        });
        // BUILD 114: 달은 보이기만 하는 게 아니라 비춘다 — 가로등의 문법을 하늘로
        const moonlight = new THREE.PointLight('#dfe6f0', 6.5, 55, 1.2); // BUILD 115: 하늘에 걸어도 위력이 닿게
        g.add(moonlight);
        return g;
      }
      default: return null;
    }
  } catch {
    return null;
  }
}
