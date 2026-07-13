import type { ByeoliDrive } from './actionIntent';
import { type HabitSnapshot } from './habitEngine';
import { byeoliDayEpoch } from './byeoliTime';
import { createSharedHabitEngine } from './sharedHabit';

/**
 * BUILD 405-D1/E: 3D Shadow Mode on the shared Byeoli timeline.
 *
 * The planet records successful object actions into the same HabitEngine used by 2D.
 * The resulting bias is still NOT fed back into 3D action selection yet.
 */
const engine = createSharedHabitEngine();

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
  return engine.snapshot(targetType, drive, byeoliDayEpoch(nowMs));
}

export function recordPlanetHabitShadow(
  targetType: string,
  drive: ByeoliDrive,
  nowMs: number = Date.now(),
): PlanetHabitShadowResult {
  const epoch = byeoliDayEpoch(nowMs);
  const before = engine.snapshot(targetType, drive, epoch);
  engine.record(targetType, drive, epoch);
  const after = engine.snapshot(targetType, drive, epoch);

  try {
    console.debug('[Byeoli Habit Shadow]', {
      key: `${targetType}:${drive}`,
      epoch,
      count: after?.count ?? 0,
      strength: after?.strength ?? 0,
      bias: after?.bias ?? 0,
      appliedToDecision: false,
      sharedStorage: true,
    });
  } catch {
    // Console availability must not affect Byeoli's life.
  }

  return { epoch, before, after };
}

export function listPlanetHabitShadow(nowMs: number = Date.now()): HabitSnapshot[] {
  return engine.list(byeoliDayEpoch(nowMs));
}
