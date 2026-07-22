// BUILD 434-COMIC — POST /api/ops/comic-scenario (Ops 호스트 전용 · Access 뒤)
//
// 주제 → 별이 게놈 → ComicScenario(계약 검증 통과본)까지. 그림은 여기서 만들지 않는다 —
// 시나리오 승인이 이미지 비용 앞의 사람 게이트다 (홈즈 설계).
//
// ⛔ 자동 게시·크론 연결 없음. 시나리오는 comic_scenario_log(KV)에 최근 20건 보관.

import { validateScenario, type ComicScenario } from '../_comic.ts';
import { generateScenarioText, extractJson, type ComicLlmEnv } from '../_comic-llm.ts';
import { validateScenarioV2, COMIC_SCENARIO_V2_VERSION, MAX_CAST, type ComicScenarioV2, type ComicPanelV2 } from '../_comic-v2.ts';
import { buildScenarioSystemV2, castMembersFor } from '../_genome-mirrors.ts';

interface Env extends ComicLlmEnv {
  PLANET: KVNamespace;
}

const LOG_KEY = 'comic_scenario_log';
const LOG_KEEP = 20;
const JSON_HEADERS = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' };
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });

/* ── S-04 7단: v2 경로 — 서버가 cast·relation을 소유하고 LLM은 panels만 쓴다 (429 계승) ── */
async function scenarioV2(env: Env, theme: string, panelCount: number, castIds: string[]): Promise<Response> {
  if (castIds.length > MAX_CAST) return json(400, { ok: false, error: `cast max ${MAX_CAST}` });
  const built = buildScenarioSystemV2(castIds);
  if ('error' in built) return json(400, { ok: false, error: built.error });
  const members = castMembersFor(castIds);
  if (members.errors.length) return json(400, { ok: false, error: members.errors.join(' / ') });

  const user = `상황: ${theme}\npanelCount: ${panelCount}\n출연: ${castIds.join(', ')}\n이 상황으로 ${panelCount}컷 시나리오의 panels·endingBeat만 JSON으로.`;
  const out = await generateScenarioText(env, theme, panelCount, { system: built.system, user });
  if ('error' in out) return json(502, { ok: false, error: out.error, provider: out.provider });
  const parsed = extractJson(out.text) as { panels?: ComicPanelV2[]; endingBeat?: string } | null;
  if (!parsed) return json(502, { ok: false, error: 'scenario_not_json', raw: out.text.slice(0, 400) });

  const scenario2: ComicScenarioV2 = {
    version: COMIC_SCENARIO_V2_VERSION,
    topic: theme,
    panelCount,
    cast: members.cast,
    relation: built.relation ? { relationId: built.relation.relationId, version: built.relation.version } : null,
    panels: parsed.panels ?? [],
    endingBeat: parsed.endingBeat ?? '',
  };
  const errs = validateScenarioV2(scenario2);
  if (errs.length) return json(422, { ok: false, error: 'scenario_invalid', detail: errs, scenario2 });

  try {
    const raw = await env.PLANET.get(LOG_KEY);
    const log: unknown[] = raw ? JSON.parse(raw) : [];
    await env.PLANET.put(LOG_KEY, JSON.stringify([
      { at: Date.now(), provider: out.provider, model: out.model, scenario2 },
      ...log,
    ].slice(0, LOG_KEEP)));
  } catch { /* 로그 실패가 시나리오를 막지 않는다 */ }
  return json(200, { ok: true, provider: out.provider, model: out.model, scenario2 });
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  let body: { theme?: string; panelCount?: number; cast?: string[] };
  try { body = (await request.json()) as typeof body; } catch { return json(400, { ok: false, error: 'bad_json' }); }
  const theme = (body.theme ?? '').trim().slice(0, 200);
  if (!theme) return json(400, { ok: false, error: 'theme_required: 오늘 겪을 일 한 줄' });
  const panelCount = Number(body.panelCount ?? 4);
  if (!Number.isInteger(panelCount) || panelCount < 1 || panelCount > 12) {
    return json(400, { ok: false, error: 'panelCount must be 1~12' });
  }

  // cast 미지정 또는 Byeoli 단독 → 기존 v1 경로 그대로 (무회귀)
  const castIds = Array.isArray(body.cast) ? body.cast.filter((c) => typeof c === 'string') : [];
  if (castIds.length && !(castIds.length === 1 && castIds[0] === 'byeoli')) {
    return scenarioV2(env, theme, panelCount, castIds);
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
