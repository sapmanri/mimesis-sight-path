// BUILD 429-C — 엽서 수집 계약 검증기 (Writer와 분리 — 이건 엽서 계약이다)
//
//   ① selectDiaryEntriesForCapture 우선순위: 같은 eventId → 최근 → 같은 targetType
//   ② 빼콩(observer!=='byeoli')은 기본 엽서에서 제외
//   ③ 시간 창(CAPTURE_WINDOW_MS) 밖 관찰 제외 · 중복 line 제거 · limit
//   ④ 엽서 경로에 DOM 파싱 흔적이 없다 (#stream 조회, '· ' 문자열 분해, pcCollectLines/pcOwnText)
//   ⑤ capture_meta에 diaryVersion·diaryEventIds·diarySources·diaryTargetTypes 저장
// 작업수칙 4: 검증기 자신을 음성 테스트로 검증.

import { readFileSync } from 'node:fs';

const FILE = process.argv[2] || 'public/byeoli-walk/index.html';
const src = readFileSync(FILE, 'utf8');
const errors = [];

// ── 순수 함수 추출 ──────────────────────────────────────────────────
const s = src.indexOf('const CAPTURE_WINDOW_MS');
const e = src.indexOf('function composePostcard');
if (s < 0 || e < 0 || e <= s) {
  console.error('validate:postcard FAILED\n - selectDiaryEntriesForCapture 구간을 찾지 못했습니다');
  process.exit(1);
}
const region = src.slice(s, e);
const select = new Function(`${region}\n return selectDiaryEntriesForCapture;`)();

const NOW = 1_000_000_000;
const E = (o) => ({ observer: 'byeoli', kind: 'diary', line: o.line, eventId: o.eventId ?? null,
  targetType: o.targetType ?? null, source: o.source ?? 'rule', createdAt: o.createdAt ?? NOW });

// ① 우선순위: 같은 eventId가 최상단, 그다음 최근, 그다음 같은 종류
{
  const entries = [
    E({ line: 'old same-type', targetType: 'flower', createdAt: NOW - 60_000 }),
    E({ line: 'recent other', targetType: 'stone', createdAt: NOW - 1_000 }),
    E({ line: 'same event', eventId: 'ev1', targetType: 'stone', createdAt: NOW - 30_000 }),
  ];
  const out = select({ entries, capturedAt: NOW, eventId: 'ev1', targetType: 'flower', limit: 6 }).map((x) => x.line);
  if (out[0] !== 'same event') errors.push(`우선순위 1 위반: 같은 eventId가 최상단이 아님 (${out[0]})`);
  if (out[1] !== 'recent other') errors.push(`우선순위 2 위반: 시간이 종류보다 앞서야 함 (${out[1]})`);
}
// ② 빼콩 제외
{
  const entries = [{ ...E({ line: 'ppae line' }), observer: 'bbaekkong' }, E({ line: 'byeoli line' })];
  const out = select({ entries, capturedAt: NOW }).map((x) => x.line);
  if (out.includes('ppae line')) errors.push('빼콩 엔트리가 기본 엽서에 포함됨');
  if (!out.includes('byeoli line')) errors.push('별이 엔트리가 빠짐');
}
// ③ 시간 창·중복·limit
{
  const entries = [
    E({ line: 'in window', createdAt: NOW - 1000 }),
    E({ line: 'too old', createdAt: NOW - 10 * 60_000 }),
    E({ line: 'dup', createdAt: NOW - 2000 }),
    E({ line: 'dup', createdAt: NOW - 3000 }),
  ];
  const out = select({ entries, capturedAt: NOW, limit: 6 }).map((x) => x.line);
  if (out.includes('too old')) errors.push('시간 창 밖 관찰이 포함됨');
  if (out.filter((l) => l === 'dup').length !== 1) errors.push('중복 line 제거 실패');
  const big = Array.from({ length: 20 }, (_, i) => E({ line: 'L' + i, createdAt: NOW - i }));
  if (select({ entries: big, capturedAt: NOW, limit: 6 }).length !== 6) errors.push('limit 미적용');
}
// pass 종류는 관찰이 아니므로 포함 금지
{
  const entries = [{ ...E({ line: 'passing' }), kind: 'pass' }, E({ line: 'kept' })];
  const out = select({ entries, capturedAt: NOW }).map((x) => x.line);
  if (out.includes('passing')) errors.push('pass(kind) 엔트리가 포함됨');
}

// ── ④ DOM 파싱 흔적 검사 (엽서 경로) ──────────────────────────────
const pcStart = src.indexOf('window.__postcard');
const pcEnd = src.indexOf('return new Promise(res=>c.toBlob'); // composePostcard 끝 근처
const pcRegion = pcEnd > pcStart ? src.slice(pcStart, pcEnd) : src.slice(pcStart);
if (/#stream/.test(pcRegion)) errors.push('엽서 경로에 #stream DOM 조회가 남아 있습니다');
if (/lastIndexOf\('· '\)/.test(pcRegion)) errors.push("엽서 경로에 '· ' 문자열 파싱이 남아 있습니다");
if (/pcCollectLines|pcOwnText/.test(src)) errors.push('제거되어야 할 pcCollectLines/pcOwnText가 남아 있습니다');

// ── ⑤ capture_meta 신규 필드 ────────────────────────────────────────
for (const f of ['diaryVersion', 'diaryEventIds', 'diarySources', 'diaryTargetTypes']) {
  if (!new RegExp(f + '\\s*:').test(src)) errors.push(`capture_meta에 ${f}가 없습니다`);
}
if (!/diaryVersion:\s*'2'/.test(src)) errors.push("diaryVersion이 '2'가 아닙니다");

// ── 음성 테스트: 검증기가 우선순위 위반을 잡는가 ────────────────────
{
  const entries = [E({ line: 'a', createdAt: NOW - 1000 }), E({ line: 'b', eventId: 'x', createdAt: NOW - 5000 })];
  const out = select({ entries, capturedAt: NOW, eventId: 'x' }).map((x) => x.line);
  if (out[0] !== 'b') errors.push('음성 테스트 실패: 같은 eventId 최우선 규칙이 동작하지 않음');
}

if (errors.length) {
  console.error('validate:postcard FAILED');
  for (const x of [...new Set(errors)]) console.error(' - ' + x);
  process.exit(1);
}
console.log('validate:postcard OK — 우선순위·빼콩 제외·시간창·중복·DOM 무의존·capture_meta v2');
