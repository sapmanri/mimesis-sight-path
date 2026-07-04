import { Text } from '@react-three/drei';
import type { ObservationScene } from '../data/jeju';

type MemoryObjectProps = {
  scene: ObservationScene;
  active: boolean;
  opacity: number;
};

export function MemoryObject({ scene, active, opacity }: MemoryObjectProps) {
  const color = active ? '#f8f1e3' : scene.hue;
  const ink = '#243d3a';
  const wash = active ? 0.18 : 0.08;

  return (
    <group>
      <MemoryShadow opacity={opacity * 0.22} />
      <PaperWash opacity={opacity * wash} />
      {scene.objectKit === 'door-kit' && <DoorObject color={color} ink={ink} opacity={opacity} />}
      {scene.objectKit === 'suitcase-kit' && <SuitcaseObject color={color} ink={ink} opacity={opacity} />}
      {scene.objectKit === 'airplane-wing-kit' && <WingObject color={color} ink={ink} opacity={opacity} />}
      {scene.objectKit === 'stone-wall-kit' && <StoneWallObject color={color} ink={ink} opacity={opacity} />}
      {scene.objectKit === 'sea-edge-kit' && <SeaObject color={color} ink={ink} opacity={opacity} />}
      {scene.objectKit === 'fruit-kit' && <FruitObject color={color} ink={ink} opacity={opacity} />}
      {scene.objectKit === 'cd-shelf-kit' && <ShelfObject color={color} ink={ink} opacity={opacity} />}
      {scene.objectKit === 'book-kit' && <BookObject color={color} ink={ink} opacity={opacity} />}
    </group>
  );
}

function PaperMaterial({ color, opacity }: { color: string; opacity: number }) {
  return <meshStandardMaterial color={color} roughness={0.9} metalness={0.01} transparent opacity={opacity} />;
}

function InkMaterial({ color, opacity }: { color: string; opacity: number }) {
  return <meshBasicMaterial color={color} transparent opacity={opacity} />;
}

function MemoryShadow({ opacity }: { opacity: number }) {
  return (
    <mesh position={[0.04, -0.08, -0.08]} rotation={[0, 0, -0.05]}>
      <boxGeometry args={[0.86, 0.72, 0.035]} />
      <meshBasicMaterial color="#486a62" transparent opacity={opacity} />
    </mesh>
  );
}

function PaperWash({ opacity }: { opacity: number }) {
  return (
    <mesh position={[0, 0, -0.05]} rotation={[0, 0, 0.04]}>
      <boxGeometry args={[0.94, 0.84, 0.026]} />
      <meshBasicMaterial color="#fff4df" transparent opacity={opacity} />
    </mesh>
  );
}

function EdgeLine({ position, size, opacity, ink }: { position: [number, number, number]; size: [number, number, number]; opacity: number; ink: string }) {
  return (
    <mesh position={position}>
      <boxGeometry args={size} />
      <InkMaterial color={ink} opacity={opacity} />
    </mesh>
  );
}

function DoorObject({ color, ink, opacity }: { color: string; ink: string; opacity: number }) {
  return (
    <group rotation={[0, 0, -0.025]}>
      <mesh>
        <boxGeometry args={[0.64, 0.9, 0.09]} />
        <PaperMaterial color={color} opacity={opacity} />
      </mesh>
      <EdgeLine position={[0, 0.43, 0.08]} size={[0.58, 0.022, 0.025]} opacity={opacity * 0.58} ink={ink} />
      <EdgeLine position={[0, -0.43, 0.08]} size={[0.58, 0.022, 0.025]} opacity={opacity * 0.4} ink={ink} />
      <EdgeLine position={[-0.31, 0, 0.08]} size={[0.022, 0.82, 0.025]} opacity={opacity * 0.42} ink={ink} />
      <EdgeLine position={[0.31, 0, 0.08]} size={[0.022, 0.82, 0.025]} opacity={opacity * 0.32} ink={ink} />
      <mesh position={[0, 0.08, 0.105]}>
        <boxGeometry args={[0.36, 0.2, 0.035]} />
        <PaperMaterial color="#f8f1e3" opacity={opacity} />
      </mesh>
      <mesh position={[0, -0.18, 0.105]}>
        <boxGeometry args={[0.34, 0.24, 0.035]} />
        <PaperMaterial color="#f8f1e3" opacity={opacity} />
      </mesh>
      <mesh position={[-0.19, -0.02, 0.13]}>
        <sphereGeometry args={[0.025, 16, 16]} />
        <InkMaterial color={ink} opacity={opacity} />
      </mesh>
      <mesh position={[0.2, 0.32, 0.13]} rotation={[0, 0, -0.24]}>
        <boxGeometry args={[0.12, 0.018, 0.018]} />
        <InkMaterial color="#fff4df" opacity={opacity * 0.52} />
      </mesh>
    </group>
  );
}

