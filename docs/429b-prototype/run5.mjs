// 429-B v3.1 재실행 — 계약이 메타를 소유하고, 생성기는 문장만 만든다.
//   ① 출력 축소: {key, line, formGroup}
//   ② 메타는 requiredKeys에서 조인 (드리프트 구조상 불가)
//   ③ Byeoli Identity Genome 강제
//   ④ 20~30 키 단위 분할 생성 (JSON 잘림 방지) → 묶음 검증 → 합치기 → 슬롯 전체 검증
import Anthropic from '@anthropic-ai/sdk';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { EVENTS, SLOT_PHASE } from './events.mjs';
import { composeGenome, IDENTITY_GENOME, FORM_KEYS, FORM_GROUPS, DIVERSITY, lintDiversity, lengthRange } from './v3.mjs';
import { buildRequiredKeys, joinMeta, lookup, gateReport } from './execution.mjs';

const HERE = new URL('.', import.meta.url).pathname;
const OUT = HERE + 'out5'; mkdirSync(OUT, { recursive: true });
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
const OUT_SCHEMA = {
  type: 'object', additionalProperties: false, required: ['sentences'],
  properties: { sentences: { type: 'array', items: {
    type: 'object', additionalProperties: false, required: ['key', 'line', 'formGroup'],
    properties: { key: { type: 'string' }, line: { type: 'string' }, formGroup: { type: 'string', enum: FORM_KEYS } },
  } } },
};

async function ask({ system, user, schema, maxTokens = 12000, tag }) {
  const s = client.messages.stream({ model: MODEL, max_tokens: maxTokens, thinking: { type: 'adaptive' },
    output_config: { effort: 'high', format: { type: 'json_schema', schema } },
    system, messages: [{ role: 'user', content: user }] });
  const m = await s.finalMessage();
  if (m.stop_reason === 'refusal') throw new Error('refusal');
  if (m.stop_reason === 'max_tokens') throw new Error('출력 잘림 — 묶음을 더 줄여야 한다');
  usage.push({ tag, in: m.usage.input_tokens, out: m.usage.output_tokens });
  return JSON.parse(m.content.filter((b) => b.type === 'text').map((b) => b.text).join(''));
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

[상황 의미]
rare   = 드물게 만난 대상의 **구체적 특징**. 날씨 묘사 금지. 놀랐다·행운 금지.
passed = 멈추지 않았다. 가까이 봤다·앉았다·찍었다 같은 행동을 말하지 않는다.
trace warm = 남은 온기·눌린 자리 / trace moved = 자리가 달라짐. **누가 그랬는지 추정 금지.**

[출력] 각 요청 키마다 {key, line, formGroup}만 반환한다.
메타(대상·카테고리·mood·플래그·날씨)는 계약이 이미 갖고 있으니 다시 쓰지 않는다.
한 줄·두 문장 금지·줄바꿈 금지·이모지/해시태그/URL/따옴표 금지.`;
}

const keyLine = (k) => `${k.key} → 대상 ${k.targetName || '(이름 없음, ' + k.category + ' 무엇에나)'} · ${k.mood === 'any' ? '상황 전용' : 'mood=' + k.mood}${k.eventFlag !== 'normal' ? ' · ' + k.eventFlag : ''}${k.traceType ? ' · trace=' + k.traceType : ''} · ${k.count}문장`;

const HONORIFIC = /(요|습니다|네요|어요|아요|세요)\s*$/;

async function buildSlot(slot) {
  const p = `${OUT}/book-${slot}.json`;
  if (existsSync(p)) { const b = JSON.parse(readFileSync(p, 'utf8')); console.log(`${slot} 재사용 ${b.sentences.length}`); return b; }
  const required = buildRequiredKeys(slot, TOP, WEATHERS);
  const chunks = [];
  for (let i = 0; i < required.length; i += CHUNK) chunks.push(required.slice(i, i + CHUNK));
  console.log(`${slot}: 키 ${required.length} → ${chunks.length}묶음`);

  const gen = [];
  for (let ci = 0; ci < chunks.length; ci++) {
    const ch = chunks[ci];
    let got, n = 0, bad = [];
    do { n++;
      const retry = bad.length ? `\n\n**이전 시도 문제 — 반드시 고쳐라:**\n${bad.slice(0, 12).join('\n')}` : '';
      const r = await ask({ system: system(slot), schema: OUT_SCHEMA, maxTokens: 12000, tag: `${slot}#${ci + 1}:${n}`,
        user: `요청 키 ${ch.length}개 (총 ${ch.reduce((a, k) => a + k.count, 0)}문장):\n${ch.map(keyLine).join('\n')}${retry}` });
      got = r.sentences;
      // 묶음 검증: 키 충족 · 존댓말 · 길이 · 중복
      bad = [];
      const want = Object.fromEntries(ch.map((k) => [k.key, k.count]));
      const have = {};
      for (const g of got) have[g.key] = (have[g.key] || 0) + 1;
      for (const [k, c] of Object.entries(want)) if ((have[k] || 0) < c) bad.push(`키 미충족: ${k} (필요 ${c}, 있음 ${have[k] || 0})`);
      for (const g of got) {
        if (!want[g.key]) bad.push(`요청에 없는 키: ${g.key}`);
        if (HONORIFIC.test(g.line.trim())) bad.push(`존댓말: "${g.line}"`);
        const kk = ch.find((x) => x.key === g.key);
        const st = kk?.traceType ? 'trace' : (kk?.eventFlag !== 'normal' ? kk?.eventFlag : 'normal');
        const rg = lengthRange(st);
        if (g.line.length < rg.min || g.line.length > rg.max) bad.push(`길이 ${g.line.length} (${st}: ${rg.min}~${rg.max}) "${g.line}"`);
      }
      const seen = new Set(); for (const g of got) { if (seen.has(g.line)) bad.push(`중복: "${g.line}"`); seen.add(g.line); }
      console.log(`  ${slot} 묶음 ${ci + 1}/${chunks.length} 시도 ${n}: ${got.length}문장 · 문제 ${bad.length}`);
    } while (bad.length && n < 3);
    if (bad.length) { console.log(`  ⚠ 묶음 ${ci + 1} 미해결 ${bad.length}건 — 슬롯 폐기 대상`); }
    gen.push(...got);
  }

  const { sentences, orphans } = joinMeta(required, gen);
  const book = { slot, sentences, orphans };
  const evalRows = EVENTS.filter((e) => e.slot === slot).map((ev) => ({ state: ev.state, line: lookup(book, ev).s?.line ?? null }));
  const gate = gateReport({ book, required, evalRows, topTargets: TOP });
  book._gate = { pass: gate.pass, verdict: gate.verdict, coverageRate: gate.coverage.rate,
    missing: gate.coverage.missing.slice(0, 10), orphans: orphans.slice(0, 10),
    sim: { total: gate.sim.total, byLayer: gate.sim.byLayer, ruleFallback: gate.sim.ruleFallback, specialFallback: gate.sim.specialFallback, exactRate: gate.sim.exactRate },
    reuse: gate.reuse.slice(0, 8), meta: gate.meta.slice(0, 8), diversity: lintDiversity(sentences).slice(0, 8),
    honorific: sentences.filter((s) => HONORIFIC.test(s.line.trim())).length };
  writeFileSync(p, JSON.stringify(book, null, 2));
  console.log(`${slot}: ${sentences.length}문장 · 키 ${(gate.coverage.rate * 100).toFixed(1)}% · ${gate.pass ? 'PASS' : 'FAIL(' + gate.verdict.length + ')'}`);
  return book;
}

