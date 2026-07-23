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
  PULSE_KEY?: string;
  ANTHROPIC_API_KEY?: string;
}

const META_KEY = 'sketch_trial_meta';
const META_KEEP = 60;
const RECO_KEY = (date: string) => `sketch_daily_reco:${date}`;
const DAILY_MODEL = '@cf/black-forest-labs/flux-2-dev';
// steps 12 = 품질 판정값 (07-21 심야, "하고하고 또 해서" 결정) — 품질값은 상수다.
// 07-24 실증: 실패 원인은 스텝이 아니라 30초 클라이언트가 생성 도중 끊은 것.
// 인내심 있는 클라이언트(재시도 경로, 120초)로 부르면 flux-2-dev는 정상 생성된다.
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

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
  // 날짜 오버라이드 — 이미 접힌 날짜의 생성 재시도 전용. 과거 하루를 새로 접지는 않는다.
  const url = new URL(request.url);
  const dateParam = url.searchParams.get('date');
  const resetParam = url.searchParams.get('reset') === '1';
  if (dateParam && !/^\d{4}-\d{2}-\d{2}$/.test(dateParam)) return json(400, { ok: false, error: 'bad_date' });
  const date = dateParam ?? kstDate(Date.now());

  // 인증: 크론(PUBLISH_KEY)이 정문. 재시도(?date=)에 한해 PULSE_KEY 보조 허용 —
  // (07-24: 검증·완주를 기록자가 직접 할 수 있어야 한다. 48시간 실사고의 구조적 수리.
  //  하루를 접는 권한은 여전히 PUBLISH_KEY 전용이다.)
  if (!env.PUBLISH_KEY) return json(500, { ok: false, error: 'PUBLISH_KEY not configured' });
  const pubOk = request.headers.get('X-Publish-Key') === env.PUBLISH_KEY;
  const pulseRetryOk = !!dateParam && !!env.PULSE_KEY && request.headers.get('X-Pulse-Key') === env.PULSE_KEY;
  if (!pubOk && !pulseRetryOk) return json(403, { ok: false, error: 'forbidden' });

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
    const resumable = (!!prevReco && !prevReco.skipped
      && Array.isArray(prevReco.picks) && prevReco.picks.length < 3)
      || (resetParam && pulseRetryOk);   // 리셋: 시험분 폐기 후 정규 품질로 재생성 (재시도 경로 전용)
    if (!resumable) {
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

  // 실측 확정(07-24): 응답 이후의 백그라운드 실행(waitUntil)은 이 환경에서 기록을 남기지
  // 못한다 (202 후 무변화 2회 실증). 결론: 30초 안에 동기로 끝내고, 한 장 끝날 때마다
  // 즉시 기록한다 — 도중에 끊겨도 부분 결과가 남는다.
  const summary = await generateDaily(env, date, day, context, resetParam && pulseRetryOk);
  return json(summary.made > 0 || summary.done ? 200 : 502, {
    ok: summary.made > 0 || summary.done, date, memoryEventId: day.memoryEventId,
    generatedNow: summary.made, totalImages: summary.total, done: summary.done,
    trialId: summary.trialId, errors: summary.errors,
    next: summary.done ? '3장 완성 — 아침에 📌 → 🕊' : '아직 부족 — 같은 호출을 다시 (한 호출 = 한 장)',
  });
};

