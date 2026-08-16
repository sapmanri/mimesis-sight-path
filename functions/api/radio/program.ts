// 별이 라디오 스테이션 — 편성표 창구.
// GET  /api/radio/program  (공개)   : 플레이어가 읽는 편성표 + 서버 시각
// POST /api/radio/program  (키 인증): 구운 토막 등록 — 자리는 서버가 정한다 (시간축 연속성)

import {
  PROGRAM_KEY, DAYS_KEY, DAY_KEY, kstDayOf, placeSegment, placeSegmentBatch, lastEndOf, pruneProgram,
  RADIO_TIME_LABELS, type ProgramSegment, type SegmentKind, type RadioTimeLabel,
} from '../_station.ts';
import { RADIO_QUEUE_KEY, markStoryRegistered, type RadioStory } from '../_radio.ts';
import { deferSocialWake, type SocialWakeEnv } from '../_byeoli-social-wake.ts';

/** 날짜별 보관소 이중 기록 — 같은 판의 여러 토막을 같은 날에 병렬로 쓰면 마지막 한 건만
    남을 수 있으므로, 날짜마다 한 번 읽고 한 번 쓴다. */
async function archiveWriteMany(env: { PLANET: KVNamespace }, incoming: ProgramSegment[]): Promise<void> {
  const grouped = new Map<string, ProgramSegment[]>();
  for (const seg of incoming) {
    const day = kstDayOf(seg.startAt);
    grouped.set(day, [...(grouped.get(day) ?? []), seg]);
  }
  const daysRaw = await env.PLANET.get(DAYS_KEY);
  const days: string[] = daysRaw ? JSON.parse(daysRaw) : [];
  const writes: Promise<void>[] = [];
  for (const [day, segments] of grouped) {
    const dayRaw = await env.PLANET.get(DAY_KEY(day));
    const daySegs: ProgramSegment[] = dayRaw ? JSON.parse(dayRaw) : [];
    for (const seg of segments) {
      const index = daySegs.findIndex((item) => item.id === seg.id && item.startAt === seg.startAt);
      if (index >= 0) daySegs[index] = seg; else daySegs.push(seg);
    }
    daySegs.sort((a, b) => a.startAt - b.startAt);
    if (!days.includes(day)) days.push(day);
    writes.push(env.PLANET.put(DAY_KEY(day), JSON.stringify(daySegs)));
  }
  writes.push(env.PLANET.put(DAYS_KEY, JSON.stringify(days.sort())));
  await Promise.all(writes);
}

const archiveWrite = (env: { PLANET: KVNamespace }, seg: ProgramSegment) => archiveWriteMany(env, [seg]);

interface Env extends SocialWakeEnv { PULSE_KEY?: string }

const JSON_HEADERS = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' };
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });

const KINDS: SegmentKind[] = ['talk', 'story', 'reading', 'song', 'ambient'];
const timeLabel = (value: unknown): RadioTimeLabel | null =>
  typeof value === 'string' && RADIO_TIME_LABELS.includes(value as RadioTimeLabel)
    ? value as RadioTimeLabel : null;
// R2 공개 버킷만 허용 — 편성표가 남의 주소를 트는 일은 없어야 한다
const URL_OK = /^https:\/\/pub-8ec6440aae5545379fcfdd50a243847a\.r2\.dev\/radio\//;

