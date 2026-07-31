// /api/ops/music-playlist — **저장된 밤**으로 재생목록만 만든다 (Ops 호스트 전용 · Access 뒤)
//
// ⛔ 크론과 연결점 없음. 사람이 눌러야만 돈다.
//
//   GET  ?date=YYYY-MM-DD      무엇을 담을지 보여주기만 한다 (아무것도 안 만든다)
//   POST {date, confirm:true}  실제로 만든다
//
// ⚠ 왜 이 파일이 필요한가 — 2026-07-30 첫 완주에서 드러났다.
//   `music-night?run=1&dry=1` 로 조사만 돌리면 곡·videoId·별이의 문장까지 다 나오는데,
//   재생목록을 만들려면 **5분 31초짜리 조사를 통째로 다시** 해야 했다. Claude 값이 또 나가고
//   결과도 달라진다 — 좋은 선곡을 버리고 다시 뽑는 셈이다.
//   여기서는 이미 저장된 onShelf 로만 만든다. **Claude 호출 0회, YouTube 100유닛.**
//
// ⚠ 만든 뒤 밤 영수증의 playlistUrl 과 threadText 를 갱신한다. 그래야 music-publish 가
//   재생목록 주소가 들어간 문장을 내보낸다. 갱신하지 않으면 링크 없는 글이 나간다.

import {
  readNight, saveNight, buildThreadText, type NightEnv, type NightReceipt,
} from '../_music-night.ts';
import { publishDayPlaylist, type PlaylistEnv, type PlaylistTrack } from '../_shelf-playlist.ts';
import { kstDate } from '../_memory-event.ts';

type Env = NightEnv & PlaylistEnv;

const JSON_HEADERS = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' };
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body, null, 2), { status, headers: JSON_HEADERS });
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** 만들 수 없는 밤을 한 줄로. 사람이 보고 판단할 수 있어야 한다. */
function blockedWhy(n: NightReceipt | null): string | null {
  if (!n) return 'no_night — 그날 밤을 아직 안 돌렸다. /api/ops/music-night?run=1&dry=1 먼저';
  if (n.rest) return `rest — 쉬는 날이었다: ${n.rest}`;
  if (!n.onShelf?.length) return 'no_tracks — 서가에서 확인된 곡이 없다';
  return null;
}

/** 중심곡을 맨 앞에. music-night 의 순서 규칙과 같아야 한다. */
function ordered(n: NightReceipt): PlaylistTrack[] {
  const centerTitle = n.threadText?.split('\n')[0]?.split(' — ')[0]?.trim() ?? '';
  return [...n.onShelf]
    .sort((a, b) => (b.title === centerTitle ? 1 : 0) - (a.title === centerTitle ? 1 : 0))
    .map((t) => ({ videoId: t.videoId, title: t.title, artist: t.artist }));
}

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const url = new URL(request.url);
  const date = url.searchParams.get('date') ?? kstDate(Date.now());
  if (!DATE_RE.test(date)) return json(400, { error: 'bad_date', got: date });

  const night = await readNight(env, date);
  const why = blockedWhy(night);
  return json(200, {
    willCreate: false, date,
    ready: !why, blocked: why,
    alreadyHas: night?.playlistUrl ?? null,
    tracks: night ? ordered(night) : [],
    cost: { claude: '0회 — 저장된 밤을 그대로 쓴다', youtubeUnits: 100 },
    note: '만들려면 POST {"date":"…","confirm":true}.',
  });
};

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  let body: { date?: string; confirm?: boolean; force?: boolean } = {};
  try { body = (await request.json()) as typeof body; } catch { return json(400, { ok: false, error: 'bad_json' }); }

  const date = body.date ?? kstDate(Date.now());
  if (!DATE_RE.test(date)) return json(400, { ok: false, error: 'bad_date', got: date });
  /* ⚠ confirm 을 요구한다. 주소를 미리 당겨오는 것만으로 100유닛이 나가면 안 된다. */
  if (body.confirm !== true) return json(400, { ok: false, error: 'need_confirm' });

  const night = await readNight(env, date);
  const why = blockedWhy(night);
  if (why) return json(409, { ok: false, error: 'not_ready', blocked: why });
  /* 이미 있으면 다시 만들지 않는다 — 같은 날 재생목록이 둘씩 생기면 어느 쪽이 진짜인지 모른다 */
  if (night!.playlistUrl && !body.force)
    return json(409, { ok: false, error: 'already_has_playlist', url: night!.playlistUrl });

  const tracks = ordered(night!);
  const pl = await publishDayPlaylist(env, {
    date, centralImage: null, tracks,
    description: `${date} · 별이가 그날 본 것에서 찾은 곡들`,
  });
  if (pl.error) return json(502, { ok: false, error: pl.error, failed: pl.failed });

  /* ⚠ 밤을 갱신한다. 이걸 빠뜨리면 music-publish 가 **링크 없는 글**을 내보낸다.
     threadText 는 다시 만든다 — 첫 줄이 「제목 — 아티스트」, 그다음이 별이의 말이다. */
  const [head = '', ...rest] = (night!.threadText ?? '').split('\n\n');
  const [title = '', artist = ''] = head.split(' — ');
  const next: NightReceipt = {
    ...night!,
    playlistUrl: pl.url,
    threadText: buildThreadText(
      title && rest.length ? { title, artist, line: rest.join('\n\n') } : null, pl.url) ?? night!.threadText,
    notes: [...night!.notes.filter((n) => n !== 'playlist_skipped'), `playlist_made_later: ${pl.added.length}곡`],
  };
  await saveNight(env, next);

  console.log(`ops/music-playlist date=${date} added=${pl.added.length} failed=${pl.failed.length}`);
  return json(200, {
    ok: true, date, url: pl.url, added: pl.added.length,
    failed: pl.failed, threadText: next.threadText,
  });
};
