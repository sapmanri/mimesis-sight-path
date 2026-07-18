// 429-B v3 — 세 층 완전 분리 (Vase 판정)
//   ① VoiceContract  : 작가의 시선. 정규화된 값만. 문형·대상 이름 금지.
//   ② DailyContext   : 오늘 별이가 만난 세계. favoriteObjects는 여기로.
//   ③ MediumGrammar  : 앱 한 줄의 표현 능력. 모든 작가 계약에 공통 — 생성기 소유.
//
// 핵심 원칙: 문형 다양성은 작가의 게놈이 아니라 생성기의 기본 능력이다.
// 단조로움을 계약 값으로 고치기 시작하면 계약에 다시 문학이 들어온다.

/* ═══ ① Observation Genome — 열거값만 ═══════════════════════════
   **Identity Genome은 문체를 저장하지 않는다. 세상을 바라보는 방식을 저장한다.**
   **문체는 Generation 단계에서 자연스럽게 발생하는 결과일 뿐이다.**

   그래서 축은 '어떻게 쓰는가'가 아니라 '어떻게 보는가'로 읽는다:
     focusOrder=[light,...]  → "빛을 먼저 써라"가 아니라 **"빛을 먼저 본다"**
     judgement               → 확신도가 아니라 **판단을 얼마나 미루는가**
     observationDensity      → 글을 많이 쓰는가가 아니라 **얼마나 많이 관찰하는가**
   이 순서가 뒤집히면 다시 문체 엔진으로 돌아간다. */
export const VOICE_ENUMS = {
  distance: ['near', 'medium', 'far'],
  tempo: ['fast', 'medium', 'slow'],
  focusOrder: ['light', 'shadow', 'sound', 'movement', 'texture', 'color', 'temperature', 'object', 'quantity', 'position'],
  observer: ['first_person', 'third_person'],  // TODO 후보: vantage / viewpoint (시점 문법으로 읽힐 여지)
  emotion: ['none', 'indirect', 'direct'],
  closure: ['open', 'closed'],              // 관찰을 결론으로 닫는가, 남겨두는가
  voice: ['banmal', 'jondaemal'],
  selfPresence: ['none', 'rare', 'free'],   // 관찰 속에 관찰자가 얼마나 드러나는가
  observationDensity: ['low', 'medium', 'high'],
  association: ['none', 'low', 'medium'],   // 대상을 다른 기억·사물과 연결해 보는 정도
  judgement: ['low', 'medium', 'high'],
};

export const VOICE_SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['voiceId', 'voicePack', 'rules'],
  properties: {
    voiceId: { type: 'string' }, voicePack: { type: 'string' },
    rules: {
      type: 'object', additionalProperties: false,
      required: Object.keys(VOICE_ENUMS),
      properties: Object.fromEntries(Object.entries(VOICE_ENUMS).map(([k, v]) =>
        [k, k === 'focusOrder' ? { type: 'array', items: { type: 'string', enum: v } } : { type: 'string', enum: v }])),
    },
  },
};

/* ═══ Identity Genome — 변하지 않는 축 ══════════════════════════
   Genome은 한 층이 아니다. 두 층이다.
     Identity Genome : 작가·캐릭터·관찰자를 그답게 만드는 축. 365일 안 변한다.
     Daily Genome    : 오늘의 상태만 그 위에 덧입는다. Identity를 절대 덮어쓰지 못한다.
   (1차 실행에서 별이 계약이 speech:"jondaemal"로 나왔다 — 린트는 통과했지만 별이가 아니었다.
    매일 바뀔 값과 정체성이라 고정이어야 할 값이 한 층에 섞여 있던 탓이다.)
   구현은 아래 표로 실현하되, 문서·아키텍처 용어는 **Identity Genome**이다. */
export const IDENTITY_AXES = ['voice', 'selfPresence', 'observer', 'closure', 'emotion', 'distance', 'observationDensity', 'association', 'judgement'];
export const DAILY_AXES = ['tempo', 'focusOrder'];   // 오늘만 변하는 것

