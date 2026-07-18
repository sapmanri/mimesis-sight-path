// MIMESIS Execution Contract  (429-B v3.1 — 구 Coverage Contract)
// ⚠ 상태: **공통 인터페이스 후보 정본**. 아직 어떤 엔진도 이 모듈에 결합하지 않는다.
//    별이 v3.1에서 먼저 증명한 뒤, 각 엔진의 Request/Resolution을 비교해
//    **공통 최소 부분만** 추출한다. 지금 추상화하면 별이의 우연을 보편으로 착각한다.
//
// Vase 발견 2026-07-18: 순서가 틀려 있었다.
//   틀림: Genome → 생성 → 조회
//   맞음: World → **Request** → Genome → 생성 → 조회
// Request가 먼저 존재한다. 런타임은 별이가 무엇을 만났는지 이미 알고 있다.
// 문장을 먼저 만들어놓고 찾아다니면 A처럼 60%가 빈다.
//
// 이 계약이 정의하는 것 = **실행 가능한 요청 공간**.
//   ① Request 스키마      — 런타임이 만들 수 있는 요청의 모양
//   ② Resolution Ladder   — 모든 유효 요청이 반드시 도달하는 해소 경로(폴백 포함)
//   ③ Coverage 보증       — (사전 생성 엔진에만 해당) 그 공간이 실제로 채워졌는가
// ①②는 보편, ③은 요청 공간이 유한할 때만 성립한다 — 아래 CONFORMANCE 참조.

export const CATS = ['nature', 'rest', 'animal', 'thing'];
export const MOODS = ['observe', 'wonder', 'rest', 'photo'];
export const SPECIALS = ['rare', 'first', 'passed'];
export const TRACES = ['warm', 'moved'];

/** 키 문자열 — 런타임 조회와 생성 요청이 같은 문법을 쓴다 */
export const keyOf = (k) =>
  `${k.slot}:${k.targetType || ('cat.' + (k.category || '-'))}:${k.mood}:${k.eventFlag || 'normal'}:${k.traceType || 'none'}`;

/* 메타 소유권: **Execution Contract가 모든 메타를 소유한다.**
   생성기는 key에 대응하는 line과 formGroup만 반환하고, 나머지는 여기서 조인한다.
   (생성기에게 확정된 메타를 다시 쓰게 하면 출력이 부풀고 드리프트가 생긴다 —
    v3.1 1차 실행에서 key는 dandelion인데 targetType에 nature가 들어왔다.) */
export function joinMeta(required, gen) {
  const byKey = Object.fromEntries(required.map((k) => [k.key, k]));
  const out = [], orphans = [];
  for (const g of gen) {
    const k = byKey[g.key];
    if (!k) { orphans.push(g.key); continue; }
    out.push({ key: g.key, line: g.line, formGroup: g.formGroup,
      slot: k.slot, targetType: k.targetType, targetName: k.targetName, category: k.category,
      mood: k.mood, eventFlags: k.eventFlag && k.eventFlag !== 'normal' ? [k.eventFlag] : [],
      traceType: k.traceType, reusable: !k.targetType,
      weatherAllowed: k.weatherAllowed || [], weatherDenied: g.weatherDenied || [] });
  }
  return { sentences: out, orphans };
}

/** ① Request 공간 전수 — 런타임이 실제로 만들 수 있는 요청. 이것이 계약이다. */
export function buildRequiredKeys(slot, topTargets, dayWeathers = ['clear', 'cloudy', 'rain']) {
  const keys = [];
  const W = dayWeathers;   // 날씨 허용 범위도 계약이 소유한다
  // ① 대상 × mood × 평범 — exact hit의 본체
  for (const t of topTargets) for (const mood of MOODS) {
    keys.push({ key: keyOf({ slot, targetType: t.type, mood }), slot, targetType: t.type, targetName: t.name, category: t.cat, mood, eventFlag: 'normal', traceType: null, count: 2, weatherAllowed: W });
  }
  // ② 카테고리 × mood × 평범 — topTargets 밖 대상의 착지점
  for (const c of CATS) for (const mood of MOODS) {
    keys.push({ key: keyOf({ slot, category: c, mood }), slot, targetType: null, targetName: null, category: c, mood, eventFlag: 'normal', traceType: null, count: 2, weatherAllowed: W });
  }
  // ③ 특수 상황 — 일반 대상 조회와 **섞지 않는다**. mood 무관(any).
  for (const c of CATS) for (const f of SPECIALS) {
    keys.push({ key: keyOf({ slot, category: c, mood: 'any', eventFlag: f }), slot, targetType: null, targetName: null, category: c, mood: 'any', eventFlag: f, traceType: null, count: 1, weatherAllowed: W });
  }
  for (const c of CATS) for (const tr of TRACES) {
    keys.push({ key: keyOf({ slot, category: c, mood: 'any', traceType: tr }), slot, targetType: null, targetName: null, category: c, mood: 'any', eventFlag: 'normal', traceType: tr, count: 1, weatherAllowed: W });
  }
  // ④ 대상 없는 상황 (습관 멈춤 등)
  for (const mood of ['observe', 'wonder']) {
    keys.push({ key: keyOf({ slot, category: 'none', mood }), slot, targetType: null, targetName: null, category: 'none', mood, eventFlag: 'normal', traceType: null, count: 2, weatherAllowed: W });
  }
  return keys;
}

