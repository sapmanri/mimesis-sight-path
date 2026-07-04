import { forwardRef } from 'react';
import * as THREE from 'three';

export const LightCreature = forwardRef<THREE.Group>(function LightCreature(_, ref) {
  return (
    <group ref={ref}>
      <mesh>
        <sphereGeometry args={[0.056, 32, 32]} />
        <meshBasicMaterial color="#fffdf2" />
      </mesh>

      <mesh position={[0, -0.038, 0]} scale={[0.86, 0.72, 0.86]}>
        <sphereGeometry args={[0.052, 28, 18]} />
        <meshBasicMaterial color="#fff2bf" transparent opacity={0.95} />
      </mesh>

      <mesh position={[-0.055, 0.018, 0]} rotation={[0, 0, 0.54]}>
        <coneGeometry args={[0.022, 0.086, 3]} />
        <meshBasicMaterial color="#fff7d5" transparent opacity={0.78} />
      </mesh>

      <mesh position={[0.055, 0.018, 0]} rotation={[0, 0, -0.54]}>
        <coneGeometry args={[0.022, 0.086, 3]} />
        <meshBasicMaterial color="#fff7d5" transparent opacity={0.78} />
      </mesh>

      <mesh position={[-0.042, -0.006, -0.012]} rotation={[0, 0, 0.38]}>
        <boxGeometry args={[0.012, 0.11, 0.01]} />
        <meshBasicMaterial color="#fffdf2" transparent opacity={0.5} />
      </mesh>

      <mesh position={[0.042, -0.006, -0.012]} rotation={[0, 0, -0.38]}>
        <boxGeometry args={[0.012, 0.11, 0.01]} />
        <meshBasicMaterial color="#fffdf2" transparent opacity={0.5} />
      </mesh>

      <mesh>
        <sphereGeometry args={[0.15, 32, 32]} />
        <meshBasicMaterial color="#fff7d5" transparent opacity={0.18} />
      </mesh>

      <mesh>
        <sphereGeometry args={[0.32, 32, 32]} />
        <meshBasicMaterial color="#fff7d5" transparent opacity={0.055} />
      </mesh>

      <pointLight intensity={6} distance={2.5} color="#fff0bb" />
    </group>
  );
});
