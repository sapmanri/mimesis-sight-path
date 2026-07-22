// BUILD 434-COMIC — 시나리오 두뇌 어댑터
//
// Vase 판정(2026-07-22 자정): "일단 두뇌도 어댑터도 지피티로. 차후 교체 고려."
// → 기본 provider = gpt. claude 구현을 같이 두어 env 하나로 교체 가능하게 한다.
//    (COMIC_TEXT_PROVIDER=claude 로 전환 — 코드 배포 없이)
//
// 어댑터 계약: (env, theme, panelCount) → 원문 텍스트(JSON 문자열 기대).
// 파싱·검증은 호출자(comic-scenario)가 계약(_comic.validateScenario)으로 한다 —
// 두뇌가 바뀌어도 검증은 같아야 하므로 어댑터 밖에 둔다.

import { SCENARIO_SYSTEM } from './_comic.ts';

export interface ComicLlmEnv {
  OPENAI_API_KEY?: string;
  ANTHROPIC_API_KEY?: string;
  GEMINI_API_KEY?: string;
  GEMINIAPIKEY?: string;          // 시크릿 이름을 언더바 없이 만든 경우 폴백 (2026-07-22)
  COMIC_TEXT_PROVIDER?: string;   // 'gemini'(기본, Vase 판정 07-22) | 'gpt' | 'claude'
  COMIC_TEXT_MODEL?: string;      // 모델 핀 교체용 (기본: 아래 상수)
}

const GPT_MODEL_DEFAULT = 'gpt-5';
const CLAUDE_MODEL_DEFAULT = 'claude-sonnet-5';
// 모델 은퇴 내성(실사고 07-22: gemini-2.5-pro가 신규 사용자에게 404):
// 별칭 우선 + 404면 다음 후보. env COMIC_TEXT_MODEL이 있으면 그것만 쓴다.
const GEMINI_TEXT_CANDIDATES = ['gemini-flash-latest', 'gemini-2.5-flash', 'gemini-3-flash-preview'];

/** 시크릿 이름 관용 — GEMINI_API_KEY 또는 GEMINIAPIKEY 어느 쪽이든 읽는다. */
export function geminiKeyOf(env: { GEMINI_API_KEY?: string; GEMINIAPIKEY?: string }): string | null {
  return env.GEMINI_API_KEY || env.GEMINIAPIKEY || null;
}

export function userPrompt(theme: string, panelCount: number): string {
  return `주제: ${theme}\npanelCount: ${panelCount}\n이 주제로 별이의 ${panelCount}컷 그림일기 시나리오를 JSON으로.`;
}

async function viaGpt(env: ComicLlmEnv, theme: string, panelCount: number):
  Promise<{ text: string; model: string } | { error: string }> {
  if (!env.OPENAI_API_KEY) return { error: 'openai_key_missing: OPENAI_API_KEY를 wrangler secret으로 심어야 한다' };
  const model = env.COMIC_TEXT_MODEL || GPT_MODEL_DEFAULT;
  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: SCENARIO_SYSTEM },
          { role: 'user', content: userPrompt(theme, panelCount) },
        ],
        response_format: { type: 'json_object' },
      }),
    });
    if (!res.ok) return { error: `gpt_http_${res.status}: ${(await res.text()).slice(0, 200)}` };
    const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const text = data.choices?.[0]?.message?.content ?? '';
    if (!text) return { error: 'gpt_empty_output' };
    return { text, model };
  } catch (e) { return { error: `gpt_network: ${String(e).slice(0, 120)}` }; }
}

async function viaClaude(env: ComicLlmEnv, theme: string, panelCount: number):
  Promise<{ text: string; model: string } | { error: string }> {
  if (!env.ANTHROPIC_API_KEY) return { error: 'anthropic_key_missing' };
  const model = env.COMIC_TEXT_MODEL || CLAUDE_MODEL_DEFAULT;
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model, max_tokens: 3000,
        system: SCENARIO_SYSTEM,
        messages: [{ role: 'user', content: userPrompt(theme, panelCount) }],
      }),
    });
    if (!res.ok) return { error: `claude_http_${res.status}` };
    const data = (await res.json()) as { content?: { type: string; text?: string }[] };
    const text = data.content?.find((c) => c.type === 'text')?.text ?? '';
    if (!text) return { error: 'claude_empty_output' };
    return { text, model };
  } catch (e) { return { error: `claude_network: ${String(e).slice(0, 120)}` }; }
}

async function viaGemini(env: ComicLlmEnv, theme: string, panelCount: number):
  Promise<{ text: string; model: string } | { error: string }> {
  const key = geminiKeyOf(env);
  if (!key) return { error: 'gemini_key_missing: GEMINI_API_KEY(또는 GEMINIAPIKEY) 시크릿 필요' };
  const candidates = env.COMIC_TEXT_MODEL ? [env.COMIC_TEXT_MODEL] : GEMINI_TEXT_CANDIDATES;
  let lastErr = 'gemini_no_candidates';
  for (const model of candidates) {
    const out = await geminiTextOnce(key, model, theme, panelCount);
    if (!('error' in out)) return out;
    lastErr = out.error;
    if (!out.error.includes('_404')) break;   // 404(모델 은퇴)만 다음 후보로, 다른 오류는 즉시 보고
  }
  return { error: lastErr };
}

async function geminiTextOnce(key: string, model: string, theme: string, panelCount: number):
  Promise<{ text: string; model: string } | { error: string }> {
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: SCENARIO_SYSTEM }] },
          contents: [{ parts: [{ text: userPrompt(theme, panelCount) }] }],
          generationConfig: { responseMimeType: 'application/json' },
        }),
      },
    );
    if (!res.ok) return { error: `gemini_http_${res.status}: ${(await res.text()).slice(0, 200)}` };
    const data = (await res.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
    const text = (data.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? '').join('');
    if (!text) return { error: 'gemini_empty_output' };
    return { text, model };
  } catch (e) { return { error: `gemini_network: ${String(e).slice(0, 120)}` }; }
}

/** 두뇌 호출 — provider는 env로 정해진다. 기본 gemini (Vase 판정 07-22: "전부 제미나이로"). */
export async function generateScenarioText(
  env: ComicLlmEnv, theme: string, panelCount: number,
): Promise<{ text: string; model: string; provider: string } | { error: string; provider: string }> {
  const provider = (env.COMIC_TEXT_PROVIDER || 'gemini').toLowerCase();
  const out = provider === 'claude' ? await viaClaude(env, theme, panelCount)
    : provider === 'gpt' ? await viaGpt(env, theme, panelCount)
    : await viaGemini(env, theme, panelCount);
  return 'error' in out ? { ...out, provider } : { ...out, provider };
}

/** LLM 출력에서 JSON 본문만 — 코드펜스·서론이 섞여도 계약 검증까지는 간다. */
export function extractJson(text: string): unknown | null {
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try { return JSON.parse(m[0]); } catch { return null; }
}
