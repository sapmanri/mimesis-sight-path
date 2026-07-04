import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import type { ObservationScene } from '../data/jeju';
import { buildWorld, PALETTE } from '../engine/worldCore';

type WorldProps = {
  scenes: ObservationScene[];
  activeIndex: number;
  mode: 'auto' | 'manual';
};

// 걷는 시간이 주인공이다.
// 카메라는 걷는 사람의 눈이 아니라, 그를 조용히 따라가는 시선이다.
export function World({ scenes, activeIndex, mode }: WorldProps) {
  const world = useMemo(() => buildWorld(scenes), [scenes]);
  const walkProgress = useRef(activeIndex);
  const { gl } = useThree();

  useEffect(() => {
    gl.shadowMap.enabled = true;
    gl.shadowMap.type = THREE.PCFSoftShadowMap;
    gl.toneMapping = THREE.ACESFilmicToneMapping;
    gl.toneMappingExposure = 1.0;
  }, [gl]);

  useFrame(({ camera }, delta) => {
    const walkSpeed = mode === 'auto' ? 0.12 : 0.08;
    const distance = activeIndex - walkProgress.current;
    if (Math.abs(distance) > 0.001) {
      walkProgress.current += Math.sign(distance) * Math.min(Math.abs(distance), walkSpeed * delta * 10);
    }

    const t = world.progressToT(walkProgress.current);
    const walker = world.curve.getPoint(t);
    const aheadT = Math.min(1, t + 0.06);
    const ahead = world.curve.getPoint(aheadT);
    const dir = ahead.clone().sub(walker).setY(0).normalize();
    const sideDrift = Math.sin(walkProgress.current * 0.72) * 0.3;
    const nor = new THREE.Vector3(-dir.z, 0, dir.x);

    const desired = walker
      .clone()
      .add(dir.clone().multiplyScalar(-5.0))
      .add(nor.clone().multiplyScalar(sideDrift))
      .add(new THREE.Vector3(0, 3.1, 0));
    const target = walker
      .clone()
      .add(dir.clone().multiplyScalar(5.2))
      .add(new THREE.Vector3(0, -0.75, 0));

    camera.position.lerp(desired, 1 - Math.pow(0.045, delta));
    camera.lookAt(target.x, target.y, target.z);

    // 태양은 걷는 사람을 따라간다 (그림자 카메라가 항상 근처를 비추도록)
    world.sun.position.copy(walker).add(new THREE.Vector3(6, 11, 5));
    world.sun.target.position.copy(walker);
  });

  return (
    <>
      <color attach="background" args={[PALETTE.fog]} />
      <fog attach="fog" args={[PALETTE.fog, 12, 58]} />
      <primitive object={world.group} />
    </>
  );
}
