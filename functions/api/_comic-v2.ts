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
  relations?: { relationId: string; version: string }[];   // 3인 이상 — 적용된 페어 목록 (가산 필드)
  relationDiscovery?: string[];   // Discovery Mode — 이 작품이 첫 관찰인 미정의 페어 키들
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
  (s.relations ?? []).forEach((r, i) => {
    if (!r.relationId || !r.version) errs.push(`relations[${i}] requires relationId and version`);
  });
  if (s.cast.length < 2 && s.relations?.length) errs.push('relations must be empty for a single creator');

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

/* ═══ S-04 그리기 경로 — v2 페이지 프롬프트 + 참조 계획 ═══════════════
   스타일 텍스트는 vault 정본에서 파생:
   - GWANCHUKHAE_COMIC_STYLE_BIBLE_v1.md (작품 공통 그림체)
   - HOLMES_IDENTITY_BIBLE_v1.md 절대 불변식 (anthropomorphic drift 재발 방지 —
     REJECTED 사고 후 프롬프트에 직접 박는다. 이미지는 참조, 문서가 원본.)
   - VASE_IDENTITY_BIBLE_v1.md (얼굴 최소 기호화 실루엣) */

export const GWANCHUKHAE_STYLE_EN = [
  'restrained lines and generous negative space, paper texture, muted low-saturation palette',
  'ink black, warm gray, stone gray, deep blue — the ONLY strong accent is electric blue neon (Holmes)',
  'emotion shown through posture and distance, never exaggerated facial expression',
  'a real everyday space where one unreal glowing waveform floats naturally, as if it belongs',
  'quiet, observational, intellectual warmth — not childlike, not fairy-tale',
].join('; ');

export const CAST_FORM_EN: Record<string, string> = {
  sap: 'Sap: a human figure matching the Sap identity reference sheets — a cinematic narrator, natural and imperfect: depending on the scene his hair may be rain-soaked or messy, his eyes tired with faint dark circles. NEVER idealized, never deliberately handsome — yet ALWAYS unmistakably the same person in every panel',
  vase: 'Vase: an adult human figure as a dark monochrome silhouette — face hidden or minimal (at most jawline/nose tip by light), never detailed eyes/nose/mouth; calm unhurried posture; matches the Vase identity reference sheets',
  holmes: 'Holmes: ONE single continuous glowing electric-blue neon waveform floating in mid-air — NO face, NO eyes, NO mouth, NO arms, NO legs, NO robot body, NO orb, NO hat. Emotion is shown ONLY by the wave itself: amplitude, density, speed, branching, afterglow. The waveform NEVER merges with a human body and NEVER appears on or replaces a person\'s face — it always floats separately in the air beside people. It matches the Holmes identity reference sheets',
  byeoli: 'Byeoli: the small girl exactly as in her reference sheets — same child, hair as one flat dark shape',
  ppaekong: 'Ppaekong: the small white cat exactly as in the reference sheets',
};

export const V2_REF_CAPS = { style: 3, identityPerCreator: 4, place: 2, total: 13 };   // 제미나이 참조 한도(±14) 안

/* ── Place Registry — 자주 등장하는 장소의 고정 (첫 장소: 작업실) ──
   장소 참조에서는 공간만 빌린다 — 사람·캐릭터는 절대 장소 이미지에서 오지 않는다. */
export const PLACES: Record<string, { ko: string; match: RegExp }> = {
  workshop: { ko: '작업실', match: /workshop|atelier|work\s?room|작업실/i },
};

/** 시나리오 setting에서 등장 장소를 감지한다 (패널 과반이 아니라 등장 여부 — 한 컷이라도 그 장소면 고정 필요). */
export function detectPlaces(s: ComicScenarioV2): string[] {
  const found: string[] = [];
  for (const [id, pl] of Object.entries(PLACES)) {
    if (s.panels.some((p) => pl.match.test(p.setting))) found.push(id);
  }
  return found;
}

