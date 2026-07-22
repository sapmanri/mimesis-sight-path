// S-04B — Dialogue to Comic Mode (홈즈 설계, 2026-07-23)
//
// Dialogue Mode는 대화를 새로 쓰는 기능이 아니다.
// 이미 있었던 대화에서 만화가 될 사건을 발견하고, 그 원문을 보존한 채 컷으로 옮기는 기능이다.
//
// 원칙:
//   - rawDialogue는 Archive 원본이다. 수정하거나 덮어쓰지 않는다.
//   - 원문 사실 > Genome 표현 선호. Genome은 "무엇을 남기고 어떻게 배치할지"에만 관여한다.
//   - 원문에 없는 발화자·사건·결말을 만들지 않는다.

import type { ComicScenarioV2 } from './_comic-v2.ts';

/* ── 계약 ── */

export type PreservationMode = 'strict' | 'balanced' | 'reconstruct';

export interface DialogueComicInput {
  mode: 'dialogue';
  rawDialogue: string;
  speakerMap: Record<string, string>;     // 원문 화자 이름 → creatorId
  creators: string[];
  requestedPanelCount: number | 'auto';
  preservationMode: PreservationMode;
  placeId?: string | null;
  titleHint?: string | null;
  lineRange?: { start: number; end: number } | null;   // 긴 원문의 에피소드 선택 (Test B)
}

export interface DialogueProvenance {
  sourceType: 'dialogue';
  sourceHash: string;
  preservationMode: PreservationMode;
  sourceRanges: { panelNo: number; startLine: number; endLine: number }[];
  preservedLines: string[];
  omittedLines: string[];
  reconstructedLines: { output: string; basis: string[] }[];
}

export interface Utterance { line: number; speaker: string | null; text: string; inferred?: boolean }

/* ── 화자 파싱 — 확신하지 못하면 임의 매핑하지 않는다 ── */

const COLON_RE = /^\s*([^\s:：]{1,24})\s*[:：]\s*(.+)$/;