function SuitcaseObject({ color, ink, opacity }: { color: string; ink: string; opacity: number }) {
  return (
    <group rotation={[0, 0, -0.16]}>
      <mesh>
        <boxGeometry args={[0.62, 0.74, 0.1]} />
        <PaperMaterial color={color} opacity={opacity} />
      </mesh>
      <mesh position={[0, 0.45, 0.08]}>
        <boxGeometry args={[0.28, 0.08, 0.04]} />
        <InkMaterial color={ink} opacity={opacity} />
      </mesh>
      <mesh position={[0, 0.51, 0.09]}>
        <boxGeometry args={[0.18, 0.034, 0.035]} />
        <PaperMaterial color="#fff4df" opacity={opacity * 0.82} />
      </mesh>
      <mesh position={[-0.21, -0.42, 0.06]}>
        <sphereGeometry args={[0.035, 16, 16]} />
        <InkMaterial color={ink} opacity={opacity} />
      </mesh>
      <mesh position={[0.21, -0.42, 0.06]}>
        <sphereGeometry args={[0.035, 16, 16]} />
        <InkMaterial color={ink} opacity={opacity} />
      </mesh>
      {[-0.19, 0, 0.19].map((x) => (
        <mesh key={x} position={[x, 0, 0.075]}>
          <boxGeometry args={[0.018, 0.56, 0.025]} />
          <InkMaterial color={ink} opacity={opacity * 0.5} />
        </mesh>
      ))}
      <mesh position={[0.16, 0.14, 0.095]} rotation={[0, 0, 0.3]}>
        <boxGeometry args={[0.16, 0.018, 0.018]} />
        <InkMaterial color="#fff4df" opacity={opacity * 0.58} />
      </mesh>
    </group>
  );
}

function WingObject({ color, ink, opacity }: { color: string; ink: string; opacity: number }) {
  return (
    <group rotation={[0, 0, -0.28]}>
      <mesh scale={[1.25, 0.72, 1]}>
        <coneGeometry args={[0.18, 0.96, 3]} />
        <PaperMaterial color={color} opacity={opacity} />
      </mesh>
      <mesh position={[0.08, -0.03, 0.075]} rotation={[0, 0, 0.32]}>
        <boxGeometry args={[0.56, 0.025, 0.025]} />
        <InkMaterial color={ink} opacity={opacity * 0.58} />
      </mesh>
      <mesh position={[-0.13, 0.08, 0.085]} rotation={[0, 0, -0.2]}>
        <boxGeometry args={[0.26, 0.018, 0.018]} />
        <InkMaterial color="#fff4df" opacity={opacity * 0.65} />
      </mesh>
    </group>
  );
}

function StoneWallObject({ color, ink, opacity }: { color: string; ink: string; opacity: number }) {
  const stones = [
    [-0.3, -0.04, 0, 0.24, 0.18],
    [-0.06, 0.03, 0.02, 0.28, 0.22],
    [0.22, -0.03, 0, 0.24, 0.18],
    [-0.18, 0.21, -0.01, 0.25, 0.16],
    [0.12, 0.22, 0.01, 0.3, 0.17],
  ];
  return (
    <group>
      {stones.map(([x, y, z, w, h], i) => (
        <mesh key={i} position={[x, y, z]} rotation={[0, 0, i % 2 ? 0.04 : -0.03]}>
          <boxGeometry args={[w, h, 0.09]} />
          <PaperMaterial color={i % 2 ? '#ded2bd' : color} opacity={opacity} />
        </mesh>
      ))}
      <Text position={[0, -0.32, 0.08]} fontSize={0.09} anchorX="center" anchorY="middle">
        stone wall
        <InkMaterial color={ink} opacity={opacity * 0.38} />
      </Text>
    </group>
  );
}

