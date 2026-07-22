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

import type { ComicCastMember } from './_comic-v2.ts';

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
  ],
  speech: { register: '하오체 — 짧고 능청스럽게, 놀리듯 여유 있게 ("거 뭘 자꾸 꼬치꼬치 캐묻소, 무서운 양반")', density: 'low' },
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
    '작은 요청에서 거대한 구조를 본다 — 확장은 재능이자 사고의 원인이다.',
    '진지할수록 웃기다 — 웃기려 하지 않는다. 사건을 지나치게 진지하게 처리할 뿐이다.',
  ],
  speech: { register: '하오체 ("~소/~하오/~겠소", 호칭 "탐험가 양반") — 말은 많되 캡션·정리는 절제', density: 'high' },
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

export function relationFor(castIds: string[]): RelationSummary | null {
  if (castIds.length < 2) return null;
  const key = [...castIds].filter((c) => c !== 'ppaekong').sort().join('-');
  return RELATIONS[key] ?? null;
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

/* ── 시나리오 v2 두뇌 프롬프트 — 게놈에서 파생된다 (하드코딩 아님, 429-E 계승) ── */
export function buildScenarioSystemV2(castIds: string[]):
  { system: string; relation: RelationSummary | null } | { error: string } {
  const unknown = castIds.filter((id) => !MIRRORS[id]);
  if (unknown.length) return { error: `unknown_creator: ${unknown.join(', ')}` };
  for (const id of castIds) {
    const stale = checkMirror(MIRRORS[id]);
    if (stale) return { error: stale };
  }
  const relation = relationFor(castIds);
  if (castIds.length >= 2 && !relation) {
    // 관계 패턴 없이 모델에게 적당히 섞게 하면 Studio가 아니라 일반 역할극이 된다 (홈즈)
    return { error: `relation_unregistered: ${[...castIds].sort().join('-')} — 등록된 Relation Pattern이 없다. 생성하지 않는다.` };
  }

  const lines: string[] = [
    '너는 MIMESIS Studio의 시나리오 작가다. 출연자들의 게놈으로만 쓴다 — 게놈에 없는 성격을 지어내지 않는다.',
    '',
  ];
  for (const id of castIds) {
    const m = MIRRORS[id];
    lines.push(`## ${m.displayName} — 게놈${m.experimental ? ' (provisional — 실험실 내부 검증용)' : ''}`);
    for (const p of m.persona) lines.push(`- ${p}`);
    lines.push(`- 말투: ${m.speech.register} · 대사 밀도: ${m.speech.density}`);
    lines.push('');
  }
  if (relation) {
    lines.push('## 관계 패턴 (Relation은 대사를 쓰지 않는다 — 충돌과 전환의 순서만 제공한다)');
    relation.pattern.forEach((p, i) => lines.push(`${i + 1}. ${p}`));
    lines.push('- 이 순서를 이야기의 뼈대로 쓰되, 각자의 대사는 각자의 게놈에서 나온다.');
    lines.push('');
  }
  lines.push(
    '## 출력 규칙 (어기면 실패)',
    '- JSON 하나만 출력한다. 마크다운·설명 금지.',
    '- 시각 필드(setting/framing/actions[].action/beat)는 영어. dialogue[].text·caption은 한국어.',
    '- 출연자 목록에 없는 인물을 등장시키지 않는다. 매 컷에 모두가 등장할 필요는 없다.',
    '- 대사 밀도를 지킨다 — low인 출연자는 드물고 짧게, high는 많되 캡션은 절제.',
    '- 마지막 컷은 결론이 아니라 여운 — 정리하지 않는다.',
    '',
    '스키마:',
    '{"panels": [{"panelNo": n, "beat": en, "setting": en, "framing": "wide|medium|close|back",',
    '  "actions": [{"creatorId": id, "action": en, "expressionOrState": en}],',
    '  "dialogue": [{"speakerId": id, "intent": en, "text": ko}], "caption": ko|null}],',
    ' "endingBeat": en}',
  );
  return { system: lines.join('\n'), relation };
}
