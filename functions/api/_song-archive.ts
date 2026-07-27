// 곡 저장소 — 별이가 만난 음악의 기억 (Vase 설계 2026-07-27)
//
// 왜 있나: 별이는 매일 웹을 돌아다니며 오늘과 닮은 음악을 찾는다. 그 조사가 이 일에서
//   제일 비싸다 — 리뷰·인터뷰·앨범 소개를 읽어야 한 곡이 나온다. 기록이 없으면
//   다음 달에 같은 곡을 처음 만난 것처럼 다시 조사하고, 또 같은 이유로 탈락시킨다.
//
// ⚠ **탈락한 곡도 남긴다.** 이게 이 저장소의 핵심이다.
//   고른 곡만 남기면 저장소는 '재생목록'이지 '기억'이 아니다. 별이가 "이 곡은 오늘보다
//   지나치게 밝다"고 판단했다는 사실 자체가 다음 판단의 재료다.
//
// ⚠ **열쇠는 제목이 아니라 ISRC다.**
//   ISRC는 녹음 자체의 신분증이라 리마스터·재발매·다른 앨범 수록본을 하나로 묶는다.
//   제목+가수로 묶으면 「2011 Remaster」가 새 곡으로 잡혀 같은 곡을 두 번 고르게 된다.
//   서가(Spotify/YouTube)가 ISRC를 안 주면 그 서가의 id로, 그것도 없으면 이름으로 내려간다.
//
// 정직 계약 (그림일기·심전도와 같은 규칙):
//   · `byeoliSummary`는 **별이의 말**이다. 리뷰 원문을 옮겨 적는 자리가 아니다.
//   · 가사는 전문을 저장하지 않는다. 주제와 맥락만 남긴다 (저작권).
//   · 조사하지 않은 것을 조사한 것처럼 적지 않는다 — `sources`가 비면 비운 채로 둔다.

/** 서가 — 음원이 실제로 있는지 확인하고 재생목록을 만드는 곳.
    발견하는 두뇌가 아니다. 그래서 갈아끼울 수 있어야 한다
    (2026-07-27: Spotify 가입이 막혀 YouTube로 먼저 갈 수 있다). */
export type Shelf = 'spotify' | 'youtube';

/** 별이의 판정. candidate = 후보로 올랐고 아직 안 갈림. */
export type Verdict = 'chosen' | 'rejected' | 'candidate';

/** 하루 안에서의 자리. center 한 곡, 나머지는 그 곡에서 뻗어나간 것. */
export type Role = 'center' | 'around' | 'opening' | 'closing' | 'forPpaekong' | 'unexpected';

export interface ShelfRef {
  shelf: Shelf;
  id: string;                  // spotify track id | youtube videoId
  uri?: string;                // spotify:track:... — 재생목록에 넣을 때 쓴다
  url?: string;
  /** 공식 음원인가. 커버·라이브·노래방·8D를 걸러낸 결과를 남긴다.
      ⚠ 점수 감점이 아니라 **탈락 조건**이어야 한다 — 정확 일치 가산점이 커서
        감점만으로는 라이브 버전이 원곡을 이길 수 있다 (2026-07-27 설계 검토). */
  official?: boolean;
  matchScore?: number;
}

export interface ChosenMark {
  date: string;                // YYYY-MM-DD (KST)
  role: Role;
  /** 왜 오늘 이 곡인가 — 별이의 말. 오늘의 사건과 이어져야 한다. */
  because: string;
}

export interface SongEntry {
  key: string;                 // 아래 songKey()가 만든다
  isrc?: string | null;
  title: string;
  artist: string;
  album?: string | null;
  year?: number | null;

  shelf?: ShelfRef | null;     // 서가에서 확인되기 전에는 null이다 — 그래도 기록은 남는다

  read?: {
    sources: string[];         // 읽은 글의 주소
    byeoliSummary?: string;    // **별이의 말**. 원문 복사 금지
    themes?: string[];
  };

  verdict: Verdict;
  /** 탈락 사유 — 별이의 말. "오늘보다 지나치게 밝다" 같은. */
  rejectedReason?: string | null;

  firstSeenAt: number;         // ms
  lastTouchedAt: number;       // ms
  chosen: ChosenMark[];        // 고른 날들. 여러 번 고를 수 있다
}

export interface SongArchive {
  version: 1;
  updatedAt: number;
  songs: Record<string, SongEntry>;   // key → 항목
}

export const ARCHIVE_KEY = 'song_archive';
const MAX_SOURCES = 12;
const MAX_SUMMARY = 400;

export const emptyArchive = (): SongArchive => ({ version: 1, updatedAt: 0, songs: {} });