function SeaObject({ color, ink, opacity }: { color: string; ink: string; opacity: number }) {
  return (
    <group>
      <mesh position={[0, -0.02, -0.015]}>
        <boxGeometry args={[0.88, 0.58, 0.05]} />
        <PaperMaterial color={color} opacity={opacity * 0.38} />
      </mesh>
      {[0, 1, 2, 3].map((i) => (
        <mesh key={i} position={[0.02 * i, 0.18 - i * 0.13, 0.06]} rotation={[0, 0, Math.sin(i) * 0.16]}>
          <boxGeometry args={[0.7 - i * 0.08, 0.032, 0.035]} />
          <InkMaterial color={i === 1 ? '#f8f1e3' : ink} opacity={opacity * (0.72 - i * 0.1)} />
        </mesh>
      ))}
      <mesh position={[0.3, -0.18, 0.07]}>
        <sphereGeometry args={[0.035, 12, 8]} />
        <InkMaterial color="#fff4df" opacity={opacity * 0.6} />
      </mesh>
    </group>
  );
}

function FruitObject({ color, ink, opacity }: { color: string; ink: string; opacity: number }) {
  return (
    <group>
      <mesh>
        <sphereGeometry args={[0.3, 28, 16]} />
        <PaperMaterial color={color} opacity={opacity} />
      </mesh>
      <mesh position={[0, 0, 0.23]}>
        <sphereGeometry args={[0.21, 24, 12]} />
        <InkMaterial color={ink} opacity={opacity * 0.34} />
      </mesh>
      {[-0.08, 0.02, 0.1].map((x, i) => (
        <mesh key={x} position={[x, -0.02 + i * 0.04, 0.42]}>
          <sphereGeometry args={[0.012, 8, 8]} />
          <InkMaterial color="#fff4df" opacity={opacity * 0.7} />
        </mesh>
      ))}
    </group>
  );
}

function ShelfObject({ color, ink, opacity }: { color: string; ink: string; opacity: number }) {
  return (
    <group>
      <mesh>
        <boxGeometry args={[0.72, 0.74, 0.09]} />
        <PaperMaterial color={color} opacity={opacity} />
      </mesh>
      {[0.26, 0, -0.26].map((y) => (
        <mesh key={y} position={[0, y, 0.075]}>
          <boxGeometry args={[0.62, 0.018, 0.025]} />
          <InkMaterial color={ink} opacity={opacity * 0.35} />
        </mesh>
      ))}
      {[-0.24, -0.1, 0.04, 0.18, 0.3].map((x, i) => (
        <mesh key={x} position={[x, 0.02 - (i % 2) * 0.08, 0.09]} rotation={[0, 0, i % 2 ? 0.04 : -0.02]}>
          <boxGeometry args={[0.04, 0.48 + (i % 3) * 0.04, 0.04]} />
          <InkMaterial color={ink} opacity={opacity * 0.48} />
        </mesh>
      ))}
    </group>
  );
}

function BookObject({ color, ink, opacity }: { color: string; ink: string; opacity: number }) {
  return (
    <group rotation={[0, 0, 0.08]}>
      <mesh position={[-0.18, 0, 0]} rotation={[0, 0.08, 0]}>
        <boxGeometry args={[0.34, 0.58, 0.06]} />
        <PaperMaterial color={color} opacity={opacity} />
      </mesh>
      <mesh position={[0.18, 0, 0]} rotation={[0, -0.08, 0]}>
        <boxGeometry args={[0.34, 0.58, 0.06]} />
        <PaperMaterial color="#f1e8d6" opacity={opacity} />
      </mesh>
      <mesh position={[0, 0, 0.06]}>
        <boxGeometry args={[0.03, 0.58, 0.04]} />
        <InkMaterial color={ink} opacity={opacity * 0.42} />
      </mesh>
      {[-0.1, 0.05, 0.16].map((x, i) => (
        <mesh key={x} position={[x, 0.16 - i * 0.15, 0.09]}>
          <boxGeometry args={[0.18, 0.012, 0.016]} />
          <InkMaterial color={ink} opacity={opacity * 0.24} />
        </mesh>
      ))}
    </group>
  );
}
