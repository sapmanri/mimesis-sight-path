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
  buildDayMemory, validateDayMemory, memoryKey, kstDate,
  linkPendingDiary, readPendingDiaries,
  type DayMemory, type CaptureLike,
} from './_memory-event.ts';
import {
  buildImagePrompt, CHARACTER_IDENTITY_CHECKS, NIGHTLY_POSE_VARIANTS, SKETCH_RULES, SKETCH_VERSION,
} from './_daily-sketch.ts';
import { selectProvider, trialKey, type ImageProviderEnv } from './_image-provider.ts';
// 431 게놈 배선 (08-11): buildSketchPrompt/buildImagePrompt는 처음부터 게놈 인자를 받게
// 설계됐는데 호출부가 전부 null이었다 — 별이가 그리는데 별이 눈으로 고르질 않았다.
import { buildGenomeContext } from './_genome-identity.ts';
import { translateScene, translateSubjects, hashPrompt, orderCharacterRefs, type TrialRecord } from './ops/sketch-trial.ts';
// ⚠ 2026-07-27: 이 한 줄이 없어서 **매일 밤 그림일기가 죽었다.**
//   d856916이 208~209줄에 readRefRoles·refsWithRole 호출만 넣고 import를 빠뜨렸다.
//   하루를 접은 뒤 이 지점에서 ReferenceError → Cloudflare 1101. reco를 못 남기고 죽으니
//   다음 호출이 「사람이 접은 하루」로 오인해 물러났고, 크래시가 정중한 건너뜀으로 위장됐다.
import { readRefRoles, refsWithRole } from './ops/sketch-reference.ts';

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
const RUN_KEY = (date: string) => `sketch_daily_run:${date}`;
type RunStatus = 'folding' | 'generating' | 'done' | 'skipped' | 'failed';
interface DailyRun {
  runId: string;
  date: string;
  owner: 'nightly-auto';
  status: RunStatus;
  stage: string;
  startedAt: number;
  updatedAt: number;
  errorCode?: string;
  errorName?: string;
  errorMessage?: string;
}
interface RunTrace { stage: string; runId: string; diaryLink?: string }

export function foldedDayDecision(
  day: Pick<DayMemory, 'foldedBy'>,
  hasAutoRun: boolean,
): 'resume' | 'human_day' | 'ownership_unknown' {
  if (day.foldedBy === 'nightly-auto' || hasAutoRun) return 'resume';
  if (day.foldedBy === 'human') return 'human_day';
  return 'ownership_unknown';
}
const DAILY_MODEL = '@cf/black-forest-labs/flux-2-dev';
// steps 12 = 품질 판정값 (07-21 심야, "하고하고 또 해서" 결정) — 품질값은 상수다.
// 07-24 실증: 실패 원인은 스텝이 아니라 30초 클라이언트가 생성 도중 끊은 것.
// 인내심 있는 클라이언트(재시도 경로, 120초)로 부르면 flux-2-dev는 정상 생성된다.
const DAILY_STEPS = 12;
/** 확정 레시피의 캐릭터 참조 — 포즈 시트 2장 (07-21 심야 판정) */
/**
 * ⚠ 폐지 예정 — **화면에서 배정한 역할이 정본이다** (실사고 2026-07-26).
 * 이 하드코딩 목록은 역할이 KV에 하나도 없을 때만 쓰는 최후 폴백이다.
 * 폴백을 탔다는 사실은 결과에 경고로 남긴다 — 조용히 다른 걸 싣지 않는다.
 */
