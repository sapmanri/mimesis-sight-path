// ---------- 별이 — 소환형 독립 캐릭터 코어 ----------
// 별이는 독립체다. 어느 맵(동네/행성/지역/새 맵)이든 이 컴포넌트를 소환해서 쓴다.
// 별이가 한 몸에 지니는 것: rig(별 glb + 걷기/앉기/탈것 클립) · brain(이동·무드·스테이지·촬영 타이밍)
//   · stageModule(눕기/피아노/춤/운동/러닝머신) · 말풍선 · 발소리 · capture · (곧) 빼콩이.
// 맵이 주입하는 것: 별을 담을 parent · 발 높이(feetY) · 걸을 때 이동 실행(onMove) · 룩(tint) ·
//   이벤트/촬영 콜백. 좌표계(1D스크롤/구면/패스)는 맵이 소유 — 별이는 좌표를 만지지 않는다.
//
// 관찰자 원칙: 별은 카메라(관객)를 모른다. 자기 삶을 산다.
//
// ※ 이번 단계는 파일 물리 이동 없이 scene/의 공용 조각을 import해 조립만 한다.

import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef, type MutableRefObject } from 'react';
import * as THREE from 'three';
import { loadWalkerAsset } from '../engine/worldCore';
import { createClipRig, createWalkerRig, type WalkerRig } from '../scene/walkerRig';
import { makeStage, type Stage } from '../scene/stageModule';
import { makeByeoliBrain, type ByeoliBrain } from '../scene/byeoliBrain';
import { footsteps } from '../scene/footsteps';
import { ambience } from '../audio/ambience';
import { makeBubble, updateBubble, type Bubble } from '../scene/speech';

// 별이가 매 프레임 맵에게 넘기는 "지금 상태" — 맵은 이걸로 자기 좌표계 이동을 실행한다.
export type ByeoliMoveInfo = {
  moving: boolean;   // brain이 낸 진행 신호(걷는 중인가)
  dt: number;
  elapsed: number;
  inStage: boolean;  // 스테이지 세션 중(눕기·연주…)인가 — 맵이 배경 정지 등에 참고
};

// 맵이 별이에게 주입하는 host.
export type ByeoliHost = {
  // 무대
  parent: () => THREE.Object3D | null;   // 별을 담을 그룹(맵의 무대 그룹). null이면 아직 준비 안 됨.
  feetY: () => number;                    // 별 발이 서는 기준 높이(맵 좌표)
  groundAt?: (elapsed: number) => number; // feetY에 더할 지면 곡선(없으면 0). 동네=groundHeight, 행성=곡면.
  walkerIdx: number;
  paused?: () => boolean;

  // 룩
  tint?: () => THREE.Color | null;        // 밤톤 곱셈 틴트(동네). null이면 원색.
  stripHeightFog?: () => boolean;         // 별 material의 height fog를 벗길지(fog 없는 맵=true)

  // 이동 — 별이가 걸을 때 맵이 자기 방식으로 실행(배경스크롤/패스이동/표면로밍)
  onMove?: (info: ByeoliMoveInfo) => void;
  // 이번 프레임 보폭 거리(월드 유닛) — rig 다리 위상이 여기서 굴러간다. 동네=walkSpeed*dt.
  //   moving일 때만 유효. 없으면 소폭 기본값.
  walkStride?: (dt: number) => number;

  // 방향 — 맵마다 '바라보는 법'이 다르다(옆면 고정 vs 진행방향). 없으면 기본(옆면 무대) 로직.
  //   반환: 목표 yaw(rad). 별이는 이 각으로 부드럽게 돈다.
  faceYaw?: (ctx: { moving: boolean; wasWalking: boolean; nowWalking: boolean; inStage: boolean; dt: number; cur: number }) => number;

  // brain 튜닝(맵 spec에서)
  lingerEvery?: () => number;
  lingerLength?: () => number;
  stageChance?: () => number;
  stageIds?: () => string[];

  // 콜백 — App으로
  onEvent?: (kind: string, data?: Record<string, unknown>) => void;      // stage_play 등 → 여권/기록
  onCapture?: (dataUrl: string, reason: 'stage' | 'mood' | 'event') => void; // 별이 찍은 순간 → R2+기록

  // 캡처 방식 — 맵이 자기 gl/scene/camera로 찍어 dataUrl 반환(없으면 촬영 생략)
  grabFrame?: () => string | null;

  // 외부(App)에서 씬 캡처를 부를 수 있게 훅 노출(성취 트리거 등)
  captureRef?: MutableRefObject<(() => string | null) | null>;
};

type Props = { host: ByeoliHost };

