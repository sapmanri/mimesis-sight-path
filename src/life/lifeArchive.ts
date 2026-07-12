import type { PlanetEvent } from '../scene/planetEvents';
import { saveBecomingByeoli } from './becomingByeoli';

export type ArchiveMode = 'OFF' | 'SMART' | 'ALL';
export type PublicationMetadata = {
  magazineReady: boolean;
  bookReady: boolean;
  threadReady: boolean;
  score: number;
  reasons: string[];
};

export type LifeMemory = {
  id: string;
  memoryVersion: 1;
  byeoliAge: number;
  timestamp: string;
  planet: string;
  biome: string | null;
  season: string;
  weather: string;
  action: string;
  target: string | null;
  position: [number, number, number] | null;
  image: string | null;
  caption: string | null;
  journal: string | null;
  extra: Record<string, unknown>;
};

export type LifeStats = {
  memoryCount: number;
  totalSteps: number;
  totalDistanceMeters: number;
  totalPhotos: number;
  totalObservations: number;
  totalJournals: number;
  flowerWatchSeconds: number;
  ppaekkongTogetherSeconds: number;
  longestStayedPlace: string | null;
  longestStaySeconds: number;
  firstMemoryAt: string | null;
  lastMemoryAt: string | null;
};

export type ObjectHistory = {
  id: string;
  visitCount: number;
  firstSeen: string;
  lastSeen: string;
  totalStaySeconds: number;
  favoriteScore: number;
};

export type LifePublication = {
  memoryId: string;
  createdAt: string;
  magazineReady: boolean;
  bookReady: boolean;
  threadReady: boolean;
  score: number;
  reasons: string[];
};

export type LifeSnapshot = {
  id: string;
  createdAt: string;
  memoryCount: number;
  stats: LifeStats;
};

export type LifeArchive = {
  archiveVersion: 1;
  memories: LifeMemory[];
  stats: LifeStats;
  objects: Record<string, ObjectHistory>;
  publications: LifePublication[];
  snapshots: LifeSnapshot[];
};

const ARCHIVE_KEY = 'mimesis.lifeArchive.v1';
const MODE_KEY = 'mimesis.lifeArchive.mode.v1';
const BIRTH_KEY = 'mimesis.byeoli.birth.v1';
const REAL_DAY_TO_BYEOLI_DAYS = 120;

const EMPTY_STATS: LifeStats = {
  memoryCount: 0,
  totalSteps: 0,
  totalDistanceMeters: 0,
  totalPhotos: 0,
  totalObservations: 0,
  totalJournals: 0,
  flowerWatchSeconds: 0,
  ppaekkongTogetherSeconds: 0,
  longestStayedPlace: null,
  longestStaySeconds: 0,
  firstMemoryAt: null,
  lastMemoryAt: null,
};

const EMPTY_ARCHIVE: LifeArchive = {
  archiveVersion: 1,
  memories: [],
  stats: { ...EMPTY_STATS },
  objects: {},
  publications: [],
  snapshots: [],
};

function safeParse<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try { return JSON.parse(raw) as T; } catch { return fallback; }
}

export function getArchiveMode(): ArchiveMode {
  try {
    const value = localStorage.getItem(MODE_KEY);
    return value === 'OFF' || value === 'ALL' || value === 'SMART' ? value : 'SMART';
  } catch { return 'SMART'; }
}

export function setArchiveMode(mode: ArchiveMode): void {
  try { localStorage.setItem(MODE_KEY, mode); } catch { /* storage unavailable */ }
}

export function loadLifeArchive(): LifeArchive {
  try {
    const parsed = safeParse<LifeArchive>(localStorage.getItem(ARCHIVE_KEY), EMPTY_ARCHIVE);
    return {
      archiveVersion: 1,
      memories: Array.isArray(parsed.memories) ? parsed.memories : [],
      stats: { ...EMPTY_STATS, ...(parsed.stats ?? {}) },
      objects: parsed.objects && typeof parsed.objects === 'object' ? parsed.objects : {},
      publications: Array.isArray(parsed.publications) ? parsed.publications : [],
      snapshots: Array.isArray(parsed.snapshots) ? parsed.snapshots : [],
    };
  } catch { return structuredClone(EMPTY_ARCHIVE); }
}

