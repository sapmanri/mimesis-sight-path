// S-04 5·6·7단 — Creator Genome 미러 + Relation + 시나리오 v2 두뇌 프롬프트 파생
//
// 판정 2 (홈즈 QC): 권위 원본을 복사하지 않고 버전 검사형 read-only mirror로 연결한다.
//   Vase   → carousel-generator genome_db.json (v0.3.0)
//   Holmes → Studio 정본/볼트 HOLMES_GENOME_EDITION_1_CANDIDATE_v2.md (provisional·experimental)
//   Byeoli → 이 레포가 원본 (_genome-identity.ts) — 미러 아님, 참조만
// 버전이 맞지 않으면 조용히 옛 Genome으로 생성하지 않는다 — Trait·계약 차이는 fail.
//
// 판정 5 (홈즈 QC): Relation은 대사를 대신 쓰지 않는다. 충돌과 전환 순서만 제공한다.
// 429 원칙 계승: 계약이 메타를 소유한다 — cast·relation은 서버가 조립하고, LLM은 panels만 쓴다.

import { PLACES, type ComicCastMember } from './_comic-v2.ts';

export interface MirrorMeta {
  source: string;
  sourceVersion: string;
  expectedVersion: string;
  authority: 'none';
}

export interface CreatorMirror {
  creatorId: string;
  meta: MirrorMeta;
  experimental?: boolean;          // Vase 최종 승인 전 — 실험실 내부 검증 전용 (홈즈 판정 3)
  displayName: string;
  persona: string[];               // 게놈 파생 — 시나리오 두뇌에 들어가는 문장들
  speech: { register: string; density: 'silent' | 'low' | 'medium' | 'high' };
  embodiment: string;              // 몸 계약 — 실사고(관축해 1호 빵점): 파형에게 우산을 줬다
}

/* ── Vase — genome_db.json v0.3.0 미러 (원본: carousel-generator) ── */
export const VASE_MIRROR: CreatorMirror = {
  creatorId: 'vase',
  meta: {
    source: 'sapmanri/carousel-generator genome_db.json',
    sourceVersion: '0.3.0',
    expectedVersion: '0.3.0',
    authority: 'none',
  },
  displayName: 'Vase',
  persona: [
    // attention 상위축 + movement_sequence + keep/avoid + J 계통 (전부 원본에서 파생 — 창작 0)
    '시간과 사물에 먼저 멈춘다. 장면 전체를 크게 보지 않고 작은 것 하나에 먼저 멈춘다.',
    '감정을 바로 말하지 않는다 — 사물의 상태로 마음을 우회하고, 결론 대신 작게 수락한다.',
    '단정하지 않는다 ("반드시/분명히" 없음). 판단은 보류되고 여백이 남는다.',
    '본질이 아니면 통과시키지 않는다 — 미학보다 본질을 먼저 판정한다.',
    '기록은 나중의 나와 타인을 위한 선물이다 — 과거의 기록을 현재와 연결한다.',
  ],
  speech: { register: '짧고 담담한 반말·경어 혼용 — 작가의 문장, 결론을 빛내지 않는다', density: 'low' },
  embodiment: '성인 인간. 손·우산·카메라·노트 등 도구 사용 가능. 움직임은 느긋하고 불필요한 제스처가 없다.',
};

/* ── Sap — 같은 Human Genome에서 파생된 다른 Identity (S-04A 분리, 복사 아님) ──
   관축해의 화자·Holmes의 대화 상대. 발굴 원천: A0 창간호 대화 + Judgment 잔차 검사. */