/** 이름을 비교 가능한 꼴로. 대소문자·괄호주석·군더더기를 떨어낸다.
    "Hurt - 2011 Remaster" 와 "Hurt (Remastered)" 가 같은 열쇠로 가야 한다. */
export function normalizeName(s: string): string {
  return String(s || '')
    .toLowerCase()
    .replace(/\(([^)]*)\)|\[([^\]]*)\]/g, ' ')                 // 괄호 주석 제거
    .replace(/\s-\s.*(remaster|version|edit|mix|mono|stereo).*$/i, ' ')
    .replace(/\b(feat|ft)\.?\s.*$/i, ' ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

/** 열쇠 — ISRC → 서가 id → 이름. 위에서부터 있는 것을 쓴다. */
export function songKey(x: { isrc?: string | null; shelf?: ShelfRef | null; title: string; artist: string }): string {
  const isrc = String(x.isrc || '').replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  if (isrc.length === 12) return `isrc:${isrc}`;
  if (x.shelf?.shelf && x.shelf?.id) return `${x.shelf.shelf}:${x.shelf.id}`;
  return `name:${normalizeName(x.artist)}|${normalizeName(x.title)}`;
}

export function validateSong(e: Partial<SongEntry>): string[] {
  const bad: string[] = [];
  if (!e.title || !String(e.title).trim()) bad.push('title_required');
  if (!e.artist || !String(e.artist).trim()) bad.push('artist_required');
  if (!e.verdict || !['chosen', 'rejected', 'candidate'].includes(e.verdict)) bad.push('verdict_invalid');
  // 탈락은 사유가 있어야 한다. 사유 없는 탈락은 다음 판단에 아무것도 못 준다.
  if (e.verdict === 'rejected' && !String(e.rejectedReason || '').trim()) bad.push('rejected_reason_required');
  // 골랐으면 언제·왜 골랐는지가 있어야 한다.
  if (e.verdict === 'chosen') {
    if (!Array.isArray(e.chosen) || !e.chosen.length) bad.push('chosen_mark_required');
    else if (e.chosen.some((c) => !c?.date || !c?.because?.trim())) bad.push('chosen_mark_incomplete');
  }
  if (e.read?.byeoliSummary && e.read.byeoliSummary.length > MAX_SUMMARY) bad.push('summary_too_long');
  if (e.read?.sources && e.read.sources.length > MAX_SOURCES) bad.push('too_many_sources');
  return bad;
}

/**
 * 항목 하나를 저장소에 넣는다. **덮어쓰지 않고 합친다.**
 *
 * ⚠ 합치는 방향이 중요하다: 이미 고른 적이 있는 곡을 나중에 후보로 다시 만나도
 *   `chosen` 기록은 지워지지 않는다. 기억은 쌓이는 것이지 갈아치우는 게 아니다.
 */
export function mergeSong(archive: SongArchive, incoming: SongEntry, now: number): SongArchive {
  const key = incoming.key || songKey(incoming);
  const prev = archive.songs[key];
  const merged: SongEntry = prev
    ? {
        ...prev,
        ...incoming,
        key,
        // 서가 정보는 한 번 확인되면 유지한다 (다음에 못 찾아도 잃지 않게)
        shelf: incoming.shelf ?? prev.shelf ?? null,
        isrc: incoming.isrc ?? prev.isrc ?? null,
        read: {
          sources: dedupe([...(prev.read?.sources || []), ...(incoming.read?.sources || [])]).slice(0, MAX_SOURCES),
          byeoliSummary: incoming.read?.byeoliSummary || prev.read?.byeoliSummary,
          themes: dedupe([...(prev.read?.themes || []), ...(incoming.read?.themes || [])]),
        },
        // 한 번이라도 골랐으면 chosen이 이긴다 — 나중에 후보로 다시 만나도 강등하지 않는다
        verdict: prev.verdict === 'chosen' || incoming.verdict === 'chosen' ? 'chosen' : incoming.verdict,
        chosen: dedupeChosen([...(prev.chosen || []), ...(incoming.chosen || [])]),
        firstSeenAt: prev.firstSeenAt || incoming.firstSeenAt || now,
        lastTouchedAt: now,
      }
    : { ...incoming, key, firstSeenAt: incoming.firstSeenAt || now, lastTouchedAt: now, chosen: incoming.chosen || [] };

  return { version: 1, updatedAt: now, songs: { ...archive.songs, [key]: merged } };
}

/** 이 곡을 전에 만난 적이 있나. 조사 전에 이걸 먼저 묻는다 — 그게 절약의 전부다. */
export const seen = (archive: SongArchive, key: string): SongEntry | null => archive.songs[key] ?? null;

/** 최근 며칠 안에 고른 곡들의 열쇠. 같은 곡이 연달아 나오지 않게 하는 데 쓴다.
    ⚠ 영원히 막지는 않는다 — 반년 뒤 같은 곡이 다시 오늘과 닮을 수 있다. */
export function recentlyChosen(archive: SongArchive, days: number, todayKst: string): Set<string> {
  const out = new Set<string>();
  const limit = new Date(`${todayKst}T00:00:00+09:00`).getTime() - days * 864e5;
  for (const s of Object.values(archive.songs)) {
    for (const c of s.chosen || []) {
      if (new Date(`${c.date}T00:00:00+09:00`).getTime() >= limit) { out.add(s.key); break; }
    }
  }
  return out;
}

/** 저장 전 안전장치 — 항목 수가 줄면 멈춘다.
    (carousel-generator의 shared_storage.js가 index.json에서 겪고 배운 것을 그대로 가져온다:
     "index 저장 중단: entry 수 감소 감지". 기억은 줄어들면 안 된다.) */
export function guardShrink(prev: SongArchive, next: SongArchive): string | null {
  const a = Object.keys(prev.songs).length, b = Object.keys(next.songs).length;
  return b < a ? `archive_shrank: ${a} → ${b}` : null;
}

// ── 보관 ──────────────────────────────────────────────────────
// KV 한 칸에 통째로 둔다. 하루 5~7곡이라 한 해를 모아도 몇 MB고, 쓰는 사람은 밤일 하나뿐이다.
//
// ⚠ KV에는 CAS(조건부 쓰기)가 없다. 읽고-고치고-쓰는 사이에 다른 쓰기가 끼면 그게 사라진다.
//   지금은 쓰는 곳이 하나라 안전하지만, **나중에 둘이 되면 이 구조로는 안 된다.**
//   그때는 carousel-generator의 `shared_storage.js`처럼 etag를 쓰는 R2로 옮겨야 한다.
//   그래서 저장 전에 `guardShrink`를 반드시 통과시킨다 — 잃는 순간을 조용히 넘기지 않게.

export interface ArchiveEnv { PLANET: KVNamespace }

export async function readArchive(env: ArchiveEnv): Promise<SongArchive> {
  const raw = await env.PLANET.get(ARCHIVE_KEY);
  if (!raw) return emptyArchive();
  try {
    const p = JSON.parse(raw) as SongArchive;
    // 깨진 값으로 덮어쓰느니 빈 것으로 시작하는 게 낫다 — 단, 그 사실을 삼키지 않는다
    if (!p || typeof p !== 'object' || !p.songs) throw new Error('shape');
    return { version: 1, updatedAt: p.updatedAt || 0, songs: p.songs };
  } catch (e) {
    throw new Error(`song_archive_unreadable: ${(e as Error).message}`);
  }
}

/** 저장. 줄어들면 던진다 — 부르는 쪽이 그 사고를 보게 한다. */
export async function writeArchive(env: ArchiveEnv, prev: SongArchive, next: SongArchive): Promise<void> {
  const shrank = guardShrink(prev, next);
  if (shrank) throw new Error(shrank);
  await env.PLANET.put(ARCHIVE_KEY, JSON.stringify(next));
}

/**
 * 오늘 만난 곡들을 한 번에 기록한다. **고른 곡만이 아니라 후보·탈락도 전부.**
 * 검증에 걸린 항목은 넣지 않고 `skipped`로 돌려준다 — 조용히 버리지 않는다.
 */
export async function recordSongs(
  env: ArchiveEnv, entries: SongEntry[], now: number,
): Promise<{ saved: number; skipped: Array<{ title: string; why: string[] }>; total: number }> {
  const prev = await readArchive(env);
  let next = prev;
  const skipped: Array<{ title: string; why: string[] }> = [];
  let saved = 0;

  for (const e of entries) {
    const why = validateSong(e);
    if (why.length) { skipped.push({ title: e.title || '(제목 없음)', why }); continue; }
    next = mergeSong(next, { ...e, key: e.key || songKey(e) }, now);
    saved++;
  }
  if (saved) await writeArchive(env, prev, next);
  return { saved, skipped, total: Object.keys(next.songs).length };
}

const dedupe = (xs: string[]): string[] => [...new Set(xs.filter(Boolean))];

function dedupeChosen(xs: ChosenMark[]): ChosenMark[] {
  const m = new Map<string, ChosenMark>();
  for (const c of xs) if (c?.date) m.set(`${c.date}|${c.role}`, c);
  return [...m.values()].sort((x, y) => x.date.localeCompare(y.date));
}
