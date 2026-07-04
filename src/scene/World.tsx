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

  useFrame(({ camera, clock }, delta) => {
    const desiredCamera = activePosition.clone().add(new THREE.Vector3(0, 1.05, 3.25));
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
      <fog attach="fog" args={["#88b7ad", 4.5, 18]} />
      <ambientLight intensity={1.8} />
      <directionalLight position={[2, 5, 3]} intensity={2.4} />
      <pointLight position={[0, 2.2, 1.8]} intensity={2.8} color="#fff4d1" />

      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.66, -18]}>
        <planeGeometry args={[5.4, 48]} />
        <meshStandardMaterial color="#e6decf" roughness={0.9} />
      </mesh>

      <SightTrail scenes={scenes} />

      {scenes.map((scene, index) => (
        <ObservationNode key={scene.id} scene={scene} active={index === activeIndex} />
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

function ObservationNode({ scene, active }: { scene: ObservationScene; active: boolean }) {
  return (
    <group position={scene.position}>
      <Float speed={0.82} rotationIntensity={0.035} floatIntensity={0.09}>
        <mesh scale={active ? 1.2 : 0.9}>
          <boxGeometry args={[0.72, 0.72, 0.08]} />
          <meshStandardMaterial color={active ? '#f5eddc' : '#d2c8b8'} roughness={0.8} metalness={0.01} />
        </mesh>
        <Text position={[0, 0, 0.09]} fontSize={0.25} anchorX="center" anchorY="middle">
          {scene.emoji}
          <meshBasicMaterial color="#243d3a" />
        </Text>
      </Float>

      {active && (
        <Text position={[0, -0.58, 0.08]} fontSize={0.105} anchorX="center" anchorY="middle">
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
  const tube = useMemo(() => new THREE.TubeGeometry(curve, 180, 0.008, 8, false), [curve]);

  return (
    <mesh geometry={tube}>
      <meshBasicMaterial color="#fff4ca" transparent opacity={0.38} />
    </mesh>
  );
}
