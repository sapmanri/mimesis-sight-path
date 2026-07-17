import { readFile } from 'node:fs/promises';
import process from 'node:process';

// BUILD 422-OPS-B — Ops Console gate.
// 정본: docs/BUILD_422_OPS_OBSERVER_CONSOLE.md §10, §11.
// 콘솔은 관측소다: 쓰기 호출 0건 · 개인 식별자 미노출 · 금지 동작 없음 · Ops 호스트 경계.
// 텍스트 검사(다른 validator들과 같은 방식) — TS 런타임 불필요.

const htmlPath = new URL('../public/ops/index.html', import.meta.url);
const middlewarePath = new URL('../functions/_middleware.ts', import.meta.url);
const registryPath = new URL('../src/worldEvents/worldEventRegistry.ts', import.meta.url);

const html = await readFile(htmlPath, 'utf8');
const middleware = await readFile(middlewarePath, 'utf8');
const registrySource = await readFile(registryPath, 'utf8');

const errors = [];

// ── 1. 쓰기 네트워크 호출 — 명시적 예외 1곳(이벤트 예약)만 ──
// 콘솔의 네트워크 수단은 fetch뿐. 쓰기는 postEventSchedule() 단 한 곳:
// 423-EVENTS 예약(의도 기록)은 read-only 원칙의 선언된 예외다(§5-2 · Vase 판정 2026-07-17).
for (const [pattern, why] of [
  [/XMLHttpRequest/, 'XMLHttpRequest 사용'],
  [/sendBeacon/, 'sendBeacon 사용'],
  [/new\s+WebSocket/, 'WebSocket 사용'],
  [/new\s+EventSource/, 'EventSource 사용'],
  [/<form[\s>]/i, 'form 요소(제출 경로)'],
]) {
  if (pattern.test(html)) errors.push(`쓰기 경로 금지 위반: ${why}`);
}
// 쓰기 표면 목록(고정): 1호 예약(423) · 2호 엽서(425-A) · 3호 즉시 발행 · 4호 답글(425-B/C).
// 이 목록 밖 쓰기는 빌드 실패.
const WRITE_SURFACES = [
  ['postEventSchedule', /fetch\(API\.eventSchedule,\s*\{\s*\n?\s*method:\s*'POST'/],
  ['postCapture', /fetch\(API\.capture,\s*\{\s*\n?\s*method:\s*'POST'/],
  ['postPublishNow', /fetch\(API\.publishNow,\s*\{\s*\n?\s*method:\s*'POST'/],
  ['postThreadsReplies', /fetch\(API\.threadsReplies,\s*\{\s*\n?\s*method:\s*'POST'/],
];
const methodUses = [...html.matchAll(/method\s*:\s*['"]([A-Z]+)['"]/g)];
if (methodUses.length !== WRITE_SURFACES.length || methodUses.some((m) => m[1] !== 'POST')) {
  errors.push(`fetch method 옵션은 선언된 쓰기 표면 ${WRITE_SURFACES.length}곳(POST)만 허용 (발견 ${methodUses.length}건: ${methodUses.map((m) => m[1]).join(',')})`);
}
for (const [name, pattern] of WRITE_SURFACES) {
  if (!pattern.test(html)) errors.push(`쓰기 표면 ${name}이(가) 선언된 형태가 아니다`);
}
if ((html.match(/method\s*:/g) ?? []).length !== WRITE_SURFACES.length) {
  errors.push('method: 사용이 선언된 쓰기 표면 밖에도 있다');
}

// fetch 대상은 허용목록만 (읽기 5종 + 쓰기 예외 2종).
const ALLOWED_APIS = new Set([
  '/api/byeoli/state',
  '/api/byeoli/health',
  '/api/ops/publish-log',
  '/api/feed',
  '/api/ops/event-schedule', // 쓰기 예외 1호
  '/api/world-event/active',
  '/api/ops/capture',        // 쓰기 예외 2호
  '/api/ops/publish-now',    // 쓰기 예외 3호
  '/api/ops/threads-replies', // 쓰기 예외 4호 (답글 — 승인 발행)
  '/api/ops/presence',       // 422-OPS-D 읽기
  '/api/ops/collective',     // 422-OPS-E 읽기 (k-익명 적용 후)
]);
for (const m of html.matchAll(/['"](\/api\/[^'"]*)['"]/g)) {
  if (!ALLOWED_APIS.has(m[1])) errors.push(`허용목록 밖 API 경로: ${m[1]}`);
}

// ── 2. 개인 식별자·거짓 수치 미노출 ───────────────────────
for (const [token, why] of [
  ['BYLR', 'Recovery Key 접두어'],
  ['observerId', '관찰자 식별자'],
  ['recoveryKey', 'Recovery Key'],
  ['/api/observer', '관찰자 API 접근'],
  ['connectedViewers', '하드코딩 0 — 표시 금지(§2-2)'],
]) {
  if (html.includes(token)) errors.push(`미노출 위반: ${token} (${why})`);
}

// ── 3. 금지 동작 문자열 부재 (§11 금지 목록이 UI로 새지 않는지) ──
for (const word of ['강제 발행', '강제발행', '강제 이벤트', '이벤트 발동', '기억 삭제', '상태 수정', '초기화']) {
  if (html.includes(word)) errors.push(`금지 동작 문자열 존재: "${word}"`);
}

// ── 4. iframe 봉인 ────────────────────────────────────────
if (!/sandbox="allow-scripts allow-same-origin"/.test(html)) {
  errors.push('live iframe에 sandbox 속성이 없다');
}
if (!html.includes('class="shield"')) {
  errors.push('iframe 조작 차단 오버레이(shield)가 없다');
}

// ── 5. 이벤트 메타 = 레지스트리 1:1 (드리프트 차단) ───────
const jsonMatch = html.match(/<script id="ops-events" type="application\/json">\s*([\s\S]*?)\s*<\/script>/);
if (!jsonMatch) {
  errors.push('ops-events JSON 블록을 찾을 수 없다');
} else {
  let consoleEvents = [];
  try { consoleEvents = JSON.parse(jsonMatch[1]); } catch { errors.push('ops-events JSON 파싱 실패'); }

  const arrayMatch = registrySource.match(/WORLD_EVENT_REGISTRY[^=]*=\s*\[([\s\S]*?)\n\];/);
  if (!arrayMatch) {
    errors.push('WORLD_EVENT_REGISTRY 배열을 찾을 수 없다');
  } else {
    const parseList = (s) => [...s.matchAll(/'([^']+)'/g)].map((m) => m[1]);
    const registryEvents = [];
    for (const block of arrayMatch[1].split(/\n  \},/)) {
      const id = block.match(/id:\s*'([^']+)'/)?.[1];
      if (!id) continue;
      registryEvents.push({
        id,
        label: block.match(/label:\s*'([^']+)'/)?.[1],
        rarity: block.match(/rarity:\s*'([^']+)'/)?.[1],
        cooldownSeconds: Number(block.match(/cooldownSeconds:\s*(\d+)/)?.[1]),
        eligibleTime: block.match(/eligibleTime:\s*\[([^\]]*)\]/) ? parseList(block.match(/eligibleTime:\s*\[([^\]]*)\]/)[1]) : undefined,
        eligibleWeather: block.match(/eligibleWeather:\s*\[([^\]]*)\]/) ? parseList(block.match(/eligibleWeather:\s*\[([^\]]*)\]/)[1]) : undefined,
      });
    }
    const byId = new Map(consoleEvents.map((e) => [e.id, e]));
    if (registryEvents.length !== consoleEvents.length) {
      errors.push(`이벤트 개수 불일치: registry ${registryEvents.length} vs console ${consoleEvents.length}`);
    }
    for (const reg of registryEvents) {
      const con = byId.get(reg.id);
      if (!con) { errors.push(`콘솔에 없는 이벤트: ${reg.id}`); continue; }
      for (const key of ['label', 'rarity', 'cooldownSeconds']) {
        if (con[key] !== reg[key]) errors.push(`${reg.id}.${key} 불일치: registry ${reg[key]} vs console ${con[key]}`);
      }
      for (const key of ['eligibleTime', 'eligibleWeather']) {
        if (JSON.stringify(con[key]) !== JSON.stringify(reg[key])) {
          errors.push(`${reg.id}.${key} 불일치: registry ${JSON.stringify(reg[key])} vs console ${JSON.stringify(con[key])}`);
        }
      }
    }
  }
}

// ── 6. 미들웨어 경계 (§7-2, §8) ───────────────────────────
if (!/\/api\/ops\//.test(middleware) || !middleware.includes("host !== OPS_HOST")) {
  errors.push('미들웨어에 Ops API 호스트 경계가 없다');
}
if (!middleware.includes("url.pathname === '/ops'")) {
  errors.push('미들웨어에 공개 호스트 /ops 은닉(404) 분기가 없다');
}
if (!middleware.includes("host === OPS_HOST && url.pathname === '/'")) {
  errors.push('미들웨어에 Ops 호스트 루트 콘솔 서빙 분기가 없다');
}
if (!middleware.includes("host === OPS_HOST && url.pathname === '/live'")
  || !middleware.includes('mimesis.byeoli.onboarding.v1')) {
  errors.push('미들웨어에 Ops 호스트 /live(온보딩 주입) 분기가 없다');
}
// 콘솔 iframe은 same-origin /live만 가리켜야 한다 (공개 호스트 직접 참조 금지)
if (!html.includes('src="/live?mode=live"')) {
  errors.push('live iframe이 same-origin /live?mode=live를 가리키지 않는다');
}

// ── 7. 423-EVENTS 소비 경로 (걷기 앱) ─────────────────────
const walkHtml = await readFile(new URL('../public/byeoli-walk/index.html', import.meta.url), 'utf8');
const syncJs = await readFile(new URL('../public/byeoli-walk/world-event-sync.js', import.meta.url), 'utf8').catch(() => '');
if (!walkHtml.includes('world-event-sync.js')) {
  errors.push('걷기 앱에 world-event-sync.js 태그가 없다');
}
if (!walkHtml.includes('window.__worldEventStage')) {
  errors.push('걷기 앱에 World Director 소비 훅(window.__worldEventStage)이 없다');
}
if (!syncJs.includes('/api/world-event/active')) {
  errors.push('world-event-sync.js가 active 엔드포인트를 폴링하지 않는다');
}
if (/method\s*:|XMLHttpRequest|sendBeacon/.test(syncJs)) {
  errors.push('world-event-sync.js는 읽기 전용이어야 한다 (쓰기 수단 발견)');
}
// 감사 하드룰: 쓰기 API는 Access 이메일을 기록해야 한다
for (const rel of ['../functions/api/ops/event-schedule.ts', '../functions/api/ops/capture.ts', '../functions/api/ops/publish-now.ts', '../functions/api/ops/threads-replies.ts']) {
  const src = await readFile(new URL(rel, import.meta.url), 'utf8').catch(() => '');
  if (!src.includes('cf-access-authenticated-user-email')) {
    errors.push(`${rel.replace('../', '')}에 감사 기록(Access 이메일)이 없다`);
  }
}

// ── 8. 425-A 엽서 계약 ────────────────────────────────────
if (!walkHtml.includes('window.__postcard')) {
  errors.push('걷기 앱에 엽서 합성기 훅(window.__postcard)이 없다');
}
if (!walkHtml.includes('그냥 지나침')) {
  errors.push("걷기 앱 pass 라인('그냥 지나침')이 사라졌다 — 엽서 제외 필터 앵커");
}
const captureTs = await readFile(new URL('../functions/api/ops/capture.ts', import.meta.url), 'utf8').catch(() => '');
if (!captureTs.includes('sanitizeMeta')) {
  errors.push('capture API에 meta 화이트리스트(sanitizeMeta)가 없다');
}
if (!captureTs.includes('0xff') || !captureTs.includes('0xd8')) {
  errors.push('capture API에 JPEG 시그니처 검증이 없다');
}

// ── 9. 422-OPS-D presence 계약 (§6-3) ─────────────────────
const presenceTs = await readFile(new URL('../functions/api/telemetry/presence.ts', import.meta.url), 'utf8').catch(() => '');
for (const [pattern, why] of [
  [/headers\.get\(\s*['"]cf-connecting-ip['"]/i, 'IP 원문 접근 금지'],
  [/headers\.get\(\s*['"]user-agent['"]/i, 'User-Agent 접근 금지'],
  [/observerId/, 'Observer 식별자 금지'],
  [/BYLR/, 'Recovery Key 금지'],
]) {
  if (pattern.test(presenceTs)) errors.push(`telemetry/presence.ts 위반: ${why}`);
}
if (!presenceTs) errors.push('telemetry/presence.ts가 없다');
const presenceJs = await readFile(new URL('../public/byeoli-walk/presence-sync.js', import.meta.url), 'utf8').catch(() => '');
if (!presenceJs.includes('window.top !== window.self')) {
  errors.push('presence-sync.js에 iframe 제외 가드가 없다 (관측소가 스스로 세션을 만든다)');
}
if (/BYLR|observerId|recoveryKey/.test(presenceJs)) {
  errors.push('presence-sync.js에 개인 식별자 흔적이 있다');
}
if (!walkHtml.includes('presence-sync.js')) errors.push('걷기 앱에 presence-sync.js 태그가 없다');
// 콘솔 표기 계약: 세션이지 사람이 아니다
for (const banned of ['현재 관찰자', '오늘 고유 사용자', '명이 함께 열']) {
  if (html.includes(banned)) errors.push(`presence 표기 계약 위반: "${banned}" (§6-3 — 세션으로 표기)`);
}

// ── 10. 422-OPS-E collective 계약 (§6-4) ──────────────────
const collectiveTs = await readFile(new URL('../functions/api/_collective.ts', import.meta.url), 'utf8').catch(() => '');
if (!/K_ANON\s*=\s*5/.test(collectiveTs)) errors.push('_collective.ts에 k-익명 상수(5)가 없다');
const collectiveIo = await readFile(new URL('../functions/api/_collective-io.ts', import.meta.url), 'utf8').catch(() => '');
if (/blob/i.test(collectiveIo)) errors.push('_collective-io.ts가 blob을 참조한다 — 집계 경로는 blob 불투명이어야 한다');
if (!walkHtml.includes('buildCollectiveSnapshot')) errors.push('걷기 앱에 collectiveSnapshot 빌더가 없다');
const opsCollective = await readFile(new URL('../functions/api/ops/collective.ts', import.meta.url), 'utf8').catch(() => '');
if (!opsCollective.includes('kAnonView')) errors.push('ops/collective.ts가 k-익명 필터를 거치지 않는다');

// ── 11. 425-B/C 답글 하드룰 (§4 · Phase 1) ────────────────
const repliesTs = await readFile(new URL('../functions/api/ops/threads-replies.ts', import.meta.url), 'utf8').catch(() => '');
if (!repliesTs) {
  errors.push('threads-replies.ts가 없다');
} else {
  if (!repliesTs.includes('pepperHash')) errors.push('답글: username 해시 저장이 아니다');
  if (!repliesTs.includes('draftEligibility')) errors.push('답글: 정책 판정(draftEligibility)을 거치지 않는다');
  if (!repliesTs.includes("decision !== 'drafted'")) errors.push('답글: 승인은 drafted 상태에서만 가능해야 한다');
  if (!/action === 'approve'/.test(repliesTs) || !/dailyReplyCap/.test(repliesTs)) {
    errors.push('답글: 승인 경로에 30% 상한 재확인이 없다');
  }
}
const repliesLogic = await readFile(new URL('../functions/api/_replies.ts', import.meta.url), 'utf8').catch(() => '');
if (!/REPLY_RATIO\s*=\s*0\.3/.test(repliesLogic)) errors.push('답글: 30% 상한 상수가 없다');
if (!repliesLogic.includes("'category_sensitive'")) errors.push('답글: 민감 카테고리 차단이 없다');

if (errors.length) {
  console.error(`validate:ops FAIL — ${errors.length}건`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}
console.log('validate:ops OK — read-only 관측소 계약 충족');
