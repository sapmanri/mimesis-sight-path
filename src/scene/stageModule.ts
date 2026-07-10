// ---------- BUILD 294: StageModule — 폽 세션 엔진 (본토·행성·동네 공용) ----------
// 별리가 어디서든 오브젝트를 '폽'으로 불러내 그걸로 논다: 스피커 켜고 춤, 모닥불 피우고 앉기,
// 매트 깔고 운동, 침대 펴고 잠, 책 펴고 읽기… 무대(평면/구면)와 무관한 하나의 엔진.
//
// 설계: 엔진은 하나, 놀이는 '레시피' 데이터로. 무대는 앵커(부모 그룹·위치)만 넘긴다.
//   레시피 = { 오브젝트 glb, 모션들, 분위기, 배치, 지속 }.
//   새 놀이 추가 = 레시피 하나 추가. 엔진은 그대로.

import * as THREE from 'three';
import { defaultLoader } from '../engine/worldCore';
import type { WalkerRig } from './walkerRig';
import { ambience } from '../audio/ambience';

// ---------- 공용 정규화 — wrap 그룹에서 world bbox 재서 세우고 바닥+중심 정렬 ----------
// glb 노드에 회전이 박혀 있어도(예: Speaker) world 기준이라 바로 선다.
export function normalizeProp(raw: THREE.Object3D, targetH: number, rot?: [number, number, number], fitAxis: 'y' | 'x' | 'z' | 'max' = 'max'): THREE.Group {
  const wrap = new THREE.Group();
  if (rot) raw.rotation.set(rot[0], rot[1], rot[2]); // BUILD 334: 정규화 전 회전 → 눕힌 상태의 bbox로 정규화
  wrap.add(raw);
  wrap.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(wrap);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const fit = fitAxis === 'y' ? size.y : fitAxis === 'x' ? size.x : fitAxis === 'z' ? size.z : Math.max(size.x, size.y, size.z);
  const s = targetH / (fit || 1);
  raw.scale.multiplyScalar(s);
  raw.position.sub(center.multiplyScalar(s));
  wrap.updateMatrixWorld(true);
  const box2 = new THREE.Box3().setFromObject(wrap);
  raw.position.y -= box2.min.y;
  return wrap;
}

// ---------- 떠오르는 심볼(음표 등) 파티클 ----------
function symbolTexture(glyph: string): THREE.CanvasTexture {
  const S = 64;
  const cv = document.createElement('canvas'); cv.width = S; cv.height = S;
  const g = cv.getContext('2d')!;
  g.font = '46px serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillStyle = 'rgba(90,82,69,0.9)';
  g.fillText(glyph, S / 2, S / 2 + 2);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

type Particle = { spr: THREE.Sprite; t: number; life: number; vx: number; vy: number; sway: number };
export function makeSymbolSystem(parent: THREE.Object3D, glyphs: string[]) {
  const texes = glyphs.map(symbolTexture);
  const root = new THREE.Group();
  parent.add(root);
  const items: Particle[] = [];
  return {
    root,
    emit(from: THREE.Vector3) {
      if (items.length > 14) return;
      const tex = texes[Math.floor(Math.random() * texes.length)];
      const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, opacity: 0, depthWrite: false, fog: false });
      const spr = new THREE.Sprite(mat);
      spr.scale.set(0.28, 0.28, 1);
      spr.position.copy(from).add(new THREE.Vector3((Math.random() - 0.5) * 0.2, 0.1, 0.1));
      root.add(spr);
      items.push({ spr, t: 0, life: 1.8 + Math.random() * 0.8, vx: (Math.random() - 0.5) * 0.3, vy: 0.5 + Math.random() * 0.3, sway: Math.random() * 6 });
    },
    update(dt: number) {
      for (let i = items.length - 1; i >= 0; i -= 1) {
        const n = items[i];
        n.t += dt;
        n.spr.position.x += (n.vx + Math.sin(n.t * 3 + n.sway) * 0.15) * dt;
        n.spr.position.y += n.vy * dt;
        const inK = Math.min(1, n.t / 0.25);
        const outK = Math.min(1, Math.max(0, (n.life - n.t) / 0.5));
        (n.spr.material as THREE.SpriteMaterial).opacity = Math.min(inK, outK) * 0.9;
        if (n.t >= n.life) {
          (n.spr.material as THREE.SpriteMaterial).map?.dispose();
          (n.spr.material as THREE.SpriteMaterial).dispose();
          root.remove(n.spr);
          items.splice(i, 1);
        }
      }
    },
    clear() {
      items.forEach((n) => { (n.spr.material as THREE.SpriteMaterial).dispose(); root.remove(n.spr); });
      items.length = 0;
    },
  };
}

