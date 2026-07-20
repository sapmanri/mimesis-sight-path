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
  selectProvider, trialKey, TRIAL_R2_PREFIX, WORKERS_AI_CANDIDATES, MAX_REFERENCE_IMAGES,
  type ImageProviderId, type ImageProviderEnv, type DailySketchPlan, type ReferenceImage,
} from '../_image-provider.ts';
import { buildSketchPrompt, buildImagePrompt, SKETCH_RULES, SKETCH_DENSITY, SKETCH_VERSION, CHARACTER_IDENTITY_CHECKS, glossaryLine, type MemoryEvent } from '../_daily-sketch.ts';

interface Env extends ImageProviderEnv {
  PLANET: KVNamespace;
  CAPTURES: R2Bucket;
  ANTHROPIC_API_KEY?: string;   // 장면 번역용 (없으면 대상 이름으로 최소 구성)
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
  /** 참조 이미지가 실제로 들어갔는가. 모델이 못 받으면 false — 기록이 거짓말하면 안 된다. */
  referenceApplied: boolean;
  /**
   * candidate = 참조를 받은 스타일 고정 후보 / control = 텍스트 프롬프트만으로
   * 어디까지 유지되는지 보는 대조군. 둘을 같은 줄에 놓고 비교하면 판정이 틀어진다.
   */
  role: 'candidate' | 'control';
  /** 다중 장면 시험에서 어떤 하루였는지 */
  sceneLabel?: string | null;
}

/** "다른 장면에서도 같은 아이인가" — 같은 참조로 서로 다른 하루를 그린다. */
export interface TrialScene {
  label?: string;
  sceneEn?: string;
  subjects?: string[];
  targetLabel?: string;
  lines?: string[];
}

/** 모델이 참조 입력을 지원하는지 — 등록된 후보표가 유일한 근거. 모르면 지원 안 함으로 본다. */
export function supportsReference(model: string): boolean {
  return Object.values(WORKERS_AI_CANDIDATES).some((c) => c.model === model && c.supportsReference);
}

/**
 * 관찰(한국어) → 장면(영어) 한 줄. 이미지 모델이 영어로 학습돼 있어서 필요한 단계일 뿐,
 * 창작이 아니다 — 있는 것만 옮기고 없는 것을 더하지 않는다.
 */