export const IDENTITY_GENOME = {
  byeoli: { voice: 'banmal', selfPresence: 'rare', observer: 'first_person', closure: 'open',
    emotion: 'indirect', distance: 'medium', observationDensity: 'medium', association: 'low', judgement: 'low' },
  'dry-report': { voice: 'banmal', selfPresence: 'none', observer: 'third_person', closure: 'closed',
    emotion: 'none', distance: 'near', observationDensity: 'low', association: 'none', judgement: 'high' },
};
export const MAX_FOCUS = 4;   // 우선순위는 상위 몇 개일 때만 의미가 있다. 10개 나열 = 정보 0

/** Validation — Daily Genome이 Identity 축을 건드리면 실패시킨다(조용한 덮어쓰기 금지). */
export function composeGenome(packName, daily) {
  const identity = IDENTITY_GENOME[packName];
  if (!identity) return { rules: null, errors: [`미등록 Identity Genome: ${packName}`] };
  const errors = [];
  for (const axis of IDENTITY_AXES) {
    if (daily && Object.prototype.hasOwnProperty.call(daily, axis) && daily[axis] !== identity[axis]) {
      errors.push(`Daily Genome이 Identity 축 "${axis}"를 바꾸려 했다: "${daily[axis]}" → 고정값 "${identity[axis]}"`);
    }
  }
  const rules = { ...identity };
  for (const axis of DAILY_AXES) if (daily && daily[axis] !== undefined) rules[axis] = daily[axis];
  return { rules, errors };
}

/* ═══ Selection — 무엇을 볼 것인가 ══════════════════════════════
   Vase 발견(429 최대 성과): Genome은 Observation만 만드는 게 아니라 **Selection**도 만든다.
     같은 숲에서 삽만리는 빛·움직임·거리를 고르고, 헤밍웨이는 사람·행동·결과를 고르며,
     건축가는 구조·선·비례를 고른다.
   Selection = 무엇을 볼 것인가 / Observation = 그걸 어떻게 볼 것인가. 둘은 다른 층이다.
   문체는 이 둘 뒤에서 자연스럽게 생긴다.

   World → Request → Execution Contract → **Selection** → Observation → Generation → Validation → Resolution */
export const SELECTION_POOL = ['light','shadow','sound','movement','texture','color','temperature',
  'object','quantity','position','person','action','result','structure','line','proportion','distance','time'];

/** Identity가 무엇을 고르는 존재인지 + 오늘의 세계 → 오늘 볼 것 */
export function selectFrom(pack, dailyContext) {
  const PACK_SELECTION = {
    byeoli:       ['light', 'movement', 'texture', 'distance'],
    'dry-report': ['quantity', 'position', 'object'],
  };
  const base = PACK_SELECTION[pack];
  if (!base) return { selected: null, errors: [`Selection 미정의 팩: ${pack}`] };
  // Daily는 순서만 바꿀 수 있고, 없던 것을 새로 보게 만들지는 못한다
  const daily = (dailyContext?.focusOrder || []).filter((f) => base.includes(f));
  const selected = [...daily, ...base.filter((f) => !daily.includes(f))];
  const rejected = (dailyContext?.focusOrder || []).filter((f) => !base.includes(f));
  return { selected, rejected,
    errors: rejected.length ? [`Daily가 Identity에 없는 것을 보려 했다: ${rejected.join(', ')}`] : [] };
}

/* Observation 단계 — Identity와 Daily는 둘 다 '관찰'에 속한다. Generation은 그 다음이다.
   World → Request → Execution Contract → **Observation(Identity+Daily)** → Generation → Validation → Resolution */
export const OBSERVATION = { identity: IDENTITY_AXES, daily: DAILY_AXES, compose: 'composeGenome' };

