// 별이 라디오 (가칭) — 원고 책상. POST /api/radio/draft (X-Pulse-Key)
//
// R2 (사장 판정 08-12): 각본을 쓰지 않는다. **상황**(시간대·오늘 별이가 남긴 관찰·사연·
// 대기 수·최근 방송)을 별이에게 던지고, 방송 토막의 구성은 별이가 정한다.
// "환경만 만들고 별이가 알아서 자유롭게 논다" — 오피스 원칙과 같은 원칙.
//
// 실패 지점별 계약:
//   검열 실패(API 장애)  → 사연은 waiting 그대로, 502. 몰래 통과 없음.
//   검열 거절            → 사연 rejected + 사유 기록, 200.
//   원고 실패            → 사연은 waiting 그대로, 502. 폴백 없음 — 게놈 아니면 침묵.
//   별이가 낭독을 미룸    → 사연은 waiting 유지 (warnings의 story_not_read), 대본만 반환.
// 범위: 여기까지다. 발행(스레드)은 사람이 한다 (Vase 08-12).

import {
  RADIO_QUEUE_KEY, RADIO_DRAFT_KEY, moderateStory, writeRadioScript,
  type RadioStory, type RadioDraft, type RadioSituation,
} from '../_radio.ts';

interface Env { PLANET: KVNamespace; PULSE_KEY?: string; ANTHROPIC_API_KEY?: string }

const FEED_KEY = 'feed';                    // autopost·feed.ts와 같은 정본 키
const DRAFT_INDEX_KEY = 'radio:drafts';     // 최근 드래프트 id 목록 (반복 방지용)
const DRAFT_INDEX_KEEP = 30;

const JSON_HEADERS = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' };
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });

const keyGate = (request: Request, env: Env): Response | null => {
  if (!env.PULSE_KEY) return json(500, { ok: false, error: 'PULSE_KEY not configured' });
  if (request.headers.get('X-Pulse-Key') !== env.PULSE_KEY) return json(403, { ok: false, error: 'forbidden' });
  return null;
};

const kstHour = () => Number(new Date(Date.now() + 9 * 3_600_000).toISOString().slice(11, 13));
export function timeLabelOf(hour: number): string {
  if (hour < 6) return '새벽';
  if (hour < 11) return '아침';
  if (hour < 17) return '낮';
  if (hour < 21) return '저녁';
  return '밤';
}

/** 키 인증 조회 — ?id=드래프트, 없으면 대기열 요약 */
export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const gate = keyGate(request, env);
  if (gate) return gate;
  const id = new URL(request.url).searchParams.get('id');
  if (id) {
    const raw = await env.PLANET.get(RADIO_DRAFT_KEY(id));
    return json(raw ? 200 : 404, raw ? { ok: true, draft: JSON.parse(raw) } : { ok: false, error: 'not_found' });
  }
  const raw = await env.PLANET.get(RADIO_QUEUE_KEY);
  const queue: RadioStory[] = raw ? JSON.parse(raw) : [];
  const count = (s: RadioStory['status']) => queue.filter((q) => q.status === s).length;
  return json(200, {
    // rev: 배포 전파 탐침 — Pages는 Active 표시 뒤에도 엣지가 옛 판을 준다(08-12 실사고:
    // 첫 호출이 옛 코드에 맞아 사연 하나가 옛 모양으로 소비됨). 배포 후 이 값 확인 전에
    // 대기열을 소비하지 말 것.
    ok: true, rev: 'r4', waiting: count('waiting'), registered: count('registered'),
    aired: count('aired'), rejected: count('rejected'), legacyUnknown: count('used'),
    // 옛 관제실 호환 필드. 의미는 이제 명확히 '실제 송출 확인'뿐이다.
    used: count('aired'),
    recent: queue.slice(0, 10).map((q) => ({ id: q.id, at: q.at, status: q.status, chars: q.text.length })),
  });
};

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const gate = keyGate(request, env);
  if (gate) return gate;

  const idParam = new URL(request.url).searchParams.get('id');
  const raw = await env.PLANET.get(RADIO_QUEUE_KEY);
  const queue: RadioStory[] = raw ? JSON.parse(raw) : [];
  // 대기열은 최신순 저장 — 방송은 오래 기다린 사연부터 (뒤에서 찾는다)
  const story = idParam
    ? queue.find((q) => q.id === idParam && q.status === 'waiting')
    : [...queue].reverse().find((q) => q.status === 'waiting');
  if (!story) return json(404, { ok: false, error: 'no_waiting_story' });

  const saveQueue = () => env.PLANET.put(RADIO_QUEUE_KEY, JSON.stringify(queue));

  const moderation = await moderateStory(env, story.text);
  if (!moderation) return json(502, { ok: false, error: 'moderation_unavailable', id: story.id });
  if (!moderation.allow) {
    story.status = 'rejected';
    story.reason = `${moderation.category}: ${moderation.reason}`;
    await saveQueue();
    return json(200, { ok: true, rejected: true, id: story.id, moderation });
  }

  // ── 상황 조립 — 별이에게 던질 지금 여기의 사실들 (실데이터만, 지어내지 않는다) ──
  const [feedRaw, indexRaw] = await Promise.all([
    env.PLANET.get(FEED_KEY), env.PLANET.get(DRAFT_INDEX_KEY),
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

  const situation: RadioSituation = {
    timeLabel: timeLabelOf(kstHour()),
    todayLines,
    story: story.text,
    waitingCount: queue.filter((q) => q.status === 'waiting' && q.id !== story.id).length,
    recentScripts,
  };

  const written = await writeRadioScript(env, situation);
  if (!written) return json(502, { ok: false, error: 'writer_failed', id: story.id });

  // 별이가 이번 토막에서 낭독을 미뤘으면 사연은 대기열에 남는다 — 별이의 선택을 존중한다
  const storyRead = !written.warnings.some((w) => w.startsWith('story_not_read'));

  const draft: RadioDraft = {
    id: story.id, at: Date.now(), story: story.text, moderation,
    script: written.script, voiceNote: written.voiceNote, situation,
    provenance: written.provenance, warnings: written.warnings,
  };
  await Promise.all([
    env.PLANET.put(RADIO_DRAFT_KEY(story.id), JSON.stringify(draft)),
    env.PLANET.put(DRAFT_INDEX_KEY, JSON.stringify([story.id, ...draftIds.filter((x) => x !== story.id)].slice(0, DRAFT_INDEX_KEEP))),
    saveQueue(),
  ]);
  return json(200, { ok: true, draft, storyRead, storyId: storyRead ? story.id : null });
};
