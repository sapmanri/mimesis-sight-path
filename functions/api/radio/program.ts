// 별이 라디오 스테이션 — 편성표 창구.
// GET  /api/radio/program  (공개)   : 플레이어가 읽는 편성표 + 서버 시각
// POST /api/radio/program  (키 인증): 구운 토막 등록 — 자리는 서버가 정한다 (시간축 연속성)

import {
  PROGRAM_KEY, placeSegment, lastEndOf, pruneProgram,
  type ProgramSegment, type SegmentKind,
} from '../_station.ts';

interface Env { PLANET: KVNamespace; PULSE_KEY?: string }

const JSON_HEADERS = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' };
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });

const KINDS: SegmentKind[] = ['talk', 'story', 'song', 'ambient'];
// R2 공개 버킷만 허용 — 편성표가 남의 주소를 트는 일은 없어야 한다
const URL_OK = /^https:\/\/pub-8ec6440aae5545379fcfdd50a243847a\.r2\.dev\/radio\//;

export const onRequestGet: PagesFunction<Env> = async ({ env }) => {
  const raw = await env.PLANET.get(PROGRAM_KEY);
  const segments: ProgramSegment[] = raw ? JSON.parse(raw) : [];
  return json(200, { ok: true, rev: 'r4', now: Date.now(), segments });
};

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  if (!env.PULSE_KEY) return json(500, { ok: false, error: 'PULSE_KEY not configured' });
  if (request.headers.get('X-Pulse-Key') !== env.PULSE_KEY) return json(403, { ok: false, error: 'forbidden' });

  let body: Partial<ProgramSegment>;
  try { body = (await request.json()) as Partial<ProgramSegment>; } catch { return json(400, { ok: false, error: 'bad_json' }); }
  const dur = Number(body.dur);
  if (!KINDS.includes(body.kind as SegmentKind)) return json(400, { ok: false, error: 'bad_kind' });
  if (!Number.isFinite(dur) || dur <= 0 || dur > 1800) return json(400, { ok: false, error: 'bad_dur' });
  if (typeof body.url !== 'string' || !URL_OK.test(body.url)) return json(400, { ok: false, error: 'bad_url' });

  const now = Date.now();
  const raw = await env.PLANET.get(PROGRAM_KEY);
  const segments: ProgramSegment[] = raw ? JSON.parse(raw) : [];
  const seg: ProgramSegment = {
    id: typeof body.id === 'string' && body.id ? body.id.slice(0, 40) : `seg-${now.toString(36)}`,
    kind: body.kind as SegmentKind,
    startAt: placeSegment(lastEndOf(segments), now),
    dur,
    url: body.url,
    title: String(body.title ?? '').slice(0, 60) || '…',
    voiceNote: typeof body.voiceNote === 'string' ? body.voiceNote.slice(0, 60) : null,
    storyId: typeof body.storyId === 'string' ? body.storyId.slice(0, 40) : null,
  };
  const next = pruneProgram([...segments, seg], now);
  await env.PLANET.put(PROGRAM_KEY, JSON.stringify(next));
  return json(200, { ok: true, id: seg.id, startAt: seg.startAt, liveEdge: seg.startAt + seg.dur * 1000, count: next.length });
};
