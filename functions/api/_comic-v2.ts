// S-04 — ComicScenario Contract v2 (홈즈 설계, 2026-07-22 QC 판정 5)
//
// v1은 별이 단독 계약으로 보존한다. v2는 가산 — 복수 Creator·speaker·relation.
// 핵심 규칙 (홈즈 원문):
//   - ppaekong을 특수 필드로 두지 않는다. 등장하면 cast의 일반 캐릭터가 된다.
//   - 패널마다 누가 등장하고 누가 말하는지 명시한다. 선택되지 않은 Creator는 출연 금지.
//   - 두 Creator가 선택됐다고 매 컷 둘 다 등장할 필요는 없다.
//   - 각자의 대사는 각자의 Genome Adapter가 만든다.
//     Relation은 대사를 대신 쓰지 않는다 — 충돌과 전환 순서만 제공한다.
//   - 단독 Creator라면 relation은 null이다.

import type { ComicScenario } from './_comic.ts';

export const COMIC_SCENARIO_V2_VERSION = 'comic-scenario-v2';
export const MAX_CAST = 3;                    // 초기 최대 3명 (홈즈 판정)

export interface ComicCastMember {
  creatorId: string;
  role: 'lead' | 'support' | 'cameo';
  genomeContextVersion: string;
  identityLockId?: string;
  speechPolicy?: { allowed: boolean; density?: 'silent' | 'low' | 'medium' | 'high' };
}

export interface ComicPanelActionV2 { creatorId: string; action: string; expressionOrState?: string }
export interface ComicPanelDialogueV2 { speakerId: string; intent: string; text?: string }

export interface ComicPanelV2 {
  panelNo: number;
  beat: string;
  setting: string;
  framing: string;
  actions: ComicPanelActionV2[];
  dialogue: ComicPanelDialogueV2[];
  caption?: string | null;
}

export interface ComicScenarioV2 {
  version: typeof COMIC_SCENARIO_V2_VERSION;
  topic: string;
  panelCount: number;
  cast: ComicCastMember[];
  relation?: { relationId: string; version: string } | null;
  panels: ComicPanelV2[];
  endingBeat: string;
}

const ROLES = ['lead', 'support', 'cameo'] as const;
const DENSITIES = ['silent', 'low', 'medium', 'high'] as const;

