import { useMemo } from 'react';
import * as THREE from 'three';
import type { ObservationScene } from '../data/jeju';

type PathEnvironmentProps = {
  scenes: ObservationScene[];
  activeIndex: number;
};

type TrailAsset = {
  id: string;
  kind: 'grass' | 'rock' | 'wood' | 'brick' | 'pillar' | 'moss' | 'cliff' | 'ruin' | 'block' | 'cone' | 'cactus' | 'found-item';
  position: [number, number, number];
  rotation: [number, number, number];
  scale: [number, number, number];
  opacity: number;
};

const palette = {
  grass: '#7f9572',
  moss: '#9fa77d',
  rock: '#c8c0ad',
  wood: '#b59b78',
  brick: '#c7aa8e',
  pillar: '#ddd3c1',
  cliff: '#bfb6a4',
  ruin: '#d5c8b1',
  block: '#c6bba9',
  cone: '#c98e62',
  cactus: '#6f8d73',
  foundItem: '#e7dac4',
};

export function PathEnvironment({ scenes, activeIndex }: PathEnvironmentProps) {
  const assets = useMemo(() => buildTrailAssets(scenes), [scenes]);

  return (
    <group>
      {assets.map((asset) => {
        const nearest = nearestSceneIndex(asset.position, scenes);
        const focus = Math.max(0.16, 1 - Math.abs(nearest - activeIndex) * 0.18);
        return <TrailAssetMesh key={asset.id} asset={asset} opacity={asset.opacity * focus} />;
      })}
    </group>
  );
}

function TrailAssetMesh({ asset, opacity }: { asset: TrailAsset; opacity: number }) {
  if (asset.kind === 'grass' || asset.kind === 'moss') return <GrassClump asset={asset} opacity={opacity} />;
  if (asset.kind === 'rock') return <Rock asset={asset} opacity={opacity} />;
  if (asset.kind === 'wood') return <Wood asset={asset} opacity={opacity} />;
  if (asset.kind === 'brick' || asset.kind === 'block') return <Block asset={asset} opacity={opacity} />;
  if (asset.kind === 'pillar') return <Pillar asset={asset} opacity={opacity} />;
  if (asset.kind === 'cliff') return <Cliff asset={asset} opacity={opacity} />;
  if (asset.kind === 'ruin') return <Ruin asset={asset} opacity={opacity} />;
  if (asset.kind === 'cone') return <TrafficCone asset={asset} opacity={opacity} />;
  if (asset.kind === 'cactus') return <Cactus asset={asset} opacity={opacity} />;
  return <FoundItem asset={asset} opacity={opacity} />;
}

function GrassClump({ asset, opacity }: { asset: TrailAsset; opacity: number }) {
  return (
    <group position={asset.position} rotation={asset.rotation} scale={asset.scale}>
      {[0, 1, 2, 3].map((i) => (
        <mesh key={i} position={[(i - 1.5) * 0.055, 0.04 + i * 0.006, (i % 2) * 0.035]} rotation={[0, 0, -0.55 + i * 0.34]}>
          <coneGeometry args={[0.018, 0.24 + i * 0.025, 3]} />
          <meshBasicMaterial color={asset.kind === 'moss' ? palette.moss : palette.grass} transparent opacity={opacity * (0.58 + i * 0.08)} />
        </mesh>
      ))}
    </group>
  );
}

function Rock({ asset, opacity }: { asset: TrailAsset; opacity: number }) {
  return (
    <mesh position={asset.position} rotation={asset.rotation} scale={asset.scale}>
      <dodecahedronGeometry args={[0.18, 0]} />
      <meshStandardMaterial color={palette.rock} roughness={0.98} transparent opacity={opacity} />
    </mesh>
  );
}

function Wood({ asset, opacity }: { asset: TrailAsset; opacity: number }) {
  return (
    <mesh position={asset.position} rotation={asset.rotation} scale={asset.scale}>
      <boxGeometry args={[1, 0.12, 0.08]} />
      <meshStandardMaterial color={palette.wood} roughness={0.95} transparent opacity={opacity} />
    </mesh>
  );
}

