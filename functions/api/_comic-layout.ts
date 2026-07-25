// 여백섬 컷별 파이프라인 — 중간 산출물 계약 (홈즈 판정 2026-07-26 01:06, 릴레이 회차3)
//
//   Story → Page Context → Layout Plan → Panel Generation(개별) → Assembly → Typography → Export
//
// 왜 이 파일이 먼저인가: 여백섬은 세 번 시도해서 세 번 다 둥근 사각형 마스크가 나왔다.
// 배선은 정상이었다(경고 없음). 실패는 **생성 단위**에 있었다 — 제미나이가 한 캔버스에
// 6칸 웹툰을 그리는데, 모델이 아는 "웹툰 페이지"는 네모 칸이다. 참조 그림은 웹툰이 아니라
// **삽화 한 장**이었다. 그래서 컷을 따로 그리고 우리가 조립한다.
//
// 홈즈 통찰: "바이블들은 참조 자료가 아니라, 컷을 따로 생성해도 같은 작품으로 보이게 하는
//            조립식 생성 엔진의 접착제였다."
//
// ⚖ 이 계약은 Philosophy Bible(`_philosophy.ts`) 아래에 있다. Layout·Camera는 하위 바이블이므로
//   여기 규칙이 철학과 충돌하면 철학이 이긴다. 홈즈의 최상위 QC 항목도 그래서 마지막에 온다:
//   **"caption을 전부 지워도 각 컷의 사건과 페이지 흐름이 남는가."**

import { PAGE_COLUMNS, pageRowsOf, type ComicScenario, type PanelBibleMode } from './_comic.ts';
import { generateScenarioText, extractJson, type ComicLlmEnv } from './_comic-llm.ts';

/* ── 두 축을 가른다 (홈즈 판정 4) ────────────────────────────────
   `grid/organic/none`은 **레이아웃 문법**이고 `page/panels`는 **렌더 방식**이다.
   panelMode 하나에 렌더 경로까지 겹쳐 실으면 축이 섞인다.

   ⚠ 그리고 지금 코드의 진짜 버그: `provider === 'gemini' ? 'page' : 'panels'` —
     **provider가 경로를 정하고 있었다.** provider는 각 경로 안의 어댑터일 뿐이다. */

/** 레이아웃 문법 — 페이지의 공간 언어. `PanelBibleMode`와 같은 값(별칭). */
export type LayoutMode = PanelBibleMode;
/** 렌더 방식 — 한 캔버스에 원샷인가, 컷별로 그려 조립하는가. */
export type RenderMode = 'page' | 'panels';
export type RenderModeRequest = RenderMode | 'auto';

/**
 * 조립 경로(panels)는 아직 서지 않았다 — Layout Plan → 컷별 생성 → Assembly가 다 있어야 한다.
 * 그때까지 `organic + auto`는 **page로 남긴다.** 없는 길로 자동으로 보내면 여백섬이 통째로 죽는다.
 *
 * 조립이 서면 이 상수 하나를 `'panels'`로 바꾸면 된다. 그 전에도 `renderMode: 'panels'`를
 * **명시하면** 새 경로로 갈 수 있다 — 개발·검증용 문은 열어 둔다(조용히 막지 않는다).
 */
export const ORGANIC_AUTO_RENDER: RenderMode = 'page';

/**
 * 두 축 → 실제 렌더 경로. 저장 메타에는 **해석이 끝난 값**을 기록해야 한다(홈즈).
 * 나중에 "그때 무엇으로 그렸나"를 추측하지 않으려면 결과를 남겨야 한다.
 */
export function resolveRenderMode(layout: LayoutMode, requested: RenderModeRequest = 'auto'): RenderMode {
  if (requested !== 'auto') return requested;
  if (layout === 'organic') return ORGANIC_AUTO_RENDER;
  return 'page';   // grid·none — 격자 원샷은 실물이 잘 나온다(#015·#016). 잘 되는 걸 없애지 않는다.
}