/** 참조 계획 — 순수 함수(테스트 가능). 순서: 스타일 → 캐스트별 정체성 → 패널(마지막). */
export function planV2Refs(
  castIds: string[], appliedStyleSlots: string[], loadedSlots: Set<string>,
  includePanel = false,   // 실사고(관축해 1호): 별이용 패널 바이블의 '내용'이 관축해에 번졌다.
                          // 레이아웃만 참고시킬 수 없다면 기본은 빼는 것 — 명시 opt-in만.
  placeIds: string[] = [],   // detectPlaces 결과 — setting에 감지된 장소만 싣는다
): { order: { slot: string; kind: string }[]; warnings: string[] } {
  const order: { slot: string; kind: string }[] = [];
  const warnings: string[] = [];
  const style = appliedStyleSlots.filter((s) => /^style_s[1-5]$/.test(s) && loadedSlots.has(s));
  if (style.length > V2_REF_CAPS.style) {
    warnings.push(`style_refs_truncated: ${style.length} → ${V2_REF_CAPS.style}`);   // 조용한 상한 금지
  }
  style.slice(0, V2_REF_CAPS.style).forEach((s) => order.push({ slot: s, kind: 'style' }));
  for (const c of castIds) {
    if (c === 'ppaekong') continue;   // 빼콩이는 별이 바이블에 동봉 — 별도 슬롯 없음
    let ids = [1, 2, 3, 4, 5].map((i) => `id_${c}_i${i}`).filter((s) => loadedSlots.has(s));
    // 실사고(07-22 심야): 별이의 정체성은 레거시 바이블 칸(ch00~04)에 있다 — 전용 락이
    // 비어 있으면 폴백한다 (id_byeoli_*가 생기면 그쪽 우선 — Lock 분리 원칙 유지).
    if (!ids.length && c === 'byeoli') {
      ids = ['ch00_master', 'ch01_turnaround', 'ch03_pose', 'ch04_hair', 'ch02_expression']
        .filter((s) => loadedSlots.has(s));
      if (ids.length) warnings.push('identity_fallback: byeoli — 전용 락(id_byeoli_*) 없음, 별이 바이블(레거시)로 대체');
    }
    if (!ids.length) { warnings.push(`identity_missing: ${c} — 정체성 참조 0장 (바이블 없이 그리면 남이 된다)`); continue; }
    if (ids.length > V2_REF_CAPS.identityPerCreator) {
      warnings.push(`identity_refs_truncated: ${c} ${ids.length} → ${V2_REF_CAPS.identityPerCreator}`);
    }
    ids.slice(0, V2_REF_CAPS.identityPerCreator).forEach((s) => order.push({ slot: s, kind: `identity:${c}` }));
  }
  for (const pl of placeIds) {
    const slots = [1, 2, 3, 4, 5].map((i) => `pl_${pl}_p${i}`).filter((s) => loadedSlots.has(s));
    if (!slots.length) continue;   // 장소 참조는 없으면 조용히 생략 — 정체성과 달리 필수가 아니다
    if (slots.length > V2_REF_CAPS.place) warnings.push(`place_refs_truncated: ${pl} ${slots.length} → ${V2_REF_CAPS.place}`);
    slots.slice(0, V2_REF_CAPS.place).forEach((s) => order.push({ slot: s, kind: `place:${pl}` }));
  }
  if (includePanel && loadedSlots.has('ch05_panel')) order.push({ slot: 'ch05_panel', kind: 'panel' });
  // 총량 예산 — 넘치면 정체성부터 라운드로빈으로 줄인다 (조용한 상한 금지: 경고로 말한다)
  while (order.length > V2_REF_CAPS.total) {
    const idKinds = [...new Set(order.filter((r) => r.kind.startsWith('identity:')).map((r) => r.kind))];
    let removed = false;
    for (const k of idKinds) {
      const mine = order.filter((r) => r.kind === k);
      if (mine.length > 2) {   // 정체성은 최소 2장은 지킨다
        order.splice(order.lastIndexOf(mine[mine.length - 1]), 1);
        removed = true;
        if (order.length <= V2_REF_CAPS.total) break;
      }
    }
    if (!removed) break;
  }
  if (order.length > V2_REF_CAPS.total) warnings.push(`refs_over_budget: ${order.length}/${V2_REF_CAPS.total}`);
  else if (order.some((r) => r.kind.startsWith('place:')) && order.filter((r) => r.kind.startsWith('identity:')).length < castIds.filter((c) => c !== 'ppaekong').length * V2_REF_CAPS.identityPerCreator) {
    warnings.push('refs_budget_trimmed: 장소 참조를 싣기 위해 정체성 참조 일부 축소');
  }
  return { order, warnings };
}