async function generateDaily(
  env: Env, date: string, day: DayMemory, context: Parameters<PagesFunction<Env>>[0], reset = false,
): Promise<{ made: number; total: number; done: boolean; trialId: string; errors: string[] }> {
  // 이어 그리기 상태 — flux-2-dev는 느리다(장당 10~20초). 한 호출은 한 장만 (30초 창 준수).
  const prevRaw = await env.PLANET.get(RECO_KEY(date));
  const prev = prevRaw ? JSON.parse(prevRaw) as {
    trialId?: string; picks?: { seed: number; r2Key: string }[]; errors?: string[]; skipped?: string;
  } : null;
  const priorPicks = (!reset && !prev?.skipped && Array.isArray(prev?.picks)) ? prev!.picks! : [];
  const errors: string[] = [];
  if (reset && (prev?.picks?.length ?? 0) > 0) errors.push(`reset: 이전 ${prev!.picks!.length}장 폐기 후 정규 품질로 재생성`);
  if (priorPicks.length >= 3) {
    return { made: 0, total: 3, done: true, trialId: prev?.trialId ?? '', errors: ['already_complete'] };
  }
  const n = priorPicks.length;   // 다음에 그릴 장 번호 (seed 결정론 유지)

  // 생성 준비 — 확정 레시피 그대로 (수동 흐름과 동일 재료·동일 모델 flux-2-dev)
  const provider = selectProvider('workers-ai', env);
  const sceneEn = await translateScene(env, day.event.lines).catch(() => null);
  const subjTr = day.event.targetLabel
    ? await translateSubjects(env, [day.event.targetLabel])
    : { subjects: [] as string[], notes: [] as string[] };
  errors.push(...subjTr.notes);
  const refKeys = orderCharacterRefs(DAILY_REFS);
  const refs: { name: string; bytes: ArrayBuffer; contentType: string }[] = [];
  for (const key of refKeys) {
    const obj = await env.CAPTURES.get(key);
    if (obj) refs.push({ name: key.split('/').pop() ?? 'ref', bytes: await obj.arrayBuffer(), contentType: obj.httpMetadata?.contentType ?? 'image/png' });
  }
  const prompt = buildImagePrompt(day.event, null, sceneEn, subjTr.subjects, { characters: refs.length, styles: 0 });
  const promptHash = hashPrompt(prompt);
  // trialId는 첫 호출 것을 계승 — 번역이 매번 조금 달라도 같은 하루의 한 시도로 묶는다
  const trialId = prev?.trialId && !prev.skipped
    ? prev.trialId
    : `${date}-${hashPrompt(`${prompt}\n#refs:${refKeys.join(',')}|\n#steps:${DAILY_STEPS}`)}`;

  const base = dailySeed(date);
  const TRANSIENT_AI = /3040|5030|429|capacity|timeout|temporarily/i;
  const gen = (withRefs: boolean) => provider.generate(env, {
    plan: { memory: day.event, prompt, referenceKeys: withRefs ? refKeys : [] },
    model: DAILY_MODEL, params: { steps: DAILY_STEPS, width: 1024, height: 1024 },
    references: withRefs ? refs : [], seed: base + n,
  });
  let usedRefs = refs.length > 0;
  let art = await gen(usedRefs);
  if ('error' in art && TRANSIENT_AI.test(String(art.error)) && usedRefs) {
    errors.push(`#${n}: refs_dropped_after_transient — 무참조 재시도`);
    usedRefs = false;
    art = await gen(false);
  }

  const persist = async (newPick: { seed: number; r2Key: string } | null) => {
    await env.PLANET.put(RECO_KEY(date), JSON.stringify({
      date, at: Date.now(), trialId,
      picks: newPick ? [...priorPicks, newPick] : priorPicks,
      reco: null,
      errors: [...(prev?.errors ?? []).filter((e) => typeof e === 'string'), ...errors],
      status: (newPick ? priorPicks.length + 1 : priorPicks.length) >= 3 ? 'done' : 'partial',
    }));
  };

  if ('error' in art) { errors.push(`#${n}: ${art.error}`); await persist(null); return { made: 0, total: priorPicks.length, done: false, trialId, errors }; }
  if (!art.bytes) { errors.push(`#${n}: empty`); await persist(null); return { made: 0, total: priorPicks.length, done: false, trialId, errors }; }

  const r2Key = trialKey(trialId, DAILY_MODEL, n);
  await env.CAPTURES.put(r2Key, art.bytes, { httpMetadata: { contentType: 'image/png' } });
  const record: TrialRecord = {
    trialId, createdAt: Date.now(), providerId: 'workers-ai', model: DAILY_MODEL,
    params: { steps: DAILY_STEPS, width: 1024, height: 1024 }, seed: base + n, r2Key,
    promptHash, sketchVersion: SKETCH_VERSION, note: 'daily-auto (조건표 A — 채택·발행은 사람)',
    referenceApplied: usedRefs, role: usedRefs ? 'candidate' : 'control',
    sceneLabel: null, refKeys: usedRefs ? refKeys : [],
  };
  const metaRaw = await env.PLANET.get(META_KEY);
  const prevMeta: TrialRecord[] = metaRaw ? JSON.parse(metaRaw) : [];
  await env.PLANET.put(META_KEY, JSON.stringify([record, ...prevMeta.filter((r) => r.r2Key !== r2Key)].slice(0, META_KEEP)));
  await persist({ seed: base + n, r2Key });

  const total = priorPicks.length + 1;
  // 3장 완성 시 판정기 — 보너스 (완주 확인된 그림들만 대상, 실패해도 그림은 안전)
  if (total >= 3) {
    context.waitUntil((async () => {
      const imgs: { seed: number; bytes: ArrayBuffer }[] = [];
      for (const pk of [...priorPicks, { seed: base + n, r2Key }]) {
        const obj = await env.CAPTURES.get(pk.r2Key);
        if (obj) imgs.push({ seed: pk.seed, bytes: await obj.arrayBuffer() });
      }
      const reco = await judgeCandidates(env, day, imgs);
      const raw = await env.PLANET.get(RECO_KEY(date));
      const cur = raw ? JSON.parse(raw) : {};
      await env.PLANET.put(RECO_KEY(date), JSON.stringify({ ...cur, reco }));
    })().catch(() => { /* 판정기 실패가 그림을 지우지 않는다 */ }));
  }

  console.log(`sketch-daily one-shot date=${date} n=${n} total=${total} errors=${errors.length}`);
  return { made: 1, total, done: total >= 3, trialId, errors };
}