// 별이 코어. 맵의 <Canvas> 안에서 <Byeoli host={...} /> 로 소환.
export function Byeoli({ host }: Props) {
  const { scene, camera, gl } = useThree();
  const hostRef = useRef(host); hostRef.current = host;

  const rigRef = useRef<WalkerRig | null>(null);
  const walkerGroupRef = useRef<THREE.Group | null>(null); // 별 root(회전 대상)
  const walkerMountRef = useRef<THREE.Group | null>(null);  // 오르내림 래퍼(맵이 y를 얹음)
  const footRef = useRef<THREE.Object3D | null>(null);

  const brainRef = useRef<ByeoliBrain | null>(null);
  const stageRef = useRef<Stage | null>(null);
  const lastStageIdRef = useRef<string | null>(null);
  const faceRef = useRef(-Math.PI / 2);

  const bubbleRoot = useMemo(() => new THREE.Group(), []);
  const bubbles = useRef<Bubble[]>([]);

  // ---- 별이 자기 화면 촬영: 맵이 grabFrame을 주면 그걸, 아니면 기본(gl.render→toDataURL) ----
  const grab = (): string | null => {
    const h = hostRef.current;
    if (h.grabFrame) return h.grabFrame();
    try { gl.render(scene, camera); return gl.domElement.toDataURL('image/jpeg', 0.6); }
    catch { return null; }
  };

  // 외부(App) 캡처 훅 노출
  useEffect(() => {
    const ref = hostRef.current.captureRef;
    if (!ref) return undefined;
    ref.current = () => grab();
    return () => { if (ref) ref.current = null; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- 별이 로드 (행성/동네와 같은 파이프라인). clipRig면 걷기 클립 자동 재생 ----
  useEffect(() => {
    let alive = true;
    const h = hostRef.current;
    const parent = h.parent();
    if (!parent) return undefined;
    rigRef.current = null;
    if (walkerMountRef.current) { walkerMountRef.current.parent?.remove(walkerMountRef.current); walkerMountRef.current = null; walkerGroupRef.current = null; }
    void loadWalkerAsset(undefined, h.walkerIdx < 0 ? 'random' : h.walkerIdx).then(({ group, animations, clipSpeeds }) => {
      if (!alive) return;
      group.rotation.y = -Math.PI / 2;
      group.position.set(0, 0, 0);
      // 룩: height fog 스트립 + 밤톤 곱(맵이 지정할 때만)
      const strip = h.stripHeightFog?.() ?? false;
      const tint = h.tint?.() ?? null;
      if (strip || tint) {
        group.traverse((n) => {
          const mesh = n as THREE.Mesh;
          if (!mesh.isMesh) return;
          const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
          mats.forEach((m) => {
            const std = m as THREE.MeshStandardMaterial;
            if (strip && std.userData?.hfog) {
              std.onBeforeCompile = () => {};
              std.customProgramCacheKey = () => `nofog|${mesh.id}`;
              std.userData.hfog = false;
            }
            if (tint && std.color) std.color.multiply(tint);
            std.needsUpdate = true;
          });
        });
      }
      const mount = new THREE.Group();
      mount.add(group);
      parent.add(mount);
      walkerMountRef.current = mount;
      walkerGroupRef.current = group;
      footRef.current = null;
      group.traverse((n) => { if (!footRef.current && /left.*foot$/i.test(n.name)) footRef.current = n; });
      if (!footRef.current) group.traverse((n) => { if (!footRef.current && /foot$/i.test(n.name)) footRef.current = n; });
      rigRef.current = (clipSpeeds ? createClipRig(group, animations, clipSpeeds, footsteps.step) : null)
        ?? createWalkerRig(group, animations, 0.72);
    }).catch(() => { /* 조용한 무대 */ });
    return () => { alive = false; };
  // 맵 parent와 walkerIdx가 바뀌면 재로드
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [host.walkerIdx]);

  // ---- 말풍선(웅얼웅얼) ----
  const speak = (icon?: string, pitch = 1) => {
    const g = walkerGroupRef.current;
    if (!g || bubbles.current.length >= 2) return;
    const b = makeBubble(g, 1.15, icon);
    bubbles.current.push(b);
    bubbleRoot.add(b.sprite);
    ambience.mumble?.(pitch);
  };
  const speakRef = useRef(speak); speakRef.current = speak;

  // ---- brain + stage 생성(한 번) ----
  useEffect(() => {
    const parent = hostRef.current.parent();
    if (!parent) return undefined;
    if (!bubbleRoot.parent) parent.add(bubbleRoot);
    const st = makeStage(parent);
    // 프롭 있는 레시피 프리로드
    st.preload('dance'); st.preload('sleep'); st.preload('piano'); st.preload('treadmill');
    stageRef.current = st;
    brainRef.current = makeByeoliBrain({
      rig: () => rigRef.current,
      stageMount: () => walkerMountRef.current,
      stage: () => stageRef.current,
      speak: (icon, pitch) => speakRef.current(icon, pitch),
      lingerEvery: () => Math.max(0, hostRef.current.lingerEvery?.() ?? 3),
      lingerLength: () => Math.max(0.2, hostRef.current.lingerLength?.() ?? 1),
      stageChance: hostRef.current.stageChance ? () => hostRef.current.stageChance!() : undefined,
      stageIds: () => hostRef.current.stageIds?.() ?? ['dance', 'sleep', 'piano', 'workout', 'treadmill'],
      capture: (reason) => {
        const cb = hostRef.current.onCapture;
        if (!cb) return;
        const url = grab();
        if (url) cb(url, reason);
      },
    });
    return () => {
      st.dispose(); stageRef.current = null; brainRef.current = null;
      if (bubbleRoot.parent) bubbleRoot.parent.remove(bubbleRoot);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- 매 프레임 ----
  useFrame((_s, rawDt) => {
    const dt = Math.min(0.05, rawDt);
    const h = hostRef.current;
    const paused = h.paused?.() ?? false;

    const brain = brainRef.current;
    const wasWalking = brain?.phase() === 'walk';
    const res = brain ? brain.update(dt, paused) : { moving: !paused };
    const moving = res.moving;
    const nowWalking = brain?.phase() === 'walk';
    const inStage = stageRef.current?.isActive?.() ?? false;

    // 방향 — 맵이 faceYaw를 주면 그걸, 아니면 기본(옆면 무대: 별은 관객을 의식 않음)
    if (h.faceYaw) {
      faceRef.current = h.faceYaw({ moving, wasWalking, nowWalking, inStage, dt, cur: faceRef.current });
    } else {
      if (inStage) faceRef.current = -Math.PI / 2;
      else if (moving) faceRef.current = -Math.PI / 2;
      else if (wasWalking && !nowWalking) faceRef.current = -Math.PI / 2 + (Math.random() - 0.5) * 1.0;
      else if (Math.random() < dt * 0.4) {
        const r = Math.random();
        faceRef.current = r < 0.5 ? -Math.PI / 2 + (Math.random() - 0.5) * 1.4
          : r < 0.7 ? -Math.PI / 2 - 0.8 - Math.random() * 0.8
          : r < 0.85 ? -Math.PI / 2 + 0.8 + Math.random() * 0.8
          : (Math.random() - 0.5) * 6;
      }
    }

    // 맵에게 이동 신호 — 맵이 배경 스크롤/패스 이동/표면 로밍을 자기 방식으로 실행
    h.onMove?.({ moving, dt, elapsed: _s.clock.elapsedTime, inStage });

    // 별 발 높이 — 맵이 준 feetY + 지면곡선. 오르내림은 래퍼(mount)에 얹는다.
    const mnt = walkerMountRef.current;
    if (mnt) {
      const gy = h.feetY() + (h.groundAt?.(_s.clock.elapsedTime) ?? 0);
      mnt.position.y += (gy - mnt.position.y) * Math.min(1, dt * 4);
    }

    // 회전 + rig 갱신
    const g = walkerGroupRef.current;
    if (g) {
      let cur = g.rotation.y;
      let d = faceRef.current - cur;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      g.rotation.y = cur + d * Math.min(1, dt * 5);
      // 다리 위상은 '실제 이동 거리'로 굴린다(발이 땅을 밀어야 몸이 간다). 맵이 보폭을 준다.
      const stride = moving ? (h.walkStride?.(dt) ?? 0.02) : 0;
      rigRef.current?.update?.(dt, 0.5, moving, _s.clock.elapsedTime, stride);
    }

    // 스테이지 세션 진행
    stageRef.current?.update(dt, _s.clock.elapsedTime);

    // 스테이지 시작 감지 → 이벤트 1회 emit
    const curStageId = stageRef.current?.currentId?.() ?? null;
    if (curStageId && curStageId !== lastStageIdRef.current) {
      h.onEvent?.('stage_play', { stage: curStageId });
    }
    lastStageIdRef.current = curStageId;

    // 말풍선 갱신
    for (let i = bubbles.current.length - 1; i >= 0; i -= 1) {
      if (updateBubble(bubbles.current[i], dt)) { bubbleRoot.remove(bubbles.current[i].sprite); bubbles.current.splice(i, 1); }
    }
  });

  return null; // 별이는 씬 그래프에 직접 붙는다(parent). JSX 렌더 요소 없음.
}