const DAILY_REFS_FALLBACK = ['sketch-trials/reference/byeoli_poses.png', 'sketch-trials/reference/ppaekong_poses.png'];

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
  const trace: RunTrace = { stage: 'request', runId: '' };
  const url = new URL(context.request.url);
  const rawDate = url.searchParams.get('date');
  const date = rawDate && /^\d{4}-\d{2}-\d{2}$/.test(rawDate) ? rawDate : kstDate(Date.now());
  try {
    return await handleDaily(context, trace);
  } catch (error) {
    const e = error instanceof Error ? error : new Error(String(error));
    const now = Date.now();
    let previous: DailyRun | null = null;
    try {
      const raw = await context.env.PLANET.get(RUN_KEY(date));
      previous = raw ? JSON.parse(raw) as DailyRun : null;
    } catch { /* 실패 영수증 쓰기를 계속 시도한다 */ }
    const runId = trace.runId || previous?.runId || `${date}-${now.toString(36)}`;
    const failed: DailyRun = {
      runId, date, owner: 'nightly-auto', status: 'failed', stage: trace.stage,
      startedAt: previous?.startedAt ?? now, updatedAt: now,
      errorCode: 'unhandled_exception', errorName: e.name.slice(0, 80), errorMessage: e.message.slice(0, 300),
    };
    try {
      await Promise.all([
        context.env.PLANET.put(RUN_KEY(date), JSON.stringify(failed)),
        context.env.PLANET.put(RECO_KEY(date), JSON.stringify({
          date, at: now, status: 'failed', failed: true, stage: trace.stage,
          errorCode: 'unhandled_exception', errorName: failed.errorName,
          errorMessage: failed.errorMessage, runId,
        })),
      ]);
    } catch (receiptError) {
      console.error(`sketch-daily receipt_write_failed date=${date} runId=${runId}`, receiptError);
    }
    console.error(`sketch-daily failed date=${date} runId=${runId} stage=${trace.stage}`, e);
    return json(500, {
      ok: false, failed: true, date, runId, stage: trace.stage,
      errorCode: 'unhandled_exception', errorName: failed.errorName, errorMessage: failed.errorMessage,
    });
  }
};