// ---------- BUILD 295: 폽 버스트 — 파스텔 별이 사방으로 + 몽글 연기. 모든 스테이지 폽에 공통 ----------
// 화려하지 않되 "펑!"의 임팩트. 소환 순간 별 사방 분사 + 아래 연기, 0.5~0.7초에 사라진다.
function starTexture(color: string): THREE.CanvasTexture {
  const S = 64; const cv = document.createElement('canvas'); cv.width = S; cv.height = S;
  const g = cv.getContext('2d')!; g.translate(S / 2, S / 2);
  g.fillStyle = color; g.beginPath();
  for (let i = 0; i < 10; i += 1) {
    const r = i % 2 === 0 ? 26 : 11; const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
    const x = Math.cos(a) * r, y = Math.sin(a) * r;
    if (i === 0) g.moveTo(x, y); else g.lineTo(x, y);
  }
  g.closePath(); g.fill();
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; return tex;
}
function puffTexture(): THREE.CanvasTexture {
  const S = 64; const cv = document.createElement('canvas'); cv.width = S; cv.height = S;
  const g = cv.getContext('2d')!;
  const grad = g.createRadialGradient(S / 2, S / 2, 2, S / 2, S / 2, S / 2);
  grad.addColorStop(0, 'rgba(255,255,255,0.95)'); grad.addColorStop(0.7, 'rgba(250,250,250,0.6)'); grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad; g.beginPath(); g.arc(S / 2, S / 2, S / 2, 0, Math.PI * 2); g.fill();
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; return tex;
}

type Burst = { spr: THREE.Sprite; t: number; life: number; v: THREE.Vector3; spin: number; sz: number; kind: 'star' | 'puff' };
function makeBurstSystem(parent: THREE.Object3D) {
  const PASTEL = ['#f7b9c4', '#f5e6a0', '#b8dca8', '#a9d0e8', '#d8c4e8']; // 핑크·노랑·연두·하늘·연보라
  const starTex = PASTEL.map(starTexture);
  const puffTex = puffTexture();
  const root = new THREE.Group();
  parent.add(root);
  const items: Burst[] = [];
  return {
    root,
    // at: 월드 좌표 소환 지점. 별 사방 분사 + 연기 아래에서 피어오름.
    fire(at: THREE.Vector3) {
      const N = 12 + Math.floor(Math.random() * 5);
      for (let i = 0; i < N; i += 1) {
        const tex = starTex[Math.floor(Math.random() * starTex.length)];
        const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, opacity: 1, depthWrite: false, fog: false });
        const spr = new THREE.Sprite(mat);
        const sz = 0.12 + Math.random() * 0.14;
        spr.scale.setScalar(sz);
        spr.position.copy(at);
        root.add(spr);
        const ang = (i / N) * Math.PI * 2 + Math.random() * 0.5;
        const spd = 1.4 + Math.random() * 1.6;
        items.push({ spr, t: 0, life: 0.45 + Math.random() * 0.3, v: new THREE.Vector3(Math.cos(ang) * spd, Math.abs(Math.sin(ang)) * spd * 0.8 + 0.6, (Math.random() - 0.5) * 0.4), spin: (Math.random() - 0.5) * 12, sz, kind: 'star' });
      }
      // 연기 퍼프 몇 개 — 아래에서 부풀며 옅어짐
      for (let i = 0; i < 5; i += 1) {
        const mat = new THREE.SpriteMaterial({ map: puffTex, transparent: true, opacity: 0.9, depthWrite: false, fog: false });
        const spr = new THREE.Sprite(mat);
        const sz = 0.4 + Math.random() * 0.3;
        spr.scale.setScalar(sz);
        spr.position.copy(at).add(new THREE.Vector3((Math.random() - 0.5) * 0.5, -0.1 + Math.random() * 0.2, (Math.random() - 0.5) * 0.2));
        root.add(spr);
        items.push({ spr, t: 0, life: 0.5 + Math.random() * 0.25, v: new THREE.Vector3((Math.random() - 0.5) * 0.3, 0.3 + Math.random() * 0.2, 0), spin: 0, sz, kind: 'puff' });
      }
    },
    update(dt: number) {
      for (let i = items.length - 1; i >= 0; i -= 1) {
        const b = items[i]; b.t += dt;
        const k = b.t / b.life;
        b.spr.position.addScaledVector(b.v, dt);
        if (b.kind === 'star') {
          b.v.y -= 3.5 * dt; // 중력 — 별이 살짝 포물선
          b.spr.material.rotation += b.spin * dt;
          (b.spr.material as THREE.SpriteMaterial).opacity = Math.max(0, 1 - k);
          b.spr.scale.setScalar(b.sz * (1 - k * 0.3));
        } else {
          b.v.multiplyScalar(0.92); // 연기는 느려지며
          const gs = b.sz * (1 + k * 1.2); // 부풀고
          b.spr.scale.setScalar(gs);
          (b.spr.material as THREE.SpriteMaterial).opacity = Math.max(0, 0.9 * (1 - k));
        }
        if (b.t >= b.life) {
          (b.spr.material as THREE.SpriteMaterial).dispose();
          root.remove(b.spr); items.splice(i, 1);
        }
      }
    },
    clear() { items.forEach((b) => { (b.spr.material as THREE.SpriteMaterial).dispose(); root.remove(b.spr); }); items.length = 0; },
  };
}

