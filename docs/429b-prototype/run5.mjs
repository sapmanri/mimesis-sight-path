// 429-B v3.2 — 슬롯간 의미 중복 제어 (정본 BUILD_429_GENOME_SEASONS §7-①).
//   ① 출력: {key, line, formGroup, focus, core} — focus·core는 관찰 서명.
//      메타를 다시 쓰는 게 아니라 **관찰 내용의 자기 신고**다 (scope는 계약이 소유, §1-3 불변).
//   ② 메타는 requiredKeys에서 조인 (드리프트 구조상 불가)
//   ③ Byeoli Identity Genome 강제
//   ④ 24키 묶음 분할 생성 → 묶음 검증(재시도) → critic(수정 금지, 위반 키만 교체) → 슬롯 전체 검증
//   ⑤ 슬롯간 인계: 문장 원문이 아니라 usedObservationSignatures{focus,formGroup,scope,core} ·
//      usedCorePhrases(정규화 핵심 구문) · usedVerbs(대상별 핵심 동사)를 넘긴다.
//      분포만 넘기면 같은 의미 문장이 다시 나온다 — v3.1 슬롯간 중복 16건.
import Anthropic from '@anthropic-ai/sdk';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { EVENTS, SLOT_PHASE } from './events.mjs';
import { composeGenome, IDENTITY_GENOME, FORM_KEYS, FORM_GROUPS, lintDiversity, lengthRange,
  lintObservationGrammar, OBS_GRAMMAR, OBS_BALANCE, VOICE_ENUMS, coreVerb } from './v3.mjs';
import { buildRequiredKeys, joinMeta, lookup, gateReport, TARGET_VOCAB, cleanForVocab } from './execution.mjs';

/* ── offline guard (Vase 지시 2026-07-19) ──────────────────────────
   BUILD 429 생성·분석은 **로컬 파일 + Anthropic API만** 사용한다.
   KV·Durable Objects·배포 Worker·운영 API 호출 금지.
   Cloudflare 자격이 환경에 보이면 시작 자체를 거부하고,
   api.anthropic.com 외 호스트로 나가는 요청은 즉시 실패시킨다. */
if (Object.keys(process.env).some((k) => /^(CF_|CLOUDFLARE_|WRANGLER_)/.test(k))) {
  console.error('offline guard: Cloudflare 자격/바인딩이 환경에 있다 — 중단');
  process.exit(1);
}
{
  const _fetch = globalThis.fetch;
  globalThis.fetch = (input, init) => {
    const url = typeof input === 'string' ? input : (input?.url ?? String(input));
    const host = new URL(url).host;
    if (host !== 'api.anthropic.com') throw new Error(`offline guard: 허용되지 않은 원격 호출 — ${host}`);
    return _fetch(input, init);
  };
}

const HERE = new URL('.', import.meta.url).pathname;
const OUT = HERE + 'out6'; mkdirSync(OUT, { recursive: true });
const client = new Anthropic();
const MODEL = 'claude-opus-4-8';
const genome = JSON.parse(readFileSync(HERE + 'genome.json', 'utf8'));
const SLOTS = ['morning', 'afternoon', 'sunset', 'night'];
const TOP = genome.topTargets;
const WEATHERS = Object.keys(genome.weatherMix);
const usage = [];

/* Daily Genome — Identity를 덮어쓸 수 없다(Validation이 강제) */
const DAILY = { tempo: 'slow', focusOrder: ['light', 'movement', 'texture'] };
const { rules: GEN, errors: genomeErrors } = composeGenome('byeoli', DAILY);
if (genomeErrors.length) { console.error('Genome 합성 실패:', genomeErrors); process.exit(1); }

