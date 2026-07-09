// ---------- BUILD 285: TheatreWorld — 그림자 극장(페러럴) ----------
// 옆면 고정 카메라. 별리는 X 고정, Y만 지면 곡선을 타고 오르내리며 제자리 걷기.
// 근/중/원경 실루엣 판때기가 서로 다른 속도로 흐른다 — 패럴럭스가 깊이를 만든다.
// 공유 코어: loadWalkerAsset · createClipRig(별리) · speech · ambience (행성/본토와 같은 자산).

import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { loadWalkerAsset } from '../engine/worldCore';
import { createClipRig, createWalkerRig, type WalkerRig } from './walkerRig';
import { footsteps } from './footsteps';
import { ambience } from '../audio/ambience';
import { makeBubble, updateBubble, type Bubble } from './speech';
import type { TheatreSpec, TheatreLayer } from './theatreSpec';

// 이음새 없는 능선: 주기(2π)로 닫히는 sin 합. wrapS=Repeat로 무한 스크롤해도 이음매가 없다.
function ridge(u: number, l: TheatreLayer): number {
  const s = l.seed;
  return (
    Math.sin(u * l.freq + s) * 0.55 +
    Math.sin(u * l.freq * 2.0 + s * 1.7) * 0.28 +
    Math.sin(u * l.freq * 3.0 + s * 2.3) * 0.17
  );
}

// 한 레이어의 실루엣을 이음새 없는 타일 텍스처로 굽는다.
function bakeLayer(l: TheatreLayer, W = 1024, H = 256): THREE.CanvasTexture {
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const g = cv.getContext('2d')!;
  g.clearRect(0, 0, W, H);
  g.fillStyle = l.color;
  g.beginPath();
  g.moveTo(0, H);
  const N = 256;
  for (let i = 0; i <= N; i += 1) {
    const u = (i / N) * Math.PI * 2; // 0..2π → 좌우로 닫힘
    const x = (i / N) * W;
    const top = H * (1 - l.baseY) - ridge(u, l) * l.amp * H;
    g.lineTo(x, top);
  }
  g.lineTo(W, H);
  g.closePath();
  g.fill();
  const tex = new THREE.CanvasTexture(cv);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  return tex;
}

// 지면 곡선의 '월드 높이' — 별리 발이 이 값을 탄다. scroll이 흐르면 언덕이 다가왔다 지나간다.
// BUILD 286: near 실루엣 진폭에 묶지 않고 전용 amp/freq로 — 눈에 확실히 보이는 오르내림.
function groundHeight(scroll: number, amp: number, freq: number): number {
  const u = scroll * freq;
  return (Math.sin(u) * 0.6 + Math.sin(u * 1.7 + 1.3) * 0.3 + Math.sin(u * 0.4 + 2.1) * 0.1) * amp;
}

type Props = {
  spec: TheatreSpec;
  walkerIdx: number;
  paused?: boolean;
};