/** v2 원샷 페이지 프롬프트 — 한국어 정확도·컷 수 못박기·화자별 말풍선은 v1 실사고 교훈 계승. */
export function buildPagePromptV2(
  s: ComicScenarioV2,
  refPlan: { slot: string; kind: string }[],
  opts: { dateKst?: string; observationNo?: number } = {},
): string {
  const styleN = refPlan.filter((r) => r.kind === 'style').length;
  const idGroups = s.cast.map((c) => c.creatorId)
    .filter((c) => refPlan.some((r) => r.kind === `identity:${c}`));
  const placeGroups = [...new Set(refPlan.filter((r) => r.kind.startsWith('place:')).map((r) => r.kind.slice(6)))];
  const hasPanelRef = refPlan.some((r) => r.kind === 'panel');

  const refDesc: string[] = [];
  let cursor = 0;
  if (styleN) { refDesc.push(`images ${cursor + 1}–${cursor + styleN} define the shared art style of the whole page`); cursor += styleN; }
  for (const c of idGroups) {
    const n = refPlan.filter((r) => r.kind === `identity:${c}`).length;
    refDesc.push(`images ${cursor + 1}–${cursor + n} define the identity of ${c}`);
    cursor += n;
  }
  for (const pl of placeGroups) {
    const n = refPlan.filter((r) => r.kind === `place:${pl}`).length;
    refDesc.push(`images ${cursor + 1}–${cursor + n} define the recurring PLACE "${PLACES[pl]?.ko ?? pl}" — match its layout, furniture, lighting and props every time this place appears. Borrow the SPACE only: characters or people NEVER come from place references`);
    cursor += n;
  }
  if (hasPanelRef) refDesc.push('the last image is a panel-LAYOUT reference from a DIFFERENT work: borrow ONLY frame borders, gutters and rhythm — NEVER its characters, drawing style, colors, or content');

  const lines: string[] = [
    `한국어 텍스트 정확하게 렌더링, 글자 왜곡 없음. Render every Korean text below with perfect accuracy — no invented or distorted glyphs.`,
    `A single Korean webtoon page with exactly ${s.panelCount} panels.`,
    `The page must contain exactly ${s.panelCount} panels — count them. If any layout reference shows a different number of frames, borrow only its border style, gutters and rhythm; never copy its frame count.`,
    `Reference images, in order: ${refDesc.join('. ')}.`,
    `Style: ${GWANCHUKHAE_STYLE_EN}.`,
    ...s.cast.map((c) => CAST_FORM_EN[c.creatorId]).filter(Boolean),
    `Only the listed cast appears. No other people anywhere on the page — no crowds, no passers-by, no background figures. Empty streets and empty spaces are correct.`,
    `Page header, top-left, small and quiet: "관축해" and "${opts.dateKst ?? ''}". Below it the topic "${s.topic}" written as a modest title.`,
    opts.observationNo
      ? `At the very bottom of the page, tiny: "Observation #${String(opts.observationNo).padStart(3, '0')} · MIMESIS Studio".`
      : '',
    `Every piece of Korean text is hand-lettered, calm and legible — never digital typeset fonts.`,
    `Speech bubbles: Vase and Byeoli use plain quiet bubbles. Holmes speaks in a bubble tinted/outlined with the same electric blue as the waveform.`,
    '',
  ];
  for (const p of s.panels) {
    lines.push(`Panel ${p.panelNo}: ${p.setting}, ${p.framing} shot. Beat: ${p.beat}.`);
    for (const a of p.actions) {
      lines.push(`  ${a.creatorId}: ${a.action}${a.expressionOrState ? ` (${a.expressionOrState})` : ''}.`);
    }
    for (const d of p.dialogue) {
      if (d.text) lines.push(`  Speech bubble from ${d.speakerId} (Korean, exact): "${d.text}"`);
    }
    if (p.caption) lines.push(`  Caption box (Korean, exact): "${p.caption}"`);
  }
  lines.push('', `Ending mood: ${s.endingBeat}.`, 'No text other than the specified Korean lines and the header.');
  return lines.filter(Boolean).join('\n');
}
