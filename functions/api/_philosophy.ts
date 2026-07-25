// PHILOSOPHY BIBLE v1.0 — 별이 세계관의 최상위 계약 (Constitution)
//
// 홈즈 판정 (2026-07-26, Vase 전달): 이 바이블은 **생성용이 아니라 판정용**이다.
// 프롬프트를 꾸미기 위한 참고 이미지가 아니라, 나머지 모든 바이블 위에 서는 계약이다.
//
//                       Constitution
//                    (Philosophy Bible)
//                            │
//     ┌──────┬──────┬────────┼────────┬──────┬──────┐
//   Story  Character Sentence Camera Layout  Wave  Expression
//
// 가장 중요한 규칙 (원문):
//   "생성된 결과가 아래 바이블들과 모두 일치하더라도, Philosophy Bible을 위반하면 폐기한다.
//    반대로, 카메라나 레이아웃이 조금 어긋났더라도, 철학이 살아 있다면 수정 대상으로 남긴다."
//   → `finalVerdict()`가 이 문장 하나를 코드로 옮긴 것이다. 이 함수가 이 파일의 존재 이유다.
//
// 이 바이블이 결정하지 '않는' 것: 그림체·카메라·색·말풍선·레이아웃. 그건 아래 바이블들의 몫이다.
// 이 바이블은 **왜 그리는가**만 소유한다.
//
// 시트는 다른 바이블들과 똑같이 **자기 칸**을 가진다 (Vase 지시 2026-07-26:
// "무조건 그냥 넣어버리지 말고, 다른 이미지 바이블들처럼 칸 만들어서 넣어라. 문제 생기면 뺄 수 있게 삭제도").
// → `philosophy_bible` 슬롯 · 그룹 `philosophy` · 업로드/교체/✕비우기 전부 기존 경로 그대로.
//
// ⚠ 다만 **기본 제외**다. 시트에는 다섯 약속의 삽화와 한글 라벨이 가득해서, 생성 참조로 실으면
//   모델이 그 글자와 그림을 '그릴 것'으로 오인한다(ORGANIC_WITH_REF_EN의 annotation 사고와 같은 계열).
//   철학은 그림이 아니라 **문장(PHILOSOPHY_PREAMBLE)과 판정(judgeByPhilosophy)**으로 흐른다.
//   칸의 [적용]을 켜야만 참조로 실린다 — 켜고 끄는 것도, 지우는 것도 Vase의 몫이다.

import type { ComicScenario } from './_comic.ts';

export const PHILOSOPHY_BIBLE_VERSION = 'philosophy-bible-v1.0';
/** 락 저장소 슬롯 — 다른 바이블과 같은 평평한 prefix. 한 칸(시트 한 장). */
export const PHILOSOPHY_SLOT = 'philosophy_bible';
export const PHILOSOPHY_SLOTS: readonly string[] = [PHILOSOPHY_SLOT];
/** 칸을 켜야만 이미지 참조로 실린다. 기본 꺼짐 — 이 바이블은 판정용이 먼저다. */
export const PHILOSOPHY_REF_DEFAULT = false;

/** 계층 — 세 에이전트(Claude·홈즈·Codex)가 같은 기준으로 움직이기 위한 단일 원본. */
export const BIBLE_HIERARCHY = {
  constitution: 'philosophy',
  /** 철학 아래. 서로 동급이며, 충돌하면 철학이 이긴다. */
  under: ['story', 'character', 'sentence', 'camera', 'layout', 'wave', 'expression'],
  /** 각 바이블이 답하는 질문 — 역할 경계. */
  owns: {
    philosophy: '왜 그리는가',
    story: '무엇을 그리는가',
    sentence: '어떻게 말하는가',
    camera: '어디를 보는가',
    layout: '어떻게 숨 쉬는가',
    wave: '어떻게 느끼는가',
    expression: '어떻게 반응하는가',
  },
} as const;

/**
 * 별이의 다섯 가지 약속 — 시나리오 시스템 프롬프트의 **맨 앞**에 붙는다.
 * 순서가 계약이다: Philosophy → Story → Episode. 게놈(무엇을)보다 철학(왜)이 먼저 온다.
 */
