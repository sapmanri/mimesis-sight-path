/**
 * Pages Functions 빌드 검문 (게이트 축, 2026-07-26 신설).
 *
 * 왜 필요한가 — 실사고 두 번, 같은 원인:
 *   `npm run build`(vite)는 **functions/ 를 파싱하지 않는다.** 게이트 15단이 전부 RC=0인데
 *   Pages Functions는 빌드가 깨져 있었다. 그대로 푸시했으면 Lab 전체가 죽은 채 배포된다.
 *   (07-26 01:2x comic-lab, 07-26 10:2x sketch-lab — 둘 다 클라이언트 JS 템플릿 리터럴 안
 *    주석에 백틱을 넣어 문자열이 끊긴 것. 로컬 wrangler 실행이 유일한 검문이었다.)
 *
 * 이 스크립트가 잡는 것:
 *   1. 템플릿 리터럴로 만든 HTML/JS 페이지 안에 **닫히지 않는 백틱**이 있는가 (실사고 원인)
 *   2. esbuild로 각 Function 모듈이 **실제로 파싱되는가** (문법 오류 전반)
 *
 * ⚠ wrangler를 띄우지 않는다 — 게이트는 빠르고 네트워크 없이 돌아야 한다.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve, join, relative } from 'node:path';
import ts from 'typescript';

const ROOT = resolve(import.meta.dirname, '..');
const FN = join(ROOT, 'functions');
const errors = [];

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (/\.tsx?$/.test(p) && !/\.test\.tsx?$/.test(p)) out.push(p);
  }
  return out;
}

const files = walk(FN);

// ── 1. 템플릿 리터럴 안의 백틱 ────────────────────────────────
// `const HTML = ` … `;` 처럼 한 덩어리로 페이지를 만드는 파일이 대상.
// 그 안에 백틱이 하나라도 더 있으면 문자열이 거기서 끊긴다.
for (const f of files) {
  const src = readFileSync(f, 'utf8');
  const m = src.match(/^(?:const|let|var)\s+\w+\s*=\s*`/m);
  if (!m) continue;
  const start = m.index + m[0].length;
  const end = src.indexOf('\n`;', start);
  if (end < 0) continue;                       // 닫는 짝을 못 찾으면 esbuild가 잡는다
  const body = src.slice(start, end);
  const stray = body.split('\n')
    .map((line, i) => ({ line, no: src.slice(0, start).split('\n').length + i }))
    .filter((x) => x.line.includes('`'));
  for (const s of stray) {
    errors.push(`${relative(ROOT, f)}:${s.no} 템플릿 리터럴 안에 백틱 — 문자열이 여기서 끊긴다: ${s.line.trim().slice(0, 70)}`);
  }
}

// ── 2. 실제 파싱 ─────────────────────────────────────────────
// 새 의존성을 들이지 않는다 — 레포에 이미 있는 typescript로 문법만 본다(타입 검사 아님).
for (const f of files) {
  const src = readFileSync(f, 'utf8');
  const sf = ts.createSourceFile(f, src, ts.ScriptTarget.ES2022, true,
    /\.tsx$/.test(f) ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const diags = sf.parseDiagnostics ?? [];
  for (const d of diags.slice(0, 3)) {
    const { line } = sf.getLineAndCharacterOfPosition(d.start ?? 0);
    errors.push(`${relative(ROOT, f)}:${line + 1} ${ts.flattenDiagnosticMessageText(d.messageText, ' ')}`);
  }
}

if (errors.length) {
  console.error('Pages Functions build validation FAILED:');
  for (const e of errors) console.error('  - ' + e);
  process.exit(1);
}
console.log(`functions build validation passed: ${files.length} modules parse, no stray backticks in page templates`);
