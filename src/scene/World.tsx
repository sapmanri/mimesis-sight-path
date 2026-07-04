import { Float, Text } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import type { ObservationScene } from '../data/jeju';

type WorldProps = {
  scenes: ObservationScene[];
  activeIndex: number;
};

export function World({ scenes, activeIndex }: WorldProps) {
  const lightRef = useRef<THREE.Group>(null);
  const cameraTarget = scenes[activeIndex].position;
  const activePosition = useMemo(() => new THREE.Vector3(...cameraTarget), [cameraTarget]);
  const particlePoints = useMemo(() => buildMistPoints(), []);

  useFrame(({ camera, clock }, delta) => {
    const drift = Math.sin(clock.elapsedTime * 0.32) * 0.08;
    const desiredCamera = activePosition.clone().add(new THREE.Vector3(drift, 1.05, 3.25));
    camera.position.lerp(desiredCamera, 1 - Math.pow(0.025, delta));
    camera.lookAt(activePosition.x, activePosition.y + 0.03, activePosition.z - 0.24);

    if (lightRef.current) {
      const pulse = Math.sin(clock.elapsedTime * 2.8) * 0.035;
      lightRef.current.position.lerp(activePosition.clone().add(new THREE.Vector3(0.03, 0.55 + pulse, 0.16)), 1 - Math.pow(0.018, delta));
      lightRef.current.rotation.z += delta * 0.45;
    }
  });

  return (
    <>
      <color attach="background" args={["#78aaa6"]} />
      <fog attach="fog" args={["#8fbab0", 3.8, 16]} />
      <ambientLight intensity={1.85} />
      <directionalLight position={[2, 5, 3]} intensity={2.35} />
      <pointLight position={[0, 2.2, 1.8]} intensity={2.8} color="#fff4d1" />

      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.66, -16.8]}>
        <planeGeometry args={[5.6, 44]} />
        <meshStandardMaterial color="#e6decf" roughness={0.9} />
      </mesh>

      <points geometry={particlePoints}>
        <pointsMaterial color="#fff7df" size={0.025} transparent opacity={0.22} depthWrite={false} />
      </points>

      <SightTrail scenes={scenes} />

      {scenes.map((scene, index) => (
        <ObservationNode key={scene.id} scene={scene} active={index === activeIndex} index={index} />
      ))}

      <group ref={lightRef}>
        <mesh>
          <sphereGeometry args={[0.052, 32, 32]} />
          <meshBasicMaterial color="#fffdf2" />
        </mesh>
        <mesh>
          <sphereGeometry args={[0.15, 32, 32]} />
          <meshBasicMaterial color="#fff7d5" transparent opacity={0.18} />
        </mesh>
        <pointLight intensity={6} distance={2.4} color="#fff0bb" />
      </group>
    </>
  );
}

function ObservationNode({ scene, active, index }: { scene: ObservationScene; active: boolean; index: number }) {
  const isPrimary = index === 0 || index === 7 || index === 10 || index === 12;

  return (
    <group position={scene.position}>
      <Float speed={0.74} rotationIntensity={0.025} floatIntensity={0.07}>
        <group scale={active ? scene.scale * 1.04 : scene.scale * 0.82}>
          <mesh>
            <boxGeometry args={isPrimary ? [0.86, 0.9, 0.09] : [0.68, 0.68, 0.08]} />
            <meshStandardMaterial color={active ? '#f7efe0' : scene.hue} roughness={0.82} metalness={0.01} transparent opacity={active ? 1 : 0.58} />
          </mesh>
          <mesh position={[0.02, -0.04, -0.035]}>
            <boxGeometry args={isPrimary ? [0.88, 0.92, 0.04] : [0.7, 0.7, 0.035]} />
            <meshBasicMaterial color="#9aac9f" transparent opacity={0.13} />
          </mesh>
          <Text position={[0, 0, 0.095]} fontSize={isPrimary ? 0.25 : 0.22} anchorX="center" anchorY="middle">
            {scene.emoji}
            <meshBasicMaterial color="#243d3a" />
          </Text>
        </group>
      </Float>

      {active && (
        <Text position={[0, -0.62, 0.08]} fontSize={0.105} anchorX="center" anchorY="middle">
          {scene.title}
          <meshBasicMaterial color="#fff9ed" />
        </Text>
      )}
    </group>
  );
}

function SightTrail({ scenes }: { scenes: ObservationScene[] }) {
  const points = useMemo(() => scenes.map((scene) => new THREE.Vector3(...scene.position)), [scenes]);
  const curve = useMemo(() => new THREE.CatmullRomCurve3(points), [points]);
  const tube = useMemo(() => new THREE.TubeGeometry(curve, 190, 0.007, 8, false), [curve]);

  return (
    <mesh geometry={tube}>
      <meshBasicMaterial color="#fff4ca" transparent opacity={0.34} />
    </mesh>
  );
}

function buildMistPoints() {
  const geometry = new THREE.BufferGeometry();
  const positions: number[] = [];

  for (let i = 0; i < 90; i += 1) {
    const x = (Math.random() - 0.5) * 4.5;
    const y = Math.random() * 2.4 - 0.2;
    const z = -Math.random() * 34;
    positions.push(x, y, z);
  }

  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  return geometry;
}
