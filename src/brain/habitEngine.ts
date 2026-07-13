import type { ByeoliDrive } from './actionIntent';

export const HABIT_BIAS_MAX = 0.15;
export const COMBINED_BIAS_MAX = 0.18;

export type HabitRecord = {
  key: string;
  targetType: string;
  drive: ByeoliDrive;
  count: number;
  chosen: number;
  lastSeenLoop: number;
};

export type HabitState = {
  version: 1;
  habits: Record<string, HabitRecord>;
  typeEncounterCounts: Record<string, number>;
};

export type HabitSnapshot = HabitRecord & {
  inactiveLoops: number;
  repetition: number;
  recency: number;
  consistency: number;
  strength: number;
  bias: number;
};

export interface HabitStorage {
  load(): HabitState | null;
  save(state: HabitState): void;
  clear?(): void;
}

export const createEmptyHabitState = (): HabitState => ({
  version: 1,
  habits: {},
  typeEncounterCounts: {},
});

export function createLocalHabitStorage(
  key = 'mimesis.byeoli.habits.v1',
): HabitStorage {
  return {
    load() {
      if (typeof localStorage === 'undefined') return null;
      try {
        const raw = localStorage.getItem(key);
        if (!raw) return null;
        const parsed = JSON.parse(raw) as HabitState;
        return parsed?.version === 1 ? parsed : null;
      } catch {
        return null;
      }
    },
    save(state) {
      if (typeof localStorage === 'undefined') return;
      try {
        localStorage.setItem(key, JSON.stringify(state));
      } catch {
        // Storage failure must never interrupt Byeoli's life loop.
      }
    },
    clear() {
      if (typeof localStorage === 'undefined') return;
      try {
        localStorage.removeItem(key);
      } catch {
        // Ignore unavailable or blocked storage.
      }
    },
  };
}

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));

export class HabitEngine {
  private state: HabitState;

  constructor(
    private readonly storage?: HabitStorage,
    initialState?: HabitState,
  ) {
    this.state = initialState ?? storage?.load() ?? createEmptyHabitState();
  }

  static key(targetType: string, drive: ByeoliDrive): string {
    return `${targetType}:${drive}`;
  }

  /** BUILD 405 validated curve: bias begins on the third matching action. */
  repetitionStrength(count: number): number {
    if (count < 3) return 0;
    return clamp01(1 - Math.exp(-(count - 2) / 3.2));
  }

  record(targetType: string, drive: ByeoliDrive, loop: number): HabitRecord {
    this.state.typeEncounterCounts[targetType] =
      (this.state.typeEncounterCounts[targetType] ?? 0) + 1;

    const key = HabitEngine.key(targetType, drive);
    const habit = this.state.habits[key] ?? {
      key,
      targetType,
      drive,
      count: 0,
      chosen: 0,
      lastSeenLoop: loop,
    };

    habit.count += 1;
    habit.chosen += 1;
    habit.lastSeenLoop = loop;
    this.state.habits[key] = habit;
    this.persist();
    return { ...habit };
  }

  snapshot(targetType: string, drive: ByeoliDrive, loop: number): HabitSnapshot | null {
    const habit = this.state.habits[HabitEngine.key(targetType, drive)];
    if (!habit) return null;

    const repetition = this.repetitionStrength(habit.count);
    const inactiveLoops = Math.max(0, loop - habit.lastSeenLoop);
    const recency = clamp01(Math.exp(-inactiveLoops / 4.5));
    const typeTotal = this.state.typeEncounterCounts[targetType] ?? habit.chosen;
    const consistency = Math.min(
      1,
      Math.max(0.3, habit.chosen / Math.max(typeTotal, habit.chosen, 1)),
    );
    const strength = clamp01(repetition * recency * consistency);

    return {
      ...habit,
      inactiveLoops,
      repetition,
      recency,
      consistency,
      strength,
      bias: Math.min(HABIT_BIAS_MAX, strength * HABIT_BIAS_MAX),
    };
  }

  bias(targetType: string, drive: ByeoliDrive, loop: number): number {
    return this.snapshot(targetType, drive, loop)?.bias ?? 0;
  }

  list(loop: number): HabitSnapshot[] {
    return Object.values(this.state.habits)
      .map((habit) => this.snapshot(habit.targetType, habit.drive, loop))
      .filter((habit): habit is HabitSnapshot => habit !== null)
      .sort((a, b) => b.strength - a.strength || b.count - a.count);
  }

  exportState(): HabitState {
    return JSON.parse(JSON.stringify(this.state)) as HabitState;
  }

  reset(): void {
    this.state = createEmptyHabitState();
    this.storage?.clear?.();
    this.persist();
  }

  private persist(): void {
    this.storage?.save(this.exportState());
  }
}

export function capCombinedBias(habitBias: number, personalityBias: number): number {
  return Math.min(
    COMBINED_BIAS_MAX,
    Math.max(0, habitBias) + Math.max(0, personalityBias),
  );
}