/** 계약에 문학이 다시 들어오는 것을 막는다 — 자유 문자열 자체가 없다. */
export function lintVoice(c) {
  const e = [];
  if (!c?.rules) return ['rules 누락'];
  for (const [k, allowed] of Object.entries(VOICE_ENUMS)) {
    const v = c.rules[k];
    if (k === 'focusOrder') {
      if (!Array.isArray(v) || v.length < 2) { e.push('focusOrder: 2개 이상'); continue; }
      if (v.length > MAX_FOCUS) e.push(`focusOrder: ${v.length}개 — 상위 ${MAX_FOCUS}개까지. 전부 나열하면 우선순위가 아니다`);
      for (const f of v) if (!allowed.includes(f)) e.push(`focusOrder: "${f}" 비허용`);
    } else if (!allowed.includes(v)) e.push(`${k}: "${v}" — ${allowed.join('/')} 중 하나`);
  }
  // Identity Genome 위반 — Daily는 이 축들 위에서만 움직인다
  const identity = IDENTITY_GENOME[c.voicePack];
  if (identity) for (const [k, want] of Object.entries(identity)) {
    if (c.rules[k] !== want) e.push(`rules.${k}: "${c.rules[k]}" — ${c.voicePack} Identity Genome의 고정값은 "${want}" (Daily가 덮어쓸 수 없다)`);
  }
  // 대상 이름·문형이 계약에 새어들어왔는지
  const blob = JSON.stringify(c.rules);
  if (/[가-힣]{2,}(이|가|을|를|은|는)/.test(blob)) e.push('계약에 한국어 서술이 있다 — 정규화 값만 허용');
  return e;
}

/* ═══ ② DailyContext — 오늘의 세계 ═════════════════════════════ */
export const CONTEXT_SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['season', 'weather', 'topTargets', 'moodMix'],
  properties: {
    season: { type: 'string' },
    weather: { type: 'array', items: { type: 'string' } },
    topTargets: { type: 'array', items: { type: 'string' } },
    moodMix: { type: 'object', additionalProperties: { type: 'number' } },
  },
};

/* ═══ ③ MediumGrammar — 앱 한 줄의 표현 능력 (작가 무관) ═══════ */
/* formGroup은 **내부 메타**다 — 생성기와 검증기의 언어이지 별이가 말하는 내용이 아니다.
   문장집 객체에는 남기되 앱 일기·엽서·Threads에는 절대 표시하지 않는다(렌더 계약). */
export const FORM_GROUPS = {
  state:     { name: '대상의 상태',    ex: '홀씨 몇 개가 아직 붙어 있다' },
  change:    { name: '변화',           ex: '그림자가 잎 끝까지 내려왔다' },
  sense:     { name: '감각',           ex: '젖은 흙 냄새가 가까워졌다' },
  detail:    { name: '부분 확대',      ex: '벤치 모서리만 아직 젖어 있다' },
  discovery: { name: '비교 없는 발견', ex: '아까보다 물웅덩이가 얕아졌다' },
  action:    { name: '행동 단편',      ex: '조금 더 가까이 봤다' },
  question:  { name: '열린 의문',      ex: '어디까지 날아가려나' },
  trace:     { name: '흔적',           ex: '한쪽으로 굴러가 있다' },
};
export const FORM_KEYS = Object.keys(FORM_GROUPS);
export const CORE_FORMS = ['state', 'change', 'sense', 'detail'];

/** 상황별 길이 — 길이를 채우려 수식어를 붙이지 않는다. 말할 공간만 연다. */
export function lengthRange(state) {
  if (state === 'rare' || String(state).startsWith('trace')) return { min: 8, max: 32 };
  if (state === 'passed') return { min: 6, max: 22 };
  return { min: 8, max: 28 };
}

