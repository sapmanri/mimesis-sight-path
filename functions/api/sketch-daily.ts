// BUILD 431-AUTO — POST /api/sketch-daily (외부 Cron · X-Publish-Key — autopost와 같은 보호)
//
// 그림일기 반자동 파이프라인, Vase 승인 조건표 A+B (2026-07-22 오후):
//   ① 크론 23:30 KST — 그날 발행 영수증이 다 쌓인 뒤 하루를 접는다
//   ② 사람 우선 — 그날 사람이 이미 하루를 접었으면 자동은 건드리지 않는다
//   ③ 관찰이 없는 날은 접지 않는다 — 빈 기억을 지어내지 않는다
//   ④ seed는 날짜에서 파생 — 같은 날은 같은 3장 (재현 가능)
//   ⑤ 생성까지만 자동 — 채택·발행은 사람 (아침의 두 클릭)
//   ⑥ 판정기(vision) 추천은 기록만 — 발행 권한 없음 (병행 운전 데이터)
//   ⑦ 비용 상한: 3장 + vision 판정 1회/일
//   ⑧ 완전 자동(C)은 병행 운전 일치율을 보고 별도 판정 — 이 파일은 그 문이 아니다
//
// 산출물은 기존 시험 경로(sketch-trials/·sketch_trial_meta)에 쌓인다 —
// 아침의 채택·발행은 실험실의 기존 UI(최근 생성 → 📌 → 🕊)를 그대로 쓴다.

import {
  buildDayMemory, validateDayMemory, memoryKey, kstDate, type DayMemory, type CaptureLike,
} from './_memory-event.ts';
import { buildImagePrompt, CHARACTER_IDENTITY_CHECKS, SKETCH_RULES, SKETCH_VERSION } from './_daily-sketch.ts';
import { selectProvider, trialKey, type ImageProviderEnv } from './_image-provider.ts';
import { translateScene, translateSubjects, hashPrompt, orderCharacterRefs, type TrialRecord } from './ops/sketch-trial.ts';

interface Env extends ImageProviderEnv {
  PLANET: KVNamespace;
  CAPTURES: R2Bucket;
  PUBLISH_KEY?: string;
  ANTHROPIC_API_KEY?: string;
}

const META_KEY = 'sketch_trial_meta';
const META_KEEP = 60;
const RECO_KEY = (date: string) => `sketch_daily_reco:${date}`;
const DAILY_MODEL = '@cf/black-forest-labs/flux-2-dev';
const DAILY_STEPS = 12;
/** 확정 레시피의 캐릭터 참조 — 포즈 시트 2장 (07-21 심야 판정) */
const DAILY_REFS = ['sketch-trials/reference/byeoli_poses.png', 'sketch-trials/reference/ppaekong_poses.png'];

const JSON_HEADERS = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' };
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });

/** ④ 날짜 → 결정론 seed. 같은 날은 같은 3장. */
export function dailySeed(date: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < date.length; i++) { h ^= date.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return 400000 + ((h >>> 0) % 90000);
}

function bytesToB64(buf: ArrayBuffer): string {
  const u = new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000));
  return btoa(s);
}