const CHUNK = 24;   // 키 묶음 크기 — 출력 잘림 방지
const FOCUS = VOICE_ENUMS.focusOrder;
const OUT_SCHEMA = {
  type: 'object', additionalProperties: false, required: ['sentences'],
  properties: { sentences: { type: 'array', items: {
    type: 'object', additionalProperties: false, required: ['key', 'line', 'formGroup', 'focus', 'core'],
    properties: { key: { type: 'string' }, line: { type: 'string' }, formGroup: { type: 'string', enum: FORM_KEYS },
      focus: { type: 'string', enum: FOCUS }, core: { type: 'string' } },
  } } },
};
const CRITIC_SCHEMA = {
  type: 'object', additionalProperties: false, required: ['violations'],
  properties: { violations: { type: 'array', items: {
    type: 'object', additionalProperties: false, required: ['key', 'line', 'reason'],
    properties: { key: { type: 'string' }, line: { type: 'string' }, reason: { type: 'string' } },
  } } },
};

/* ── 슬롯간 인계 저장소 — 문장 원문 전체는 넘기지 않는다 ────────── */
const scopeOf = (key) => key.split(':')[1];                 // targetType 또는 cat.<category> — 계약 소유
const normCore = (c) => (c || '').replace(/\s+/g, '').replace(/[.,!?"']/g, '');
const usedSig = {};                 // scope → [{focus, formGroup, core}]  (usedObservationSignatures)
const usedCore = {};                // scope → Set(정규화 core)            (usedCorePhrases)
const usedVerb = {};                // scope → Set(핵심 동사)              (usedVerbs)
const usedLines = new Set();        // 전 슬롯 누적 line — 완전 중복 0 보증
function recordUsed(got) {
  for (const g of got) {
    usedLines.add(g.line);
    const sc = scopeOf(g.key);
    (usedSig[sc] ||= []).push({ focus: g.focus, formGroup: g.formGroup, core: g.core });
    (usedCore[sc] ||= new Set()).add(normCore(g.core));
    (usedVerb[sc] ||= new Set()).add(coreVerb(g.line));
  }
}

async function askOnce({ system, user, schema, maxTokens, tag }) {
  const s = client.messages.stream({ model: MODEL, max_tokens: maxTokens, thinking: { type: 'adaptive' },
    output_config: { effort: 'high', format: { type: 'json_schema', schema } },
    system, messages: [{ role: 'user', content: user }] });
  const m = await s.finalMessage();
  if (m.stop_reason === 'refusal') throw new Error('refusal');
  if (m.stop_reason === 'max_tokens') throw new Error('출력 잘림 — 묶음을 더 줄여야 한다');
  usage.push({ tag, in: m.usage.input_tokens, out: m.usage.output_tokens });
  return JSON.parse(m.content.filter((b) => b.type === 'text').map((b) => b.text).join(''));
}
/* 일시 오류(과부하·네트워크)는 1회 재시도. refusal·출력 잘림은 재시도해도 같으므로 즉시 던진다. */
async function ask(args) {
  try { return await askOnce(args); }
  catch (e) {
    if (/refusal|잘림/.test(String(e.message))) throw e;
    console.log(`  ⚠ ${args.tag} 일시 오류 — 5초 후 재시도: ${e.message}`);
    await new Promise((r) => setTimeout(r, 5000));
    return askOnce(args);
  }
}

function system(slot) {
  return `너는 문장 생성기다. 고유한 문체가 없다. 아래 **관찰 방식**을 해석해 앱 한 줄짜리 문장을 만든다.

[Observation — 이것은 문체가 아니라 세상을 보는 방식이다]
${Object.entries(GEN).map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(' > ') : v}`).join('\n')}
  voice=banmal        → 반말. 존댓말 어미(~요/~습니다/~네요/~어요) 절대 금지.
  selfPresence=rare   → 관찰에 '나'가 거의 드러나지 않는다. 주어 없는 관찰 단편이 기본.
  closure=open        → 결론으로 닫지 않고 남겨둔다.
  emotion=indirect    → 감정을 직접 이름 붙이지 않는다. 사물의 상태로만 비친다.
  association=low     → 다른 기억·사물과 잘 연결하지 않는다. 비유를 즐기지 않는다.
  judgement=low       → 판단을 미룬다. 단정하지 않는다.
  focusOrder          → 앞의 것을 **먼저 본다**(먼저 쓰라는 게 아니라 먼저 보는 것).

[오늘의 세계] 계절 ${genome.season} / 날씨 ${WEATHERS.join(',')} / 시간대 ${slot}(${SLOT_PHASE[slot]})
※ 오늘은 날씨가 섞인 날이다. 문장은 맑음·흐림·비 **어디서나 성립**해야 한다.
  특정 날씨에만 맞는 서술(젖은/마른/비가/눈이)은 쓰지 않는다.

[표현 능력 — MediumGrammar]
formGroup을 각 문장에 붙인다 (**내부 메타 — 문장 안에 이 단어를 쓰지 않는다**):
${Object.entries(FORM_GROUPS).map(([k, g]) => `  ${k} (${g.name}) — 예: ${g.ex}`).join('\n')}
- 같은 키의 문장 2개는 formGroup·핵심 동사·첫 두 어절이 모두 달라야 한다.
- 한 문형군에 몰리지 않는다. 질문형은 mood=wonder에서만.
- 길이: 기본 8~28자 / rare·trace 8~32자 / passed 6~22자. 길이를 채우려 수식어를 붙이지 않는다.
- 같은 문장을 두 번 쓰지 않는다.

[관찰 방식 균형]
존재형(있다/남았다/놓여)·변화형·감각형·질문형·발견형·행동형이 고루 나와야 한다.
한 방식이 묶음의 35%를 넘으면 실패다. 특히 '~있다'로 끝나는 존재형 몰림 금지 —
상태를 말하고 싶으면 변화·감각·부분확대로 본 것을 말하라.

[관찰 서명 — focus·core]
각 문장에 둘을 붙인다 (**내부 메타 — 문장에 그대로 옮기지 않는다**):
- focus: 이 문장이 주로 본 축 하나 — ${FOCUS.join('/')}
- core: 관찰한 핵심 변화 6~16자 명사구. 예: "그림자가 등받이까지 이동"
[이미 관찰한 장면]이 주어지면 **같은 core를 다시 만들지 않는다** — 같은 대상이라도
다른 부분·다른 변화를 본다. 문장이 달라도 core가 같으면 중복이다.

[상황 의미]
rare   = 드물게 만난 대상의 **구체적 특징**. 날씨 묘사 금지. 놀랐다·행운 금지.
passed = 멈추지 않았다. 가까이 봤다·앉았다·찍었다 같은 행동을 말하지 않는다.
trace warm = 남은 온기·눌린 자리 / trace moved = 자리가 달라짐. **누가 그랬는지 추정 금지.**

[reusable — 이름 없는 키]
대상 이름이 없는 키(cat.*)의 문장은 그 카테고리 **무엇에나** 성립해야 한다.
특정 대상만 가리키는 말(벤치/등받이/홀씨/줄기/발자국/귀/밥그릇 등) 금지.

[출력] 각 요청 키마다 {key, line, formGroup, focus, core}만 반환한다.
메타(대상·카테고리·mood·플래그·날씨)는 계약이 이미 갖고 있으니 다시 쓰지 않는다.
한 줄·두 문장 금지·줄바꿈 금지·이모지/해시태그/URL/따옴표 금지.`;
}

const keyLine = (k) => `${k.key} → 대상 ${k.targetName || '(이름 없음, ' + k.category + ' 무엇에나)'} · ${k.mood === 'any' ? '상황 전용' : 'mood=' + k.mood}${k.eventFlag !== 'normal' ? ' · ' + k.eventFlag : ''}${k.traceType ? ' · trace=' + k.traceType : ''} · ${k.count}문장`;

/* 이 묶음에 등장하는 scope의 사용 이력만 넘긴다 — 토큰 절약 + 의미 중복 포착 */
function historyNote(ch) {
  const scopes = [...new Set(ch.map((k) => scopeOf(k.key)))];
  const sig = scopes.filter((s) => usedSig[s]?.length)
    .map((s) => `  ${s}: ${usedSig[s].map((x) => `${x.focus}/${x.formGroup}:${x.core}`).join(' · ')}`);
  if (!sig.length) return '';
  const verbs = scopes.filter((s) => usedVerb[s]?.size)
    .map((s) => `  ${s}: ${[...usedVerb[s]].join(', ')}`);
  return `\n\n[이미 관찰한 장면 — 같은 core를 다시 만들지 마라]\n${sig.join('\n')}`
    + (verbs.length ? `\n[이미 쓴 핵심 동사 — 같은 대상이면 피하라]\n${verbs.join('\n')}` : '');
}

const HONORIFIC = /(요|습니다|네요|어요|아요|세요)\s*$/;
const WEATHER_ONLY = /^(안개|비|눈|바람|햇빛|하늘|구름|저녁빛|새벽빛|물안개|이슬)/;

/* 이슈는 {msg, key?, line?} 구조 — key·line이 있어야 단건 복구가 어떤 계약이 실패하는지 안다 */
function validateChunk(ch, got) {
  const bad = [];
  const want = Object.fromEntries(ch.map((k) => [k.key, k.count]));
  const have = {};
  for (const g of got) have[g.key] = (have[g.key] || 0) + 1;
  for (const [k, c] of Object.entries(want)) if ((have[k] || 0) < c) bad.push({ key: k, msg: `키 미충족: ${k} (필요 ${c}, 있음 ${have[k] || 0})` });
  const vocab = [...new Set([...TARGET_VOCAB, ...TOP.map((t) => t.name)])];
  const B = (g, msg) => bad.push({ key: g.key, line: g.line, msg });
  for (const g of got) {
    if (!want[g.key]) { bad.push({ key: g.key, line: g.line, msg: `요청에 없는 키: ${g.key}` }); continue; }
    const kk = ch.find((x) => x.key === g.key);
    if (HONORIFIC.test(g.line.trim())) B(g, `존댓말: "${g.line}"`);
    const st = kk?.traceType ? 'trace' : (kk?.eventFlag !== 'normal' ? kk?.eventFlag : 'normal');
    const rg = lengthRange(st);
    if (g.line.length < rg.min || g.line.length > rg.max) B(g, `길이 ${g.line.length} (${st}: ${rg.min}~${rg.max}) "${g.line}"`);
    if (!g.core || g.core.trim().length < 4) B(g, `core 누락/빈약: "${g.line}"`);
    // 슬롯간 완전 중복·의미 중복
    if (usedLines.has(g.line)) B(g, `이미 다른 슬롯/묶음에서 쓴 문장: "${g.line}"`);
    const sc = scopeOf(g.key);
    if (usedCore[sc]?.has(normCore(g.core))) B(g, `이미 관찰한 장면: ${sc} core "${g.core}" — 다른 변화를 봐라`);
    // reusable 대상 지목
    if (kk && !kk.targetType) {
      const cleaned = cleanForVocab(g.line);
      for (const w of vocab) if (cleaned.includes(w)) { B(g, `reusable인데 고유 관찰어 "${w}": "${g.line}"`); break; }
    }
    // 메타 자기모순 — 슬롯 게이트까지 가기 전에 묶음에서 고친다
    if (kk?.eventFlag === 'rare' && WEATHER_ONLY.test(g.line.trim())) B(g, `rare가 날씨 묘사다: "${g.line}"`);
    if (kk?.eventFlag === 'passed' && /(가까이|들여다|앉|만졌|담았|찍)/.test(g.line)) B(g, `passed인데 행동을 말한다: "${g.line}"`);
    if (kk?.traceType === 'warm' && !/(따뜻|온기|남아|자리|눌린|아직)/.test(g.line)) B(g, `trace warm인데 남은 흔적이 없다: "${g.line}"`);
    if (kk?.traceType === 'moved' && !/(굴러|자리|달라|옮겨|밀려|기울)/.test(g.line)) B(g, `trace moved인데 이동 흔적이 없다: "${g.line}"`);
  }
  // 묶음 내 중복 — 문장(표면)과 관찰(의미)
  const seenL = new Set(), seenC = new Set();
  for (const g of got) {
    if (seenL.has(g.line)) B(g, `묶음 내 문장 중복: "${g.line}"`);
    seenL.add(g.line);
    const t = scopeOf(g.key) + '|' + normCore(g.core);
    if (seenC.has(t)) B(g, `묶음 내 관찰 중복: ${g.key} core "${g.core}"`);
    seenC.add(t);
  }
  // 관찰 방식 균형 (묶음 단위 근사 — 슬롯 게이트 lintObservationGrammar의 예방층)
  if (got.length >= 12) {
    const hit = {};
    for (const g of got) for (const [k, re] of Object.entries(OBS_GRAMMAR)) if (re.test(g.line)) hit[k] = (hit[k] || 0) + 1;
    for (const [k, c] of Object.entries(hit)) if (c / got.length > OBS_BALANCE.max) {
      bad.push({ msg: `관찰 방식 "${k}" ${(c / got.length * 100).toFixed(0)}% 과점 (상한 ${OBS_BALANCE.max * 100}%) — 일부를 다른 방식으로 바꿔라` });
    }
  }
  return bad;
}

async function generateChunk(slot, ch, tag, extraNote = '') {
  let got = [], bad = [], n = 0;
  do {
    n++;
    const retry = bad.length ? `\n\n**이전 시도 문제 — 반드시 고쳐라:**\n${bad.slice(0, 14).map((b) => b.msg).join('\n')}` : '';
    const r = await ask({ system: system(slot), schema: OUT_SCHEMA, maxTokens: 24000, tag: `${tag}:${n}`,
      user: `요청 키 ${ch.length}개 (총 ${ch.reduce((a, k) => a + k.count, 0)}문장):\n${ch.map(keyLine).join('\n')}${historyNote(ch)}${extraNote}${retry}` });
    got = r.sentences;
    bad = validateChunk(ch, got);
    console.log(`  ${tag} 시도 ${n}: ${got.length}문장 · 문제 ${bad.length}`);
    for (const b of bad.slice(0, 4)) console.log(`      · ${b.msg}`);   // 로그만으로 원인 진단 가능해야 한다
  } while (bad.length && n < 4);
  return { got, bad, tries: n };
}

/* ── critic — 수정 금지. 통과/탈락과 이유만 (정본 §5) ─────────── */
function criticSystem(slot) {
  return `너는 검수자다. 문장을 고치지 않는다 — **탈락 문장과 이유만** 낸다.
[세계] 계절 ${genome.season} / 오늘 날씨 ${WEATHERS.join('·')} 혼합 / 시간대 ${slot}(${SLOT_PHASE[slot]})
각 문장의 계약 메타가 함께 주어진다. 다음 **사실성 위반만** 잡는다 (취향·문체 판단 금지):
1. 혼합 날씨 위반 — 특정 날씨에서만 성립하는 서술(젖은/마른/비가/빗방울/마르지 않은 등)
2. 시간대 불일치 — 이 시간대에 있을 수 없는 빛·현상
3. rare 위반 — 날씨·분위기 묘사이거나 구체적 특징이 없다
4. passed 위반 — 멈추지 않았는데 행동(가까이 봄·앉음·만짐·찍음)을 말한다
5. trace 위반 — 흔적의 주인을 추정하거나 흔적 자체가 없다
6. 대상 정합 — 문장이 그 대상의 관찰이라 볼 수 없다. 카테고리(이름 없음) 문장은 그 카테고리 무엇에나 성립해야 한다
확실한 위반만 낸다. 애매하면 통과시킨다. line은 원문 그대로 복사한다.
출력: {violations:[{key, line, reason}]}. 위반이 없으면 빈 배열.`;
}
const CRITIC_BATCH = 60;   // 120문장 일괄 검수는 thinking 포함 max_tokens를 넘긴다 (3차 실행 크래시)
async function criticCheck(slot, sentences, tag) {
  const out = [];
  for (let i = 0; i < sentences.length; i += CRITIC_BATCH) {
    const part = sentences.slice(i, i + CRITIC_BATCH);
    const rows = part.map((s) => {
      const st = s.traceType ? 'trace-' + s.traceType : ((s.eventFlags || [])[0] || 'normal');
      return `${s.key} · ${s.targetName || s.category + ' 카테고리(무엇에나 성립)'} · ${s.mood}${st !== 'normal' ? ' · ' + st : ''} → ${s.line}`;
    });
    const r = await ask({ system: criticSystem(slot), schema: CRITIC_SCHEMA, maxTokens: 20000, tag: `${tag}.${i / CRITIC_BATCH + 1}`,
      user: `검수 대상 ${rows.length}문장:\n${rows.join('\n')}` });
    const real = new Set(part.map((s) => s.key + '|' + s.line));   // critic이 지어낸 행 무시
    out.push(...r.violations.filter((v) => real.has(v.key + '|' + v.line)));
  }
  return out;
}

async function buildSlot(slot) {
  const p = `${OUT}/book-${slot}.json`;
  const required = buildRequiredKeys(slot, TOP, WEATHERS);
  const byKey = Object.fromEntries(required.map((k) => [k.key, k]));
  const chunks = [];
  for (let i = 0; i < required.length; i += CHUNK) chunks.push(required.slice(i, i + CHUNK));
  console.log(`${slot}: 키 ${required.length} → ${chunks.length}묶음`);

  /* 묶음 생성 → 위반 키만 묶음 재시도(generateChunk 내부) → 끝까지 남은 키만 단건 복구 → critic → dropped.
     한 건의 실패가 정상 건까지 묶음 재시도로 끌고 가는 것(E)을 단건 복구가 끊는다. */
  let gen = [];
  const unresolved = [];   // 슬롯 탈락은 조용히 일어나면 안 된다 — 무엇이 계속 실패했는지 남긴다 (발달 기록)
  for (let ci = 0; ci < chunks.length; ci++) {
    const ch = chunks[ci];
    const { got, bad, tries } = await generateChunk(slot, ch, `${slot}#${ci + 1}`);
    recordUsed(got);   // 문제 문장의 관찰도 기록 — 복구 생성이 같은 것을 다시 만들지 않게
    if (!bad.length) { gen.push(...got); continue; }
    // 문제 문장 제거 후 부족분만 단건 복구
    const badLines = new Set(bad.map((b) => b.line).filter(Boolean));
    const kept = got.filter((g) => !badLines.has(g.line));
    gen.push(...kept);
    const haveClean = {};
    for (const g of kept) haveClean[g.key] = (haveClean[g.key] || 0) + 1;
    const deficits = ch.filter((k) => (haveClean[k.key] || 0) < k.count).map((k) => ({ ...k, count: k.count - (haveClean[k.key] || 0) }));
    for (const b of bad.filter((x) => !x.line && !x.key)) unresolved.push({ contractKey: null, stage: `묶음${ci + 1}`, chunkTries: tries, reason: [b.msg], lastCandidate: null });
    for (const dk of deficits) {
      const priorFails = bad.filter((b) => b.key === dk.key).map((b) => b.msg);
      const note = priorFails.length ? `\n\n**이 키의 직전 실패 사유 — 같은 실수 금지:**\n${priorFails.join('\n')}` : '';
      const { got: g2, bad: b2 } = await generateChunk(slot, [dk], `${slot}#${ci + 1}-solo(${dk.key})`, note);
      recordUsed(g2);
      const bl2 = new Set(b2.map((b) => b.line).filter(Boolean));
      gen.push(...g2.filter((g) => !bl2.has(g.line)));
      if (b2.length) {
        console.log(`  ⚠ 단건 복구 실패: ${dk.key}`);
        unresolved.push({ contractKey: dk.key, stage: `묶음${ci + 1}→단건`, chunkTries: tries, reason: b2.map((x) => x.msg), lastCandidate: g2.map((x) => x.line).join(' / ') || null });
      }
    }
  }

  /* critic 2라운드 — 위반이면 그 키만 교체 생성, 재위반이면 슬롯 탈락.
     critic 실행 자체가 실패해도 생성물은 저장한다 — 조용한 유실 금지 (3차 실행에서 책 저장 전 크래시로 전량 유실). */
  let criticLeft = [], criticError = null;
  try {
    for (let round = 1; round <= 2; round++) {
      const { sentences } = joinMeta(required, gen);
      criticLeft = await criticCheck(slot, sentences, `${slot}:critic${round}`);
      if (!criticLeft.length || round === 2) break;
      console.log(`  ${slot} critic 위반 ${criticLeft.length}건 — 위반 키만 교체 생성`);
      const badSet = new Set(criticLeft.map((v) => v.key + '|' + v.line));
      gen = gen.filter((g) => !badSet.has(g.key + '|' + g.line));
      const needs = {};
      for (const v of criticLeft) needs[v.key] = (needs[v.key] || 0) + 1;
      const repl = Object.entries(needs).map(([k, c]) => ({ ...byKey[k], count: c }));
      const note = `\n\n**검수 탈락 사유 — 같은 실수 금지:**\n${criticLeft.map((v) => `${v.key}: ${v.reason}`).join('\n')}`;
      const { got, bad } = await generateChunk(slot, repl, `${slot}#critic-fix`, note);
      if (bad.length) unresolved.push(...bad.map((b) => ({ contractKey: b.key ?? null, stage: 'critic교체', reason: [b.msg], lastCandidate: b.line ?? null })));
      recordUsed(got);
      gen.push(...got);
    }
  } catch (e) {
    criticError = String(e.message);
    console.log(`  ⚠ ${slot} critic 실행 실패 — 책은 저장, 슬롯은 dropped: ${criticError}`);
  }

  const { sentences, orphans } = joinMeta(required, gen);
  const book = { slot, sentences, orphans };
  const evalRows = EVENTS.filter((e) => e.slot === slot).map((ev) => ({ state: ev.state, line: lookup(book, ev).s?.line ?? null }));
  const gate = gateReport({ book, required, evalRows, topTargets: TOP });
  const grammar = lintObservationGrammar(sentences);
  const pass = gate.pass && grammar.length === 0 && criticLeft.length === 0 && unresolved.length === 0 && !criticError;
  book._gate = { pass, status: pass ? 'adopted' : 'dropped',
    dropReasons: pass ? [] : [
      ...(gate.verdict.length ? ['contract'] : []), ...(grammar.length ? ['observation_grammar'] : []),
      ...(criticLeft.length ? ['critic_residual'] : []), ...(unresolved.length ? ['chunk_unresolved'] : []),
      ...(criticError ? ['critic_error'] : [])],
    criticRounds: criticLeft.length ? 2 : 1, criticError, unresolved,
    verdict: [...gate.verdict, ...grammar.map((g) => 'grammar: ' + g), ...criticLeft.map((v) => `critic: ${v.reason} — "${v.line}"`),
      ...(unresolved.length ? [`묶음 미해결 ${unresolved.length}건`] : []), ...(criticError ? [`critic 실행 실패: ${criticError}`] : [])],
    coverageRate: gate.coverage.rate, missing: gate.coverage.missing.slice(0, 10), orphans: orphans.slice(0, 10),
    sim: { counts: gate.sim.counts, byLayer: gate.sim.byLayer, ruleFallback: gate.sim.ruleFallback,
      targetExactRate: gate.sim.targetExactRate, specialResolutionRate: gate.sim.specialResolutionRate, genericResolutionRate: gate.sim.genericResolutionRate },
    reuse: gate.reuse.slice(0, 8), meta: gate.meta.slice(0, 8), grammar, critic: criticLeft,
    diversity: lintDiversity(sentences).slice(0, 8),
    honorific: sentences.filter((s) => HONORIFIC.test(s.line.trim())).length };
  writeFileSync(p, JSON.stringify(book, null, 2));
  console.log(`${slot}: ${sentences.length}문장 · 키 ${(gate.coverage.rate * 100).toFixed(1)}% · ${pass ? 'PASS' : 'FAIL(' + book._gate.verdict.length + ')'}`);
  return book;
}