export const PHILOSOPHY_PREAMBLE = `[최상위 계약 — PHILOSOPHY BIBLE v1.0]
아래 다섯 약속은 다른 모든 규칙보다 우선한다. 카메라·레이아웃·문장 규칙과 충돌하면 이쪽이 이긴다.

1. 해결하지 않는다. 발견한다. — 별이는 문제를 풀지 않는다. 세상 속에서 작은 것을 발견한다.
2. 설명하지 않는다. 관찰한다. — 별이는 이유를 말하지 않는다. 보이는 것을 있는 그대로 바라본다.
3. 가르치지 않는다. 같이 본다. — 별이는 누군가에게 무엇을 알려주려 하지 않는다. 단지 함께 본다.
4. 슬퍼하지 않는다. 조용히 오래 바라본다. — 감정을 크게 표현하지 않는다.
5. 작은 것을 크게 만든다. — 작은 것 하나도 아주 중요한 것으로 여긴다. 그것이 이야기가 된다.

핵심 한 문장: 별이의 이야기는 거창한 사건이 아니라, 아주 작은 순간을 오래 바라보는 일이다.

지키는 태도: 겸손하게 본다 · 조용하게 말한다 · 필요할 때만 보여준다 · 독자가 느낄 시간을 남긴다.
하지 않는 것: 교훈을 주지 않는다 · 감정을 과장하지 않는다 · 설명을 길게 하지 않는다 · 불필요한 장치를 만들지 않는다.

패널을 보게 하지 말고, 장면을 보게 하라.`;

/**
 * 생성 후 QA에서 사람이 답해야 하는 질문 — 기계는 답할 수 없다.
 * 홈즈 원문: "질문은 기술이 아니라 철학이다."
 *
 * 이 배열이 비지 않는 것이 정직함의 조건이다. 아래 자동 표지는 문장 표면만 본다.
 * "작은 것이 정말 중심인가"·"멈춰 설 시간이 있는가"는 regex가 판정하는 척하면 안 된다(잔꾀 금지).
 */
export const PHILOSOPHY_QUESTIONS: readonly string[] = [
  '이 컷은 발견인가, 아니면 설명인가?',
  '이 문장은 관찰인가, 교훈인가?',
  '별이는 같이 보고 있는가, 가르치고 있는가?',
  '작은 것이 정말 이야기의 중심인가?',
  '독자가 멈춰 설 시간이 있는가?',
];

export type Promise5 = 1 | 2 | 3 | 4 | 5;

export interface PhilosophyFinding {
  promise: Promise5;
  /** 어디서 — panels[2].caption 처럼 실물을 가리킨다 (규칙 5: 실물을 보고 판단한다). */
  where: string;
  /** 잡힌 문장 원문. 사람이 이걸 읽고 최종 판정한다. */
  quote: string;
  why: string;
}

export interface PhilosophyJudgment {
  version: string;
  /** 자동 표지 기준. 사람이 뒤집을 수 있다 — 이건 판정문이지 판사가 아니다. */
  verdict: 'pass' | 'discard';
  findings: PhilosophyFinding[];
  questions: readonly string[];
}

/* ── 자동 표지 — 높은 정밀도, 낮은 재현율로 잡는다 ──────────────────
   흔한 반말 문장을 오탐하면 새벽에 멀쩡한 시나리오가 죽는다.
   그래서 "이건 누가 봐도 위반"인 표현만 잡고, 나머지는 사람 질문으로 넘긴다. */

/** 약속 2 — 이유를 말한다 = 관찰이 아니라 설명. */
const EXPLAINS = /왜냐하면|때문이[다야]|때문에|이유는|그런 이유로|덕분에/;
/**
 * 약속 3 — 교훈·명령·당위 = 가르치기.
 * `해야`만 보면 안 된다 — "여겨야 한다"·"봐야 한다"처럼 당위는 아무 동사에나 붙는다.
 * 그래서 어미 `~야 한다/해/하지/했다` 자체를 본다 (첫 판에서 "소중히 여겨야 한다"를 놓쳤다).
 */
const TEACHES = /[가-힣]야\s?(한다|해[.!]?$|하지|했다|지[.!]?$)|하지\s?말아야|해보자|하자[.!]?$|기억하자|잊지\s?마|명심|교훈|배웠다|알게\s?되었다|깨달았다/;
/** 약속 4 — 감정에 이름을 붙이거나 과장한다. */
const NAMES_EMOTION = /슬프|슬펐|외로[웠운]|외롭|기쁘|기뻤|행복[하했]|화가\s?났|눈물이|펑펑|너무너무|정말정말|참을\s?수\s?없/;
/** 약속 1 — 마지막 컷에서 매듭을 짓는다 = 발견이 아니라 해결. */
const CONCLUDES = /결국|마침내|드디어|그렇게\s?해서|해결[되했]|끝났다|다\s?끝/;
/** "설명을 길게 하지 않는다" — 문장 바이블은 짧고 담백하게를 요구한다. */
const CAPTION_MAX = 45;