async function handleDaily(
  context: Parameters<PagesFunction<Env>>[0], trace: RunTrace,
): Promise<Response> {
  const { request, env } = context;
  // 날짜 오버라이드 — 이미 접힌 날짜의 생성 재시도 전용. 과거 하루를 새로 접지는 않는다.
  const url = new URL(request.url);
  const dateParam = url.searchParams.get('date');
  const resetParam = url.searchParams.get('reset') === '1';
  if (dateParam && !/^\d{4}-\d{2}-\d{2}$/.test(dateParam)) return json(400, { ok: false, error: 'bad_date' });
  const date = dateParam ?? kstDate(Date.now());
  trace.stage = 'authenticate';

  // 인증: 크론(PUBLISH_KEY)이 정문. 재시도(?date=)에 한해 PULSE_KEY 보조 허용 —
  // (07-24: 검증·완주를 기록자가 직접 할 수 있어야 한다. 48시간 실사고의 구조적 수리.
  //  하루를 접는 권한은 여전히 PUBLISH_KEY 전용이다.)
  if (!env.PUBLISH_KEY) return json(500, { ok: false, error: 'PUBLISH_KEY not configured' });
  const pubOk = request.headers.get('X-Publish-Key') === env.PUBLISH_KEY;
  const pulseRetryOk = !!dateParam && !!env.PULSE_KEY && request.headers.get('X-Pulse-Key') === env.PULSE_KEY;
  if (!pubOk && !pulseRetryOk) return json(403, { ok: false, error: 'forbidden' });

  // 스케줄러가 모든 재시도를 소진했을 때 남기는 최종 영수증. 같은 인증 경로를 써서
  // Worker에 PLANET 바인딩이라는 두 번째 진실을 만들지 않는다.
  if (request.headers.get('X-Scheduler-Receipt') === 'failed') {
    const now = Date.now();
    const priorRaw = await env.PLANET.get(RUN_KEY(date));
    const prior = priorRaw ? JSON.parse(priorRaw) as DailyRun : null;
    const runId = prior?.runId ?? `${date}-${now.toString(36)}`;
    const failed: DailyRun = {
      runId, date, owner: 'nightly-auto', status: 'failed', stage: 'scheduler_exhausted',
      startedAt: prior?.startedAt ?? now, updatedAt: now,
      errorCode: 'max_calls_exhausted', errorName: 'SchedulerExhausted',
      errorMessage: 'scheduler exhausted MAX_CALLS without done or a valid terminal skip',
    };
    await Promise.all([
      env.PLANET.put(RUN_KEY(date), JSON.stringify(failed)),
      env.PLANET.put(RECO_KEY(date), JSON.stringify({
        date, at: now, status: 'failed', failed: true, stage: failed.stage,
        errorCode: failed.errorCode, errorName: failed.errorName,
        errorMessage: failed.errorMessage, runId,
      })),
    ]);
    return json(200, { ok: true, receipt: 'failed', runId });
  }

  // 건너뛰어도 기록은 남긴다 — 아침 실험실이 "왜 없는지"를 말할 수 있게 (침묵이 버그다).
  // 이미 생성 기록이 있으면 덮지 않는다.
  const recordSkip = async (skipped: string) => {
    if (!(await env.PLANET.get(RECO_KEY(date)))) {
      await env.PLANET.put(RECO_KEY(date), JSON.stringify({ date, at: Date.now(), skipped }));
    }
  };

  // ② 사람 우선 — 이미 접힌 하루가 있으면 자동은 물러난다
  trace.stage = 'read_memory';
  const [storedRaw, runRaw] = await Promise.all([
    env.PLANET.get(memoryKey(date)),
    env.PLANET.get(RUN_KEY(date)),
  ]);
  let run = runRaw ? JSON.parse(runRaw) as DailyRun : null;
  trace.runId = run?.runId ?? '';
  let day: DayMemory;
  if (storedRaw) {
    // 실사고(07-23 첫 실전): 크론이 하루를 접었는데 AI가 3연속 실패(AiError 3040/5030).
    // 이때 재실행하면 '사람 우선'으로 오인해 물러났다 — 자동 생성이 전멸한 날은
    // 접힌 하루를 재사용해 생성만 재시도한다 (하루는 다시 접지 않는다).
    const recoRaw = await env.PLANET.get(RECO_KEY(date));
    const prevReco = recoRaw ? JSON.parse(recoRaw) as { picks?: unknown[]; errors?: unknown[]; skipped?: string } : null;
    day = JSON.parse(storedRaw) as DayMemory;
    const ownership = foldedDayDecision(
      day,
      !!run && run.owner === 'nightly-auto' && run.date === date,
    );
    const ownedByAuto = ownership === 'resume';
    const resumable = ownedByAuto || (!!prevReco && !prevReco.skipped
      && Array.isArray(prevReco.picks) && prevReco.picks.length < 3)
      // 실사고(07-24, 매일 밤 반복된 교착): 크론이 하루를 접은 직후 30초에 살해당하면
      // memoryKey는 있는데 reco엔 자정의 no_observations 잔해만 남는다. 하루가 접혔다는
      // 것은 관측이 있었다는 뜻 — 그 위의 '관측 없음' 기록은 모순이며 사람일 수 없다.
      // 이 잔해는 재개 신호로 읽는다 (human_day는 그대로 존중 — 사람 우선 원칙 무손상).
      || prevReco?.skipped === 'no_observations'
      || (resetParam && pulseRetryOk);   // 리셋: 시험분 폐기 후 정규 품질로 재생성 (재시도 경로 전용)
    if (!resumable) {
      const skipped = ownership;
      await recordSkip(skipped);
      return json(200, {
        ok: true, skipped,
        detail: skipped === 'human_day'
          ? `${date}의 하루를 사람이 접었다 — 사람 우선(조건 ②)`
          : `${date}의 옛 하루는 접은 주체를 증명할 수 없어 자동이 덮지 않는다`,
      });
    }
  } else {
    if (dateParam) {
      return json(400, { ok: false, error: `not_folded: ${date} — 날짜 지정은 접힌 하루의 재시도 전용 (과거 하루를 새로 접지 않는다)` });
    }
    // ③ 하루 접기 — 관찰이 없으면 접지 않는다
    const capturesRaw = await env.PLANET.get('capture_meta');
    const captures: CaptureLike[] = capturesRaw ? JSON.parse(capturesRaw) : [];
    // 순간 고르기에 별이의 Selection 가산점이 이제야 흐른다 (라이브 별이 상태만 — 관찰자 로그 아님)
    const foldGenome = buildGenomeContext('byeoli', null).context;
    const built = buildDayMemory(captures, date, foldGenome?.selection ?? []);
    if (!built) {
      await recordSkip('no_observations');
      return json(200, { ok: true, skipped: 'no_observations', detail: `${date}에 관찰이 없다 — 빈 기억을 지어내지 않는다(조건 ③)` });
    }
    const now = Date.now();
    const runId = `${date}-${now.toString(36)}-${crypto.randomUUID().slice(0, 8)}`;
    trace.runId = runId;
    run = {
      runId, date, owner: 'nightly-auto', status: 'folding', stage: 'before_memory',
      startedAt: now, updatedAt: now,
    };
    // KV 다중 키 트랜잭션은 없으므로 원자성을 주장하지 않는다. memory보다 이 영수증을
    // 먼저 써 어느 지점에서 죽어도 다음 호출이 nightly-auto 소유임을 증명하게 한다.
    trace.stage = 'before_memory';
    await env.PLANET.put(RUN_KEY(date), JSON.stringify(run));
    let folded: DayMemory = {
      ...built, foldedBy: 'nightly-auto', foldedAt: Date.now(), foldRunId: runId,
    };
    // 431-M A안 보정 — 그날 발행된 글을 **사진으로 대조해** 붙인다. 발행은 접히기 전에
    // 끝나므로 발행 시점에는 붙일 수 없었다(실측 4일 전부). 사진이 어긋나면 안 붙인다.
    const linked = linkPendingDiary(folded, await readPendingDiaries(env, date).catch(() => []));
    folded = linked.day;
    trace.diaryLink = linked.result;
    const errs = validateDayMemory(folded);
    if (errs.length) return json(500, { ok: false, error: 'invalid_memory', detail: errs });
    trace.stage = 'write_memory';
    await env.PLANET.put(memoryKey(date), JSON.stringify(folded));
    day = folded;
    run = { ...run, status: 'generating', stage: 'prepare_refs', updatedAt: Date.now() };
    trace.stage = 'prepare_refs';
    await env.PLANET.put(RUN_KEY(date), JSON.stringify(run));
  }

  // 실측 확정(07-24): 응답 이후의 백그라운드 실행(waitUntil)은 이 환경에서 기록을 남기지
  // 못한다 (202 후 무변화 2회 실증). 결론: 30초 안에 동기로 끝내고, 한 장 끝날 때마다
  // 즉시 기록한다 — 도중에 끊겨도 부분 결과가 남는다.
  trace.stage = 'generate';
  const summary = await generateDaily(env, date, day, context, resetParam && pulseRetryOk);
  const now = Date.now();
  const currentRunRaw = await env.PLANET.get(RUN_KEY(date));
  const currentRun = currentRunRaw ? JSON.parse(currentRunRaw) as DailyRun : run;
  if (currentRun) {
    await env.PLANET.put(RUN_KEY(date), JSON.stringify({
      ...currentRun,
      status: summary.done ? 'done' : 'generating',
      stage: summary.done ? 'complete' : 'generate_next',
      updatedAt: now,
    }));
  }
  return json(summary.made > 0 || summary.done ? 200 : 502, {
    ok: summary.made > 0 || summary.done, date, memoryEventId: day.memoryEventId,
    generatedNow: summary.made, totalImages: summary.total, done: summary.done,
    trialId: summary.trialId, errors: summary.errors,
    next: summary.done ? '3장 완성 — 아침에 📌 → 🕊' : '아직 부족 — 같은 호출을 다시 (한 호출 = 한 장)',
  });
}

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
  // 참조는 화면이 정한다 — 크론이 자기 목록을 따로 들고 있으면 화면과 밤이 어긋난다.
  const roles = await readRefRoles(env);
  const assigned = refsWithRole(roles, 'character');
  if (!assigned.length) {
    errors.push('ref_roles_empty: 화면에서 배정된 캐릭터 참조가 없어 폴백 목록을 썼다 — 실험실 ②에서 역할을 지정하라');
  }
  const refKeys = orderCharacterRefs(assigned.length ? assigned : DAILY_REFS_FALLBACK);
  const refs: { name: string; bytes: ArrayBuffer; contentType: string }[] = [];
  for (const key of refKeys) {
    const obj = await env.CAPTURES.get(key);
    if (obj) refs.push({ name: key.split('/').pop() ?? 'ref', bytes: await obj.arrayBuffer(), contentType: obj.httpMetadata?.contentType ?? 'image/png' });
  }
  const drawGenome = buildGenomeContext('byeoli', null).context;
  const prompt = buildImagePrompt(
    day.event, drawGenome, sceneEn, subjTr.subjects,
    { characters: refs.length, styles: 0 },
    NIGHTLY_POSE_VARIANTS[n % NIGHTLY_POSE_VARIANTS.length],
  );
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
