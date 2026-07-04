import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import type { ObservationScene } from '../data/jeju';
import { LightCreature } from '../components/LightCreature';
import { PathEnvironment } from '../components/PathEnvironment';
import { weatherFog } from '../engine/pathPresets';

type WorldProps = {
  scenes: ObservationScene[];
  activeIndex: number;
  mode: 'auto' | 'manual';
};

type RoadPiece = {
  geometry: THREE.BufferGeometry;
  edgeLeft: THREE.TubeGeometry;
  edgeRight: THREE.TubeGeometry;
  center: THREE.Vector3;
  index: number;
};

type Pebble = {
  id: string;
  position: [number, number, number];
  scale: [number, number, number];
  rotation: [number, number, number];
  color: string;
  opacity: number;
};

export function World({ scenes, activeIndex, mode }: WorldProps) {
  const lightRef = useRef<THREE.Group>(null);
  const activeScene = scenes[activeIndex];
  const activePosition = useMemo(() => new THREE.Vector3(...activeScene.position), [activeScene.position]);
  const roadPieces = useMemo(() => buildRoadPieces(scenes), [scenes]);
  const pebbles = useMemo(() => buildPebbles(scenes), [scenes]);
  const mist = useMemo(() => buildMistPoints(), []);
  const fog = weatherFog[activeScene.weather];

  useFrame(({ camera, clock }, delta) => {
    const breathe = Math.sin(clock.elapsedTime * 0.32) * (mode === 'auto' ? 0.18 : 0.08);
    const sideLook = Math.sin(clock.elapsedTime * 0.18 + activeIndex * 0.7) * 0.28;
    const desired = activePosition.clone().add(new THREE.Vector3(sideLook, 1.32 + breathe, 4.2));
    const target = activePosition.clone().add(new THREE.Vector3(0, -0.42, -1.5));

    camera.position.lerp(desired, 1 - Math.pow(0.026, delta));
    camera.lookAt(target.x, target.y, target.z);

    if (lightRef.current) {
      const bob = Math.sin(clock.elapsedTime * 2.4) * 0.04;
      lightRef.current.position.lerp(activePosition.clone().add(new THREE.Vector3(0.08, 0.42 + bob, -0.62)), 1 - Math.pow(0.018, delta));
      lightRef.current.rotation.y = Math.sin(clock.elapsedTime * 0.8) * 0.28;
      lightRef.current.rotation.z = Math.sin(clock.elapsedTime * 1.7) * 0.16;
    }
  });

  return (
    <>
      <color attach="background" args={['transparent']} />
      <fog attach="fog" args={[fog.color, fog.near * 0.8, fog.far * 1.25]} />
      <ambientLight intensity={1.74} />
      <directionalLight position={[-2.2, 4.5, 3.5]} intensity={2.5} color="#fff3cf" />
      <pointLight position={[0, 1.4, 0.8]} intensity={2.2} color="#fff5ca" />

      <mesh position={[0, -0.82, -16]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[8.5, 42, 1, 1]} />
        <meshStandardMaterial color="#8eb2a7" roughness={1} transparent opacity={0.22} />
      </mesh>

      <MeshRoad pieces={roadPieces} activeIndex={activeIndex} />
      <RoadPebbles pebbles={pebbles} activeIndex={activeIndex} scenes={scenes} />
      <PathEnvironment scenes={scenes} activeIndex={activeIndex} />

      <points geometry={mist}>
        <pointsMaterial color="#fff7df" size={0.03} transparent opacity={0.18} depthWrite={false} />
      </points>

      <LightCreature ref={lightRef} />
    </>
  );
}

function MeshRoad({ pieces, activeIndex }: { pieces: RoadPiece[]; activeIndex: number }) {
  return (
    <group>
      {pieces.map((piece) => {
        const focus = Math.max(0.45, 1 - Math.abs(piece.index - activeIndex) * 0.08);
        return (
          <group key={piece.index}>
            <mesh geometry={piece.geometry} receiveShadow>
              <meshStandardMaterial color="#efe7cf" roughness={0.96} metalness={0} transparent opacity={0.94 * focus} side={THREE.DoubleSide} />
            </mesh>
            <mesh geometry={piece.edgeLeft}>
              <meshBasicMaterial color="#55796e" transparent opacity={0.24 * focus} />
            </mesh>
            <mesh geometry={piece.edgeRight}>
              <meshBasicMaterial color="#fff6dc" transparent opacity={0.18 * focus} />
            </mesh>
          </group>
        );
      })}
    </group>
  );
}

function RoadPebbles({ pebbles, activeIndex, scenes }: { pebbles: Pebble[]; activeIndex: number; scenes: ObservationScene[] }) {
  return (
    <group>
      {pebbles.map((pebble) => {
        const nearest = nearestSceneIndex(pebble.position, scenes);
        const opacity = pebble.opacity * Math.max(0.22, 1 - Math.abs(nearest - activeIndex) * 0.12);
        return (
          <mesh key={pebble.id} position={pebble.position} scale={pebble.scale} rotation={pebble.rotation}>
            <dodecahedronGeometry args={[0.08, 0]} />
            <meshStandardMaterial color={pebble.color} roughness={1} transparent opacity={opacity} />
          </mesh>
        );
      })}
    </group>
  );
}