function saveLifeArchive(archive: LifeArchive): void {
  try { localStorage.setItem(ARCHIVE_KEY, JSON.stringify(archive)); } catch { /* archive remains in life, even when storage is full */ }
}

function byeoliAge(now = Date.now()): number {
  let born = now;
  try {
    const stored = Number(localStorage.getItem(BIRTH_KEY));
    if (Number.isFinite(stored) && stored > 0) born = stored;
    else localStorage.setItem(BIRTH_KEY, String(now));
  } catch { /* use this moment as birth */ }
  const livedDays = Math.max(0, (now - born) / 86_400_000) * REAL_DAY_TO_BYEOLI_DAYS;
  return Number((17 + livedDays / 365.2425).toFixed(4));
}

function seasonAt(date: Date): string {
  const month = date.getMonth() + 1;
  if (month >= 3 && month <= 5) return 'spring';
  if (month >= 6 && month <= 8) return 'summer';
  if (month >= 9 && month <= 11) return 'autumn';
  return 'winter';
}

function publicationFor(memory: LifeMemory): PublicationMetadata {
  let score = 0;
  const reasons: string[] = [];
  if (memory.image) { score += 3; reasons.push('image'); }
  if (memory.journal && memory.journal.length >= 12) { score += 2; reasons.push('journal'); }
  if (memory.caption) { score += 1; reasons.push('caption'); }
  if (['comet', 'shooting_star', 'moon_phase', 'campfire', 'mail'].includes(memory.action)) { score += 3; reasons.push('rare-event'); }
  if (memory.target) { score += 1; reasons.push('encounter'); }
  if (memory.extra.reason === 'mood' || memory.extra.reason === 'event') { score += 1; reasons.push('chosen-moment'); }
  return {
    score,
    reasons,
    magazineReady: score >= 4,
    bookReady: score >= 5 && Boolean(memory.journal || memory.caption),
    threadReady: score >= 3 && Boolean(memory.image || memory.caption),
  };
}

function immutableAppend(archive: LifeArchive, memory: LifeMemory): LifeArchive {
  if (archive.memories.some((item) => item.id === memory.id)) return archive;
  const pub = publicationFor(memory);
  const stats = { ...archive.stats };
  stats.memoryCount += 1;
  stats.totalPhotos += memory.image || memory.action === 'photo' ? 1 : 0;
  stats.totalObservations += memory.action === 'observe' || Boolean(memory.target) ? 1 : 0;
  stats.totalJournals += memory.journal ? 1 : 0;
  stats.firstMemoryAt ??= memory.timestamp;
  stats.lastMemoryAt = memory.timestamp;

  const meters = Number(memory.extra.meters ?? 0);
  if (Number.isFinite(meters) && meters > 0) stats.totalDistanceMeters += meters;
  const steps = Number(memory.extra.steps ?? 0);
  if (Number.isFinite(steps) && steps > 0) stats.totalSteps += steps;

  const staySeconds = Number(memory.extra.staySeconds ?? 0);
  if (memory.target) {
    const prev = archive.objects[memory.target];
    const next: ObjectHistory = prev ? { ...prev } : {
      id: memory.target,
      visitCount: 0,
      firstSeen: memory.timestamp,
      lastSeen: memory.timestamp,
      totalStaySeconds: 0,
      favoriteScore: 0,
    };
    next.visitCount += 1;
    next.lastSeen = memory.timestamp;
    if (Number.isFinite(staySeconds) && staySeconds > 0) next.totalStaySeconds += staySeconds;
    next.favoriteScore = Number((next.visitCount * 0.7 + Math.log1p(next.totalStaySeconds) * 0.8).toFixed(3));
    archive = { ...archive, objects: { ...archive.objects, [memory.target]: next } };
    if (next.totalStaySeconds > stats.longestStaySeconds) {
      stats.longestStaySeconds = next.totalStaySeconds;
      stats.longestStayedPlace = memory.target;
    }
    if (/flower|꽃/i.test(memory.target)) stats.flowerWatchSeconds += Math.max(1, staySeconds || 1);
    if (/ppaekkong|빼콩/i.test(memory.target)) stats.ppaekkongTogetherSeconds += Math.max(1, staySeconds || 1);
  }

  const publications = [{ memoryId: memory.id, createdAt: memory.timestamp, ...pub }, ...archive.publications].slice(0, 5000);
  const memories = [...archive.memories, Object.freeze(memory)].slice(-10000);
  let snapshots = archive.snapshots;
  if (memories.length % 100 === 0) {
    snapshots = [...snapshots, {
      id: `snapshot-${memories.length}-${Date.now().toString(36)}`,
      createdAt: memory.timestamp,
      memoryCount: memories.length,
      stats: { ...stats },
    }].slice(-100);
  }
  return { ...archive, memories, stats, publications, snapshots };
}

