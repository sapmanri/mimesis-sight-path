// BUILD 403: Becoming Byeoli
// Memory는 사실을 보존하고, 이 모듈은 반복에서 별이다움을 매번 다시 계산한다.
// Habit / Personality / Identity는 원본 Memory를 수정하지 않는 파생 데이터다.
import type { LifeMemory } from './lifeArchive';

export type ByeoliHabit = {
  id: string;
  label: string;
  count: number;
  strength: number;
  confidence: number;
  sourceMemoryIds: string[];
  firstAppeared: string;
  lastUpdated: string;
};

export type ByeoliPersonality = {
  id: string;
  label: string;
  weight: number;
  derivedFromHabits: string[];
  updatedAt: string;
};

export type ByeoliIdentity = {
  id: string;
  signature: string;
  stability: number;
  firstAppeared: string;
  lastConfirmed: string;
};

export type SignatureMoment = {
  memoryId: string;
  kind: 'first' | 'long-stay' | 'rare' | 'turning-point';
  score: number;
  reason: string;
  createdAt: string;
};

export type BecomingByeoli = {
  version: 1;
  calculatedAt: string;
  memoryCount: number;
  habits: Record<string, ByeoliHabit>;
  personality: Record<string, ByeoliPersonality>;
  identity: ByeoliIdentity[];
  signatureMoments: SignatureMoment[];
};

const KEY = 'mimesis.becomingByeoli.v1';
const RARE = new Set(['comet', 'shooting_star', 'moon_phase', 'campfire', 'mail', 'first_snow', 'snow_in']);

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));
const normTarget = (m: LifeMemory) => (m.target ?? '').trim().toLowerCase();

function habitSignals(memory: LifeMemory): Array<{ id: string; label: string; amount?: number }> {
  const target = normTarget(memory);
  const out: Array<{ id: string; label: string; amount?: number }> = [];
  const has = (re: RegExp) => re.test(target);

  if (has(/flower|꽃|grass|풀|tree|나무|bush|수풀/)) out.push({ id: 'notice_living_things', label: '살아 있는 작은 것 앞에서 멈춘다' });
  if (has(/moon|달|star|별|comet|혜성/)) out.push({ id: 'look_at_night_sky', label: '밤하늘을 오래 바라본다' });
  if (has(/book|책|letter|편지|mail/)) out.push({ id: 'choose_words', label: '사물보다 문장을 오래 품는다' });
  if (has(/chair|bench|의자|벤치|rock|바위/)) out.push({ id: 'rest_where_quiet', label: '조용한 자리에 머문다' });
  if (has(/ppaekkong|빼콩|dog|강아지|rabbit|토끼|cow|소|duck|오리|deer|사슴/)) out.push({ id: 'stay_with_creatures', label: '다른 생명 곁에 머문다' });
  if (memory.action === 'photo') out.push({ id: 'keep_a_scene', label: '지나가는 장면을 사진으로 남긴다' });
  if (memory.journal) out.push({ id: 'write_after_living', label: '살아본 뒤에 글을 쓴다' });
  if (memory.weather === 'rain') out.push({ id: 'walk_in_rain', label: '비가 와도 밖에 머문다' });
  if (memory.action === 'nightfall' || has(/moon|달|star|별/)) out.push({ id: 'wake_at_night', label: '밤이 오면 오히려 깨어난다' });

  const stay = Number(memory.extra.staySeconds ?? 0);
  if (Number.isFinite(stay) && stay >= 10) out.push({ id: 'linger', label: '쉽게 지나치지 않고 오래 머문다', amount: Math.min(3, stay / 20) });
  return out;
}

