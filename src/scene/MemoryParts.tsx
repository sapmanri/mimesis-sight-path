import { useMemo } from 'react';
import * as THREE from 'three';
import { activeMemoryBiome } from '../engine/memoryBiome';

type MemoryPart = {
  id: string;
  kind: 'isometric-room' | 'shelter' | 'wood-piece' | 'cowshed' | 'unknown-pack' | 'bedroom' | 'bathroom' | 'plant' | 'coffee' | 'lighthouse';
  position: [number, number, number];
  rotation: [number, number, number];
  scale: [number, number, number];
  color: string;
  opacity: number;
};

export function MemoryParts() {
  const parts = useMemo(() => makeMemoryParts(), []);

  return (
    <group>
      {parts.map((part) => (
        <MemoryPartMesh key={part.id} part={part} />
      ))}
    </group>
  );
}

function MemoryPartMesh({ part }: { part: MemoryPart }) {
  if (part.kind === 'isometric-room' || part.kind === 'bedroom' || part.kind === 'bathroom') {
    const isBedroom = part.kind === 'bedroom';
    const isBathroom = part.kind === 'bathroom';
    return (
      <group position={part.position} rotation={part.rotation} scale={part.scale}>
        <mesh position={[0, 0, 0]} scale={[0.86, 0.06, 0.72]}>
          <boxGeometry args={[1, 1, 1]} />
          <meshStandardMaterial color={part.color} roughness={1} transparent opacity={part.opacity} />
        </mesh>
        <mesh position={[-0.42, 0.28, 0]} scale={[0.06, 0.58, 0.72]}>
          <boxGeometry args={[1, 1, 1]} />
          <meshStandardMaterial color="#8f866d" roughness={1} transparent opacity={part.opacity * 0.72} />
        </mesh>
        <mesh position={[0, 0.28, -0.36]} scale={[0.86, 0.58, 0.06]}>
          <boxGeometry args={[1, 1, 1]} />
          <meshStandardMaterial color="#777e70" roughness={1} transparent opacity={part.opacity * 0.66} />
        </mesh>
        <mesh position={[0.12, 0.12, 0.12]} scale={isBedroom ? [0.36, 0.08, 0.24] : [0.24, 0.06, 0.16]}>
          <boxGeometry args={[1, 1, 1]} />
          <meshStandardMaterial color={isBathroom ? '#d8d2c1' : '#b9a980'} roughness={1} transparent opacity={part.opacity * 0.9} />
        </mesh>
        <mesh position={[-0.12, 0.2, 0.22]} scale={isBathroom ? [0.18, 0.18, 0.1] : [0.08, 0.18, 0.08]}>
          {isBathroom ? <sphereGeometry args={[1, 14, 8]} /> : <boxGeometry args={[1, 1, 1]} />}
          <meshStandardMaterial color={isBathroom ? '#c8c9bd' : '#6e7467'} roughness={1} transparent opacity={part.opacity * 0.82} />
        </mesh>
      </group>
    );
  }

  if (part.kind === 'plant') {
    return (
      <group position={part.position} rotation={part.rotation} scale={part.scale}>
        <mesh position={[0, 0.06, 0]} scale={[0.18, 0.12, 0.18]}>
          <cylinderGeometry args={[0.55, 0.42, 1, 8]} />
          <meshStandardMaterial color="#8b7258" roughness={1} transparent opacity={part.opacity} />
        </mesh>
        {[0, 1, 2].map((leaf) => (
          <mesh key={leaf} position={[Math.sin(leaf * 2.1) * 0.08, 0.22 + leaf * 0.04, Math.cos(leaf * 2.1) * 0.08]} rotation={[0.5, leaf * 2.1, 0.2]} scale={[0.08, 0.22, 0.04]}>
            <boxGeometry args={[1, 1, 1]} />
            <meshStandardMaterial color="#6f8069" roughness={1} transparent opacity={part.opacity * 0.78} />
          </mesh>
        ))}
      </group>
    );
  }

  if (part.kind === 'coffee') {
    return (
      <group position={part.position} rotation={part.rotation} scale={part.scale}>
        <mesh>
          <cylinderGeometry args={[0.18, 0.14, 0.24, 18]} />
          <meshStandardMaterial color="#d9caa4" roughness={1} transparent opacity={part.opacity} />
        </mesh>
        <mesh position={[0, 0.13, 0]} scale={[1, 0.12, 1]}>
          <cylinderGeometry args={[0.16, 0.16, 0.06, 18]} />
          <meshStandardMaterial color="#5f4d3f" roughness={1} transparent opacity={part.opacity * 0.85} />
        </mesh>
      </group>
    );
  }

  if (part.kind === 'lighthouse') {
    return (
      <group position={part.position} rotation={part.rotation} scale={part.scale}>
        <mesh position={[0, 0.36, 0]} scale={[0.18, 0.72, 0.18]}>
          <cylinderGeometry args={[0.55, 0.72, 1, 10]} />
          <meshStandardMaterial color={part.color} roughness={1} transparent opacity={part.opacity} />
        </mesh>
        <mesh position={[0, 0.82, 0]} scale={[0.26, 0.12, 0.26]}>
          <boxGeometry args={[1, 1, 1]} />
          <meshBasicMaterial color="#eee4c6" transparent opacity={part.opacity * 0.5} />
        </mesh>
      </group>
    );
  }

  if (part.kind === 'shelter' || part.kind === 'cowshed') {
    return (
      <group position={part.position} rotation={part.rotation} scale={part.scale}>
        <mesh position={[0, 0.52, 0]} rotation={[0, 0, 0.12]} scale={[0.86, 0.08, 0.62]}>
          <boxGeometry args={[1, 1, 1]} />
          <meshStandardMaterial color={part.color} roughness={1} transparent opacity={part.opacity} />
        </mesh>
        {[-0.34, 0.34].map((x) => (
          <mesh key={x} position={[x, 0.2, -0.18]} scale={[0.06, 0.42, 0.06]}>
            <boxGeometry args={[1, 1, 1]} />
            <meshStandardMaterial color="#6f6654" roughness={1} transparent opacity={part.opacity * 0.85} />
          </mesh>
        ))}
        <mesh position={[0, 0.1, 0.08]} scale={[0.58, 0.08, 0.18]}>
          <boxGeometry args={[1, 1, 1]} />
          <meshStandardMaterial color="#8b795f" roughness={1} transparent opacity={part.opacity * 0.72} />
        </mesh>
      </group>
    );
  }

  if (part.kind === 'wood-piece') {
    return (
      <group position={part.position} rotation={part.rotation} scale={part.scale}>
        {[0, 1, 2].map((index) => (
          <mesh key={index} position={[index * 0.18 - 0.18, index * 0.04, 0]} rotation={[0.12 * index, 0.34 * index, -0.18 * index]} scale={[0.42, 0.06, 0.08]}>
            <boxGeometry args={[1, 1, 1]} />
            <meshStandardMaterial color={part.color} roughness={1} transparent opacity={part.opacity * (0.86 - index * 0.12)} />
          </mesh>
        ))}
      </group>
    );
  }

  return (
    <mesh position={part.position} rotation={part.rotation} scale={part.scale}>
      <dodecahedronGeometry args={[1, 0]} />
      <meshStandardMaterial color={part.color} roughness={1} transparent opacity={part.opacity} />
    </mesh>
  );
}

