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
  const lightRef = useRef<THREE.Mesh>(null);
  const cameraTarget = scenes[activeIndex].position;
  const activePosition = useMemo(() => new THREE.Vector3(...cameraTarget), [cameraTarget]);

  useFrame(({ camera }, delta) => {
    const desiredCamera = activePosition.clone().add(new THREE.Vector3(0, 1.25, 4.8));
    camera.position.lerp(desiredCamera, 1 - Math.pow(0.03, delta));
    camera.lookAt(activePosition.x, activePosition.y, activePosition.z - 0.35);

    if (lightRef.current) {
      lightRef.current.position.lerp(activePosition.clone().add(new THREE.Vector3(0, 0.52, 0.08)), 1 - Math.pow(0.02, delta));
    }
  });

  return (
    <>
      <color attach="background" args={["#7aa6a4"]} />
      <fog attach="fog" args={["#7aa6a4", 7, 24]} />
      <ambientLight intensity={1.4} />
      <directionalLight position={[2, 5, 3]} intensity={2.2} />
      <pointLight position={[0, 2, 2]} intensity={2} color="#fff7d1" />

      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.58, -18]}>
        <planeGeometry args={[5, 48]} />
        <meshStandardMaterial color="#e8dcc7" roughness={0.86} />
      </mesh>

      <SightTrail scenes={scenes} />

      {scenes.map((scene, index) => (
        <ObservationNode
          key={scene.id}
          scene={scene}
          active={index === activeIndex}
        />
      ))}

      <mesh ref={lightRef}>
        <sphereGeometry args={[0.08, 32, 32]} />
        <meshBasicMaterial color="#fffdf2" />
        <pointLight intensity={5} distance={2.1} color="#fff0bb" />
      </mesh>
    </>
  );
}

function ObservationNode({ scene, active }: { scene: ObservationScene; active: boolean }) {
  return (
    <group position={scene.position}>
      <Float speed={1.2} rotationIntensity={0.08} floatIntensity={0.12}>
        <mesh scale={active ? 1.16 : 1}>
          <boxGeometry args={[0.78, 0.78, 0.08]} />
          <meshStandardMaterial
            color={active ? '#f4ead5' : '#d9cdb9'}
            roughness={0.72}
            metalness={0.02}
          />
        </mesh>
        <Text position={[0, 0, 0.08]} fontSize={0.26} anchorX="center" anchorY="middle">
          {scene.emoji}
          <meshBasicMaterial color="#31413e" />
        </Text>
      </Float>

      {active && (
        <Text position={[0, -0.62, 0.05]} fontSize={0.12} anchorX="center" anchorY="middle">
          {scene.title}
          <meshBasicMaterial color="#f7f2e8" />
        </Text>
      )}
    </group>
  );
}

function SightTrail({ scenes }: { scenes: ObservationScene[] }) {
  const points = useMemo(() => scenes.map((scene) => new THREE.Vector3(...scene.position)), [scenes]);
  const curve = useMemo(() => new THREE.CatmullRomCurve3(points), [points]);
  const tube = useMemo(() => new THREE.TubeGeometry(curve, 160, 0.012, 8, false), [curve]);

  return (
    <mesh geometry={tube}>
      <meshBasicMaterial color="#fff4ca" transparent opacity={0.52} />
    </mesh>
  );
}
