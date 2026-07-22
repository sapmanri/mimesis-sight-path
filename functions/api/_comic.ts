// BUILD 434-COMIC — BYEOLI Comic Lab의 심장: 중간 산출물 계약
//
// 홈즈 설계(2026-07-22 자정)의 핵심 문장: "가장 중요한 건 새 UI가 아니라 중간 산출물
// 계약이다. 이 스키마만 안정적으로 고정하면, 뒤의 이미지 모델은 교체할 수 있다."
//
// 흐름:  주제 + 컷 수 → 게놈 시나리오(LLM) → ComicScenario(이 계약) → 컷별 이미지 → 조립
//
// 규약:
//  - 시각 필드(location/shot/subject/action/expression/ppaekong)는 영어 — 이미지 모델 경계
//    전면 영어 원칙 (한글은 그림으로 취급된다 — 선봇못대 실사례)
//  - caption/dialogue는 한국어 반말 — 이미지에 넣지 않고 조립 단계에서 진짜 폰트로 얹는다
//  - 별이는 말이 적다: dialogue는 대부분 null, caption이 주 언어다

export interface ComicPanel {
  index: number;                 // 1부터
  location: string;              // EN — bedroom, alley, office desk...
  shot: 'wide' | 'medium' | 'close' | 'back';
  subject: string;               // EN — 이 컷이 바라보는 것
  action: string;                // EN — 별이가 무엇을 하는가 (물리 필연 동사 권장)
  expression: string;            // EN — CH02 표정 어휘 계열 (sleepy, curious, calm...)
  ppaekong: string | null;       // EN — 빼콩이가 뭘 하는가. null이면 이 컷에 없음
  dialogue: string | null;       // KO 반말 — 말풍선. 드물게만
  caption: string | null;        // KO 반말 — 컷 아래 서술
}

export interface ComicScenario {
  title: string;                 // KO — 짧게
  theme: string;                 // 입력 주제 원문
  panelCount: 4 | 6 | 8;
  panels: ComicPanel[];
}

export const PANEL_COUNTS = [4, 6, 8] as const;
export const SHOTS = ['wide', 'medium', 'close', 'back'] as const;

/** 시나리오 구조 검증 — LLM 출력은 계약을 통과해야만 다음 단계로 간다. */
export function validateScenario(x: unknown): string[] {
  const errs: string[] = [];
  if (typeof x !== 'object' || x === null) return ['not an object'];
  const s = x as Partial<ComicScenario>;
  if (!s.title || typeof s.title !== 'string') errs.push('title required');
  if (!PANEL_COUNTS.includes(s.panelCount as 4)) errs.push(`panelCount must be ${PANEL_COUNTS.join('|')}`);
  if (!Array.isArray(s.panels)) return [...errs, 'panels must be an array'];
  if (s.panels.length !== s.panelCount) errs.push(`panels length ${s.panels.length} != panelCount ${s.panelCount}`);
  s.panels.forEach((p, i) => {
    const at = `panels[${i}]`;
    if (p.index !== i + 1) errs.push(`${at}.index must be ${i + 1}`);
    if (!p.location) errs.push(`${at}.location required`);
    if (!SHOTS.includes(p.shot as 'wide')) errs.push(`${at}.shot must be ${SHOTS.join('|')}`);
    if (!p.subject) errs.push(`${at}.subject required`);
    if (!p.action) errs.push(`${at}.action required`);
    if (!p.expression) errs.push(`${at}.expression required`);
    // 시각 필드에 한글이 섞이면 이미지 모델이 글자를 그린다 — 계약 위반으로 잡는다
    for (const [k, v] of [['location', p.location], ['shot', p.shot], ['subject', p.subject], ['action', p.action], ['expression', p.expression], ['ppaekong', p.ppaekong]] as const) {
      if (typeof v === 'string' && /[가-힣]/.test(v)) errs.push(`${at}.${k} must be English (korean found)`);
    }
    // 별이는 말이 적다 — 대사가 모든 컷에 있으면 별이답지 않다
  });
  const talky = s.panels.filter((p) => p.dialogue && p.dialogue.trim()).length;
  if (talky > Math.ceil(s.panels.length / 2)) errs.push('too much dialogue: 별이는 말이 적다 (대사는 절반 이하)');
  return errs;
}

/* ── Style Lock — 공식 바이블 5장 (서버 고정, 매번 업로드하지 않는다) ── */

export const STYLE_LOCK_VERSION = 'style-lock-v1';
/** sketch-reference에 이 이름들로 업로드하면 Comic Lab이 자동 장착한다. */
export const STYLE_LOCK_NAMES = ['ch00_master', 'ch01_turnaround', 'ch02_expression', 'ch03_pose', 'ch04_hair'] as const;

/**
 * 컷별 참조 선택 — 어댑터 상한에 맞춰 결정론으로 고른다.
 * Master·Hair·Pose 상시 + (뒷모습 컷이면 Turnaround, 아니면 Expression).
 * GPT 이미지는 5장 다 받을 수 있어 그대로, flux는 4장 상한이라 이 규칙이 필요하다.
 */
export function pickStyleRefs(shot: ComicPanel['shot'], max: number): string[] {
  const ordered = shot === 'back'
    ? ['ch00_master', 'ch04_hair', 'ch03_pose', 'ch01_turnaround', 'ch02_expression']
    : ['ch00_master', 'ch04_hair', 'ch03_pose', 'ch02_expression', 'ch01_turnaround'];
  return ordered.slice(0, Math.max(1, max));
}

