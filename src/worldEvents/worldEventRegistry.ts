// BUILD 410-B — World Event Registry (foundation only).
// A World Event is NOT a prop. A prop is placed on the road and observed as Byeoli
// passes; a World Event actually *happens* once in the world — full-screen staging,
// sound, camera, Byeoli reaction, log — and can be delivered identically to every
// 2D/3D viewer. Long term the Authority emits events and all viewers see the same
// instance. This file defines/selects/validates events; it does NOT stage them.
// Actual rendering + sound land in 410-C+ (godzilla), 410-D (meteor), 410-E (ufo).

export type WorldEventRarity = 'uncommon' | 'rare' | 'legendary';
export type TimeOfDay = 'dawn' | 'day' | 'dusk' | 'night';
export type CameraFocus = 'sky' | 'horizon' | 'world' | 'byeoli';
export type LookDir = 'up' | 'left' | 'right' | 'forward';

export type WorldEventDefinition = {
  id: string;
  label: string;
  rarity: WorldEventRarity;
  cooldownSeconds: number;   // minimum gap between two instances of this event
  durationSeconds: number;   // how long one instance stays active
  eligibleTime?: TimeOfDay[];
  eligibleWeather?: string[];
  eligibleBiomes?: string[];
  camera?: {
    shakePx?: number;        // integer pixel shake, hard-capped at 2
    focus?: CameraFocus;
    dimBackground?: number;  // 0..1 background dim during the event
  };
  sound?: {
    cue: string;             // logical cue id, resolved by the renderer in 410-C+
    volume?: number;
    repeat?: number;         // capped at 8
    intervalMs?: number;
  };
  byeoliReaction?: {
    stopWalking?: boolean;
    look?: LookDir;
    holdSeconds?: number;
  };
  journalLines?: string[];
};

// A definition is the template; an ActiveWorldEvent is one concrete occurrence.
// "godzilla" is one definition; "the godzilla that happened at 22:14 today" is an
// instance. The Authority (later) fills this from its own clock; the shape below is
// what a snapshot's `worldEvent` field may carry. Everything must work when absent.
export type ActiveWorldEvent = {
  eventId: string;
  eventInstanceId: string;
  startedAt: number;
  endsAt: number;
  sequence: number;
  payload?: Record<string, unknown>;
};

export const WORLD_EVENT_REGISTRY: WorldEventDefinition[] = [
  {
    id: 'godzilla',
    label: '산 뒤를 걷는 거대한 그림자',
    rarity: 'legendary',
    cooldownSeconds: 86400,
    durationSeconds: 12,
    eligibleTime: ['dusk', 'night'],
    camera: { shakePx: 1, focus: 'horizon', dimBackground: 0.12 },
    sound: { cue: 'godzilla-footsteps', volume: 0.35, repeat: 3, intervalMs: 1200 },
    byeoliReaction: { stopWalking: true, look: 'up', holdSeconds: 5 },
    journalLines: [
      '산인 줄 알았는데, 산이 걸어갔다.',
      '오늘은 먼 산이 잠깐 움직였다.',
    ],
  },
  {
    id: 'meteor-shower',
    label: '밤하늘을 긋는 별들',
    rarity: 'rare',
    cooldownSeconds: 43200,
    durationSeconds: 14,
    eligibleTime: ['night'],
    eligibleWeather: ['clear'],
    camera: { shakePx: 0, focus: 'sky', dimBackground: 0.06 },
    sound: { cue: 'meteor-sparkle', volume: 0.18, repeat: 6, intervalMs: 1600 },
    byeoliReaction: { stopWalking: true, look: 'up', holdSeconds: 6 },
    journalLines: [
      '별이 몇 개, 조용히 떨어졌다.',
      '소원을 빌 새도 없이 지나갔다.',
      '밤하늘이 잠깐 붐볐다.',
    ],
  },
  {
    id: 'ufo',
    label: '멈춰 선 낯선 불빛',
    rarity: 'rare',
    cooldownSeconds: 64800,
    durationSeconds: 10,
    eligibleTime: ['dusk', 'night'],
    camera: { shakePx: 0, focus: 'sky', dimBackground: 0.1 },
    sound: { cue: 'ufo-hum', volume: 0.2, repeat: 1, intervalMs: 0 },
    byeoliReaction: { stopWalking: true, look: 'up', holdSeconds: 7 },
    journalLines: [
      '하늘에 잠깐, 설명할 수 없는 불빛이 있었다.',
      '무언가 멈춰 서서 이쪽을 보는 것 같았다.',
    ],
  },
];

export function getWorldEventById(id: string): WorldEventDefinition | undefined {
  return WORLD_EVENT_REGISTRY.find((e) => e.id === id);
}

export function listEligibleWorldEvents(context: {
  timeOfDay?: string;
  weather?: string;
  biome?: string;
}): WorldEventDefinition[] {
  return WORLD_EVENT_REGISTRY.filter((e) => {
    if (e.eligibleTime && context.timeOfDay && !e.eligibleTime.includes(context.timeOfDay as TimeOfDay)) return false;
    if (e.eligibleWeather && context.weather && !e.eligibleWeather.includes(context.weather)) return false;
    if (e.eligibleBiomes && context.biome && !e.eligibleBiomes.includes(context.biome)) return false;
    return true;
  });
}

// World Events take the whole screen, so out-of-range values are build-blocking.
const SHAKE_MAX = 2;
const REPEAT_MAX = 8;
const DURATION_MAX = 30;
const RARITIES: WorldEventRarity[] = ['uncommon', 'rare', 'legendary'];

export function validateWorldEventRegistry(): string[] {
  const errors: string[] = [];
  const seen = new Set<string>();
  for (const e of WORLD_EVENT_REGISTRY) {
    if (!e.id || !e.id.trim()) errors.push('world event with empty id');
    if (seen.has(e.id)) errors.push(`duplicate world event id: ${e.id}`);
    seen.add(e.id);
    if (!(e.durationSeconds > 0)) errors.push(`durationSeconds must be > 0: ${e.id}`);
    if (e.durationSeconds > DURATION_MAX) errors.push(`durationSeconds too long (>${DURATION_MAX}): ${e.id}`);
    if (e.cooldownSeconds < e.durationSeconds) errors.push(`cooldownSeconds < durationSeconds: ${e.id}`);
    if (!RARITIES.includes(e.rarity)) errors.push(`invalid rarity: ${e.id}`);
    if ((e.camera?.shakePx ?? 0) > SHAKE_MAX) errors.push(`camera.shakePx over ${SHAKE_MAX}: ${e.id}`);
    if ((e.sound?.repeat ?? 0) > REPEAT_MAX) errors.push(`sound.repeat over ${REPEAT_MAX}: ${e.id}`);
    if (!e.journalLines || e.journalLines.length === 0) errors.push(`journalLines empty: ${e.id}`);
  }
  return errors;
}