/* ── ② Resolution Ladder — 모든 유효 요청은 반드시 어딘가에 도달한다 ─────────────────────────────────────────
   1 exact → 2 target fallback → 3 category fallback → 4 generic situation → 5 Rule */
export function lookup(book, ev) {
  const S = book.sentences;
  const special = SPECIALS.includes(ev.state) ? ev.state : null;
  const trace = ev.state.startsWith('trace-') ? ev.state.slice(6) : null;
  const weatherOk = (s) => !(s.weatherDenied || []).includes(ev.weather)
    && (!(s.weatherAllowed || []).length || s.weatherAllowed.includes(ev.weather));

  if (special || trace) {
    // 특수는 자기 키에서만 — 평범 문장으로 덮지 않는다
    const t1 = S.filter((s) => weatherOk(s) && s.targetType === ev.targetType && (special ? (s.eventFlags || []).includes(special) : s.traceType === trace));
    if (t1.length) return { s: t1[0], layer: 'exact-special' };
    const t2 = S.filter((s) => weatherOk(s) && s.category === ev.cat && (special ? (s.eventFlags || []).includes(special) : s.traceType === trace));
    if (t2.length) return { s: t2[0], layer: 'category-special' };
    const t3 = S.filter((s) => weatherOk(s) && (special ? (s.eventFlags || []).includes(special) : s.traceType === trace));
    if (t3.length) return { s: t3[0], layer: 'generic-special' };
    return { s: null, layer: null };
  }
  const plain = (s) => weatherOk(s) && !(s.eventFlags || []).length && !s.traceType;
  const l1 = ev.targetType ? S.filter((s) => plain(s) && s.targetType === ev.targetType && s.mood === ev.mood) : [];
  if (l1.length) return { s: l1[0], layer: 'exact' };
  const l2 = ev.targetType ? S.filter((s) => plain(s) && s.targetType === ev.targetType) : [];
  if (l2.length) return { s: l2[0], layer: 'target' };
  const l3 = S.filter((s) => plain(s) && !s.targetType && s.category === ev.cat && s.mood === ev.mood);
  if (l3.length) return { s: l3[0], layer: 'category' };
  const l4 = S.filter((s) => plain(s) && !s.targetType && s.mood === ev.mood);
  if (l4.length) return { s: l4[0], layer: 'generic' };
  return { s: null, layer: null };
}

/* ── ③ Coverage 보증 (사전 생성 엔진 전용) — 100% 아니면 문장집 전체 실패 ── */
export function lintCoverage(book, required) {
  const have = {};
  for (const s of book.sentences) {
    const k = keyOf({ slot: s.slot, targetType: s.targetType, category: s.category,
      mood: (s.eventFlags || []).length || s.traceType ? 'any' : s.mood,
      eventFlag: (s.eventFlags || [])[0], traceType: s.traceType });
    have[k] = (have[k] || 0) + 1;
  }
  const missing = required.filter((r) => (have[r.key] || 0) < r.count)
    .map((r) => `${r.key} (필요 ${r.count}, 있음 ${have[r.key] || 0})`);
  return { missing, rate: (required.length - missing.length) / required.length };
}

/* ── 게이트 2: 재사용 제한 ─────────────────────────────────────── */
/* reusable:true 문장은 고유명사뿐 아니라 **고유 관찰어**도 금지.
   "벤치 다리"·"홀씨"·"꽃잎"·"수염"·"발자국"처럼 특정 대상만 가리키는 말이 들어가면
   그 문장은 카테고리 전체에 못 쓴다 — 애초에 reusable이 아니다. */
