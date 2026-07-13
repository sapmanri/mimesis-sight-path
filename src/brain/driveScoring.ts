import {
  BYEOLI_DRIVES,
  type ByeoliActionIntent,
  type ByeoliDrive,
  type ByeoliWorldType,
} from './actionIntent';
import { capCombinedBias, type HabitEngine } from './habitEngine';

export type DriveValues = Record<ByeoliDrive, number>;
export type StimulusValues = Partial<Record<ByeoliDrive, number>>;

export type DriveScoringInput = {
  id: string;
  targetId?: string;
  targetType: string;
  worldType: ByeoliWorldType;
  timestamp: number;
  seed?: number;
  drives: DriveValues;
  stimulus: StimulusValues;
  fatigue: number;
  randomness: number;
  threshold: number;
  loop: number;
  habitEngine?: HabitEngine;
  personalityBias?: Partial<Record<ByeoliDrive, number>>;
  durationFor?: (drive: ByeoliDrive, score: number) => number;
};

export type DriveScoringResult = {
  intent: ByeoliActionIntent;
  passed: boolean;
};

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));

/**
 * Shared decision boundary for 2D and 3D.
 * Personality and Habit remain weak biases; neither may force an action.
 */
export function scoreByeoliAction(input: DriveScoringInput): DriveScoringResult {
  let bestDrive: ByeoliDrive = 'observe';
  let bestScore = Number.NEGATIVE_INFINITY;
  let bestReason: ByeoliActionIntent['reason'] | null = null;

  for (const drive of BYEOLI_DRIVES) {
    const currentDrive = clamp01(input.drives[drive]);
    const objectStimulus = input.stimulus[drive] ?? 0;
    const habitBias = input.habitEngine?.bias(input.targetType, drive, input.loop) ?? 0;
    const personalityBias = input.personalityBias?.[drive] ?? 0;
    const combinedBias = capCombinedBias(habitBias, personalityBias);
    const score =
      currentDrive +
      objectStimulus +
      combinedBias -
      clamp01(input.fatigue) +
      input.randomness;

    if (score > bestScore) {
      bestDrive = drive;
      bestScore = score;
      bestReason = {
        currentDrive,
        objectStimulus,
        habitBias,
        personalityBias,
        fatiguePenalty: clamp01(input.fatigue),
        randomness: input.randomness,
      };
    }
  }

  const passed = bestScore < input.threshold;
  const duration = passed
    ? 0
    : Math.max(0, input.durationFor?.(bestDrive, bestScore) ?? 2.5);

  const intent: ByeoliActionIntent = {
    id: input.id,
    action: passed ? 'pass' : bestDrive,
    targetId: input.targetId,
    targetType: input.targetType,
    duration,
    drive: bestDrive,
    score: bestScore,
    reason: bestReason ?? {
      currentDrive: 0,
      objectStimulus: 0,
      habitBias: 0,
      personalityBias: 0,
      fatiguePenalty: clamp01(input.fatigue),
      randomness: input.randomness,
    },
    context: {
      worldType: input.worldType,
      timestamp: input.timestamp,
      seed: input.seed,
    },
  };

  return { intent, passed };
}
