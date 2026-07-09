// ---------- BUILD 285: TheatreWorld — 그림자 극장(페러럴) ----------
// 옆면 고정 카메라. 별리는 X 고정, Y만 지면 곡선을 타고 오르내리며 제자리 걷기.
// 근/중/원경 실루엣 판때기가 서로 다른 속도로 흐른다 — 패럴럭스가 깊이를 만든다.
// 공유 코어: loadWalkerAsset · createClipRig(별리) · speech · ambience (행성/본토와 같은 자산).

import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { loadWalkerAsset } from '../engine/worldCore';
import { createClipRig, createWalkerRig, type WalkerRig } from './walkerRig';
import { makeStage, type Stage } from './stageModule';
import { makeByeoliBrain, type ByeoliBrain } from './byeoliBrain';
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
// BUILD 298: 하이브리드 — 고해상도(픽셀계단✘) + 부드러운 능선 + 나무·풀 실루엣 + 수채 톤.
function bakeLayer(l: TheatreLayer, opts: { trees?: number; grass?: number } = {}): THREE.CanvasTexture {
  const W = 2048, H = 512;
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const g = cv.getContext('2d')!;
  g.clearRect(0, 0, W, H);
  // 능선 높이 함수(캔버스 x → 지면 top)
  const topAt = (x: number) => {
    const u = (x / W) * Math.PI * 2;
    return H * (1 - l.baseY) - ridge(u, l) * l.amp * H;
  };
  // 언덕 면 — 위(능선)는 밝게, 아래는 살짝 어둡게(수채 그라디언트)
  const grad = g.createLinearGradient(0, H * (1 - l.baseY) - l.amp * H, 0, H);
  grad.addColorStop(0, l.color);
  grad.addColorStop(1, shade(l.color, -0.12));
  g.fillStyle = grad;
  g.beginPath();
  g.moveTo(0, H);
  const N = 512;
  for (let i = 0; i <= N; i += 1) { const x = (i / N) * W; g.lineTo(x, topAt(x)); }
  g.lineTo(W, H);
  g.closePath();
  g.fill();

  // 나무 실루엣 — 능선 위에 드문드문. 색은 언덕보다 살짝 진하게.
  const treeN = opts.trees ?? 0;
  if (treeN > 0) {
    g.fillStyle = shade(l.color, -0.18);
    for (let i = 0; i < treeN; i += 1) {
      const x = (i + 0.35 + Math.sin(i * 12.9) * 0.3) * (W / treeN);
      const gy = topAt(x);
      const th = 26 + ((i * 37) % 22); // 높이 변주
      // 둥근 활엽수 실루엣
      g.beginPath();
      g.moveTo(x - 2, gy);
      g.lineTo(x - 2, gy - th * 0.5);
      g.lineTo(x + 2, gy - th * 0.5);
      g.lineTo(x + 2, gy);
      g.fill();
      g.beginPath();
      g.ellipse(x, gy - th * 0.7, th * 0.42, th * 0.5, 0, 0, Math.PI * 2);
      g.fill();
    }
  }
  // 풀 — 능선 라인에 짧은 삐침
  const grassN = opts.grass ?? 0;
  if (grassN > 0) {
    g.strokeStyle = shade(l.color, -0.2); g.lineWidth = 2; g.lineCap = 'round';
    for (let i = 0; i < grassN; i += 1) {
      const x = (i + 0.5) * (W / grassN) + Math.sin(i * 7.3) * 8;
      const gy = topAt(x);
      const h = 6 + ((i * 13) % 8);
      g.beginPath(); g.moveTo(x, gy); g.lineTo(x + (i % 2 ? 2 : -2), gy - h); g.stroke();
    }
  }

  const tex = new THREE.CanvasTexture(cv);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.anisotropy = 4;
  return tex;
}

// 색을 밝게(+)/어둡게(-) — 수채 그라디언트·나무 음영용
function shade(hex: string, amt: number): string {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
  const f = (v: number) => Math.max(0, Math.min(255, Math.round(v + v * amt)));
  return `rgb(${f(r)},${f(g)},${f(b)})`;
}