export const TARGET_VOCAB = ['벤치','홀씨','꽃잎','수염','발자국','다리','등받이','팔걸이','줄기','대가','밥그릇','꽁지','귀'];
export function lintReuse(book, topTargetNames = []) {
  const e = [], byLine = {};
  const vocab = [...new Set([...TARGET_VOCAB, ...topTargetNames])];
  for (const s of book.sentences) {
    if (!s.reusable) continue;
    for (const w of vocab) if (s.line.includes(w)) { e.push(`reusable인데 고유 관찰어 "${w}": "${s.line}"`); break; }
  }
  for (const s of book.sentences) (byLine[s.line] ||= []).push(s);
  for (const [line, list] of Object.entries(byLine)) {
    if (list.length > 1 && !list.every((s) => s.reusable)) e.push(`중복 line ${list.length}회: "${line}"`);
    const targets = new Set(list.map((s) => s.targetType).filter(Boolean));
    if (targets.size > 1) e.push(`대상 전용 문장이 여러 대상에 재사용: "${line}" → ${[...targets].join(', ')}`);
  }
  return e;
}

/* ── 게이트 3: 메타 자기모순 ───────────────────────────────────── */
const WEATHER_ONLY = /^(안개|비|눈|바람|햇빛|하늘|구름|저녁빛|새벽빛|물안개|이슬)/;
export function lintMetaConsistency(book) {
  const e = [];
  for (const s of book.sentences) {
    const L = s.line;
    /* 대상 정합("이 문장이 현재 관찰을 말하는가")은 기계가 아니라 critic이 본다.
       Observation 단계가 이겼다는 증거 — 이름 유무는 관찰의 본질이 아니다. (Vase 판정) */
    if ((s.eventFlags || []).includes('rare') && WEATHER_ONLY.test(L.trim())) {
      e.push(`rare가 날씨 묘사다(사건이어야 한다) — "${L}"`);
    }
    if (s.traceType === 'warm' && !/(따뜻|온기|남아|자리|눌린|아직)/.test(L)) {
      e.push(`trace warm인데 남은 흔적이 없다 — "${L}"`);
    }
    if (s.traceType === 'moved' && !/(굴러|자리|달라|옮겨|밀려|기울)/.test(L)) {
      e.push(`trace moved인데 이동 흔적이 없다 — "${L}"`);
    }
    if ((s.eventFlags || []).includes('passed') && /(가까이|들여다|앉|만졌|담았|찍)/.test(L)) {
      e.push(`passed인데 행동을 말한다 — "${L}"`);
    }
  }
  return e;
}

/* ── 게이트 4: 런타임 시뮬레이션 (평가 세트 밖 전수 조회) ────────
   36.4% 같은 뭉뚱그린 exact-hit은 만들지 않는다. 요청 유형별로 분리 측정한다.
   (숫자를 맞추려 정의를 바꾸면 같은 함정이 반복된다 — Vase 판정) */
export function simulate(book, topTargets, weathers = ['clear', 'cloudy', 'rain']) {
  const B = { primaryNormal: { n: 0, exact: 0 }, special: { n: 0, resolved: 0 }, generic: { n: 0, resolved: 0 } };
  const stats = { byLayer: {}, ruleFallback: 0 };
  const probe = (ev, bucket, exactLayers) => {
    const { layer } = lookup(book, ev);
    B[bucket].n++;
    if (!layer) { stats.ruleFallback++; return; }
    stats.byLayer[layer] = (stats.byLayer[layer] || 0) + 1;
    if (exactLayers.includes(layer)) B[bucket][bucket === 'primaryNormal' ? 'exact' : 'resolved']++;
  };
  for (const w of weathers) {
    for (const t of topTargets) for (const mood of MOODS) probe({ slot: book.slot, weather: w, mood, targetType: t.type, cat: t.cat, state: 'normal' }, 'primaryNormal', ['exact']);
    for (const t of topTargets) for (const st of [...SPECIALS, 'trace-warm', 'trace-moved']) probe({ slot: book.slot, weather: w, mood: 'observe', targetType: t.type, cat: t.cat, state: st }, 'special', ['exact-special', 'category-special', 'generic-special']);
    for (const c of CATS) for (const mood of MOODS) probe({ slot: book.slot, weather: w, mood, targetType: 'unknown-' + c, cat: c, state: 'normal' }, 'generic', ['category', 'generic']);
  }
  return {
    byLayer: stats.byLayer, ruleFallback: stats.ruleFallback,
    // 별개의 지표 — 하나로 합치지 않는다
    targetExactRate: B.primaryNormal.exact / Math.max(1, B.primaryNormal.n),   // TopTarget Normal Exact
    specialResolutionRate: B.special.resolved / Math.max(1, B.special.n),
    genericResolutionRate: B.generic.resolved / Math.max(1, B.generic.n),
    counts: B,
  };
}

