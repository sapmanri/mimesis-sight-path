// 429-B 비교 실험 — 동일 30사건 · 동일 DailyContext · 동일 생성기
//   B. v2.1 부분 폐쇄        (voice.mjs)
//   C. v3 완전 정규화 + MediumGrammar (v3.mjs)
//   D. v3 + dry-report 계약  (같은 생성기, 다른 정체성)
// ⚠ 시드 고정 불가: Opus 4.8은 temperature/top_p를 받지 않는다(400).
//    대신 사건·문맥·프롬프트를 완전히 동일하게 유지해 변수를 계약으로만 한정한다.
import Anthropic from '@anthropic-ai/sdk';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { EVENTS, SLOT_PHASE } from './events.mjs';
import { CONTRACT_SCHEMA as V21_SCHEMA, CONTRACT_SYSTEM as V21_SYSTEM, lintVoiceContract, generatorSystem as genV21 } from './voice.mjs';
import { VOICE_SCHEMA, lintVoice, generatorSystemV3, lintDiversity, DRY_REPORT, FORM_KEYS, lengthRange } from './v3.mjs';

const HERE = new URL('.', import.meta.url).pathname;
const OUT = HERE + 'out3'; mkdirSync(OUT, { recursive: true });
const client = new Anthropic();
const MODEL = 'claude-opus-4-8';
const genome = JSON.parse(readFileSync(HERE + 'genome.json', 'utf8'));
const SLOTS = ['morning', 'afternoon', 'sunset', 'night'];
const usage = [];

/* 동일 DailyContext — 세 변형이 같은 세계를 본다 */
const CTX = {
  season: genome.season,
  weather: Object.keys(genome.weatherMix),
  topTargets: genome.topTargets.map((t) => t.name),
  moodMix: genome.moodMix,
};

async function ask({ system, user, schema, maxTokens = 24000, effort = 'high', tag }) {
  const s = client.messages.stream({
    model: MODEL, max_tokens: maxTokens, thinking: { type: 'adaptive' },
    output_config: { effort, ...(schema ? { format: { type: 'json_schema', schema } } : {}) },
    system, messages: [{ role: 'user', content: user }],
  });
  const m = await s.finalMessage();
  if (m.stop_reason === 'refusal') throw new Error('refusal ' + JSON.stringify(m.stop_details));
  usage.push({ tag, in: m.usage.input_tokens, out: m.usage.output_tokens });
  return m.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
}

const bookSchema = (withForm) => ({
  type: 'object', additionalProperties: false, required: ['slot', 'sentences'],
  properties: { slot: { type: 'string' }, sentences: { type: 'array', items: {
    type: 'object', additionalProperties: false,
    required: ['id', 'line', 'targetType', 'targetName', 'mood', 'slot', 'weatherAllowed', 'weatherDenied', 'eventFlags', 'traceType', ...(withForm ? ['formGroup'] : [])],
    properties: {
      id: { type: 'string' }, line: { type: 'string' },
      targetType: { type: ['string', 'null'] }, targetName: { type: ['string', 'null'] },
      mood: { type: 'string' }, slot: { type: 'string' },
      weatherAllowed: { type: 'array', items: { type: 'string' } },
      weatherDenied: { type: 'array', items: { type: 'string' } },
      eventFlags: { type: 'array', items: { type: 'string' } },
      traceType: { type: ['string', 'null'] },
      ...(withForm ? { formGroup: { type: 'string', enum: FORM_KEYS } } : {}),
    } } } },
});

function bookUser(slot, withForm) {
  const top = genome.topTargets.slice(0, 8);
  return `[오늘 자주 만난 것] (출처: ${genome.targetBasis} ${genome.sampleWindow})
${top.map((t) => `- ${t.type} (${t.name}, ${t.cat})`).join('\n')}

${slot} 슬롯 문장집 (약 112문장):
1층 위 8종 × mood 4(observe/wonder/rest/photo) × 2문장 → targetType/targetName 채움
2층 카테고리 4(nature/rest/animal/thing) × mood 4 × 2문장 → targetType/targetName은 null
3층 상황 16 → rare 4(eventFlags:["rare"]) / passed 4(["passed"]) / first 4(["first"]) / trace 4(traceType "warm"2,"moved"2)
weatherAllowed·weatherDenied는 문장 내용에 맞게 채운다.${withForm ? '\nformGroup은 각 문장의 문형군 슬러그(내부 메타 — 문장 안에 쓰지 말 것).' : ''}`;
}

/* ── B: v2.1 계약 ────────────────────────────────────────────── */
async function contractB() {
  const p = OUT + '/contract-B.json';
  if (existsSync(p)) return JSON.parse(readFileSync(p, 'utf8'));
  let raw, errs, n = 0;
  do {
    n++;
    const fix = errs?.length ? `\n\n이전 시도 린트 위반:\n${errs.slice(0, 10).join('\n')}` : '';
    raw = JSON.parse(await ask({ system: V21_SYSTEM, schema: V21_SCHEMA, maxTokens: 6000, tag: 'B:contract' + n,
      user: `voicePack: "byeoli" — 별에서 온 존재가 작은 행성을 걸으며 사물을 관찰한다. 주인공은 세상이다.\n\nDailyGenome:\n${JSON.stringify(genome, null, 1)}${fix}` }));
    errs = lintVoiceContract(raw);
    console.log(`B 계약 시도 ${n}: 위반 ${errs.length}`);
  } while (errs.length && n < 3);
  writeFileSync(p, JSON.stringify(raw, null, 2));
  return raw;
}

