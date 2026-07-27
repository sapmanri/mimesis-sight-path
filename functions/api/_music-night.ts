// 밤 배선 — 하루치 선곡을 처음부터 끝까지 (Vase 설계 2026-07-27)
//
//   그날 기억 → 의도 → 검색·읽기 → 서가 확인 → 저장소 → 재생목록 → 스레드 문장
//
// 이 파일은 **일을 새로 하지 않는다.** 이미 선 부품들을 순서대로 부르고, 각 단계에서
// 무슨 일이 있었는지를 영수증 하나에 모은다. 판단은 전부 부품 안에 있다.
//
// ⚠ **순서에 이유가 있다.**
//   저장소를 재생목록보다 **먼저** 쓴다. 조사(검색·읽기)가 이 파이프라인에서 제일 비싼
//   단계인데, 재생목록 만들다 실패했다고 그날 조사를 통째로 잃으면 다음 날 같은 조사를
//   또 한다. 서가 확인까지 끝난 결과는 재생목록과 무관하게 남겨야 한다.
//
// ⚠ **스레드에 직접 올리지 않는다.** 문장만 만들어 돌려준다.
//   Threads 봇은 크론으로 실발행 중인 자율 시스템이고, 프로젝트 규칙상 건드리지 않는다.
//   여기서 발행까지 하면 두 개의 발행 주체가 생긴다 — 어제 크론 이중 발행으로 겪은 일이다.

import { buildIntent, type SearchIntent } from './_music-intent.ts';
import { curateDay, type MusicWebEnv } from './_music-web.ts';
import { verifyMany, watchUrl, type YoutubeEnv } from './_shelf-youtube.ts';
import { publishDayPlaylist, type PlaylistEnv, type PlaylistTrack } from './_shelf-playlist.ts';
import {
  readArchive, recordSongs, type ArchiveEnv, type SongEntry,
} from './_song-archive.ts';
import { memoryKey, type DayMemory } from './_memory-event.ts';

export type NightEnv = ArchiveEnv & MusicWebEnv & YoutubeEnv & PlaylistEnv;

/** 하루에 서가에서 확인할 곡 수 상한. search.list가 하루 100회뿐이라 넉넉히 잡지 않는다. */
export const SHELF_BUDGET = 8;

export interface NightReceipt {
  date: string;
  pack: string;
  /** 쉬는 날이면 그 사유. 관찰이 없으면 선곡도 없다 */
  rest: string | null;
  /** 어느 단계에서 멈췄나 — 성공이면 'done' */
  step: 'memory' | 'intent' | 'curate' | 'shelf' | 'archive' | 'playlist' | 'done';
  error: string | null;

  queries: string[];
  read: string[];
  /** 서가에서 확인된 곡 (재생목록에 담긴 것) */
  onShelf: Array<{ title: string; artist: string; videoId: string; url: string }>;
  /** 서가에 없어서 못 담은 곡 — 조사는 남는다 */
  notOnShelf: Array<{ title: string; artist: string; why: string }>;
  archive: { saved: number; total: number; skipped: Array<{ title: string; why: string[] }> } | null;
  playlistUrl: string | null;
  /** 스레드에 올릴 문장. **여기서 올리지는 않는다** */
  threadText: string | null;
  notes: string[];
}

const emptyReceipt = (date: string, pack: string): NightReceipt => ({
  date, pack, rest: null, step: 'memory', error: null,
  queries: [], read: [], onShelf: [], notOnShelf: [], archive: null,
  playlistUrl: null, threadText: null, notes: [],
});

/** 스레드 문장 — 중심곡 하나와 별이의 이유. 짧게.
    ⚠ 가사도 리뷰 원문도 아니다. `because`는 별이가 오늘의 관찰에 걸어 쓴 말이다. */
export function buildThreadText(
  center: { title: string; artist: string; because: string } | null, playlistUrl: string | null,
): string | null {
  if (!center) return null;
  return [
    `${center.title} — ${center.artist}`,
    center.because,
    playlistUrl,
  ].filter(Boolean).join('\n\n');
}

/** 판정이 chosen이고 role이 center인 항목을 찾는다 (하루에 하나뿐) */
const centerOf = (es: SongEntry[], date: string) =>
  es.find((e) => e.verdict === 'chosen' && e.chosen.some((c) => c.date === date && c.role === 'center')) ?? null;