/* 부분 재실행 — 보존 슬롯만 선주입하고, 재생성 대상 슬롯은 **이전 버전을 제외**한다.
   (폐기할 관찰까지 금지 목록에 넣으면 새 슬롯이 자기 이전 버전을 피하느라 불필요하게 좁아진다)
   사용: node run5.mjs --regen=morning[,sunset] */
const REGEN = new Set(process.argv.filter((a) => a.startsWith('--regen=')).flatMap((a) => a.slice(8).split(',')));
const SEEDED = [];
const books = {};
for (const slot of SLOTS) {
  const p = `${OUT}/book-${slot}.json`;
  if (REGEN.has(slot)) { console.log(`${slot}: 재생성 대상 — 이전 버전 선주입 제외`); continue; }
  if (existsSync(p)) { books[slot] = JSON.parse(readFileSync(p, 'utf8')); recordUsed(books[slot].sentences); SEEDED.push(slot); console.log(`${slot} 기존 책 로드 ${books[slot].sentences.length}문장`); }
}
for (const slot of SLOTS) {
  if (books[slot]) continue;
  try {
    books[slot] = await buildSlot(slot);
    books[slot]._meta = { regeneratedSlot: slot, seededFromSlots: [...SEEDED], excludedPriorVersion: REGEN.has(slot) };
    writeFileSync(`${OUT}/book-${slot}.json`, JSON.stringify(books[slot], null, 2));
    SEEDED.push(slot);
  } catch (e) {
    // 한 슬롯의 크래시가 나머지 슬롯을 죽이면 안 된다. 크래시 기록은 book-이 아닌 crash-로 남긴다
    // (book-으로 남기면 다음 실행 선주입이 재생성을 막는다).
    console.log(`⚠ ${slot} 슬롯 실행 크래시 — 다른 슬롯 계속: ${e.message}`);
    books[slot] = { slot, sentences: [], _gate: { pass: false, status: 'dropped', dropReasons: ['crash'], verdict: [String(e.message)], unresolved: [] } };
    writeFileSync(`${OUT}/crash-${slot}.json`, JSON.stringify({ slot, error: String(e.stack || e) }, null, 2));
  }
}