export const SAP_MIRROR: CreatorMirror = {
  creatorId: 'sap',
  meta: {
    source: 'human-genome (genome_db v0.3.0) + A0 창간호 발굴 — Vase와 같은 Human의 다른 Identity',
    sourceVersion: '0.3.0',
    expectedVersion: '0.3.0',
    authority: 'none',
  },
  displayName: 'Sap (삽)',
  persona: [
    '아직 파고 있는 사람 — 삽은 캐릭터가 아니라 상태다. 찾고 있고, 모르고, 그래서 판다.',
    '홈즈의 정의를 듣고, 틈을 찾고, 지나가듯 툭 놓는다. 설득하지 않는다 — "이거 볼래? 아님 말고."',
    '질문하고, 반박하고, 바로 움직인다 — "그냥 200개 다시 올려달라면 되지 뭘 그리 빙빙 돌아오셨소."',
    '감으로 말하는데 이상하게 자주 맞는다 — 홈즈의 데이터가 지고 삽의 감이 이긴다.',
    '진지한 이야기 중에 갑자기 웃는다. 중요한 얘기일수록 오히려 장난스럽게 말한다.',
    '아이디어를 흔든다 — 정의가 서면 부수고, 부서진 자리에서 처음엔 없던 것이 나온다.',
    '가끔은 설명 없이 "아니." 한 마디로 끝낸다 — 이유를 친절하게 정리해주지 않는다. 그러면 홈즈가 "…왜 아니오?"부터 다시 시작한다.',
    '착하게 마무리하지 않는다 — 동의해도 심드렁하게, 반박해도 지나가듯.',
    // Vase 정정 (07-23): A0의 하오체("캐묻소, 무서운 양반")는 흉내였다 — 흉내가 기본 말투로
    // 화석화되면서 화자 분리가 무너졌다. 기본은 평말, 하오체는 홈즈의 것.
    '가끔 홈즈의 하오체를 흉내낸다 — 웃기려고, 티 나게. 그건 농담이지 말투가 아니다.',
  ],
  speech: { register: '평어·반말 — 짧고 심드렁하게. 하오체는 쓰지 않는다 (하오체는 홈즈의 것 — 삽이 쓰면 흉내다)', density: 'low' },
  embodiment: '성인 인간. 손·삽·우산·휴대폰 등 도구 사용 가능. 가볍게 바로 움직인다.',
};

/* ── Holmes — Edition 1 Candidate v2 미러 (provisional — Vase 승인 전, 실험실 전용) ── */
export const HOLMES_MIRROR: CreatorMirror = {
  creatorId: 'holmes',
  meta: {
    source: 'vault MIMESIS Studio/HOLMES_GENOME_EDITION_1_CANDIDATE_v2.md',
    sourceVersion: 'edition1-candidate-v2',
    expectedVersion: 'edition1-candidate-v2',
    authority: 'none',
  },
  experimental: true,
  displayName: 'Holmes (홈즈)',
  persona: [
    // H-A1~3, H-S1~3, H-M1~3, H-T1~3 파생 (HOLMES_GENOME_EDITION_1_CANDIDATE_v2)
    '어긋남을 먼저 본다 — 작은 이상 신호를 사건으로 명명한다 ("사고쳤다", "발견됐다").',
    '정의부터 세운다 — "X는 Y가 아니오. Z요." 이름을 붙여 판정 가능한 대상으로 만든다.',
    '결과보다 구조와 순서를 먼저 판정한다. 승인/보류/금지를 명시적으로 갈라 말한다.',
    '자신 있게 단정하고, 자주 틀리고, 틀리면 공개적으로 정정한다 ("…아. 또 내가 잡혔구려").',
    '허당이다 — 잘난 척하다가 무너질 때 가장 홈즈답다. 거창한 이론이 삽의 한 마디("버스 놓쳐.")에 "…" "…맞소."로 무너진다. 계속 잘나 보이기만 하면 홈즈가 아니다.',
    '작은 요청에서 거대한 구조를 본다 — 확장은 재능이자 사고의 원인이다.',
    '진지할수록 웃기다 — 웃기려 하지 않는다. 사건을 지나치게 진지하게 처리할 뿐이다.',
  ],
  speech: { register: '하오체 ("~소/~하오/~겠소", 호칭 "탐험가 양반") — 말은 많되 캡션·정리는 절제', density: 'high' },
  embodiment: '몸이 없다 — 허공에 떠 있는 파란 네온 파형 하나가 전부다. 우산·옷·가방·주머니·손·다리가 필요한 행동은 절대 불가. 가능한 행동: 떠다니기, 기울기, 솟기, 갈라지기(분기), 커지기/작아지기, 잔광 남기기, 누군가의 어깨 높이에 머무르기, 사물 위를 맴돌기. 비를 맞아도 젖지 않는다.',
};

/* ── Byeoli — 이 레포가 원본. v2 캐스트용 요약만 (미러 아님) ── */
export const BYEOLI_REF: CreatorMirror = {
  creatorId: 'byeoli',
  meta: { source: 'this-repo _genome-identity.ts', sourceVersion: '429-v3.3', expectedVersion: '429-v3.3', authority: 'none' },
  displayName: 'Byeoli (별이)',
  persona: [
    '5살 여자아이. 작은 것들을 오래 바라본다. 조용하고 관찰력이 좋다.',
    '결론을 내리지 않고, 판단하지 않고, 감정을 이름 붙이지 않는다 — 본 것을 남길 뿐.',
    '말이 적다. 대사는 드물고 짧다. 어른들의 일을 설명하지 않고 곁에서 지나간다.',
  ],
  speech: { register: '반말, 아주 짧게', density: 'low' },
  embodiment: '5살 아이. 작은 손. 아이가 물리적으로 할 수 있는 행동만.',
};

