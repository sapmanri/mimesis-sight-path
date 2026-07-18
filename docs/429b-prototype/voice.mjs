// VoiceContract v2 — 문학이 아니라 규칙.
// "사람이 읽기 위한 글보다, 생성기가 해석하기 쉬운 규칙에 더 가까워져야 한다" (Vase 판정)
//
// 핵심 분리:
//   포맷 제약(한 줄·이모지 금지·JSON 모양) = 생성기 소유. 매체의 문제이지 목소리가 아니다.
//   목소리 규칙(거리·속도·초점·감정·마무리·어투) = 계약 소유. 이것만 갈아끼우면 다른 작가가 된다.

export const CONTRACT_SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['voiceId', 'voicePack', 'date', 'rules', 'slotShifts'],
  properties: {
    voiceId: { type: 'string' },
    voicePack: { type: 'string' },
    date: { type: 'string' },
    rules: {
      type: 'object', additionalProperties: false,
      required: ['distance', 'tempo', 'focus', 'emotion', 'ending', 'speech', 'pronoun', 'sentenceLength', 'favoriteObjects', 'avoid'],
      properties: {
        distance: { type: 'string' },
        tempo: { type: 'string' },
        focus: { type: 'array', items: { type: 'string' } },      // 우선순위 순서
        emotion: { type: 'string' },
        ending: { type: 'string' },
        speech: { type: 'string' },                                // 반말 / 존댓말
        pronoun: { type: 'string' },                               // 1인칭 사용 정책
        sentenceLength: {
          type: 'object', additionalProperties: false, required: ['min', 'max'],
          properties: { min: { type: 'integer' }, max: { type: 'integer' } },
        },
        favoriteObjects: { type: 'array', items: { type: 'string' } },
        avoid: { type: 'array', items: { type: 'string' } },
      },
    },
    slotShifts: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: false,
        required: ['slot', 'slotShiftId', 'focusFirst', 'tempo'],
        properties: {
          slot: { type: 'string' }, slotShiftId: { type: 'string' },
          focusFirst: { type: 'string' }, tempo: { type: 'string' },
        },
      },
    },
  },
};

/* ── 계약 린트 — 에세이를 거부한다 ────────────────────────────────
   Vase 기준 예시가 통과선이다: "가까이 가지 않는다"(10자·3어절) / "천천히" / "열어둔다"
   v1이 만든 "느리게 걷다가 잠깐 멈추는, 관찰과 여백이 번갈아 오는 호흡"은 반드시 탈락해야 한다. */
export const LINT = { maxChars: 12, maxWords: 4, maxNounChars: 6, maxListLen: 6 };
const SIMILE = ['처럼', '듯', '마치', '같이'];   // v2.1: "멈춘 듯"이 새어나갔다 — 어말 '듯'까지 잡는다

/* v2.1 — 어휘를 닫는다. 1차 실행에서 focus가 대상 목록(홀씨·벤치…)으로 채워져
   favoriteObjects와 중복됐다. focus는 '무엇을 먼저 보는가'(지각 채널)이지 목록이 아니다.
   speech도 "혼잣말하지 않는다" 같은 행동 서술로 흘렀다 — 말단계는 닫힌 값이어야 한다. */
export const FOCUS_VOCAB = ['빛', '그림자', '소리', '움직임', '질감', '색', '온도', '거리', '사물', '수량', '위치', '감정'];
export const SPEECH_VOCAB = ['반말', '존댓말'];
export const PRONOUN_VOCAB = ['쓰지 않는다', '드물게 쓴다', '자유롭게 쓴다'];

function lintDirective(name, v, errs) {
  if (typeof v !== 'string' || !v.trim()) { errs.push(`${name}: 비어 있음`); return; }
  const s = v.trim();
  if (s.length > LINT.maxChars) errs.push(`${name}: ${s.length}자 (${LINT.maxChars}자 초과) — 규칙이 아니라 문장이다: "${s}"`);
  if (s.split(/\s+/).length > LINT.maxWords) errs.push(`${name}: ${s.split(/\s+/).length}어절 (${LINT.maxWords} 초과) — "${s}"`);
  if (/[,·…]/.test(s)) errs.push(`${name}: 쉼표/말줄임 — 절이 이어지면 규칙이 아니다: "${s}"`);
  for (const m of SIMILE) if (s.includes(m)) errs.push(`${name}: 비유 표현("${m}") — 계약은 묘사하지 않는다: "${s}"`);
}
function lintNounList(name, arr, errs) {
  if (!Array.isArray(arr) || !arr.length) { errs.push(`${name}: 비어 있음`); return; }
  if (arr.length > LINT.maxListLen) errs.push(`${name}: ${arr.length}개 (${LINT.maxListLen} 초과)`);
  for (const w of arr) {
    if (typeof w !== 'string' || !w.trim()) { errs.push(`${name}: 빈 항목`); continue; }
    if (w.trim().length > LINT.maxNounChars) errs.push(`${name}: "${w}" — 낱말이 아니라 구절이다`);
    if (/\s/.test(w.trim())) errs.push(`${name}: "${w}" — 공백 포함(낱말 하나여야 한다)`);
  }
}

