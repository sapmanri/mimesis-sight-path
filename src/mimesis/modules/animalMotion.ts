import * as THREE from 'three';

export const ROAMING_ANIMALS = new Set([
  'cow', 'dog', 'duck', 'chicky', 'horse', 'piggy', 'bear', 'deer', 'boar', 'wolf', 'rabbit',
]);

export type AnimalTemperament = {
  speed: number;
  runSpeed: number;
  homeRadius: number;
  idleMin: number;
  idleMax: number;
  fleeDistance: number;
  approachDistance: number;
};

const DEFAULT: AnimalTemperament = {
  speed: 0.16, runSpeed: 0.32, homeRadius: 0.13,
  idleMin: 2, idleMax: 6, fleeDistance: 0.055, approachDistance: 0,
};

const TEMPERAMENT: Record<string, Partial<AnimalTemperament>> = {
  rabbit: { speed: 0.28, runSpeed: 0.62, homeRadius: 0.10, idleMin: 0.8, idleMax: 2.5, fleeDistance: 0.085 },
  chicky: { speed: 0.12, runSpeed: 0.22, homeRadius: 0.055, idleMin: 0.5, idleMax: 1.8, fleeDistance: 0.04 },
  duck: { speed: 0.10, runSpeed: 0.17, homeRadius: 0.08, idleMin: 1.2, idleMax: 3.5, fleeDistance: 0.045 },
  dog: { speed: 0.24, runSpeed: 0.48, homeRadius: 0.16, idleMin: 1.0, idleMax: 3.0, approachDistance: 0.12 },
  cow: { speed: 0.065, runSpeed: 0.12, homeRadius: 0.07, idleMin: 4, idleMax: 10, fleeDistance: 0.025 },
  piggy: { speed: 0.11, runSpeed: 0.22, homeRadius: 0.08, idleMin: 1.5, idleMax: 4 },
  horse: { speed: 0.18, runSpeed: 0.5, homeRadius: 0.18, idleMin: 2, idleMax: 5, fleeDistance: 0.065 },
  deer: { speed: 0.18, runSpeed: 0.55, homeRadius: 0.18, idleMin: 2, idleMax: 5, fleeDistance: 0.10 },
  bear: { speed: 0.10, runSpeed: 0.24, homeRadius: 0.13, idleMin: 3, idleMax: 7, fleeDistance: 0.035 },
  boar: { speed: 0.15, runSpeed: 0.42, homeRadius: 0.14, idleMin: 1.5, idleMax: 4, fleeDistance: 0.055 },
  wolf: { speed: 0.19, runSpeed: 0.48, homeRadius: 0.22, idleMin: 1.5, idleMax: 4, fleeDistance: 0.07 },
};

// makeAnimalState()와 mapAnimalClips()는 PlanetWorld에서 즉시 연속 호출된다.
// 그 사이에 로드된 종을 기억해 실제 보행 클립 유무를 종별로 기록한다.
let pendingKind: string | null = null;
const motionReady = new Map<string, boolean>();

export function animalTemperament(kind: string): AnimalTemperament {
  const cfg = { ...DEFAULT, ...(TEMPERAMENT[kind] ?? {}) };
  // 애니메이션이 검사된 뒤 Walk가 없으면 절대 미끄러지지 않는다.
  if (motionReady.get(kind) === false) return { ...cfg, speed: 0, runSpeed: 0 };
  return cfg;
}

export type AnimalClips = {
  idle: THREE.AnimationAction | null;
  walk: THREE.AnimationAction | null;
  run: THREE.AnimationAction | null;
  extras: THREE.AnimationAction[];
};

function exact(clips: THREE.AnimationClip[], names: string[]): THREE.AnimationClip | null {
  return clips.find((clip) => names.some((name) => clip.name.toLowerCase() === name.toLowerCase())) ?? null;
}

function matching(clips: THREE.AnimationClip[], pattern: RegExp): THREE.AnimationClip | null {
  return clips.find((clip) => pattern.test(clip.name)) ?? null;
}

function prepare(action: THREE.AnimationAction | null, timeScale = 1): THREE.AnimationAction | null {
  if (!action) return null;
  action.enabled = true;
  action.setLoop(THREE.LoopRepeat, Infinity);
  action.setEffectiveWeight(1);
  action.setEffectiveTimeScale(timeScale);
  action.clampWhenFinished = false;
  return action;
}