export async function runMusicNight(
  env: NightEnv,
  opts: { date: string; pack: string; now: number; shelfBudget?: number; skipPlaylist?: boolean },
): Promise<NightReceipt> {
  const r = emptyReceipt(opts.date, opts.pack);

  // ① 그날의 기억
  const raw = await env.PLANET.get(memoryKey(opts.date));
  if (!raw) return { ...r, step: 'memory', error: 'no_memory', rest: 'no_day' };
  let day: DayMemory;
  try { day = JSON.parse(raw) as DayMemory; }
  catch (e) { return { ...r, step: 'memory', error: `memory_unreadable: ${(e as Error).message}` }; }

  // ② 게놈이 오늘의 검색 방향을 정한다
  const archive = await readArchive(env);
  const { intent, rest, errors } = buildIntent({ day, pack: opts.pack, archive, todayKst: opts.date });
  if (errors.length) r.notes.push(...errors);
  // ⚠ 쉬는 날은 실패가 아니다. 관찰이 없으면 억지로 한 곡을 짜내지 않는다
  if (rest || !intent) return { ...r, step: 'intent', rest, error: rest ? null : 'intent_failed' };

  // ③ 웹을 검색하고 읽고 판단한다
  const cur = await curateDay(env, intent, opts.now);
  r.queries = cur.queries;
  r.read = cur.read;
  if (cur.toolErrors.length) r.notes.push(...cur.toolErrors);
  if (cur.rejectedPicks.length) r.notes.push(...cur.rejectedPicks.map((p) => `pick_rejected: ${p.title} — ${p.why}`));
  if (cur.error) return { ...r, step: 'curate', error: cur.error };
  if (!cur.entries.length) return { ...r, step: 'curate', error: 'nothing_chosen' };

  // ④ 서가에서 음원을 확인한다 — 고른 곡만. 탈락한 곡을 찾아볼 이유가 없다
  const chosen = cur.entries.filter((e) => e.verdict === 'chosen');
  const shelf = await verifyMany(
    env, chosen.map((e) => ({ title: e.title, artist: e.artist })), opts.shelfBudget ?? SHELF_BUDGET,
  );
  if (shelf.skipped.length) r.notes.push(`shelf_budget_skipped: ${shelf.skipped.length}곡`);

  const entries: SongEntry[] = [...cur.entries];
  shelf.results.forEach((res, i) => {
    const e = chosen[i];
    const target = entries.find((x) => x.key === e.key);
    if (!target) return;
    if (res.best) {
      target.shelf = {
        shelf: 'youtube', id: res.best.candidate.id, url: watchUrl(res.best.candidate.id),
        official: res.best.reasons.includes('official_channel'), matchScore: res.best.score,
      };
      r.onShelf.push({ title: e.title, artist: e.artist, videoId: res.best.candidate.id, url: watchUrl(res.best.candidate.id) });
    } else {
      // ⚠ 서가에 없다고 조사를 버리지 않는다. shelf만 null로 남는다
      r.notOnShelf.push({ title: e.title, artist: e.artist, why: res.error ?? 'not_found' });
    }
  });

  // ⑤ 저장소 — **재생목록보다 먼저.** 조사가 제일 비싸다
  try {
    r.archive = await recordSongs(env, entries, opts.now);
  } catch (e) {
    return { ...r, step: 'archive', error: `archive_failed: ${(e as Error).message}` };
  }

  // ⑥ 재생목록 — 서가에서 확인된 곡만, 중심곡을 맨 앞에
  if (opts.skipPlaylist) return { ...r, step: 'done', notes: [...r.notes, 'playlist_skipped'] };

  const center = centerOf(entries, opts.date);
  const ordered = [...r.onShelf].sort((a, b) =>
    (b.videoId === center?.shelf?.id ? 1 : 0) - (a.videoId === center?.shelf?.id ? 1 : 0));
  const tracks: PlaylistTrack[] = ordered.map((t) => ({ videoId: t.videoId, title: t.title, artist: t.artist }));

  const pl = await publishDayPlaylist(env, {
    date: opts.date, centralImage: intent.centralImage, tracks,
    description: describe(intent),
  });
  if (pl.failed.length) r.notes.push(...pl.failed.map((f) => `playlist_item_failed: ${f.track.title} — ${f.error}`));
  if (pl.error) return { ...r, step: 'playlist', error: pl.error };
  r.playlistUrl = pl.url;

  // ⑦ 스레드 문장 — 만들기만 한다
  const cm = center?.chosen.find((c) => c.date === opts.date);
  r.threadText = buildThreadText(
    center && cm ? { title: center.title, artist: center.artist, because: cm.because } : null,
    pl.url,
  );
  return { ...r, step: 'done' };
}

/** 재생목록 설명 — 그날 무엇을 보고 찾았는지. 나중에 목록만 봐도 그날이 읽히게. */
function describe(intent: SearchIntent): string {
  return [
    intent.centralImage ? `오늘의 장면: ${intent.centralImage}` : '',
    '',
    ...intent.material.map((l) => `· ${l}`),
  ].filter(Boolean).join('\n');
}