/* ── C: v3 계약 (정규화 값만) ─────────────────────────────────── */
async function contractC() {
  const p = OUT + '/contract-C.json';
  if (existsSync(p)) return JSON.parse(readFileSync(p, 'utf8'));
  let raw, errs, n = 0;
  const sys = `너는 문장 생성기가 읽을 **정규화된 규칙표**를 만든다. 서술·문장·대상 이름을 쓰지 않는다.
모든 값은 정해진 열거값 중에서만 고른다. focusOrder는 지각 채널의 우선순위(앞이 먼저)다.
출력: VoiceContract JSON 하나만.`;
  do {
    n++;
    const fix = errs?.length ? `\n\n이전 시도 위반:\n${errs.join('\n')}` : '';
    raw = JSON.parse(await ask({ system: sys, schema: VOICE_SCHEMA, maxTokens: 4000, tag: 'C:contract' + n,
      user: `voicePack "byeoli" — 별에서 온 존재가 작은 행성을 천천히 걸으며 사물을 관찰한다. 주인공은 세상이다.\n오늘의 세계: ${JSON.stringify(CTX)}${fix}` }));
    errs = lintVoice(raw);
    console.log(`C 계약 시도 ${n}: 위반 ${errs.length}`);
  } while (errs.length && n < 3);
  writeFileSync(p, JSON.stringify(raw, null, 2));
  return raw;
}

/* ── 문장집 ──────────────────────────────────────────────────── */
async function book(variant, contract, slot) {
  const p = `${OUT}/${variant}-${slot}.json`;
  if (existsSync(p)) { const b = JSON.parse(readFileSync(p, 'utf8')); console.log(`  ${variant}-${slot} 재사용 ${b.sentences.length}`); return b; }
  const v3 = variant !== 'B';
  const sys = v3
    ? generatorSystemV3(contract, CTX, slot, SLOT_PHASE[slot], null)
    : genV21(contract, slot, SLOT_PHASE[slot], genome.season, (contract.slotShifts || []).find((s) => s.slot === slot));
  const t = await ask({ system: sys, user: bookUser(slot, v3), schema: bookSchema(v3), tag: `${variant}:${slot}` });
  const b = JSON.parse(t);
  writeFileSync(p, JSON.stringify(b, null, 2));
  console.log(`  ${variant}-${slot}: ${b.sentences.length}문장`);
  return b;
}

/* ── 조회 (A와 동일 로직) ─────────────────────────────────────── */
function pick(bk, ev) {
  const ok = (s) => {
    if (s.weatherDenied?.includes(ev.weather)) return false;
    if (s.weatherAllowed?.length && !s.weatherAllowed.includes(ev.weather)) return false;
    const wantTrace = ev.state.startsWith('trace-') ? ev.state.slice(6) : null;
    if ((s.traceType || null) !== wantTrace) return false;
    for (const f of ['rare', 'passed', 'first']) if ((ev.state === f) !== (s.eventFlags || []).includes(f)) return false;
    return s.mood === ev.mood;
  };
  const l1 = ev.targetType ? bk.sentences.filter((s) => ok(s) && s.targetType === ev.targetType) : [];
  if (l1.length) return l1[0];
  const l2 = bk.sentences.filter((s) => ok(s) && !s.targetType);
  if (l2.length) return l2[0];
  const l3 = bk.sentences.filter((s) => (s.eventFlags || []).length || s.traceType);
  return ev.layer === 3 && l3.length ? l3[0] : null;
}

/* ── 실행 ────────────────────────────────────────────────────── */
console.log('B 계약(v2.1 부분 폐쇄)...'); const cB = await contractB();
console.log('C 계약(v3 완전 정규화)...'); const cC = await contractC();
const cD = DRY_REPORT;
writeFileSync(OUT + '/contract-D.json', JSON.stringify(cD, null, 2));

const books = { B: {}, C: {}, D: {} };
for (const [variant, contract] of [['B', cB], ['C', cC], ['D', cD]]) {
  console.log(`${variant} 문장집...`);
  for (const slot of SLOTS) books[variant][slot] = await book(variant, contract, slot);
}

const diversity = {};
for (const v of ['B', 'C', 'D']) {
  diversity[v] = Object.fromEntries(SLOTS.map((s) => [s, v === 'B' ? ['(v2.1엔 formGroup 없음 — 문형 검사 불가)'] : lintDiversity(books[v][s].sentences)]));
}

const rows = EVENTS.map((ev) => ({
  ev,
  B: pick(books.B[ev.slot], ev)?.line ?? null,
  C: pick(books.C[ev.slot], ev)?.line ?? null,
  D: pick(books.D[ev.slot], ev)?.line ?? null,
  Cform: pick(books.C[ev.slot], ev)?.formGroup ?? null,
  Dform: pick(books.D[ev.slot], ev)?.formGroup ?? null,
}));

writeFileSync(OUT + '/report3.json', JSON.stringify({
  contracts: { B: cB, C: cC, D: cD },
  lint: { B: lintVoiceContract(cB), C: lintVoice(cC), D: lintVoice(cD) },
  diversity, rows, usage,
  note: '시드 고정 불가(Opus 4.8은 sampling 파라미터 미수용). 사건·문맥·프롬프트만 동일 고정.',
}, null, 2));
console.log('\n완료 →', OUT + '/report3.json');
for (const v of ['B', 'C', 'D']) {
  const miss = rows.filter((r) => !r[v]).length;
  const div = Object.values(diversity[v]).flat().filter((x) => !x.startsWith('(')).length;
  console.log(`${v}: 조회실패 ${miss}/30 · 다양성 위반 ${div}`);
}
