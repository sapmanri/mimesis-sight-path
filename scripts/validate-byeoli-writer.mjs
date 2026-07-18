// BUILD 429-A — ByeoliWriter 경계 회귀 검증기
//
// 완료 조건을 코드로 고정한다.
//   ① 기존 Rule 출력과 Writer 출력이 전수 동일 (같은 seed·같은 입력)
//   ② source='rule' · bookId=null · bookSlot=null
//   ③ 형식 불량은 전부 폴백 대상으로 판정된다 (null·예외·Promise·빈 문장·공백·
//      observer 불일치·source 불량·길이 초과)
//   ④ slot 계산은 resolveDiarySlot 한 곳 (하늘 단계와 모순 없음)
//   ⑤ 정규화된 trace에 생성 주체(by)가 새어나가지 않는다
// 작업수칙 4: 검증기 자신을 음성 테스트로 검증한다 (아래 NEGATIVE).

import { readFileSync } from 'node:fs';

const FILE = process.argv[2] || 'public/byeoli-walk/index.html';
const src = readFileSync(FILE, 'utf8');
const errors = [];

// ── 429-A 경계 구간만 추출해 실행 (DOM 의존 없는 순수 계층) ──────────
const START = 'const D={';
const END = '/* --- 429-A 경계 끝';
const s = src.indexOf(START), e = src.indexOf(END);
if (s < 0 || e < 0 || e <= s) {
  console.error('validate:writer FAILED\n - 429-A 경계 구간을 찾지 못했습니다 (마커 누락)');
  process.exit(1);
}
let region = src.slice(s, e);
// maybeDiary/diaryFor는 DOM·전역에 의존하므로 이 하네스에서는 제외한다
region = region.replace(/function maybeDiary\(intent[\s\S]*$/, '');

function makeHarness(seed) {
  let st = seed;
  const rng = () => { st = (st * 1664525 + 1013904223) >>> 0; return st / 4294967296; };
  const stub = {
    rng,
    sky: { phase: 'day', weather: 'clear' },
    archive: [],
    worldLen: 1400,
    byeoli: { worldX: 700 },
    formatByeoliDate: () => '별이력 9096년 1월 1일',
    byeoliDayEpoch: () => 42,
    bgSeason: () => 'winter',
  };
  const fn = new Function(
    ...Object.keys(stub),
    `${region}\n return { ByeolVoice, ByeoliWriter, buildWriterContext, validateDiaryEntry, makeDiaryEntry, resolveDiarySlot, normalizeTrace, DIARY_SLOTS, DIARY_LINE_MAX };`,
  );
  return { api: fn(...Object.values(stub)), stub };
}

// ── ① 전수 동일 대조 ────────────────────────────────────────────────
const def = { emoji: '🌼', ko: '민들레', jtags: ['바람에 흔들렸다', '노랗다'] };
const cases = [];
for (const rare of [false, true]) {
  for (const passed of [false, true]) {
    for (const drive of ['observe', 'rest', 'record', 'wonder']) {
      for (const trace of [null, { by: 'ppae', kind: 'moved', at: Date.now() - 1000 }]) {
        cases.push({
          intent: { id: 'ev-' + cases.length, drive, action: drive, duration: 4, targetId: 'p1' },
          item: { id: 'p1', type: 'dandelion', variant: '노란', phase: 'encountered' },
          meta: { rare, passed, firstOfKind: true, trace },
        });
      }
    }
  }
}
let compared = 0;
for (const c of cases) {
  const SEED = 12345;
  // 옛 경로: ByeolVoice.compose 직접
  const oldLine = makeHarness(SEED).api.ByeolVoice.compose(c.intent, c.item, def, c.meta);
  // 새 경로: buildWriterContext → ByeoliWriter.write
  const h = makeHarness(SEED);
  const ctx = h.api.buildWriterContext(c.intent, c.item, def, c.meta);
  const entry = h.api.ByeoliWriter.write(ctx);
  if (!entry) { errors.push(`Writer가 null을 반환했습니다 (${c.intent.id})`); continue; }
  if (entry.line !== oldLine) {
    errors.push(`문장 불일치 — 기존 "${oldLine}" / Writer "${entry.line}"`);
  }
  // ② 고정 필드
  if (entry.source !== 'rule') errors.push(`source가 'rule'이 아닙니다: ${entry.source}`);
  if (entry.bookId !== null || entry.bookSlot !== null) errors.push('429-A에서 bookId/bookSlot은 null이어야 합니다');
  if (entry.observer !== 'byeoli') errors.push('observer가 byeoli가 아닙니다');
  if (entry.eventId !== c.intent.id) errors.push('eventId가 명시 필드로 실리지 않았습니다');
  if (!('intent' in entry)) errors.push('기존 호환용 intent가 보존되지 않았습니다');
  if (!h.api.validateDiaryEntry(entry)) errors.push('정상 엔트리가 검증을 통과하지 못했습니다');
  // ⑤ trace 정규화 — 생성 주체가 새면 안 된다
  const t = ctx.event.trace;
  if ('by' in t) errors.push('정규화된 trace에 생성 주체(by)가 남아 있습니다');
  if (c.meta.trace && (t.type !== 'moved' || typeof t.ageMs !== 'number')) errors.push('trace 정규화 형식 오류');
  if (!c.meta.trace && t.type !== null) errors.push('흔적이 없는데 type이 채워졌습니다');
  // recent는 최소 필드만
  for (const r of ctx.recent) {
    if (Object.keys(r).sort().join(',') !== 'line,source,targetType') errors.push('recent에 최소 필드 외 데이터가 있습니다');
  }
  compared++;
}

// ── ④ 슬롯 단일 결정 ────────────────────────────────────────────────
{
  const { api } = makeHarness(1);
  const map = { dawn: 'morning', day: 'afternoon', dusk: 'sunset', night: 'night' };
  for (const [phase, want] of Object.entries(map)) {
    if (api.resolveDiarySlot(phase) !== want) errors.push(`resolveDiarySlot(${phase}) != ${want} — 하늘 단계와 모순`);
  }
  if (!api.DIARY_SLOTS || api.DIARY_SLOTS.length !== 4) errors.push('DIARY_SLOTS 정의 오류');
  if (/resolveDiarySlot\s*\(/.test(src.slice(src.indexOf('function updateEncounters')) ) &&
      !/window.__writer/.test(src)) errors.push('호출부에서 슬롯을 따로 계산하고 있습니다');
}

// ── ③ 폴백 계약: 형식 불량은 전부 거부되어야 한다 ────────────────────
const { api } = makeHarness(7);
const ok = { observer: 'byeoli', line: '🌼 민들레 오래 봄.', source: 'rule' };
const NEGATIVE = [
  ['null', null],
  ['undefined', undefined],
  ['문자열', '그냥 문장'],
  ['Promise', Promise.resolve(ok)],
  ['빈 문장', { ...ok, line: '' }],
  ['공백만', { ...ok, line: '   ' }],
  ['line 비문자열', { ...ok, line: 42 }],
  ['observer 불일치', { ...ok, observer: 'bbaekkong' }],
  ['source 불량', { ...ok, source: 'claude' }],
  ['길이 초과', { ...ok, line: '가'.repeat(api.DIARY_LINE_MAX + 1) }],
];
for (const [name, bad] of NEGATIVE) {
  if (api.validateDiaryEntry(bad) !== false) errors.push(`폴백 판정 실패 — "${name}"을(를) 정상으로 보았습니다`);
}
if (api.validateDiaryEntry(ok) !== true) errors.push('정상 엔트리를 불량으로 판정했습니다 (검증기 자체 오류)');

if (errors.length) {
  console.error('validate:writer FAILED');
  for (const x of [...new Set(errors)]) console.error(' - ' + x);
  process.exit(1);
}
console.log(`validate:writer OK — 문장 전수 동일 ${compared}건 · 슬롯 4단 · 폴백 음성 ${NEGATIVE.length}건`);
