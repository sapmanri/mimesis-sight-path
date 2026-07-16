// live 미들웨어 구조 검증 (BUILD 418-A) — 빌드 게이트용, 네트워크 없음
//
// 검사 1 — 치환 앵커 실존 대조 (핵심):
//   _middleware.ts의 모든 html.replace(...) 첫 인자(문자열/정규식)를 추출해
//   public/byeoli-walk/index.html에 실제로 매치되는지 확인한다.
//   index.html이 수정되면 미들웨어 치환이 "조용히 실패"하는 구조라,
//   앵커 목록을 손으로 관리하지 않고 미들웨어 소스에서 직접 뽑아 대조한다.
//
// 검사 2 — live 기능 토큰:
//   미들웨어: WakeLockManager.start() · wakeLock.request('screen') ·
//             '마지막 화면 유지' · LiveUi.showAuthorityError · mode==='live' 파서
//   functions/api/byeoli/state.ts · health.ts: BYEOLI_AUTHORITY 바인딩 사용
//   (구판 validate-live는 BYEOLI_AUTHORITY가 "미들웨어"에 있다고 가정해
//    main에서 항상 실패했고, 게이트 미편입이라 아무도 몰랐다. 그 교훈의 산물.)
//
// 실패 메시지는 항상 "파일 → 무엇이 누락/불일치"를 명시한다.
// 배포본(원격) 검사는 validate-live-deployed.mjs로 분리 — 게이트에 넣지 말 것.

import { readFile } from 'node:fs/promises';
import process from 'node:process';

const read = (rel) => readFile(new URL(rel, import.meta.url), 'utf8');
const [mw, html, stateTs, healthTs] = await Promise.all([
  read('../functions/byeoli-walk/_middleware.ts'),
  read('../public/byeoli-walk/index.html'),
  read('../functions/api/byeoli/state.ts'),
  read('../functions/api/byeoli/health.ts'),
]);

const errors = [];
const label = {
  mw: 'functions/byeoli-walk/_middleware.ts',
  html: 'public/byeoli-walk/index.html',
  state: 'functions/api/byeoli/state.ts',
  health: 'functions/api/byeoli/health.ts',
};

/* ---------- 검사 1: replace 앵커 추출·대조 ---------- */
function unescapeJsString(s) {
  return s.replace(/\\(n|t|r|'|"|`|\\)/g, (_, c) =>
    ({ n: '\n', t: '\t', r: '\r', "'": "'", '"': '"', '`': '`', '\\': '\\' }[c]),
  );
}

function extractAnchors(src) {
  const anchors = []; // {kind:'string'|'regex', display, test(html)}
  let idx = 0;
  for (;;) {
    const at = src.indexOf('html.replace(', idx);
    if (at < 0) break;
    let i = at + 'html.replace('.length;
    while (/\s/.test(src[i])) i += 1;
    const ch = src[i];
    if (ch === '"' || ch === "'") {
      let j = i + 1;
      let raw = '';
      while (j < src.length && src[j] !== ch) {
        if (src[j] === '\\') { raw += src[j] + src[j + 1]; j += 2; continue; }
        raw += src[j]; j += 1;
      }
      const literal = unescapeJsString(raw);
      anchors.push({
        kind: 'string',
        display: JSON.stringify(literal.slice(0, 60)),
        test: (h) => h.includes(literal),
      });
    } else if (ch === '/') {
      let j = i + 1;
      let body = '';
      while (j < src.length && src[j] !== '/') {
        if (src[j] === '\\') { body += src[j] + src[j + 1]; j += 2; continue; }
        body += src[j]; j += 1;
      }
      let flags = '';
      j += 1;
      while (/[a-z]/.test(src[j] ?? '')) { flags += src[j]; j += 1; }
      try {
        const re = new RegExp(body, flags);
        anchors.push({
          kind: 'regex',
          display: `/${body.slice(0, 60)}${body.length > 60 ? '…' : ''}/${flags}`,
          test: (h) => re.test(h),
        });
      } catch (e) {
        anchors.push({
          kind: 'regex',
          display: `/${body.slice(0, 60)}/`,
          test: () => false,
          error: `invalid regex: ${e.message}`,
        });
      }
    } else {
      // 백틱/변수 등 정적 검증 불가 인자 — 개수만 세되 실패 아님
      anchors.push({ kind: 'dynamic', display: '(non-literal first arg)', test: () => true });
    }
    idx = at + 1;
  }
  return anchors;
}

const anchors = extractAnchors(mw);
const literalAnchors = anchors.filter((a) => a.kind !== 'dynamic');
if (literalAnchors.length < 5) {
  errors.push(
    `${label.mw} → replace 앵커가 ${literalAnchors.length}개만 추출됨 (기대 ≥5) — 추출기 또는 미들웨어 구조 변화 의심`,
  );
}
for (const a of anchors) {
  if (a.error) { errors.push(`${label.mw} → ${a.error}`); continue; }
  if (!a.test(html)) {
    errors.push(
      `${label.html} → 미들웨어 ${a.kind} 앵커 불일치 (치환이 조용히 실패함): ${a.display}`,
    );
  }
}

/* ---------- 검사 2: live 기능 토큰 ---------- */
const require_ = (src, file, tokens) => {
  for (const t of tokens) {
    if (!src.includes(t)) errors.push(`${file} → 필수 토큰 누락: ${JSON.stringify(t)}`);
  }
};
require_(mw, label.mw, [
  'WakeLockManager.start()',
  "navigator.wakeLock.request('screen')",
  '마지막 화면 유지',
  'LiveUi.showAuthorityError',
  "get('mode')==='live'",
]);
require_(stateTs, label.state, ['BYEOLI_AUTHORITY']);
require_(healthTs, label.health, ['BYEOLI_AUTHORITY', 'authority_service_binding_missing']);

if (errors.length > 0) {
  console.error('Live structure validation failed:');
  for (const e of errors) console.error(` - ${e}`);
  process.exit(1);
}
console.log(
  `Live structure validation passed: ${JSON.stringify({
    anchors: { string: anchors.filter((a) => a.kind === 'string').length,
               regex: anchors.filter((a) => a.kind === 'regex').length,
               dynamic: anchors.filter((a) => a.kind === 'dynamic').length },
  })}`,
);
