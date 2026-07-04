import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
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

type TerrainDecal = {
  id: string;
  position: [number, number, number];
  scale: [number, number, number];
  rotation: [number, number, number];
  color: string;
  opacity: number;
  kind: 'dust' | 'moss' | 'crack';
};

export function World({ scenes, activeIndex, mode }: WorldProps) {
  const roadPieces = useMemo(() => buildRoadPieces(scenes), [scenes]);
  const pebbles = useMemo(() => buildPebbles(scenes), [scenes]);
  const terrainDecals = useMemo(() => buildTerrainDecals(scenes), [scenes]);
  const walkProgress = useRef(activeIndex);

  useFrame(({ camera }, delta) => {
    const targetProgress = activeIndex;
    const walkSpeed = mode === 'auto' ? 0.17 : 0.11;
    const maxStep = walkSpeed * delta;
    const distance = targetProgress - walkProgress.current;

    if (Math.abs(distance) > 0.001) {
      walkProgress.current += Math.sign(distance) * Math.min(Math.abs(distance), maxStep);
    }

    const walker = sampleScenePath(scenes, walkProgress.current);
    const ahead = sampleScenePath(scenes, Math.min(scenes.length - 1, walkProgress.current + 0.7));
    const direction = ahead.clone().sub(walker).normalize();
    const normal = new THREE.Vector3(-direction.z, 0, direction.x).normalize();
    const sideDrift = Math.sin(walkProgress.current * 0.9) * 0.18;
    const desired = walker.clone().add(direction.clone().multiplyScalar(4.3)).add(normal.clone().multiplyScalar(sideDrift)).add(new THREE.Vector3(0, 1.25, 0));
    const target = walker.clone().add(direction.clone().multiplyScalar(-1.35)).add(new THREE.Vector3(0, -0.58, 0));

    camera.position.lerp(desired, 1 - Math.pow(0.018, delta));
    camera.lookAt(target.x, target.y, target.z);
  });

  return (
    <>
      <color attach="background" args={['transparent']} />
      <ambientLight intensity={1.62} />
      <directionalLight position={[-1.6, 4.2, 2.6]} intensity={2.08} color="#fff0c8" />
      <directionalLight position={[2, 2.5, 4]} intensity={0.5} color="#9dc7bf" />
      <MeshRoad pieces={roadPieces} activeIndex={activeIndex} />
      <TerrainDecals decals={terrainDecals} activeIndex={activeIndex} scenes={scenes} />
      <RoadPebbles pebbles={pebbles} activeIndex={activeIndex} scenes={scenes} />
    </>
  );
}

function sampleScenePath(scenes: ObservationScene[], progress: number) {
  const clamped = Math.max(0, Math.min(scenes.length - 1, progress));
  const index = Math.floor(clamped);
  const nextIndex = Math.min(scenes.length - 1, index + 1);
  const t = clamped - index;
  const start = new THREE.Vector3(...scenes[index].position).add(new THREE.Vector3(0, -0.66, 0));
  const end = new THREE.Vector3(...scenes[nextIndex].position).add(new THREE.Vector3(0, -0.66, 0));
  return start.lerp(end, t);
}

function MeshRoad({ pieces, activeIndex }: { pieces: RoadPiece[]; activeIndex: number }) {
  return (
    <group>
      {pieces.map((piece) => {
        const focus = Math.max(0.7, 1 - Math.abs(piece.index - activeIndex) * 0.03);
        return (
          <group key={piece.index}>
            <mesh geometry={piece.top}>
              <meshStandardMaterial color="#d8c6a1" roughness={1} transparent opacity={0.99 * focus} side={THREE.DoubleSide} />
            </mesh>
            <mesh geometry={piece.sideA}>
              <meshStandardMaterial color="#9b8e72" roughness={1} transparent opacity={0.66 * focus} side={THREE.DoubleSide} />
            </mesh>
            <mesh geometry={piece.sideB}>
              <meshStandardMaterial color="#756e5c" roughness={1} transparent opacity={0.54 * focus} side={THREE.DoubleSide} />
            </mesh>
            <mesh geometry={piece.edgeA}>
              <meshBasicMaterial color="#52756b" transparent opacity={0.64 * focus} />
            </mesh>
            <mesh geometry={piece.edgeB}>
              <meshBasicMaterial color="#fff0cf" transparent opacity={0.42 * focus} />
            </mesh>
          </group>
        );
      })}
    </group>
  );
}

