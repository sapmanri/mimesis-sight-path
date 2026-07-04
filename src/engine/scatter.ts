import type { RuntimeScene } from './blueprint';
import { objectKitVariants } from './pathPresets';

export type ScatterItem = {
  id: string;
  kind: string;
  position: [number, number, number];
  scale: number;
  rotation: number;
  color: string;
  opacity: number;
};

export function createSceneScatter(scene: RuntimeScene, index: number): ScatterItem[] {
  const seed = scene.id * 997 + index * 131;
  const random = seededRandom(seed);
  const variants = objectKitVariants[scene.objectKit];
  const items: ScatterItem[] = [];
  const count = 5 + Math.floor(random() * 5);

  for (let i = 0; i < count; i += 1) {
    const variant = variants[i % variants.length];
    const side = random() > 0.5 ? 1 : -1;
    const distanceFromPath = 0.34 + random() * 0.72;
    const along = (random() - 0.5) * 1.12;

    items.push({
      id: `${scene.id}-${variant}-${i}`,
      kind: variant,
      position: [scene.position[0] + side * distanceFromPath, -0.58 + random() * 0.05, scene.position[2] + along],
      scale: 0.055 + random() * 0.12,
      rotation: random() * Math.PI,
      color: pickColor(scene.hue, random()),
      opacity: 0.18 + random() * 0.32,
    });
  }

  return items;
}

function pickColor(base: string, t: number) {
  if (t < 0.35) return base;
  if (t < 0.65) return '#f1e8d6';
  if (t < 0.82) return '#9aac9f';
  return '#476862';
}

function seededRandom(seed: number) {
  let value = seed % 2147483647;
  if (value <= 0) value += 2147483646;

  return () => {
    value = (value * 16807) % 2147483647;
    return (value - 1) / 2147483646;
  };
}
