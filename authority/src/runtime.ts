import { OBJECT_REGISTRY, type ObjectDrive, type ObjectRegistryEntry } from '../../src/objects/objectRegistry';
import {
  AUTHORITY_SCHEMA_VERSION,
  AUTHORITY_NAME,
  BYEOLI_DAY_MS,
  type AuthorityEnvelope,
  type AuthorityLiveEvent,
  type AuthorityPersistence,
  type ByeoliRuntimeState,
  type SkyPhase,
} from './types';

const SCREEN_X = 92;
const GROUND_Y = 118;
const TICK_MS = 1_000;
const MAX_DT_SECONDS = 2;
const ACTIONS: ObjectDrive[] = ['observe', 'rest', 'record', 'wonder'];
const ACTION_KO: Record<ObjectDrive, string> = {
  observe: '관찰',
  rest: '쉼',
  record: '사진',
  wonder: '궁금',
};
const ACTION_DURATION: Record<ObjectDrive, number> = {
  observe: 3.0,
  rest: 3.6,
  record: 2.8,
  wonder: 3.2,
};

const TWO_D_OBJECTS = OBJECT_REGISTRY.filter(
  (entry) => entry.views.twoD?.enabled && !entry.views.twoD.special && !entry.views.twoD.rareEvent,
);
const OBJECT_BY_ID = new Map(TWO_D_OBJECTS.map((entry) => [entry.id, entry]));

function skyProgress(now: number): number {
  return (now % BYEOLI_DAY_MS) / BYEOLI_DAY_MS;
}

function skyPhase(t: number): SkyPhase {
  if (t < 0.15) return 'dawn';
  if (t < 0.5) return 'day';
  if (t < 0.62) return 'dusk';
  return 'night';
}