/** v2 계약 검증 — LLM 출력이든 번역 결과든, 이 문을 통과해야만 다음 단계로 간다. */
export function validateScenarioV2(x: unknown): string[] {
  const errs: string[] = [];
  if (typeof x !== 'object' || x === null) return ['not an object'];
  const s = x as Partial<ComicScenarioV2>;
  if (s.version !== COMIC_SCENARIO_V2_VERSION) errs.push(`version must be "${COMIC_SCENARIO_V2_VERSION}"`);
  if (!s.topic || typeof s.topic !== 'string') errs.push('topic required');
  if (!s.endingBeat || typeof s.endingBeat !== 'string') errs.push('endingBeat required');

  if (!Array.isArray(s.cast) || !s.cast.length) return [...errs, 'cast must be a non-empty array'];
  if (s.cast.length > MAX_CAST) errs.push(`cast max ${MAX_CAST}`);
  const castIds = new Set<string>();
  s.cast.forEach((c, i) => {
    const at = `cast[${i}]`;
    if (!c.creatorId) errs.push(`${at}.creatorId required`);
    else if (castIds.has(c.creatorId)) errs.push(`${at}.creatorId duplicated: ${c.creatorId}`);
    else castIds.add(c.creatorId);
    if (!ROLES.includes(c.role as 'lead')) errs.push(`${at}.role must be ${ROLES.join('|')}`);
    if (!c.genomeContextVersion) errs.push(`${at}.genomeContextVersion required`);
    if (c.speechPolicy && c.speechPolicy.density !== undefined
      && !DENSITIES.includes(c.speechPolicy.density)) {
      errs.push(`${at}.speechPolicy.density must be ${DENSITIES.join('|')}`);
    }
  });

  // 단독 Creator면 relation은 null — 관계를 지어내지 않는다
  if (s.cast.length < 2 && s.relation) errs.push('relation must be null for a single creator');
  if (s.relation && (!s.relation.relationId || !s.relation.version)) {
    errs.push('relation requires relationId and version');
  }

  if (!Number.isInteger(s.panelCount) || (s.panelCount as number) < 1 || (s.panelCount as number) > 12) {
    errs.push('panelCount must be integer 1~12');
  }
  if (!Array.isArray(s.panels)) return [...errs, 'panels must be an array'];
  if (s.panels.length !== s.panelCount) errs.push(`panels length ${s.panels.length} != panelCount ${s.panelCount}`);

  const silent = new Set(
    (s.cast ?? []).filter((c) => c.speechPolicy && c.speechPolicy.allowed === false).map((c) => c.creatorId));
  s.panels.forEach((p, i) => {
    const at = `panels[${i}]`;
    if (p.panelNo !== i + 1) errs.push(`${at}.panelNo must be ${i + 1}`);
    for (const f of ['beat', 'setting', 'framing'] as const) {
      if (!p[f]) errs.push(`${at}.${f} required`);
    }
    if (!Array.isArray(p.actions) || !p.actions.length) errs.push(`${at}.actions must be non-empty`);
    (p.actions ?? []).forEach((a, j) => {
      if (!castIds.has(a.creatorId)) errs.push(`${at}.actions[${j}]: 미출연 Creator "${a.creatorId}" — 선택되지 않은 Creator는 출연시키지 않는다`);
      if (!a.action) errs.push(`${at}.actions[${j}].action required`);
    });
    (p.dialogue ?? []).forEach((d, j) => {
      if (!castIds.has(d.speakerId)) errs.push(`${at}.dialogue[${j}]: 미출연 화자 "${d.speakerId}"`);
      else if (silent.has(d.speakerId)) errs.push(`${at}.dialogue[${j}]: "${d.speakerId}"는 speechPolicy.allowed=false — 말할 수 없다`);
      if (!d.intent) errs.push(`${at}.dialogue[${j}].intent required`);
    });
  });
  return errs;
}

/**
 * v1 → v2 번역 — 기존 별이 경로를 지우지 않고 같은 언어로 옮긴다.
 * cast: Byeoli(lead) + 필요 시 Ppaekong(support, 말 없음).
 */
export function toV2(v1: ComicScenario): ComicScenarioV2 {
  const hasPpaekong = v1.panels.some((p) => p.ppaekong);
  const cast: ComicCastMember[] = [
    {
      creatorId: 'byeoli', role: 'lead', genomeContextVersion: 'v1-legacy',
      speechPolicy: { allowed: true, density: 'low' },   // "별이는 말이 적다" — v1 검증 규칙의 번역
    },
  ];
  if (hasPpaekong) {
    cast.push({
      creatorId: 'ppaekong', role: 'support', genomeContextVersion: 'v1-legacy',
      speechPolicy: { allowed: false },                  // 빼콩이는 말보다 마음이 먼저
    });
  }
  return {
    version: COMIC_SCENARIO_V2_VERSION,
    topic: v1.theme,
    panelCount: v1.panelCount,
    cast,
    relation: null,
    panels: v1.panels.map((p) => ({
      panelNo: p.index,
      beat: p.subject,
      setting: p.location,
      framing: p.shot,
      actions: [
        { creatorId: 'byeoli', action: p.action, expressionOrState: p.expression },
        ...(p.ppaekong ? [{ creatorId: 'ppaekong', action: p.ppaekong }] : []),
      ],
      dialogue: p.dialogue ? [{ speakerId: 'byeoli', intent: 'speech', text: p.dialogue }] : [],
      caption: p.caption ?? null,
    })),
    endingBeat: v1.panels[v1.panels.length - 1]?.caption
      ?? v1.panels[v1.panels.length - 1]?.subject ?? v1.epigraph,
  };
}