// ---------- 스피커 얼굴 텍스처 (원본 모델이 밋밋한 회색 박스라 콘·그물을 그려 입힌다) ----------
export function speakerFaceTexture(): THREE.CanvasTexture {
  const W = 256, H = 512;
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const g = cv.getContext('2d')!;
  g.fillStyle = '#2c2620'; g.fillRect(0, 0, W, H);
  g.fillStyle = 'rgba(255,255,255,0.04)';
  for (let y = 6; y < H; y += 9) for (let x = 6; x < W; x += 9) { g.beginPath(); g.arc(x, y, 1.4, 0, Math.PI * 2); g.fill(); }
  const cone = (cy: number, r: number) => {
    g.beginPath(); g.arc(W / 2, cy, r, 0, Math.PI * 2); g.fillStyle = '#1a1712'; g.fill();
    g.strokeStyle = '#4a4038'; g.lineWidth = 3; g.stroke();
    g.beginPath(); g.arc(W / 2, cy, r * 0.42, 0, Math.PI * 2); g.fillStyle = '#3a332b'; g.fill();
  };
  cone(H * 0.34, W * 0.34); cone(H * 0.72, W * 0.20);
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; return tex;
}

// ---------- 레시피 ----------
// 오브젝트 하나를 폽으로 불러 배치하고, 그 위에서 어떤 모션을 몇 번 돌리며, 어떤 분위기를 낼지.
export type StageProp = {
  file: string;              // glb 파일명 (public/assets/models/)
  targetH: number;          // 정규화 크기(월드 유닛) — fitAxis 축을 이 값에 맞춘다
  offset: [number, number, number]; // 캐릭터(앵커) 기준 배치 오프셋
  bodyColor?: string;       // 몸통 재질 덮어쓰기(선택)
  faceQuad?: 'speaker';     // 앞면에 붙일 얼굴판 종류(선택)
  bob?: number;             // 재생 중 위아래 들썩임(0=없음)
  rot?: [number, number, number]; // BUILD 334: 정규화 전 회전(라디안) — 세로로 서 있는 모델(침대 등)을 눕힌다
  fitAxis?: 'y' | 'x' | 'z' | 'max'; // BUILD 334: 어느 축을 targetH에 맞출지(기본 max). 길쭉한 가구는 특정 축 기준
  stripNodes?: string[]; // BUILD 345: 이 이름들의 노드를 로드 시 제거(예: 빈백을 빼고 그 자리에 별리를 눕힌다)
};
export type StageRecipe = {
  id: string;
  motions: string[];        // 재생할 모션 클립 이름들(무작위로 이어 재생)
  rounds: [number, number]; // 반복 횟수 범위 [min, max]
  prop?: StageProp;         // 소환 오브젝트(없으면 모션만)
  symbols?: string[];       // 떠오르는 심볼(음표 ['♪','♫'] 등)
  symbolEvery?: number;     // 심볼 방출 간격(초)
  tune?: 'music';           // 분위기 사운드
  tuneEvery?: number;       // 사운드 반복 간격(초)
  moods?: string[];         // BUILD 324: 이 놀이가 어울리는 무드(contemplative/playful/idle). 없으면 아무 무드나.
  minDuration?: number;     // BUILD 326: 최소 지속(초). rounds가 끝나도 이 시간 전엔 계속 반복 — 짧은 클립이 순식간에 끝나는 것 방지
};

