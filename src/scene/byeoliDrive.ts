// BUILD 389: 별이의 빠른 뇌 중 순수한 욕구 계산만 분리한다.
// 이 파일은 Three.js, React, 리그를 모른다. 값의 증가·피로 회복·행동 점수만 책임진다.
// 행동 실행과 목적지 이동은 PlanetWorld가 계속 소유한다.

import { getAttractableStimuli, type InteractionStimulus } from '../life/interactionLibrary';

export type Drive = 'observe' | 'record' | 'rest' | 'wonder';
export type DriveState = Record<Drive, number>;
export type DriveStimulus = InteractionStimulus;

export const INITIAL_DRIVES: DriveState = {
  observe: 0.3,
  record: 0.2,
  rest: 0.2,
  wonder: 0.25,
};

export const INITIAL_FATIGUE: DriveState = {
  observe: 0,
  record: 0,
  rest: 0,
  wonder: 0,
};

export const PERSONALITY: DriveState = {
  observe: 1.5,
  record: 1.3,
  rest: 0.7,
  wonder: 1.1,
};

export const PROP_STIMULUS: Record<string, {
  radius: number;
  atten: number;
  stir: DriveStimulus;
}> = getAttractableStimuli();

export function tickDrives(drives: DriveState, fatigue: DriveState, dt: number): void {
  drives.observe = Math.min(1, drives.observe + dt * 0.018);
  drives.record = Math.min(1, drives.record + dt * 0.012);
  drives.rest = Math.min(1, drives.rest + dt * 0.010);
  drives.wonder = Math.min(1, drives.wonder + dt * 0.014);

  for (const key of Object.keys(fatigue) as Drive[]) {
    fatigue[key] = Math.max(0, fatigue[key] - dt * 0.3);
  }
}

export function scorePropAttraction(
  nearness: number,
  drives: DriveState,
  fatigue: DriveState,
  stimulus: DriveStimulus,
): number {
  // BUILD 390: 목적지도 욕구로 고른다.
  // 거리는 여전히 기본값이고, 그 소품이 지금의 욕구를 얼마나 잘 받아주는지가 배율로 붙는다.
  // 소품 자극이 없는 경우에는 기존 거리 점수와 동일하게 동작한다.
  let weightedNeed = 0;
  let weightTotal = 0;

  for (const key of Object.keys(PERSONALITY) as Drive[]) {
    const stir = stimulus[key] ?? 0;
    if (stir <= 0) continue;
    const fatigueWeight = 1 / (1 + fatigue[key] * 2);
    const weight = stir * PERSONALITY[key];
    weightedNeed += drives[key] * fatigueWeight * weight;
    weightTotal += weight;
  }

  if (weightTotal <= 0) return nearness;
  const affinity = weightedNeed / weightTotal;
  return nearness * (0.35 + affinity * 1.65);
}

export function chooseDrive(
  drives: DriveState,
  fatigue: DriveState,
  stimulus: DriveStimulus,
  restedOnce: boolean,
  random: () => number = Math.random,
): Drive {
  const score = (key: Drive): number => {
    const raw = drives[key] + (stimulus[key] ?? 0);
    const nonlinear = raw * raw;
    const fatigueWeight = 1 / (1 + fatigue[key] * 2);
    const restBlock = key === 'rest' && restedOnce ? 0.05 : 1;
    return nonlinear * PERSONALITY[key] * fatigueWeight * restBlock * (0.85 + random() * 0.3);
  };

  const scores: DriveState = {
    observe: score('observe'),
    record: score('record'),
    rest: score('rest'),
    wonder: score('wonder'),
  };

  let best: Drive = 'observe';
  for (const key of Object.keys(scores) as Drive[]) {
    if (scores[key] > scores[best]) best = key;
  }
  return best;
}
