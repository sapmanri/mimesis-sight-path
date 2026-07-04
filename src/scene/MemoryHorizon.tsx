import { useMemo } from 'react';
import * as THREE from 'three';

type MemoryShard = {
  id: string;
  position: [number, number, number];
  scale: [number, number, number];
  rotation: [number, number, number];
  color: string;
  opacity: number;
};

export function MemoryHorizon() {
  const farRidges = useMemo(() => makeRidges(), []);
  const cloudLayers = useMemo(() => makeCloudLayers(), []);
  const strataShards = useMemo(() => makeStrataShards(), []);

  return (
    <group>
      <group position={[0, -0.78, -48]}>
        {farRidges.map((ridge) => (
          <mesh key={ridge.id} geometry={ridge.geometry} position={ridge.position} scale={ridge.scale}>
            <meshBasicMaterial color={ridge.color} transparent opacity={ridge.opacity} depthWrite={false} side={THREE.DoubleSide} />
          </mesh>
        ))}
      </group>

      <group>
        {cloudLayers.map((cloud) => (
          <mesh key={cloud.id} position={cloud.position} scale={cloud.scale} rotation={cloud.rotation}>
            <circleGeometry args={[1, 36]} />
            <meshBasicMaterial color={cloud.color} transparent opacity={cloud.opacity} depthWrite={false} side={THREE.DoubleSide} />
          </mesh>
        ))}
      </group>

      <group>
        {strataShards.map((shard) => (
          <mesh key={shard.id} position={shard.position} scale={shard.scale} rotation={shard.rotation}>
            <boxGeometry args={[1, 1, 1]} />
            <meshStandardMaterial color={shard.color} roughness={1} transparent opacity={shard.opacity} />
          </mesh>
        ))}
      </group>
    </group>
  );
}

type Ridge = {
  id: string;
  geometry: THREE.BufferGeometry;
  position: [number, number, number];
  scale: [number, number, number];
  color: string;
  opacity: number;
};

function makeRidges(): Ridge[] {
  return [
    {
      id: 'memory-ridge-far',
      geometry: makeRidgeGeometry([0.08, 0.2, 0.12, 0.34, 0.18, 0.27, 0.14, 0.23, 0.1]),
      position: [-2.4, 0.05, 0],
      scale: [5.8, 1.6, 1],
      color: '#70887d',
      opacity: 0.16,
    },
    {
      id: 'memory-ridge-mid',
      geometry: makeRidgeGeometry([0.18, 0.32, 0.16, 0.22, 0.38, 0.24, 0.3, 0.18]),
      position: [2.6, -0.18, 5.8],
      scale: [4.8, 1.35, 1],
      color: '#8a9278',
      opacity: 0.18,
    },
    {
      id: 'memory-ridge-low',
      geometry: makeRidgeGeometry([0.12, 0.18, 0.1, 0.25, 0.15, 0.2, 0.11]),
      position: [-3.3, -0.35, 10.5],
      scale: [4.2, 1.05, 1],
      color: '#a69d7a',
      opacity: 0.14,
    },
  ];
}

function makeRidgeGeometry(heights: number[]) {
  const vertices: number[] = [];
  const indices: number[] = [];
  const step = 1 / (heights.length - 1);

  heights.forEach((height, i) => {
    const x = -0.5 + i * step;
    vertices.push(x, height, 0, x, -0.42, 0);
  });

  for (let i = 0; i < heights.length - 1; i += 1) {
    const n = i * 2;
    indices.push(n, n + 1, n + 2, n + 1, n + 3, n + 2);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function makeCloudLayers(): MemoryShard[] {
  return [
    {
      id: 'memory-cloud-high-left',
      position: [-4.2, 2.2, -37],
      scale: [2.2, 0.34, 1],
      rotation: [0, 0, -0.08],
      color: '#f0eee1',
      opacity: 0.18,
    },
    {
      id: 'memory-cloud-high-right',
      position: [3.2, 2.55, -43],
      scale: [2.8, 0.38, 1],
      rotation: [0, 0, 0.05],
      color: '#ede7d8',
      opacity: 0.15,
    },
    {
      id: 'memory-cloud-low',
      position: [0.8, 1.32, -31],
      scale: [2.7, 0.32, 1],
      rotation: [0, 0, 0.02],
      color: '#d7d4c3',
      opacity: 0.11,
    },
    {
      id: 'memory-cloud-sunken',
      position: [-1.6, 0.78, -24],
      scale: [1.7, 0.24, 1],
      rotation: [0, 0, -0.03],
      color: '#c9c8b8',
      opacity: 0.09,
    },
  ];
}

function makeStrataShards(): MemoryShard[] {
  const shards: MemoryShard[] = [];
  const random = seededRandom(9407);

  for (let i = 0; i < 28; i += 1) {
    const z = -3 - random() * 31;
    const side = random() > 0.5 ? 1 : -1;
    const x = side * (0.95 + random() * 1.15);
    const y = -1.18 - random() * 0.85;
    const flat = random() > 0.34;

    shards.push({
      id: `memory-strata-shard-${i}`,
      position: [x, y, z],
      scale: flat ? [0.26 + random() * 0.45, 0.035 + random() * 0.05, 0.1 + random() * 0.28] : [0.12 + random() * 0.18, 0.18 + random() * 0.35, 0.1 + random() * 0.22],
      rotation: [random() * 0.7, random() * Math.PI, random() * 0.45],
      color: random() > 0.56 ? '#8b8166' : random() > 0.34 ? '#6f7f71' : '#b6a37b',
      opacity: 0.3 + random() * 0.24,
    });
  }

  return shards;
}

function seededRandom(seed: number) {
  let value = seed % 2147483647;
  if (value <= 0) value += 2147483646;
  return () => {
    value = (value * 16807) % 2147483647;
    return (value - 1) / 2147483646;
  };
}
