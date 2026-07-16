// 엄격 파서 검증 (BUILD 414-K 시리즈에서 확립, 415-A에서 module 대응)
//
// public/byeoli-walk/index.html의 모든 인라인 <script> 블록을 실제 파서로
// 컴파일한다. 일반 문법 검사가 못 잡는 것들을 검출한다:
//   - const/let 중복 선언 (같은 스코프)
//   - px() 표현식 안 stray semicolon 등 문맥 의존 문법 오류
//   (414-K 시리즈에서 이 방식으로 6건 검출)
//
// 주의 두 가지:
//   1) <script type="module">은 vm.Script가 아니라 vm.SourceTextModule로
//      컴파일해야 한다. 구판(vm.Script)은 import 문에서 실패하거나,
//      필터 버그가 있으면 아예 검사하지 않고 통과할 수 있다.
//   2) "검사한 블록이 0개인데 PASS"는 통과가 아니다 — 이 스크립트는
//      검사 블록 수가 0이면 실패한다 (415-A에서 빈 PASS 사고 실제 발생).
//
// 실행에는 --experimental-vm-modules 플래그가 필요하다 (package.json에 반영됨).

import { readFile } from 'node:fs/promises';
import process from 'node:process';
import vm from 'node:vm';

if (typeof vm.SourceTextModule !== 'function') {
  console.error(
    'Strict validation failed: vm.SourceTextModule unavailable — run with --experimental-vm-modules',
  );
  process.exit(1);
}

const htmlPath = new URL('../public/byeoli-walk/index.html', import.meta.url);
const html = await readFile(htmlPath, 'utf8');

const errors = [];
let checked = 0;

for (const [, attrs, src] of html.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/g)) {
  // 외부 스크립트는 스킵 — 단, 여는 태그의 속성만 검사한다.
  // 본문에 대고 /src=/를 검사하면 `const src=...` 같은 코드에 걸려
  // 모든 블록이 스킵되는 빈 PASS가 난다 (실제 발생했던 버그).
  if (!src.trim() || /\bsrc\s*=/.test(attrs)) continue;
  checked += 1;

  const isModule = /type\s*=\s*["']module["']/.test(attrs);
  try {
    if (isModule) {
      // 컴파일만 수행한다 — link/evaluate는 하지 않으므로 코드가 실행되지 않는다.
      new vm.SourceTextModule(src, { context: vm.createContext({}) });
    } else {
      new vm.Script(src);
    }
  } catch (err) {
    const lineMatch = /:(\d+)/.exec(err.stack?.split('\n')[0] ?? '');
    errors.push(
      `block ${checked} (${isModule ? 'module' : 'classic'}, ${src.length} chars): ${err.message}` +
        (lineMatch ? ` @ block line ${lineMatch[1]}` : ''),
    );
  }
}

if (checked === 0) {
  errors.push('no inline script blocks were checked — extraction filter is broken');
}

if (errors.length > 0) {
  console.error('Strict validation failed:');
  for (const e of errors) console.error(` - ${e}`);
  process.exit(1);
}

console.log(`Strict validation passed: ${JSON.stringify({ checkedBlocks: checked })}`);
