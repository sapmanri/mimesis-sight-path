import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import type { ObservationScene } from '../data/jeju';
import { buildWorld, createWalkerFigure, PALETTE } from '../engine/worldCore';

type WorldProps = {
  scenes: ObservationScene[];
  activeIndex: number;
  mode: 'auto' | 'manual';
};

// 걷는 시간이 주인공이다.
// 카메라는 걷는 사람의 눈이 아니라, 그를 조용히 따라가는 시선이다.
export function World({ scenes, activeIndex, mode }: WorldProps) {
  const world = useMemo(() => buildWorld(scenes), [scenes]);
  const walker = useMemo(() => createWalkerFigure(), []);
  const walkProgress = useRef(activeIndex);
  const { gl } = useThree();

  useEffect(() => {
    gl.shadowMap.enabled = true;
    gl.shadowMap.type = THREE.PCFSoftShadowMap;
    gl.toneMapping = THREE.ACESFilmicToneMapping;
    gl.toneMappingExposure = 1.0;
  }, [gl]);

  const walkPhase = useRef(0);

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
    const nor = new THREE.Vector3(-dir.z, 0, dir.x);

    // ---- 걷는 사람 ----
    if (moving) walkPhase.current += delta * 4.6;
    const bob = moving ? Math.abs(Math.sin(walkPhase.current)) * 0.016 : 0;
    const sway = moving ? Math.sin(walkPhase.current) * 0.035 : 0;
    const breathe = Math.sin(clock.elapsedTime * 1.4) * 0.004;
    walker.position.copy(pos).add(new THREE.Vector3(0, bob + breathe, 0));
    walker.rotation.y = Math.atan2(dir.x, dir.z);
    walker.rotation.z = sway;

    // ---- 카메라: 걷는 사람의 등을 조용히 따라간다 ----
    const sideDrift = Math.sin(walkProgress.current * 0.72) * 0.15;
    const desired = pos
      .clone()
      .add(dir.clone().multiplyScalar(-3.4))
      .add(nor.clone().multiplyScalar(sideDrift))
      .add(new THREE.Vector3(0, 2.0, 0));
    const lookAt = walker.position
      .clone()
      .add(dir.clone().multiplyScalar(2.6))
      .add(new THREE.Vector3(0, 0.15, 0));

    camera.position.lerp(desired, 1 - Math.pow(0.045, delta));
    camera.lookAt(lookAt.x, lookAt.y, lookAt.z);

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
