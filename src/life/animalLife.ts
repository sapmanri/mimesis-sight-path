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

export function animalTemperament(kind: string): AnimalTemperament {
  return { ...DEFAULT, ...(TEMPERAMENT[kind] ?? {}) };
}

export type AnimalClips = {
  idle: THREE.AnimationAction | null;
  walk: THREE.AnimationAction | null;
  run: THREE.AnimationAction | null;
  extras: THREE.AnimationAction[];
};

function findClip(clips: THREE.AnimationClip[], words: RegExp): THREE.AnimationClip | null {
  return clips.find((clip) => words.test(clip.name.toLowerCase())) ?? null;
}

export function mapAnimalClips(mixer: THREE.AnimationMixer, clips: THREE.AnimationClip[]): AnimalClips {
  const idleClip = findClip(clips, /idle|stand|breath|graze|eat/);
  const walkClip = findClip(clips, /walk|walking|trot/);
  const runClip = findClip(clips, /run|running|gallop|sprint/);
  const used = new Set([idleClip, walkClip, runClip].filter(Boolean));
  return {
    idle: idleClip ? mixer.clipAction(idleClip) : clips[0] ? mixer.clipAction(clips[0]) : null,
    walk: walkClip ? mixer.clipAction(walkClip) : null,
    run: runClip ? mixer.clipAction(runClip) : null,
    extras: clips.filter((clip) => !used.has(clip)).map((clip) => mixer.clipAction(clip)),
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
  if (state.mode === mode && state.current?.isRunning()) return;
  const next = mode === 'run' ? (state.clips?.run ?? state.clips?.walk) : mode === 'walk' ? state.clips?.walk : state.clips?.idle;
  if (!next) return;
  if (state.current && state.current !== next) state.current.fadeOut(0.22);
  next.reset().fadeIn(0.22).play();
  state.current = next;
  state.mode = mode;
}

export function chooseAnimalGoal(state: AnimalLifeState): void {
  const cfg = animalTemperament(state.kind);
  const axis = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize();
  const angle = cfg.homeRadius * (0.25 + Math.random() * 0.75);
  state.goal.copy(state.home).applyAxisAngle(axis, angle).normalize();
  state.timer = cfg.idleMin + Math.random() * (cfg.idleMax - cfg.idleMin);
}