/* ═══ Observation Grammar ═══════════════════════════════════════
   "있다 20% 이하" 같은 동사 금지는 실패한다 — 막으면 "남아 있다 / 놓여 있다 /
   보인다 / 드러난다"로 도망갈 뿐이다. 동사가 아니라 **관찰 방식**의 균형을 본다.
   formGroup(문형)이 '어떻게 쓰는가'라면, 이건 '어떻게 보는가'의 분포다. */
export const OBS_GRAMMAR = {
  존재형: /(있다|없다|남았다|그대로다|서 있|놓여|붙어)/,
  변화형: /(졌다|진다|든다|온다|간다|스민다|번진다|기울|내려|올라|열린|닫힌)/,
  감각형: /(냄새|소리|빛|그늘|온기|차가|따뜻|축축|바스락|향)/,
  질문형: /(까|나|려나|을까)\s*[?]?$/,
  발견형: /(아까|처음|여전히|아직|이제|막|어느새|유난히)/,
  행동형: /(봤다|만졌다|앉았다|담았다|다가|멈췄다|돌아섰다|기울였다)/,
};
export const OBS_BALANCE = { max: 0.35, minKinds: 4 };   // 한 관찰 방식 과점 금지 · 최소 4종

export function lintObservationGrammar(sentences) {
  const e = [], n = sentences.length; if (!n) return e;
  const hit = {}; let none = 0;
  for (const s of sentences) {
    let matched = false;
    for (const [k, re] of Object.entries(OBS_GRAMMAR)) if (re.test(s.line)) { hit[k] = (hit[k] || 0) + 1; matched = true; }
    if (!matched) none++;
  }
  const kinds = Object.keys(hit).length;
  if (kinds < OBS_BALANCE.minKinds) e.push(`관찰 방식 ${kinds}종 (최소 ${OBS_BALANCE.minKinds}) — ${JSON.stringify(hit)}`);
  for (const [k, c] of Object.entries(hit)) {
    if (c / n > OBS_BALANCE.max) e.push(`관찰 방식 "${k}" ${(c / n * 100).toFixed(0)}% 과점 (상한 ${OBS_BALANCE.max * 100}%)`);
  }
  return e;
}

export const GENERIC_VERBS = ['바라본다', '머문다', '흔들린다', '있다', '보인다'];
export const DIVERSITY = {
  subjectVerbFormMax: 0.30,   // 대상+이/가+동사
  endingMax: 0.25,            // 동일 종결어미
  minFormGroups: 6,
  minCoreForms: 3,
  formGroupMax: 0.30,         // 한 문형군 과점 금지
  questionMax: 0.15,
  genericVerbMax: 0.12,       // 범용 동사 각각
};

/* 대조 팩 — 나쁜 계약이 아니라 **정상적인 다른 시선**이어야 스왑 증명이 성립한다.
   삽만리 계약과 다르지만 여전히 좋은 관찰 문장이 나와야 한다. */
export const DRY_REPORT = {
  voiceId: 'dry-report', voicePack: 'dry-report',
  rules: {
    distance: 'near', tempo: 'fast', focusOrder: ['quantity', 'position', 'object'],
    emotion: 'none', ending: 'closed', speech: 'banmal', pronoun: 'none',
    descriptionDensity: 'low', metaphorLevel: 'none', certainty: 'high',
  },
};

const ending = (l) => l.trim().replace(/[.?!]$/, '').slice(-3);
const firstTwo = (l) => l.trim().split(/\s+/).slice(0, 2).join(' ');
const isQuestion = (l) => /(까|나|려나|을까|ㄹ까)\s*[?]?$/.test(l.trim());
const subjectVerbForm = (l) => /^[^\s]+(이|가)\s+\S+(다|한다|났다|왔다)$/.test(l.trim());
const coreVerb = (l) => { const w = l.trim().split(/\s+/); return w[w.length - 1].replace(/[.?!]$/, ''); };