// 첫 레시피: 춤 — 스피커 폽 + 음표 + 음악 + 여러 곡.
export const STAGE_RECIPES: Record<string, StageRecipe> = {
  dance: {
    id: 'dance',
    motions: ['HipHop', 'Samba', 'Rumba', 'Shuffle'],
    rounds: [2, 4],
    prop: { file: 'Speaker.glb', targetH: 0.9, offset: [-0.7, 0, 0.2], bodyColor: '#6b4a2e', faceQuad: 'speaker', bob: 0.03 },
    symbols: ['♪', '♫', '♩', '♬'],
    symbolEvery: 0.35,
    tune: 'music',
    tuneEvery: 2.8,
    moods: ['playful'], // 신나는 활기
  },
  // BUILD 323: 레시피 확장 — 별리가 맥락 있는 딴짓을 한다. 에셋·클립 모두 repo 확인됨.
  // BUILD 324: 각 놀이에 어울리는 무드 태그 — 관조 땐 눕고, 활기 땐 춤추고(맥락).
  sleep: {
    id: 'sleep',
    motions: ['LayingShake'],
    rounds: [1, 2],
    prop: { file: 'BedroomScene.glb', targetH: 2.0, offset: [0.3, 0, -0.5], bob: 0, fitAxis: 'y', rot: [0, Math.PI, 0], stripNodes: ['Seat_1_Sphere'] }, // BUILD 345: 빈백 제거, 카펫 자리에 별리 눕게 정렬
    symbols: ['💤', 'z', 'Z'],
    symbolEvery: 0.8,
    moods: ['contemplative', 'idle'], // 차분·나른
    minDuration: 12, // BUILD 341: 방 감상하게 연장
  },
  piano: {
    id: 'piano',
    motions: ['Piano'],
    rounds: [2, 3],
    prop: { file: 'Synthesizer.glb', targetH: 0.55, offset: [-0.19, 0, 0.05], bob: 0, rot: [0, Math.PI / 2, 0] }, // BUILD 342: 신디 몸통 반 더 붙임(-0.25→-0.19)
    symbols: ['♪', '♫', '♩', '♬'],
    symbolEvery: 0.4,
    tune: 'music',
    tuneEvery: 3.0,
    moods: ['contemplative', 'idle'], // 잔잔한 연주
    minDuration: 12, // BUILD 341: piano도 짧아 스샷 불가 → 12초
  },
  workout: {
    id: 'workout',
    motions: ['Situps', 'BicycleCrunch', 'CircleCrunch'],
    rounds: [2, 4],
    // 오브젝트 없음 — 맨몸 운동. 폽 버스트만.
    symbols: ['💪', '✦', '·'],
    symbolEvery: 0.5,
    moods: ['playful', 'idle'], // 활동적인 일상
    minDuration: 10, // BUILD 341: 연장
  },
  treadmill: {
    id: 'treadmill',
    motions: ['Treadmill'],
    rounds: [4, 6],
    prop: { file: 'Treadmill.glb', targetH: 1.1, offset: [-0.15, 0, 0], bob: 0, rot: [0, Math.PI, 0] }, // BUILD 348: 러닝머신이 오른쪽 치우쳐 발판 삐져나옴 → 왼쪽으로(0.3→-0.15)
    symbols: ['·', '✦'],
    symbolEvery: 0.6,
    moods: ['playful', 'idle'], // 활기찬 운동
    minDuration: 14, // BUILD 340: 7→14초, 스샷 찍을 시간도 없이 짧던 것
  },
};

// ---------- 세션 엔진 ----------
// 무대가 넘기는 것: parent(오브젝트를 담을 그룹), rig(모션), onFace(방향 지정 콜백, 선택).
export type StageAnchor = {
  parent: THREE.Object3D;                 // 오브젝트를 add할 그룹(예: 캐릭터 mount)
  rig: WalkerRig;                         // 모션 재생 대상
};

type Loaded = { proto: THREE.Object3D };
const protoCache = new Map<string, Loaded>();

