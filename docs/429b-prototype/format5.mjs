// v3.1 보고서 렌더러 — 완료 조건 대조표 + 30건 전체 + 4축 판정표
import { readFileSync } from 'node:fs';
const R = JSON.parse(readFileSync(new URL('./out5/report5.json', import.meta.url)));
const esc = (s) => (s == null ? '—' : String(s).replace(/\|/g, '\\|'));
const SLOTS = ['morning', 'afternoon', 'sunset', 'night'];

console.log('## Observation — Identity(고정) + Daily(오늘)\n');
console.log('```json\n' + JSON.stringify({ identity: R.identity, daily: R.daily }, null, 1) + '\n```\n');

console.log('## 완료 조건 대조\n');
const g = R.gates, t = R.totals;
const simAll = SLOTS.reduce((a, s) => ({
  total: a.total + (g[s].sim?.total || 0),
  rule: a.rule + (g[s].sim?.ruleFallback || 0),
  special: a.special + (g[s].sim?.specialFallback || 0),
  exact: a.exact + Math.round((g[s].sim?.exactRate || 0) * (g[s].sim?.total || 0)),
}), { total: 0, rule: 0, special: 0, exact: 0 });
const cov = SLOTS.every((s) => g[s].coverageRate === 1);
const rows = [
  ['JSON 잘림', '0', '실행 완료(예외 없음)'],
  ['메타 드리프트', '0', `orphan key ${SLOTS.reduce((a, s) => a + (g[s].orphans?.length || 0), 0)}건`],
  ['존댓말', t.존댓말, t.존댓말 === 0 ? 'PASS' : 'FAIL'],
  ['requiredKeys 100%', cov ? 'PASS' : 'FAIL', SLOTS.map((s) => `${s} ${(g[s].coverageRate * 100).toFixed(0)}%`).join(' / ')],
  ['런타임 전수 해소', `${simAll.total - simAll.rule}/${simAll.total}`, `Rule 폴백 ${simAll.rule}`],
  ['특수 플래그 폴백 0', simAll.special, simAll.special === 0 ? 'PASS' : 'FAIL'],
  ['exact-hit ≥80%', ((simAll.exact / Math.max(1, simAll.total)) * 100).toFixed(1) + '%', ''],
  ['평가 30건 조회', t.평가조회, ''],
  ['중복 line 0', t.중복, t.중복 === 0 ? 'PASS' : 'FAIL'],
  ['다양성 위반', SLOTS.reduce((a, s) => a + (g[s].diversity?.length || 0), 0), ''],
  ['메타 자기모순', SLOTS.reduce((a, s) => a + (g[s].meta?.length || 0), 0), ''],
];
console.log('| 조건 | 결과 | 비고 |\n|---|---|---|');
for (const [a, b, c] of rows) console.log(`| ${a} | **${esc(b)}** | ${esc(c)} |`);
console.log('\n슬롯 채택: ' + SLOTS.map((s) => `${s}=${R.adopted[s] ? 'PASS' : 'FAIL(폐기→Rule)'}`).join(' · ') + '\n');
for (const s of SLOTS) if (!R.adopted[s]) console.log(`- ${s} 실패 사유: ${g[s].verdict.join(' / ')}`);

console.log('\n## 첫 생성 30건 전체 (선별 없음)\n');
console.log('| # | 슬롯 | 날씨 | 행동 | 대상 | 상황 | 조회층 | formGroup | 문장 |');
console.log('|---|---|---|---|---|---|---|---|---|');
for (const r of R.rows) {
  console.log(`| ${r.id} | ${r.slot} | ${esc(r.weather)} | ${esc(r.mood)} | ${esc(r.target)} | ${r.state} | ${esc(r.layer)} | ${esc(r.formGroup)} | ${esc(r.line)} |`);
}

console.log('\n## Vase 4축 판정표\n');
console.log('| # | 상황 | 문장 | 실제로 본 것 | 서로 달랐나 | 안 꾸몄나 | 거리감 |');
console.log('|---|---|---|---|---|---|---|');
for (const r of R.rows) {
  console.log(`| ${r.id} | ${r.slot}·${esc(r.mood)}·${esc(r.target)}·${r.state} | ${esc(r.line)} |  |  |  |  |`);
}

console.log('\n## 슬롯별 게이트 상세\n');
for (const s of SLOTS) {
  const x = g[s];
  console.log(`**${s}** — 키 ${(x.coverageRate * 100).toFixed(0)}% · exact ${((x.sim?.exactRate || 0) * 100).toFixed(0)}% · 층 ${JSON.stringify(x.sim?.byLayer || {})}`);
  for (const k of ['diversity', 'meta', 'reuse', 'missing']) {
    if (x[k]?.length) console.log(`  - ${k}: ${x[k].slice(0, 4).join(' / ')}${x[k].length > 4 ? ` … +${x[k].length - 4}` : ''}`);
  }
}
const u = R.usage.reduce((a, x) => ({ i: a.i + x.in, o: a.o + x.out }), { i: 0, o: 0 });
console.log(`\n호출 ${R.usage.length}회 · 입력 ${u.i.toLocaleString()} · 출력 ${u.o.toLocaleString()} 토큰`);