function Block({ asset, opacity }: { asset: TrailAsset; opacity: number }) {
  return (
    <mesh position={asset.position} rotation={asset.rotation} scale={asset.scale}>
      <boxGeometry args={[0.72, 0.36, 0.16]} />
      <meshStandardMaterial color={asset.kind === 'brick' ? palette.brick : palette.block} roughness={0.96} transparent opacity={opacity} />
    </mesh>
  );
}

function Pillar({ asset, opacity }: { asset: TrailAsset; opacity: number }) {
  return (
    <group position={asset.position} rotation={asset.rotation} scale={asset.scale}>
      <mesh>
        <cylinderGeometry args={[0.08, 0.1, 0.58, 8]} />
        <meshStandardMaterial color={palette.pillar} roughness={0.9} transparent opacity={opacity} />
      </mesh>
      <mesh position={[0, 0.32, 0]}>
        <boxGeometry args={[0.24, 0.08, 0.24]} />
        <meshStandardMaterial color="#f0e5d2" roughness={0.94} transparent opacity={opacity * 0.88} />
      </mesh>
    </group>
  );
}

function Cliff({ asset, opacity }: { asset: TrailAsset; opacity: number }) {
  return (
    <group position={asset.position} rotation={asset.rotation} scale={asset.scale}>
      <mesh rotation={[0.18, 0, -0.12]}>
        <coneGeometry args={[0.42, 0.82, 5]} />
        <meshStandardMaterial color={palette.cliff} roughness={0.98} transparent opacity={opacity * 0.82} />
      </mesh>
      <mesh position={[0.12, -0.08, 0.06]} rotation={[-0.1, 0.1, 0.32]}>
        <dodecahedronGeometry args={[0.2, 0]} />
        <meshStandardMaterial color="#a99f91" roughness={0.98} transparent opacity={opacity * 0.55} />
      </mesh>
    </group>
  );
}

function Ruin({ asset, opacity }: { asset: TrailAsset; opacity: number }) {
  return (
    <group position={asset.position} rotation={asset.rotation} scale={asset.scale}>
      <mesh position={[-0.12, 0, 0]} rotation={[0, 0, -0.08]}>
        <boxGeometry args={[0.14, 0.58, 0.12]} />
        <meshStandardMaterial color={palette.ruin} roughness={0.96} transparent opacity={opacity} />
      </mesh>
      <mesh position={[0.1, 0.07, 0]} rotation={[0, 0, 0.08]}>
        <boxGeometry args={[0.14, 0.44, 0.12]} />
        <meshStandardMaterial color="#c6b79e" roughness={0.96} transparent opacity={opacity * 0.86} />
      </mesh>
      <mesh position={[0, 0.28, 0]} rotation={[0, 0, 0.08]}>
        <boxGeometry args={[0.44, 0.1, 0.12]} />
        <meshStandardMaterial color="#e2d5bd" roughness={0.96} transparent opacity={opacity * 0.72} />
      </mesh>
    </group>
  );
}

function TrafficCone({ asset, opacity }: { asset: TrailAsset; opacity: number }) {
  return (
    <group position={asset.position} rotation={asset.rotation} scale={asset.scale}>
      <mesh position={[0, 0.1, 0]}>
        <coneGeometry args={[0.09, 0.36, 12]} />
        <meshStandardMaterial color={palette.cone} roughness={0.82} transparent opacity={opacity * 0.72} />
      </mesh>
      <mesh position={[0, -0.1, 0]}>
        <boxGeometry args={[0.24, 0.04, 0.24]} />
        <meshStandardMaterial color="#574f48" roughness={0.9} transparent opacity={opacity * 0.52} />
      </mesh>
    </group>
  );
}

function Cactus({ asset, opacity }: { asset: TrailAsset; opacity: number }) {
  return (
    <group position={asset.position} rotation={asset.rotation} scale={asset.scale}>
      <mesh>
        <cylinderGeometry args={[0.035, 0.045, 0.42, 7]} />
        <meshStandardMaterial color={palette.cactus} roughness={0.88} transparent opacity={opacity * 0.65} />
      </mesh>
      <mesh position={[0.06, 0.06, 0]} rotation={[0, 0, -0.7]}>
        <cylinderGeometry args={[0.025, 0.026, 0.22, 7]} />
        <meshStandardMaterial color="#7d997a" roughness={0.88} transparent opacity={opacity * 0.52} />
      </mesh>
    </group>
  );
}

