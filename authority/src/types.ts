import type { ObjectDrive } from '../../src/objects/objectRegistry';
export const AUTHORITY_SCHEMA_VERSION = 1 as const;
export const AUTHORITY_NAME = 'single-byeoli' as const;
export const BYEOLI_DAY_MS = 60_000;

export type ArchiveMode = 'canary' | 'live';
export type ByeoliAction = 'observe' | 'rest' | 'record' | 'wonder' | null;
export type SkyPhase = 'dawn' | 'day' | 'dusk' | 'night';
export type WeatherKind = 'clear' | 'rain' | 'snow';

export type AuthorityLiveEvent = {
  id: string;
  kind: 'act' | 'pass' | 'rare' | 'diary';
  action: Exclude<ByeoliAction, null> | null;
  targetId: string | null;
  targetType: string | null;
  text: string;
  sub: string | null;
  occurredAt: number;
};

export type AuthorityTelemetry = {
  memories: number;
  diary: number;
  drives: Record<Exclude<ByeoliAction, null>, number>;
  fatigue: number;
};

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
  liveEvent?: AuthorityLiveEvent | null;
  telemetry?: AuthorityTelemetry;
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
  /**
   * 사건 공책 — append-only 링 (Vase 승인 2026-07-26, 홈즈 설계).
   *
   * 왜: `liveEvent`는 **최신 한 건 슬롯**이라 폴링 사이에 두 사건이 나면 앞 사건을 잃는다.
   * `sequence`는 매 tick 오르는 값이지 사건 번호가 아니라 차분으로도 복원이 안 된다.
   * Byeol Core가 별이의 기억을 **하나도 안 빠뜨리고** 쌓으려면 순서대로 적히는 공책이 있어야 한다.
   *
   * ⚠ **선택 필드다.** 스키마 버전을 올리지 않는다 — 옛 저장본은 이 필드 없이 그대로 로드되고
   *   빈 링으로 시작한다. 마이그레이션 0, 유실 0.
   * ⚠ 시간 모델(TICK_MS·MAX_DT·이동·선택·persist 주기)은 **건드리지 않는다.**
   *   기존 persist에 얹혀 함께 저장될 뿐이다.
   */
  eventOutbox?: AuthorityOutboxEvent[];
};

/** Core가 섭취할 최소형 (홈즈 지정 필드). `liveEvent`가 이미 갖고 있던 것 + 시퀀스·지속시간. */
export type AuthorityOutboxEvent = {
  eventId: string;
  authoritySequence: number;
  occurredAt: number;
  kind: 'pass' | 'act' | 'diary';
  action: ObjectDrive | null;
  targetId: string;
  targetType: string;
  /** ⚠ 관측 체류 시간이 아니라 **Authority가 부여한 예정 지속 시간**이다 (홈즈: 정직한 이름). */
  actionDuration: number | null;
};