/* ── Page Context — 컷을 따로 그려도 한 페이지로 묶는 접착제 ──────────
   홈즈 판정 1: **시나리오 LLM이 함께 쓰게 하지 마라.**
   `ComicScenario`는 "무엇이 일어나는가"의 정본이고 pageContext는 "어떤 빛·공간·시간으로
   이어지는가"의 생성 문맥이다. 한 호출로 섞으면 Story보다 Camera/Layout이 앞서는 역전이
   생기고 **Philosophy → Story → Episode 순서가 흐려진다.**
   → 시나리오 확정 후 별도 planner가 만들고, 한 번 확정되면 `comic_meta`에 영속화해 재사용한다.
     결정론은 "같은 호출에서 나왔는가"가 아니라 **"확정된 문맥을 다시 만들지 않는가"**로 보장된다. */

export interface PageContext {
  version: 'page-context-v1';
  timeOfDay: string;        // EN — late afternoon, blue hour...
  weather: string;          // EN
  lightDirection: string;   // EN — low sun from the left...
  palette: string[];        // hex — 페이지 공통 색
  spatialAnchors: string[]; // EN — 컷들이 공유하는 공간 기준물 (담장, 창틀...)
  continuityNotes: string;  // EN — 한 페이지로 읽히게 하는 메모
}

/**
 * pageContext planner 프롬프트 — **시나리오와 같은 호출로 섞지 않는다**(홈즈 판정 1).
 *
 * 여기서 Story를 다시 쓰게 하면 안 된다. 이 단계는 이미 확정된 사건 위에 **빛과 공간만**
 * 얹는다. 그래서 프롬프트가 첫 줄부터 "사건을 바꾸지 마라"로 시작한다.
 */
export const PAGE_CONTEXT_SYSTEM = `You establish the shared visual context for one page of a hand-drawn children's picture diary.

The story is ALREADY DECIDED. You do not change it, add events, or reinterpret it.
Your only job: decide the light, time, weather and space that all panels of this page share,
so that panels drawn separately still read as one page.

Rules:
- Output ONE JSON object only. No markdown, no commentary.
- Every value is ENGLISH. Korean characters are forbidden (the image model would draw them as glyphs).
- palette: 3~5 hex colors (#rrggbb), warm and quiet, consistent with a soft picture-book.
- spatialAnchors: physical things that recur across panels and anchor the space (a low wall, a window frame).
  These are what make separate drawings feel like one place. Prefer things already implied by the panels.
- continuityNotes: one or two sentences a painter would need to keep panels continuous.
- Keep it quiet. This is a page about looking at a small thing for a long time, not a dramatic scene.

Schema:
{"version":"page-context-v1","timeOfDay":en,"weather":en,"lightDirection":en,
 "palette":["#rrggbb",...],"spatialAnchors":[en,...],"continuityNotes":en}`;

/** planner 유저 프롬프트 — 확정된 시나리오를 사실로만 넘긴다. */
export function pageContextUserPrompt(s: Pick<ComicScenario, 'title' | 'theme' | 'panels'>): string {
  const lines = s.panels.map((p) =>
    `${p.index}. ${p.location} · ${p.shot} · ${p.subject} — ${p.action}`).join('\n');
  return `Page title: ${s.title}\nTheme: ${s.theme}\n\nPanels (already decided — do not change):\n${lines}\n\n`
    + `Give the shared page context as JSON.`;
}

