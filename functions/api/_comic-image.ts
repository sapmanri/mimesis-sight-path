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
  COMIC_IMAGE_PROVIDER?: string;   // 'gpt'(기본) | 'workers-ai'
  COMIC_IMAGE_MODEL?: string;      // 기본 gpt-image-1
  COMIC_IMAGE_QUALITY?: string;    // low | medium(기본) | high
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

/** 컷 한 장 생성 — provider는 env가 정한다. 기본 gpt (Vase 판정). */
export async function generatePanelImage(
  env: ComicImageEnv, prompt: string, refs: RefBytes[],
): Promise<{ bytes: ArrayBuffer; model: string; provider: string } | { error: string; provider: string }> {
  const provider = (env.COMIC_IMAGE_PROVIDER || 'gpt').toLowerCase();
  const out = provider === 'workers-ai'
    ? await viaWorkersAi(env, prompt, refs)
    : await viaGptImage(env, prompt, refs);
  return 'error' in out ? { ...out, provider } : { ...out, provider };
}