export type MemoryInput = Partial<Omit<LifeMemory, 'id' | 'memoryVersion' | 'byeoliAge' | 'timestamp' | 'season'>> & {
  id?: string;
  timestamp?: string;
  action: string;
};

export function remember(input: MemoryInput): LifeMemory {
  const date = input.timestamp ? new Date(input.timestamp) : new Date();
  const memory: LifeMemory = {
    id: input.id ?? `mem-${date.getTime().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    memoryVersion: 1,
    byeoliAge: byeoliAge(date.getTime()),
    timestamp: date.toISOString(),
    planet: input.planet ?? 'planet',
    biome: input.biome ?? null,
    season: seasonAt(date),
    weather: input.weather ?? 'clear',
    action: input.action,
    target: input.target ?? null,
    position: input.position ?? null,
    image: input.image ?? null,
    caption: input.caption ?? null,
    journal: input.journal ?? null,
    extra: { ...(input.extra ?? {}) },
  };
  const archive = immutableAppend(loadLifeArchive(), memory);
  saveLifeArchive(archive);
  // BUILD 403: 원본 Memory를 건드리지 않고 반복에서 별이다움을 다시 계산한다.
  saveBecomingByeoli(archive.memories);
  window.dispatchEvent(new CustomEvent('mimesis:memory-created', { detail: memory }));
  return memory;
}

export function rememberPlanetEvent(event: PlanetEvent, journal: string | null, planet: string): LifeMemory {
  const target = event.data?.object ?? event.data?.country ?? event.data?.village ?? event.data?.memory ?? event.data?.stage ?? event.data?.kind ?? null;
  const weather = event.kind.startsWith('rain') ? 'rain' : event.kind.startsWith('snow') ? 'snow' : 'clear';
  return remember({
    action: event.kind,
    target,
    planet,
    weather,
    journal,
    extra: { ...(event.data ?? {}), source: 'planet-event' },
  });
}

export function shouldStoreCapture(mode: ArchiveMode, reason: 'stage' | 'mood' | 'event', caption: string): boolean {
  if (mode === 'OFF') return false;
  if (mode === 'ALL') return true;
  let score = reason === 'event' ? 3 : reason === 'mood' ? 2 : 1;
  if (caption.length >= 10) score += 1;
  return score >= 3 || Math.random() < 0.18;
}

export function rememberCapture(input: {
  planet: string;
  reason: 'stage' | 'mood' | 'event';
  image: string | null;
  caption: string;
  journal?: string | null;
  archiveMode: ArchiveMode;
}): LifeMemory {
  return remember({
    planet: input.planet,
    action: 'photo',
    image: input.image,
    caption: input.caption,
    journal: input.journal ?? null,
    extra: {
      reason: input.reason,
      archiveMode: input.archiveMode,
      r2Stored: Boolean(input.image),
      source: 'byeoli-camera',
    },
  });
}

export function getPublication(memoryId: string): LifePublication | null {
  return loadLifeArchive().publications.find((item) => item.memoryId === memoryId) ?? null;
}
