// S-04B — POST /api/ops/comic-dialogue (Ops 호스트 전용 · Access 뒤)
//
// 대화 원문 → Dialogue Adapter → Genome-aware ComicScenario v2.
// 두 흐름(주제/대화)은 ComicScenario v2에서 합류한다 — 그리기는 기존 경로 그대로.
//
// 원문은 별도 불변 자산으로 저장한다 (comic/dialogue-sources/<hash>.txt).
// 원문과 결과를 한 필드에 섞지 않는다.

import { generateScenarioText, extractJson, type ComicLlmEnv } from '../_comic-llm.ts';
import { validateScenarioV2, COMIC_SCENARIO_V2_VERSION, MAX_CAST, type ComicScenarioV2, type ComicPanelV2 } from '../_comic-v2.ts';
import { buildScenarioSystemV2, castMembersFor, validateEmbodimentV2 } from '../_genome-mirrors.ts';
import {
  parseDialogue, validateDialogueInput, validateAdaptation, dialogueHash,
  buildDialogueAdapterPrompt, buildEpisodePrompt, EPISODE_THRESHOLD,
  type DialogueComicInput, type DialogueProvenance,
} from '../_dialogue.ts';
import { withTransientRetry } from '../_retry.ts';

interface Env extends ComicLlmEnv {
  PLANET: KVNamespace;
  CAPTURES: R2Bucket;
}

export const DIALOGUE_SOURCE_PREFIX = 'comic/dialogue-sources/';
const LOG_KEY = 'comic_scenario_log';
const LOG_KEEP = 20;
const JSON_HEADERS = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' };
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  let input: DialogueComicInput;
  try { input = (await request.json()) as DialogueComicInput; } catch { return json(400, { ok: false, error: 'bad_json' }); }
  if (input.mode !== 'dialogue' || typeof input.rawDialogue !== 'string') {
    return json(400, { ok: false, error: 'bad_input: mode=dialogue + rawDialogue 필요' });
  }
  if (!Array.isArray(input.creators) || !input.creators.length || input.creators.length > MAX_CAST) {
    return json(400, { ok: false, error: `creators 1~${MAX_CAST}명` });
  }

  const parsedAll = parseDialogue(input.rawDialogue);
  const inputErrs = validateDialogueInput(input, parsedAll);
  if (inputErrs.length) return json(400, { ok: false, error: 'dialogue_invalid', detail: inputErrs });

  // 에피소드 범위 적용 (Test B — 긴 원문은 한 편으로 만들지 않는다)
  const utterances = input.lineRange
    ? parsedAll.utterances.filter((u) => u.line >= input.lineRange!.start && u.line <= input.lineRange!.end)
    : parsedAll.utterances;

  if (!input.lineRange && utterances.length > EPISODE_THRESHOLD) {
    const ep = buildEpisodePrompt(utterances);
    const out = await generateScenarioText(env, 'episodes', 0, { system: ep.system, user: ep.user });
    if ('error' in out) return json(502, { ok: false, error: out.error, provider: out.provider });
    const parsed = extractJson(out.text) as { episodes?: { title: string; startLine: number; endLine: number; why?: string }[] } | null;
    if (!parsed?.episodes?.length) return json(502, { ok: false, error: 'episodes_not_found', raw: out.text.slice(0, 300) });
    return json(200, { ok: true, mode: 'episodes', episodes: parsed.episodes.slice(0, 4), totalUtterances: utterances.length });
  }

  // 게놈·관계 시스템은 주제 경로와 같은 원천 — Discovery Mode 게이트 포함
  const built = buildScenarioSystemV2(input.creators);
  if ('error' in built) return json(400, { ok: false, error: built.error });
  const members = castMembersFor(input.creators);
  if (members.errors.length) return json(400, { ok: false, error: members.errors.join(' / ') });

  const prompts = buildDialogueAdapterPrompt(built.system, input, utterances);
  const out = await generateScenarioText(env, input.titleHint ?? 'dialogue', 0, prompts);
  if ('error' in out) return json(502, { ok: false, error: out.error, provider: out.provider });
  const parsed = extractJson(out.text) as {
    topic?: string; panels?: ComicPanelV2[]; endingBeat?: string;
    provenance?: Partial<DialogueProvenance>;
  } | null;
  if (!parsed?.panels?.length) return json(502, { ok: false, error: 'scenario_not_json', raw: out.text.slice(0, 400) });

  const sourceHash = dialogueHash(input.rawDialogue);
  const provenance: DialogueProvenance = {
    sourceType: 'dialogue',
    sourceHash,
    preservationMode: input.preservationMode,
    sourceRanges: (parsed.provenance?.sourceRanges ?? []).filter((r) => r && Number.isInteger(r.panelNo)),
    preservedLines: (parsed.provenance?.preservedLines ?? []).map(String),
    omittedLines: (parsed.provenance?.omittedLines ?? []).map(String),
    reconstructedLines: (parsed.provenance?.reconstructedLines ?? [])
      .filter((r) => r && r.output).map((r) => ({ output: String(r.output), basis: (r.basis ?? []).map(String) })),
  };

  const warnings: string[] = [];
  const scenario2: ComicScenarioV2 = {
    version: COMIC_SCENARIO_V2_VERSION,
    topic: (parsed.topic ?? input.titleHint ?? '대화 각색').slice(0, 60),
    panelCount: parsed.panels.length,
    cast: members.cast,
    relation: built.relation ? { relationId: built.relation.relationId, version: built.relation.version } : null,
    relations: built.relations.length > 1 ? built.relations.map((r) => ({ relationId: r.relationId, version: r.version })) : undefined,
    relationDiscovery: built.discovery.length ? built.discovery : undefined,
    provenance,
    panels: parsed.panels,
    endingBeat: parsed.endingBeat ?? '',
  };
  if (typeof input.requestedPanelCount === 'number' && input.requestedPanelCount !== scenario2.panelCount) {
    warnings.push(`panel_count_adjusted: 요청 ${input.requestedPanelCount} → ${scenario2.panelCount}`);
  }

  const adaptation = validateAdaptation(scenario2, provenance, utterances, input);
  const errs = [...validateScenarioV2(scenario2), ...validateEmbodimentV2(scenario2), ...adaptation.errors];
  if (errs.length) return json(422, { ok: false, error: 'scenario_invalid', detail: errs, scenario2 });
  warnings.push(...adaptation.warnings, ...parsedAll.warnings);

  // 원문 불변 보관 — 같은 해시는 다시 쓰지 않는다 (원본은 수정되지 않으므로 멱등)
  const srcKey = `${DIALOGUE_SOURCE_PREFIX}${sourceHash}.txt`;
  const exists = await withTransientRetry('dlg_src_head', () => env.CAPTURES.head(srcKey));
  if (!exists) {
    await withTransientRetry('dlg_src_put', () =>
      env.CAPTURES.put(srcKey, input.rawDialogue, { httpMetadata: { contentType: 'text/plain; charset=utf-8' } }));
  }

  try {
    const raw = await env.PLANET.get(LOG_KEY);
    const log: unknown[] = raw ? JSON.parse(raw) : [];
    await env.PLANET.put(LOG_KEY, JSON.stringify([
      { at: Date.now(), provider: out.provider, model: out.model, scenario2, sourceKey: srcKey },
      ...log,
    ].slice(0, LOG_KEEP)));
  } catch { /* 로그 실패가 시나리오를 막지 않는다 */ }

  return json(200, {
    ok: true, provider: out.provider, model: out.model, scenario2, warnings,
    sourceHash, sourceKey: srcKey, sourceUtterances: utterances.length,
  });
};
