export const PPAEKKONG_CORE_VERSION = 'ppaekkong-core-v1.0';

export const PPAEKKONG_CORE = Object.freeze({
  id: 'ppaekkong',
  displayName: '빼콩',
  species: 'white-cat',
  role: 'parallel-observer',
  direction: Object.freeze({
    observesByeoli: true,
    byeoliObservesPpaekkong: false,
    followsOwnPath: true,
  }),
  attention: Object.freeze({
    scent: 1,
    movement: 0.9,
    smallLivingThing: 0.86,
    trace: 0.78,
    warmth: 0.72,
    object: 0.64,
    byeoli: 0.58,
  }),
  affinities: Object.freeze({
    byeoli: 18,
    stay: 6,
    likedObject: 4,
    otherObject: 1,
  }),
  interests: Object.freeze([
    'lounge', 'plant', 'curiosity', 'storage', 'supplies',
    'flower', 'seed', 'bird', 'bug', 'food',
  ]),
  expression: Object.freeze({
    terseChance: 0.4,
    voiceRatioMax: 0.4,
    neverSpeaksForByeoli: true,
    diaryStorage: 'world-local',
  }),
  evidenceContract: Object.freeze({
    boundary: 'observe(context) -> DiaryEntry | null',
    sources: ['self-encounter', 'parallel-observation', 'return'],
    rule: 'actual events only; no invented personality',
  }),
});

export function ppaekkongCoreState() {
  return {
    ok: true as const,
    version: PPAEKKONG_CORE_VERSION,
    being: PPAEKKONG_CORE,
    authority: 'mimesis-sight-path' as const,
  };
}