/** 문형 다양성을 기계로 검사한다. "다양하게 써라" 한 줄로는 다시 실패한다. */
export function lintDiversity(sentences) {
  const e = [], n = sentences.length;
  if (!n) return ['문장 없음'];
  const rate = (c) => c / n;

  const sv = sentences.filter((s) => subjectVerbForm(s.line)).length;
  if (rate(sv) > DIVERSITY.subjectVerbFormMax) e.push(`'대상+이/가+동사' ${(rate(sv) * 100).toFixed(0)}% (상한 ${DIVERSITY.subjectVerbFormMax * 100}%)`);

  const em = {}; sentences.forEach((s) => { const k = ending(s.line); em[k] = (em[k] || 0) + 1; });
  const [topE, topC] = Object.entries(em).sort((a, b) => b[1] - a[1])[0] || ['', 0];
  if (rate(topC) > DIVERSITY.endingMax) e.push(`종결어미 "${topE}" ${(rate(topC) * 100).toFixed(0)}% (상한 ${DIVERSITY.endingMax * 100}%)`);

  const groups = new Set(sentences.map((s) => s.formGroup).filter(Boolean));
  if (groups.size < DIVERSITY.minFormGroups) e.push(`문형군 ${groups.size}종 (최소 ${DIVERSITY.minFormGroups})`);
  const core = CORE_FORMS.filter((g) => groups.has(g)).length;
  if (core < DIVERSITY.minCoreForms) e.push(`상태·변화·감각·부분확대 중 ${core}종 (최소 ${DIVERSITY.minCoreForms})`);

  const q = sentences.filter((s) => isQuestion(s.line));
  if (rate(q.length) > DIVERSITY.questionMax) e.push(`질문형 ${(rate(q.length) * 100).toFixed(0)}% (상한 ${DIVERSITY.questionMax * 100}%)`);
  const qBad = q.filter((s) => s.mood !== 'wonder');
  if (qBad.length) e.push(`질문형이 wonder 밖에서 ${qBad.length}건 — 예: "${qBad[0].line}"`);

  for (const v of GENERIC_VERBS) {
    const c = sentences.filter((s) => s.line.includes(v)).length;
    if (rate(c) > DIVERSITY.genericVerbMax) e.push(`범용 동사 "${v}" ${(rate(c) * 100).toFixed(0)}% (상한 ${DIVERSITY.genericVerbMax * 100}%)`);
  }

  // 문형군 과점 — 슬롯 전체에서 한 종류가 몰리지 않게
  const gm = {}; sentences.forEach((s) => { if (s.formGroup) gm[s.formGroup] = (gm[s.formGroup] || 0) + 1; });
  const [topG, topGC] = Object.entries(gm).sort((a, b) => b[1] - a[1])[0] || ['', 0];
  if (rate(topGC) > DIVERSITY.formGroupMax) e.push(`문형군 "${topG}" ${(rate(topGC) * 100).toFixed(0)}% 과점 (상한 ${DIVERSITY.formGroupMax * 100}%)`);

  /* 대상 단위 — 전체 8종이어도 특정 대상의 문장이 전부 같은 구조일 수 있다.
     사용자가 같은 대상을 반복해 만났을 때의 체감 품질을 지키는 층. */
  const byKey = {};
  for (const s of sentences) { const k = `${s.targetType || '-'}|${s.mood}`; (byKey[k] ||= []).push(s); }
  for (const [k, list] of Object.entries(byKey)) {
    if (list.length < 2) continue;
    const groups = list.map((s) => s.formGroup);
    if (new Set(groups).size < groups.length) e.push(`(${k}) formGroup 중복: ${groups.join(', ')}`);
    const verbs = list.map((s) => coreVerb(s.line));
    if (new Set(verbs).size < verbs.length) e.push(`(${k}) 핵심 동사 중복: ${verbs.join(', ')}`);
    const heads = list.map((s) => firstTwo(s.line));
    if (new Set(heads).size < heads.length) e.push(`(${k}) 첫 두 어절 중복: ${heads.join(' / ')}`);
  }

  // formGroup 누수 — 내부 메타가 문장에 새어나오면 안 된다
  for (const s of sentences) {
    for (const g of FORM_KEYS) if (s.line.includes(g)) { e.push(`formGroup 누수: "${s.line}"`); break; }
  }

  // 상황별 길이
  for (const s of sentences) {
    const st = s.traceType ? 'trace' : ((s.eventFlags || [])[0] || 'normal');
    const r = lengthRange(st);
    if (s.line.length < r.min || s.line.length > r.max) e.push(`길이 ${s.line.length} (${st}: ${r.min}~${r.max}) — "${s.line}"`);
  }
  return e;
}

