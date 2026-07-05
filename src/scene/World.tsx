import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import type { ObservationScene } from '../data/jeju';
import { buildWorld, createWalkerFigure, loadWalkerAsset, PALETTE } from '../engine/worldCore';
import { JEJU_SPEC, type WorldSpec } from '../engine/worldSpec';

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
  const mixerRef = useRef<THREE.AnimationMixer | null>(null);
  const actionsRef = useRef<{ walk?: THREE.AnimationAction; idle?: THREE.AnimationAction }>({});
  const walkProgress = useRef(activeIndex);
  const { gl } = useThree();

  useEffect(() => {
    let alive = true;
    loadWalkerAsset().then(({ group, animations }) => {
      if (!alive) return;
      walker.clear();
      walker.add(group);
      const mixer = new THREE.AnimationMixer(group);
      mixerRef.current = mixer;
      const walkClip = animations.find((a) => /walk/i.test(a.name));
      const idleClip = animations.find((a) => /idle/i.test(a.name));
      if (walkClip) {
        const walk = mixer.clipAction(walkClip);
        walk.timeScale = spec.walker.timeScale; // 천천히 걷는다
        actionsRef.current.walk = walk;
      }
      if (idleClip) {
        const idle = mixer.clipAction(idleClip);
        idle.play();
        actionsRef.current.idle = idle;
      }
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
    const mixer = mixerRef.current;
    const acts = actionsRef.current;
    if (mixer) {
      // 실물 워커: 애니메이션 클립으로 걷는다
      if (acts.walk && acts.idle) {
        if (moving && !acts.walk.isRunning()) {
          acts.walk.reset().fadeIn(0.35).play();
          acts.idle.fadeOut(0.35);
        } else if (!moving && acts.walk.isRunning()) {
          acts.walk.fadeOut(0.5);
          acts.idle.reset().fadeIn(0.5).play();
        }
      }
      mixer.update(delta);
      walker.position.copy(pos);
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