function makeRng(seed: number): () => number {
  let value = seed >>> 0 || 0x9e3779b9;
  return () => {
    value += 0x6d2b79f5;
    let t = value;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

function shuffled<T>(items: readonly T[], rng: () => number): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function buildAuthorityTown(seed: number): { props: Array<Record<string, unknown>>; worldLen: number } {
  const rng = makeRng(seed);
  const budgets: Record<string, number> = { nature: 24, thing: 22, animal: 13, rest: 9 };
  const selected: ObjectRegistryEntry[] = [];

  for (const [category, budget] of Object.entries(budgets)) {
    const candidates = TWO_D_OBJECTS.filter((entry) => entry.category === category);
    selected.push(...shuffled(candidates, rng).slice(0, budget));
  }

  const pool = shuffled(selected, rng);
  const props: Array<Record<string, unknown>> = [];
  let x = 150;

  pool.forEach((entry, index) => {
    const view = entry.views.twoD!;
    const gap = entry.category === 'animal'
      ? 280 + Math.floor(rng() * 150)
      : entry.rarity === 'uncommon'
        ? 150 + Math.floor(rng() * 90)
        : 95 + Math.floor(rng() * 65);
    x += gap;
    const variants = entry.variants ?? [];
    const variant = variants.length ? variants[Math.floor(rng() * variants.length)] : '';
    props.push({
      id: `${entry.id}-${variant || 'a'}-${index}`,
      type: entry.id,
      variant,
      x,
      layer: entry.category === 'thing' || entry.id === 'oldtree' ? 'middle' : 'front',
      phase: 'unseen',
      reactedThisPass: false,
      rare: entry.rarity === 'rare',
      emoji: view.emoji,
    });
  });

  return { props, worldLen: x + 260 };
}

function defaultTelemetry() {
  return {
    memories: 0,
    diary: 0,
    drives: { observe: 0.30, rest: 0.22, record: 0.26, wonder: 0.34 },
    fatigue: 0.05,
  };
}

function promoteCanaryWorld(persisted: AuthorityPersistence): void {
  const state = persisted.state;
  if (state.props.length > 0 && state.telemetry) return;

  const town = buildAuthorityTown(persisted.instanceEpoch);
  state.props = town.props;
  state.camera.worldLen = town.worldLen;
  state.telemetry = state.telemetry ?? defaultTelemetry();
  state.liveEvent = state.liveEvent ?? null;
  state.byeoli.worldX %= town.worldLen;
  persisted.archiveMode = 'live';
}

function objectLabel(entry: ObjectRegistryEntry): string {
  return entry.label;
}

function objectEmoji(entry: ObjectRegistryEntry): string {
  return entry.views.twoD?.emoji ?? '·';
}

function chooseAction(entry: ObjectRegistryEntry, rng: () => number): ObjectDrive {
  const weights = ACTIONS.map((action) => Math.max(0.05, entry.drives?.[action] ?? 0.08));
  let roll = rng() * weights.reduce((sum, weight) => sum + weight, 0);
  for (let i = 0; i < ACTIONS.length; i += 1) {
    roll -= weights[i];
    if (roll <= 0) return ACTIONS[i];
  }
  return 'observe';
}

function nextLiveEvent(
  persisted: AuthorityPersistence,
  kind: AuthorityLiveEvent['kind'],
  action: ObjectDrive | null,
  prop: Record<string, unknown>,
  entry: ObjectRegistryEntry,
  now: number,
): AuthorityLiveEvent {
  const emoji = objectEmoji(entry);
  const label = objectLabel(entry);
  const text = kind === 'pass'
    ? `${emoji} ${label} 그냥 지나침`
    : kind === 'diary'
      ? `${emoji} ${label}. 오늘은 조금 오래 마음에 남았다.`
      : `${emoji} ${action ? ACTION_KO[action] : '발견'} · ${label}`;
  return {
    id: `${persisted.instanceEpoch}-${persisted.sequence + 1}-${String(prop.id)}`,
    kind,
    action,
    targetId: String(prop.id),
    targetType: entry.id,
    text,
    sub: action ? `${ACTION_DURATION[action].toFixed(1)}초` : null,
    occurredAt: now,
  };
}

function maybeEncounter(persisted: AuthorityPersistence, now: number): void {
  const state = persisted.state;
  if (state.byeoli.state !== 'walk') return;

  const worldX = state.byeoli.worldX;
  let nearest: Record<string, unknown> | null = null;
  let nearestDistance = Number.POSITIVE_INFINITY;

  for (const prop of state.props) {
    const x = Number(prop.x);
    const distance = x - worldX;
    if (distance < -35) {
      prop.reactedThisPass = false;
      prop.phase = 'unseen';
      continue;
    }
    if (distance >= -5 && distance < nearestDistance) {
      nearest = prop;
      nearestDistance = distance;
    }
  }

  if (!nearest || nearestDistance > 30 || nearest.reactedThisPass === true) return;
  nearest.reactedThisPass = true;
  nearest.phase = 'encountered';

  const type = String(nearest.type ?? '');
  const entry = OBJECT_BY_ID.get(type);
  if (!entry) return;

  const rng = makeRng((persisted.sequence + 1) * 2_654_435_761 + Math.floor(Number(nearest.x)));
  const telemetry = state.telemetry ?? defaultTelemetry();
  state.telemetry = telemetry;

  if (rng() < 0.22) {
    state.liveEvent = nextLiveEvent(persisted, 'pass', null, nearest, entry, now);
    return;
  }

  const action = chooseAction(entry, rng);
  const duration = ACTION_DURATION[action] + rng() * 0.8;
  state.byeoli.state = 'acting';
  state.byeoli.actAction = action;
  state.byeoli.actTarget = String(nearest.id);
  state.byeoli.actTimer = duration;
  state.flash.on = action === 'record';
  state.flash.timer = action === 'record' ? 0.55 : 0;

  telemetry.memories += 1;
  telemetry.fatigue = Math.min(1, telemetry.fatigue + (action === 'rest' ? -0.08 : 0.035));
  telemetry.drives[action] = Math.min(1, telemetry.drives[action] + 0.025);

  const makeDiary = telemetry.memories % 4 === 0;
  if (makeDiary) telemetry.diary += 1;
  state.liveEvent = nextLiveEvent(persisted, makeDiary ? 'diary' : 'act', action, nearest, entry, now);
}

export function createGenesis(now: number): AuthorityPersistence {
  const t = skyProgress(now);
  const town = buildAuthorityTown(now);
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
    props: town.props,
    camera: {
      camShift: -SCREEN_X,
      worldX: 0,
      screenX: SCREEN_X,
      worldLen: town.worldLen,
    },
    flash: { on: false, timer: 0 },
    speedMul: 1,
    epoch: Math.floor(now / BYEOLI_DAY_MS),
    updatedAt: now,
    liveEvent: null,
    telemetry: defaultTelemetry(),
  };

  return {
    schemaVersion: AUTHORITY_SCHEMA_VERSION,
    instanceEpoch: now,
    sequence: 0,
    startedAt: now,
    lastTickAt: now,
    lastCommittedAt: now,
    archiveMode: 'live',
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
  promoteCanaryWorld(next);
  const state = next.state;

  if (state.flash.timer > 0) {
    state.flash.timer = Math.max(0, state.flash.timer - dt);
    if (state.flash.timer === 0) state.flash.on = false;
  }

  if (dt > 0) {
    if (state.byeoli.state === 'acting') {
      state.byeoli.actTimer = Math.max(0, state.byeoli.actTimer - dt);
      if (state.byeoli.actTimer === 0) {
        state.byeoli.state = 'walk';
        state.byeoli.actAction = null;
        state.byeoli.actTarget = null;
      }
    } else {
      const previousX = state.byeoli.worldX;
      state.byeoli.worldX += state.byeoli.speed * dt;
      if (state.byeoli.worldX >= state.camera.worldLen) {
        state.byeoli.worldX %= state.camera.worldLen;
        for (const prop of state.props) {
          prop.reactedThisPass = false;
          prop.phase = 'unseen';
        }
      }
      state.byeoli.walkPhase += dt * 8;
      if (state.telemetry) {
        state.telemetry.fatigue = Math.max(0, state.telemetry.fatigue - dt * 0.002);
      }
      if (state.byeoli.worldX !== previousX) maybeEncounter(next, now);
    }

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