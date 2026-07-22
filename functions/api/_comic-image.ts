// BUILD 434-COMIC — 그림 어댑터
//
// Vase 판정: 기본 gpt(gpt-image), flux(Workers AI)는 어댑터 뒤 대기.
// COMIC_IMAGE_PROVIDER=workers-ai 로 배포 없이 전환. 품질은 COMIC_IMAGE_QUALITY
// (low|medium|high, 기본 medium — 장당 대략 $0.01/$0.04/$0.17).
//
// 계약: (env, prompt, refs[]) → PNG bytes | error. 참조 상한은 어댑터가 안다
// (gpt 5장 전부 / flux 4장) — 선택 규칙은 _comic.pickStyleRefs가 이미 결정론으로 준다.

export interface ComicImageEnv {
  OPENAI_API_KEY?: string;
  GEMINI_API_KEY?: string;
  GEMINIAPIKEY?: string;
  COMIC_IMAGE_PROVIDER?: string;   // 'gemini'(기본, Vase 판정 07-22) | 'gpt' | 'workers-ai'
  COMIC_IMAGE_MODEL?: string;
  COMIC_IMAGE_QUALITY?: string;    // gpt 전용: low | medium(기본) | high
  COMIC_PAGE_RATIO?: string;       // gemini 페이지 비율 핀 (기본: 컷 수에서 파생)
  AI?: { run: (model: string, input: unknown) => Promise<unknown> };
}

export interface RefBytes { name: string; bytes: ArrayBuffer; contentType: string }

export function refCapFor(provider: string): number {
  return provider === 'workers-ai' ? 4 : 5;
}

function b64ToBytes(b64: string): ArrayBuffer {
  const bin = atob(b64);
  const buf = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
  return buf.buffer;
}

async function viaGptImage(env: ComicImageEnv, prompt: string, refs: RefBytes[]):
  Promise<{ bytes: ArrayBuffer; model: string } | { error: string }> {
  if (!env.OPENAI_API_KEY) return { error: 'openai_key_missing' };
  const model = env.COMIC_IMAGE_MODEL || 'gpt-image-1';
  const quality = env.COMIC_IMAGE_QUALITY || 'medium';
  try {
    // 참조가 있으면 edits(참조 조건화), 없으면 generations
    const form = new FormData();
    form.append('model', model);
    form.append('prompt', prompt);
    form.append('size', '1024x1024');
    form.append('quality', quality);
    let endpoint = 'https://api.openai.com/v1/images/generations';
    let body: BodyInit;
    let headers: Record<string, string> = { authorization: `Bearer ${env.OPENAI_API_KEY}` };
    if (refs.length) {
      endpoint = 'https://api.openai.com/v1/images/edits';
      for (const r of refs) form.append('image[]', new Blob([r.bytes], { type: r.contentType }), r.name);
      body = form;
    } else {
      headers['content-type'] = 'application/json';
      body = JSON.stringify({ model, prompt, size: '1024x1024', quality });
    }
    const res = await fetch(endpoint, { method: 'POST', headers, body: refs.length ? form : body! });
    if (!res.ok) return { error: `gptimg_http_${res.status}: ${(await res.text()).slice(0, 200)}` };
    const data = (await res.json()) as { data?: { b64_json?: string }[] };
    const b64 = data.data?.[0]?.b64_json;
    if (!b64) return { error: 'gptimg_empty' };
    return { bytes: b64ToBytes(b64), model };
  } catch (e) { return { error: `gptimg_network: ${String(e).slice(0, 120)}` }; }
}

async function viaWorkersAi(env: ComicImageEnv, prompt: string, refs: RefBytes[]):
  Promise<{ bytes: ArrayBuffer; model: string } | { error: string }> {
  if (!env.AI) return { error: 'ai_binding_missing' };
  const model = env.COMIC_IMAGE_MODEL || '@cf/black-forest-labs/flux-2-dev';
  try {
    const form = new FormData();
    form.append('prompt', prompt);
    form.append('steps', '12');
    form.append('width', '1024');
    form.append('height', '1024');
    refs.slice(0, 4).forEach((r, i) =>
      form.append(`input_image_${i}`, new Blob([r.bytes], { type: r.contentType }), r.name));
    const formResponse = new Response(form);
    const out = await env.AI.run(model, {
      multipart: {
        body: formResponse.body,
        contentType: formResponse.headers.get('content-type') ?? 'multipart/form-data',
      },
    });
    if (out instanceof ArrayBuffer) return { bytes: out, model };
    if (out instanceof ReadableStream) return { bytes: await new Response(out).arrayBuffer(), model };
    const o = out as { image?: string };
    if (typeof o?.image === 'string') return { bytes: b64ToBytes(o.image), model };
    return { error: 'flux_unexpected_output' };
  } catch (e) { return { error: `flux_failed: ${String(e).slice(0, 120)}` }; }
}

