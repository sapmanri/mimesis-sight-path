// BUILD 434-COMIC — POST /api/ops/comic-scenario (Ops 호스트 전용 · Access 뒤)
//
// 주제 → 별이 게놈 → ComicScenario(계약 검증 통과본)까지. 그림은 여기서 만들지 않는다 —
// 시나리오 승인이 이미지 비용 앞의 사람 게이트다 (홈즈 설계).
//
// ⛔ 자동 게시·크론 연결 없음. 시나리오는 comic_scenario_log(KV)에 최근 20건 보관.

import { validateScenario, type ComicScenario } from '../_comic.ts';
import { generateScenarioText, extractJson, type ComicLlmEnv } from '../_comic-llm.ts';

interface Env extends ComicLlmEnv {
  PLANET: KVNamespace;
}

const LOG_KEY = 'comic_scenario_log';
const LOG_KEEP = 20;
const JSON_HEADERS = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' };
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  let body: { theme?: string; panelCount?: number };
  try { body = (await request.json()) as typeof body; } catch { return json(400, { ok: false, error: 'bad_json' }); }
  const theme = (body.theme ?? '').trim().slice(0, 200);
  if (!theme) return json(400, { ok: false, error: 'theme_required: 오늘 별이가 겪을 일 한 줄' });
  const panelCount = Number(body.panelCount ?? 4);
  if (!Number.isInteger(panelCount) || panelCount < 1 || panelCount > 12) {
    return json(400, { ok: false, error: 'panelCount must be 1~12' });
  }

  const out = await generateScenarioText(env, theme, panelCount);
  if ('error' in out) return json(502, { ok: false, error: out.error, provider: out.provider });

  const parsed = extractJson(out.text);
  if (!parsed) return json(502, { ok: false, error: 'scenario_not_json', raw: out.text.slice(0, 400) });
  const scenario = { ...(parsed as ComicScenario), theme, panelCount };
  const errs = validateScenario(scenario);
  if (errs.length) {
    // 계약 미달은 사람에게 보여주고 재생성하게 한다 — 미달본으로 그리지 않는다
    return json(422, { ok: false, error: 'scenario_invalid', detail: errs, scenario });
  }

  try {
    const raw = await env.PLANET.get(LOG_KEY);
    const log: unknown[] = raw ? JSON.parse(raw) : [];
    await env.PLANET.put(LOG_KEY, JSON.stringify([
      { at: Date.now(), provider: out.provider, model: out.model, scenario },
      ...log,
    ].slice(0, LOG_KEEP)));
  } catch { /* 로그 실패가 시나리오를 막지 않는다 */ }

  return json(200, { ok: true, provider: out.provider, model: out.model, scenario });
};