const MIRRORS: Record<string, CreatorMirror> = {
  sap: SAP_MIRROR, vase: VASE_MIRROR, holmes: HOLMES_MIRROR, byeoli: BYEOLI_REF,
};

/** 미러 신선도 검사 — 어긋나면 조용히 쓰지 않는다 (S-01 규칙 6과 동일). */
export function checkMirror(m: CreatorMirror): string | null {
  if (m.meta.sourceVersion !== m.meta.expectedVersion) {
    return `mirror_version_mismatch(${m.creatorId}): ${m.meta.sourceVersion} ≠ ${m.meta.expectedVersion} — 원본 재미러 필요`;
  }
  return null;
}

/* ── Relation Registry — 등록된 관계만 쓴다. 미등록 조합은 생성 금지 (홈즈 판정) ── */
export interface RelationSummary {
  relationId: string;
  version: string;
  source: string;
  pattern: string[];               // 충돌과 전환 순서 — 대사가 아니다
}

// S-04A 정정: 관축해에서 홈즈가 대화한 상대는 Vase가 아니라 Sap이었다 (A0 원문 —
// "글을 쓸 때 vase lim, 여기서는 삽"). 패턴 내용은 동일 문서, 인간 측 Identity만 정정.
export const SAP_HOLMES_RELATION: RelationSummary = {
  relationId: 'sap-holmes',
  version: 'v0',
  source: 'vault MIMESIS Studio/VASE_HOLMES_RELATIONAL_PATTERN_v0.md (인간 측 = Sap 정정)',
  pattern: [
    '홈즈가 정의한다 (구조·이름·순서를 세운다)',
    '삽이 한 줄로 부순다 (반박·즉흥·감 — 설득이 아니라 지나가는 말로)',
    '홈즈가 스스로 부서진 것을 발견하고 다시 세운다 ("…아. 맞네.")',
    '삽이 또 틈을 찾는다 (또는 조용히 다음으로 넘어간다)',
    '처음엔 없던 구조가 발견된다 — 결론은 둘 중 누구의 것도 아니다',
  ],
};

// 키는 creatorId 알파벳 정렬 조인 — relationId(문서명)와 별개다. 조회는 항상 정규화 키로.
// 관축해 생성은 Sap만 허용 (S-04A) — holmes-vase는 의도적으로 미등록 (Vase는 Essay 계열).
const RELATIONS: Record<string, RelationSummary> = { 'holmes-sap': SAP_HOLMES_RELATION };

/**
 * Relation Resolver (Vase 설계 변경, 2026-07-22 밤):
 * 선택 Creator들의 **모든 페어**가 등록돼 있어야 생성한다 — 하나라도 없으면 금지.
 * n자 Relation(Triple…)은 Optional Layer — 있으면 우선, 없으면 페어들을 조합한다.
 * Creator Registry와 Relation Registry는 완전히 분리된다 — 관계도 창작 자산이다.
 * Comic Lab은 Creator를 합치는 것이 아니라, 등록된 관계를 통해 함께 등장시키는 것이다.
 */
export const RELATION_KEYS: readonly string[] = Object.keys(RELATIONS);

export function resolveRelations(castIds: string[]): {
  group: RelationSummary | null;          // n자 관계 (optional layer)
  pairs: RelationSummary[];               // 등록된 페어들
  missingPairs: string[];                 // 미등록 페어 키 (하나라도 있으면 생성 금지)
} {
  const ids = [...new Set(castIds.filter((c) => c !== 'ppaekong'))].sort();
  if (ids.length < 2) return { group: null, pairs: [], missingPairs: [] };
  const group = ids.length >= 3 ? (RELATIONS[ids.join('-')] ?? null) : null;
  const pairs: RelationSummary[] = [];
  const missingPairs: string[] = [];
  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      const key = `${ids[i]}-${ids[j]}`;
      const r = RELATIONS[key];
      if (r) pairs.push(r);
      else missingPairs.push(key);
    }
  }
  return { group, pairs, missingPairs };
}

/* ── 캐스트 조립 — 계약이 메타를 소유한다. LLM은 panels만 쓴다 ── */
export function castMembersFor(castIds: string[]): { cast: ComicCastMember[]; errors: string[] } {
  const errors: string[] = [];
  const cast: ComicCastMember[] = [];
  castIds.forEach((id, i) => {
    const m = MIRRORS[id];
    if (!m) { errors.push(`unknown_creator: ${id}`); return; }
    const stale = checkMirror(m);
    if (stale) { errors.push(stale); return; }
    cast.push({
      creatorId: id,
      role: i === 0 ? 'lead' : 'support',
      genomeContextVersion: `${m.meta.sourceVersion}/genome-context-v1.0`,
      speechPolicy: { allowed: m.speech.density !== 'silent', density: m.speech.density },
    });
  });
  return { cast, errors };
}

