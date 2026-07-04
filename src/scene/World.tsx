import { useFrame } from '@react-three/fiber';
import { useMemo } from 'react';
import * as THREE from 'three';
import type { ObservationScene } from '../data/jeju';

type WorldProps = {
  scenes: ObservationScene[];
  activeIndex: number;
  mode: 'auto' | 'manual';
};

type RoadPiece = {
  top: THREE.BufferGeometry;
  sideA: THREE.BufferGeometry;
  sideB: THREE.BufferGeometry;
  edgeA: THREE.TubeGeometry;
  edgeB: THREE.TubeGeometry;
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
  const activeScene = scenes[activeIndex];
  const activePosition = useMemo(() => new THREE.Vector3(...activeScene.position), [activeScene.position]);
  const roadPieces = useMemo(() => buildRoadPieces(scenes), [scenes]);
  const pebbles = useMemo(() => buildPebbles(scenes), [scenes]);

  useFrame(({ camera, clock }, delta) => {
    const breathe = Math.sin(clock.elapsedTime * 0.24) * (mode === 'auto' ? 0.08 : 0.03);
    const desired = activePosition.clone().add(new THREE.Vector3(0, 1.18 + breathe, 5.0));
    const target = activePosition.clone().add(new THREE.Vector3(0, -0.64, -1.6));
    camera.position.lerp(desired, 1 - Math.pow(0.03, delta));
    camera.lookAt(target.x, target.y, target.z);
  });

  return (
    <>
      <color attach="background" args={['transparent']} />
      <ambientLight intensity={1.82} />
      <directionalLight position={[-1.6, 4.2, 2.6]} intensity={2.4} color="#fff0c8" />
      <directionalLight position={[2, 2.5, 4]} intensity={0.72} color="#9dc7bf" />
      <MeshRoad pieces={roadPieces} activeIndex={activeIndex} />
      <RoadPebbles pebbles={pebbles} activeIndex={activeIndex} scenes={scenes} />
    </>
  );
}

