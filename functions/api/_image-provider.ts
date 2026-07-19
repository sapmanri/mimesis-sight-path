// BUILD 431 — ImageProvider 어댑터 (스타일 검증용, 운영 경로 아님)
// 판정: Vase 2026-07-19 심야 — "A로 시험은 한다. 하지만 A로 간다고 아직 결정하지는 않는다."
//
// 왜 어댑터인가: Workers AI는 **첫 후보일 뿐**이다. 연결이 가장 쉬운 선택이지
// 별이의 고정 그림체를 만들기 가장 좋은 선택이라고 확인된 게 아니다.
// 지금 파일럿의 질문은 "자동으로 매일 만들 수 있는가"가 아니라
// **"같은 아이가 매일 그린 그림처럼 보이는가"**다.
//
// 그래서 이 파일은 provider를 고정하지 않는다. 스타일 일관성이 실측으로 확인된
// 뒤에만 production provider로 승격한다.
//
// ⛔ 하드룰 (이 단계에서 금지):
//   - 자동 게시 금지 · 크론 연결 금지 · 하루 1장 생성도 아직 금지
//   - 결과는 별도 R2 test prefix에만 저장한다 (운영 captures/ 와 섞지 않는다)

import type { MemoryEvent } from './_daily-sketch.ts';

export const TRIAL_R2_PREFIX = 'sketch-trials/';   // 운영 captures/ 와 절대 겹치지 않게

export type ImageProviderId = 'workers-ai' | 'external-api' | 'manual';

/** 무엇을 그릴지까지 확정된 계획. provider는 이걸 그림으로만 바꾼다. */
export interface DailySketchPlan {
  memory: MemoryEvent;
  prompt: string;
  /** 참조 그림(그림체 기준). 다중 참조를 지원하는 모델에만 전달된다. */
  referenceKeys: string[];
}

export interface SketchRequest {
  plan: DailySketchPlan;
  model: string;
  params: Record<string, unknown>;
  seed?: number;
  /** 실제로 읽힌 기준 그림. 비어 있으면 참조 없이 생성된다(= 대조군). */
  references?: ReferenceImage[];
}

/** 재현성을 위해 모델명·파라미터를 반드시 함께 남긴다 (판정의 근거가 된다). */
export interface SketchArtifact {
  providerId: ImageProviderId;
  model: string;
  params: Record<string, unknown>;
  seed: number | null;
  bytes: ArrayBuffer | null;   // manual provider는 null — 사람이 외부에서 그린다
  contentType: string;
  createdAt: number;
  note: string;
}

export interface ImageProviderEnv {
  AI?: { run(model: string, input: Record<string, unknown>): Promise<unknown> };
  IMAGE_API_KEY?: string;
}

export interface ImageProvider {
  id: ImageProviderId;
  available(env: ImageProviderEnv): boolean;
  generate(env: ImageProviderEnv, req: SketchRequest): Promise<SketchArtifact | { error: string }>;
}

/* ═══ 후보 1 — Workers AI ════════════════════════════════════════
   flux-1-schnell: 빠르고 저렴하나 참조 그림체 고정 기능이 공식 설명으로 확인되지 않음.
   flux-2-dev: 다중 참조 입력을 지원한다고 명시 — 스타일 일관성 시험에는 이쪽이 유력.
   다만 사실적 이미지 지향이 별이의 단순 손그림에 맞는지는 별도 실험이 필요하다.
   ⚠ 로컬 Wrangler 추론조차 사용량 한도에 포함된다. */

export const WORKERS_AI_CANDIDATES = {
  // 입력 방식이 다르다: schnell은 평범한 JSON({prompt, steps}),
  // flux-2 계열은 multipart FormData를 {multipart:{body,contentType}}로 감싼다.
  'flux-1-schnell': { model: '@cf/black-forest-labs/flux-1-schnell', supportsReference: false, multipart: false },
  'flux-2-dev': { model: '@cf/black-forest-labs/flux-2-dev', supportsReference: true, multipart: true },
} as const;

/** 참조는 input_image_0 ... input_image_3 (최대 4장, 512×512). 프롬프트에서 인덱스로 지칭 가능. */
export const MAX_REFERENCE_IMAGES = 4;
export const referenceField = (i: number) => `input_image_${i}`;

export function usesMultipart(model: string): boolean {
  return Object.values(WORKERS_AI_CANDIDATES).some((c) => c.model === model && c.multipart);
}

