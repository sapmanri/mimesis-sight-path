export const AUTHORITY_SCHEMA_VERSION = 1 as const;
export const AUTHORITY_NAME = 'single-byeoli' as const;
export const BYEOLI_DAY_MS = 60_000;

export type ArchiveMode = 'canary' | 'live';
export type ByeoliAction = 'observe' | 'rest' | 'record' | 'wonder' | null;
export type SkyPhase = 'dawn' | 'day' | 'dusk' | 'night';
export type WeatherKind = 'clear' | 'rain' | 'snow';

export type ByeoliRuntimeState = {
  byeoli: {
    worldX: number;
    screenX: number;
    state: 'walk' | 'acting';
    actAction: ByeoliAction;
    actTarget: string | null;
    actTimer: number;
    speed: number;
    walkPhase: number;
  };
  ppae: {
    x: number;
    y: number;
    facing: -1 | 1;
    phase: number;
    mode: 'idle' | 'roam' | 'follow' | 'dash';
  };
  sky: {
    t: number;
    phase: SkyPhase;
    weather: WeatherKind;
    clouds: Array<{ x: number; y: number; w: number; spd: number; dark: boolean }>;
    cloudDark: boolean;
    particles: unknown[];
    flybys: unknown[];
  };
  props: Array<Record<string, unknown>>;
  camera: {
    camShift: number;
    worldX: number;
    screenX: number;
    worldLen: number;
  };
  flash: { on: boolean; timer: number };
  speedMul: number;
  epoch: number;
  updatedAt: number;
};

export type AuthorityEnvelope = {
  schemaVersion: typeof AUTHORITY_SCHEMA_VERSION;
  authorityId: typeof AUTHORITY_NAME;
  instanceEpoch: number;
  sequence: number;
  updatedAt: number;
  archiveMode: ArchiveMode;
  personalityGrowth: false;
  publicationEligible: false;
  stale: false;
  state: ByeoliRuntimeState;
};

export type AuthorityHealth = {
  ok: true;
  schemaVersion: typeof AUTHORITY_SCHEMA_VERSION;
  authorityId: typeof AUTHORITY_NAME;
  instanceEpoch: number;
  sequence: number;
  startedAt: number;
  lastTickAt: number;
  connectedViewers: number;
  storageRecovered: boolean;
  archiveMode: ArchiveMode;
};

export type AuthorityPersistence = {
  schemaVersion: typeof AUTHORITY_SCHEMA_VERSION;
  instanceEpoch: number;
  sequence: number;
  startedAt: number;
  lastTickAt: number;
  lastCommittedAt: number;
  archiveMode: ArchiveMode;
  state: ByeoliRuntimeState;
  recentEventIds: string[];
};
