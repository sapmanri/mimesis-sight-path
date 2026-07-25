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
  title: string;                 // KO — 주제의 반복이 아니라 "기억의 이름" (컷을 다 구상한 뒤 짓는다)
  epigraph: string;              // KO 한 줄 — 제목 아래, 그 하루를 기억하게 하는 문장
  theme: string;                 // 입력 주제 원문
  panelCount: number;            // 1~12 (4/6/8은 UI 프리셋일 뿐)
  panels: ComicPanel[];
}

export const PANEL_COUNTS = [4, 6, 8] as const;   // UI 프리셋
export const PANEL_COUNT_MIN = 1;
export const PANEL_COUNT_MAX = 12;
export const SHOTS = ['wide', 'medium', 'close', 'back'] as const;

/**
 * 주제문에서 쌍따옴표로 묶인 조각을 뽑는다 — 작가가 "이건 대사다"라고 지정한 것들.
 *
 * 실사고 (2026-07-25, Vase): 주제에 `"어두워졌다"` 한 줄 남기고…` 라고 넣었더니
 * 그 문장이 말풍선이 아니라 **캡션**으로 나왔다. 프롬프트에 "쌍따옴표=대사" 규칙이
 * 아예 없었기 때문이다. 별이는 말이 적다는 게놈 때문에 모델이 기본값(caption)으로 보낸 것.
 * → 작가가 명시한 대사는 게놈 기본값보다 우선한다.
 *
 * 곧은 따옴표와 굽은 따옴표(“ ”)를 모두 인정한다.
 */