// BUILD 293: 밋밋한 회색 스피커 상자에 '스피커 얼굴'을 그려 입힌다 — 원본 모델엔 콘·그물이 없다.
//   빈티지 우드톤 + 콘 2개(우퍼/트위터) + 그물 점무늬. 네 세계의 아날로그 감성.
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
  // BUILD 296: 별리 행동은 공용 brain에 위임. 동네는 걷는 방식(배경 스크롤)만 소유.
  const brainRef = useRef<ByeoliBrain | null>(null);
  // BUILD 289: 바라보는 방향 — 걸을 땐 왼쪽(-π/2) 고정, 놀 땐 정면 쪽으로 자유롭게.
  const faceRef = useRef(-Math.PI / 2);
  // BUILD 294: 스테이지 모듈 — 폽 세션(춤/캠프/운동…) 공용 엔진. 무대는 앵커만 넘긴다.
  const stageRef = useRef<Stage | null>(null);
  const bubbleRoot = useMemo(() => new THREE.Group(), []);
  const bubbles = useRef<Bubble[]>([]);

  // 옆면 고정 카메라 — 정면(+Z)에서 무대를 바라본다. 캐릭터는 원점 부근.
  useEffect(() => {
    camera.position.set(0, 1.6, 6.2);
    camera.lookAt(0, 1.4, 0);
    (camera as THREE.PerspectiveCamera).fov = 40;
    (camera as THREE.PerspectiveCamera).updateProjectionMatrix();
    scene.fog = null;
  }, [camera, scene]);

  // BUILD 301: 진짜 숲 배경 이미지 레이어로 패럴럭스 (The Forest Background 팩, 심리스).
  useEffect(() => {
    stage.clear();
    layerMats.current = [];
    const loader = new THREE.TextureLoader();
    const mkLayer = (file: string, z: number, h: number, speed: number, yOff: number) => {
      const tex = loader.load(`/assets/theatre/${file}`);
      tex.wrapS = THREE.RepeatWrapping;
      tex.wrapT = THREE.ClampToEdgeWrapping;
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.minFilter = THREE.LinearFilter;
      tex.magFilter = THREE.LinearFilter;
      const aspect = 1920 / 1080;
      const w = h * aspect;
      const repeatX = 3; // 화면보다 넓게 타일 → 심리스 무한 스크롤
      tex.repeat.set(repeatX, 1);
      const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, fog: false });
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w * repeatX, h), mat);
      m.position.set(0, yOff, z);
      stage.add(m);
      layerMats.current.push({ mat, speed });
    };
    // 뒤(원경, 느림) → 앞(근경, 빠름). h=세로 월드높이, yOff=상하 위치.
    // BUILD 303: 기차 배경 — 별리는 철길(이미지 y≈1050) 위에 선다. 배경을 그 지점이 발밑(y0)에 오게 내린다.
    //   이미지 1920×1073, 철길 y1050 → 아래에서 2.1%. mesh 중심 yOff = h×(0.5 - 1050/1073) = h×-0.478.
    const IMG_W = 1920, IMG_H = 1073, GROUND_PX = 1050;
    const mkTrain = (file: string, z: number, h: number, speed: number) => {
      const tex = loader.load(`/assets/theatre/${file}`);
      tex.wrapS = THREE.RepeatWrapping; tex.wrapT = THREE.ClampToEdgeWrapping;
      tex.colorSpace = THREE.SRGBColorSpace; tex.minFilter = THREE.LinearFilter; tex.magFilter = THREE.LinearFilter;
      const w = h * (IMG_W / IMG_H);
      const repeatX = 4;
      tex.repeat.set(repeatX, 1);
      const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, fog: false });
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w * repeatX, h), mat);
      const yOff = h * (GROUND_PX / IMG_H - 0.5); // 철길이 월드 y0에 오도록 (배경은 위로)
      m.position.set(0, yOff, z);
      stage.add(m);
      layerMats.current.push({ mat, speed });
    };
    const H = 9; // 배경 세로 월드높이(별리 키에 맞춤)
    mkTrain('train_far.png', -12, H, 0.15);   // 원경: 하늘·달·성·먼숲 (느림)
    mkTrain('train_near.png', -6, H, 0.5);     // 근경: 가까운 숲 + 철길
    mkTrain('train_posts.png', -4, H, 0.7);    // 전신주·케이블
    mkTrain('train_cars.png', -3, H, 0.9);     // 기차 (철길 위)

    if (!stage.parent) scene.add(stage);
    if (!bubbleRoot.parent) scene.add(bubbleRoot);
    return () => { stage.clear(); };
  }, [scene, stage, bubbleRoot]);

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

  // BUILD 294/296: 스테이지 + 별리 brain 생성(한 번). brain이 노는 법을, 무대는 걷는 법을.
  useEffect(() => {
    const st = makeStage(stage);
    st.preload('dance');
    stageRef.current = st;
    brainRef.current = makeByeoliBrain({
      rig: () => rigRef.current,
      stageMount: () => walkerMountRef.current,
      stage: () => stageRef.current,
      speak: (icon, pitch) => speakRef.current(icon, pitch),
      lingerEvery: () => Math.max(0, specRef.current.lingerEvery ?? 3),
      lingerLength: () => Math.max(0.2, specRef.current.lingerLength ?? 1),
    });
    return () => { st.dispose(); stageRef.current = null; brainRef.current = null; };
  }, [stage]);

  // 웅얼웅얼 (행성과 동일) — brain이 speakRef로 지연 호출
  const speak = (icon?: string, pitch = 1) => {
    const g = walkerGroupRef.current;
    if (!g || bubbles.current.length >= 2) return;
    const b = makeBubble(g, 1.15, icon);
    bubbles.current.push(b);
    bubbleRoot.add(b.sprite);
    ambience.mumble?.(pitch);
  };
  const speakRef = useRef(speak); speakRef.current = speak;

  useFrame((_s, rawDt) => {
    const dt = Math.min(0.05, rawDt);
    const S = specRef.current;

    // BUILD 296: 노는 법은 brain(공용)이 결정. 무대는 걷는 법(배경 스크롤)만 실행.
    const brain = brainRef.current;
    const wasWalking = brain?.phase() === 'walk';
    const res = brain ? brain.update(dt, !!pausedRef.current) : { moving: !pausedRef.current };
    const moving = res.moving;
    const nowWalking = brain?.phase() === 'walk';

    // 동네 옆면 무대의 방향 — 별리는 관찰자(카메라)를 모른다. 자기 삶을 살 뿐.
    //   걸을 땐 진행방향(왼쪽). 놀 땐 그 언저리에서 자연스럽게 흔들린다 —
    //   뭔가 보거나 두리번거리다 우연히 이쪽/저쪽. 관객 정면을 '의식해서' 보지 않는다.
    if (moving) {
      faceRef.current = -Math.PI / 2;
    } else if (wasWalking && !nowWalking) {
      // 방금 멈춤 — 진행방향 언저리에서 살짝 튼다(관객 쪽 아님)
      faceRef.current = -Math.PI / 2 + (Math.random() - 0.5) * 1.0;
    } else if (Math.random() < dt * 0.4) {
      // 놀다가 가끔 방향 전환 — 진행방향(-π/2)을 중심으로 폭넓게. 정면(0)·뒤(π)도 어쩌다.
      const r = Math.random();
      faceRef.current = r < 0.5 ? -Math.PI / 2 + (Math.random() - 0.5) * 1.4 // 대개 옆 언저리
        : r < 0.7 ? -Math.PI / 2 - 0.8 - Math.random() * 0.8 // 뒤쪽으로
        : r < 0.85 ? -Math.PI / 2 + 0.8 + Math.random() * 0.8 // 앞쪽으로
        : (Math.random() - 0.5) * 6; // 어쩌다 완전 자유(정면·뒤통수 포함)
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

    // BUILD 294: 스테이지 세션 진행 — 모션 이어가기·오브젝트 폽·심볼·사운드를 엔진이 관리
    stageRef.current?.update(dt, _s.clock.elapsedTime);

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