export async function translateScene(env: { ANTHROPIC_API_KEY?: string }, lines: string[]): Promise<string | null> {
  if (!env.ANTHROPIC_API_KEY || !lines.length) return null;
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-5', max_tokens: 120,
      system: `Translate the Korean observation notes into ONE short English clause describing only what is physically present. No interpretation, no added objects, no emotion words. Output the clause only.
Proper nouns (use these exact renderings): ${glossaryLine()}.`,
      messages: [{ role: 'user', content: lines.join('\n') }],
    }),
  });
  if (!res.ok) return null;
  const data = (await res.json()) as { content?: { type: string; text?: string }[] };
  const t = (data.content?.find((c) => c.type === 'text')?.text ?? '').trim();
  return t || null;
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
  referenceKeys: string[]; seed?: number; subjects: string[];
  styleKeys: string[]; scenes: TrialScene[];
} } | { ok: false; error: string } {
  const b = (body ?? {}) as Record<string, unknown>;
  if (b.confirm !== 'trial') return { ok: false, error: 'confirm_required: {"confirm":"trial"}' };
  const memory = b.memory as MemoryEvent | undefined;
  if (!memory || typeof memory !== 'object' || !Array.isArray(memory.lines) || !memory.lines.length) {
    return { ok: false, error: 'memory_required: MemoryEvent with non-empty lines' };
  }
  // density가 어긋나면 프롬프트 조립에서 터진다 — 시험 한 번을 날리느니 여기서 잡는다
  if (!Object.prototype.hasOwnProperty.call(SKETCH_DENSITY, memory.density)) {
    return { ok: false, error: `bad_density: ${Object.keys(SKETCH_DENSITY).join(' | ')} 중 하나` };
  }
  const models = Array.isArray(b.models) ? b.models.filter((m): m is string => typeof m === 'string' && !!m) : [];
  if (!models.length) return { ok: false, error: `models_required: 예) ${Object.values(WORKERS_AI_CANDIDATES).map((c) => c.model).join(', ')}` };
  const count = Number(b.count ?? 3);
  if (!Number.isInteger(count) || count < 1) return { ok: false, error: 'count must be a positive integer' };
  const scenesN = Array.isArray(b.scenes) ? (b.scenes as unknown[]).length : 0;
  const shots = models.length * (scenesN || count);
  if (shots > MAX_PER_CALL) {
    return { ok: false, error: `too_many: models×(scenes||count) ≤ ${MAX_PER_CALL} (사용량 한도 존중)` };
  }
  const providerId = (b.provider as ImageProviderId) ?? 'workers-ai';
  const subjects = Array.isArray(b.subjects) ? b.subjects.filter((x): x is string => typeof x === 'string' && !!x) : [];
  const styleKeys = Array.isArray(b.styleKeys) ? b.styleKeys.filter((k): k is string => typeof k === 'string') : [];
  // 다중 장면 — "다른 장면에서도 같은 아이인가"를 한 번에 본다
  const scenes: TrialScene[] = Array.isArray(b.scenes)
    ? (b.scenes as TrialScene[]).filter((x) => x && typeof x === 'object')
    : [];
  const referenceKeys = Array.isArray(b.referenceKeys) ? b.referenceKeys.filter((k): k is string => typeof k === 'string') : [];
  const seed = b.seed === undefined ? undefined : Number(b.seed);
  return { ok: true, value: { memory, models, count, providerId, referenceKeys, seed, subjects, styleKeys, scenes } };
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
      'Style Identity — 같은 아이가 그린 것 같은가 (예쁜 그림이 아니라 별이의 그림인가)',
    ],
    characterIdentityChecks: CHARACTER_IDENTITY_CHECKS,
    referenceHowTo: 'GET/POST /api/ops/sketch-reference — sketch-trials/reference/ 에 기준 그림 등록',
    records: records.slice(0, META_KEEP),
  });
};