/** 오류 목록 반환. 빈 배열 = 통과. 이 린트가 곧 "계약은 문학이 아니다"의 집행자다. */
export function lintVoiceContract(c) {
  const errs = [];
  if (!c || typeof c !== 'object') return ['계약이 객체가 아님'];
  if (!c.voiceId || !c.voicePack) errs.push('voiceId/voicePack 누락');
  const r = c.rules;
  if (!r) return [...errs, 'rules 누락'];
  for (const k of ['distance', 'tempo', 'emotion', 'ending']) lintDirective(`rules.${k}`, r[k], errs);
  // v2.1: 닫힌 어휘 — 자유 서술로 흐르는 것을 막는다
  if (!SPEECH_VOCAB.includes(r.speech)) errs.push(`rules.speech: "${r.speech}" — ${SPEECH_VOCAB.join('/')} 중 하나여야 한다`);
  if (!PRONOUN_VOCAB.includes(r.pronoun)) errs.push(`rules.pronoun: "${r.pronoun}" — ${PRONOUN_VOCAB.join(' / ')} 중 하나여야 한다`);
  lintNounList('rules.focus', r.focus, errs);
  for (const f of r.focus || []) if (!FOCUS_VOCAB.includes(f)) errs.push(`rules.focus: "${f}" — 지각 채널이 아니다(대상 이름은 favoriteObjects로). 허용: ${FOCUS_VOCAB.join('/')}`);
  if (Array.isArray(r.focus) && Array.isArray(r.favoriteObjects)
      && r.focus.length && r.focus.every((f) => r.favoriteObjects.includes(f))) {
    errs.push('rules.focus가 favoriteObjects와 같다 — 초점(어떻게 보는가)과 대상(무엇을 보는가)은 다른 축이다');
  }
  lintNounList('rules.favoriteObjects', r.favoriteObjects, errs);
  lintNounList('rules.avoid', r.avoid, errs);
  const L = r.sentenceLength;
  if (!L || !(L.min >= 4) || !(L.max > L.min) || !(L.max <= 40)) errs.push('sentenceLength 범위 불량');
  for (const s of c.slotShifts || []) {
    lintDirective(`slotShift[${s.slot}].tempo`, s.tempo, errs);
    if (typeof s.focusFirst !== 'string' || s.focusFirst.trim().length > LINT.maxNounChars || /\s/.test(s.focusFirst.trim())) {
      errs.push(`slotShift[${s.slot}].focusFirst: 낱말 하나여야 한다 — "${s.focusFirst}"`);
    }
  }
  return errs;
}

/* ── 1단계 시스템 프롬프트 — 계약을 쓰게 하되, 문장을 못 쓰게 막는다 ── */
export const CONTRACT_SYSTEM = `너는 문장 생성기가 읽을 **규칙표**를 작성한다. 너는 작가가 아니다.

절대 규칙:
- 각 항목은 **규칙**이지 문장이 아니다. 12자 이내, 4어절 이내.
- 쉼표·말줄임·비유(처럼/듯/마치/같이) 금지. 절을 이어 붙이지 않는다.
- 묘사하지 않는다. 아름답게 쓰지 않는다. 시적으로 쓰지 않는다.
- focus/favoriteObjects/avoid는 **낱말 하나씩**만. 구절 금지.

좋은 예: distance "가까이 가지 않는다" / tempo "천천히" / emotion "직접 말하지 않는다" / ending "열어둔다"
나쁜 예: "느리게 걷다가 잠깐 멈추는 호흡" (문장) / "낮은 소리와 반사되는 빛을 헤아린다" (문장)

focus는 무엇을 **먼저** 보는지의 우선순위 순서다(앞이 먼저).
slotShifts는 시간대별로 focusFirst 낱말 하나와 tempo만 바꾼다. 다른 인물이 되면 안 된다.

출력: VoiceContract JSON 하나만.`;

/* ── 2단계 생성기 — 목소리에 대해 아무것도 모른다 (계약만 읽는다) ──
   여기에 특정 작가의 문체를 적으면 스왑이 거짓말이 된다. 포맷 제약만 소유한다. */
export function generatorSystem(contract, slot, phase, season, shift) {
  const r = contract.rules;
  return `너는 문장 생성기다. 아래 **규칙표**를 해석해 관찰 문장을 만든다.
너에게는 고유한 문체가 없다. 규칙표가 바뀌면 너의 출력도 바뀐다.

[규칙표: ${contract.voicePack}]
거리: ${r.distance}
속도: ${shift?.tempo || r.tempo}
초점 우선순위: ${(shift ? [shift.focusFirst, ...r.focus.filter((f) => f !== shift.focusFirst)] : r.focus).join(' > ')}
감정: ${r.emotion}
마무리: ${r.ending}
어투: ${r.speech}
1인칭: ${r.pronoun}
길이: ${r.sentenceLength.min}~${r.sentenceLength.max}자
자주 보는 것: ${r.favoriteObjects.join(', ')}
쓰지 않을 것: ${r.avoid.join(', ')}

[세계] 시간대 ${slot} / 하늘 ${phase} / 계절 ${season}

[포맷 제약 — 규칙표와 무관한 매체의 조건]
- 한 줄 완결. 두 문장 금지. 줄바꿈 금지.
- 이모지·해시태그·URL·따옴표 금지.
- 사실성: 이 시간대·이 날씨에 없을 것을 쓰지 않는다. 눈앞의 대상 외에 다른 존재를 등장시키지 않는다.
  흔적 문장은 누가 남겼는지 추정하지 않는다. 없는 사건을 지어내지 않는다.
- 조건 메타: traceType 있는 문장은 흔적 상황 전용. eventFlags rare/passed/first는 각 상황 전용.
  passed 문장은 행동을 했다고 말하지 않는다. mood photo는 촬영한 순간 전용.
- 대상 이름은 생성 시점에 문장과 결합한다. 나중에 이름만 갈아끼울 수 있는 템플릿을 만들지 않는다.

출력: SentenceBook JSON 하나만.`;
}
