import type { ByeoliDrive } from './actionIntent';
import { HabitEngine, createLocalHabitStorage, type HabitSnapshot } from './habitEngine';
import { worldTime } from '../scene/skyClock';

const SECONDS_PER_WORLD_DAY = 86_400;

/**
 * BUILD 405-D1: 3D Shadow Mode.
 *
 * The planet records successful object actions into the shared HabitEngine,
 * but the resulting bias is NOT fed back into action selection yet.
 * Replace only worldDayEpoch() when the formal Byeoli calendar is introduced.
 */
export function worldDayEpoch(nowMs: number = Date.now()): number {
  return Math.floor(worldTime(nowMs) / SECONDS_PER_WORLD_DAY);
}

const engine = new HabitEngine(
  createLocalHabitStorage('mimesis.byeoli.planet.habits.v1'),
);

export type PlanetHabitShadowResult = {
  epoch: number;
  before: HabitSnapshot | null;
  after: HabitSnapshot | null;
};

export function peekPlanetHabit(
  targetType: string,
  drive: ByeoliDrive,
  nowMs: number = Date.now(),
): HabitSnapshot | null {
  return engine.snapshot(targetType, drive, worldDayEpoch(nowMs));
}

export function recordPlanetHabitShadow(
  targetType: string,
  drive: ByeoliDrive,
  nowMs: number = Date.now(),
): PlanetHabitShadowResult {
  const epoch = worldDayEpoch(nowMs);
  const before = engine.snapshot(targetType, drive, epoch);
  engine.record(targetType, drive, epoch);
  const after = engine.snapshot(targetType, drive, epoch);

  // Shadow observability only. Never interrupt or steer the life loop.
  try {
    console.debug('[Byeoli Habit Shadow]', {
      key: `${targetType}:${drive}`,
      epoch,
      count: after?.count ?? 0,
      strength: after?.strength ?? 0,
      bias: after?.bias ?? 0,
      appliedToDecision: false,
    });
  } catch {
    // Console availability must not affect Byeoli's life.
  }

  return { epoch, before, after };
}

export function listPlanetHabitShadow(nowMs: number = Date.now()): HabitSnapshot[] {
  return engine.list(worldDayEpoch(nowMs));
}
