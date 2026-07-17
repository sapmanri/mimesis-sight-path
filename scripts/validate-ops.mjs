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

// ── 1. 쓰기 네트워크 호출 0건 ─────────────────────────────
// 콘솔의 네트워크 수단은 옵션 없는 fetch(GET)뿐이어야 한다.
for (const [pattern, why] of [
  [/method\s*:/, 'fetch에 method 옵션 사용(쓰기 가능성)'],
  [/XMLHttpRequest/, 'XMLHttpRequest 사용'],
  [/sendBeacon/, 'sendBeacon 사용'],
  [/new\s+WebSocket/, 'WebSocket 사용'],
  [/new\s+EventSource/, 'EventSource 사용'],
  [/<form[\s>]/i, 'form 요소(제출 경로)'],
]) {
  if (pattern.test(html)) errors.push(`쓰기 경로 금지 위반: ${why}`);
}

// fetch 대상은 read-only 4종 허용목록만.
const ALLOWED_APIS = new Set([
  '/api/byeoli/state',
  '/api/byeoli/health',
  '/api/ops/publish-log',
  '/api/feed',
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

if (errors.length) {
  console.error(`validate:ops FAIL — ${errors.length}건`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}
console.log('validate:ops OK — read-only 관측소 계약 충족');