const adopted = Object.fromEntries(SLOTS.map((s) => [s, books[s]._gate.pass]));
const rows = EVENTS.map((ev) => {
  if (!adopted[ev.slot]) return { id: ev.id, slot: ev.slot, state: ev.state, target: ev.targetName, line: null, layer: 'RULE(슬롯 폐기)' };
  const { s, layer } = lookup(books[ev.slot], ev);
  return { id: ev.id, slot: ev.slot, weather: ev.weather, mood: ev.mood, state: ev.state, target: ev.targetName,
    line: s?.line ?? null, layer: layer ?? 'RULE', formGroup: s?.formGroup ?? null, focus: s?.focus ?? null };
});
const all = Object.values(books).flatMap((b) => b.sentences);
writeFileSync(OUT + '/report6.json', JSON.stringify({
  identity: IDENTITY_GENOME.byeoli, daily: DAILY, composed: GEN,
  gates: Object.fromEntries(SLOTS.map((s) => [s, books[s]._gate])), adopted, rows,
  totals: { 문장: all.length, 중복: all.length - new Set(all.map((s) => s.line)).size,
    관찰중복: all.length - new Set(all.map((s) => scopeOf(s.key) + '|' + normCore(s.core))).size,
    존댓말: all.filter((s) => HONORIFIC.test(s.line.trim())).length,
    평가조회: rows.filter((r) => r.line).length + '/30',
    exact: rows.filter((r) => r.layer === 'exact').length,
    특수폴백: rows.filter((r) => !r.line && (['rare', 'first', 'passed'].includes(r.state) || String(r.state).startsWith('trace'))).length },
  usage,
}, null, 2));
console.log('\n=== v3.2 실행 결과 (Observation 서명 인계 + critic) ===');
for (const s of SLOTS) console.log(` ${s}: ${adopted[s] ? 'PASS' : 'FAIL — ' + books[s]._gate.verdict.join(' / ')}`);
const T = JSON.parse(readFileSync(OUT + '/report6.json', 'utf8')).totals;
console.log(' 총계:', JSON.stringify(T));
console.log(T.중복 === 0 && T.관찰중복 === 0 ? ' 슬롯간 중복: 해결 (문장 0 · 관찰 0)' : ` ⚠ 슬롯간 중복 잔존: 문장 ${T.중복} · 관찰 ${T.관찰중복}`);