const books = {};
for (const slot of SLOTS) books[slot] = await buildSlot(slot);

const adopted = Object.fromEntries(SLOTS.map((s) => [s, books[s]._gate.pass]));
const rows = EVENTS.map((ev) => {
  if (!adopted[ev.slot]) return { id: ev.id, slot: ev.slot, state: ev.state, target: ev.targetName, line: null, layer: 'RULE(슬롯 폐기)' };
  const { s, layer } = lookup(books[ev.slot], ev);
  return { id: ev.id, slot: ev.slot, weather: ev.weather, mood: ev.mood, state: ev.state, target: ev.targetName,
    line: s?.line ?? null, layer: layer ?? 'RULE', formGroup: s?.formGroup ?? null };
});
const all = Object.values(books).flatMap((b) => b.sentences);
writeFileSync(OUT + '/report5.json', JSON.stringify({
  identity: IDENTITY_GENOME.byeoli, daily: DAILY, composed: GEN,
  gates: Object.fromEntries(SLOTS.map((s) => [s, books[s]._gate])), adopted, rows,
  totals: { 문장: all.length, 중복: all.length - new Set(all.map((s) => s.line)).size,
    존댓말: all.filter((s) => HONORIFIC.test(s.line.trim())).length,
    평가조회: rows.filter((r) => r.line).length + '/30',
    exact: rows.filter((r) => r.layer === 'exact').length,
    특수폴백: rows.filter((r) => !r.line && (['rare', 'first', 'passed'].includes(r.state) || String(r.state).startsWith('trace'))).length },
  usage,
}, null, 2));
console.log('\n=== v3.1 재실행 결과 ===');
for (const s of SLOTS) console.log(` ${s}: ${adopted[s] ? 'PASS' : 'FAIL — ' + books[s]._gate.verdict.join(' / ')}`);
console.log(' 총계:', JSON.stringify(JSON.parse(readFileSync(OUT + '/report5.json', 'utf8')).totals));