function scan(text: string | null | undefined, where: string, out: PhilosophyFinding[]): void {
  const t = (text ?? '').trim();
  if (!t) return;
  if (EXPLAINS.test(t)) out.push({ promise: 2, where, quote: t, why: '이유를 말하고 있다 — 별이는 설명하지 않고 관찰한다' });
  if (TEACHES.test(t)) out.push({ promise: 3, where, quote: t, why: '가르치거나 교훈을 준다 — 별이는 같이 볼 뿐이다' });
  if (NAMES_EMOTION.test(t)) out.push({ promise: 4, where, quote: t, why: '감정에 이름을 붙이거나 과장한다 — 별이는 조용히 오래 바라본다' });
}

/**
 * 최상위 계약 판정. 시나리오 한 편을 다섯 약속으로 읽는다.
 *
 * 자동 표지가 하나도 없어도 `verdict: 'pass'`는 "기계가 잡을 것이 없었다"는 뜻이지
 * "철학이 살아 있다"는 뜻이 아니다. 그래서 `questions`는 pass에서도 항상 함께 나간다.
 */
export function judgeByPhilosophy(s: ComicScenario): PhilosophyJudgment {
  const findings: PhilosophyFinding[] = [];
  s.panels.forEach((p, i) => {
    scan(p.caption, `panels[${i}].caption`, findings);
    scan(p.dialogue, `panels[${i}].dialogue`, findings);
    const cap = (p.caption ?? '').trim();
    if (cap.length > CAPTION_MAX) {
      findings.push({
        promise: 2, where: `panels[${i}].caption`, quote: cap,
        why: `설명이 길다 (${cap.length}자 > ${CAPTION_MAX}) — 필요할 때만, 짧게 담백하게`,
      });
    }
  });
  scan(s.epigraph, 'epigraph', findings);
  // 약속 1은 마지막 컷에서만 본다 — 중간 컷의 '결국'은 매듭이 아니라 흐름일 수 있다.
  const last = s.panels[s.panels.length - 1];
  if (last) {
    for (const [k, v] of [['caption', last.caption], ['dialogue', last.dialogue]] as const) {
      const t = (v ?? '').trim();
      if (t && CONCLUDES.test(t)) {
        findings.push({
          promise: 1, where: `panels[${s.panels.length - 1}].${k}`, quote: t,
          why: '마지막 컷이 매듭을 짓는다 — 별이는 정리하지 않는다. 마지막은 결론이 아니라 여운이다',
        });
      }
    }
  }
  return {
    version: PHILOSOPHY_BIBLE_VERSION,
    verdict: findings.length ? 'discard' : 'pass',
    findings,
    questions: PHILOSOPHY_QUESTIONS,
  };
}

export type FinalVerdict = 'pass' | 'revise' | 'discard';

/**
 * **이 파일에서 가장 중요한 함수.** 홈즈의 "가장 중요한 규칙"을 그대로 옮긴 것이다.
 *
 *  - 철학 위반 → `discard`. 하위 바이블이 **전부 통과해도** 폐기다.
 *  - 철학 통과 + 하위 어긋남 → `revise`. 폐기가 아니라 **수정 대상으로 남긴다.**
 *
 * 즉 하위 바이블 오류는 결코 단독으로 폐기 사유가 되지 못한다. 이 비대칭이 계층의 전부다.
 */
export function finalVerdict(j: PhilosophyJudgment, lowerBibleErrors: readonly string[]): FinalVerdict {
  if (j.verdict === 'discard') return 'discard';
  return lowerBibleErrors.length ? 'revise' : 'pass';
}

/** 사람이 읽을 판정문 한 덩어리 — Lab 응답과 경고에 그대로 실린다(조용한 실패 금지). */
export function formatJudgment(j: PhilosophyJudgment, v: FinalVerdict): string {
  const head = v === 'discard'
    ? '⛔ 폐기 — 최상위 계약(Philosophy Bible) 위반'
    : v === 'revise'
      ? '✏️ 수정 대상 — 철학은 살아 있고 하위 바이블이 어긋났다 (폐기 아님)'
      : '✅ 자동 표지 없음 — 아래 다섯 질문은 사람이 답한다';
  const lines = j.findings.map((f) => `  · 약속${f.promise} ${f.where}: "${f.quote}" — ${f.why}`);
  return [head, ...lines, '  ' + PHILOSOPHY_QUESTIONS.join(' / ')].join('\n');
}
