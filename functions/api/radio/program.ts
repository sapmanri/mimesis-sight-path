// 별이 라디오 스테이션 — 편성표 창구.
// GET  /api/radio/program  (공개)   : 플레이어가 읽는 편성표 + 서버 시각
// POST /api/radio/program  (키 인증): 구운 토막 등록 — 자리는 서버가 정한다 (시간축 연속성)

import {
  PROGRAM_KEY, DAYS_KEY, DAY_KEY, kstDayOf, placeSegment, lastEndOf, pruneProgram,
  RADIO_TIME_LABELS, type ProgramSegment, type SegmentKind, type RadioTimeLabel,
} from '../_station.ts';
import { RADIO_QUEUE_KEY, markStoryRegistered, type RadioStory } from '../_radio.ts';

/** 날짜별 보관소 이중 기록 — upsert(id+startAt 일치 시 갱신, 아니면 추가) */
async function archiveWrite(env: { PLANET: KVNamespace }, seg: ProgramSegment): Promise<void> {
  const day = kstDayOf(seg.startAt);
  const [dayRaw, daysRaw] = await Promise.all([env.PLANET.get(DAY_KEY(day)), env.PLANET.get(DAYS_KEY)]);
  const daySegs: ProgramSegment[] = dayRaw ? JSON.parse(dayRaw) : [];
  const i = daySegs.findIndex((s) => s.id === seg.id && s.startAt === seg.startAt);
  if (i >= 0) daySegs[i] = seg; else daySegs.push(seg);
  daySegs.sort((a, b) => a.startAt - b.startAt);
  const days: string[] = daysRaw ? JSON.parse(daysRaw) : [];
  if (!days.includes(day)) days.push(day);
  await Promise.all([
    env.PLANET.put(DAY_KEY(day), JSON.stringify(daySegs)),
    env.PLANET.put(DAYS_KEY, JSON.stringify(days.sort())),
  ]);
}

interface Env { PLANET: KVNamespace; PULSE_KEY?: string }

const JSON_HEADERS = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' };
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });

const KINDS: SegmentKind[] = ['talk', 'story', 'song', 'ambient'];
const timeLabel = (value: unknown): RadioTimeLabel | null =>
  typeof value === 'string' && RADIO_TIME_LABELS.includes(value as RadioTimeLabel)
    ? value as RadioTimeLabel : null;
// R2 공개 버킷만 허용 — 편성표가 남의 주소를 트는 일은 없어야 한다
const URL_OK = /^https:\/\/pub-8ec6440aae5545379fcfdd50a243847a\.r2\.dev\/radio\//;

export const onRequestGet: PagesFunction<Env> = async ({ env }) => {
  const raw = await env.PLANET.get(PROGRAM_KEY);
  const segments: ProgramSegment[] = raw ? JSON.parse(raw) : [];
  return json(200, { ok: true, rev: 'r14', now: Date.now(), segments });
};

