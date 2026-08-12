// 별리라됴 곡 서가 (노래 편성 — Vase 08-12 밤: "15분에 한마디가 라디오냐")
// GET  /api/radio/songs  (공개)   : 서가 목록 — 플레이어·점검용. 주소는 어차피 공개 R2다.
// POST /api/radio/songs  (키 인증): 서가 전체 교체 — 채우는 손은 byeol-radio/songs-sync.sh.
//   전체 교체인 이유: 서가는 몇 곡짜리 실물 목록이고, 부분 수정 API는 지금 필요가 없다(포니테일).
//
// 곡은 구운 TTS가 아니라 곡 책상(music-lab)에서 사장이 확정한 자산이다 — 굽기 게이트를 안 탄다.
// 대신 주소는 편성표와 같은 잣대로 묶는다: 우리 R2 radio/ 밖은 등록 불가.

const SONGS_KEY = 'radio:songs';
const SONGS_MAX = 50;
// program.ts와 같은 잣대 — 서가가 남의 주소를 트는 일은 없어야 한다
const URL_OK = /^https:\/\/pub-8ec6440aae5545379fcfdd50a243847a\.r2\.dev\/radio\//;

interface RadioSong { title: string; url: string; dur: number; lyrics?: string }
interface Env { PLANET: KVNamespace; PULSE_KEY?: string }

const JSON_HEADERS = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' };
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });

export const onRequestGet: PagesFunction<Env> = async ({ env }) => {
  const raw = await env.PLANET.get(SONGS_KEY);
  const songs: RadioSong[] = raw ? JSON.parse(raw) : [];
  return json(200, { ok: true, count: songs.length, songs });
};

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  if (!env.PULSE_KEY) return json(500, { ok: false, error: 'PULSE_KEY not configured' });
  if (request.headers.get('X-Pulse-Key') !== env.PULSE_KEY) return json(403, { ok: false, error: 'forbidden' });

  let body: { songs?: unknown };
  try { body = (await request.json()) as { songs?: unknown }; } catch { return json(400, { ok: false, error: 'bad_json' }); }
  if (!Array.isArray(body.songs) || body.songs.length > SONGS_MAX) return json(400, { ok: false, error: 'bad_songs' });

  const songs: RadioSong[] = [];
  for (const s of body.songs as Partial<RadioSong>[]) {
    const title = String(s.title ?? '').trim().slice(0, 60);
    const dur = Number(s.dur);
    if (!title) return json(400, { ok: false, error: 'bad_title' });
    if (typeof s.url !== 'string' || !URL_OK.test(s.url)) return json(400, { ok: false, error: `bad_url: ${title}` });
    if (!Number.isFinite(dur) || dur <= 0 || dur > 1800) return json(400, { ok: false, error: `bad_dur: ${title}` });
    songs.push({ title, url: s.url, dur, lyrics: typeof s.lyrics === 'string' ? s.lyrics.slice(0, 2000) : undefined });
  }
  await env.PLANET.put(SONGS_KEY, JSON.stringify(songs));
  return json(200, { ok: true, count: songs.length });
};
