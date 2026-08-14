// 별이 라디오 스테이션 — 편성 틱. POST /api/radio/next (X-Pulse-Key)
//
// 한 번 부르면 별이가 방송 한 토막을 짓는다. **사연이 없어도 돈다** — 그게 draft와의
// 차이이자 스테이션의 핵심이다: "별이는 그 스테이션 안에서 혼자 계속 놀아. 책 얘기도
// 하고 날씨 얘기도 하고 빼콩이 얘기도 하고, 그러다가 사연이 들어오면." (Vase 08-12)
//
// 사연이 기다리고 있으면 상황에 실어 준다 — 읽을지 말지도 별이가 정한다(안 읽으면
// 대기열에 남는다). 검열 거절 사연은 표시하고 이번 틱은 혼자 논다.

import {
  RADIO_QUEUE_KEY, RADIO_DRAFT_KEY, moderateStory, writeRadioScript, pickBookcasePiece,
  type RadioStory, type RadioDraft, type RadioSituation, type BookcasePiece, buildAirMirror, pickCorner, trimSituationForCorner, lastWriterFailure, radioSystemPrompt, situationMessage,
} from '../_radio.ts';
import { LIBRARY_SHELF_KEY, type LibraryFind } from '../_radio-library.ts';
import { TOON_KEY, type ToonPost } from '../_radio-toon.ts';
import { WEB_OBSERVATIONS_KEY, type WebObservationShelf } from '../_radio-observations.ts';
import { THREADS_SHELF_KEY, YOUTUBE_SHELF_KEY, type ThreadsShelf, type YoutubeShelf } from '../_radio-social-types.ts';
import { timeLabelOf } from './draft.ts';

interface Env { PLANET: KVNamespace; PULSE_KEY?: string; ANTHROPIC_API_KEY?: string }

