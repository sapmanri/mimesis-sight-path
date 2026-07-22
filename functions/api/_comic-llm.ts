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
  COMIC_TEXT_PROVIDER?: string;   // 'gpt'(기본) | 'claude'
  COMIC_TEXT_MODEL?: string;      // 모델 핀 교체용 (기본: 아래 상수)
}

const GPT_MODEL_DEFAULT = 'gpt-5';
const CLAUDE_MODEL_DEFAULT = 'claude-sonnet-5';

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

/** 두뇌 호출 — provider는 env로 정해진다. 기본 gpt (Vase 판정). */
export async function generateScenarioText(
  env: ComicLlmEnv, theme: string, panelCount: number,
): Promise<{ text: string; model: string; provider: string } | { error: string; provider: string }> {
  const provider = (env.COMIC_TEXT_PROVIDER || 'gpt').toLowerCase();
  const out = provider === 'claude'
    ? await viaClaude(env, theme, panelCount)
    : await viaGpt(env, theme, panelCount);
  return 'error' in out ? { ...out, provider } : { ...out, provider };
}

/** LLM 출력에서 JSON 본문만 — 코드펜스·서론이 섞여도 계약 검증까지는 간다. */
export function extractJson(text: string): unknown | null {
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try { return JSON.parse(m[0]); } catch { return null; }
}