/** R2에서 읽어 온 기준 그림. 키만 넘기면 존재 여부를 알 수 없어 바이트로 넘긴다. */
export interface ReferenceImage {
  name: string;
  bytes: ArrayBuffer;
  contentType: string;
}

export const workersAiProvider: ImageProvider = {
  id: 'workers-ai',
  available: (env) => Boolean(env.AI),
  async generate(env, req) {
    if (!env.AI) return { error: 'ai_binding_missing' };
    let input: Record<string, unknown>;
    if (usesMultipart(req.model)) {
      // flux-2 계열은 FormData를 직렬화해 넘긴다 (docs의 공식 호출 형태).
      const form = new FormData();
      form.append('prompt', req.plan.prompt);
      for (const [k, v] of Object.entries(req.params)) form.append(k, String(v));
      if (req.seed !== undefined) form.append('seed', String(req.seed));
      (req.references ?? []).slice(0, MAX_REFERENCE_IMAGES).forEach((r, i) => {
        form.append(referenceField(i), new Blob([r.bytes], { type: r.contentType }), `${r.name}-${i}`);
      });
      const formResponse = new Response(form);
      input = {
        multipart: {
          body: formResponse.body,
          contentType: formResponse.headers.get('content-type') ?? 'multipart/form-data',
        },
      };
    } else {
      input = { prompt: req.plan.prompt, ...req.params };
      if (req.seed !== undefined) input.seed = req.seed;
    }
    try {
      const out = await env.AI.run(req.model, input);
      const bytes = await coerceImageBytes(out);
      if (!bytes) return { error: 'unexpected_model_output' };
      return {
        providerId: 'workers-ai', model: req.model, params: req.params,
        seed: req.seed ?? null, bytes, contentType: 'image/png',
        createdAt: Date.now(), note: 'trial only — not a production path',
      };
    } catch (e) { return { error: `ai_run_failed: ${String(e).slice(0, 160)}` }; }
  },
};

/** 모델마다 반환 형태가 다르다 — bytes/base64/stream 중 무엇이 와도 받아낸다. */
async function coerceImageBytes(out: unknown): Promise<ArrayBuffer | null> {
  if (!out) return null;
  if (out instanceof ArrayBuffer) return out;
  if (out instanceof ReadableStream) return await new Response(out).arrayBuffer();
  const o = out as { image?: unknown; images?: unknown[] };
  const first = o.image ?? (Array.isArray(o.images) ? o.images[0] : null);
  if (typeof first === 'string') {
    const bin = atob(first);
    const buf = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
    return buf.buffer;
  }
  if (first instanceof ArrayBuffer) return first;
  return null;
}

/* ═══ 후보 2 — 외부 API (미구현 자리) ════════════════════════════
   Workers AI가 스타일 유지에 실패하면 B를 비교한다. 인터페이스만 열어 둔다. */

export const externalApiProvider: ImageProvider = {
  id: 'external-api',
  available: (env) => Boolean(env.IMAGE_API_KEY),
  async generate() { return { error: 'not_implemented — B는 A 판정 이후에 비교한다' }; },
};

/* ═══ 후보 3 — manual ════════════════════════════════════════════
   만리서재 기준 컷과 같은 경로: 스펙은 코드가 만들고 촬영은 사람이 한다.
   프롬프트만 돌려주므로 바인딩 없이도 항상 동작한다 — 파일럿의 기본 폴백. */

export const manualProvider: ImageProvider = {
  id: 'manual',
  available: () => true,
  async generate(_env, req) {
    return {
      providerId: 'manual', model: 'manual', params: req.params, seed: req.seed ?? null,
      bytes: null, contentType: 'text/plain', createdAt: Date.now(),
      note: '외부 도구로 생성할 프롬프트만 반환한다 (이미지 없음)',
    };
  },
};

export const PROVIDERS: Record<ImageProviderId, ImageProvider> = {
  'workers-ai': workersAiProvider,
  'external-api': externalApiProvider,
  manual: manualProvider,
};

export function selectProvider(id: ImageProviderId, env: ImageProviderEnv): ImageProvider {
  const p = PROVIDERS[id];
  if (!p || !p.available(env)) return manualProvider;   // 없으면 조용히 죽지 말고 manual로
  return p;
}

/** 시험 산출물 키 — 운영 경로와 섞이지 않는다. */
export function trialKey(trialId: string, model: string, n: number): string {
  const safe = model.replace(/[^a-z0-9._-]/gi, '_');
  return `${TRIAL_R2_PREFIX}${trialId}/${safe}-${n}.png`;
}