/** ⑥ 판정기 — 클로드 vision. 기준은 새로 쓰지 않는다: 체크리스트·규칙·그날의 줄을 조립. */
async function judgeCandidates(
  env: Env, day: DayMemory, images: { seed: number; bytes: ArrayBuffer }[],
): Promise<{ pick: number | null; reasons: string; verdicts: string[] } | null> {
  if (!env.ANTHROPIC_API_KEY || !images.length) return null;
  try {
    const content: unknown[] = [{
      type: 'text',
      text: `별이의 그림일기 후보 ${images.length}장이다. 판정 기준(예쁜가가 아니다):
- Character Identity: ${CHARACTER_IDENTITY_CHECKS.join(' · ')}
- 그림 습관: ${SKETCH_RULES.join(' · ')}
- 이 하루의 기억과 맞는가: ${day.event.lines.join(' / ')} (가장 크게: ${day.event.targetLabel ?? '—'})
각 장의 합격/불합격과 한 줄 사유, 그리고 추천 1장(1~${images.length}, 전부 불합격이면 0)을 JSON으로만:
{"verdicts": ["1장: ..."], "pick": n, "reasons": "추천 사유 한 줄"}`,
    }];
    for (const im of images) {
      content.push({ type: 'image', source: { type: 'base64', media_type: 'image/png', data: bytesToB64(im.bytes) } });
    }
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({ model: 'claude-sonnet-5', max_tokens: 500, messages: [{ role: 'user', content }] }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { content?: { type: string; text?: string }[] };
    const text = data.content?.find((c) => c.type === 'text')?.text ?? '';
    const m = text.match(/\{[\s\S]*\}/);
    if (!m) return null;
    const out = JSON.parse(m[0]) as { pick?: number; reasons?: string; verdicts?: string[] };
    const pick = Number(out.pick);
    return {
      pick: Number.isInteger(pick) && pick >= 1 && pick <= images.length ? pick : null,
      reasons: String(out.reasons ?? '').slice(0, 300),
      verdicts: Array.isArray(out.verdicts) ? out.verdicts.map((v) => String(v).slice(0, 200)) : [],
    };
  } catch { return null; }
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  // autopost와 같은 보호 — Access 밖(크론)이므로 키가 유일한 문
  if (!env.PUBLISH_KEY) return json(500, { ok: false, error: 'PUBLISH_KEY not configured' });
  if (request.headers.get('X-Publish-Key') !== env.PUBLISH_KEY) return json(403, { ok: false, error: 'forbidden' });

  const date = kstDate(Date.now());

  // ② 사람 우선 — 이미 접힌 하루가 있으면 자동은 물러난다
  const storedRaw = await env.PLANET.get(memoryKey(date));
  if (storedRaw) {
    return json(200, { ok: true, skipped: 'human_day', detail: `${date}의 하루가 이미 서 있다 — 사람 우선(조건 ②)` });
  }

  // ③ 하루 접기 — 관찰이 없으면 접지 않는다
  const capturesRaw = await env.PLANET.get('capture_meta');
  const captures: CaptureLike[] = capturesRaw ? JSON.parse(capturesRaw) : [];
  const day = buildDayMemory(captures, date);
  if (!day) return json(200, { ok: true, skipped: 'no_observations', detail: `${date}에 관찰이 없다 — 빈 기억을 지어내지 않는다(조건 ③)` });
  const errs = validateDayMemory(day);
  if (errs.length) return json(500, { ok: false, error: 'invalid_memory', detail: errs });
  await env.PLANET.put(memoryKey(date), JSON.stringify(day));

  // 생성 준비 — 확정 레시피 그대로 (수동 흐름과 동일 재료)
  const provider = selectProvider('workers-ai', env);
  const sceneEn = await translateScene(env, day.event.lines).catch(() => null);
  const subjTr = day.event.targetLabel
    ? await translateSubjects(env, [day.event.targetLabel])
    : { subjects: [] as string[], notes: [] as string[] };
  const refKeys = orderCharacterRefs(DAILY_REFS);
  const refs: { name: string; bytes: ArrayBuffer; contentType: string }[] = [];
  for (const key of refKeys) {
    const obj = await env.CAPTURES.get(key);
    if (obj) refs.push({ name: key.split('/').pop() ?? 'ref', bytes: await obj.arrayBuffer(), contentType: obj.httpMetadata?.contentType ?? 'image/png' });
  }
  const prompt = buildImagePrompt(day.event, null, sceneEn, subjTr.subjects, { characters: refs.length, styles: 0 });
  const promptHash = hashPrompt(prompt);
  const trialId = `${date}-${hashPrompt(`${prompt}\n#refs:${refKeys.join(',')}|\n#steps:${DAILY_STEPS}`)}`;

  // ④⑤ 3장 생성 — 날짜 파생 seed, 생성까지만
  const base = dailySeed(date);
  const made: TrialRecord[] = [];
  const errors: string[] = [...subjTr.notes];
  const judged: { seed: number; bytes: ArrayBuffer }[] = [];
  for (let n = 0; n < 3; n++) {
    const art = await provider.generate(env, {
      plan: { memory: day.event, prompt, referenceKeys: refKeys },
      model: DAILY_MODEL, params: { steps: DAILY_STEPS, width: 1024, height: 1024 },
      references: refs, seed: base + n,
    });
    if ('error' in art) { errors.push(`#${n}: ${art.error}`); continue; }
    if (!art.bytes) { errors.push(`#${n}: empty`); continue; }
    const r2Key = trialKey(trialId, DAILY_MODEL, n);
    await env.CAPTURES.put(r2Key, art.bytes, { httpMetadata: { contentType: 'image/png' } });
    judged.push({ seed: base + n, bytes: art.bytes });
    made.push({
      trialId, createdAt: Date.now(), providerId: 'workers-ai', model: DAILY_MODEL,
      params: { steps: DAILY_STEPS, width: 1024, height: 1024 }, seed: base + n, r2Key,
      promptHash, sketchVersion: SKETCH_VERSION, note: 'daily-auto (조건표 A — 채택·발행은 사람)',
      referenceApplied: refs.length > 0, role: refs.length > 0 ? 'candidate' : 'control',
      sceneLabel: null, refKeys,
    });
  }
  // 최근 생성 목록에 편입 — 아침의 📌·🕊는 실험실 기존 UI 그대로
  const metaRaw = await env.PLANET.get(META_KEY);
  const prev: TrialRecord[] = metaRaw ? JSON.parse(metaRaw) : [];
  await env.PLANET.put(META_KEY, JSON.stringify([...made, ...prev].slice(0, META_KEEP)));

  // ⑥ 판정기 — 기록만
  const reco = made.length ? await judgeCandidates(env, day, judged) : null;
  await env.PLANET.put(RECO_KEY(date), JSON.stringify({
    date, at: Date.now(), trialId,
    picks: made.map((m) => ({ seed: m.seed, r2Key: m.r2Key })),
    reco, errors,
  }));

  console.log(`sketch-daily date=${date} made=${made.length} reco=${reco?.pick ?? '-'} errors=${errors.length}`);
  return json(200, {
    ok: made.length > 0, date, memoryEventId: day.memoryEventId,
    generated: made.length, trialId, reco, errors,
    next: '아침에 실험실 최근 생성에서 📌 → 🕊 (조건 ⑤ — 채택·발행은 사람)',
  });
};