function MeshRoad({ pieces, activeIndex }: { pieces: RoadPiece[]; activeIndex: number }) {
  return (
    <group>
      {pieces.map((piece) => {
        const focus = Math.max(0.5, 1 - Math.abs(piece.index - activeIndex) * 0.06);
        return (
          <group key={piece.index}>
            <mesh geometry={piece.top}>
              <meshStandardMaterial color="#e3d4b6" roughness={0.98} transparent opacity={0.98 * focus} side={THREE.DoubleSide} />
            </mesh>
            <mesh geometry={piece.sideA}>
              <meshStandardMaterial color="#b7ad95" roughness={1} transparent opacity={0.42 * focus} side={THREE.DoubleSide} />
            </mesh>
            <mesh geometry={piece.sideB}>
              <meshStandardMaterial color="#968d7c" roughness={1} transparent opacity={0.34 * focus} side={THREE.DoubleSide} />
            </mesh>
            <mesh geometry={piece.edgeA}>
              <meshBasicMaterial color="#6e877c" transparent opacity={0.42 * focus} />
            </mesh>
            <mesh geometry={piece.edgeB}>
              <meshBasicMaterial color="#fff0cf" transparent opacity={0.3 * focus} />
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
        const opacity = pebble.opacity * Math.max(0.2, 1 - Math.abs(nearest - activeIndex) * 0.14);
        return (
          <mesh key={pebble.id} position={pebble.position} scale={pebble.scale} rotation={pebble.rotation}>
            <dodecahedronGeometry args={[0.075, 0]} />
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
    const start = new THREE.Vector3(...scene.position).add(new THREE.Vector3(0, -0.66, 0));
    const end = new THREE.Vector3(...next.position).add(new THREE.Vector3(0, -0.66, 0));
    const direction = end.clone().sub(start).normalize();
    const normal = new THREE.Vector3(-direction.z, 0, direction.x).normalize();
    const side = index % 2 === 0 ? 1 : -1;
    const bend = 0.62 * side + Math.sin(index * 1.5) * 0.16;
    const curve = new THREE.CubicBezierCurve3(
      start,
      start.clone().lerp(end, 0.33).add(normal.clone().multiplyScalar(bend)),
      start.clone().lerp(end, 0.68).add(normal.clone().multiplyScalar(bend * 0.72)),
      end,
    );
    const data = makeEdgeData(curve.getPoints(34), 0.92 + Math.sin(index * 0.8) * 0.14, index);
    return {
      top: makeTop(data.a, data.b),
      sideA: makeSide(data.a, 0.44),
      sideB: makeSide(data.b, 0.38),
      edgeA: new THREE.TubeGeometry(new THREE.CatmullRomCurve3(data.a.map((p) => p.clone().add(new THREE.Vector3(0, 0.018, 0)))), 64, 0.01, 8, false),
      edgeB: new THREE.TubeGeometry(new THREE.CatmullRomCurve3(data.b.map((p) => p.clone().add(new THREE.Vector3(0, 0.016, 0)))), 64, 0.008, 8, false),
      index,
    };
  });
}

function makeEdgeData(points: THREE.Vector3[], width: number, index: number) {
  const a: THREE.Vector3[] = [];
  const b: THREE.Vector3[] = [];
  points.forEach((point, i) => {
    const prev = points[Math.max(0, i - 1)];
    const next = points[Math.min(points.length - 1, i + 1)];
    const tangent = next.clone().sub(prev).normalize();
    const normal = new THREE.Vector3(-tangent.z, 0, tangent.x).normalize();
    const localWidth = width * (0.9 + Math.sin(i * 0.42 + index) * 0.1 + Math.sin(i * 0.15 + index * 1.4) * 0.05);
    const lift = Math.sin(i * 0.54 + index) * 0.01;
    a.push(point.clone().add(normal.clone().multiplyScalar(localWidth * 0.5)).add(new THREE.Vector3(0, lift, 0)));
    b.push(point.clone().add(normal.clone().multiplyScalar(-localWidth * 0.5)).add(new THREE.Vector3(0, -lift * 0.7, 0)));
  });
  return { a, b };
}

function makeTop(a: THREE.Vector3[], b: THREE.Vector3[]) {
  const vertices: number[] = [];
  const indices: number[] = [];
  a.forEach((point, i) => vertices.push(point.x, point.y, point.z, b[i].x, b[i].y, b[i].z));
  for (let i = 0; i < a.length - 1; i += 1) {
    const n = i * 2;
    indices.push(n, n + 1, n + 2, n + 1, n + 3, n + 2);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function makeSide(edge: THREE.Vector3[], depth: number) {
  const vertices: number[] = [];
  const indices: number[] = [];
  edge.forEach((point) => {
    const down = point.clone().add(new THREE.Vector3(0, -depth, 0));
    vertices.push(point.x, point.y - 0.004, point.z, down.x, down.y, down.z);
  });
  for (let i = 0; i < edge.length - 1; i += 1) {
    const n = i * 2;
    indices.push(n, n + 2, n + 1, n + 1, n + 2, n + 3);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
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
    for (let i = 0; i < 4; i += 1) {
      const base = start.clone().lerp(end, random());
      const pos = base.add(normal.clone().multiplyScalar((random() > 0.5 ? 1 : -1) * (0.42 + random() * 0.38)));
      const s = 0.42 + random() * 0.9;
      pebbles.push({
        id: `pebble-${index}-${i}`,
        position: [pos.x, -0.58 + random() * 0.035, pos.z],
        scale: [s, 0.28 + random() * 0.3, s * (0.64 + random() * 0.36)],
        rotation: [random() * Math.PI, random() * Math.PI, random() * Math.PI],
        color: random() > 0.5 ? '#c9c0ad' : '#748b7f',
        opacity: 0.38 + random() * 0.36,
      });
    }
  });
  return pebbles;
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
