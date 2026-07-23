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
// 07-23 밤 실측: 자동(steps 12) 100% 실패 vs 수동(steps 4) 성공 — 성공 경로와의 유일한 차이.
// flux 계열 스텝 상한 초과 시 입력 거부(즉시 3040) 가설. 검증된 값으로 정렬한다.
const DAILY_STEPS = 4;
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

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
  // autopost와 같은 보호 — Access 밖(크론)이므로 키가 유일한 문
  if (!env.PUBLISH_KEY) return json(500, { ok: false, error: 'PUBLISH_KEY not configured' });
  if (request.headers.get('X-Publish-Key') !== env.PUBLISH_KEY) return json(403, { ok: false, error: 'forbidden' });

  // 날짜 오버라이드 (07-24: "검증은 다음 크론에게" 패턴 제거 — 즉시 재시도 경로)
  // ?date=YYYY-MM-DD — 이미 접힌 날짜의 생성 재시도 전용. 과거 하루를 새로 접지는 않는다.
  const dateParam = new URL(request.url).searchParams.get('date');
  if (dateParam && !/^\d{4}-\d{2}-\d{2}$/.test(dateParam)) return json(400, { ok: false, error: 'bad_date' });
  const date = dateParam ?? kstDate(Date.now());

  // 건너뛰어도 기록은 남긴다 — 아침 실험실이 "왜 없는지"를 말할 수 있게 (침묵이 버그다).
  // 이미 생성 기록이 있으면 덮지 않는다.
  const recordSkip = async (skipped: string) => {
    if (!(await env.PLANET.get(RECO_KEY(date)))) {
      await env.PLANET.put(RECO_KEY(date), JSON.stringify({ date, at: Date.now(), skipped }));
    }
  };

  // ② 사람 우선 — 이미 접힌 하루가 있으면 자동은 물러난다
  const storedRaw = await env.PLANET.get(memoryKey(date));
  let day: DayMemory;
  if (storedRaw) {
    // 실사고(07-23 첫 실전): 크론이 하루를 접었는데 AI가 3연속 실패(AiError 3040/5030).
    // 이때 재실행하면 '사람 우선'으로 오인해 물러났다 — 자동 생성이 전멸한 날은
    // 접힌 하루를 재사용해 생성만 재시도한다 (하루는 다시 접지 않는다).
    const recoRaw = await env.PLANET.get(RECO_KEY(date));
    const prevReco = recoRaw ? JSON.parse(recoRaw) as { picks?: unknown[]; errors?: unknown[]; skipped?: string } : null;
    const failedAuto = !!prevReco && !prevReco.skipped
      && Array.isArray(prevReco.picks) && prevReco.picks.length === 0
      && Array.isArray(prevReco.errors) && prevReco.errors.length > 0;
    if (!failedAuto) {
      await recordSkip('human_day');
      return json(200, { ok: true, skipped: 'human_day', detail: `${date}의 하루가 이미 서 있다 — 사람 우선(조건 ②)` });
    }
    day = JSON.parse(storedRaw) as DayMemory;
  } else {
    if (dateParam) {
      return json(400, { ok: false, error: `not_folded: ${date} — 날짜 지정은 접힌 하루의 재시도 전용 (과거 하루를 새로 접지 않는다)` });
    }
    // ③ 하루 접기 — 관찰이 없으면 접지 않는다
    const capturesRaw = await env.PLANET.get('capture_meta');
    const captures: CaptureLike[] = capturesRaw ? JSON.parse(capturesRaw) : [];
    const built = buildDayMemory(captures, date);
    if (!built) {
      await recordSkip('no_observations');
      return json(200, { ok: true, skipped: 'no_observations', detail: `${date}에 관찰이 없다 — 빈 기억을 지어내지 않는다(조건 ③)` });
    }
    const errs = validateDayMemory(built);
    if (errs.length) return json(500, { ok: false, error: 'invalid_memory', detail: errs });
    await env.PLANET.put(memoryKey(date), JSON.stringify(built));
    day = built;
  }

  // 실사고(07-23 밤): 30초 클라이언트(크론) 타임아웃이 재시도 중인 실행을 끊었다 —
  // 자동 생성 성공률 0%의 두 번째 원인. 무거운 생성은 백그라운드로, 응답은 즉시.
  context.waitUntil(generateDaily(env, date, day).catch(async (e) => {
    await env.PLANET.put(RECO_KEY(date), JSON.stringify({
      date, at: Date.now(), trialId: 'bg-crash', picks: [], reco: null,
      errors: [`bg_crash: ${String(e).slice(0, 200)}`],
    }));
  }));
  return json(202, {
    ok: true, accepted: true, date, memoryEventId: day.memoryEventId,
    note: '하루는 접혔고 생성은 백그라운드에서 계속된다 — 결과는 실험실 🌙 패널 (조건 ⑤ 유지)',
  });
};

async function generateDaily(env: Env, date: string, day: DayMemory): Promise<void> {
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
  const TRANSIENT_AI = /3040|5030|429|capacity|timeout|temporarily/i;
  for (let n = 0; n < 3; n++) {
    const gen = (useRefs: boolean) => provider.generate(env, {
      plan: { memory: day.event, prompt, referenceKeys: useRefs ? refKeys : [] },
      model: DAILY_MODEL, params: { steps: DAILY_STEPS, width: 1024, height: 1024 },
      references: useRefs ? refs : [], seed: base + n,
    });
    let usedRefs = refs.length > 0;
    let art = await gen(usedRefs);
    // 일시 오류 재시도 — 첫 실전(07-23)에서 AiError 3040/5030 3연속으로 전멸
    for (let attempt = 1; attempt < 3 && 'error' in art && TRANSIENT_AI.test(String(art.error)); attempt++) {
      await new Promise((r) => setTimeout(r, 800 * attempt));
      art = await gen(usedRefs);
    }
    // 실사고(07-23 재실행): 참조 2장을 실은 호출만 3040 반복, 무참조는 성공 —
    // 마지막 수단: 무참조 폴백. 확정 그림체(07-20)가 원래 무참조 텍스트-only였다.
    if ('error' in art && TRANSIENT_AI.test(String(art.error)) && usedRefs) {
      usedRefs = false;
      errors.push(`#${n}: refs_dropped_after_transient — 무참조 폴백`);
      art = await gen(false);
    }
    if ('error' in art) { errors.push(`#${n}: ${art.error}`); continue; }
    if (!art.bytes) { errors.push(`#${n}: empty`); continue; }
    const r2Key = trialKey(trialId, DAILY_MODEL, n);
    await env.CAPTURES.put(r2Key, art.bytes, { httpMetadata: { contentType: 'image/png' } });
    judged.push({ seed: base + n, bytes: art.bytes });
    made.push({
      trialId, createdAt: Date.now(), providerId: 'workers-ai', model: DAILY_MODEL,
      params: { steps: DAILY_STEPS, width: 1024, height: 1024 }, seed: base + n, r2Key,
      promptHash, sketchVersion: SKETCH_VERSION, note: 'daily-auto (조건표 A — 채택·발행은 사람)',
      referenceApplied: usedRefs, role: usedRefs ? 'candidate' : 'control',
      sceneLabel: null, refKeys: usedRefs ? refKeys : [],
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

  console.log(`sketch-daily bg date=${date} made=${made.length} reco=${reco?.pick ?? '-'} errors=${errors.length}`);
}
