import {
  AUTHORITY_SCHEMA_VERSION,
  AUTHORITY_NAME,
  BYEOLI_DAY_MS,
  type AuthorityEnvelope,
  type AuthorityPersistence,
  type ByeoliRuntimeState,
  type SkyPhase,
} from './types';

const WORLD_LEN = 4_000;
const SCREEN_X = 92;
const GROUND_Y = 118;
const TICK_MS = 1_000;
const MAX_DT_SECONDS = 2;

function skyProgress(now: number): number {
  return (now % BYEOLI_DAY_MS) / BYEOLI_DAY_MS;
}

function skyPhase(t: number): SkyPhase {
  if (t < 0.15) return 'dawn';
  if (t < 0.5) return 'day';
  if (t < 0.62) return 'dusk';
  return 'night';
}

export function createGenesis(now: number): AuthorityPersistence {
  const t = skyProgress(now);
  const state: ByeoliRuntimeState = {
    byeoli: {
      worldX: 0,
      screenX: SCREEN_X,
      state: 'walk',
      actAction: null,
      actTarget: null,
      actTimer: 0,
      speed: 18,
      walkPhase: 0,
    },
    ppae: {
      x: 132,
      y: GROUND_Y,
      facing: 1,
      phase: 0,
      mode: 'roam',
    },
    sky: {
      t,
      phase: skyPhase(t),
      weather: 'clear',
      clouds: [
        { x: 42, y: 20, w: 28, spd: 2.4, dark: false },
        { x: 142, y: 30, w: 34, spd: 3.1, dark: false },
        { x: 244, y: 17, w: 24, spd: 2.2, dark: false },
        { x: 330, y: 27, w: 31, spd: 2.8, dark: false },
      ],
      cloudDark: false,
      particles: [],
      flybys: [],
    },
    props: [],
    camera: {
      camShift: -SCREEN_X,
      worldX: 0,
      screenX: SCREEN_X,
      worldLen: WORLD_LEN,
    },
    flash: { on: false, timer: 0 },
    speedMul: 1,
    epoch: Math.floor(now / BYEOLI_DAY_MS),
    updatedAt: now,
  };

  return {
    schemaVersion: AUTHORITY_SCHEMA_VERSION,
    instanceEpoch: now,
    sequence: 0,
    startedAt: now,
    lastTickAt: now,
    lastCommittedAt: now,
    archiveMode: 'canary',
    state,
    recentEventIds: [],
  };
}

export function advanceCanaryRuntime(
  persisted: AuthorityPersistence,
  now: number,
): AuthorityPersistence {
  const elapsed = Math.max(0, (now - persisted.lastTickAt) / 1_000);
  const dt = Math.min(elapsed, MAX_DT_SECONDS);
  const next = structuredClone(persisted);
  const state = next.state;

  // Canary에서는 행동·Memory를 소급 생성하지 않는다. 실제로 깨어 있던 dt만 진행한다.
  if (dt > 0) {
    state.byeoli.worldX = (state.byeoli.worldX + state.byeoli.speed * dt) % WORLD_LEN;
    state.byeoli.walkPhase += dt * 8;

    state.ppae.phase += dt * 5;
    state.ppae.x += state.ppae.facing * 7 * dt;
    if (state.ppae.x > 280) state.ppae.facing = -1;
    if (state.ppae.x < 110) state.ppae.facing = 1;

    for (const cloud of state.sky.clouds) {
      cloud.x -= cloud.spd * dt;
      if (cloud.x < -cloud.w - 10) cloud.x = 370;
    }
  }

  const t = skyProgress(now);
  state.sky.t = t;
  state.sky.phase = skyPhase(t);
  state.camera.worldX = state.byeoli.worldX;
  state.camera.camShift = state.byeoli.worldX - state.byeoli.screenX;
  state.epoch = Math.floor(now / BYEOLI_DAY_MS);
  state.updatedAt = now;

  next.sequence += 1;
  next.lastTickAt = now;
  next.lastCommittedAt = now;
  return next;
}

export function toEnvelope(persisted: AuthorityPersistence): AuthorityEnvelope {
  return {
    schemaVersion: AUTHORITY_SCHEMA_VERSION,
    authorityId: AUTHORITY_NAME,
    instanceEpoch: persisted.instanceEpoch,
    sequence: persisted.sequence,
    updatedAt: persisted.state.updatedAt,
    archiveMode: persisted.archiveMode,
    personalityGrowth: false,
    publicationEligible: false,
    stale: false,
    state: persisted.state,
  };
}

export const authorityTickMs = TICK_MS;
