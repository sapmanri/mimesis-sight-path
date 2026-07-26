/**
 * 이미지 참조 감사 게이트 (2026-07-26 신설).
 *
 * Vase 지적: "니가 어디 숨겨뒀다가 잘못 나오는 게 있을까 봐. 내가 볼 수 없는 이미지가 있으면 안 된다."
 * 실제로 두 번 났다:
 *   1) philosophy_bible을 참조 맨 앞에 실어 별이·빼콩이가 다른 캐릭터가 됨
 *   2) 23:30 크론이 화면의 역할 배정을 무시하고 하드코딩 2장을 싣고 있었음(진실이 둘)
 *
 * 규칙: **이미지 모델에 들어갈 수 있는 참조는 전부 화면이 보여주는 목록에서 와야 한다.**
 *   - Comic Lab  → LOCK_SLOTS_V2 (락 패널이 칸으로 그린다)
 *   - 그림 실험실 → sketch-trials/reference/ + 서버 역할 배정(KV) — 화면이 그대로 보여준다
 * 소스에 R2 참조 키가 **하드코딩**돼 있으면(폴백 명시 제외) 실패시킨다.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve, join, relative } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const errors = [];
const files = [];
(function walk(d) {
  for (const n of readdirSync(d)) {
    const p = join(d, n);
    if (statSync(p).isDirectory()) walk(p);
    else if (/\.tsx?$/.test(p) && !/\.test\./.test(p)) files.push(p);
  }
})(join(ROOT, 'functions'));

// 하드코딩된 R2 참조 키 리터럴 — 이름에 FALLBACK이 들어간 상수만 예외(그것도 경고로 남기게 돼 있다)
const KEY_RE = /['"]((?:sketch-trials\/reference|comic\/style-lock)\/[^'"]+)['"]/g;
for (const f of files) {
  const src = readFileSync(f, 'utf8');
  const stripped = src.split('\n').filter((l) => !l.trim().startsWith('//') && !l.trim().startsWith('*')).join('\n');
  for (const m of stripped.matchAll(KEY_RE)) {
    const line = stripped.slice(0, m.index).split('\n').length;
    const ctx = stripped.split('\n')[line - 1] ?? '';
    if (/FALLBACK/.test(ctx)) continue;               // 명시적 폴백은 허용 (실행 시 경고를 남긴다)
    errors.push(`${relative(ROOT, f)}:${line} 화면 밖 참조 키가 하드코딩됐다: ${m[1]}`);
  }
}

// 철학 시트는 생성 참조로 실리면 안 된다 (07-26 실사고)
const gen = readFileSync(join(ROOT, 'functions/api/ops/comic-generate.ts'), 'utf8');
const genCode = gen.split('\n').filter((l) => !l.trim().startsWith('//') && !l.trim().startsWith('*')).join('\n');
if (/loadRef\(\s*PHILOSOPHY_SLOT\s*\)/.test(genCode)) {
  errors.push('comic-generate: PHILOSOPHY_SLOT을 생성 참조로 싣고 있다 — 판정용이지 생성용이 아니다(07-26 실사고)');
}

if (errors.length) {
  console.error('image reference audit FAILED:');
  for (const e of errors) console.error('  - ' + e);
  process.exit(1);
}
console.log(`image reference audit passed: ${files.length} modules, 화면 밖 참조 0`);