/** POST — 같은 기억으로 반복 생성. 게시하지 않는다. */
export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  let body: unknown;
  try { body = await request.json(); } catch { return json(400, { error: 'invalid_json' }); }
  const checked = validateTrialInput(body);
  if (!checked.ok) return json(400, { error: checked.error });
  const { memory, models, count, providerId, referenceKeys, seed, subjects, styleKeys, scenes } = checked.value;

  // 모델에 나가는 프롬프트는 영어여야 한다(1차 실패: 한국어 프롬프트 → 글자가 그려진 접시).
  // 관찰은 한국어가 원본이므로 장면만 영어로 옮긴다. 번역 실패는 치명적이지 않다 — 대상 이름으로 최소 구성.
  const sceneEn = (typeof (body as Record<string, unknown>).sceneEn === 'string'
    ? (body as Record<string, string>).sceneEn
    : await translateScene(env, memory.lines).catch(() => null));
  const promptKo = buildSketchPrompt(memory, null);   // 사람이 검토할 원본
  // 기준 그림을 **실제로 읽는다.** 키만 믿으면 없는 파일을 넘기고도 candidate로 기록돼
  // 결과가 거짓말을 한다(4차 사고: .png로 요청했는데 저장된 건 .jpg였다).
  const refErrors: string[] = [];
  const load = async (keys: string[]) => {
    const out: ReferenceImage[] = [];
    for (const key of keys) {
      const obj = await env.CAPTURES.get(key);
      if (!obj) { refErrors.push(`reference_missing: ${key}`); continue; }
      out.push({
        name: key.split('/').pop() ?? 'ref',
        bytes: await obj.arrayBuffer(),
        contentType: obj.httpMetadata?.contentType ?? 'image/png',
      });
    }
    return out;
  };
  // 순서가 곧 프롬프트의 인덱스다: 캐릭터(image 0..) → 스타일(그다음)
  const charRefs = await load(referenceKeys);
  const styleRefs = await load(styleKeys);
  const allRefs = [...charRefs, ...styleRefs];
  if (allRefs.length > MAX_REFERENCE_IMAGES) {
    // 모델 상한(4장)을 넘으면 뒤가 잘린다. 조용히 버리면 판정이 틀어진다.
    refErrors.push(`references_truncated: ${allRefs.length}장 중 앞 ${MAX_REFERENCE_IMAGES}장만 사용 (모델 상한)`);
  }
  const references = allRefs.slice(0, MAX_REFERENCE_IMAGES);
  const nChar = Math.min(charRefs.length, MAX_REFERENCE_IMAGES);
  const nStyle = Math.max(0, references.length - nChar);
  // 장면이 여러 개면 각각 프롬프트를 만든다 — 같은 참조, 다른 하루
  const shotPlans = (scenes.length ? scenes : [{ sceneEn: sceneEn ?? undefined, subjects }]).map((sc) => {
    const mem = { ...memory, targetLabel: sc.targetLabel ?? memory.targetLabel, lines: sc.lines ?? memory.lines };
    return {
      label: sc.label ?? null,
      prompt: buildImagePrompt(mem, null, sc.sceneEn ?? sceneEn, sc.subjects ?? subjects, { characters: nChar, styles: nStyle }),
    };
  });
  const prompt = shotPlans[0].prompt;
  const plan: DailySketchPlan = { memory, prompt, referenceKeys };
  const provider = selectProvider(providerId, env);
  const trialId = `${new Date().toISOString().slice(0, 10)}-${hashPrompt(prompt)}`;
  const promptHash = hashPrompt(prompt);

  const made: TrialRecord[] = [];
  const errors: string[] = [...refErrors];
  for (const model of models) {
    const shots = scenes.length ? shotPlans.length : count;
    for (let n = 0; n < shots; n++) {
      const shot = shotPlans[scenes.length ? n : 0];
      // 참조를 못 받는 모델에 참조를 넘기지 않는다. 넘긴 척도 하지 않는다.
      // 실제로 읽힌 참조가 있을 때만 후보다. 모델이 못 받거나 파일이 없으면 대조군.
      const refOk = references.length > 0 && supportsReference(model);
      const params = { steps: 4, width: 1024, height: 1024 };
      const art = await provider.generate(env, {
        plan: { ...plan, prompt: shot.prompt }, model, params,
        references: refOk ? references : [],
        seed: seed === undefined ? undefined : seed + n,
      });
      if ('error' in art) { errors.push(`${model}#${n}: ${art.error}`); continue; }
      let r2Key: string | null = null;
      if (art.bytes) {
        r2Key = trialKey(trialId, model, n);
        await env.CAPTURES.put(r2Key, art.bytes, { httpMetadata: { contentType: art.contentType } });
      }
      made.push({
        trialId, createdAt: art.createdAt, providerId: art.providerId, model: art.model,
        params: art.params, seed: art.seed, r2Key,
        promptHash: hashPrompt(shot.prompt), sketchVersion: SKETCH_VERSION, note: art.note,
        referenceApplied: refOk, role: refOk ? 'candidate' : 'control',
        sceneLabel: shot.label,
      });
    }
  }

  const raw = await env.PLANET.get(META_KEY);
  const prev: TrialRecord[] = raw ? JSON.parse(raw) : [];
  await env.PLANET.put(META_KEY, JSON.stringify([...made, ...prev].slice(0, META_KEEP)));

  return json(200, {
    ok: true, trialId, prompt, promptKo, promptHash,
    provider: provider.id,
    generated: made.length, records: made, errors,
    referencesLoaded: { characters: charRefs.map((r) => r.name), styles: styleRefs.map((r) => r.name) },
    scenes: shotPlans.map((p) => p.label),
    reminder: '시험 산출물이다. 게시·크론 연결 금지. 스타일 판정 후에만 provider 승격.',
  });
};
