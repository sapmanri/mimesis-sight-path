import { useMemo } from 'react';
import * as THREE from 'three';
import type { ObservationScene } from '../data/jeju';
import { activeMemoryBiome } from '../engine/memoryBiome';

type RoadSkinProps = {
  scenes: ObservationScene[];
  activeIndex: number;
};

type ErosionPiece = {
  id: string;
  kind: 'stone' | 'wood' | 'crack' | 'dust' | 'edge-collapse';
  position: [number, number, number];
  rotation: [number, number, number];
  scale: [number, number, number];
  color: string;
  opacity: number;
  nearestIndex: number;
};

export function MemoryRoadSkin({ scenes, activeIndex }: RoadSkinProps) {
  const pieces = useMemo(() => buildRoadSkin(scenes), [scenes]);

  return (
    <group>
      {pieces.map((piece) => {
        const focus = Math.max(0.08, 1 - Math.abs(piece.nearestIndex - activeIndex) * 0.16);
        const opacity = piece.opacity * focus;

        if (piece.kind === 'crack') {
          return (
            <mesh key={piece.id} position={piece.position} rotation={piece.rotation} scale={piece.scale}>
              <boxGeometry args={[1, 1, 1]} />
              <meshBasicMaterial color={piece.color} transparent opacity={opacity} depthWrite={false} />
            </mesh>
          );
        }

        if (piece.kind === 'dust') {
          return (
            <mesh key={piece.id} position={piece.position} rotation={piece.rotation} scale={piece.scale}>
              <circleGeometry args={[1, 18]} />
              <meshBasicMaterial color={piece.color} transparent opacity={opacity} depthWrite={false} side={THREE.DoubleSide} />
            </mesh>
          );
        }

        if (piece.kind === 'wood') {
          return (
            <group key={piece.id} position={piece.position} rotation={piece.rotation} scale={piece.scale}>
              <mesh scale={[1, 0.12, 0.16]}>
                <boxGeometry args={[1, 1, 1]} />
                <meshStandardMaterial color={piece.color} roughness={1} transparent opacity={opacity} />
              </mesh>
            </group>
          );
        }

        if (piece.kind === 'edge-collapse') {
          return (
            <mesh key={piece.id} position={piece.position} rotation={piece.rotation} scale={piece.scale}>
              <dodecahedronGeometry args={[1, 0]} />
              <meshStandardMaterial color={piece.color} roughness={1} transparent opacity={opacity} />
            </mesh>
          );
        }

        return (
          <mesh key={piece.id} position={piece.position} rotation={piece.rotation} scale={piece.scale}>
            <dodecahedronGeometry args={[1, 0]} />
            <meshStandardMaterial color={piece.color} roughness={1} transparent opacity={opacity} />
          </mesh>
        );
      })}
    </group>
  );
}

function buildRoadSkin(scenes: ObservationScene[]): ErosionPiece[] {
  const pieces: ErosionPiece[] = [];
  const random = seededRandom(7101);
  const palette = activeMemoryBiome.palette;
  const density = Math.min(activeMemoryBiome.density, 0.46);

  scenes.slice(0, -1).forEach((scene, index) => {
    const next = scenes[index + 1];
    const start = new THREE.Vector3(...scene.position).add(new THREE.Vector3(0, -0.66, 0));
    const end = new THREE.Vector3(...next.position).add(new THREE.Vector3(0, -0.66, 0));
    const direction = end.clone().sub(start).normalize();
    const normal = new THREE.Vector3(-direction.z, 0, direction.x).normalize();
    const angle = Math.atan2(direction.x, direction.z);
    const count = Math.max(2, Math.round(2 + density * 4));

    for (let i = 0; i < count; i += 1) {
      const t = (i + 0.35 + random() * 0.3) / count;
      const center = start.clone().lerp(end, t);
      const side = random() > 0.5 ? 1 : -1;
      const edgeDistance = 0.86 + random() * 0.46;
      const alongJitter = (random() - 0.5) * 0.28;
      const point = center
        .clone()
        .add(direction.clone().multiplyScalar(alongJitter))
        .add(normal.clone().multiplyScalar(side * edgeDistance));

      const roll = random();
      const kind: ErosionPiece['kind'] = roll > 0.88
        ? 'wood'
        : roll > 0.66
          ? 'edge-collapse'
          : roll > 0.42
            ? 'stone'
            : roll > 0.2
              ? 'crack'
              : 'dust';

      const isSurfaceMark = kind === 'crack' || kind === 'dust';
      const y = isSurfaceMark ? -0.507 + random() * 0.018 : -0.78 - random() * 0.34;
      const color = pickColor(kind, palette, random());

      pieces.push({
        id: `road-skin-${index}-${i}-${kind}`,
        kind,
        position: [point.x, y, point.z],
        rotation: isSurfaceMark
          ? [-Math.PI / 2, 0, angle + (random() - 0.5) * 0.8]
          : [random() * 0.5, angle + random() * 0.6, (random() - 0.5) * 0.6],
        scale: scaleForKind(kind, random),
        color,
        opacity: opacityForKind(kind, density, random()),
        nearestIndex: index,
      });
    }
  });

  return pieces;
}

function pickColor(kind: ErosionPiece['kind'], palette: typeof activeMemoryBiome.palette, r: number) {
  if (kind === 'wood') return r > 0.5 ? '#806a52' : '#675745';
  if (kind === 'crack') return '#5f5849';
  if (kind === 'dust') return palette.haze;
  if (kind === 'edge-collapse') return r > 0.5 ? palette.ground : palette.structure;
  return r > 0.5 ? '#948b72' : palette.structure;
}

function scaleForKind(kind: ErosionPiece['kind'], random: () => number): [number, number, number] {
  if (kind === 'wood') return [0.2 + random() * 0.24, 0.24 + random() * 0.2, 0.22 + random() * 0.18];
  if (kind === 'crack') return [0.2 + random() * 0.34, 0.012, 0.012];
  if (kind === 'dust') return [0.08 + random() * 0.16, 0.04 + random() * 0.08, 1];
  if (kind === 'edge-collapse') return [0.08 + random() * 0.16, 0.07 + random() * 0.12, 0.1 + random() * 0.16];
  return [0.06 + random() * 0.12, 0.035 + random() * 0.08, 0.06 + random() * 0.12];
}

function opacityForKind(kind: ErosionPiece['kind'], density: number, r: number) {
  if (kind === 'crack') return 0.08 + density * 0.08 + r * 0.04;
  if (kind === 'dust') return 0.05 + density * 0.04 + r * 0.04;
  if (kind === 'edge-collapse') return 0.18 + density * 0.1 + r * 0.08;
  if (kind === 'wood') return 0.16 + density * 0.1 + r * 0.08;
  return 0.15 + density * 0.08 + r * 0.08;
}

function seededRandom(seed: number) {
  let value = seed % 2147483647;
  if (value <= 0) value += 2147483646;
  return () => {
    value = (value * 16807) % 2147483647;
    return (value - 1) / 2147483646;
  };
}
