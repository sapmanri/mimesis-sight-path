// 429-B v3.2 판정 — 저장된 out6/book-*.json만 근거로 삼는다 (실행 로그·완료 알림은 근거 아님).
// Vase 판정 순서 (2026-07-19):
//   1 생성 완결성 → 2 계약 유지 → 3 명시 위반 → 4 다양성 → 5 관찰 품질 → (그 뒤에야 B/C/D)
import { readFileSync, existsSync } from 'node:fs';
import { EVENTS } from './events.mjs';
import { buildRequiredKeys, lookup, gateReport } from './execution.mjs';
import { lintObservationGrammar, lintObservationWarnings, SENSE_CHANNELS, lintDiversity, coreVerb, FORM_KEYS } from './v3.mjs';

/* offline guard — 판정은 로컬 파일만 입출력한다. 네트워크는 전면 금지 (Vase 지시 2026-07-19). */
globalThis.fetch = () => { throw new Error('offline guard: analyze6는 네트워크를 사용하지 않는다'); };

const HERE = new URL('.', import.meta.url).pathname;
const DIR = process.argv[2] || HERE + 'out6';
const genome = JSON.parse(readFileSync(HERE + 'genome.json', 'utf8'));
const TOP = genome.topTargets;
const WEATHERS = Object.keys(genome.weatherMix);
const SLOTS = ['morning', 'afternoon', 'sunset', 'night'];