const FEED_KEY = 'feed';
const DRAFT_INDEX_KEY = 'radio:drafts';
const DRAFT_INDEX_KEEP = 30;
// 방송 자취 (Vase 08-12 밤 "이전 거를 기억하지는 못한다, 이런 건가?") — 날짜별 기계 기록.
// 별이가 직전 2편이 아니라 며칠을 기억하게 하는 자리. 게놈 계량 축적은 별도 매듭(431-M 경계).
const RECALL_KEY = 'radio:recall';
const RECALL_DAYS = 7;
const RECALL_ITEMS_MAX = 16;
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

  const [feedRaw, indexRaw, comicsRaw, songsRaw, shelfRaw, bookcaseRaw, toonRaw, recallRaw, threadsRaw, youtubeRaw, observationsRaw] = await Promise.all([
    env.PLANET.get(FEED_KEY), env.PLANET.get(DRAFT_INDEX_KEY), env.PLANET.get('comic_scenario_log'),
    env.PLANET.get(SONGS_KEY), env.PLANET.get(LIBRARY_SHELF_KEY), env.PLANET.get('radio:bookcase'),
    env.PLANET.get(TOON_KEY), env.PLANET.get(RECALL_KEY),
    env.PLANET.get(THREADS_SHELF_KEY), env.PLANET.get(YOUTUBE_SHELF_KEY),
    env.PLANET.get(WEB_OBSERVATIONS_KEY),
  ]);
  const trail: { date: string; items: string[] }[] = recallRaw ? JSON.parse(recallRaw) : [];
  const feed: { icon?: string; t?: number; text?: string }[] = feedRaw ? JSON.parse(feedRaw) : [];
  const todayKst = new Date(Date.now() + 9 * 3_600_000).toISOString().slice(0, 10);
  const todayLines = feed
    .filter((p) => p.icon === '🌏' && p.text
      && new Date((p.t ?? 0) + 9 * 3_600_000).toISOString().slice(0, 10) === todayKst)
    .map((p) => String(p.text))
    .slice(0, 3);
  const draftIds: string[] = indexRaw ? JSON.parse(indexRaw) : [];
  // 별이가 기억하는 방송 — 08-13 밤까지 **직전 2편**뿐이었다. 굽기가 21분→3분으로 빨라지면서
  // 기억이 상대적으로 열 배 줄었고, 그날 대본 57편 중 41편이 같은 첫마디로 시작했다(실측).
  // 12편이면 최근 40분~1시간치다. 앞의 4편은 전문, 나머지는 거울 집계에만 쓴다.
  const RECALL_DRAFTS = 12;
  const recentScripts: string[] = [];
  const recentCorners: string[] = [];
  for (const did of draftIds.slice(0, RECALL_DRAFTS)) {
    const dRaw = await env.PLANET.get(RADIO_DRAFT_KEY(did));
    if (!dRaw) continue;
    const d = JSON.parse(dRaw) as { script?: string; situation?: { corner?: { key?: string } } };
    if (d.script) recentScripts.push(d.script);
    const ck = d.situation?.corner?.key;
    if (ck) recentCorners.push(ck);
  }
  const airMirror = buildAirMirror(recentScripts);

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

  // 우리 책장 (Vase 08-12 밤) — 한 편은 펼쳐 두고, 나머지는 등이 보이게 꽂아 둔다.
  // 제목이 너무 많으면 상황이 게시판이 된다 — 등 보이는 건 8권만 무작위로.
  // 재낭독은 막지 않는다(사장 판정) — 낭독 기록은 방송 자취(trail)로 별이에게 보인다.
  const bookcasePieces: BookcasePiece[] = bookcaseRaw ? JSON.parse(bookcaseRaw) : [];
  const openPiece = pickBookcasePiece(bookcasePieces);
  const bookcase = bookcasePieces.length ? {
    open: openPiece,
    titles: bookcasePieces
      .filter((p) => !p.locked && p.title !== openPiece?.title)
      .sort(() => Math.random() - 0.5).slice(0, 8).map((p) => p.title),
    locked: bookcasePieces.filter((p) => p.locked)
      .map((p) => ({ title: p.title, about: p.about ?? '' })),
  } : undefined;

  const hour = Number(new Date(Date.now() + 9 * 3_600_000).toISOString().slice(11, 13));
  const situation: RadioSituation = {
    timeLabel: timeLabelOf(hour),
    todayLines,
    story: story?.text ?? null,
    waitingCount: queue.filter((q) => q.status === 'waiting' && q.id !== story?.id).length,
    // 전문은 앞 4편만 싣는다 — 12편 전문은 프롬프트를 불린다. 나머지는 거울(집계)이 대신 말한다.
    recentScripts: recentScripts.slice(0, 4),
    airMirror,
    comicBits,
    songShelf: songs.map((g) => ({ title: g.title })),
    libraryFinds,
    bookcase,
    // 외부 웹툰 @byeol.toon — 별이 소유 계정이 아니다. Crawl4AI 읽기 전용 최근 3편만.
    webtoonPosts: (toonRaw ? (JSON.parse(toonRaw) as { posts: ToonPost[] }).posts : []).slice(0, 3).map((p) => ({
      text: p.text, when: p.when, permalink: p.permalink,
    })),
    threadsPosts: (threadsRaw ? (JSON.parse(threadsRaw) as ThreadsShelf).posts : []).slice(0, 5).map((p) => ({
      text: p.text, when: p.timestamp, permalink: p.permalink,
    })),
    youtubeVideos: (youtubeRaw ? (JSON.parse(youtubeRaw) as YoutubeShelf).videos : []).slice(0, 5).map((v) => ({
      title: v.title, publishedAt: v.publishedAt, url: v.url, description: v.description,
    })),
    // 읽기 전용 감각 재료. engine은 브라우저/API/로컬 인덱스의 실제 통로를 숨기지 않는다.
    webObservations: (observationsRaw
      ? (JSON.parse(observationsRaw) as WebObservationShelf).sources
      : []).slice(0, 8).map((source) => ({
        id: source.id, label: source.label, kind: source.kind, engine: source.engine, sourceUrl: source.sourceUrl,
        items: source.items.slice(0, 5).map((item) => ({
          title: item.title, text: item.text, when: item.when, url: item.url,
        })),
      })),
    broadcastTrail: trail.slice(-4).map((d) => ({ date: d.date.slice(5), items: d.items.slice(-10) })),
  };

  // 이번 판의 자리 — 재료가 있는 코너 중 가장 오래 안 쓴 것. 같은 질문을 3분마다 던지지 않기 위해서다.
  const available = new Set<string>();
  if (situation.story) available.add('story');
  if (situation.songShelf?.length) available.add('song');
  if (situation.libraryFinds?.length) available.add('library');
  if (situation.bookcase?.open) available.add('bookcase');
  if (situation.webObservations?.length) available.add('web');
  if (situation.webtoonPosts?.length) available.add('toon');
  if (situation.broadcastTrail?.length) available.add('trail');
  available.add('observe');
  situation.corner = pickCorner(available, recentCorners);
  // 입력 다이어트 — 이번 자리 재료만 펼치고 나머지는 목차로 접는다(08-14 사장 지시).
  // 저장은 접기 **전** 상황으로 한다: 재현·검증에는 무엇을 가졌었는지가 필요하다.
  const sent = trimSituationForCorner(situation);

  const written = await writeRadioScript(env, sent);
  if (!written) {
    // 08-14: 부르는 쪽에서 직접 재본다 — 모듈 사이로 넘어오는 값이 비어 오는 일이 있었다.
    const sysProbe = radioSystemPrompt();
    return json(502, {
      ok: false, error: 'writer_failed', reason: lastWriterFailure,
      probe: {
        hasKey: !!env.ANTHROPIC_API_KEY,
        sysOk: !!sysProbe.prompt,
        sysWarn: sysProbe.warnings?.slice(0, 3),
        corner: situation.corner?.key ?? null,
        promptLen: situationMessage(sent).length,
      },
    });
  }

  const storyRead = !!story && !written.warnings.some((w) => w.startsWith('story_not_read'));
  // 원고를 썼다는 이유로 사연을 소비하지 않는다. station.sh가 R2 실물을 확인하고
  // /api/radio/program 등록까지 성공했을 때 registered, Liquidsoap on-track 때 aired가 된다.
  // 별이가 이번에 읽지 않았다면 사연 id까지 차지하지 않고 다음 회차에 그대로 기다린다.
  const id = storyRead && story ? story.id : `solo-${Date.now().toString(36)}`;

  // 별이가 고른 곡을 서가와 대조 — 서가에 없는 제목은 방송에 못 나간다 (경고만 남긴다)
  const picked = written.songTitle
    ? songs.find((g) => songKey(g.title) === songKey(written.songTitle!)) ?? null
    : null;
  const warnings = [...written.warnings];
  if (written.songTitle && !picked) warnings.push(`song_not_found: ${written.songTitle}`);

  // 방송 자취 적기 — 강제가 아니라 기억이다 (사장 판정 08-12 밤: "게놈으로 다시 보게끔 해서
  // 알아서 하게 두라고. 그래도 또 읽는다? 그럼 그게 별이인 거야"). 무엇을 낭독했고 틀었고
  // 답했는지를 날짜별로 적어 다음 상황에 실어 준다 — 다시 읽을지는 별이가 알고 고른다.
  const squash = (x: string) => x.replace(/\s+/g, '');
  const readAloud = !!openPiece && squash(written.script).includes(squash(openPiece.text).slice(0, 24));
  const today = new Date(Date.now() + 9 * 3_600_000).toISOString().slice(0, 10);
  const acts: string[] = [];
  if (storyRead) acts.push('사연 하나에 답했다');
  if (picked) acts.push(`「${picked.title}」를 ${written.musicTransition === 'direct' ? '말없이 바로 틀었다' : '소개하고 틀었다'}`);
  if (readAloud) acts.push(`「${openPiece!.title}」(책장 원고)을 낭독했다`);
  if (!acts.length) acts.push(`이야기: ${written.script.split('\n')[0].slice(0, 24)}`);
  let day = trail.find((d) => d.date === today);
  if (!day) { day = { date: today, items: [] }; trail.push(day); }
  day.items = [...day.items, ...acts].slice(-RECALL_ITEMS_MAX);

  const draft: RadioDraft = {
    id, at: Date.now(), story: story?.text ?? '',
    moderation: { allow: true, category: story ? 'ok' : 'solo', reason: '' },
    script: written.script, voiceNote: written.voiceNote, songTitle: written.songTitle,
    stageCues: written.stageCues, promptChars: written.promptChars,
    musicTransition: picked ? (written.musicTransition ?? 'intro') : null, situation,
    provenance: written.provenance, warnings,
  };
  await Promise.all([
    env.PLANET.put(RADIO_DRAFT_KEY(id), JSON.stringify(draft)),
    env.PLANET.put(DRAFT_INDEX_KEY, JSON.stringify([id, ...draftIds.filter((x) => x !== id)].slice(0, DRAFT_INDEX_KEEP))),
    env.PLANET.put(RECALL_KEY, JSON.stringify(trail.slice(-RECALL_DAYS))),
  ]);
  return json(200, {
    // dj: 별리 라디오의 DJ 슬롯 — 초대 DJ는 별이. 훗날 삽만리 등 다른 게놈이 꽂힌다 (Vase 08-12).
    ok: true, id, dj: 'byeoli', kind: storyRead ? 'story' : 'talk', storyRead,
    storyId: storyRead && story ? story.id : null,
    timeLabel: situation.timeLabel,
    script: written.script, voiceNote: written.voiceNote,
    // 노래 편성 (08-12 밤): 별이가 고른 곡의 실물 — 조립기(station.sh)가 토막 뒤에 잇는다
    song: picked ? {
      title: picked.title, url: picked.url, dur: picked.dur, lyrics: picked.lyrics ?? '',
      transition: written.musicTransition ?? 'intro',
    } : null,
    title: written.script.split('\n')[0].slice(0, 60),
    warnings,
  });
};
