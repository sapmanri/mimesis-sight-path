import { useMemo } from 'react';
import * as THREE from 'three';
import { activeMemoryBiome } from '../engine/memoryBiome';

type MemoryPart = {
  id: string;
  kind: 'isometric-room' | 'shelter' | 'wood-piece' | 'cowshed' | 'unknown-pack' | 'bedroom' | 'bathroom' | 'lighthouse';
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
          <meshStandardMaterial color="#8f866d" roughness={1} transparent opacity={part.opacity * 0.62} />
        </mesh>
        <mesh position={[0, 0.28, -0.36]} scale={[0.86, 0.58, 0.06]}>
          <boxGeometry args={[1, 1, 1]} />
          <meshStandardMaterial color="#777e70" roughness={1} transparent opacity={part.opacity * 0.58} />
        </mesh>
        <mesh position={[0.12, 0.12, 0.12]} scale={isBedroom ? [0.32, 0.07, 0.22] : [0.2, 0.05, 0.14]}>
          <boxGeometry args={[1, 1, 1]} />
          <meshStandardMaterial color={isBathroom ? '#d8d2c1' : '#b9a980'} roughness={1} transparent opacity={part.opacity * 0.72} />
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
        <mesh position={[0, 0.82, 0]} scale={[0.22, 0.1, 0.22]}>
          <boxGeometry args={[1, 1, 1]} />
          <meshBasicMaterial color="#eee4c6" transparent opacity={part.opacity * 0.34} />
        </mesh>
      </group>
    );
  }

  if (part.kind === 'shelter' || part.kind === 'cowshed') {
    return (
      <group position={part.position} rotation={part.rotation} scale={part.scale}>
        <mesh position={[0, 0.52, 0]} rotation={[0, 0, 0.12]} scale={[0.74, 0.07, 0.52]}>
          <boxGeometry args={[1, 1, 1]} />
          <meshStandardMaterial color={part.color} roughness={1} transparent opacity={part.opacity} />
        </mesh>
        {[-0.28, 0.28].map((x) => (
          <mesh key={x} position={[x, 0.2, -0.18]} scale={[0.05, 0.34, 0.05]}>
            <boxGeometry args={[1, 1, 1]} />
            <meshStandardMaterial color="#6f6654" roughness={1} transparent opacity={part.opacity * 0.62} />
          </mesh>
        ))}
      </group>
    );
  }

  if (part.kind === 'wood-piece') {
    return (
      <group position={part.position} rotation={part.rotation} scale={part.scale}>
        <mesh scale={[0.38, 0.05, 0.07]}>
          <boxGeometry args={[1, 1, 1]} />
          <meshStandardMaterial color={part.color} roughness={1} transparent opacity={part.opacity} />
        </mesh>
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
      position: [-1.92, -0.98, -12.8],
      rotation: [0.22, -0.74, -0.12],
      scale: [0.42, 0.42, 0.42],
      color: palette.ground,
      opacity: 0.22,
    },
    {
      id: 'memory-bedroom-buried',
      kind: 'bedroom',
      position: [1.88, -1.02, -18.4],
      rotation: [0.12, 0.68, -0.08],
      scale: [0.34, 0.34, 0.34],
      color: '#a59675',
      opacity: 0.19,
    },
    {
      id: 'memory-bathroom-sunken',
      kind: 'bathroom',
      position: [-2.08, -1.14, -29.6],
      rotation: [-0.08, -0.52, 0.1],
      scale: [0.28, 0.28, 0.28],
      color: '#b7b2a0',
      opacity: 0.16,
    },
    {
      id: 'memory-lighthouse-far',
      kind: 'lighthouse',
      position: [2.9, -0.2, -38.6],
      rotation: [0.02, -0.24, 0.03],
      scale: [0.36, 0.36, 0.36],
      color: '#d8cfb8',
      opacity: 0.18,
    },
    {
      id: 'memory-shelter-buried',
      kind: 'shelter',
      position: [1.88, -1.24, -24.7],
      rotation: [0.18, 0.88, -0.18],
      scale: [0.46, 0.46, 0.46],
      color: '#9d8f69',
      opacity: 0.2,
    },
    {
      id: 'memory-wood-scattered-a',
      kind: 'wood-piece',
      position: [-1.4, -0.78, -9.6],
      rotation: [0.3, 0.4, -0.28],
      scale: [0.62, 0.62, 0.62],
      color: '#8b7258',
      opacity: 0.2,
    },
  ];
}
