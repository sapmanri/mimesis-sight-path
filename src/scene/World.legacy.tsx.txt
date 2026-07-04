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
  capStart: THREE.BufferGeometry;
  capEnd: THREE.BufferGeometry;
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

type JointFeather = {
  id: string;
  position: [number, number, number];
  scale: [number, number, number];
  rotation: [number, number, number];
  color: string;
  opacity: number;
};

export function World({ scenes, activeIndex, mode }: WorldProps) {
  const roadPieces = useMemo(() => buildRoadPieces(scenes), [scenes]);
  const pebbles = useMemo(() => buildPebbles(scenes), [scenes]);
  const terrainDecals = useMemo(() => buildTerrainDecals(scenes), [scenes]);
  const jointFeathers = useMemo(() => buildJointFeathers(scenes), [scenes]);
  const walkProgress = useRef(activeIndex);

  useFrame(({ camera }, delta) => {
    const targetProgress = activeIndex;
    const walkSpeed = mode === 'auto' ? 0.12 : 0.08;
    const maxStep = walkSpeed * delta;
    const distance = targetProgress - walkProgress.current;

    if (Math.abs(distance) > 0.001) {
      walkProgress.current += Math.sign(distance) * Math.min(Math.abs(distance), maxStep);
    }

    const walker = sampleScenePath(scenes, walkProgress.current);
    const ahead = sampleScenePath(scenes, Math.min(scenes.length - 1, walkProgress.current + 0.95));
    const behind = sampleScenePath(scenes, Math.max(0, walkProgress.current - 0.95));
    const forward = ahead.clone().sub(walker);
    const direction = forward.lengthSq() > 0.0001 ? forward.normalize() : walker.clone().sub(behind).normalize();
    const normal = new THREE.Vector3(-direction.z, 0, direction.x).normalize();
    const sideDrift = Math.sin(walkProgress.current * 0.72) * 0.26;

    const desired = walker
      .clone()
      .add(direction.clone().multiplyScalar(-7.15))
      .add(normal.clone().multiplyScalar(sideDrift))
      .add(new THREE.Vector3(0, 2.16, 0));

    const target = walker
      .clone()
      .add(direction.clone().multiplyScalar(3.45))
      .add(new THREE.Vector3(0, -0.36, 0));

    camera.position.lerp(desired, 1 - Math.pow(0.045, delta));
    camera.lookAt(target.x, target.y, target.z);
  });

  return (
    <>
      <color attach="background" args={['transparent']} />
      <ambientLight intensity={1.48} />
      <directionalLight position={[-2.2, 5.2, 3.4]} intensity={1.72} color="#fff1cd" />
      <directionalLight position={[2.8, 2.9, 4.6]} intensity={0.36} color="#b7d6c8" />
      <MeshRoad pieces={roadPieces} activeIndex={activeIndex} />
      <TerrainDecals decals={terrainDecals} activeIndex={activeIndex} scenes={scenes} />
      <JointFeathers feathers={jointFeathers} activeIndex={activeIndex} scenes={scenes} />
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
        const focus = Math.max(0.72, 1 - Math.abs(piece.index - activeIndex) * 0.026);
        return (
          <group key={piece.index}>
            <mesh geometry={piece.top}>
              <meshStandardMaterial color="#d7c292" roughness={1} transparent opacity={0.99 * focus} side={THREE.DoubleSide} />
            </mesh>
            <mesh geometry={piece.sideA}>
              <meshStandardMaterial color="#8f8264" roughness={1} transparent opacity={0.72 * focus} side={THREE.DoubleSide} />
            </mesh>
            <mesh geometry={piece.sideB}>
              <meshStandardMaterial color="#6f6651" roughness={1} transparent opacity={0.62 * focus} side={THREE.DoubleSide} />
            </mesh>
            <mesh geometry={piece.capStart}>
              <meshStandardMaterial color="#81765d" roughness={1} transparent opacity={0.7 * focus} side={THREE.DoubleSide} />
            </mesh>
            <mesh geometry={piece.capEnd}>
              <meshStandardMaterial color="#81765d" roughness={1} transparent opacity={0.7 * focus} side={THREE.DoubleSide} />
            </mesh>
            <mesh geometry={piece.edgeA}>
              <meshBasicMaterial color="#5f7e68" transparent opacity={0.58 * focus} />
            </mesh>
            <mesh geometry={piece.edgeB}>
              <meshBasicMaterial color="#7c916a" transparent opacity={0.46 * focus} />
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
        const opacity = decal.opacity * Math.max(0.28, 1 - Math.abs(nearest - activeIndex) * 0.09);
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

function JointFeathers({ feathers, activeIndex, scenes }: { feathers: JointFeather[]; activeIndex: number; scenes: ObservationScene[] }) {
  return (
    <group>
      {feathers.map((feather) => {
        const nearest = nearestSceneIndex(feather.position, scenes);
        const opacity = feather.opacity * Math.max(0.32, 1 - Math.abs(nearest - activeIndex) * 0.08);
        return (
          <mesh key={feather.id} position={feather.position} rotation={feather.rotation} scale={feather.scale}>
            <circleGeometry args={[1, 28]} />
            <meshBasicMaterial color={feather.color} transparent opacity={opacity} depthWrite={false} side={THREE.DoubleSide} />
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
        const opacity = pebble.opacity * Math.max(0.32, 1 - Math.abs(nearest - activeIndex) * 0.1);
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
    const overlap = 1.12;
    const start = rawStart.clone().add(direction.clone().multiplyScalar(index === 0 ? 0 : -overlap));
    const end = rawEnd.clone().add(direction.clone().multiplyScalar(index === scenes.length - 2 ? 0 : overlap));
    const normal = new THREE.Vector3(-direction.z, 0, direction.x).normalize();
    const side = index % 2 === 0 ? 1 : -1;
    const bend = 0.64 * side + Math.sin(index * 1.5) * 0.18;
    const curve = new THREE.CubicBezierCurve3(
      start,
      start.clone().lerp(end, 0.31).add(normal.clone().multiplyScalar(bend)),
      start.clone().lerp(end, 0.69).add(normal.clone().multiplyScalar(bend * 0.68)),
      end,
    );
    const data = makeEdgeData(curve.getPoints(54), 1.2 + Math.sin(index * 0.8) * 0.18, index);
    return {
      top: makeTop(data.a, data.b),
      sideA: makeSide(data.a, 0.62, index),
      sideB: makeSide(data.b, 0.56, index + 3),
      capStart: makeEndCap(data.a[0], data.b[0], 0.6, index),
      capEnd: makeEndCap(data.a[data.a.length - 1], data.b[data.b.length - 1], 0.58, index + 9),
      edgeA: new THREE.TubeGeometry(new THREE.CatmullRomCurve3(data.a.map((p) => p.clone().add(new THREE.Vector3(0, 0.02, 0)))), 88, 0.012, 8, false),
      edgeB: new THREE.TubeGeometry(new THREE.CatmullRomCurve3(data.b.map((p) => p.clone().add(new THREE.Vector3(0, 0.018, 0)))), 88, 0.01, 8, false),
      index,
    };
  });
}

function makeEdgeData(points: THREE.Vector3[], width: number, index: number) {
  const a: THREE.Vector3[] = [];
  const b: THREE.Vector3[] = [];
  const last = points.length - 1;

  points.forEach((point, i) => {
    const prev = points[Math.max(0, i - 1)];
    const next = points[Math.min(last, i + 1)];
    const tangent = next.clone().sub(prev).normalize();
    const normal = new THREE.Vector3(-tangent.z, 0, tangent.x).normalize();
    const t = last === 0 ? 0.5 : i / last;
    const endDistance = Math.min(t, 1 - t);
    const taper = THREE.MathUtils.smoothstep(endDistance, 0, 0.24);
    const shoulder = THREE.MathUtils.smoothstep(endDistance, 0.12, 0.42);
    const chipped = (i % 6 === 0 ? 0.1 : i % 10 === 0 ? -0.08 : 0) * shoulder;
    const organic = 0.95 + Math.sin(i * 0.34 + index) * 0.11 + Math.sin(i * 0.14 + index * 1.7) * 0.06;
    const localWidth = width * (0.34 + taper * 0.66) * organic + chipped;
    const lift = (Math.sin(i * 0.5 + index) * 0.016 + Math.sin(i * 0.17) * 0.007) * shoulder;

    a.push(point.clone().add(normal.clone().multiplyScalar(localWidth * 0.5)).add(new THREE.Vector3(0, lift, 0)));
    b.push(point.clone().add(normal.clone().multiplyScalar(-localWidth * 0.5)).add(new THREE.Vector3(0, -lift * 0.62, 0)));
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

function makeSide(edge: THREE.Vector3[], depth: number, seed = 0) {
  const vertices: number[] = [];
  const indices: number[] = [];
  edge.forEach((point, i) => {
    const t = edge.length <= 1 ? 0.5 : i / (edge.length - 1);
    const endDistance = Math.min(t, 1 - t);
    const shoulder = THREE.MathUtils.smoothstep(endDistance, 0.08, 0.32);
    const roughDepth = depth * (0.7 + shoulder * 0.3) * (0.88 + Math.sin(i * 0.45 + seed) * 0.15 + Math.sin(i * 0.17 + seed * 0.4) * 0.08);
    const edgeLift = Math.sin(i * 0.33 + seed) * 0.01 * shoulder;
    const down = point.clone().add(new THREE.Vector3(0, -roughDepth, 0));
    vertices.push(point.x, point.y - 0.004 + edgeLift, point.z, down.x, down.y, down.z);
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

function makeEndCap(a: THREE.Vector3, b: THREE.Vector3, depth: number, seed = 0) {
  const center = a.clone().lerp(b, 0.5);
  const width = a.distanceTo(b);
  const capDepth = depth * (0.88 + Math.sin(seed * 0.61) * 0.08);
  const bottomInset = Math.min(width * 0.18, 0.08);
  const insetA = a.clone().lerp(center, bottomInset / Math.max(width, 0.001));
  const insetB = b.clone().lerp(center, bottomInset / Math.max(width, 0.001));
  const bottomA = insetA.clone().add(new THREE.Vector3(0, -capDepth, 0));
  const bottomB = insetB.clone().add(new THREE.Vector3(0, -capDepth * 0.95, 0));

  const vertices = [
    a.x, a.y - 0.002, a.z,
    b.x, b.y - 0.002, b.z,
    bottomB.x, bottomB.y, bottomB.z,
    bottomA.x, bottomA.y, bottomA.z,
    center.x, center.y - capDepth * 0.52, center.z,
  ];
  const indices = [0, 1, 4, 1, 2, 4, 2, 3, 4, 3, 0, 4, 0, 3, 2, 0, 2, 1];
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function buildJointFeathers(scenes: ObservationScene[]): JointFeather[] {
  const feathers: JointFeather[] = [];
  const random = seededRandom(6211);

  scenes.slice(1, -1).forEach((scene, index) => {
    const prev = new THREE.Vector3(...scenes[index].position);
    const current = new THREE.Vector3(...scene.position);
    const next = new THREE.Vector3(...scenes[index + 2].position);
    const direction = next.clone().sub(prev).normalize();
    const normal = new THREE.Vector3(-direction.z, 0, direction.x).normalize();
    const angle = Math.atan2(direction.x, direction.z);

    for (let i = 0; i < 3; i += 1) {
      const sideOffset = (i - 1) * (0.16 + random() * 0.08);
      const alongOffset = (random() - 0.5) * 0.24;
      const pos = current
        .clone()
        .add(direction.clone().multiplyScalar(alongOffset))
        .add(normal.clone().multiplyScalar(sideOffset));

      feathers.push({
        id: `joint-feather-${index}-${i}`,
        position: [pos.x, -0.533 + i * 0.001, pos.z],
        rotation: [-Math.PI / 2, 0, angle + (random() - 0.5) * 0.28],
        scale: [0.42 + random() * 0.3, 0.12 + random() * 0.1, 1],
        color: i === 1 ? '#d9c99a' : random() > 0.5 ? '#b8bd8f' : '#8da985',
        opacity: i === 1 ? 0.26 : 0.18,
      });
    }
  });

  return feathers;
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
    for (let i = 0; i < 6; i += 1) {
      const base = start.clone().lerp(end, random());
      const pos = base.add(normal.clone().multiplyScalar((random() > 0.5 ? 1 : -1) * (0.5 + random() * 0.56)));
      const s = 0.32 + random() * 0.72;
      pebbles.push({
        id: `pebble-${index}-${i}`,
        position: [pos.x, -0.58 + random() * 0.038, pos.z],
        scale: [s, 0.2 + random() * 0.26, s * (0.62 + random() * 0.38)],
        rotation: [random() * Math.PI, random() * Math.PI, random() * Math.PI],
        color: random() > 0.54 ? '#c4b68e' : '#718a70',
        opacity: 0.38 + random() * 0.32,
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
    for (let i = 0; i < 8; i += 1) {
      const t = random();
      const base = start.clone().lerp(end, t);
      const offset = (random() - 0.5) * 0.68;
      const pos = base.add(normal.clone().multiplyScalar(offset));
      const kind: TerrainDecal['kind'] = random() > 0.84 ? 'crack' : random() > 0.52 ? 'moss' : 'dust';
      decals.push({
        id: `terrain-${index}-${i}`,
        position: [pos.x, -0.548, pos.z],
        rotation: [-Math.PI / 2, 0, random() * Math.PI],
        scale: kind === 'crack' ? [0.24 + random() * 0.44, 1, 1] : [0.06 + random() * 0.18, 0.06 + random() * 0.18, 1],
        color: kind === 'moss' ? '#718f69' : kind === 'crack' ? '#7f735e' : '#ead7aa',
        opacity: kind === 'crack' ? 0.22 : 0.14 + random() * 0.14,
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
