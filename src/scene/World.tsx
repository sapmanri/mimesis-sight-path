import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import type { ObservationScene } from '../data/jeju';
import { buildWorld, createWalkerFigure, loadWalkerAsset, PALETTE } from '../engine/worldCore';
import { JEJU_SPEC, type WorldSpec } from '../engine/worldSpec';
import { createWalkerRig, type WalkerRig } from './walkerRig';
import { createTinker, type Tinker } from './tinker';

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
  const prevWalkerPos = useRef<THREE.Vector3 | null>(null);
  const wasMoving = useRef(false);

  useEffect(() => {
    let alive = true;
    loadWalkerAsset().then(({ group, animations }) => {
      if (!alive) return;
      walker.clear();
      walker.add(group);
      // BUILD 085: 스캐빈저 절차 보행 리그. 클립엔 보행이 없어 뼈를 직접 구동한다.
      rigRef.current = createWalkerRig(group, animations, spec.walker.timeScale);
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

    // ---- 여정 상태기 ----
    // 목적지가 바뀌면: 팅커가 먼저 날아간다. 사람은 팅커가 자리잡은 뒤에 출발한다.
    if (J.target !== activeIndex) {
      J.target = activeIndex;
      const targetPos = curvePosAt(activeIndex).add(new THREE.Vector3(0, 1.1, 0));
      const dist = Math.abs(activeIndex - charProgress.current);
      tinker.flyTo(targetPos, Math.min(1.9, 0.8 + dist * 0.3));
      if (J.phase === 'walk') {
        // 이미 걷는 중이면 멈추지 않는다 — 방향만 바꾼다
      } else {
        J.phase = 'scout';
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
        let targetSpeed = J.gait === 'run' ? 1.7 : 0.85;
        if (remainingWorld < 1.1) targetSpeed = Math.min(targetSpeed, 0.85); // 도착 전 감속
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
    const dir = ahead.clone().sub(pos).setY(0).normalize();

    // 이번 프레임 실제 이동 거리 → 보폭 동기 (발이 미끄러지지 않는다)
    const distDelta = prevWalkerPos.current ? pos.distanceTo(prevWalkerPos.current) : 0;
    prevWalkerPos.current = pos.clone();

    // ---- 걷는 사람 ----
    const speed01 = Math.min(1, Math.max(0, (charSpeed.current - 0.8) / 0.9));
    const rig = rigRef.current;
    if (rig) {
      rig.update(delta, speed01, moving, clock.elapsedTime, distDelta);
      // 도착: 기억 앞에 웅크려 들여다본다 (머무름이 깊은 장면에서만)
      if (wasMoving.current && !moving) {
        const scene = scenes[Math.round(charProgress.current)];
        if ((scene?.stillness ?? 0) >= 1.0) rig.playInspect();
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
    walker.rotation.y = Math.atan2(dir.x, dir.z);
    wasMoving.current = moving;

    // ---- 카메라 (BUILD 085): 휙휙 가지 않는다. 걷는 사람을 조용히 따라갈 뿐. ----
    const desired = pos
      .clone()
      .add(dir.clone().multiplyScalar(-3.4))
      .add(new THREE.Vector3(0, 2.0, 0));
    const lookTarget = walker.position
      .clone()
      .add(dir.clone().multiplyScalar(0.9))
      .add(new THREE.Vector3(0, 0.8, 0));

    camera.position.lerp(desired, 1 - Math.pow(0.12, delta));
    smoothLook.current.lerp(lookTarget, 1 - Math.pow(0.06, delta));
    camera.lookAt(smoothLook.current);

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
