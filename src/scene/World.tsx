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
    const drift = Math.sin(clock.elapsedTime * 0.32) * 0.06;
    const desiredCamera = activePosition.clone().add(new THREE.Vector3(drift, 1.02, 3.1));
    camera.position.lerp(desiredCamera, 1 - Math.pow(0.026, delta));
    camera.lookAt(activePosition.x, activePosition.y + 0.02, activePosition.z - 0.36);

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
      <ambientLight intensity={1.88} />
      <directionalLight position={[2, 5, 3]} intensity={2.35} />
      <pointLight position={[0, 2.2, 1.8]} intensity={2.8} color="#fff4d1" />

      <NarrativePath scenes={scenes} />

      <points geometry={particlePoints}>
        <pointsMaterial color="#fff7df" size={0.025} transparent opacity={0.22} depthWrite={false} />
      </points>

      <SightTrail scenes={scenes} />

      {scenes.map((scene, index) => (
        <ObservationNode key={scene.id} scene={scene} active={index === activeIndex} index={index} activeIndex={activeIndex} />
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

function NarrativePath({ scenes }: { scenes: ObservationScene[] }) {
  const slabs = useMemo(() => buildPathSlabs(scenes), [scenes]);

  return (
    <group>
      {slabs.map((slab, index) => (
        <group key={index} position={slab.position} rotation={[0, slab.angle, 0]}>
          <mesh rotation={[-Math.PI / 2, 0, 0]}>
            <boxGeometry args={[slab.width, slab.length, 0.035]} />
            <meshStandardMaterial color={index % 2 === 0 ? '#e6decf' : '#ddd3c1'} roughness={0.94} transparent opacity={0.92} />
          </mesh>
          <mesh position={[0, -0.012, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <boxGeometry args={[slab.width * 0.96, slab.length * 0.96, 0.018]} />
            <meshBasicMaterial color="#fff4df" transparent opacity={0.08} />
          </mesh>
        </group>
      ))}
      {scenes.map((scene, index) => (
        <PathDetail key={scene.id} scene={scene} index={index} />
      ))}
    </group>
  );
}

function PathDetail({ scene, index }: { scene: ObservationScene; index: number }) {
  const side = index % 2 === 0 ? -1 : 1;
  const near = index === 0 || index === 5 || index === 7 || index === 12;

  return (
    <group position={[scene.position[0] + side * 0.58, -0.61, scene.position[2] + 0.15]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[near ? 0.16 : 0.1, 28]} />
        <meshBasicMaterial color="#fff7df" transparent opacity={near ? 0.18 : 0.1} />
      </mesh>
      <mesh position={[side * 0.12, 0.01, -0.06]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[near ? 0.045 : 0.032, 12]} />
        <meshBasicMaterial color="#486a62" transparent opacity={0.2} />
      </mesh>
    </group>
  );
}

function ObservationNode({ scene, active, index, activeIndex }: { scene: ObservationScene; active: boolean; index: number; activeIndex: number }) {
  const isPrimary = index === 0 || index === 7 || index === 10 || index === 12;
  const distance = Math.abs(index - activeIndex);
  const focusOpacity = Math.max(0.14, 1 - distance * 0.28);
  const focusScale = active ? scene.scale * 1.05 : scene.scale * Math.max(0.64, 0.86 - distance * 0.04);

  return (
    <group position={scene.position}>
      <Float speed={0.62} rotationIntensity={0.018} floatIntensity={0.045}>
        <group scale={focusScale}>
          <mesh>
            <boxGeometry args={isPrimary ? [0.86, 0.9, 0.09] : [0.68, 0.68, 0.08]} />
            <meshStandardMaterial color={active ? '#f8f1e3' : scene.hue} roughness={0.86} metalness={0.01} transparent opacity={active ? 1 : focusOpacity} />
          </mesh>
          <mesh position={[0.02, -0.04, -0.035]}>
            <boxGeometry args={isPrimary ? [0.88, 0.92, 0.04] : [0.7, 0.7, 0.035]} />
            <meshBasicMaterial color="#9aac9f" transparent opacity={active ? 0.14 : 0.07} />
          </mesh>
          <Text position={[0, 0, 0.095]} fontSize={isPrimary ? 0.25 : 0.22} anchorX="center" anchorY="middle">
            {scene.emoji}
            <meshBasicMaterial color="#243d3a" transparent opacity={active ? 1 : Math.max(0.18, focusOpacity)} />
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
  const tube = useMemo(() => new THREE.TubeGeometry(curve, 190, 0.006, 8, false), [curve]);

  return (
    <mesh geometry={tube}>
      <meshBasicMaterial color="#fff4ca" transparent opacity={0.26} />
    </mesh>
  );
}

function buildPathSlabs(scenes: ObservationScene[]) {
  return scenes.slice(0, -1).map((scene, index) => {
    const current = new THREE.Vector3(...scene.position);
    const next = new THREE.Vector3(...scenes[index + 1].position);
    const midpoint = current.clone().lerp(next, 0.5);
    const direction = next.clone().sub(current);
    const length = Math.max(1.2, Math.sqrt(direction.x * direction.x + direction.z * direction.z) + 0.42);
    const angle = Math.atan2(direction.x, direction.z);
    const width = index % 3 === 0 ? 1.34 : index % 3 === 1 ? 1.05 : 1.18;

    return {
      position: [midpoint.x, -0.64, midpoint.z] as [number, number, number],
      angle,
      length,
      width,
    };
  });
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
