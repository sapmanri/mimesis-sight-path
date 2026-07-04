import { useMemo } from 'react';
import * as THREE from 'three';
import { activeMemoryClusterIds, memoryClusters, type MemoryClusterPart } from '../engine/memoryClusters';

export function MemoryClusters() {
  const parts = useMemo(
    () => activeMemoryClusterIds.flatMap((id) => memoryClusters[id].parts.map((part) => ({ ...part, clusterId: id }))),
    [],
  );

  return (
    <group>
      {parts.map((part, index) => (
        <ClusterPartMesh key={`${part.clusterId}-${part.kind}-${index}`} part={part} />
      ))}
    </group>
  );
}

function ClusterPartMesh({ part }: { part: MemoryClusterPart & { clusterId: string } }) {
  const position: [number, number, number] = [part.offset[0], part.offset[1] - 0.34, part.offset[2]];
  const rotation: [number, number, number] = [0.08, part.rotationY, part.role === 'trace' ? -0.16 : 0.04];
  const opacity = part.opacity * (part.role === 'anchor' ? 1 : part.role === 'secondary' ? 0.86 : 0.72);

  if (part.kind === 'lamp') {
    return (
      <group position={position} rotation={rotation} scale={[part.scale, part.scale, part.scale]}>
        <mesh position={[0, 0.5, 0]} scale={[0.045, 1, 0.045]}>
          <cylinderGeometry args={[1, 1, 1, 8]} />
          <meshStandardMaterial color="#6f6654" roughness={1} transparent opacity={opacity} />
        </mesh>
        <mesh position={[0.12, 1.02, 0]} scale={[0.18, 0.08, 0.18]}>
          <boxGeometry args={[1, 1, 1]} />
          <meshBasicMaterial color="#eadfbd" transparent opacity={opacity * 0.34} />
        </mesh>
      </group>
    );
  }

  if (part.kind === 'sign' || part.kind === 'warning-sign') {
    return (
      <group position={position} rotation={rotation} scale={[part.scale, part.scale, part.scale]}>
        <mesh position={[0, 0.32, 0]} scale={[0.035, 0.64, 0.035]}>
          <boxGeometry args={[1, 1, 1]} />
          <meshStandardMaterial color="#6f6654" roughness={1} transparent opacity={opacity} />
        </mesh>
        <mesh position={[0, 0.72, 0]} scale={[0.44, 0.22, 0.035]}>
          <boxGeometry args={[1, 1, 1]} />
          <meshStandardMaterial color={part.kind === 'warning-sign' ? '#b5a267' : '#9a9277'} roughness={1} transparent opacity={opacity * 0.86} />
        </mesh>
      </group>
    );
  }

  if (part.kind === 'traffic-light') {
    return (
      <group position={position} rotation={rotation} scale={[part.scale, part.scale, part.scale]}>
        <mesh position={[0, 0.44, 0]} scale={[0.04, 0.88, 0.04]}>
          <boxGeometry args={[1, 1, 1]} />
          <meshStandardMaterial color="#5f594d" roughness={1} transparent opacity={opacity} />
        </mesh>
        <mesh position={[0, 0.92, 0]} scale={[0.18, 0.34, 0.12]}>
          <boxGeometry args={[1, 1, 1]} />
          <meshStandardMaterial color="#4f574f" roughness={1} transparent opacity={opacity * 0.8} />
        </mesh>
      </group>
    );
  }

  if (part.kind === 'payphone' || part.kind === 'cabina' || part.kind === 'tardis') {
    return (
      <group position={position} rotation={rotation} scale={[part.scale, part.scale, part.scale]}>
        <mesh position={[0, 0.42, 0]} scale={[0.34, 0.84, 0.28]}>
          <boxGeometry args={[1, 1, 1]} />
          <meshStandardMaterial color={part.kind === 'tardis' ? '#667b85' : '#8b8167'} roughness={1} transparent opacity={opacity} />
        </mesh>
        <mesh position={[0, 0.86, 0]} scale={[0.38, 0.08, 0.3]}>
          <boxGeometry args={[1, 1, 1]} />
          <meshStandardMaterial color="#6f6654" roughness={1} transparent opacity={opacity * 0.72} />
        </mesh>
      </group>
    );
  }

  if (part.kind === 'road-blocker') {
    return (
      <group position={position} rotation={rotation} scale={[part.scale, part.scale, part.scale]}>
        <mesh position={[0, 0.16, 0]} scale={[0.72, 0.12, 0.1]}>
          <boxGeometry args={[1, 1, 1]} />
          <meshStandardMaterial color="#a89668" roughness={1} transparent opacity={opacity} />
        </mesh>
        <mesh position={[-0.26, -0.02, 0]} scale={[0.08, 0.34, 0.08]}>
          <boxGeometry args={[1, 1, 1]} />
          <meshStandardMaterial color="#6f6654" roughness={1} transparent opacity={opacity * 0.84} />
        </mesh>
      </group>
    );
  }

  if (part.kind === 'pipe') {
    return (
      <mesh position={position} rotation={[Math.PI / 2, part.rotationY, 0.2]} scale={[part.scale * 0.42, part.scale * 0.42, part.scale * 0.9]}>
        <cylinderGeometry args={[0.18, 0.18, 1, 12]} />
        <meshStandardMaterial color="#77705e" roughness={1} transparent opacity={opacity} />
      </mesh>
    );
  }

  if (part.kind === 'car') {
    return (
      <group position={position} rotation={rotation} scale={[part.scale, part.scale, part.scale]}>
        <mesh position={[0, 0.18, 0]} scale={[0.68, 0.22, 0.34]}>
          <boxGeometry args={[1, 1, 1]} />
          <meshStandardMaterial color="#81745f" roughness={1} transparent opacity={opacity} />
        </mesh>
        <mesh position={[0.02, 0.36, -0.02]} scale={[0.38, 0.18, 0.28]}>
          <boxGeometry args={[1, 1, 1]} />
          <meshStandardMaterial color="#6f786f" roughness={1} transparent opacity={opacity * 0.72} />
        </mesh>
      </group>
    );
  }

  if (part.kind === 'ufo') {
    return (
      <group position={position} rotation={[0.02, part.rotationY, 0]} scale={[part.scale, part.scale, part.scale]}>
        <mesh scale={[0.72, 0.12, 0.72]}>
          <sphereGeometry args={[1, 24, 8]} />
          <meshBasicMaterial color="#b8b4a1" transparent opacity={opacity} depthWrite={false} />
        </mesh>
        <mesh position={[0, 0.12, 0]} scale={[0.28, 0.18, 0.28]}>
          <sphereGeometry args={[1, 16, 8]} />
          <meshBasicMaterial color="#d8d4c1" transparent opacity={opacity * 0.42} depthWrite={false} />
        </mesh>
      </group>
    );
  }

  return null;
}