export function validatePageContext(x: unknown): string[] {
  const errs: string[] = [];
  if (typeof x !== 'object' || x === null) return ['not an object'];
  const c = x as Partial<PageContext>;
  if (c.version !== 'page-context-v1') errs.push('version must be page-context-v1');
  for (const k of ['timeOfDay', 'weather', 'lightDirection', 'continuityNotes'] as const) {
    if (!c[k] || typeof c[k] !== 'string') errs.push(`${k} required`);
    // 시각 필드는 영어 — 이미지 모델 경계 전면 영어 원칙 (한글은 그림으로 취급된다)
    else if (/[가-힣]/.test(c[k] as string)) errs.push(`${k} must be English (korean found)`);
  }
  if (!Array.isArray(c.palette) || !c.palette.length) errs.push('palette must be a non-empty array');
  else if (!c.palette.every((p) => /^#[0-9a-fA-F]{6}$/.test(p))) errs.push('palette entries must be #rrggbb');
  if (!Array.isArray(c.spatialAnchors)) errs.push('spatialAnchors must be an array');
  return errs;
}

/**
 * 시나리오 → pageContext. **두 번째 호출이다** — 시나리오 두뇌와 같은 어댑터를 쓰되
 * 프롬프트를 갈아끼워 부른다(`ScenarioPrompts` 오버라이드).
 *
 * 실패는 에러로 돌려준다. 지어내지 않는다 — 빈 문맥으로 그리면 컷들이 따로 논다는 것이
 * 애초에 이 단계가 생긴 이유다. 호출자가 "문맥 없이 갈지"를 정하게 한다.
 */
export async function planPageContext(
  env: ComicLlmEnv,
  s: Pick<ComicScenario, 'title' | 'theme' | 'panels'>,
): Promise<{ context: PageContext; model: string; provider: string } | { error: string }> {
  const out = await generateScenarioText(env, '', 0, {
    system: PAGE_CONTEXT_SYSTEM,
    user: pageContextUserPrompt(s),
  });
  if ('error' in out) return { error: `page_context_llm: ${out.error}` };
  const parsed = extractJson(out.text);
  if (!parsed) return { error: 'page_context_unparsable' };
  const errs = validatePageContext(parsed);
  if (errs.length) return { error: `page_context_invalid: ${errs.join(' / ')}` };
  return { context: parsed as PageContext, model: out.model, provider: out.provider };
}

/**
 * 컷 프롬프트에 붙일 공통 문맥 한 덩어리.
 * 홈즈: *"바이블들은 참조 자료가 아니라, 컷을 따로 생성해도 같은 작품으로 보이게 하는
 * 조립식 생성 엔진의 접착제였다."* — 이 문자열이 그 접착제의 문장판이다.
 */
export function pageContextClause(c: PageContext): string {
  return [
    `Page context (identical for every panel of this page — do not vary):`,
    `time of day: ${c.timeOfDay}. weather: ${c.weather}. light: ${c.lightDirection}.`,
    `palette: ${c.palette.join(', ')}.`,
    c.spatialAnchors.length ? `recurring spatial anchors: ${c.spatialAnchors.join('; ')}.` : '',
    c.continuityNotes,
  ].filter(Boolean).join(' ');
}

/* ── Layout Plan — 자리와 넘침 권한. 섬의 윤곽은 생성이 만든다 ──────── */

export interface Rect { x: number; y: number; w: number; h: number }

export interface LayoutPanel {
  index: number;
  /** 이 컷이 차지하는 논리 셀 — 조립·분절이 이 좌표로 자른다(이미지 추정 크롭이 아니라). */
  cell: Rect;
  /** 섬이 머물러야 하는 안전 영역. 이 밖으로 나가는 일반 그림은 조립기가 반려한다. */
  islandSafeBox: Rect;
  /** 섬 아래 흰 여백의 캡션 자리. `h`가 반드시 있어야 한다(홈즈) — 줄바꿈 검사 축이다. */
  captionBox: Rect | null;
  /**
   * 넘침은 boolean 하나로 부족하다(홈즈): **무엇이 어느 방향으로** 나올 수 있는지까지 가져야
   * "명시적으로 지정된 대상만 넘친다"는 현재 계약을 지킬 수 있다.
   */
  overflow: { allowed: boolean; subject?: string; edges?: Array<'top' | 'right' | 'bottom' | 'left'> };
  zIndex: number;
}

export interface LayoutPlan {
  version: 'layout-plan-v1';
  canvas: { width: number; height: number; padding: number };
  /** 제목·에피그래프 자리. 예약하지 않으면 첫 섬과 충돌한다(홈즈). */
  headerBox: Rect;
  readingOrder: number[];
  panels: LayoutPanel[];
}

export const LAYOUT_CANVAS = { width: 2160, height: 2700, padding: 96 };  // 4:5 — 인스타 세로
const HEADER_H = 300;
const CAPTION_H = 132;
const GUTTER = 72;

/**
 * 시나리오 + 캔버스 → 자리표. **순수 함수다** — 같은 입력이면 같은 좌표가 나온다.
 *
 * 섬의 불규칙한 윤곽은 여기서 정하지 않는다(그건 생성의 몫). 여기서 정하는 건
 * **자리·읽기 순서·캡션 칸·넘침 권한**뿐이다. Layout이 Generation 앞에 와야 하는 이유는
 * 섬의 윤곽이 **이웃을 알아야** 정해지고, 어느 컷이 넘칠지도 그리기 전에 정해지기 때문이다.
 */
export function planLayout(
  s: Pick<ComicScenario, 'panelCount' | 'panels'>,
  canvas = LAYOUT_CANVAS,
  overflowSubject: { index: number; subject: string; edges?: LayoutPanel['overflow']['edges'] } | null = null,
): LayoutPlan {
  const rows = pageRowsOf(s.panelCount);
  const headerBox: Rect = { x: canvas.padding, y: canvas.padding, w: canvas.width - canvas.padding * 2, h: HEADER_H };
  const gridTop = headerBox.y + headerBox.h + GUTTER;
  const gridH = canvas.height - gridTop - canvas.padding;
  const cellW = (canvas.width - canvas.padding * 2 - GUTTER * (PAGE_COLUMNS - 1)) / PAGE_COLUMNS;
  const cellH = (gridH - GUTTER * (rows - 1)) / rows;

  const panels: LayoutPanel[] = s.panels.map((p, i) => {
    const row = Math.floor(i / PAGE_COLUMNS);
    const col = i % PAGE_COLUMNS;
    // 홀수 컷의 마지막 한 장은 가운데로 — 2단을 유지하면서 외톨이가 왼쪽에 붙지 않게
    const lonely = s.panelCount % PAGE_COLUMNS === 1 && i === s.panelCount - 1;
    const x = lonely
      ? (canvas.width - cellW) / 2
      : canvas.padding + col * (cellW + GUTTER);
    const cell: Rect = { x, y: gridTop + row * (cellH + GUTTER), w: cellW, h: cellH };
    const hasCaption = !!(p.caption && p.caption.trim());
    const captionBox: Rect | null = hasCaption
      ? { x: cell.x, y: cell.y + cell.h - CAPTION_H, w: cell.w, h: CAPTION_H }
      : null;
    // 섬은 캡션 자리를 침범하지 않는다 — 섬+캡션이 하나의 panel unit이라야 분절이 성립한다
    const islandSafeBox: Rect = { x: cell.x, y: cell.y, w: cell.w, h: cell.h - (hasCaption ? CAPTION_H : 0) };
    const isOverflow = overflowSubject?.index === p.index;
    return {
      index: p.index,
      cell,
      islandSafeBox,
      captionBox,
      overflow: isOverflow
        ? { allowed: true, subject: overflowSubject!.subject, edges: overflowSubject!.edges ?? ['right'] }
        : { allowed: false },
      zIndex: isOverflow ? 2 : 1,   // 넘치는 컷이 위로 — 이웃 섬에 가리지 않게
    };
  });

  return {
    version: 'layout-plan-v1',
    canvas,
    headerBox,
    readingOrder: panels.map((p) => p.index),
    panels,
  };
}

/** 자리표 검증 — 겹침·이탈·읽기 순서. 조립 전에 잡는다. */
export function validateLayoutPlan(plan: LayoutPlan): string[] {
  const errs: string[] = [];
  if (plan.version !== 'layout-plan-v1') errs.push('version must be layout-plan-v1');
  const { width, height } = plan.canvas;
  // 읽기 순서와 index가 같아야 한다 (홈즈 QC 항목)
  if (plan.readingOrder.join(',') !== plan.panels.map((p) => p.index).join(',')) {
    errs.push('readingOrder must match panel index order');
  }
  for (const p of plan.panels) {
    const c = p.cell;
    if (c.x < 0 || c.y < 0 || c.x + c.w > width + 0.01 || c.y + c.h > height + 0.01) {
      errs.push(`panel ${p.index}: cell escapes canvas`);
    }
    if (c.y < plan.headerBox.y + plan.headerBox.h) errs.push(`panel ${p.index}: cell collides with headerBox`);
    if (p.captionBox && p.captionBox.h <= 0) errs.push(`panel ${p.index}: captionBox.h must be > 0`);
    if (p.overflow.allowed && !p.overflow.subject) errs.push(`panel ${p.index}: overflow.allowed requires a subject`);
  }
  // 셀끼리 겹치면 섬이 서로를 침범한다
  for (let i = 0; i < plan.panels.length; i++) {
    for (let j = i + 1; j < plan.panels.length; j++) {
      const a = plan.panels[i].cell, b = plan.panels[j].cell;
      const hit = a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
      if (hit) errs.push(`panels ${plan.panels[i].index}/${plan.panels[j].index}: cells overlap`);
    }
  }
  return errs;
}