export function makeStage(scene: THREE.Object3D) {
  const symbolSys = makeSymbolSystem(scene, ['♪', '♫', '♩', '♬']);
  const burstSys = makeBurstSystem(scene);
  const S = {
    active: false,
    recipe: null as StageRecipe | null,
    anchor: null as StageAnchor | null,
    obj: null as THREE.Group | null,
    face: null as THREE.Mesh | null,
    roundsLeft: 0,
    timer: 0,
    tuneT: 0,
    symT: 0,
    popT: 0,
    sessionAge: 0, // BUILD 326: 세션 경과 시간(초) — minDuration 판정용
    phase: 'none' as 'none' | 'in' | 'hold' | 'out',
  };

  // 프로토 미리 로드(레시피의 prop) — 있으면 즉시 소환 가능
  const preload = (recipe: StageRecipe) => {
    const p = recipe.prop; if (!p || protoCache.has(p.file)) return;
    void defaultLoader(p.file).then((gltf) => {
      const root = gltf.scene;
      // BUILD 338: 일부 glb는 렌더용 카메라·조명·배경평면이 같이 들어있다(VRayCam/Light, Plane).
      //   이것들이 bbox를 잡아먹어 정규화를 망친다(러닝머신이 판때기로 뜨던 원인) → 제거.
      const junk: THREE.Object3D[] = [];
      const strip = p.stripNodes ?? [];
      root.traverse((o) => {
        if (/vraycam|vraylight|camera|\.target$|^plane\d|^plane$/i.test(o.name)) junk.push(o);
        if (strip.some((n) => o.name.includes(n))) junk.push(o); // BUILD 345: 지정 노드 제거(빈백 등)
        const anyO = o as unknown as { isCamera?: boolean; isLight?: boolean };
        if (anyO.isCamera || anyO.isLight) junk.push(o);
      });
      for (const j of junk) j.parent?.remove(j);
      if (p.bodyColor) {
        root.traverse((o) => {
          const m = o as THREE.Mesh;
          if (m.isMesh) m.material = new THREE.MeshStandardMaterial({ color: p.bodyColor, roughness: 0.7, metalness: 0.05 });
        });
      }
      protoCache.set(p.file, { proto: root });
    }).catch(() => { /* 없으면 모션만 */ });
  };

  return {
    symbolSys,
    // 레시피 미리 로드(씬 시작 시 호출 권장)
    preload(id: string) { const r = STAGE_RECIPES[id]; if (r) preload(r); },
    isActive: () => S.active || S.phase === 'out', // BUILD 326: 프롭 퇴장(out) 중에도 active로 — 안 그러면 사라지기 전에 새 세션이 겹침
    currentId: () => (S.active ? S.recipe?.id ?? null : null), // BUILD 329: 현재 진행 중 스테이지 id(이벤트 기록용)
    // 세션 시작 — 성공 시 true. 오브젝트 폽 + 첫 모션.
    play(id: string, anchor: StageAnchor): boolean {
      if (S.active) return false;
      const recipe = STAGE_RECIPES[id]; if (!recipe) return false;
      const first = recipe.motions[Math.floor(Math.random() * recipe.motions.length)];
      const dur = anchor.rig.playNamed?.(first) ?? 0;
      if (dur <= 0) return false;
      S.active = true; S.recipe = recipe; S.anchor = anchor;
      S.roundsLeft = recipe.rounds[0] + Math.floor(Math.random() * (recipe.rounds[1] - recipe.rounds[0] + 1));
      S.timer = dur; S.tuneT = 0; S.symT = 0; S.popT = 0; S.sessionAge = 0;
      // 오브젝트 소환
      const p = recipe.prop;
      const cached = p ? protoCache.get(p.file) : null;
      if (p && cached) {
        const sp = normalizeProp(cached.proto.clone(true), p.targetH, p.rot, p.fitAxis);
        sp.position.set(p.offset[0], p.offset[1], p.offset[2]);
        if (p.faceQuad === 'speaker') {
          const box = new THREE.Box3().setFromObject(sp);
          const size = box.getSize(new THREE.Vector3());
          const fm = new THREE.MeshStandardMaterial({ map: speakerFaceTexture(), roughness: 0.85, metalness: 0.05 });
          const face = new THREE.Mesh(new THREE.PlaneGeometry(size.x * 0.9, size.y * 0.9), fm);
          face.position.set(0, size.y * 0.5, size.z * 0.5 + 0.005);
          sp.add(face);
          S.face = face;
        }
        sp.scale.setScalar(0.001);
        anchor.parent.add(sp);
        S.obj = sp;
        S.phase = 'in';
        // BUILD 295: 펑! 파스텔 별 버스트 + 연기 — 오브젝트 소환 지점에서
        sp.updateWorldMatrix(true, false);
        const wp = sp.getWorldPosition(new THREE.Vector3()); wp.y += p!.targetH * 0.5;
        burstSys.fire(wp);
      } else {
        S.phase = 'hold'; // 오브젝트 없어도 모션은 돈다
        // 오브젝트 없는 세션도 캐릭터 앞에서 펑
        const wp = anchor.parent.getWorldPosition(new THREE.Vector3()); wp.y += 0.6;
        burstSys.fire(wp);
      }
      if (recipe.tune === 'music') ambience.mumbleTune?.();
      return true;
    },
    // 세션 종료(외부에서 강제 종료 가능)
    stop() {
      if (!S.active) return;
      S.anchor?.rig.stopNamed?.();
      S.active = false; S.recipe = null;
      if (S.obj) { S.popT = 0.4; S.phase = 'out'; } // BUILD 320: out 시작점 고정(k=1→0). 안 그러면 popT가 들쭉날쭉해 프롭이 안 사라짐
      else S.phase = 'none';
    },
    // 매 프레임 — 모션 이어가기 + 오브젝트 폽 애니 + 심볼 + 사운드
    update(dt: number, elapsed: number) {
      symbolSys.update(dt);
      burstSys.update(dt);
      if (S.active && S.recipe && S.anchor) {
        const R = S.recipe;
        S.sessionAge += dt;
        S.timer -= dt;
        if (R.tune === 'music') { S.tuneT -= dt; if (S.tuneT <= 0) { ambience.mumbleTune?.(); S.tuneT = R.tuneEvery ?? 2.8; } }
        if (S.timer <= 0) {
          S.roundsLeft -= 1;
          // BUILD 326: rounds가 끝나도 minDuration 전이면 계속 반복(짧은 클립이 순식간에 끝나는 것 방지)
          const minDur = R.minDuration ?? 0;
          if (S.roundsLeft > 0 || S.sessionAge < minDur) {
            const next = R.motions[Math.floor(Math.random() * R.motions.length)];
            S.timer = S.anchor.rig.playNamed?.(next) ?? 2;
          } else {
            this.stop();
          }
        }
      }
      // 오브젝트 폽 애니
      const obj = S.obj;
      if (obj && S.phase === 'in') {
        S.popT += dt;
        const k = Math.min(1, S.popT / 0.4);
        const base = S.recipe?.prop?.targetH ? 0.9 : 0.9;
        const pop = base * (1 + 0.25 * Math.sin(k * Math.PI)) * (k < 1 ? k : 1);
        obj.scale.setScalar(Math.max(0.001, pop));
        if (k >= 1) { obj.scale.setScalar(0.9); S.phase = 'hold'; }
      } else if (obj && S.phase === 'hold') {
        const bob = S.recipe?.prop?.bob ?? 0;
        if (bob > 0) obj.position.y = Math.abs(Math.sin(elapsed * 6)) * bob;
        if (S.recipe?.symbols?.length) {
          S.symT -= dt;
          if (S.symT <= 0) {
            S.symT = S.recipe.symbolEvery ?? 0.3;
            const wp = obj.getWorldPosition(new THREE.Vector3()); wp.y += 0.9;
            symbolSys.emit(wp);
          }
        }
      } else if (obj && S.phase === 'out') {
        S.popT -= dt * 3;
        const k = Math.max(0, S.popT / 0.4);
        obj.scale.setScalar(Math.max(0.001, 0.9 * k));
        if (k <= 0.01 || S.popT <= 0) { obj.parent?.remove(obj); S.obj = null; S.face = null; S.phase = 'none'; }
      } else if (!obj && S.phase === 'out') {
        // BUILD 320: obj가 이미 없는데 out에 걸린 잔여 상태 정리
        S.phase = 'none';
      }
    },
    dispose() {
      symbolSys.clear();
      burstSys.clear();
      scene.remove(symbolSys.root);
      scene.remove(burstSys.root);
      if (S.obj) { S.obj.parent?.remove(S.obj); S.obj = null; }
    },
  };
}

export type Stage = ReturnType<typeof makeStage>;
