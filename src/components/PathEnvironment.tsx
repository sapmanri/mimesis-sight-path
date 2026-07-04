import { useMemo } from 'react';
import * as THREE from 'three';
import type { ObservationScene } from '../data/jeju';

type PathEnvironmentProps = {
  scenes: ObservationScene[];
  activeIndex: number;
};

type TrailAsset = {
  id: string;
  kind: 'grass' | 'rock' | 'wood' | 'brick' | 'pillar' | 'moss';
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
  if (asset.kind === 'grass' || asset.kind === 'moss') {
    return <GrassClump asset={asset} opacity={opacity} />;
  }

  if (asset.kind === 'wood') {
    return (
      <mesh position={asset.position} rotation={asset.rotation} scale={asset.scale}>
        <boxGeometry args={[1, 0.12, 0.08]} />
        <meshStandardMaterial color={palette.wood} roughness={0.95} transparent opacity={opacity} />
      </mesh>
    );
  }

  if (asset.kind === 'brick') {
    return (
      <mesh position={asset.position} rotation={asset.rotation} scale={asset.scale}>
        <boxGeometry args={[0.7, 0.34, 0.12]} />
        <meshStandardMaterial color={palette.brick} roughness={0.96} transparent opacity={opacity} />
      </mesh>
    );
  }

  if (asset.kind === 'pillar') {
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

  return (
    <mesh position={asset.position} rotation={asset.rotation} scale={asset.scale}>
      <dodecahedronGeometry args={[0.18, 0]} />
      <meshStandardMaterial color={palette.rock} roughness={0.98} transparent opacity={opacity} />
    </mesh>
  );
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
    const density = scene.surface === 'grass-edge' || scene.surface === 'moss-aged' ? 1.4 : 1;
    const count = Math.floor((5 + length * 2.1) * density);

    for (let i = 0; i < count; i += 1) {
      const t = random();
      const base = start.clone().lerp(end, t);
      const side = random() > 0.5 ? 1 : -1;
      const edge = 0.54 + random() * 0.75;
      const position = base.add(normal.clone().multiplyScalar(side * edge));
      const surfaceKind = pickKind(scene.surface, random());
      const scaleBase = 0.55 + random() * 0.9;

      assets.push({
        id: `${scene.id}-${index}-${i}-${surfaceKind}`,
        kind: surfaceKind,
        position: [position.x, -0.66 + random() * 0.06, position.z],
        rotation: [-Math.PI / 2 + random() * 0.12, 0, random() * Math.PI],
        scale: getScale(surfaceKind, scaleBase, random()),
        opacity: 0.34 + random() * 0.38,
      });
    }

    if (scene.pathKind === 'bridge' || scene.surface === 'wet-stone') {
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

    if (scene.pathKind === 'threshold') {
      const base = start.clone().lerp(end, 0.2);
      [-1, 1].forEach((side) => {
        assets.push({
          id: `${scene.id}-pillar-${side}`,
          kind: 'pillar',
          position: [base.x + normal.x * side * 0.86, -0.37, base.z + normal.z * side * 0.86],
          rotation: [0, random() * 0.15, 0],
          scale: [0.8, 0.8 + random() * 0.35, 0.8],
          opacity: 0.38,
        });
      });
    }
  });

  return assets;
}

function pickKind(surface: ObservationScene['surface'], t: number): TrailAsset['kind'] {
  if (surface === 'grass-edge') return t < 0.72 ? 'grass' : t < 0.88 ? 'rock' : 'wood';
  if (surface === 'moss-aged') return t < 0.46 ? 'moss' : t < 0.76 ? 'rock' : 'brick';
  if (surface === 'wet-stone') return t < 0.62 ? 'rock' : t < 0.82 ? 'moss' : 'wood';
  if (surface === 'sand') return t < 0.62 ? 'rock' : t < 0.82 ? 'grass' : 'wood';
  if (surface === 'snow-thin') return t < 0.72 ? 'rock' : 'wood';
  return t < 0.46 ? 'rock' : t < 0.78 ? 'grass' : 'wood';
}

function getScale(kind: TrailAsset['kind'], base: number, t: number): [number, number, number] {
  if (kind === 'grass' || kind === 'moss') return [base * 0.45, base * 0.65, base * 0.45];
  if (kind === 'wood') return [base * 0.72, base * 0.6, base * 0.45];
  if (kind === 'brick') return [base * 0.34, base * 0.34, base * 0.34];
  if (kind === 'pillar') return [base * 0.7, base * 0.7, base * 0.7];
  return [base * (0.32 + t * 0.24), base * (0.22 + t * 0.2), base * (0.28 + t * 0.22)];
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