function buildRoadPieces(scenes: ObservationScene[]): RoadPiece[] {
  return scenes.slice(0, -1).map((scene, index) => {
    const next = scenes[index + 1];
    const start = new THREE.Vector3(...scene.position).add(new THREE.Vector3(0, -0.68, 0));
    const end = new THREE.Vector3(...next.position).add(new THREE.Vector3(0, -0.68, 0));
    const direction = end.clone().sub(start).normalize();
    const normal = new THREE.Vector3(-direction.z, 0, direction.x).normalize();
    const side = index % 2 === 0 ? 1 : -1;
    const bend = 0.54 * side + Math.sin(index * 1.7) * 0.14;
    const c1 = start.clone().lerp(end, 0.34).add(normal.clone().multiplyScalar(bend));
    const c2 = start.clone().lerp(end, 0.68).add(normal.clone().multiplyScalar(bend * 0.72));
    const curve = new THREE.CubicBezierCurve3(start, c1, c2, end);
    const points = curve.getPoints(30);
    const width = 1.18 + Math.sin(index * 0.8) * 0.18;

    return {
      geometry: buildRoadGeometry(points, width, index),
      ...buildRoadEdges(points, width),
      center: start.clone().lerp(end, 0.5),
      index,
    };
  });
}

function buildRoadGeometry(points: THREE.Vector3[], width: number, index: number) {
  const vertices: number[] = [];
  const indices: number[] = [];

  points.forEach((point, i) => {
    const prev = points[Math.max(0, i - 1)];
    const next = points[Math.min(points.length - 1, i + 1)];
    const tangent = next.clone().sub(prev).normalize();
    const normal = new THREE.Vector3(-tangent.z, 0, tangent.x).normalize();
    const pulse = Math.sin(i * 0.46 + index) * 0.12 + Math.sin(i * 0.17 + index * 1.4) * 0.06;
    const localWidth = width * (0.86 + pulse);
    const left = point.clone().add(normal.clone().multiplyScalar(localWidth * 0.5));
    const right = point.clone().add(normal.clone().multiplyScalar(-localWidth * 0.5));
    left.y += Math.sin(i * 0.6 + index) * 0.012;
    right.y += Math.cos(i * 0.7 + index) * 0.012;
    vertices.push(left.x, left.y, left.z, right.x, right.y, right.z);
  });

  for (let i = 0; i < points.length - 1; i += 1) {
    const a = i * 2;
    indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function buildRoadEdges(points: THREE.Vector3[], width: number) {
  const leftPoints: THREE.Vector3[] = [];
  const rightPoints: THREE.Vector3[] = [];

  points.forEach((point, i) => {
    const prev = points[Math.max(0, i - 1)];
    const next = points[Math.min(points.length - 1, i + 1)];
    const tangent = next.clone().sub(prev).normalize();
    const normal = new THREE.Vector3(-tangent.z, 0, tangent.x).normalize();
    const edgeWidth = width * (0.49 + Math.sin(i * 0.33) * 0.04);
    leftPoints.push(point.clone().add(normal.clone().multiplyScalar(edgeWidth)).add(new THREE.Vector3(0, 0.022, 0)));
    rightPoints.push(point.clone().add(normal.clone().multiplyScalar(-edgeWidth)).add(new THREE.Vector3(0, 0.018, 0)));
  });

  return {
    edgeLeft: new THREE.TubeGeometry(new THREE.CatmullRomCurve3(leftPoints), 64, 0.012, 8, false),
    edgeRight: new THREE.TubeGeometry(new THREE.CatmullRomCurve3(rightPoints), 64, 0.009, 8, false),
  };
}

function buildPebbles(scenes: ObservationScene[]): Pebble[] {
  const pebbles: Pebble[] = [];
  const random = seededRandom(3501);

  scenes.slice(0, -1).forEach((scene, index) => {
    const next = scenes[index + 1];
    const start = new THREE.Vector3(...scene.position);
    const end = new THREE.Vector3(...next.position);
    const direction = end.clone().sub(start).normalize();
    const normal = new THREE.Vector3(-direction.z, 0, direction.x).normalize();
    const count = 9;

    for (let i = 0; i < count; i += 1) {
      const t = random();
      const base = start.clone().lerp(end, t);
      const side = random() > 0.5 ? 1 : -1;
      const edge = 0.35 + random() * 0.62;
      const pos = base.add(normal.clone().multiplyScalar(side * edge));
      const s = 0.55 + random() * 1.2;

      pebbles.push({
        id: `pebble-${index}-${i}`,
        position: [pos.x, -0.61 + random() * 0.04, pos.z],
        scale: [s, 0.35 + random() * 0.35, s * (0.65 + random() * 0.4)],
        rotation: [random() * Math.PI, random() * Math.PI, random() * Math.PI],
        color: random() > 0.42 ? '#c9c0ad' : '#7f9b8f',
        opacity: 0.32 + random() * 0.36,
      });
    }
  });

  return pebbles;
}

function buildMistPoints() {
  const geometry = new THREE.BufferGeometry();
  const positions: number[] = [];
  const random = seededRandom(901);

  for (let i = 0; i < 90; i += 1) {
    positions.push((random() - 0.5) * 4.8, random() * 2.4 - 0.15, -random() * 34);
  }

  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  return geometry;
}

function nearestSceneIndex(position: [number, number, number], scenes: ObservationScene[]) {
  let nearest = 0;
  let nearestDistance = Number.POSITIVE_INFINITY;

  scenes.forEach((scene, index) => {
    const dx = scene.position[0] - position[0];
    const dz = scene.position[2] - position[2];
    const distance = dx * dx + dz * dz;
    if (distance < nearestDistance) {
      nearest = index;
      nearestDistance = distance;
    }
  });

  return nearest;
}

function seededRandom(seed: number) {
  let value = seed % 2147483647;
  if (value <= 0) value += 2147483646;

  return () => {
    value = (value * 16807) % 2147483647;
    return (value - 1) / 2147483646;
  };
}