function FoundItem({ asset, opacity }: { asset: TrailAsset; opacity: number }) {
  return (
    <group position={asset.position} rotation={asset.rotation} scale={asset.scale}>
      <mesh rotation={[0, 0, 0.28]}>
        <boxGeometry args={[0.26, 0.16, 0.06]} />
        <meshStandardMaterial color={palette.foundItem} roughness={0.9} transparent opacity={opacity} />
      </mesh>
      <mesh position={[0.1, 0.02, 0.04]}>
        <sphereGeometry args={[0.035, 10, 8]} />
        <meshStandardMaterial color="#796f63" roughness={0.9} transparent opacity={opacity * 0.5} />
      </mesh>
    </group>
  );
}

function buildTrailAssets(scenes: ObservationScene[]): TrailAsset[] {
  const assets: TrailAsset[] = [];

  scenes.slice(0, -1).forEach((scene, index) => {
    const next = scenes[index + 1];
    const random = seededRandom(scene.id * 941 + index * 73);
    const start = new THREE.Vector3(...scene.position);
    const end = new THREE.Vector3(...next.position);
    const direction = end.clone().sub(start).normalize();
    const normal = new THREE.Vector3(-direction.z, 0, direction.x).normalize();
    const length = start.distanceTo(end);
    const density = scene.surface === 'grass-edge' || scene.surface === 'moss-aged' ? 1.45 : 1;
    const count = Math.floor((5 + length * 2.15) * density);

    for (let i = 0; i < count; i += 1) {
      const t = random();
      const base = start.clone().lerp(end, t);
      const side = random() > 0.5 ? 1 : -1;
      const edge = 0.54 + random() * 0.82;
      const position = base.add(normal.clone().multiplyScalar(side * edge));
      const surfaceKind = pickKind(scene.surface, scene.weather, random());
      const scaleBase = 0.55 + random() * 0.9;

      assets.push({
        id: `${scene.id}-${index}-${i}-${surfaceKind}`,
        kind: surfaceKind,
        position: [position.x, -0.66 + random() * 0.06, position.z],
        rotation: getRotation(surfaceKind, direction, random),
        scale: getScale(surfaceKind, scaleBase, random()),
        opacity: getOpacity(surfaceKind, random),
      });
    }

    if (scene.pathKind === 'bridge' || scene.surface === 'wet-stone') addWoodPlanks(assets, scene, start, end, direction, random);
    if (scene.pathKind === 'threshold') addThresholdRuins(assets, scene, start, end, normal, random);
    if (scene.pathKind === 'open-field') addOpenFieldEdges(assets, scene, start, end, normal, random);
  });

  return assets;
}

function addWoodPlanks(assets: TrailAsset[], scene: ObservationScene, start: THREE.Vector3, end: THREE.Vector3, direction: THREE.Vector3, random: () => number) {
  for (let i = 0; i < 3; i += 1) {
    const base = start.clone().lerp(end, 0.22 + i * 0.22);
    assets.push({
      id: `${scene.id}-wood-${i}`,
      kind: 'wood',
      position: [base.x, -0.615, base.z],
      rotation: [-Math.PI / 2, 0, Math.atan2(direction.x, direction.z) + Math.PI / 2 + random() * 0.08],
      scale: [0.58 + random() * 0.5, 0.7, 0.8],
      opacity: 0.42,
    });
  }
}

function addThresholdRuins(assets: TrailAsset[], scene: ObservationScene, start: THREE.Vector3, end: THREE.Vector3, normal: THREE.Vector3, random: () => number) {
  const base = start.clone().lerp(end, 0.2);
  [-1, 1].forEach((side) => {
    assets.push({
      id: `${scene.id}-pillar-${side}`,
      kind: random() > 0.35 ? 'pillar' : 'ruin',
      position: [base.x + normal.x * side * 0.86, -0.37, base.z + normal.z * side * 0.86],
      rotation: [0, random() * 0.25, 0],
      scale: [0.78, 0.78 + random() * 0.42, 0.78],
      opacity: 0.38,
    });
  });
}