export const onRequestGet: PagesFunction<Env> = async ({ env }) => {
  const raw = await env.PLANET.get(PROGRAM_KEY);
  const segments: ProgramSegment[] = raw ? JSON.parse(raw) : [];
  return json(200, { ok: true, rev: 'r15-reading-batch', now: Date.now(), segments });
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

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
  if (!env.PULSE_KEY) return json(500, { ok: false, error: 'PULSE_KEY not configured' });
  if (request.headers.get('X-Pulse-Key') !== env.PULSE_KEY) return json(403, { ok: false, error: 'forbidden' });

  let payload: Partial<ProgramSegment> & { segments?: Partial<ProgramSegment>[] };
  try { payload = (await request.json()) as typeof payload; } catch { return json(400, { ok: false, error: 'bad_json' }); }

  // 새 조립기는 한 판(소개 음성 + 선택한 낭독 + 선택한 곡)을 배열 하나로 보낸다.
  // 전부 검증되기 전에는 PROGRAM_KEY를 쓰지 않는다. 이 경계가 "읽어줄게"만 먼저
  // 전파되고 낭독이 사라지는 반쪽 성공을 막는다. 단일 등록은 옛 조립기 호환으로 남긴다.
  if (Array.isArray(payload.segments)) {
    const requested = payload.segments;
    if (requested.length < 1 || requested.length > 3) {
      return json(400, { ok: false, error: 'bad_batch_size' });
    }
    const requestedKinds = requested.map((body) => body.kind);
    const expectedFeatureOrder = requestedKinds.slice(1).join(',');
    if (!['talk', 'story'].includes(String(requestedKinds[0]))
      || !['', 'reading', 'song', 'reading,song'].includes(expectedFeatureOrder)) {
      return json(400, { ok: false, error: 'bad_batch_order' });
    }
    for (let index = 0; index < requested.length; index++) {
      const body = requested[index];
      const dur = Number(body.dur);
      if (!KINDS.includes(body.kind as SegmentKind)) return json(400, { ok: false, error: 'bad_kind', index });
      if (!Number.isFinite(dur) || dur <= 0 || dur > 1800) return json(400, { ok: false, error: 'bad_dur', index });
      if (typeof body.url !== 'string' || !URL_OK.test(body.url)) return json(400, { ok: false, error: 'bad_url', index });
    }

    const now = Date.now();
    const [raw, queueRaw] = await Promise.all([
      env.PLANET.get(PROGRAM_KEY), env.PLANET.get(RADIO_QUEUE_KEY),
    ]);
    const segments: ProgramSegment[] = raw ? JSON.parse(raw) : [];
    const queue: RadioStory[] = queueRaw ? JSON.parse(queueRaw) : [];
    const ids = requested.map((body, index) =>
      typeof body.id === 'string' && body.id ? body.id.slice(0, 40) : `seg-${now.toString(36)}-${index}`,
    );
    if (new Set(ids).size !== ids.length) return json(409, { ok: false, error: 'duplicate_batch_id' });
    if (ids.some((id) => segments.some((segment) => segment.id === id))) {
      return json(409, { ok: false, error: 'batch_id_conflict' });
    }
    if (requested.length > 1) {
      const pairId = ids[0];
      if (requested.some((body) => body.pairId !== pairId)) {
        return json(400, { ok: false, error: 'bad_batch_pair' });
      }
    }

    const storyIdFor = (body: Partial<ProgramSegment>, index: number): string | null =>
      body.kind === 'story'
        ? (typeof body.storyId === 'string' && body.storyId ? body.storyId.slice(0, 40) : ids[index])
        : null;
    for (let index = 0; index < requested.length; index++) {
      const storyId = storyIdFor(requested[index], index);
      if (!storyId) continue;
      const story = queue.find((item) => item.id === storyId);
      if (!story) return json(409, { ok: false, error: 'story_not_found', index });
      if (story.status === 'rejected') return json(409, { ok: false, error: 'story_rejected', index });
    }

    const starts = placeSegmentBatch(lastEndOf(segments), now, requested.map((body) => Number(body.dur)));
    const batch: ProgramSegment[] = requested.map((body, index) => {
      const requestedStoryId = storyIdFor(body, index);
      return {
        id: ids[index],
        kind: body.kind as SegmentKind,
        startAt: starts[index],
        dur: Number(body.dur),
        url: body.url!,
        title: String(body.title ?? '').slice(0, 60) || '…',
        voiceNote: typeof body.voiceNote === 'string' ? body.voiceNote.slice(0, 60) : null,
        storyId: requestedStoryId,
        timeLabel: timeLabel(body.timeLabel),
        dj: typeof body.dj === 'string' && body.dj ? body.dj.slice(0, 20) : 'byeoli',
        script: typeof body.script === 'string' ? body.script.slice(0, 2000) : undefined,
        musicTransition: body.musicTransition === 'intro' || body.musicTransition === 'direct' ? body.musicTransition : null,
        pairId: typeof body.pairId === 'string' && body.pairId ? body.pairId.slice(0, 40) : null,
      };
    });

    for (const segment of batch) {
      if (!segment.storyId || segment.kind !== 'story') continue;
      if (!markStoryRegistered(queue, segment.storyId, segment.id, now)) {
        return json(409, { ok: false, error: 'story_transition_failed' });
      }
    }
    const next = pruneProgram([...segments, ...batch], now);
    // 보관소가 먼저 온전한 판을 받은 뒤, 공개 편성표를 한 번만 교체한다.
    await archiveWriteMany(env, batch);
    await env.PLANET.put(PROGRAM_KEY, JSON.stringify(next));
    if (batch.some((segment) => segment.storyId)) {
      await env.PLANET.put(RADIO_QUEUE_KEY, JSON.stringify(queue));
    }
    deferSocialWake(context, env, {
      kind: 'program_registered',
      eventId: `program-batch:${ids.join(',')}:${Math.trunc(starts[0])}`,
      occurredAt: now,
      refId: ids[0],
    }, 'program batch');
    return json(200, {
      ok: true, batch: true,
      segments: batch.map((segment) => ({
        id: segment.id, kind: segment.kind, startAt: segment.startAt, dur: segment.dur,
      })),
      liveEdge: batch.at(-1)!.startAt + batch.at(-1)!.dur * 1000,
      count: next.length,
    });
  }

  const body: Partial<ProgramSegment> = payload;
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
    deferSocialWake(context, env, {
      kind: 'program_registered',
      eventId: `program:${existing.id}:${Math.trunc(existing.startAt)}:merge:${now}`,
      occurredAt: now,
      refId: existing.id,
    }, 'program merge');
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
  deferSocialWake(context, env, {
    kind: 'program_registered',
    eventId: `program:${seg.id}:${Math.trunc(seg.startAt)}`,
    occurredAt: now,
    refId: seg.id,
  }, 'program');
  return json(200, { ok: true, id: seg.id, startAt: seg.startAt, liveEdge: seg.startAt + seg.dur * 1000, count: next.length, storyStatus });
};