/** 키 인증 삭제 — id+startAt로 정확히 하나만 (같은 id가 사고로 둘일 수 있다 — 08-12 전파 반절 실사고) */
export const onRequestDelete: PagesFunction<Env> = async ({ request, env }) => {
  if (!env.PULSE_KEY) return json(500, { ok: false, error: 'PULSE_KEY not configured' });
  if (request.headers.get('X-Pulse-Key') !== env.PULSE_KEY) return json(403, { ok: false, error: 'forbidden' });
  const u = new URL(request.url);
  const id = u.searchParams.get('id');
  const startAt = Number(u.searchParams.get('startAt'));
  if (!id || !Number.isFinite(startAt)) return json(400, { ok: false, error: 'id_and_startAt_required' });
  const raw = await env.PLANET.get(PROGRAM_KEY);
  const segments: ProgramSegment[] = raw ? JSON.parse(raw) : [];
  const next = segments.filter((s) => !(s.id === id && s.startAt === startAt));
  if (next.length === segments.length) return json(404, { ok: false, error: 'not_found' });
  await env.PLANET.put(PROGRAM_KEY, JSON.stringify(next));
  return json(200, { ok: true, removed: segments.length - next.length, count: next.length });
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
  const [raw, queueRaw] = await Promise.all([
    env.PLANET.get(PROGRAM_KEY), env.PLANET.get(RADIO_QUEUE_KEY),
  ]);
  const segments: ProgramSegment[] = raw ? JSON.parse(raw) : [];
  const queue: RadioStory[] = queueRaw ? JSON.parse(queueRaw) : [];
  // 구형 조립기는 storyId를 보내지 않았지만 story 토막의 id는 사연 id였다.
  // 이 규칙을 서버에서 한 번만 흡수해 조립기마다 상태 코드를 복제하지 않는다.
  const requestedStoryId = body.kind === 'story'
    ? (typeof body.storyId === 'string' && body.storyId
      ? body.storyId.slice(0, 40)
      : typeof body.id === 'string' ? body.id.slice(0, 40) : null)
    : null;
  if (requestedStoryId) {
    const story = queue.find((item) => item.id === requestedStoryId);
    if (!story) return json(409, { ok: false, error: 'story_not_found' });
    if (story.status === 'rejected') return json(409, { ok: false, error: 'story_rejected' });
  }

  const recordRegistered = async (segment: ProgramSegment): Promise<string | null> => {
    if (!requestedStoryId || segment.kind !== 'story') return null;
    const story = markStoryRegistered(queue, requestedStoryId, segment.id, Date.now());
    if (!story) throw new Error('story_transition_failed');
    await env.PLANET.put(RADIO_QUEUE_KEY, JSON.stringify(queue));
    return story.status;
  };

  // 같은 id 재등록 = 병합 — 자리(startAt)는 안 움직이고 대본·제목·연출만 갱신한다.
  // (08-12: 자막 기능 이전에 등록된 토막들에 대본을 소급 주입하는 길)
  const existing = typeof body.id === 'string' ? segments.find((s) => s.id === body.id) : undefined;
  if (existing) {
    if (existing.kind !== body.kind) return json(409, { ok: false, error: 'id_kind_conflict' });
    if (typeof body.script === 'string') existing.script = body.script.slice(0, 2000);
    if (typeof body.title === 'string' && body.title) existing.title = body.title.slice(0, 60);
    if (typeof body.voiceNote === 'string') existing.voiceNote = body.voiceNote.slice(0, 60);
    if (typeof body.dj === 'string' && body.dj) existing.dj = body.dj.slice(0, 20);
    if (requestedStoryId) existing.storyId = requestedStoryId;
    if (body.musicTransition === 'intro' || body.musicTransition === 'direct') existing.musicTransition = body.musicTransition;
    if (typeof body.pairId === 'string' && body.pairId) existing.pairId = body.pairId.slice(0, 40);
    if (timeLabel(body.timeLabel)) existing.timeLabel = timeLabel(body.timeLabel);
    // 소리 교체 재굽기(같은 R2 키에 새 소리)를 위해 dur도 병합 — 자리는 여전히 불변 (08-12)
    if (Number.isFinite(dur) && dur > 0 && dur <= 1800) {
      // 겹침 상한 가드 (08-12 인계서의 이론 결함 수리): 자리는 불변인데 길이만 늘면
      // 다음 토막을 침범한다 — 길이를 다음 토막 시작까지로 문다. 넘치는 소리는 어차피
      // 플레이어가 다음 토막으로 전환하며 끊는다.
      const nextSeg = segments
        .filter((x) => x.startAt > existing.startAt)
        .sort((a, b) => a.startAt - b.startAt)[0];
      const capped = nextSeg
        ? Math.min(dur, (nextSeg.startAt - existing.startAt) / 1000)
        : dur;
      if (capped > 0) existing.dur = capped;
    }
    await env.PLANET.put(PROGRAM_KEY, JSON.stringify(segments));
    await archiveWrite(env, existing);
    const storyStatus = await recordRegistered(existing);
    return json(200, { ok: true, id: existing.id, merged: true, startAt: existing.startAt, count: segments.length, storyStatus });
  }

  const seg: ProgramSegment = {
    id: typeof body.id === 'string' && body.id ? body.id.slice(0, 40) : `seg-${now.toString(36)}`,
    kind: body.kind as SegmentKind,
    startAt: placeSegment(lastEndOf(segments), now),
    dur,
    url: body.url,
    title: String(body.title ?? '').slice(0, 60) || '…',
    voiceNote: typeof body.voiceNote === 'string' ? body.voiceNote.slice(0, 60) : null,
    storyId: requestedStoryId,
    timeLabel: timeLabel(body.timeLabel),
    dj: typeof body.dj === 'string' && body.dj ? body.dj.slice(0, 20) : 'byeoli',
    script: typeof body.script === 'string' ? body.script.slice(0, 2000) : undefined,
    musicTransition: body.musicTransition === 'intro' || body.musicTransition === 'direct' ? body.musicTransition : null,
    pairId: typeof body.pairId === 'string' && body.pairId ? body.pairId.slice(0, 40) : null,
  };
  const next = pruneProgram([...segments, seg], now);
  await env.PLANET.put(PROGRAM_KEY, JSON.stringify(next));
  await archiveWrite(env, seg);
  const storyStatus = await recordRegistered(seg);
  return json(200, { ok: true, id: seg.id, startAt: seg.startAt, liveEdge: seg.startAt + seg.dur * 1000, count: next.length, storyStatus });
};
