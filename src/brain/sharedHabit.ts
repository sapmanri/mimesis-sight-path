import { byeoliDayEpoch } from './byeoliTime';
import {
  HabitEngine,
  createEmptyHabitState,
  createLocalHabitStorage,
  type HabitRecord,
  type HabitState,
  type HabitStorage,
} from './habitEngine';

export const SHARED_HABIT_STORAGE_KEY = 'mimesis.byeoli.habits.v2';
export const LEGACY_HABIT_STORAGE_KEYS = [
  'mimesis.byeoli.walk.habits.v1',
  'mimesis.byeoli.planet.habits.v1',
] as const;

function readState(key: string): HabitState | null {
  if (typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as HabitState;
    return parsed?.version === 1 ? parsed : null;
  } catch {
    return null;
  }
}

function mergeLegacyStates(states: HabitState[], currentEpoch: number): HabitState {
  const merged = createEmptyHabitState();

  for (const state of states) {
    for (const [type, count] of Object.entries(state.typeEncounterCounts ?? {})) {
      merged.typeEncounterCounts[type] = (merged.typeEncounterCounts[type] ?? 0) + count;
    }

    for (const incoming of Object.values(state.habits ?? {})) {
      const existing = merged.habits[incoming.key];
      if (!existing) {
        merged.habits[incoming.key] = {
          ...incoming,
          // 옛 2D loop와 3D day는 서로 비교할 수 없으므로 현재 별이력으로 정렬한다.
          lastSeenLoop: currentEpoch,
        };
        continue;
      }

      const combined: HabitRecord = {
        ...existing,
        count: existing.count + incoming.count,
        chosen: existing.chosen + incoming.chosen,
        lastSeenLoop: currentEpoch,
      };
      merged.habits[incoming.key] = combined;
    }
  }

  return merged;
}

export function createSharedHabitStorage(
  currentEpoch: number = byeoliDayEpoch(),
): HabitStorage {
  const primary = createLocalHabitStorage(SHARED_HABIT_STORAGE_KEY);

  return {
    load() {
      const existing = primary.load();
      if (existing) return existing;

      const legacy = LEGACY_HABIT_STORAGE_KEYS
        .map((key) => readState(key))
        .filter((state): state is HabitState => state !== null);

      if (!legacy.length) return null;
      const merged = mergeLegacyStates(legacy, currentEpoch);
      primary.save(merged);
      return merged;
    },
    save(state) {
      primary.save(state);
    },
    clear() {
      primary.clear?.();
    },
  };
}

export function createSharedHabitEngine(
  currentEpoch: number = byeoliDayEpoch(),
): HabitEngine {
  return new HabitEngine(createSharedHabitStorage(currentEpoch));
}