function addOpenFieldEdges(assets: TrailAsset[], scene: ObservationScene, start: THREE.Vector3, end: THREE.Vector3, normal: THREE.Vector3, random: () => number) {
  const base = start.clone().lerp(end, 0.55);
  [-1, 1].forEach((side) => {
    assets.push({
      id: `${scene.id}-cliff-${side}`,
      kind: scene.objectKit === 'sea-edge-kit' ? 'cliff' : 'block',
      position: [base.x + normal.x * side * (1.12 + random() * 0.3), -0.64, base.z + normal.z * side * (1.12 + random() * 0.3)],
      rotation: [-Math.PI / 2 + random() * 0.2, 0, random() * Math.PI],
      scale: [0.7 + random() * 0.5, 0.7 + random() * 0.45, 0.7 + random() * 0.5],
      opacity: 0.3,
    });
  });
}

function pickKind(surface: ObservationScene['surface'], weather: ObservationScene['weather'], t: number): TrailAsset['kind'] {
  if (weather === 'moon-night' && t > 0.86) return 'found-item';
  if (weather === 'fog-morning' && t > 0.82) return 'ruin';
  if (surface === 'grass-edge') return t < 0.62 ? 'grass' : t < 0.78 ? 'rock' : t < 0.9 ? 'wood' : 'cactus';
  if (surface === 'moss-aged') return t < 0.42 ? 'moss' : t < 0.68 ? 'rock' : t < 0.86 ? 'brick' : 'ruin';
  if (surface === 'wet-stone') return t < 0.56 ? 'rock' : t < 0.76 ? 'moss' : t < 0.92 ? 'wood' : 'block';
  if (surface === 'sand') return t < 0.48 ? 'rock' : t < 0.68 ? 'grass' : t < 0.84 ? 'wood' : 'found-item';
  if (surface === 'snow-thin') return t < 0.62 ? 'rock' : t < 0.82 ? 'wood' : 'block';
  return t < 0.38 ? 'rock' : t < 0.68 ? 'grass' : t < 0.82 ? 'wood' : t < 0.94 ? 'block' : 'cone';
}

function getRotation(kind: TrailAsset['kind'], direction: THREE.Vector3, random: () => number): [number, number, number] {
  if (kind === 'pillar' || kind === 'ruin' || kind === 'cactus') return [0, random() * Math.PI, 0];
  if (kind === 'wood') return [-Math.PI / 2, 0, Math.atan2(direction.x, direction.z) + Math.PI / 2 + (random() - 0.5) * 0.35];
  return [-Math.PI / 2 + random() * 0.14, 0, random() * Math.PI];
}

function getScale(kind: TrailAsset['kind'], base: number, t: number): [number, number, number] {
  if (kind === 'grass' || kind === 'moss') return [base * 0.45, base * 0.65, base * 0.45];
  if (kind === 'wood') return [base * 0.72, base * 0.6, base * 0.45];
  if (kind === 'brick' || kind === 'block') return [base * 0.34, base * 0.34, base * 0.34];
  if (kind === 'pillar') return [base * 0.7, base * 0.7, base * 0.7];
  if (kind === 'cliff') return [base * 0.9, base * 0.75, base * 0.9];
  if (kind === 'ruin') return [base * 0.58, base * 0.64, base * 0.58];
  if (kind === 'cone') return [base * 0.38, base * 0.38, base * 0.38];
  if (kind === 'cactus') return [base * 0.38, base * 0.5, base * 0.38];
  if (kind === 'found-item') return [base * 0.34, base * 0.34, base * 0.34];
  return [base * (0.32 + t * 0.24), base * (0.22 + t * 0.2), base * (0.28 + t * 0.22)];
}

function getOpacity(kind: TrailAsset['kind'], random: () => number) {
  if (kind === 'cone') return 0.18 + random() * 0.12;
  if (kind === 'found-item') return 0.24 + random() * 0.18;
  if (kind === 'cliff' || kind === 'ruin') return 0.26 + random() * 0.2;
  return 0.32 + random() * 0.36;
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