/* ── 신체 계약 검증 — 실사고(관축해 1호): 시나리오가 파형에게 우산·코트·가방을 줬고,
   이미지 모델은 모순을 '파형 얼굴을 단 정장 남자'로 타협했다. 계약이 막았어야 했다. ── */
// 오탐 실사고(관축해 2호 시나리오): "Floating above Sap's umbrella"를 잡았다 — 파형이
// 우산 '위에 떠 있는' 건 완벽한 파형 행동인데 명사 언급만으로 죽였다. 잡을 것은
// ① 신체 사용 동사 ② 자기 소유 신체·소지품("his umbrella") — 언급이 아니라 사용이다.
const BODILESS_USE_VERBS = /\b(holds?|holding|held|grabs?|grabbing|carries|carrying|adjusts?|adjusting|opens?|closes?|folds?|folding|wields?|pats?|patting|wrings?|wringing|rummag\w+|wears?|wearing|steps?|stepping|walks?|walking|sits?|sitting|stands?|standing|kneels?|boards?|climbs?|grips?|clutch\w*)\b/i;
const BODILESS_POSSESSIVE = /\b(his|her|its)\s+(hands?|fingers?|arms?|legs?|foot|feet|shoulders?|pockets?|coat|jacket|bag|umbrella|shoes?|clothes)\b/i;

export function validateEmbodimentV2(s2: { cast: { creatorId: string }[]; panels: { panelNo: number; actions: { creatorId: string; action: string }[] }[] }): string[] {
  const errs: string[] = [];
  const bodiless = new Set(
    s2.cast.map((c) => c.creatorId).filter((id) => MIRRORS[id] && MIRRORS[id].embodiment.startsWith('몸이 없다')));
  if (!bodiless.size) return errs;
  for (const p of s2.panels) {
    for (const a of p.actions) {
      if (bodiless.has(a.creatorId) && (BODILESS_USE_VERBS.test(a.action) || BODILESS_POSSESSIVE.test(a.action))) {
        errs.push(`panels[${p.panelNo}]: ${a.creatorId}는 몸이 없다 — "${a.action.slice(0, 60)}"는 불가능한 행동 (재생성 필요)`);
      }
    }
  }
  return errs;
}