function TerrainDecals({ decals, activeIndex, scenes }: { decals: TerrainDecal[]; activeIndex: number; scenes: ObservationScene[] }) {
  return (
    <group>
      {decals.map((decal) => {
        const nearest = nearestSceneIndex(decal.position, scenes);
        const opacity = decal.opacity * Math.max(0.25, 1 - Math.abs(nearest - activeIndex) * 0.1);
        return (
          <mesh key={decal.id} position={decal.position} rotation={decal.rotation} scale={decal.scale}>
            {decal.kind === 'crack' ? <boxGeometry args={[1, 0.08, 0.01]} /> : <circleGeometry args={[1, 18]} />}
            <meshBasicMaterial color={decal.color} transparent opacity={opacity} depthWrite={false} side={THREE.DoubleSide} />
          </mesh>
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
        const opacity = pebble.opacity * Math.max(0.28, 1 - Math.abs(nearest - activeIndex) * 0.12);
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
    const rawStart = new THREE.Vector3(...scene.position).add(new THREE.Vector3(0, -0.66, 0));
    const rawEnd = new THREE.Vector3(...next.position).add(new THREE.Vector3(0, -0.66, 0));
    const direction = rawEnd.clone().sub(rawStart).normalize();
    const overlap = 0.54;
    const start = rawStart.clone().add(direction.clone().multiplyScalar(index === 0 ? 0 : -overlap));
    const end = rawEnd.clone().add(direction.clone().multiplyScalar(index === scenes.length - 2 ? 0 : overlap));
    const normal = new THREE.Vector3(-direction.z, 0, direction.x).normalize();
    const side = index % 2 === 0 ? 1 : -1;
    const bend = 0.58 * side + Math.sin(index * 1.5) * 0.15;
    const curve = new THREE.CubicBezierCurve3(
      start,
      start.clone().lerp(end, 0.33).add(normal.clone().multiplyScalar(bend)),
      start.clone().lerp(end, 0.68).add(normal.clone().multiplyScalar(bend * 0.72)),
      end,
    );
    const data = makeEdgeData(curve.getPoints(38), 1.02 + Math.sin(index * 0.8) * 0.16, index);
    return {
      top: makeTop(data.a, data.b),
      sideA: makeSide(data.a, 0.52),
      sideB: makeSide(data.b, 0.46),
      edgeA: new THREE.TubeGeometry(new THREE.CatmullRomCurve3(data.a.map((p) => p.clone().add(new THREE.Vector3(0, 0.018, 0)))), 72, 0.01, 8, false),
      edgeB: new THREE.TubeGeometry(new THREE.CatmullRomCurve3(data.b.map((p) => p.clone().add(new THREE.Vector3(0, 0.016, 0)))), 72, 0.008, 8, false),
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
    const chipped = i % 7 === 0 ? 0.08 : i % 11 === 0 ? -0.06 : 0;
    const localWidth = width * (0.92 + Math.sin(i * 0.42 + index) * 0.11 + Math.sin(i * 0.15 + index * 1.4) * 0.055) + chipped;
    const lift = Math.sin(i * 0.54 + index) * 0.012;
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
  edge.forEach((point, i) => {
    const roughDepth = depth * (0.82 + Math.sin(i * 0.48) * 0.16 + Math.sin(i * 0.19) * 0.08);
    const down = point.clone().add(new THREE.Vector3(0, -roughDepth, 0));
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
    for (let i = 0; i < 5; i += 1) {
      const base = start.clone().lerp(end, random());
      const pos = base.add(normal.clone().multiplyScalar((random() > 0.5 ? 1 : -1) * (0.48 + random() * 0.45)));
      const s = 0.36 + random() * 0.75;
      pebbles.push({
        id: `pebble-${index}-${i}`,
        position: [pos.x, -0.58 + random() * 0.035, pos.z],
        scale: [s, 0.24 + random() * 0.28, s * (0.64 + random() * 0.36)],
        rotation: [random() * Math.PI, random() * Math.PI, random() * Math.PI],
        color: random() > 0.5 ? '#c5b99e' : '#70877a',
        opacity: 0.42 + random() * 0.34,
      });
    }
  });
  return pebbles;
}

function buildTerrainDecals(scenes: ObservationScene[]): TerrainDecal[] {
  const decals: TerrainDecal[] = [];
  const random = seededRandom(8129);
  scenes.slice(0, -1).forEach((scene, index) => {
    const next = scenes[index + 1];
    const start = new THREE.Vector3(...scene.position);
    const end = new THREE.Vector3(...next.position);
    const direction = end.clone().sub(start).normalize();
    const normal = new THREE.Vector3(-direction.z, 0, direction.x).normalize();
    for (let i = 0; i < 7; i += 1) {
      const t = random();
      const base = start.clone().lerp(end, t);
      const offset = (random() - 0.5) * 0.58;
      const pos = base.add(normal.clone().multiplyScalar(offset));
      const kind: TerrainDecal['kind'] = random() > 0.82 ? 'crack' : random() > 0.55 ? 'moss' : 'dust';
      decals.push({
        id: `terrain-${index}-${i}`,
        position: [pos.x, -0.548, pos.z],
        rotation: [-Math.PI / 2, 0, random() * Math.PI],
        scale: kind === 'crack' ? [0.22 + random() * 0.38, 1, 1] : [0.05 + random() * 0.16, 0.05 + random() * 0.16, 1],
        color: kind === 'moss' ? '#78927e' : kind === 'crack' ? '#837966' : '#efe0bb',
        opacity: kind === 'crack' ? 0.2 : 0.13 + random() * 0.14,
        kind,
      });
    }
  });
  return decals;
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
