// BUILD 430 — Parallel Lives 계약 검증기
//
// 두 하드룰을 코드에서 강제한다.
//   ① 서로를 기록하지 않는다 — 어느 문장 풀에도 상대(별이/빼콩)가 등장하지 않는다.
//   ② 세계는 둘보다 크다 — update()는 어떤 조기 return보다 먼저 sky.tick을 부른다.
// 작업수칙 4: 검증기 자신을 음성 테스트로 검증한다 (맨 아래 SELFTEST).

import { readFileSync } from 'node:fs';

const FILE = process.argv[2] || 'public/byeoli-walk/index.html';   // 인자는 음성 테스트용(변조본 검사)
const src = readFileSync(FILE, 'utf8');
const errors = [];

/** `const NAME=[ '...','...' ]` 형태에서 문자열 리터럴만 뽑는다 */
function poolOf(name, text) {
  const m = new RegExp(`const ${name}\\s*=\\s*\\[([\\s\\S]*?)\\];`).exec(text);
  if (!m) return null;
  return [...m[1].matchAll(/'([^']*)'/g)].map((x) => x[1]);
}
/** PPAE_RULES / PPAE_FALLBACK 안의 lines·short 배열 전부 */
function ruleLines(text) {
  const out = [];
  for (const block of text.matchAll(/(?:lines|short)\s*:\s*\[([^\]]*)\]/g)) {
    out.push(...[...block[1].matchAll(/'([^']*)'/g)].map((x) => x[1]));
  }
  return out;
}

const FORBIDDEN = ['별이', '빼콩', 'byeoli', 'bbaekkong', 'ppae'];
/** 상대를 지목하는 표현이 문장에 있는가 (관찰 문장 전용 검사) */
export function mentionsOther(line) {
  const l = String(line).toLowerCase();
  return FORBIDDEN.some((w) => l.includes(w.toLowerCase()));
}

// ── ① 문장 풀 검사 ──────────────────────────────────────────────
const pools = {
  PPAE_TRACE_WARM: poolOf('PPAE_TRACE_WARM', src),
  BYEOL_TRACE_MOVED: poolOf('BYEOL_TRACE_MOVED', src),
};
for (const [name, lines] of Object.entries(pools)) {
  if (!lines || lines.length === 0) { errors.push(`${name} 문장 풀을 찾지 못했습니다 (430 계약 소스 누락)`); continue; }
  for (const line of lines) {
    if (mentionsOther(line)) errors.push(`${name}: 상대를 지목하는 문장 — "${line}"`);
  }
}
for (const line of ruleLines(src)) {
  if (mentionsOther(line)) errors.push(`빼콩 룰 문장: 상대를 지목하는 문장 — "${line}"`);
}

// ── ② 세계는 둘보다 크다 ────────────────────────────────────────
const upd = /function update\(dt\)\{([\s\S]*?)\n\}/.exec(src);
if (!upd) {
  errors.push('update(dt) 함수를 찾지 못했습니다');
} else {
  const body = upd[1];
  const firstReturn = body.indexOf('return');
  const skyAt = body.indexOf('sky.tick');
  const ppaeAt = body.indexOf('ppae.tick');
  if (skyAt < 0) errors.push('update()에 sky.tick 호출이 없습니다 — 세계가 멈춥니다');
  else if (firstReturn >= 0 && skyAt > firstReturn) errors.push('sky.tick이 조기 return 뒤에 있습니다 — 스칠 때 세계가 멈춥니다');
  if (ppaeAt < 0) errors.push('update()에 ppae.tick 호출이 없습니다');
  else if (firstReturn >= 0 && ppaeAt > firstReturn) errors.push('ppae.tick이 조기 return 뒤에 있습니다');
}

// ── ③ 스쳐 지나감 경로에 기록이 없어야 한다 ──────────────────────
const passBlock = /430 ①② 스쳐 지나감[\s\S]*?\n\s*\}/.exec(src);
if (!passBlock) errors.push('430 스쳐 지나감 블록을 찾지 못했습니다');
else if (/observe\(|Diary|pushMsg\(/.test(passBlock[0])) {
  errors.push('스쳐 지나감에서 기록이 발생합니다 — "대화 없음. 기록 없음." 계약 위반');
}

// ── 음성 테스트: 검증기가 위반을 실제로 잡는가 ────────────────────
const SELFTEST = [
  ['빼콩이가 지나갔다.', true],
  ['별이를 만났다.', true],
  ['아직 따뜻했다.', false],
  ['한쪽으로 굴러 있었다', false],
];
for (const [line, shouldFail] of SELFTEST) {
  if (mentionsOther(line) !== shouldFail) {
    errors.push(`검증기 자체 오류(음성 테스트 실패): "${line}" 판정이 기대와 다릅니다`);
  }
}

if (errors.length) {
  console.error('validate:parallel FAILED');
  for (const e of errors) console.error(' - ' + e);
  process.exit(1);
}
console.log(`validate:parallel OK — 문장 풀 ${Object.values(pools).flat().length}개 · 세계 우선 · 무기록 스침 · 음성 테스트 ${SELFTEST.length}건`);