export function deriveBecomingByeoli(memories: LifeMemory[], now = new Date().toISOString()): BecomingByeoli {
  const bins = new Map<string, { label: string; count: number; amount: number; ids: string[]; first: string; last: string }>();
  const firstTarget = new Set<string>();
  const signatures: SignatureMoment[] = [];

  for (const m of memories) {
    for (const sig of habitSignals(m)) {
      const prev = bins.get(sig.id) ?? { label: sig.label, count: 0, amount: 0, ids: [], first: m.timestamp, last: m.timestamp };
      prev.count += 1;
      prev.amount += sig.amount ?? 1;
      prev.ids.push(m.id);
      prev.last = m.timestamp;
      bins.set(sig.id, prev);
    }

    const target = normTarget(m);
    if (target && !firstTarget.has(target)) {
      firstTarget.add(target);
      signatures.push({ memoryId: m.id, kind: 'first', score: 3, reason: `${m.target}을(를) 처음 만난 순간`, createdAt: m.timestamp });
    }
    const stay = Number(m.extra.staySeconds ?? 0);
    if (Number.isFinite(stay) && stay >= 30) signatures.push({ memoryId: m.id, kind: 'long-stay', score: Math.min(8, 3 + stay / 30), reason: `${Math.round(stay)}초 동안 떠나지 않은 순간`, createdAt: m.timestamp });
    if (RARE.has(m.action)) signatures.push({ memoryId: m.id, kind: 'rare', score: 7, reason: `드문 사건 — ${m.action}`, createdAt: m.timestamp });
  }

  const habits: Record<string, ByeoliHabit> = {};
  for (const [id, b] of bins) {
    habits[id] = {
      id,
      label: b.label,
      count: b.count,
      strength: Number(clamp01(1 - Math.exp(-b.amount / 18)).toFixed(4)),
      confidence: Number(clamp01(b.count / 12).toFixed(4)),
      sourceMemoryIds: b.ids.slice(-200),
      firstAppeared: b.first,
      lastUpdated: b.last,
    };
  }

  const personality: Record<string, ByeoliPersonality> = {};
  const makePersonality = (id: string, label: string, source: string[]) => {
    const values = source.map((h) => habits[h]?.strength ?? 0);
    const weight = values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
    if (weight < 0.08) return;
    personality[id] = { id, label, weight: Number(weight.toFixed(4)), derivedFromHabits: source.filter((h) => habits[h]), updatedAt: now };
  };
  makePersonality('quiet_observer', '작은 장면 앞에 오래 서는 관찰자', ['notice_living_things', 'linger', 'rest_where_quiet']);
  makePersonality('night_wanderer', '밤에 더 또렷해지는 산책자', ['look_at_night_sky', 'wake_at_night']);
  makePersonality('life_writer', '살아본 것을 글로 남기는 사람', ['write_after_living', 'choose_words']);
  makePersonality('gentle_companion', '다른 생명 곁을 지키는 동행자', ['stay_with_creatures', 'linger']);
  makePersonality('scene_keeper', '사라질 장면을 조용히 보관하는 기록자', ['keep_a_scene', 'notice_living_things']);

  const identity: ByeoliIdentity[] = Object.values(personality)
    .filter((p) => p.weight >= 0.22)
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 5)
    .map((p) => ({ id: p.id, signature: p.label, stability: p.weight, firstAppeared: memories[0]?.timestamp ?? now, lastConfirmed: now }));

  return {
    version: 1,
    calculatedAt: now,
    memoryCount: memories.length,
    habits,
    personality,
    identity,
    signatureMoments: signatures.sort((a, b) => b.score - a.score || b.createdAt.localeCompare(a.createdAt)).slice(0, 200),
  };
}

export function saveBecomingByeoli(memories: LifeMemory[]): BecomingByeoli {
  const result = deriveBecomingByeoli(memories);
  try { localStorage.setItem(KEY, JSON.stringify(result)); } catch { /* Memory 원본은 그대로 남는다 */ }
  window.dispatchEvent(new CustomEvent('mimesis:byeoli-became', { detail: result }));
  return result;
}

export function loadBecomingByeoli(): BecomingByeoli | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? JSON.parse(raw) as BecomingByeoli : null;
  } catch { return null; }
}

export function habitStrength(id: string): number {
  return loadBecomingByeoli()?.habits[id]?.strength ?? 0;
}
