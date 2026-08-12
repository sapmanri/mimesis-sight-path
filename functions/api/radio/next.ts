// 별이 라디오 스테이션 — 편성 틱. POST /api/radio/next (X-Pulse-Key)
//
// 한 번 부르면 별이가 방송 한 토막을 짓는다. **사연이 없어도 돈다** — 그게 draft와의
// 차이이자 스테이션의 핵심이다: "별이는 그 스테이션 안에서 혼자 계속 놀아. 책 얘기도
// 하고 날씨 얘기도 하고 빼콩이 얘기도 하고, 그러다가 사연이 들어오면." (Vase 08-12)
//
// 사연이 기다리고 있으면 상황에 실어 준다 — 읽을지 말지도 별이가 정한다(안 읽으면
// 대기열에 남는다). 검열 거절 사연은 표시하고 이번 틱은 혼자 논다.

import {
  RADIO_QUEUE_KEY, RADIO_DRAFT_KEY, moderateStory, writeRadioScript,
  type RadioStory, type RadioDraft, type RadioSituation,
} from '../_radio.ts';
import { LIBRARY_SHELF_KEY, type LibraryFind } from '../_radio-library.ts';
import { timeLabelOf } from './draft.ts';

interface Env { PLANET: KVNamespace; PULSE_KEY?: string; ANTHROPIC_API_KEY?: string }

const FEED_KEY = 'feed';
const DRAFT_INDEX_KEY = 'radio:drafts';
const DRAFT_INDEX_KEEP = 30;
// 곡 서가 (노래 편성, 08-12 밤) — 정본은 KV. 채우는 손은 byeol-radio/songs-sync.sh.
const SONGS_KEY = 'radio:songs';
interface RadioSong { title: string; url: string; dur: number; lyrics?: string }
/** 제목 대조용 — 공백 차이로 곡을 놓치지 않는다 (별이가 제목을 새로 짓는 건 못 막지만, 그건 warning으로 남는다) */
const songKey = (t: string) => t.replace(/\s+/g, '').trim();