/* ═══ 생성기 프롬프트 — 작가를 모른다. 표현 능력만 안다. ═══════ */
export function generatorSystemV3(voice, ctx, slot, phase, state) {
  const r = voice.rules;
  return `너는 문장 생성기다. 고유한 문체가 없다. 아래 규칙표를 해석해 앱 한 줄짜리 관찰 문장을 만든다.

[① 작가의 시선 — VoiceContract: ${voice.voicePack}]
${Object.entries(r).map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(' > ') : v}`).join('\n')}

[② 오늘의 세계 — DailyContext]
계절 ${ctx.season} / 날씨 ${ctx.weather.join(',')} / 시간대 ${slot}(${phase})
오늘 자주 만난 것: ${ctx.topTargets.join(', ')}

[③ 앱 한 줄의 표현 능력 — MediumGrammar (모든 작가 공통)]
문형군을 고루 쓴다. 각 문장에 formGroup을 붙인다 (**내부 메타 — 문장 안에 이 단어를 쓰지 않는다**):
${Object.entries(FORM_GROUPS).map(([k, g]) => `  ${k} (${g.name}) — 예: ${g.ex}`).join('\n')}
- 한 문장집에서 특정 문형군이 ${DIVERSITY.formGroupMax * 100}%를 넘지 않는다. 최소 ${DIVERSITY.minFormGroups}종 사용, 상태·변화·감각·부분확대 중 최소 ${DIVERSITY.minCoreForms}종 포함.
- '대상+이/가+동사한다' 문형 ${DIVERSITY.subjectVerbFormMax * 100}% 이하. 동일 종결어미 ${DIVERSITY.endingMax * 100}% 이하.
- **같은 (대상, mood) 두 문장은 formGroup·핵심 동사·첫 두 어절이 모두 서로 달라야 한다.**
  (전체 8종을 써도 한 대상의 문장이 전부 같은 구조면 사용자는 반복을 체감한다)
- 질문형은 mood=wonder에서만, 전체 ${DIVERSITY.questionMax * 100}% 이하.
- '바라본다/머문다/흔들린다/있다/보인다'는 각각 ${DIVERSITY.genericVerbMax * 100}% 이하.
- 길이: 기본 8~28자 / rare·trace 8~32자 / passed 6~22자. **길이를 채우려고 수식어를 붙이지 않는다.**

[rare의 의미 — 분위기가 아니라 사건]
- 드물게 만난 대상의 **구체적 특징**을 말한다.
- 날씨 전체를 묘사하지 않는다.
- 놀랐다·행운이다 같은 감정 단정 금지.
- 평범한 observe 문장보다 더 구체적이어야 한다.
- 나쁨: "안개가 옅게 깔린다"  가능: "흰 제비꽃이 돌 틈에 하나 피어 있다" / "뿔이 한쪽만 남은 사슴벌레다"

[포맷]
한 줄 완결·두 문장 금지·줄바꿈 금지·이모지/해시태그/URL/따옴표 금지.
이 시간대·날씨에 없을 것을 쓰지 않는다. 눈앞의 대상 외 다른 존재를 등장시키지 않는다.
흔적 문장은 누가 남겼는지 추정하지 않는다.
passed 문장은 행동을 했다고 말하지 않는다. mood=photo는 촬영한 순간 전용.

출력: SentenceBook JSON 하나만.`;
}
