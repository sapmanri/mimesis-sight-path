// 사연 상태 영수증 — 실제 출력 엔진의 on-track 사건만 aired를 기록한다.
// 원고 생성(draft)이나 편성 등록(program)은 이 창구를 대신할 수 없다.

import { RADIO_QUEUE_KEY, markStoryAired, type RadioStory } from '../_radio.ts';
import { DAY_KEY, PROGRAM_KEY, kstDayOf, type ProgramSegment } from '../_station.ts';

interface Env { PLANET: KVNamespace; PULSE_KEY?: string }

const JSON_HEADERS = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' };
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });

interface AirEvent {
  event?: string;
  storyId?: string;
  segmentId?: string;
  startAt?: number;
  itemKey?: string;
  eventAt?: number;
  engine?: string;
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  if (!env.PULSE_KEY) return json(500, { ok: false, error: 'PULSE_KEY not configured' });
  if (request.headers.get('X-Pulse-Key') !== env.PULSE_KEY) return json(403, { ok: false, error: 'forbidden' });

  let body: AirEvent;
  try { body = (await request.json()) as AirEvent; } catch { return json(400, { ok: false, error: 'bad_json' }); }
  const storyId = String(body.storyId ?? '').slice(0, 40);
  const segmentId = String(body.segmentId ?? '').slice(0, 40);
  const startAt = Number(body.startAt);
  const eventAt = Number(body.eventAt);
  const itemKey = String(body.itemKey ?? '');
  if (body.event !== 'aired' || body.engine !== 'liquidsoap') return json(400, { ok: false, error: 'bad_event' });
  if (!storyId || !segmentId || !Number.isFinite(startAt) || !Number.isFinite(eventAt)) {
    return json(400, { ok: false, error: 'event_fields_required' });
  }
  if (itemKey !== `live:${segmentId}:${Math.trunc(startAt)}`) return json(400, { ok: false, error: 'bad_item_key' });
  const now = Date.now();
  if (eventAt > now + 60_000 || eventAt < startAt - 5 * 60_000 || eventAt < now - 7 * 86_400_000) {
    return json(400, { ok: false, error: 'bad_event_time' });
  }

  const [programRaw, archiveRaw, queueRaw] = await Promise.all([
    env.PLANET.get(PROGRAM_KEY),
    env.PLANET.get(DAY_KEY(kstDayOf(startAt))),
    env.PLANET.get(RADIO_QUEUE_KEY),
  ]);
  const program: ProgramSegment[] = programRaw ? JSON.parse(programRaw) : [];
  const archive: ProgramSegment[] = archiveRaw ? JSON.parse(archiveRaw) : [];
  // 편성표는 48시간 창이라 잘린다. 로컬 영수증의 재시도가 오래 걸려도
  // 영구 날짜별 보관소의 동일 토막을 증거로 받아 실제 송출 상태를 잃지 않는다.
  const segment = [...program, ...archive].find(
    (item) => item.id === segmentId && Math.trunc(item.startAt) === Math.trunc(startAt),
  );
  if (!segment || segment.kind !== 'story' || segment.storyId !== storyId) {
    return json(409, { ok: false, error: 'program_witness_missing' });
  }
  const queue: RadioStory[] = queueRaw ? JSON.parse(queueRaw) : [];
  const story = markStoryAired(queue, storyId, segmentId, eventAt);
  if (!story) return json(409, { ok: false, error: 'story_transition_failed' });

  const receipt = {
    version: 'radio-story-air-v1', storyId, segmentId, startAt: Math.trunc(startAt),
    itemKey, eventAt: Math.trunc(eventAt), acceptedAt: now, engine: 'liquidsoap',
  };
  await Promise.all([
    env.PLANET.put(RADIO_QUEUE_KEY, JSON.stringify(queue)),
    env.PLANET.put(`radio:story-air:${storyId}:${segmentId}:${Math.trunc(startAt)}`, JSON.stringify(receipt), {
      expirationTtl: 90 * 86_400,
    }),
  ]);
  return json(200, { ok: true, status: story.status, receipt });
};