const JSON_HEADERS = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' };
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  if (!env.PULSE_KEY) return json(500, { ok: false, error: 'PULSE_KEY not configured' });
  if (request.headers.get('X-Pulse-Key') !== env.PULSE_KEY) return json(403, { ok: false, error: 'forbidden' });

  const raw = await env.PLANET.get(RADIO_QUEUE_KEY);
  const queue: RadioStory[] = raw ? JSON.parse(raw) : [];
  const saveQueue = () => env.PLANET.put(RADIO_QUEUE_KEY, JSON.stringify(queue));

  // 가장 오래 기다린 사연 하나를 상황에 실어 본다 — 검열 거절이면 표시하고 혼자 논다
  let story: RadioStory | null = [...queue].reverse().find((q) => q.status === 'waiting') ?? null;
  if (story) {
    const moderation = await moderateStory(env, story.text);
    if (!moderation) return json(502, { ok: false, error: 'moderation_unavailable' });
    if (!moderation.allow) {
      story.status = 'rejected';
      story.reason = `${moderation.category}: ${moderation.reason}`;
      await saveQueue();
      story = null;
    }
  }

  const [feedRaw, indexRaw, comicsRaw, songsRaw, shelfRaw] = await Promise.all([
    env.PLANET.get(FEED_KEY), env.PLANET.get(DRAFT_INDEX_KEY), env.PLANET.get('comic_scenario_log'),
    env.PLANET.get(SONGS_KEY), env.PLANET.get(LIBRARY_SHELF_KEY),
  ]);
  const feed: { icon?: string; t?: number; text?: string }[] = feedRaw ? JSON.parse(feedRaw) : [];
  const todayKst = new Date(Date.now() + 9 * 3_600_000).toISOString().slice(0, 10);
  const todayLines = feed
    .filter((p) => p.icon === '🌏' && p.text
      && new Date((p.t ?? 0) + 9 * 3_600_000).toISOString().slice(0, 10) === todayKst)
    .map((p) => String(p.text))
    .slice(0, 3);
  const draftIds: string[] = indexRaw ? JSON.parse(indexRaw) : [];
  const recentScripts: string[] = [];
  for (const did of draftIds.slice(0, 2)) {
    const dRaw = await env.PLANET.get(RADIO_DRAFT_KEY(did));
    if (dRaw) { const d = JSON.parse(dRaw) as { script?: string }; if (d.script) recentScripts.push(d.script); }
  }

  // 별리 코믹스 — 별이가 지은 이야기 창고(20편+)에서 두 편을 상황에 실어 준다.
  // 게놈 자산 재사용(Vase 08-12) + 소재가 좁게 도는 문제의 자연 해소.
  type ComicLogEntry = { scenario?: { title?: string; epigraph?: string; panels?: { caption?: string | null }[] } };
  const comicsLog: ComicLogEntry[] = comicsRaw ? JSON.parse(comicsRaw) : [];
  const comicBits = comicsLog
    .map((e) => e.scenario ?? (e as ComicLogEntry['scenario']))
    .filter((s): s is NonNullable<typeof s> => !!s?.title)
    .sort(() => Math.random() - 0.5)
    .slice(0, 2)
    .map((s) => ({
      title: String(s.title).slice(0, 40),
      epigraph: String(s.epigraph ?? '').slice(0, 60),
      lines: (s.panels ?? []).map((p) => p.caption).filter((c): c is string => !!c).slice(0, 2).map((c) => c.slice(0, 60)),
    }));

  const songs: RadioSong[] = songsRaw ? JSON.parse(songsRaw) : [];

  // 서재 산책 발견 (책 분야 개방, 08-12 밤) — 최근 두 권만 상황에. 시점은 사람 말로.
  const shelf: LibraryFind[] = shelfRaw ? JSON.parse(shelfRaw) : [];
  const agoLabel = (at: number): string => {
    const h = (Date.now() - at) / 3_600_000;
    return h < 2 ? '조금 전' : h < 24 ? '오늘' : '요 며칠 사이';
  };
  const libraryFinds = shelf.slice(0, 2).map((b) => ({
    title: b.title, author: b.author, note: b.note, ago: agoLabel(b.at),
  }));

  const hour = Number(new Date(Date.now() + 9 * 3_600_000).toISOString().slice(11, 13));
  const situation: RadioSituation = {
    timeLabel: timeLabelOf(hour),
    todayLines,
    story: story?.text ?? null,
    waitingCount: queue.filter((q) => q.status === 'waiting' && q.id !== story?.id).length,
    recentScripts,
    comicBits,
    songShelf: songs.map((g) => ({ title: g.title })),
    libraryFinds,
  };

  const written = await writeRadioScript(env, situation);
  if (!written) return json(502, { ok: false, error: 'writer_failed' });

  const storyRead = !!story && !written.warnings.some((w) => w.startsWith('story_not_read'));
  const id = story?.id ?? `solo-${Date.now().toString(36)}`;
  if (story && storyRead) { story.status = 'used'; await saveQueue(); }

  // 별이가 고른 곡을 서가와 대조 — 서가에 없는 제목은 방송에 못 나간다 (경고만 남긴다)
  const picked = written.songTitle
    ? songs.find((g) => songKey(g.title) === songKey(written.songTitle!)) ?? null
    : null;
  const warnings = [...written.warnings];
  if (written.songTitle && !picked) warnings.push(`song_not_found: ${written.songTitle}`);

  const draft: RadioDraft = {
    id, at: Date.now(), story: story?.text ?? '',
    moderation: { allow: true, category: story ? 'ok' : 'solo', reason: '' },
    script: written.script, voiceNote: written.voiceNote, songTitle: written.songTitle, situation,
    provenance: written.provenance, warnings,
  };
  await Promise.all([
    env.PLANET.put(RADIO_DRAFT_KEY(id), JSON.stringify(draft)),
    env.PLANET.put(DRAFT_INDEX_KEY, JSON.stringify([id, ...draftIds.filter((x) => x !== id)].slice(0, DRAFT_INDEX_KEEP))),
  ]);
  return json(200, {
    // dj: 별리 라디오의 DJ 슬롯 — 초대 DJ는 별이. 훗날 삽만리 등 다른 게놈이 꽂힌다 (Vase 08-12).
    ok: true, id, dj: 'byeoli', kind: storyRead ? 'story' : 'talk', storyRead,
    script: written.script, voiceNote: written.voiceNote,
    // 노래 편성 (08-12 밤): 별이가 고른 곡의 실물 — 조립기(station.sh)가 토막 뒤에 잇는다
    song: picked ? { title: picked.title, url: picked.url, dur: picked.dur, lyrics: picked.lyrics ?? '' } : null,
    title: written.script.split('\n')[0].slice(0, 60),
    warnings,
  });
};
