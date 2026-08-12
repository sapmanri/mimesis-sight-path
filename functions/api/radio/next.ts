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
import { timeLabelOf } from './draft.ts';

interface Env { PLANET: KVNamespace; PULSE_KEY?: string; ANTHROPIC_API_KEY?: string }

const FEED_KEY = 'feed';
const DRAFT_INDEX_KEY = 'radio:drafts';
const DRAFT_INDEX_KEEP = 30;

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

  const hour = Number(new Date(Date.now() + 9 * 3_600_000).toISOString().slice(11, 13));
  const situation: RadioSituation = {
    timeLabel: timeLabelOf(hour),
    todayLines,
    story: story?.text ?? null,
    waitingCount: queue.filter((q) => q.status === 'waiting' && q.id !== story?.id).length,
    recentScripts,
  };

  const written = await writeRadioScript(env, situation);
  if (!written) return json(502, { ok: false, error: 'writer_failed' });

  const storyRead = !!story && !written.warnings.some((w) => w.startsWith('story_not_read'));
  const id = story?.id ?? `solo-${Date.now().toString(36)}`;
  if (story && storyRead) { story.status = 'used'; await saveQueue(); }

  const draft: RadioDraft = {
    id, at: Date.now(), story: story?.text ?? '',
    moderation: { allow: true, category: story ? 'ok' : 'solo', reason: '' },
    script: written.script, voiceNote: written.voiceNote, situation,
    provenance: written.provenance, warnings: written.warnings,
  };
  await Promise.all([
    env.PLANET.put(RADIO_DRAFT_KEY(id), JSON.stringify(draft)),
    env.PLANET.put(DRAFT_INDEX_KEY, JSON.stringify([id, ...draftIds.filter((x) => x !== id)].slice(0, DRAFT_INDEX_KEEP))),
  ]);
  return json(200, {
    ok: true, id, kind: storyRead ? 'story' : 'talk', storyRead,
    script: written.script, voiceNote: written.voiceNote,
    title: written.script.split('\n')[0].slice(0, 60),
    warnings: written.warnings,
  });
};