export function TheatreWorld({ spec, walkerIdx, paused }: Props) {
  const { scene, camera } = useThree();
  const specRef = useRef(spec); specRef.current = spec;
  const pausedRef = useRef(paused); pausedRef.current = paused;

  // 배경 판때기(빌보드 3장) + 하늘 + 지면
  const stage = useMemo(() => new THREE.Group(), []);
  const rigRef = useRef<WalkerRig | null>(null);
  const walkerGroupRef = useRef<THREE.Group | null>(null);
  const walkerMountRef = useRef<THREE.Group | null>(null); // BUILD 287: 오르내림을 거는 래퍼
  const footRef = useRef<THREE.Object3D | null>(null);
  const layerMats = useRef<{ mat: THREE.MeshBasicMaterial; speed: number }[]>([]);
  const scrollRef = useRef(0);
  // BUILD 288: 동네 체류 상태머신 — 걷다(배경 흐름) 멈춰서(배경 정지) 딴짓하며 논다.
  //   행성 linger를 옆면 무대에 이식: '이동'=scroll 증가, '체류'=scroll 정지 + flourish.
  const phaseRef = useRef<'walk' | 'linger'>('walk');
  const lingerRef = useRef({ left: 0, gap: 0, timer: 0, walkLeft: 4 + Math.random() * 3 });
  // BUILD 289: 바라보는 방향 — 걸을 땐 왼쪽(-π/2) 고정, 놀 땐 정면 쪽으로 자유롭게.
  const faceRef = useRef(-Math.PI / 2);
  const bubbleRoot = useMemo(() => new THREE.Group(), []);
  const bubbles = useRef<Bubble[]>([]);

  // 옆면 고정 카메라 — 정면(+Z)에서 무대를 바라본다. 캐릭터는 원점 부근.
  useEffect(() => {
    camera.position.set(0, 1.35, 6.2);
    camera.lookAt(0, 1.15, 0);
    (camera as THREE.PerspectiveCamera).fov = 38;
    (camera as THREE.PerspectiveCamera).updateProjectionMatrix();
    scene.fog = null;
  }, [camera, scene]);

  // 하늘 + 3레이어 빌보드 구성
  useEffect(() => {
    const S = specRef.current;
    stage.clear();
    layerMats.current = [];

    // 하늘 — 큰 평면, 세로 그라디언트
    const skyCv = document.createElement('canvas'); skyCv.width = 4; skyCv.height = 256;
    const sg = skyCv.getContext('2d')!;
    const grad = sg.createLinearGradient(0, 0, 0, 256);
    grad.addColorStop(0, S.skyTop); grad.addColorStop(1, S.skyBottom);
    sg.fillStyle = grad; sg.fillRect(0, 0, 4, 256);
    const skyTex = new THREE.CanvasTexture(skyCv); skyTex.colorSpace = THREE.SRGBColorSpace;
    const sky = new THREE.Mesh(
      new THREE.PlaneGeometry(60, 24),
      new THREE.MeshBasicMaterial({ map: skyTex, depthWrite: false, fog: false }),
    );
    sky.position.set(0, 4, -14);
    stage.add(sky);

    // 3레이어 — 뒤(원경)에서 앞(근경) 순으로 z를 당긴다
    const defs: { layer: TheatreLayer; z: number; h: number; w: number }[] = [
      { layer: S.far,  z: -10, h: 12, w: 40 },
      { layer: S.mid,  z: -6,  h: 11, w: 40 },
      { layer: S.near, z: -2.6, h: 10, w: 40 },
    ];
    for (const d of defs) {
      const tex = bakeLayer(d.layer);
      tex.repeat.set(d.w / 12, 1); // 가로로 여러 번 타일 → 능선이 촘촘
      const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, fog: false });
      const m = new THREE.Mesh(new THREE.PlaneGeometry(d.w, d.h), mat);
      m.position.set(0, d.h / 2 - 1.2, d.z);
      stage.add(m);
      layerMats.current.push({ mat, speed: d.layer.speed });
    }

    if (!stage.parent) scene.add(stage);
    if (!bubbleRoot.parent) scene.add(bubbleRoot);
    return () => { stage.clear(); };
  }, [scene, stage, bubbleRoot, spec.skyTop, spec.skyBottom, spec.far, spec.mid, spec.near]);

  // 별리 로드 — 행성과 같은 파이프라인. clipRig면 걷기 클립을 자동 재생.
  useEffect(() => {
    let alive = true;
    rigRef.current = null;
    if (walkerMountRef.current) { stage.remove(walkerMountRef.current); walkerMountRef.current = null; walkerGroupRef.current = null; }
    void loadWalkerAsset(undefined, walkerIdx < 0 ? 'random' : walkerIdx).then(({ group, animations, clipSpeeds }) => {
      if (!alive) return;
      // BUILD 287: 별리를 래퍼(mount)에 담는다. rig는 group(=root)의 Y를 매 프레임 덮어쓰므로(접지보정),
      //   오르내림은 group이 아니라 이 래퍼에 걸어야 살아남는다. (PlanetWorld liftGroup과 같은 원리)
      group.rotation.y = -Math.PI / 2;
      group.position.set(0, 0, 0);
      const mount = new THREE.Group();
      mount.add(group);
      stage.add(mount);
      walkerMountRef.current = mount;
      walkerGroupRef.current = group;
      footRef.current = null;
      group.traverse((n) => { if (!footRef.current && /left.*foot$/i.test(n.name)) footRef.current = n; });
      if (!footRef.current) group.traverse((n) => { if (!footRef.current && /foot$/i.test(n.name)) footRef.current = n; });
      rigRef.current = (clipSpeeds ? createClipRig(group, animations, clipSpeeds, footsteps.step) : null)
        ?? createWalkerRig(group, animations, 0.72);
    }).catch(() => { /* 조용한 극장 */ });
    return () => { alive = false; };
  }, [stage, walkerIdx]);

  // 웅얼웅얼 (행성과 동일)
  const speak = (icon?: string, pitch = 1) => {
    const g = walkerGroupRef.current;
    if (!g || bubbles.current.length >= 2) return;
    const b = makeBubble(g, 1.15, icon);
    bubbles.current.push(b);
    bubbleRoot.add(b.sprite);
    ambience.mumble?.(pitch);
  };

  useFrame((_s, rawDt) => {
    const dt = Math.min(0.05, rawDt);
    const S = specRef.current;
    const P = phaseRef.current;
    const L = lingerRef.current;
    const lingerEvery = Math.max(0.5, S.lingerEvery ?? 3);
    const lingerLen = Math.max(0.2, S.lingerLength ?? 1);

    // BUILD 288: 체류 상태머신 — 걷기는 다음 볼거리로 가는 짧은 전환, 체류가 기본.
    let moving = false;
    if (pausedRef.current) {
      moving = false;
    } else if (P === 'linger') {
      // 멈춰서 딴짓과 '가만히'를 번갈아 — 이 동안 배경도 멈춘다(여기 머문다).
      moving = false;
      L.gap -= dt;
      if (L.gap <= 0 && L.left > 0) {
        const dur = rigRef.current?.flourish?.() ?? 0;
        // 딴짓할 때 가끔 웅얼웅얼
        if (Math.random() < 0.4) {
          const r = Math.random();
          speak(r < 0.72 ? undefined : r < 0.86 ? '♪' : r < 0.94 ? '~' : '!', 0.85 + Math.random() * 0.35);
        }
        // BUILD 289: 놀 땐 방향 자유 — 딴짓마다 가끔 정면/좌/우로 튼다(무대 배우처럼).
        const pick = Math.random();
        faceRef.current = pick < 0.5 ? 0 : pick < 0.72 ? -0.5 : pick < 0.88 ? 0.5 : -Math.PI / 2;
        L.left -= 1;
        L.gap = (dur > 0 ? dur : 1.4) + (1.4 + Math.random() * 2.8) * lingerLen;
      }
      if (L.left <= 0 && L.gap <= 0) {
        phaseRef.current = 'walk';
        faceRef.current = -Math.PI / 2; // 다시 걸으면 진행방향(왼쪽)
        L.walkLeft = lingerEvery * (0.7 + Math.random() * 0.7);
      }
    } else {
      // walk — 배경이 흐른다. 짧게 걷다 walkLeft 소진되면 체류로.
      moving = true;
      faceRef.current = -Math.PI / 2; // 걸을 땐 왼쪽 고정
      L.walkLeft -= dt;
      if (L.walkLeft <= 0) {
        phaseRef.current = 'linger';
        faceRef.current = 0; // 멈추면 우선 정면(관객)을 본다
        L.left = Math.max(1, Math.round((2 + Math.random() * 3) * lingerLen));
        L.gap = 0.6 + Math.random() * 1.4;
      }
    }

    if (moving) scrollRef.current += S.walkSpeed * dt;
    const scroll = scrollRef.current;

    // 레이어 U-스크롤 — 별리가 왼쪽으로 가니 배경은 왼쪽으로 흐른다(offset 음수). 체류 중엔 안 흐름.
    for (const Lm of layerMats.current) {
      if (Lm.mat.map) Lm.mat.map.offset.x = -scroll * Lm.speed * 0.06;
    }

    // 별리 — X 고정, Y만 지면 곡선을 부드럽게 탄다 (BUILD 287: 오르내림은 래퍼에)
    const g = walkerGroupRef.current;
    const mnt = walkerMountRef.current;
    if (mnt) {
      const gy = groundHeight(scroll, S.groundAmp ?? 0.6, S.groundFreq ?? 0.5);
      mnt.position.y += (gy - mnt.position.y) * Math.min(1, dt * 4);
    }
    if (g) {
      // BUILD 289: 바라보는 방향을 목표각으로 부드럽게 회전. 걸을 땐 왼쪽, 놀 땐 자유.
      let cur = g.rotation.y;
      let d = faceRef.current - cur;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      g.rotation.y = cur + d * Math.min(1, dt * 5);
      // 체류 중엔 걷기 위상을 굴리지 않는다(distDelta=0) → 딴짓/가만히. 걸을 때만 다리 구른다.
      rigRef.current?.update?.(dt, 0.5, moving, _s.clock.elapsedTime, moving ? S.walkSpeed * dt : 0);
    }

    // 말풍선 갱신 (본토 극성: 수명 다하면 true)
    for (let i = bubbles.current.length - 1; i >= 0; i -= 1) {
      if (updateBubble(bubbles.current[i], dt)) { bubbleRoot.remove(bubbles.current[i].sprite); bubbles.current.splice(i, 1); }
    }
  });

  return (
    <>
      <ambientLight intensity={0.9} />
      <directionalLight position={[3, 6, 4]} intensity={0.7} />
    </>
  );
}