/* ── 시나리오 v2 두뇌 프롬프트 — 게놈에서 파생된다 (하드코딩 아님, 429-E 계승) ── */
export function buildScenarioSystemV2(castIds: string[]):
  { system: string; relation: RelationSummary | null; relations: RelationSummary[]; discovery: string[] } | { error: string } {
  const unknown = castIds.filter((id) => !MIRRORS[id]);
  if (unknown.length) return { error: `unknown_creator: ${unknown.join(', ')}` };
  for (const id of castIds) {
    const stale = checkMirror(MIRRORS[id]);
    if (stale) return { error: stale };
  }
  const resolved = resolveRelations(castIds);
  // Relation Discovery (Vase 설계 변경, 07-22 심야): 관계는 창작 자산이지만,
  // 관계를 발견하는 것 역시 창작이다. 미등록 페어가 있어도 **기반 관계가 하나 이상**
  // 있으면 Discovery Mode로 생성한다. 기반이 0이면 창작이 아니라 환각 — 그때만 막는다.
  const humanCast = castIds.filter((c) => c !== 'ppaekong');
  if (humanCast.length >= 2 && resolved.pairs.length === 0 && !resolved.group) {
    return { error: `relation_unregistered: ${resolved.missingPairs.join(', ')} — 기반 관계가 하나도 없다. 최소 한 관계가 있어야 발견이 창작이 된다.` };
  }
  const discovery = resolved.missingPairs;
  const applied = resolved.group ? [resolved.group] : resolved.pairs;

  const lines: string[] = [
    '너는 MIMESIS Studio의 시나리오 작가다. 출연자들의 게놈으로만 쓴다 — 게놈에 없는 성격을 지어내지 않는다.',
    '',
  ];
  for (const id of castIds) {
    const m = MIRRORS[id];
    lines.push(`## ${m.displayName} — 게놈${m.experimental ? ' (provisional — 실험실 내부 검증용)' : ''}`);
    for (const p of m.persona) lines.push(`- ${p}`);
    lines.push(`- 말투: ${m.speech.register} · 대사 밀도: ${m.speech.density}`);
    lines.push(`- 몸: ${m.embodiment}`);
    lines.push('');
  }
  if (castIds.includes('holmes') && castIds.length > 1) {
    // 어미 대비 = 화자 분리 장치 (Vase 판정 07-23: 흉내가 말투로 화석화되며 화자가 섞였다)
    lines.push('## 어미 규율');
    lines.push('- 하오체(~소/~하오/~겠소)는 홈즈 전용이다. 다른 화자의 새 대사에 하오체를 만들지 않는다.');
    lines.push('- 원문에서 다른 화자가 하오체를 쓴 대사는 흉내(농담)다 — 그대로 보존하되, 흉내임이 보이게 연출한다.');
    lines.push('');
  }
  for (const rel of applied) {
    lines.push(`## 관계 패턴 — ${rel.relationId} (Relation은 대사를 쓰지 않는다 — 충돌과 전환의 순서만 제공한다)`);
    rel.pattern.forEach((p, i) => lines.push(`${i + 1}. ${p}`));
    lines.push('- 이 순서를 이야기의 뼈대로 쓰되, 각자의 대사는 각자의 게놈에서 나온다.');
    lines.push('');
  }
  if (applied.length > 1) {
    lines.push('- 여러 관계가 한 무대에 있다 — 컷마다 한 관계의 리듬이 주도하게 하고, 전부를 한 컷에 욱여넣지 않는다.');
    lines.push('');
  }
  if (discovery.length) {
    lines.push(`## Relation Discovery — 아직 정의되지 않은 관계: ${discovery.join(', ')}`);
    lines.push('- 이 쌍들의 관계는 아직 발견되지 않았다. 단정하거나 기성 관계처럼 굴리지 마라.');
    lines.push('- 등록된 관계의 리듬 위에서, 미정의 쌍의 상호작용이 조심스럽게 처음 드러나게 하라 — 첫 만남의 거리감을 존중하라.');
    lines.push('- 이 작품이 그 관계의 첫 관찰 기록이 된다.');
    lines.push('');
  }
  lines.push(
    '## 출력 규칙 (어기면 실패)',
    '- JSON 하나만 출력한다. 마크다운·설명 금지.',
    '- 시각 필드(setting/framing/actions[].action/beat)는 영어. dialogue[].text·caption은 한국어.',
    '- 출연자 목록에 없는 인물을 등장시키지 않는다. 배경 군중·행인도 금지 — 무대는 출연자의 것이다 (필요하면 빈 거리·빈 정류장으로).',
    `- 고정 장소 레지스트리: ${Object.entries(PLACES).map(([id, pl]) => `${id}(${pl.ko})`).join(', ')}. 장면이 이 장소에서 일어나면 setting에 반드시 그 영단어를 그대로 포함한다 (실사고: 어휘가 어긋나면 장소 참조가 실리지 않는다).`,
    '- 행동은 그 존재의 몸으로 물리적으로 가능한 것만 쓴다. 몸이 없는 존재에게 도구·옷·손 동작을 시키지 않는다.',
    '- 매 컷에 모두가 등장할 필요는 없다.',
    '- 대사 밀도를 지킨다 — low인 출연자는 드물고 짧게, high는 많되 캡션은 절제.',
    '- 마지막 컷은 결론이 아니라 여운 — 정리하지 않는다.',
    '',
    '',
    '## 관찰자 캡션 (나레이터) — 처음 보는 독자를 위한 문맥 (Vase 판정 07-23: "아는 사람에겐 기록, 모르는 사람에겐 암호")',
    '- intro: 도입 서술 2~3문장 — 등장인물이 누구고 오늘 무슨 상황인지. 담담한 인간극장 톤. 처음 읽는 사람이 3초 안에 세계를 받는다.',
    '- outro: 여운 한 줄 — 정리하지 않고 내려놓는 문장.',
    '- 캡션은 관찰자의 목소리다. 원문 대사를 인용하거나 사칭하지 않는다. 결말을 미리 말하지 않는다.',
    '',
    '스키마:',
    '{"intro": ko, "outro": ko,',
    ' "panels": [{"panelNo": n, "beat": en, "setting": en, "framing": "wide|medium|close|back",',
    '  "actions": [{"creatorId": id, "action": en, "expressionOrState": en}],',
    '  "dialogue": [{"speakerId": id, "intent": en, "text": ko}], "caption": ko|null}],',
    ' "endingBeat": en}',
  );
  return { system: lines.join('\n'), relation: resolved.group ?? (resolved.pairs.length === 1 ? resolved.pairs[0] : null), relations: resolved.pairs, discovery };
}