export function parseDialogue(raw: string): {
  utterances: Utterance[]; speakers: string[]; warnings: string[];
} {
  const lines = raw.split('\n');
  const utterances: Utterance[] = [];
  const warnings: string[] = [];
  let current: Utterance | null = null;
  let pendingName: { name: string; line: number } | null = null;

  const speakerish = (t: string) =>
    t.length <= 24 && !/[.!?…。"']$/.test(t) && !t.includes(' ') && /[가-힣A-Za-z]/.test(t);

  for (let i = 0; i < lines.length; i++) {
    const t = lines[i].trim();
    if (!t) { if (current) { utterances.push(current); current = null; } pendingName = null; continue; }
    const m = t.match(COLON_RE);
    if (m) {
      if (current) utterances.push(current);
      current = { line: i + 1, speaker: m[1], text: m[2].trim() };
      pendingName = null;
      continue;
    }
    // 블록 형식: 이름 단독 줄 → 다음 줄부터 발화
    if (!current && speakerish(t)) { pendingName = { name: t, line: i + 1 }; continue; }
    if (pendingName) {
      current = { line: pendingName.line, speaker: pendingName.name, text: t };
      pendingName = null;
      continue;
    }
    if (current) { current.text += '\n' + t; continue; }
    // 화자 불명 줄 — 지어내지 않고 null로 남긴다
    current = { line: i + 1, speaker: null, text: t, inferred: true };
    warnings.push(`화자 불명 ${i + 1}행 — UI에서 연결 필요`);
  }
  if (current) utterances.push(current);
  const speakers = [...new Set(utterances.map((u) => u.speaker).filter((s): s is string => !!s))];
  return { utterances, speakers, warnings };
}

/* ── 입력 검증 — 실패 처리 규칙 (홈즈 §11) ── */

export function validateDialogueInput(
  input: DialogueComicInput, parsed: { utterances: Utterance[]; speakers: string[] },
): string[] {
  const errs: string[] = [];
  const meaningful = parsed.utterances.filter((u) => u.text.trim().length > 1);
  if (meaningful.length < 4) errs.push('dialogue_too_short: 의미 있는 발화가 부족하다');
  const mappedTo = new Set(Object.values(input.speakerMap));
  for (const sp of parsed.speakers) {
    const mapped = input.speakerMap[sp];
    if (!mapped) errs.push(`speaker_unmapped: "${sp}" — 화자를 Creator에 연결해야 한다`);
    else if (!input.creators.includes(mapped)) {
      errs.push(`speaker_unmapped: "${sp}" → ${mapped} — 선택된 Creator가 아니다`);
    }
  }
  for (const c of input.creators) {
    if (!mappedTo.has(c)) errs.push(`creator_unvoiced: ${c} — 원문에 이 Creator의 발화가 없다 (원문에 없는 발화자를 만들지 않는다)`);
  }
  return errs;
}

/* ── 각색 검증 — Genome이 원문을 변조하지 않았는가 ── */

const norm = (s: string) => s.replace(/[\s"'「」『』.…!?~,]/g, '');

export function validateAdaptation(
  s2: ComicScenarioV2, prov: DialogueProvenance,
  utterances: Utterance[], input: DialogueComicInput,
): { errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];
  const srcNorm = norm(utterances.map((u) => u.text).join('\n'));
  const bySpeakerNorm = new Map<string, string>();
  for (const u of utterances) {
    if (!u.speaker) continue;
    const id = input.speakerMap[u.speaker];
    if (!id) continue;
    bySpeakerNorm.set(id, (bySpeakerNorm.get(id) ?? '') + '' + norm(u.text));
  }
  const reconstructed = new Set(prov.reconstructedLines.map((r) => norm(r.output)));

  for (const p of s2.panels) {
    for (const d of p.dialogue) {
      if (!d.text) continue;
      const dn = norm(d.text);
      const inSource = dn.length > 0 && srcNorm.includes(dn);
      if (input.preservationMode === 'strict' && !inSource) {
        errors.push(`strict_line_modified: ${p.panelNo}컷 "${d.text.slice(0, 30)}" — strict에서는 원문 그대로만`);
        continue;
      }
      if (inSource) {
        // 원문 대사가 다른 Creator에게 배정됐는가
        const owner = bySpeakerNorm.get(d.speakerId) ?? '';
        if (dn.length >= 6 && !owner.includes(dn)) {
          errors.push(`speaker_misattributed: ${p.panelNo}컷 "${d.text.slice(0, 30)}" — 원문 화자의 대사를 ${d.speakerId}에게 배정`);
        }
      } else if (input.preservationMode === 'reconstruct' && !reconstructed.has(dn)) {
        warnings.push(`unlisted_reconstruction: ${p.panelNo}컷 "${d.text.slice(0, 30)}" — reconstructed_lines에 미신고`);
      } else if (input.preservationMode === 'balanced') {
        warnings.push(`balanced_paraphrase: ${p.panelNo}컷 "${d.text.slice(0, 30)}" — 원문에 정확히 없음 (미세 정리로 간주)`);
      }
    }
  }
  // provenance 커버리지 — sourceRanges 없는 패널이 과반이면 실패
  const covered = new Set(prov.sourceRanges.map((r) => r.panelNo));
  const uncovered = s2.panels.filter((p) => !covered.has(p.panelNo)).length;
  if (uncovered > s2.panels.length / 2) {
    errors.push(`provenance_missing: ${uncovered}/${s2.panels.length}컷이 원문 근거 없음`);
  }
  if (prov.omittedLines.length > utterances.length * 0.6) {
    warnings.push(`heavy_omission: 원문 ${utterances.length}발화 중 ${prov.omittedLines.length}건 생략`);
  }
  if (input.preservationMode !== 'reconstruct' && prov.reconstructedLines.length) {
    errors.push('reconstruction_forbidden: strict/balanced에서 새 대사 생성 금지');
  }
  return { errors, warnings };
}

/* ── 결정론 해시 (원본 자산 키) ── */
export function dialogueHash(raw: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < raw.length; i++) { h ^= raw.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return (h >>> 0).toString(16).padStart(8, '0');
}

/* ── Dialogue Adapter 프롬프트 — 기존 게놈 시스템 위에 각색 규칙을 얹는다 ── */

const MODE_RULES: Record<PreservationMode, string> = {
  strict: '- strict: 대사는 원문 그대로만. 삭제와 컷 분할만 허용. 새 대사 생성 금지. 행동·표정·배경만 보충 가능.',
  balanced: '- balanced: 핵심 문장은 원문 그대로 보존. 군더더기·반복은 삭제 가능. 말투를 게놈에 맞게 미세 정리 가능. 원문에 없던 결론·사건 추가 금지.',
  reconstruct: '- reconstruct: 실제 사건과 관계 리듬은 보존. 컷에 맞게 압축·재배열 가능. 새 대사는 원문의 함의를 벗어나지 않는 연결문만 — 전부 reconstructedLines에 신고.',
};

export function buildDialogueAdapterPrompt(
  baseSystem: string, input: DialogueComicInput, utterances: Utterance[],
): { system: string; user: string } {
  const system = baseSystem + '\n\n' + [
    '## Dialogue Mode — 위 출력 규칙에 다음을 더한다 (충돌 시 이쪽이 우선)',
    '너는 새 이야기를 쓰는 작가가 아니라 각색자다. 실제로 있었던 대화를 컷으로 옮긴다.',
    '1. 실제 대화에서 사건의 중심을 찾는다. 2. 반복·메타 발화·기술 로그를 줄인다.',
    '3. 충돌과 전환점을 컷 비트로 나눈다. 4. 원문의 핵심 문장은 가능한 한 보존한다.',
    '5. 그림으로 보여줄 행동·공간만 최소한으로 보충한다 (각 존재의 몸 계약 안에서).',
    '- 원문 사실 > Genome 표현 선호. 누가 무엇을 말했는가는 절대 바꾸지 않는다.',
    '- 원문에 없는 발화자·사건·결말·감정을 만들지 않는다.',
    MODE_RULES[input.preservationMode],
    input.placeId ? `- 장소: ${input.placeId} — setting에 이 영단어를 그대로 포함한다. 장소 때문에 원문의 사건을 바꾸지 않는다.` : '',
    '',
    '스키마 (기존 panels·endingBeat에 더해):',
    '{"topic": "짧은 제목 — 원문 사건의 이름", "panels": [...], "endingBeat": en,',
    ' "provenance": {"sourceRanges": [{"panelNo": n, "startLine": n, "endLine": n}],',
    '  "preservedLines": [원문 그대로 살린 대사들], "omittedLines": [들어내진 원문 대사들],',
    '  "reconstructedLines": [{"output": "새 연결문", "basis": ["근거 원문 줄"]}] }}',
  ].filter(Boolean).join('\n');

  const numbered = utterances.map((u) => `${u.line}| ${u.speaker ?? '?'}: ${u.text.replace(/\n/g, ' / ')}`).join('\n');
  const user = [
    `대화 원문 (행번호| 화자: 발화):`, numbered, '',
    `화자 연결: ${Object.entries(input.speakerMap).map(([k, v]) => `${k}→${v}`).join(', ')}`,
    `컷 수: ${input.requestedPanelCount === 'auto' ? '자동 (4~8에서 적정 선택)' : input.requestedPanelCount}`,
    `보존 모드: ${input.preservationMode}`,
    input.titleHint ? `제목 힌트: ${input.titleHint}` : '',
    '이 대화를 웹툰 시나리오 JSON으로 각색하라.',
  ].filter(Boolean).join('\n');
  return { system, user };
}

/* ── 긴 원문 — 에피소드 후보 추출 프롬프트 (Test B) ── */
export const EPISODE_THRESHOLD = 120;   // 발화 수 기준 — 넘으면 한 편으로 만들지 않고 후보부터

export function buildEpisodePrompt(utterances: Utterance[]): { system: string; user: string } {
  return {
    system: [
      '너는 긴 실제 대화에서 만화 한 편이 될 수 있는 에피소드를 찾는 편집자다.',
      '새 사건을 만들지 않는다 — 이미 있었던 순간 중에서 고른다.',
      '출력은 JSON 하나: {"episodes": [{"title": "짧은 제목", "startLine": n, "endLine": n, "why": "한 줄"}]} — 2~4개.',
    ].join('\n'),
    user: utterances.map((u) => `${u.line}| ${u.speaker ?? '?'}: ${u.text.replace(/\n/g, ' / ').slice(0, 120)}`).join('\n')
      + '\n\n이 대화에서 에피소드 후보를 추출하라.',
  };
}
