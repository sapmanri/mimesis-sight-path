// BUILD 431 — /api/ops/sketch-trial (Ops 호스트 전용 · Access 뒤)
// 판정: Vase 2026-07-19 심야 — 스타일 검증 경로. **운영 경로가 아니다.**
//
// 이 엔드포인트가 답하려는 질문은 하나뿐이다:
//   같은 아이가 매일 그린 그림처럼 보이는가?
//
// 그래서 동일 MemoryEvent를 반복 생성할 수 있어야 하고, 모델명·파라미터가 남아야 하고,
// 결과는 7장 스타일 보드로 나란히 비교할 수 있어야 한다.
//
// ⛔ 하드룰 (validate:ops가 감시):
//   - 자동 게시 금지 · 크론 연결 금지 · 하루 1장 정기 생성 금지
//   - 산출물은 sketch-trials/ prefix 에만. 운영 captures/ 와 섞지 않는다
//   - autopost·publish·threads 어떤 경로와도 연결되지 않는다

import {
  selectProvider, trialKey, TRIAL_R2_PREFIX, WORKERS_AI_CANDIDATES,
  type ImageProviderId, type ImageProviderEnv, type DailySketchPlan,
} from '../_image-provider.ts';
import { buildSketchPrompt, SKETCH_RULES, SKETCH_VERSION, type MemoryEvent } from '../_daily-sketch.ts';

interface Env extends ImageProviderEnv {
  PLANET: KVNamespace;
  CAPTURES: R2Bucket;
}

const META_KEY = 'sketch_trial_meta';
const META_KEEP = 60;
const MAX_PER_CALL = 6;          // 한 번에 6장까지 — 사용량 한도를 존중한다
const JSON_HEADERS = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' };

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });

export interface TrialRecord {
  trialId: string;
  createdAt: number;
  providerId: ImageProviderId;
  model: string;
  params: Record<string, unknown>;
  seed: number | null;
  r2Key: string | null;
  promptHash: string;
  sketchVersion: string;
  note: string;
}

/** 같은 프롬프트인지 한눈에 — 스타일 비교는 프롬프트가 같아야 성립한다. */
export function hashPrompt(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return (h >>> 0).toString(16).padStart(8, '0');
}

/** 요청 검증 — 실수로 운영처럼 쓰이는 것을 막는다. */
export function validateTrialInput(body: unknown): { ok: true; value: {
  memory: MemoryEvent; models: string[]; count: number; providerId: ImageProviderId;
  referenceKeys: string[]; seed?: number;
} } | { ok: false; error: string } {
  const b = (body ?? {}) as Record<string, unknown>;
  if (b.confirm !== 'trial') return { ok: false, error: 'confirm_required: {"confirm":"trial"}' };
  const memory = b.memory as MemoryEvent | undefined;
  if (!memory || typeof memory !== 'object' || !Array.isArray(memory.lines) || !memory.lines.length) {
    return { ok: false, error: 'memory_required: MemoryEvent with non-empty lines' };
  }
  const models = Array.isArray(b.models) ? b.models.filter((m): m is string => typeof m === 'string' && !!m) : [];
  if (!models.length) return { ok: false, error: `models_required: 예) ${Object.values(WORKERS_AI_CANDIDATES).map((c) => c.model).join(', ')}` };
  const count = Number(b.count ?? 3);
  if (!Number.isInteger(count) || count < 1) return { ok: false, error: 'count must be a positive integer' };
  if (models.length * count > MAX_PER_CALL) {
    return { ok: false, error: `too_many: models×count ≤ ${MAX_PER_CALL} (사용량 한도 존중)` };
  }
  const providerId = (b.provider as ImageProviderId) ?? 'workers-ai';
  const referenceKeys = Array.isArray(b.referenceKeys) ? b.referenceKeys.filter((k): k is string => typeof k === 'string') : [];
  const seed = b.seed === undefined ? undefined : Number(b.seed);
  return { ok: true, value: { memory, models, count, providerId, referenceKeys, seed } };
}

/** GET — 지금까지의 시험 기록 + 스타일 보드용 목록. 생성하지 않는다. */
export const onRequestGet: PagesFunction<Env> = async ({ env }) => {
  const raw = await env.PLANET.get(META_KEY);
  const records: TrialRecord[] = raw ? JSON.parse(raw) : [];
  return json(200, {
    ok: true,
    sketchVersion: SKETCH_VERSION,
    rules: SKETCH_RULES,
    candidates: WORKERS_AI_CANDIDATES,
    prefix: TRIAL_R2_PREFIX,
    aiBinding: Boolean(env.AI),
    judgingCriteria: [
      '별이 얼굴과 머리 모양 유지', '빼콩이 생김새 유지', '남색 외곽선', '4~6색 제한',
      '모눈종이 배경', '낙서 배치', '장면보다 기억의 강조', '7일 연속 놓았을 때 같은 화가처럼 보이는가',
    ],
    records: records.slice(0, META_KEEP),
  });
};

/** POST — 같은 기억으로 반복 생성. 게시하지 않는다. */
export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  let body: unknown;
  try { body = await request.json(); } catch { return json(400, { error: 'invalid_json' }); }
  const checked = validateTrialInput(body);
  if (!checked.ok) return json(400, { error: checked.error });
  const { memory, models, count, providerId, referenceKeys, seed } = checked.value;

  const prompt = buildSketchPrompt(memory, null);
  const plan: DailySketchPlan = { memory, prompt, referenceKeys };
  const provider = selectProvider(providerId, env);
  const trialId = `${new Date().toISOString().slice(0, 10)}-${hashPrompt(prompt)}`;
  const promptHash = hashPrompt(prompt);

  const made: TrialRecord[] = [];
  const errors: string[] = [];
  for (const model of models) {
    for (let n = 0; n < count; n++) {
      const params = { steps: 4, ...(referenceKeys.length ? { reference_images: referenceKeys } : {}) };
      const art = await provider.generate(env, { plan, model, params, seed: seed === undefined ? undefined : seed + n });
      if ('error' in art) { errors.push(`${model}#${n}: ${art.error}`); continue; }
      let r2Key: string | null = null;
      if (art.bytes) {
        r2Key = trialKey(trialId, model, n);
        await env.CAPTURES.put(r2Key, art.bytes, { httpMetadata: { contentType: art.contentType } });
      }
      made.push({
        trialId, createdAt: art.createdAt, providerId: art.providerId, model: art.model,
        params: art.params, seed: art.seed, r2Key, promptHash, sketchVersion: SKETCH_VERSION, note: art.note,
      });
    }
  }

  const raw = await env.PLANET.get(META_KEY);
  const prev: TrialRecord[] = raw ? JSON.parse(raw) : [];
  await env.PLANET.put(META_KEY, JSON.stringify([...made, ...prev].slice(0, META_KEEP)));

  return json(200, {
    ok: true, trialId, prompt, promptHash,
    provider: provider.id,
    generated: made.length, records: made, errors,
    reminder: '시험 산출물이다. 게시·크론 연결 금지. 스타일 판정 후에만 provider 승격.',
  });
};