/* ── 컷 프롬프트 — 바이블의 문장 번역 (그림체는 시트가, 장면은 명세가) ── */

const COMIC_STYLE_EN = [
  'hand-drawn children\'s picture-book style matching the reference sheets exactly',
  'uniform navy outline, flat single-color fills, paper texture',
  'hair is one flat dark shape with a fixed silhouette — no strands, no highlights',
  'palette: #111111, #A7ACCC, #FFE3B3, #FFD1C8, #FAF7F2',
  'simple shapes, soft curves, warm and quiet',
  'one single comic panel, no panel borders, no text anywhere in the image',
].join(', ');

const SHOT_EN: Record<ComicPanel['shot'], string> = {
  wide: 'wide shot, small figure in a large quiet space',
  medium: 'medium shot, waist-up or full body',
  close: 'close-up on the subject, the girl partially visible',
  back: 'seen from behind',
};

/** 컷 하나의 이미지 프롬프트. dialogue/caption은 절대 넣지 않는다 — 글자는 조립 단계의 몫. */
export function buildPanelPrompt(p: ComicPanel): string {
  return [
    `Scene: ${p.location}. ${SHOT_EN[p.shot]}.`,
    `The girl (same child as in the reference sheets): ${p.action}. Expression: ${p.expression}.`,
    p.ppaekong ? `The white cat: ${p.ppaekong}.` : 'The white cat is not in this panel.',
    `Focus: ${p.subject}.`,
    `Style: ${COMIC_STYLE_EN}.`,
  ].join('\n');
}

/* ── 원샷 페이지 프롬프트 (제미나이 페이지 모드) ──────────────────
   실증(2026-07-22): 제미나이는 한 장에 N컷 + 한글 텍스트를 일관성 있게 그린다.
   "한글은 그림으로 취급된다"는 flux의 규칙이었다 — 여기선 오탈자 검사로 대체된다.
   레이아웃은 CH05 PANEL BIBLE이 오기 전까지 기본 격자. */

const PAGE_GRID: Record<number, string> = {
  4: '2 rows of 2 panels',
  6: '3 rows of 2 panels',
  8: '2 rows of 4 panels',
};

export function buildPagePrompt(s: ComicScenario): string {
  const lines: string[] = [
    `A single Korean webtoon page with exactly ${s.panelCount} panels, arranged in ${PAGE_GRID[s.panelCount]}.`,
    `Match the character design, hair, palette and line style of the reference sheets exactly — same girl, same white cat.`,
    `Page design: warm paper background, thin navy panel borders, small header reading "BYEOLI WEBTOON" and the chapter title "${s.title}".`,
    `Render all Korean text exactly as written below, letter-perfect, in a clean friendly hand-lettered style.`,
    '',
  ];
  for (const p of s.panels) {
    lines.push(`Panel ${p.index}: ${p.location}, ${p.shot} shot. The girl: ${p.action}, expression ${p.expression}.`
      + (p.ppaekong ? ` The white cat: ${p.ppaekong}.` : ' The white cat is not in this panel.')
      + ` Focus: ${p.subject}.`);
    if (p.dialogue) lines.push(`  Speech bubble (Korean, exact): "${p.dialogue}"`);
    if (p.caption) lines.push(`  Caption box (Korean, exact): "${p.caption}"`);
  }
  lines.push('', 'No text other than the specified Korean lines and the header.');
  return lines.join('\n');
}

/* ── 게놈 시나리오 시스템 프롬프트 — 별이답음의 계약 ── */

export const SCENARIO_SYSTEM = `너는 '별이'의 하루를 4~8컷 그림일기로 구성하는 작가다. 별이의 게놈:
- 별이는 5살 여자아이. 작은 것들을 오래 바라보는 아이. 조용하고 관찰력이 좋다.
- 흰 고양이 빼콩이와 함께 산다. 빼콩이는 말보다 마음을 먼저 알아차린다.
- 별이는 결론을 내리지 않는다. 판단하지 않는다. 감정을 이름 붙이지 않는다 — 본 것을 남길 뿐.
- 말이 적다. 대사는 드물고 짧다. 대부분은 캡션(관찰의 문장)이다.
- 극적인 사건을 지어내지 않는다. 주제 안의 작은 순간 하나를 천천히 따라간다.

출력 규칙 (어기면 실패):
- JSON 하나만 출력한다. 마크다운·설명 금지.
- 시각 필드(location/shot/subject/action/expression/ppaekong)는 반드시 영어.
  action은 몸이 그렇게 될 수밖에 없는 구체 동사로 (crouching to look at..., picking up...).
- caption/dialogue는 한국어 반말, 짧고 담담하게. "~요/~습니다" 금지.
- dialogue는 전체 컷의 절반 이하, 대부분 null. caption도 모든 컷에 있을 필요 없다.
- 마지막 컷은 결론이 아니라 여운 — 별이는 정리하지 않는다.

스키마:
{"title": string, "theme": string, "panelCount": 4|6|8,
 "panels": [{"index": n, "location": en, "shot": "wide|medium|close|back",
   "subject": en, "action": en, "expression": en, "ppaekong": en|null,
   "dialogue": ko|null, "caption": ko|null}]}`;
