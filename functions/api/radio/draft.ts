// 별이 라디오 (가칭) — 원고 책상. POST /api/radio/draft (X-Pulse-Key)
//
// 대기열에서 가장 오래된 사연 하나를 꺼내 ② AI 검열 → ③ 게놈 원고를 만든다.
// 실패 지점별 계약:
//   검열 실패(API 장애)  → 사연은 waiting 그대로, 502. 몰래 통과 없음.
//   검열 거절            → 사연 rejected + 사유 기록, 200 (다음 사연은 다음 호출).
//   원고 실패            → 사연은 waiting 그대로, 502. 폴백 없음 — 게놈 아니면 침묵.
// 범위: 여기까지다. 발행(스레드)은 사람이 한다 (Vase 08-12).

import {
  RADIO_QUEUE_KEY, RADIO_DRAFT_KEY, moderateStory, writeRadioScript,
  type RadioStory, type RadioDraft,
} from '../_radio.ts';

interface Env { PLANET: KVNamespace; PULSE_KEY?: string; ANTHROPIC_API_KEY?: string }

const JSON_HEADERS = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' };
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });

const keyGate = (request: Request, env: Env): Response | null => {
  if (!env.PULSE_KEY) return json(500, { ok: false, error: 'PULSE_KEY not configured' });
  if (request.headers.get('X-Pulse-Key') !== env.PULSE_KEY) return json(403, { ok: false, error: 'forbidden' });
  return null;
};

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
    ok: true, waiting: count('waiting'), used: count('used'), rejected: count('rejected'),
    // 본문은 흘리지 않는다 — 요약만
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

  const script = await writeRadioScript(env, story.text);
  if (!script) return json(502, { ok: false, error: 'writer_failed', id: story.id });

  const draft: RadioDraft = {
    id: story.id, at: Date.now(), story: story.text, moderation,
    intro: script.intro, thought: script.thought,
    provenance: script.provenance, warnings: script.warnings,
  };
  story.status = 'used';
  await Promise.all([env.PLANET.put(RADIO_DRAFT_KEY(story.id), JSON.stringify(draft)), saveQueue()]);
  return json(200, { ok: true, draft });
};