/**
 * 지역맵 BUILD 109에서 실제 젖소가 정상 보행하는 선택 순서를 그대로 사용한다.
 * Walking_A → 정확한 Walk 계열 → 이름에 walk 포함. 첫 클립을 무조건 걷기로 쓰지 않는다.
 */
export function mapAnimalClips(mixer: THREE.AnimationMixer, clips: THREE.AnimationClip[]): AnimalClips {
  const walkClip = exact(clips, ['Walking_A', 'Walking', 'Walk', 'Walk_Loop', 'Walking_Loop'])
    ?? matching(clips, /walking_a$|^walk(ing)?(_loop)?$|\|walk/i)
    ?? matching(clips, /walk|trot/i)
    ?? null;
  const runClip = exact(clips, ['Running_A', 'Running', 'Run', 'Run_Loop', 'Gallop'])
    ?? matching(clips, /run|running|gallop|sprint/i)
    ?? null;
  const idleClip = exact(clips, ['Idle', 'Idle_A', 'Idle_B', 'Standing', 'Stand'])
    ?? matching(clips, /idle/i)
    ?? matching(clips, /stand|breath|graze|eat/i)
    ?? clips.find((clip) => clip !== walkClip && clip !== runClip) ?? null;

  const kind = pendingKind;
  pendingKind = null;
  if (kind) motionReady.set(kind, Boolean(walkClip));

  const used = new Set([idleClip, walkClip, runClip].filter((clip): clip is THREE.AnimationClip => Boolean(clip)));
  const idle = prepare(idleClip ? mixer.clipAction(idleClip) : null, 1);
  const walk = prepare(walkClip ? mixer.clipAction(walkClip) : null, 1);
  const run = prepare(runClip ? mixer.clipAction(runClip) : null, 1.05);

  return {
    idle,
    walk,
    run,
    extras: clips.filter((clip) => !used.has(clip)).map((clip) => prepare(mixer.clipAction(clip))!).filter(Boolean),
  };
}

export type AnimalMode = 'idle' | 'walk' | 'run';

export type AnimalLifeState = {
  kind: string;
  home: THREE.Vector3;
  dir: THREE.Vector3;
  tangent: THREE.Vector3;
  goal: THREE.Vector3;
  timer: number;
  mode: AnimalMode;
  mixer: THREE.AnimationMixer | null;
  clips: AnimalClips | null;
  current: THREE.AnimationAction | null;
  seed: number;
};

export function makeAnimalState(kind: string, home: THREE.Vector3, seed: number): AnimalLifeState {
  pendingKind = kind;
  const up = home.clone().normalize();
  const tangent = new THREE.Vector3(0, 1, 0).cross(up);
  if (tangent.lengthSq() < 1e-5) tangent.set(1, 0, 0).cross(up);
  tangent.normalize();
  return {
    kind, home: up.clone(), dir: up.clone(), tangent, goal: up.clone(), timer: 0.5 + Math.random() * 2,
    mode: 'idle', mixer: null, clips: null, current: null, seed,
  };
}

export function playAnimalMode(state: AnimalLifeState, mode: AnimalMode): void {
  // 걷기 클립 없는 모델은 정지 생명으로 남긴다. 위치만 미끄러지는 상태를 허용하지 않는다.
  if ((mode === 'walk' || mode === 'run') && !state.clips?.walk) return;
  if (state.mode === mode && state.current?.isRunning()) return;

  const next = mode === 'run'
    ? (state.clips?.run ?? state.clips?.walk ?? null)
    : mode === 'walk'
      ? (state.clips?.walk ?? null)
      : (state.clips?.idle ?? null);
  if (!next) return;

  if (state.current && state.current !== next) state.current.fadeOut(0.28);
  next.enabled = true;
  next.setLoop(THREE.LoopRepeat, Infinity);
  next.reset().setEffectiveWeight(1).fadeIn(0.28).play();
  state.current = next;
  state.mode = mode;
}

export function chooseAnimalGoal(state: AnimalLifeState): void {
  const cfg = animalTemperament(state.kind);
  if (cfg.speed <= 0) {
    state.goal.copy(state.dir);
    state.timer = cfg.idleMin + Math.random() * (cfg.idleMax - cfg.idleMin);
    return;
  }
  const axis = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize();
  const angle = cfg.homeRadius * (0.25 + Math.random() * 0.75);
  state.goal.copy(state.home).applyAxisAngle(axis, angle).normalize();
  state.timer = cfg.idleMin + Math.random() * (cfg.idleMax - cfg.idleMin);
}
