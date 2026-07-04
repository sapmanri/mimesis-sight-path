import { Float, Text } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import type { ObservationScene } from '../data/jeju';
import { MemoryObject } from '../components/MemoryObject';
import { createSceneScatter, type ScatterItem } from '../engine/scatter';
import { pathSegmentPresets, surfaceColor, weatherFog } from '../engine/pathPresets';

type WorldProps = {
  scenes: ObservationScene[];
  activeIndex: number;
  mode: 'auto' | 'manual';
};

export function World({ scenes, activeIndex, mode }: WorldProps) {
  const lightRef = useRef<THREE.Group>(null);
  const activeScene = scenes[activeIndex];
  const activePosition = useMemo(() => new THREE.Vector3(...activeScene.position), [activeScene.position]);
  const particlePoints = useMemo(() => buildMistPoints(), []);
  const fog = weatherFog[activeScene.weather];

  useFrame(({ camera, clock }, delta) => {
    const director = getCameraDirector(activeIndex, clock.elapsedTime, mode);
    const desiredCamera = activePosition.clone().add(director.offset);
    const lookAt = activePosition.clone().add(director.lookOffset);

    camera.position.lerp(desiredCamera, 1 - Math.pow(mode === 'auto' ? 0.022 : 0.032, delta));
    camera.lookAt(lookAt.x, lookAt.y, lookAt.z);

    if (lightRef.current) {
      const pulse = Math.sin(clock.elapsedTime * 2.8) * 0.035;
      const lead = director.lightLead;
      lightRef.current.position.lerp(activePosition.clone().add(new THREE.Vector3(lead.x, 0.55 + pulse, lead.z)), 1 - Math.pow(0.018, delta));
      lightRef.current.rotation.z += delta * 0.45;
    }
  });

  return (
    <>
      <color attach="background" args={[fog.color]} />
      <fog attach="fog" args={[fog.color, fog.near, fog.far]} />
      <ambientLight intensity={1.88} />
      <directionalLight position={[2, 5, 3]} intensity={2.35} />
      <pointLight position={[0, 2.2, 1.8]} intensity={2.8} color="#fff4d1" />

      <NarrativePath scenes={scenes} activeIndex={activeIndex} />

      <points geometry={particlePoints}>
        <pointsMaterial color="#fff7df" size={0.025} transparent opacity={0.22} depthWrite={false} />
      </points>

      <SightTrail scenes={scenes} />

      {scenes.map((scene, index) => (
        <SceneScatter key={`scatter-${scene.id}`} scene={scene} index={index} activeIndex={activeIndex} />
      ))}

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

function getCameraDirector(activeIndex: number, elapsed: number, mode: 'auto' | 'manual') {
  const breathe = Math.sin(elapsed * 0.38) * (mode === 'auto' ? 0.12 : 0.06);
  const glance = Math.sin(elapsed * 0.17 + activeIndex) * 0.1;
  const shot = activeIndex % 6;

  if (shot === 0) {
    return {
      offset: new THREE.Vector3(-0.78 + glance, 1.18 + breathe, 3.08),
      lookOffset: new THREE.Vector3(0.08, 0.04, -0.48),
      lightLead: { x: 0.06, z: 0.18 },
    };
  }

  if (shot === 1) {
    return {
      offset: new THREE.Vector3(0.82 + glance, 0.92 + breathe, 2.78),
      lookOffset: new THREE.Vector3(-0.12, 0.01, -0.38),
      lightLead: { x: -0.02, z: 0.18 },
    };
  }

  if (shot === 2) {
    return {
      offset: new THREE.Vector3(0.08 + glance, 2.15 + breathe, 1.74),
      lookOffset: new THREE.Vector3(0, -0.18, -0.24),
      lightLead: { x: 0.03, z: 0.16 },
    };
  }

  if (shot === 3) {
    return {
      offset: new THREE.Vector3(-0.1 + glance, 0.7 + breathe, 2.18),
      lookOffset: new THREE.Vector3(0.02, 0.02, -0.76),
      lightLead: { x: 0.08, z: 0.22 },
    };
  }

  if (shot === 4) {
    return {
      offset: new THREE.Vector3(1.05 + glance, 1.04 + breathe, 2.95),
      lookOffset: new THREE.Vector3(-0.22, 0.06, -0.4),
      lightLead: { x: -0.06, z: 0.2 },
    };
  }

  return {
    offset: new THREE.Vector3(-1.02 + glance, 0.98 + breathe, 2.88),
    lookOffset: new THREE.Vector3(0.2, 0.02, -0.34),
    lightLead: { x: 0.06, z: 0.16 },
  };
}

function NarrativePath({ scenes, activeIndex }: { scenes: ObservationScene[]; activeIndex: number }) {
  const slabs = useMemo(() => buildPathSlabs(scenes), [scenes]);

  return (
    <group>
      {slabs.map((slab, index) => {
        const opacity = Math.max(0.3, 0.92 - Math.abs(index - activeIndex) * 0.11);
        return (
          <group key={index} position={slab.position} rotation={[0, slab.angle, 0]}>
            <mesh rotation={[-Math.PI / 2, 0, 0]}>
              <boxGeometry args={[slab.width, slab.length, 0.035]} />
              <meshStandardMaterial color={slab.color} roughness={0.94} transparent opacity={opacity} />
            </mesh>
            <mesh position={[0, -0.012, 0]} rotation={[-Math.PI / 2, 0, 0]}>
              <boxGeometry args={[slab.width * 0.96, slab.length * 0.96, 0.018]} />
              <meshBasicMaterial color="#fff4df" transparent opacity={0.08} />
            </mesh>
          </group>
        );
      })}
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

function SceneScatter({ scene, index, activeIndex }: { scene: ObservationScene; index: number; activeIndex: number }) {
  const items = useMemo(() => createSceneScatter(scene, index), [scene, index]);
  const distance = Math.abs(index - activeIndex);
  const opacityMultiplier = Math.max(0.18, 1 - distance * 0.22);

  return (
    <group>
      {items.map((item) => (
        <ScatterMesh key={item.id} item={item} opacityMultiplier={opacityMultiplier} />
      ))}
    </group>
  );
}

function ScatterMesh({ item, opacityMultiplier }: { item: ScatterItem; opacityMultiplier: number }) {
  const elongated = item.kind.includes('handle') || item.kind.includes('line') || item.kind.includes('track') || item.kind.includes('strip');
  const round = item.kind.includes('fruit') || item.kind.includes('seed') || item.kind.includes('stone') || item.kind.includes('glint');

  return (
    <mesh position={item.position} rotation={[-Math.PI / 2, 0, item.rotation]} scale={item.scale}>
      {round ? <circleGeometry args={[1, 18]} /> : <boxGeometry args={elongated ? [2.4, 0.35, 0.08] : [1, 0.72, 0.08]} />}
      <meshBasicMaterial color={item.color} transparent opacity={item.opacity * opacityMultiplier} />
    </mesh>
  );
}

function ObservationNode({ scene, active, index, activeIndex }: { scene: ObservationScene; active: boolean; index: number; activeIndex: number }) {
  const distance = Math.abs(index - activeIndex);
  const focusOpacity = Math.max(0.14, 1 - distance * 0.28);
  const focusScale = active ? scene.scale * 1.05 : scene.scale * Math.max(0.64, 0.86 - distance * 0.04);

  return (
    <group position={scene.position}>
      <Float speed={0.62} rotationIntensity={0.018} floatIntensity={0.045}>
        <group scale={focusScale}>
          <MemoryObject scene={scene} active={active} opacity={active ? 1 : focusOpacity} />
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
    const preset = pathSegmentPresets[scene.pathKind];
    const length = Math.max(1.2, Math.sqrt(direction.x * direction.x + direction.z * direction.z) + 0.42);
    const angle = Math.atan2(direction.x, direction.z) + preset.curve * 0.08 * (index % 2 === 0 ? 1 : -1);
    const width = preset.width;

    return {
      position: [midpoint.x, -0.64, midpoint.z] as [number, number, number],
      angle,
      length,
      width,
      color: surfaceColor[scene.surface],
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