/* ── 합격 기준 ─────────────────────────────────────────────────── */
export const PASS = {
  requiredKeyRate: 1.0,      // 필수 키 충족률 100%
  evalHitRate: 1.0,          // 평가 30건 조회 성공 100%
  topTargetExact: 0.80,      // topTargets exact-hit 80% 이상
  specialRuleFallback: 0,    // rare/trace/first/passed Rule 폴백 0
  duplicateLines: 0,
};

export function gateReport({ book, required, evalRows, topTargets }) {
  const cov = lintCoverage(book, required);
  const reuse = lintReuse(book);
  const meta = lintMetaConsistency(book);
  const sim = simulate(book, topTargets);
  const evalMiss = evalRows.filter((r) => !r.line).length;
  const evalSpecialMiss = evalRows.filter((r) => !r.line && (SPECIALS.includes(r.state) || String(r.state).startsWith('trace-'))).length;
  const verdict = [];
  if (cov.rate < PASS.requiredKeyRate) verdict.push(`필수 키 충족률 ${(cov.rate * 100).toFixed(1)}% (100% 필요) — 누락 ${cov.missing.length}`);
  if (evalMiss) verdict.push(`평가 세트 조회 실패 ${evalMiss}건`);
  if (evalSpecialMiss > PASS.specialRuleFallback) verdict.push(`특수 플래그 Rule 폴백 ${evalSpecialMiss}건`);
  if (sim.exactRate < PASS.topTargetExact) verdict.push(`exact-hit ${(sim.exactRate * 100).toFixed(1)}% (${PASS.topTargetExact * 100}% 필요)`);
  if (reuse.length) verdict.push(`재사용 위반 ${reuse.length}`);
  if (meta.length) verdict.push(`메타 자기모순 ${meta.length}`);
  return { pass: verdict.length === 0, verdict, coverage: cov, reuse, meta, sim };
}

/* ══ 관찰 노트 (결합 아님) — 기존 엔진들이 이미 이 형태인지 조사한 결과 ══
   이 표는 설계 판단 근거이지 런타임 레지스트리가 아니다. import해서 분기하지 말 것.
   materialization: 요청 공간을 언제 채우는가
     'pre'    유한·열거 가능 → 미리 생성해 두고 런타임은 조회만 (별이 문장집)
     'ondemand' 무한·발견형 → 요청마다 생성 (Writing Studio, Question Engine)
   Guarantee: pre = Coverage 보증 / ondemand = Resolution·Fallback 보증.
   질문 엔진 폴백 최소 계약 (Vase, 정답 아님 — 경계만):
     질문 분석 실패 → 원 질문을 보존한 일반 Request
     Genome 적용 실패 → 사실성·안전성을 지키는 기본 답변 계약
     생성 실패      → 재시도 후 짧고 정직한 실패 응답
     고위험 질문    → Genome보다 안전·정확성 정책 우선
   원칙: 폴백은 '삽만리다운 고정 문장'이 아니라, 정체성을 약화시키더라도
         질문에 안전하고 실제로 답하는 기본 경로다. */
export const CONFORMANCE = {
  'byeoli-sentence-book': { materialization: 'pre', request: ['slot','targetType','mood','eventFlag','traceType'], fallback: 'Rule', coverageGate: true },
  'ppae-brain':           { materialization: 'pre', request: ['trigger','type','targetId','eventId'], fallback: 'PPAE_FALLBACK', coverageGate: false },
  'writing-studio':       { materialization: 'ondemand', request: ['targetLabel','byeoliAction','skyPhase','weather','diaryLines','recentTexts'], fallback: '문장 풀', coverageGate: false },
  'question-engine':      { materialization: 'ondemand', request: ['type','topic','urgency','wants'], fallback: '(미정 — 설계 필요)', coverageGate: false },
};
/** 엔진이 계약을 만족하는가 — 폴백 없는 엔진은 어떤 모드에서도 불합격 */
export function checkConformance(name) {
  const c = CONFORMANCE[name];
  if (!c) return [`미등록 엔진: ${name}`];
  const e = [];
  if (!c.request?.length) e.push('Request 스키마 없음');
  if (!c.fallback || c.fallback.includes('미정')) e.push('폴백 경로 미정 — 유효 요청이 갈 곳이 없다');
  if (c.materialization === 'pre' && !c.coverageGate) e.push('사전 생성인데 Coverage 게이트가 없다');
  return e;
}