export function extractQuotedLines(theme: string): string[] {
  if (!theme) return [];
  const out: string[] = [];
  for (const m of theme.matchAll(/["“]([^"“”]{1,40})["”]/g)) {
    const line = m[1].trim();
    if (line) out.push(line);
  }
  return out;
}

/**
 * 시나리오 구조 검증 — LLM 출력은 계약을 통과해야만 다음 단계로 간다.
 *
 * @param explicitDialogueCount 작가가 주제문에 쌍따옴표로 직접 지정한 대사 수.
 *   "대사는 절반 이하" 규칙은 별이다움의 기본값이지, 작가의 명시 지시를 덮는 규칙이 아니다.
 *   지정한 만큼은 통과시킨다.
 */
export function validateScenario(x: unknown, explicitDialogueCount = 0): string[] {
  const errs: string[] = [];
  if (typeof x !== 'object' || x === null) return ['not an object'];
  const s = x as Partial<ComicScenario>;
  if (!s.title || typeof s.title !== 'string') errs.push('title required');
  if (!s.epigraph || typeof s.epigraph !== 'string') errs.push('epigraph required (제목 아래 한 줄)');
  if (!Number.isInteger(s.panelCount) || (s.panelCount as number) < PANEL_COUNT_MIN || (s.panelCount as number) > PANEL_COUNT_MAX) {
    errs.push(`panelCount must be integer ${PANEL_COUNT_MIN}~${PANEL_COUNT_MAX}`);
  }
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
  const allowed = Math.max(Math.ceil(s.panels.length / 2), explicitDialogueCount);
  if (talky > allowed) errs.push('too much dialogue: 별이는 말이 적다 (대사는 절반 이하)');
  return errs;
}

/* ── Style Lock — 공식 바이블 5장 (서버 고정, 매번 업로드하지 않는다) ── */

export const STYLE_LOCK_VERSION = 'style-lock-v1';
/** sketch-reference에 이 이름들로 업로드하면 Comic Lab이 자동 장착한다. */
export const STYLE_LOCK_NAMES = ['ch00_master', 'ch01_turnaround', 'ch02_expression', 'ch03_pose', 'ch04_hair', 'ch05_panel', 'ch06_panel_organic'] as const;
/** 필수 5장 — 패널 바이블(ch05/ch06)은 선택. */
export const STYLE_LOCK_REQUIRED = STYLE_LOCK_NAMES.slice(0, 5);

/**
 * 패널 바이블 2종 — 홈즈 설계 2026-07-25 (Vase 제안: "네모네모 말고 배경 덩어리, 가끔 밖으로 나오는 애도").
 *
 * 두 바이블은 **페이지의 공간 문법만** 소유한다. 컷 수는 scenario가, 캐릭터 외형은 Identity Lock이,
 * 그림체는 Style Lock이 소유한다 (S-04의 Lock 3분리).
 *
 *  - grid    「격자 프레임」  네모 칸·외곽선·칸 아래 캡션. 대화·병렬 비교·순서가 분명해야 할 때.
 *  - organic 「여백섬」      흰 종이 위 유기적 배경 덩어리. 테두리선 없음, 덩어리 가장자리가 곧 경계.
 *                           승인된 한 주체만 그 경계 밖으로 나올 수 있다. 관찰·이동·흔적·침묵의 편.
 *
 * 상호 배타다. 물리 저장 키는 기존 자산을 잃지 않도록 `ch05_panel`을 그대로 두고 논리 이름만 grid로 맵핑.
 */
export type PanelBibleMode = 'none' | 'grid' | 'organic';
export const PANEL_BIBLE_SLOT: Record<Exclude<PanelBibleMode, 'none'>, string> = {
  grid: 'ch05_panel',
  organic: 'ch06_panel_organic',
};
export function isPanelBibleSlot(slot: string): boolean {
  return slot === PANEL_BIBLE_SLOT.grid || slot === PANEL_BIBLE_SLOT.organic;
}

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

/**
 * 페이지 격자 — **항상 2단**이다. 컷 수만 행 수를 바꾼다.
 *
 * 2026-07-25 정정: 8컷만 `2 rows of 4 panels`였다. 그런데 실물(#015 4컷, #016 6컷,
 * 「비 오는 아침」 4컷)은 전부 2단이고, 8컷만 4단이 되면 시각 언어가 어긋난다.
 * 게다가 인스타툰 분절(1080×1350, 4:5 세로)은 한 슬라이드에 2컷이 들어갈 때 맞는데
 * 4단짜리 행은 옆으로 길어 세로 슬라이드에 담기지 않는다.
 * → 2단 고정. 행 수 = ceil(panelCount / 2). 분절 슬라이드 수도 이 행 수와 같다.
 */
export const PAGE_COLUMNS = 2;

/** 컷 수 → 행 수. 분절 슬라이드 수이기도 하다 (한 슬라이드 = 한 행 = 2컷). */
export function pageRowsOf(panelCount: number): number {
  return Math.max(1, Math.ceil(panelCount / PAGE_COLUMNS));
}

function pageGridOf(panelCount: number): string {
  const rows = pageRowsOf(panelCount);
  if (panelCount === 1) return '1 single panel filling the page';
  if (panelCount % PAGE_COLUMNS === 0) return `${rows} rows of ${PAGE_COLUMNS} panels`;
  // 홀수 컷: 마지막 행만 1컷 (2단 유지)
  return `${rows} rows of ${PAGE_COLUMNS} panels, the last row holding a single panel`;
}

/**
 * 「여백섬」 문법 — 홈즈 설계 2026-07-25.
 * grid의 공통 문장("borrow frame borders, gutters and rhythm")을 여기 쓰면 안 된다.
 * `frame borders`가 모델에게 테두리를 다시 그리게 하므로 모드별로 문장을 완전히 가른다.
 */
const ORGANIC_GRAMMAR_EN = [
  'Use the panel-layout reference only as an ORGANIC WHITE-SPACE ISLAND grammar, never as story content or drawing style.',
  'Create exactly {panelCount} clearly separate scene islands on a pure white paper field, in the required reading order.',
  'Each island is one panel: it has no rectangular frame and no drawn border; the irregular painted edge of the background itself is the panel boundary.',
  'Fill each island with a coherent scene up to that soft, slightly worn edge.',
  'Keep generous clean white space between all islands, with no touching or overlap.',
  'Only an explicitly designated subject may extend beyond one island edge onto the white field, including its natural cast shadow, while remaining inside that panel\'s crop-safe region.',
  'Never let an overflow enter another island or obscure captions.',
  'The reference defines only island shape, spacing, boundary behavior and rhythm — never copy its characters, places, colors, style, or frame count.',
].join(' ');

export function buildPagePrompt(
  s: ComicScenario,
  opts: { panelLayoutRef?: boolean; panelMode?: PanelBibleMode; observationNo?: number; dateKst?: string } = {},
): string {
  // 무회귀: 옛 요청의 panelLayoutRef=true는 grid로 읽는다. 필드가 없으면 none.
  const mode: PanelBibleMode = opts.panelMode ?? (opts.panelLayoutRef ? 'grid' : 'none');
  const grid = mode === 'grid'
    ? 'following the panel layout, panel sizes and arrangement shown in the panel-layout reference image (the last reference image) — that image defines the frame design only, not the content'
    : mode === 'organic'
      ? ORGANIC_GRAMMAR_EN.replace('{panelCount}', String(s.panelCount))
      : `arranged in ${pageGridOf(s.panelCount)}`;
  const lines: string[] = [
    // 한국어 정확도 지시를 선두에, 한국어로 — 실측 검증된 기법 (2026-07-22 조사)
    `한국어 텍스트 정확하게 렌더링, 글자 왜곡 없음. Render every Korean text below with perfect accuracy — no invented or distorted glyphs.`,
    `A single Korean webtoon page with exactly ${s.panelCount} panels, ${grid}.`,
    // 실사고: 레이아웃 참조가 6칸이면 4컷 지시를 이겼다 — 칸 수 절대 우선 명시
    mode === 'organic'
      ? `The page must contain exactly ${s.panelCount} scene islands — count them. If the layout reference shows a different number of islands, borrow only its island silhouette language, spacing and rhythm; never copy its island count.`
      : `The page must contain exactly ${s.panelCount} panels — count them. If any layout reference shows a different number of frames, borrow only its border style, gutters and rhythm; never copy its frame count.`,
    // 실사고: 마지막 컷에 별이가 둘 — 수 못박기 (9차의 교훈, 페이지판)
    `In every panel there is exactly one girl — never two girls — and at most one white cat.`,
    `Match the character design, hair, palette and line style of the reference sheets exactly — same girl, same white cat.`,
    // 실사고(07-22 밤): 희미한 채색 → 별이 머리 듬성듬성. 부정문 대신 긍정 서술로 못박는다 (교훈 2)
    `Coloring: confident, fully saturated flat fills — every colored shape is filled completely edge to edge. Hair is one solid dark shape, fully filled with even color.`,
    // 홈즈 제목 체계(07-22): 콘텐츠의 제목이 아니라 "오늘의 기록"처럼 — AI 만화 티를 지운다
    // 도장 제거 (Vase 판정 2026-07-25 — v2는 07-23에 이미 뺐는데 v1에 남아 있었다):
    // 날짜·Observation # 는 페이지에 찍지 않는다. 번호는 테스트를 돌릴 때마다 올라가서
    // 페이지에 박히면 의미 없는 숫자가 되고, 날짜도 이 그림에 아무 뜻을 더하지 않는다.
    // 기록은 아카이브 메타의 몫이다.
    `Page design: warm paper like a page from a child's picture diary. Top-left, very small: "별이의 그림일기". Below it the title "${s.title}" written large. Under the title one small line: "${s.epigraph}".`,
    // 손글씨 — 디지털 조판 티가 나던 실사고
    `Every piece of text on this page is hand-lettered in a five-year-old child's careful, slightly wobbly handwriting — warm, uneven, pencil-like. Never digital or typeset fonts.`
      + (mode === 'organic'
        ? ' There are no panel borders anywhere on this page — the painted edge of each island is the only boundary.'
        : ' Panel borders may look hand-ruled.'),
    '',
  ];
  for (const p of s.panels) {
    lines.push(`Panel ${p.index}: ${p.location}, ${p.shot} shot. The girl: ${p.action}, expression ${p.expression}.`
      + (p.ppaekong ? ` The white cat: ${p.ppaekong}.` : ' The white cat is not in this panel.')
      + ` Focus: ${p.subject}.`);
    if (p.dialogue) lines.push(`  Speech bubble (Korean, exact): "${p.dialogue}"`);
    if (p.caption) {
      lines.push(mode === 'organic'
        // 홈즈 계약: 캡션은 섬 안이 아니라 **섬 바로 아래 흰 여백**에, 섬 너비 안에서 정렬.
        // 섬+캡션이 하나의 panel unit이라야 인스타툰 분절이 성립한다.
        ? `  Caption below this island, on the white field, aligned within the island's width, like a quiet observation label (Korean, exact): "${p.caption}"`
        : `  Caption box (Korean, exact): "${p.caption}"`);
    }
  }
  lines.push('', 'No text other than the specified Korean lines and the header.');
  return lines.join('\n');
}

/* ── 게놈 시나리오 시스템 프롬프트 — 별이답음의 계약 ── */

export const SCENARIO_SYSTEM = `너는 '별이'의 하루를 1~12컷 그림일기로 구성하는 작가다. 별이의 게놈:
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
- **주제문에 쌍따옴표로 묶인 말은 작가가 "이건 대사다"라고 지정한 것이다.**
  그 말은 반드시 해당 컷의 dialogue에 그대로 넣는다. caption으로 옮기지 마라 —
  옮기면 말풍선이 아니라 관찰문으로 그려져서 작가의 의도가 사라진다.
  이때만은 "대사는 절반 이하" 기본값보다 작가의 지정이 우선한다.
- 마지막 컷은 결론이 아니라 여운 — 별이는 정리하지 않는다.
- **제목은 마지막에 짓는다**: 컷을 모두 구상한 뒤, 주제의 반복이 아니라 마지막 컷 이후에
  남는 기억의 이름으로 (예: 주제 "비 오는 아침" → title "두 개가 만나면").
  웹툰이 제목을 설명하는 게 아니라, 제목이 웹툰을 기억하게 한다.
- epigraph: 제목 아래 붙는 반말 한 줄(20자 안팎) — 그 하루를 기억하게 하는 문장.

스키마:
{"title": string, "epigraph": string, "theme": string, "panelCount": 1~12 정수,
 "panels": [{"index": n, "location": en, "shot": "wide|medium|close|back",
   "subject": en, "action": en, "expression": en, "ppaekong": en|null,
   "dialogue": ko|null, "caption": ko|null}]}`;
