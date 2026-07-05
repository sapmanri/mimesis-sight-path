import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import type { ObservationScene } from '../data/jeju';
import { buildWorld, createWalkerFigure, loadWalkerAsset, PALETTE } from '../engine/worldCore';
import { JEJU_SPEC, type WorldSpec } from '../engine/worldSpec';
import { createClipRig, createWalkerRig, type WalkerRig } from './walkerRig';
import { createTinker, type Tinker } from './tinker';
import { guardShot, SHOT_RECIPES, type GuardParams } from './cameraGuard';

// BUILD 090: 액자 수호 규칙 값 — 에디터 Camera 패널 노출 예정
const ZERO_VEL = new THREE.Vector3();
const GUARD_PARAMS: GuardParams = {
  safeX: 0.55, safeY: 0.68, maxDist: 13, minDist: 1.9, panRate: 2.4, moveRate: 1.1, leadTime: 0.55,
};

type WorldProps = {
  scenes: ObservationScene[];
  activeIndex: number;
  mode: 'auto' | 'manual';
  /** BUILD 082: 세계 명세. 생략 시 제주 프리셋. */
  spec?: WorldSpec;
};

// 걷는 시간이 주인공이다.
// 카메라는 걷는 사람의 눈이 아니라, 그를 조용히 따라가는 시선이다.
export function World({ scenes, activeIndex, mode, spec = JEJU_SPEC }: WorldProps) {
  const world = useMemo(() => buildWorld(scenes, undefined, spec), [scenes, spec]);
  // 워커: 프로시저럴 실루엣으로 시작, Peasant 로드 완료 시 교체
  const walker = useMemo(() => {
    const holder = new THREE.Group();
    holder.add(createWalkerFigure());
    return holder;
  }, []);
  const rigRef = useRef<WalkerRig | null>(null);
  const { gl } = useThree();

  // ---- BUILD 086: 캐릭터 주권 ----
  // 캐릭터는 카메라에 떠밀려 다니지 않는다. 자기 속도로 걷고, 자기 보폭으로 딛는다.
  // 팅커가 먼저 날아가 기억 앞에서 맴돌면, 사람이 뒤따라 걷고, 카메라는 그를 따라갈 뿐.
  const tinker = useMemo<Tinker>(() => {
    const start = world.curve.getPoint(world.progressToT(activeIndex)).add(new THREE.Vector3(0.4, 1.3, 0));
    return createTinker(start);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [world]);
  const journey = useRef({
    target: activeIndex,       // 지금 향하는 장면
    phase: 'idle' as 'idle' | 'scout' | 'walk', // 팅커 정찰 → 사람 보행 → 머무름
    gait: 'walk' as 'walk' | 'run',
    gaitSwitchAt: -1,          // 이 progress를 지나면 걷기↔뛰기 전환 ("가끔은 걷다가 뛰다가")
  });
  const charProgress = useRef(activeIndex); // 캐릭터의 현재 위치 (장면 단위 진행도)
  const charSpeed = useRef(0);              // 현재 속도 (월드 유닛/초)
  const charYaw = useRef(0);                // BUILD 087: 몸의 방향 — 스냅하지 않고 돌아선다
  const lastTargetChange = useRef(0);       // BUILD 087: 연타 감지 (마우스 휙휙 → 뛴다)
  const prevWalkerPos = useRef<THREE.Vector3 | null>(null);
  const faceVelocity = useRef(new THREE.Vector3()); // BUILD 090: 가드 리드용 속도 벡터
  const wasMoving = useRef(false);
  // BUILD 088: 관조 카메라의 현재 구도 (여정마다 새로 잡고, 잡은 뒤엔 잠근다)
  const shot = useRef<{ pos: THREE.Vector3; look: THREE.Vector3 } | null>(null);

  useEffect(() => {
    let alive = true;
    loadWalkerAsset().then(({ group, animations, clipSpeeds }) => {
      if (!alive) return;
      walker.clear();
      walker.add(group);
      // BUILD 091: 보행 클립이 있으면 클립 리그 (미끄러짐 최종 해법: 속도-배속 동기).
      // 없으면 BUILD 085 절차 보행으로 폴백 (스캐빈저 등).
      rigRef.current = (clipSpeeds ? createClipRig(group, animations, clipSpeeds) : null)
        ?? createWalkerRig(group, animations, spec.walker.timeScale);
    }).catch(() => { /* 실패 시 프로시저럴 실루엣 유지 */ });
    return () => { alive = false; };
  }, [walker, spec]);

  useEffect(() => {
    gl.shadowMap.enabled = true;
    gl.shadowMap.type = THREE.PCFSoftShadowMap;
    gl.toneMapping = THREE.ACESFilmicToneMapping;
    gl.toneMappingExposure = 1.0;
  }, [gl]);

  const walkPhase = useRef(0);
  const smoothLook = useRef(new THREE.Vector3(0, 0.8, 0));

  useFrame(({ camera, clock }, delta) => {
    const J = journey.current;
    const curvePosAt = (prog: number) => world.curve.getPoint(world.progressToT(prog));

    // BUILD 088: 첫 구도 — 여정이 시작되기 전에도 시선은 이미 자리를 잡고 있다
    if (spec.camera.mode === 'held' && !shot.current) {
      const a0 = curvePosAt(charProgress.current);
      const b0 = curvePosAt(Math.min(scenes.length - 1, charProgress.current + 1));
      const mid0 = a0.clone().lerp(b0, 0.55);
      const t0 = world.progressToT(charProgress.current + 0.5);
      const tan0 = world.curve.getTangent(t0).setY(0).normalize();
      const nor0 = new THREE.Vector3(-tan0.z, 0, tan0.x);
      const d0 = spec.camera.baseDist + a0.distanceTo(b0) * spec.camera.fitGain;
      shot.current = {
        pos: mid0.clone().add(nor0.multiplyScalar(d0 * 0.82)).add(tan0.multiplyScalar(-d0 * 0.4)).add(new THREE.Vector3(0, spec.camera.height + 0.7, 0)),
        look: mid0.clone().add(new THREE.Vector3(0, 0.45, 0)),
      };
    }

    // ---- 여정 상태기 ----
    // 목적지가 바뀌면: 팅커가 먼저 날아간다. 사람은 팅커가 자리잡은 뒤에 출발한다.
    if (J.target !== activeIndex) {
      J.target = activeIndex;
      const targetPos = curvePosAt(activeIndex).add(new THREE.Vector3(0, 1.1, 0));
      const dist = Math.abs(activeIndex - charProgress.current);
      tinker.flyTo(targetPos, Math.min(1.9, 0.8 + dist * 0.3));
      // BUILD 087: 마우스를 휙휙 넘기면 — 뛴다. 조급함은 몸이 먼저 안다.
      const now = clock.elapsedTime;
      const rapid = now - lastTargetChange.current < 1.6;
      lastTargetChange.current = now;
      if (rapid) {
        J.gait = 'run';
        J.gaitSwitchAt = -999;
        J.phase = 'walk'; // 정찰을 기다리지 않고 바로 출발
      } else if (J.phase !== 'walk') {
        J.phase = 'scout';
      }
      // BUILD 090: 새 여정 = 새 구도. 구도 사전에서 뽑는다 — 옆면, 마중, 부감... 다양함이 핵심.
      // 인물 이탈은 프레임 가드가 매 프레임 막아주므로, 구도는 마음껏 대담해도 된다.
      if (spec.camera.mode === 'held') {
        const a = curvePosAt(charProgress.current);
        const bPos = curvePosAt(activeIndex);
        const mid = a.clone().lerp(bPos, 0.55);
        const segLen = a.distanceTo(bPos);
        const midT = world.progressToT((charProgress.current + activeIndex) / 2);
        const mtan = world.curve.getTangent(midT).setY(0).normalize();
        const mnor = new THREE.Vector3(-mtan.z, 0, mtan.x);
        const travel = Math.sign(activeIndex - charProgress.current) || 1;
        const dist = Math.min(11, Math.max(4.5, spec.camera.baseDist + segLen * spec.camera.fitGain));
        const recipe = SHOT_RECIPES[Math.floor(Math.random() * SHOT_RECIPES.length)];
        const sideSign = Math.random() > 0.5 ? 1 : -1; // 왼쪽 옆면, 오른쪽 옆면도 번갈아
        // 시선은 인물과 여정 중점 사이 — 인물을 품은 채 태어나는 구도
        shot.current = {
          pos: mid.clone()
            .add(mnor.clone().multiplyScalar(sideSign * dist * recipe.nor))
            .add(mtan.clone().multiplyScalar(travel * dist * recipe.tan))
            .add(new THREE.Vector3(0, spec.camera.height * (0.4 + recipe.lift) + segLen * recipe.hBoost, 0)),
          look: a.clone().lerp(mid, 0.4).add(new THREE.Vector3(0, 0.45, 0)),
        };
        // BUILD 090: 사전 정착 — 구도가 화면에 나가기 전에 가드를 미리 돌려
        // 인물이 처음부터 액자 안에 있도록 다듬는다 (첫 프레임 이탈 방지)
        {
          const cam3 = camera as THREE.PerspectiveCamera;
          const chestNow = walker.position.clone().add(new THREE.Vector3(0, 0.5, 0));
          for (let i = 0; i < 40; i += 1) {
            guardShot(shot.current, chestNow, ZERO_VEL, cam3.fov, cam3.aspect, 0.05, GUARD_PARAMS);
          }
        }
      }
    }
    if (J.phase === 'scout' && tinker.state() === 'hover') {
      // 팅커가 자리잡았다 — 이제 사람이 걷는다. 걸을지 뛸지는 그날의 기분.
      const dist = Math.abs(J.target - charProgress.current);
      J.gait = dist > 1.4 || Math.random() < 0.22 ? 'run' : 'walk';
      // 긴 길은 중간에 한 번 걸음을 바꾼다 — 걷다가 뛰다가
      J.gaitSwitchAt = dist > 0.9 && Math.random() < 0.55
        ? charProgress.current + Math.sign(J.target - charProgress.current) * dist * (0.35 + Math.random() * 0.3)
        : -999;
      J.phase = 'walk';
    }
    tinker.update(delta, clock.elapsedTime);

    // ---- 캐릭터: 자기 속도로 걷는다 ----
    const remaining = J.target - charProgress.current;
    let moving = false;
    if (J.phase === 'walk') {
      if (Math.abs(remaining) < 0.004) {
        charProgress.current = J.target;
        charSpeed.current = 0;
        J.phase = 'idle';
      } else {
        moving = true;
        // 걸음 전환 지점 통과 체크
        if (J.gaitSwitchAt > -900 && Math.sign(remaining) * (charProgress.current - J.gaitSwitchAt) > 0) {
          J.gait = J.gait === 'walk' ? 'run' : 'walk';
          J.gaitSwitchAt = -999;
        }
        // 목표 속도 (월드 유닛/초): 걷기 0.85, 뛰기 1.7 — 신장 0.9 캐릭터의 보폭 0.42u × 초당 2보
        // 도착 앞에서는 걸음으로 줄인다
        const t0 = world.progressToT(charProgress.current);
        const p0 = world.curve.getPoint(t0);
        const t1 = world.progressToT(charProgress.current + Math.sign(remaining) * 0.01);
        const dWdP = Math.max(0.05, world.curve.getPoint(t1).distanceTo(p0) / 0.01); // 월드거리/진행도
        const remainingWorld = Math.abs(remaining) * dWdP;
        let targetSpeed = J.gait === 'run' ? spec.walker.runSpeed : spec.walker.walkSpeed;
        if (remainingWorld < 1.1) targetSpeed = Math.min(targetSpeed, spec.walker.walkSpeed); // 도착 전 감속
        charSpeed.current += (targetSpeed - charSpeed.current) * Math.min(1, delta * 2.6);
        const stepProg = (charSpeed.current * delta) / dWdP;
        charProgress.current += Math.sign(remaining) * Math.min(Math.abs(remaining), stepProg);
      }
    } else {
      charSpeed.current = 0;
    }

    const t = world.progressToT(charProgress.current);
    const pos = world.curve.getPoint(t);
    const aheadT = Math.min(1, t + 0.06);
    const ahead = world.curve.getPoint(aheadT);
    const tangent = ahead.clone().sub(pos).setY(0).normalize();
    // BUILD 087: 몸은 '가는 방향'을 본다. 돌아올 때는 돌아서서 걷는다 — 뒷걸음질 금지.
    const facing = moving ? Math.sign(remaining) || 1 : (Math.abs(charYaw.current) > Math.PI / 2 ? -1 : 1);
    const dir = tangent.clone().multiplyScalar(moving ? facing : 1);
    if (moving) {
      const targetYaw = Math.atan2(tangent.x * facing, tangent.z * facing);
      let dYaw = targetYaw - charYaw.current;
      while (dYaw > Math.PI) dYaw -= Math.PI * 2;
      while (dYaw < -Math.PI) dYaw += Math.PI * 2;
      charYaw.current += dYaw * Math.min(1, delta * 5.5); // ~0.35초에 돌아선다
    }

    // 이번 프레임 실제 이동 거리 → 보폭 동기 (발이 미끄러지지 않는다)
    const distDelta = prevWalkerPos.current ? pos.distanceTo(prevWalkerPos.current) : 0;
    if (prevWalkerPos.current && delta > 0) {
      faceVelocity.current.copy(pos).sub(prevWalkerPos.current).divideScalar(delta);
    }
    prevWalkerPos.current = pos.clone();

    // ---- 걷는 사람 ----
    const speed01 = Math.min(1, Math.max(0, (charSpeed.current - 0.8) / 0.9));
    const rig = rigRef.current;
    if (rig) {
      rig.update(delta, speed01, moving, clock.elapsedTime, distDelta);
      // 도착: 기억 앞에 웅크려 들여다본다 (머무름이 깊은 장면에서만)
      if (wasMoving.current && !moving) {
        const scene = scenes[Math.round(charProgress.current)];
        const st = scene?.stillness ?? 0;
        // BUILD 091: 깊은 머무름에선 바닥에 앉아 바라본다. 그 밖에선 들여다본다.
        if (st >= 1.3) rig.playInspect('sit');
        else if (st >= 0.65) rig.playInspect('pickup');
      }
      if (!wasMoving.current && moving) rig.stopInspect();
      const bob = moving && !rig.inspecting() ? Math.abs(Math.sin(rig.phase())) * (0.012 + speed01 * 0.014) : 0;
      walker.position.copy(pos).add(new THREE.Vector3(0, bob, 0));
      walker.rotation.z = 0;
    } else {
      // 폴백 실루엣: 절차적 걸음
      if (moving) walkPhase.current += (distDelta / 0.36) * Math.PI;
      const bob = moving ? Math.abs(Math.sin(walkPhase.current)) * 0.016 : 0;
      const sway = moving ? Math.sin(walkPhase.current) * 0.035 : 0;
      const breathe = Math.sin(clock.elapsedTime * 1.4) * 0.004;
      walker.position.copy(pos).add(new THREE.Vector3(0, bob + breathe, 0));
      walker.rotation.z = sway;
    }
    walker.rotation.y = charYaw.current;
    wasMoving.current = moving;

    // ---- 카메라 ----
    if (spec.camera.mode === 'held' && shot.current) {
      // BUILD 088: 관조 카메라 — 구도는 잠기고, 사람이 그 속을 걸어간다.
      // BUILD 090: 프레임 가드 — 단, 사람이 액자를 벗어나려 하면 구도가 따라 고쳐진다.
      const chest = walker.position.clone().add(new THREE.Vector3(0, 0.5, 0));
      const vel = faceVelocity.current; // 이번 프레임 계산된 이동 속도 벡터
      const cam3 = camera as THREE.PerspectiveCamera;
      guardShot(shot.current, chest, vel, cam3.fov, cam3.aspect, delta, GUARD_PARAMS);
      const e = clock.elapsedTime;
      const D = spec.camera.drift;
      const desired = shot.current.pos.clone().add(new THREE.Vector3(
        Math.sin(e * 0.23) * D, Math.sin(e * 0.31 + 1.2) * D * 0.6, Math.cos(e * 0.19) * D,
      ));
      const k = 1 - Math.pow(0.002, delta / spec.camera.reframeSec);
      camera.position.lerp(desired, k);
      smoothLook.current.lerp(shot.current.look, k);
      camera.lookAt(smoothLook.current);
    } else {
      // follow 모드 (BUILD 087): 몸이 향한 곳의 등 뒤에서 조용히 따라간다
      const faceDir = new THREE.Vector3(Math.sin(charYaw.current), 0, Math.cos(charYaw.current));
      const desired = pos
        .clone()
        .add(faceDir.clone().multiplyScalar(-3.4))
        .add(new THREE.Vector3(0, 2.0, 0));
      const lookTarget = walker.position
        .clone()
        .add(faceDir.clone().multiplyScalar(0.9))
        .add(new THREE.Vector3(0, 0.8, 0));
      camera.position.lerp(desired, 1 - Math.pow(0.12, delta));
      smoothLook.current.lerp(lookTarget, 1 - Math.pow(0.06, delta));
      camera.lookAt(smoothLook.current);
    }

    // 태양은 걷는 사람을 따라간다 (그림자 카메라가 항상 근처를 비추도록)
    world.sun.position.copy(pos).add(new THREE.Vector3(6, 11, 5));
    world.sun.target.position.copy(pos);
  });

  return (
    <>
      <color attach="background" args={[PALETTE.fog]} />
      <fog attach="fog" args={[PALETTE.fog, 12, 58]} />
      <primitive object={world.group} />
      <primitive object={walker} />
      <primitive object={tinker.group} />
      <primitive object={tinker.trail} />
    </>
  );
}