function bytesToB64(buf: ArrayBuffer): string {
  const u = new Uint8Array(buf);
  let s = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < u.length; i += CHUNK) s += String.fromCharCode(...u.subarray(i, i + CHUNK));
  return btoa(s);
}

// 모델 은퇴 내성 — 404면 다음 후보 (env COMIC_IMAGE_MODEL이 있으면 그것만)
// 한글 텍스트 품질 우선 — 나노바나나 프로(3-pro-image)가 한글 렌더링을 사실상 해결 (실측 80~90%)
const GEMINI_IMAGE_CANDIDATES = ['gemini-3-pro-image-preview', 'gemini-2.5-flash-image', 'gemini-2.0-flash-preview-image-generation'];

async function viaGeminiImage(env: ComicImageEnv, prompt: string, refs: RefBytes[], ratio: string):
  Promise<{ bytes: ArrayBuffer; model: string } | { error: string }> {
  const key = env.GEMINI_API_KEY || env.GEMINIAPIKEY;
  if (!key) return { error: 'gemini_key_missing: GEMINI_API_KEY(또는 GEMINIAPIKEY) 시크릿 필요' };
  const candidates = env.COMIC_IMAGE_MODEL ? [env.COMIC_IMAGE_MODEL] : GEMINI_IMAGE_CANDIDATES;
  let lastErr = 'gemini_no_candidates';
  for (const model of candidates) {
    const out = await geminiImageOnce(key, model, prompt, refs, ratio);
    if (!('error' in out)) return out;
    lastErr = out.error;
    if (!out.error.includes('_404')) break;
  }
  return { error: lastErr };
}

async function geminiImageOnce(key: string, model: string, prompt: string, refs: RefBytes[], ratio: string):
  Promise<{ bytes: ArrayBuffer; model: string } | { error: string }> {
  try {
    const parts: unknown[] = [{ text: prompt }];
    for (const r of refs) parts.push({ inlineData: { mimeType: r.contentType, data: bytesToB64(r.bytes) } });
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
        body: JSON.stringify({
          contents: [{ parts }],
          generationConfig: { responseModalities: ['IMAGE'], imageConfig: { aspectRatio: ratio } },
        }),
      },
    );
    if (!res.ok) return { error: `geminiimg_http_${res.status}: ${(await res.text()).slice(0, 200)}` };
    const data = (await res.json()) as {
      candidates?: { content?: { parts?: { inlineData?: { data?: string } }[] } }[];
    };
    const b64 = (data.candidates?.[0]?.content?.parts ?? []).find((p) => p.inlineData?.data)?.inlineData?.data;
    if (!b64) return { error: 'geminiimg_empty' };
    return { bytes: b64ToBytes(b64), model };
  } catch (e) { return { error: `geminiimg_network: ${String(e).slice(0, 120)}` }; }
}

/** 컷 한 장 생성 — provider는 env가 정한다. 기본 gemini (Vase 판정 07-22). */
export async function generatePanelImage(
  env: ComicImageEnv, prompt: string, refs: RefBytes[],
): Promise<{ bytes: ArrayBuffer; model: string; provider: string } | { error: string; provider: string }> {
  const provider = (env.COMIC_IMAGE_PROVIDER || 'gemini').toLowerCase();
  const out = provider === 'workers-ai' ? await viaWorkersAi(env, prompt, refs)
    : provider === 'gpt' ? await viaGptImage(env, prompt, refs)
    : await viaGeminiImage(env, prompt, refs, '1:1');
  return 'error' in out ? { ...out, provider } : { ...out, provider };
}

/** 페이지 비율 — 컷 수에서 파생 (COMIC_PAGE_RATIO로 핀 가능). */
export function pageRatioFor(env: ComicImageEnv, panelCount: number): string {
  if (env.COMIC_PAGE_RATIO) return env.COMIC_PAGE_RATIO;
  return panelCount === 8 ? '16:9' : '3:4';
}

/** 원샷 페이지 생성 — 제미나이 전용 (다른 provider는 컷별 모드로 폴백해야 한다). */
export async function generatePageImage(
  env: ComicImageEnv, prompt: string, refs: RefBytes[], panelCount: number,
): Promise<{ bytes: ArrayBuffer; model: string; provider: string } | { error: string; provider: string }> {
  const provider = (env.COMIC_IMAGE_PROVIDER || 'gemini').toLowerCase();
  if (provider !== 'gemini') return { error: 'page_mode_gemini_only', provider };
  const out = await viaGeminiImage(env, prompt, refs, pageRatioFor(env, panelCount));
  return 'error' in out ? { ...out, provider } : { ...out, provider };
}
