export type DwellInput = {
  text: string;
  importance?: number;
  stillness?: number;
  shotType?: 'wide' | 'macro' | 'walk' | 'overhead' | 'side';
};

const MIN_DWELL = 5200;
const MAX_DWELL = 14000;

export function calculateDwellMs({
  text,
  importance = 1,
  stillness = 1,
  shotType = 'walk',
}: DwellInput) {
  const lineCount = text.split('\n').filter(Boolean).length;
  const base = 4200;
  const textWeight = lineCount * 850;
  const importanceWeight = importance * 1200;
  const cameraWeight = getCameraWeight(shotType);
  const emotionWeight = stillness * 900;

  return clamp(base + textWeight + importanceWeight + cameraWeight + emotionWeight, MIN_DWELL, MAX_DWELL);
}

function getCameraWeight(shotType: DwellInput['shotType']) {
  switch (shotType) {
    case 'wide':
      return 1600;
    case 'macro':
      return 1100;
    case 'overhead':
      return 1300;
    case 'side':
      return 900;
    case 'walk':
    default:
      return 700;
  }
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, Math.round(value)));
}
