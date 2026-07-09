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

// 지면 곡선의 '월드 높이' — 별리 발이 이 값을 탄다. scrollU는 근경과 같은 속도로 흐른다.
function groundHeight(worldX: number, scrollU: number, l: TheatreLayer): number {
  const u = worldX * 0.6 + scrollU; // 완만한 오르내림 (길폭 정도)
  return ridge(u, l) * l.amp * 3.4; // 월드 유닛 스케일
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
  const footRef = useRef<THREE.Object3D | null>(null);
  const layerMats = useRef<{ mat: THREE.MeshBasicMaterial; speed: number }[]>([]);
  const scrollRef = useRef(0);
  const bubbleRoot = useMemo(() => new THREE.Group(), []);
  const bubbles = useRef<Bubble[]>([]);
  const groundLayerRef = useRef<TheatreLayer>(spec.near);

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
    groundLayerRef.current = S.near;

    if (!stage.parent) scene.add(stage);
    if (!bubbleRoot.parent) scene.add(bubbleRoot);
    return () => { stage.clear(); };
  }, [scene, stage, bubbleRoot, spec.skyTop, spec.skyBottom, spec.far, spec.mid, spec.near]);

  // 별리 로드 — 행성과 같은 파이프라인. clipRig면 걷기 클립을 자동 재생.
  useEffect(() => {
    let alive = true;
    rigRef.current = null;
    if (walkerGroupRef.current) { stage.remove(walkerGroupRef.current); walkerGroupRef.current = null; }
    void loadWalkerAsset(undefined, walkerIdx < 0 ? 'random' : walkerIdx).then(({ group, animations, clipSpeeds }) => {
      if (!alive) return;
      // 옆면 무대: 별리가 왼쪽을 보고 걷도록 살짝 돌린다 (진행=화면 왼쪽)
      group.rotation.y = -Math.PI / 2;
      group.position.set(0, 0, 0);
      stage.add(group);
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
    if (!pausedRef.current) scrollRef.current += S.walkSpeed * dt;
    const scroll = scrollRef.current;

    // 레이어 U-스크롤 — 근경이 빠르고 원경이 느리다 (패럴럭스)
    for (const L of layerMats.current) {
      if (L.mat.map) L.mat.map.offset.x = scroll * L.speed * 0.06;
    }

    // 별리 — X 고정, Y만 지면 곡선을 부드럽게 탄다
    const g = walkerGroupRef.current;
    if (g) {
      const gy = groundHeight(0, scroll, groundLayerRef.current);
      g.position.y += (gy - g.position.y) * Math.min(1, dt * 6); // 스프링 추적
      rigRef.current?.update?.(dt, 0.5, !pausedRef.current, _s.clock.elapsedTime, S.walkSpeed * dt);
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
