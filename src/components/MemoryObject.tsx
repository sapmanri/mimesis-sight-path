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

  return (
    <group>
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
  return <meshStandardMaterial color={color} roughness={0.86} metalness={0.01} transparent opacity={opacity} />;
}

function InkMaterial({ color, opacity }: { color: string; opacity: number }) {
  return <meshBasicMaterial color={color} transparent opacity={opacity} />;
}

function DoorObject({ color, ink, opacity }: { color: string; ink: string; opacity: number }) {
  return (
    <group>
      <mesh>
        <boxGeometry args={[0.66, 0.9, 0.09]} />
        <PaperMaterial color={color} opacity={opacity} />
      </mesh>
      <mesh position={[0, 0.05, 0.06]}>
        <boxGeometry args={[0.42, 0.58, 0.035]} />
        <InkMaterial color={ink} opacity={opacity * 0.92} />
      </mesh>
      <mesh position={[0, 0.08, 0.085]}>
        <boxGeometry args={[0.32, 0.2, 0.04]} />
        <PaperMaterial color="#f8f1e3" opacity={opacity} />
      </mesh>
      <mesh position={[0, -0.18, 0.085]}>
        <boxGeometry args={[0.32, 0.23, 0.04]} />
        <PaperMaterial color="#f8f1e3" opacity={opacity} />
      </mesh>
      <mesh position={[-0.19, -0.02, 0.11]}>
        <sphereGeometry args={[0.025, 16, 16]} />
        <InkMaterial color={ink} opacity={opacity} />
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
      <mesh position={[0, 0.46, 0.07]}>
        <boxGeometry args={[0.24, 0.08, 0.04]} />
        <InkMaterial color={ink} opacity={opacity} />
      </mesh>
      <mesh position={[-0.21, -0.42, 0.06]}>
        <sphereGeometry args={[0.035, 16, 16]} />
        <InkMaterial color={ink} opacity={opacity} />
      </mesh>
      <mesh position={[0.21, -0.42, 0.06]}>
        <sphereGeometry args={[0.035, 16, 16]} />
        <InkMaterial color={ink} opacity={opacity} />
      </mesh>
      {[-0.18, 0, 0.18].map((x) => (
        <mesh key={x} position={[x, 0, 0.065]}>
          <boxGeometry args={[0.018, 0.56, 0.025]} />
          <InkMaterial color={ink} opacity={opacity * 0.68} />
        </mesh>
      ))}
    </group>
  );
}

function WingObject({ color, ink, opacity }: { color: string; ink: string; opacity: number }) {
  return (
    <group rotation={[0, 0, -0.22]}>
      <mesh>
        <coneGeometry args={[0.18, 0.92, 3]} />
        <PaperMaterial color={color} opacity={opacity} />
      </mesh>
      <mesh position={[0.1, -0.03, 0.075]} rotation={[0, 0, 0.32]}>
        <boxGeometry args={[0.5, 0.025, 0.025]} />
        <InkMaterial color={ink} opacity={opacity * 0.7} />
      </mesh>
    </group>
  );
}

function StoneWallObject({ color, ink, opacity }: { color: string; ink: string; opacity: number }) {
  return (
    <group>
      {[-0.24, 0, 0.24].map((x, i) => (
        <mesh key={x} position={[x, i % 2 ? 0.02 : -0.04, 0]}>
          <boxGeometry args={[0.22, 0.18, 0.09]} />
          <PaperMaterial color={i === 1 ? '#ded2bd' : color} opacity={opacity} />
        </mesh>
      ))}
      <Text position={[0, -0.28, 0.08]} fontSize={0.12} anchorX="center" anchorY="middle">
        stone
        <InkMaterial color={ink} opacity={opacity * 0.5} />
      </Text>
    </group>
  );
}

function SeaObject({ color, ink, opacity }: { color: string; ink: string; opacity: number }) {
  return (
    <group>
      {[0, 1, 2].map((i) => (
        <mesh key={i} position={[0, 0.08 - i * 0.15, 0.04]} rotation={[0, 0, Math.sin(i) * 0.12]}>
          <boxGeometry args={[0.62 - i * 0.08, 0.035, 0.04]} />
          <InkMaterial color={i === 1 ? '#f8f1e3' : ink} opacity={opacity * (0.78 - i * 0.12)} />
        </mesh>
      ))}
      <mesh>
        <boxGeometry args={[0.78, 0.5, 0.06]} />
        <PaperMaterial color={color} opacity={opacity * 0.42} />
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
        <InkMaterial color={ink} opacity={opacity * 0.42} />
      </mesh>
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
      {[-0.24, -0.08, 0.08, 0.24].map((x) => (
        <mesh key={x} position={[x, 0, 0.07]}>
          <boxGeometry args={[0.045, 0.56, 0.04]} />
          <InkMaterial color={ink} opacity={opacity * 0.62} />
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
        <InkMaterial color={ink} opacity={opacity * 0.5} />
      </mesh>
    </group>
  );
}
