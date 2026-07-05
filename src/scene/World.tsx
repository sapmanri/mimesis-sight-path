import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import type { ObservationScene } from '../data/jeju';
import { buildWorld, createWalkerFigure, loadWalkerAsset, PALETTE } from '../engine/worldCore';
import { JEJU_SPEC, type WorldSpec } from '../engine/worldSpec';
import { createWalkerRig, type WalkerRig } from './walkerRig';

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
  const walkProgress = useRef(activeIndex);
  const wasMoving = useRef(false);
  const { gl } = useThree();

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
    // 천천히 걷는다. 서두르지 않는다.
    const walkSpeed = mode === 'auto' ? 0.085 : 0.07;
    const distance = activeIndex - walkProgress.current;
    const moving = Math.abs(distance) > 0.001;
    if (moving) {
      walkProgress.current += Math.sign(distance) * Math.min(Math.abs(distance), walkSpeed * delta * 10);
    }

    const t = world.progressToT(walkProgress.current);
    const pos = world.curve.getPoint(t);
    const aheadT = Math.min(1, t + 0.06);
    const ahead = world.curve.getPoint(aheadT);
    const dir = ahead.clone().sub(pos).setY(0).normalize();

    // ---- 걷는 사람 (BUILD 085: 절차 보행 — 느리면 걷고, 멀면 뛴다) ----
    const speed01 = Math.min(1, Math.max(0, (Math.abs(distance) - 0.6) / 2.4));
    const rig = rigRef.current;
    if (rig) {
      rig.update(delta, speed01, moving, clock.elapsedTime);
      // 도착: 기억 앞에 웅크려 들여다본다 (머무름이 깊은 장면에서만)
      if (wasMoving.current && !moving) {
        const scene = scenes[Math.round(walkProgress.current)];
        if ((scene?.stillness ?? 0) >= 1.0) rig.playInspect();
      }
      if (!wasMoving.current && moving) rig.stopInspect();
      const bob = moving && !rig.inspecting() ? Math.abs(Math.sin(rig.phase())) * (0.014 + speed01 * 0.012) : 0;
      walker.position.copy(pos).add(new THREE.Vector3(0, bob, 0));
      walker.rotation.z = 0;
    } else {
      // 폴백 실루엣: 절차적 걸음
      if (moving) walkPhase.current += delta * 4.6;
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
    </>
  );
}