const scopeOf = (key) => key.split(':')[1];
const normCore = (c) => (c || '').replace(/\s+/g, '').replace(/[.,!?"']/g, '');
const firstTwo = (l) => l.trim().split(/\s+/).slice(0, 2).join(' ');
const pct = (n, d) => d ? (n / d * 100).toFixed(1) + '%' : '-';

const books = {};
for (const s of SLOTS) {
  const p = `${DIR}/book-${s}.json`;
  if (existsSync(p)) books[s] = JSON.parse(readFileSync(p, 'utf8'));
}
const present = SLOTS.filter((s) => books[s]);
if (!present.length) { console.error('책 없음:', DIR); process.exit(1); }
const all = present.flatMap((s) => books[s].sentences);

console.log(`=== v3.2 판정 (근거: ${DIR}, 슬롯 ${present.length}/4, ${all.length}문장) ===\n`);

/* ── 1. 생성 완결성 ─────────────────────────────────────────── */
console.log('[1] 생성 완결성');
for (const s of SLOTS) {
  if (!books[s]) { console.log(`  ${s}: ❌ 책 없음 (실행 미완/크래시)`); continue; }
  const g = books[s]._gate;
  const status = g.status || (g.pass ? 'adopted' : 'dropped');   // 구버전 책 호환
  console.log(`  ${s}: ${status === 'adopted' ? 'ADOPTED' : '🔴 DROPPED'} · 문장 ${books[s].sentences.length} · 커버리지 ${pct(g.coverageRate * 100, 100)}`
    + (g.unresolved?.length ? ` · 묶음 미해결 ${g.unresolved.length}건` : ''));
  if (status !== 'adopted') for (const v of g.verdict.slice(0, 6)) console.log(`      - ${v}`);
  if (g.unresolved) for (const u of g.unresolved.slice(0, 6)) console.log(`      미해결: ${typeof u === 'string' ? u : JSON.stringify(u)}`);
}

/* ── 2. 계약 유지 (재계산 — 저장 시점 수치를 믿지 않는다) ────── */
console.log('\n[2] 계약 유지 (현행 게이트 재계산)');
for (const s of present) {
  const required = buildRequiredKeys(s, TOP, WEATHERS);
  const evalRows = EVENTS.filter((e) => e.slot === s).map((ev) => ({ state: ev.state, line: lookup(books[s], ev).s?.line ?? null }));
  const gate = gateReport({ book: books[s], required, evalRows, topTargets: TOP });
  console.log(`  ${s}: exact ${pct(gate.sim.targetExactRate * 100, 100)} · special ${pct(gate.sim.specialResolutionRate * 100, 100)} · generic ${pct(gate.sim.genericResolutionRate * 100, 100)} · ruleFB ${gate.sim.ruleFallback} · 평가누락 ${evalRows.filter((r) => !r.line).length} · reuse위반 ${gate.reuse.length} · 메타모순 ${gate.meta.length}`);
  books[s]._recheck = gate;
}

/* ── 3. 명시 위반 상세 ───────────────────────────────────────── */
console.log('\n[3] 명시 위반');
let anyViol = false;
for (const s of present) {
  const g = books[s]._recheck;
  for (const e of g.reuse) { console.log(`  ${s} reuse: ${e}`); anyViol = true; }
  for (const e of g.meta) { console.log(`  ${s} meta: ${e}`); anyViol = true; }
  for (const c of (books[s]._gate.critic || [])) { console.log(`  ${s} critic 잔존: ${c.reason} — "${c.line}"`); anyViol = true; }
}
if (!anyViol) console.log('  없음');

/* ── 4. 다양성 ───────────────────────────────────────────────── */
console.log('\n[4] 다양성');
// 표면 중복 (슬롯 내+간)
const lineCount = {};
for (const s of present) for (const x of books[s].sentences) (lineCount[x.line] ||= []).push(s + ':' + x.key);
const lineDups = Object.entries(lineCount).filter(([, v]) => v.length > 1);
console.log(`  표면(문장) 중복: ${lineDups.length}건`);
for (const [l, v] of lineDups.slice(0, 8)) console.log(`    "${l}" — ${v.join(' · ')}`);
// core 중복 (exactSignature 층: scope+core)
const coreCount = {};
for (const s of present) for (const x of books[s].sentences) (coreCount[scopeOf(x.key) + '|' + normCore(x.core)] ||= []).push(`${s}·${x.line}`);
const coreDups = Object.entries(coreCount).filter(([, v]) => v.length > 1);
console.log(`  core 중복(같은 scope): ${coreDups.length}건`);
for (const [k, v] of coreDups.slice(0, 8)) console.log(`    ${k} — ${v.join(' / ')}`);
// verb 편중 (대상별)
const verbByScope = {};
for (const s of present) for (const x of books[s].sentences) ((verbByScope[scopeOf(x.key)] ||= {})[coreVerb(x.line)] ??= 0, verbByScope[scopeOf(x.key)][coreVerb(x.line)]++);
const verbSkew = [];
for (const [sc, m] of Object.entries(verbByScope)) {
  const total = Object.values(m).reduce((a, b) => a + b, 0);
  const [tv, tc] = Object.entries(m).sort((a, b) => b[1] - a[1])[0];
  if (total >= 6 && tc / total > 0.25) verbSkew.push(`${sc}: "${tv}" ${tc}/${total}`);
}
console.log(`  verb 편중(대상 내 25% 초과): ${verbSkew.length}건${verbSkew.length ? ' — ' + verbSkew.join(' · ') : ''}`);
// formGroup·focus 분포 (전체·슬롯별 과점)
const dist = (arr, f) => { const m = {}; for (const x of arr) m[f(x) || '-'] = (m[f(x) || '-'] || 0) + 1; return m; };
const fmt = (m, n) => Object.entries(m).sort((a, b) => b[1] - a[1]).map(([k, c]) => `${k} ${pct(c, n)}`).join(' · ');
console.log(`  formGroup 전체: ${fmt(dist(all, (x) => x.formGroup), all.length)}`);
console.log(`  focus 전체:     ${fmt(dist(all, (x) => x.focus), all.length)}`);
for (const s of present) {
  const S = books[s].sentences;
  const fg = Object.entries(dist(S, (x) => x.formGroup)).sort((a, b) => b[1] - a[1])[0];
  const fc = Object.entries(dist(S, (x) => x.focus)).sort((a, b) => b[1] - a[1])[0];
  const gram = lintObservationGrammar(S);
  const warn = lintObservationWarnings(S);
  const chan = {};
  for (const x of S) for (const [k, re] of Object.entries(SENSE_CHANNELS)) if (re.test(x.line)) chan[k] = (chan[k] || 0) + 1;
  console.log(`  ${s}: formGroup 최빈 ${fg[0]} ${pct(fg[1], S.length)} · focus 최빈 ${fc[0]} ${pct(fc[1], S.length)}`);
  console.log(`      감각 채널: ${Object.entries(chan).sort((a, b) => b[1] - a[1]).map(([k, c]) => `${k} ${pct(c, S.length)}`).join(' · ') || '-'}`);
  console.log(`      grammar(재설계판): ${gram.length ? '🔴 ' + gram.join(' / ') : 'PASS'}${warn.length ? ' · 경고: ' + warn.join(' / ') : ''}`);
}

/* ── 5. 관찰 품질 — 다른 말로 같은 생각을 반복했는가 ─────────── */
console.log('\n[5] 관찰 품질');
// 5a. semanticSignature 충돌 — focus+formGroup+core가 같은데 scope·슬롯만 다른 경우
//     (Vase: scope가 다르다는 이유로 같은 관찰이 중복 허용되면 안 된다 — 실제 발생 여부 실측)
const semCount = {};
for (const s of present) for (const x of books[s].sentences) {
  (semCount[`${x.focus}|${x.formGroup}|${normCore(x.core)}`] ||= []).push(`${s}·${scopeOf(x.key)}·"${x.line}"`);
}
const semDups = Object.entries(semCount).filter(([, v]) => v.length > 1);
console.log(`  5a. semanticSignature(focus+formGroup+core) 충돌: ${semDups.length}건`);
for (const [k, v] of semDups.slice(0, 10)) console.log(`    [${k.split('|').slice(0, 2).join('/')}] ${k.split('|')[2]} — ${v.join(' / ')}`);
// 5b. 시간대만 바뀐 동일 관찰 — 비교키에서 scope 제외 (Vase 보정):
//     focus+formGroup+core 동일 + 슬롯 상이. 5a와 겹쳐도 어느 슬롯 조합에서 반복됐는지 보는 진단 뷰.
const semSlot = {};
for (const s of present) for (const x of books[s].sentences) {
  const k = `${x.focus}|${x.formGroup}|${normCore(x.core)}`;
  (semSlot[k] ||= []).push({ slot: s, scope: scopeOf(x.key), line: x.line });
}
const crossSlotCore = Object.entries(semSlot)
  .map(([k, v]) => ({ semanticSignature: k, slots: [...new Set(v.map((x) => x.slot))], scopes: [...new Set(v.map((x) => x.scope))], count: v.length, lines: v.map((x) => x.line) }))
  .filter((r) => r.slots.length > 1);
console.log(`  5b. 시간대만 바뀐 동일 관찰(focus+formGroup+core, scope 제외, 슬롯 상이): ${crossSlotCore.length}건`);
for (const r of crossSlotCore.slice(0, 8)) console.log(`    ${JSON.stringify({ semanticSignature: r.semanticSignature, slots: r.slots, scopes: r.scopes, count: r.count })}`);
// 5c. 대상만 교체된 동일 구조 — 같은 focus+formGroup+핵심동사+첫두어절 구조가 3개 이상 scope에 반복
const structCount = {};
for (const s of present) for (const x of books[s].sentences) {
  const sig = `${x.focus}|${x.formGroup}|${coreVerb(x.line)}`;
  (structCount[sig] ||= new Set()).add(scopeOf(x.key) + '§' + x.line);
}
const structRep = Object.entries(structCount)
  .map(([k, set]) => [k, [...set]])
  .filter(([, v]) => new Set(v.map((x) => x.split('§')[0])).size >= 3 && v.length >= 4)
  .sort((a, b) => b[1].length - a[1].length);
console.log(`  5c. 대상만 교체된 동일 구조(focus+formGroup+동사, 3개 scope 이상·4문장 이상): ${structRep.length}건`);
for (const [k, v] of structRep.slice(0, 6)) console.log(`    [${k}] ${v.length}문장/${new Set(v.map((x) => x.split('§')[0])).size}scope — 예: ${v.slice(0, 3).map((x) => '"' + x.split('§')[1] + '"').join(' · ')}`);
// 5d. 인식 구조 단조 — 첫 두 어절 패턴 상위
const headCount = dist(all, (x) => firstTwo(x.line));
const headTop = Object.entries(headCount).sort((a, b) => b[1] - a[1]).slice(0, 5);
console.log(`  5d. 첫 두 어절 최빈: ${headTop.map(([k, c]) => `"${k}" ${c}회`).join(' · ')}`);

console.log('\n판정 요약');
const drop = SLOTS.filter((s) => !books[s] || !(books[s]._gate.status ? books[s]._gate.status === 'adopted' : books[s]._gate.pass));
console.log(`  탈락/부재 슬롯: ${drop.length ? drop.join(', ') : '없음'}`);
console.log(`  표면 중복 ${lineDups.length} · core 중복 ${coreDups.length} (슬롯간 ${crossSlotCore.length}) · semantic 충돌 ${semDups.length} · 구조 반복 ${structRep.length}`);
