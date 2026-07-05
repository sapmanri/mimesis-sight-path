// ---------- BUILD 100: PROPS — 자유 배치 ----------
// "이게 되어야 나중에 세트 자동 배치가 의미가 있다" — Vase.
// 세계의 모든 사물을 카탈로그로 열고, 에디터가 어디든 놓을 수 있게 한다.
// 배치물은 문서(WorldDoc)에 저장된다: 자리·회전(좌우/상하)·크기·높이.

import * as THREE from 'three';
import {
  KITS, MODELS, loadKitModel, makeCloudPuff, defaultLoader, type ModelLoader,
} from './worldCore';

export type PlacedProp = {
  id: string;              // 고유 id (에디터가 발급)
  obj: string;             // PROP_CATALOG의 id
  position: [number, number, number];
  rotY: number;            // 좌우 회전 (라디안)
  rotX: number;            // 위아래 기울임 (라디안)
  scale: number;           // 크기 배율
};

export type PropDef = { id: string; label: string; cat: string };

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
  { id: 'lighthouse', label: '등대', cat: '구조물' },
  { id: 'door', label: '초록 대문', cat: '구조물' },
  { id: 'wall-stone', label: '돌담 조각', cat: '구조물' },
  { id: 'chair', label: '의자', cat: '구조물' },
  { id: 'streetlamp', label: '가로등', cat: '구조물' },
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
  return new THREE.MeshStandardMaterial({ color, roughness: 0.92, metalness: 0 });
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
      case 'lighthouse': return await loadKitModel('lighthouse', loadModel);
      case 'door': return KITS['door-kit'](rnd);
      case 'plane': return await loadKitModel('airplane', loadModel);
      case 'wall-stone': return KITS['stone-wall-kit'](rnd);
      case 'chair': return await loadKitModel('chair', loadModel);
      case 'suitcase': return await loadKitModel('suitcase', loadModel);
      case 'book': return KITS['book-kit'](rnd);
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
      case 'oldcar': return makeOldCar(rnd);
      case 'rogue': return await loadKitModel('rogue', loadModel);
      case 'scavenger': return await loadKitModel('scavenger', loadModel);
      default: return null;
    }
  } catch {
    return null;
  }
}