function makeMemoryParts(): MemoryPart[] {
  const palette = activeMemoryBiome.palette;
  return [
    {
      id: 'memory-room-cliff-left',
      kind: 'isometric-room',
      position: [-1.78, -0.78, -10.8],
      rotation: [0.22, -0.74, -0.12],
      scale: [0.54, 0.54, 0.54],
      color: palette.ground,
      opacity: 0.34,
    },
    {
      id: 'memory-bedroom-buried',
      kind: 'bedroom',
      position: [1.74, -0.74, -16.2],
      rotation: [0.12, 0.68, -0.08],
      scale: [0.42, 0.42, 0.42],
      color: '#a59675',
      opacity: 0.3,
    },
    {
      id: 'memory-bathroom-sunken',
      kind: 'bathroom',
      position: [-1.86, -0.92, -27.6],
      rotation: [-0.08, -0.52, 0.1],
      scale: [0.34, 0.34, 0.34],
      color: '#b7b2a0',
      opacity: 0.23,
    },
    {
      id: 'memory-room-far-right',
      kind: 'isometric-room',
      position: [2.28, -0.62, -29.4],
      rotation: [-0.06, 0.62, 0.08],
      scale: [0.34, 0.34, 0.34],
      color: '#8c967f',
      opacity: 0.22,
    },
    {
      id: 'memory-plant-left',
      kind: 'plant',
      position: [-0.94, -0.56, -12.8],
      rotation: [0.1, -0.4, 0.2],
      scale: [0.5, 0.5, 0.5],
      color: '#6f8069',
      opacity: 0.34,
    },
    {
      id: 'memory-coffee-near',
      kind: 'coffee',
      position: [0.96, -0.54, -8.4],
      rotation: [0.2, 0.3, -0.18],
      scale: [0.5, 0.5, 0.5],
      color: '#d9caa4',
      opacity: 0.42,
    },
    {
      id: 'memory-lighthouse-far',
      kind: 'lighthouse',
      position: [2.9, -0.2, -36.6],
      rotation: [0.02, -0.24, 0.03],
      scale: [0.42, 0.42, 0.42],
      color: '#d8cfb8',
      opacity: 0.24,
    },
    {
      id: 'memory-shelter-buried',
      kind: 'shelter',
      position: [1.68, -1.02, -14.7],
      rotation: [0.18, 0.88, -0.18],
      scale: [0.62, 0.62, 0.62],
      color: '#9d8f69',
      opacity: 0.34,
    },
    {
      id: 'memory-cowshed-low',
      kind: 'cowshed',
      position: [-2.05, -1.12, -24.2],
      rotation: [0.1, -0.46, 0.16],
      scale: [0.56, 0.56, 0.56],
      color: '#81745f',
      opacity: 0.28,
    },
    {
      id: 'memory-wood-scattered-a',
      kind: 'wood-piece',
      position: [-1.22, -0.66, -6.8],
      rotation: [0.3, 0.4, -0.28],
      scale: [0.72, 0.72, 0.72],
      color: '#8b7258',
      opacity: 0.38,
    },
    {
      id: 'memory-wood-scattered-b',
      kind: 'wood-piece',
      position: [1.18, -0.7, -20.6],
      rotation: [-0.16, -0.62, 0.22],
      scale: [0.58, 0.58, 0.58],
      color: '#a08562',
      opacity: 0.32,
    },
    {
      id: 'memory-unknown-parts-pack',
      kind: 'unknown-pack',
      position: [2.05, -1.28, -33.4],
      rotation: [0.4, 0.2, 0.12],
      scale: [0.22, 0.16, 0.28],
      color: '#8a8167',
      opacity: 0.26,
    },
  ];
}
