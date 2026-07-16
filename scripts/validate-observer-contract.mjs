/**
 * Observer API 계약 검사 — 정본: docs/BUILD_419A_OBSERVER_RECOVERY.md §4
 * 검사 대상:
 *   1. 오류코드가 동결 목록과 정확히 일치 (양방향)
 *   2. blob 64KB(65536 바이트)·레이트리밋 10회/600초 상수
 *   3. 로그 위생: console에 recoveryKey/keyHash 금지, observerId는 마스킹 필수
 *   4. 커밋 순서 계약 문구가 backup.ts에 유지 (KV 성공 후 커밋)
 * 행동 검증은 observer-registry/tests/logic.test.ts (validate:observer가 함께 실행).
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const FROZEN_CODES = [
  'invalid_payload',
  'observer_not_found',
  'observer_key_mismatch',
  'observer_taken',
  'backup_conflict',
  'rate_limited',
  'blob_too_large',
  'schema_unsupported',
  'storage_error',
];

const FILES = [
  'functions/api/observer/_shared.ts',
  'functions/api/observer/backup.ts',
  'functions/api/observer/restore.ts',
  'observer-registry/src/index.ts',
  'observer-registry/src/logic.ts',
  'observer-registry/src/types.ts',
];

const failures = [];
const sources = new Map();
for (const rel of FILES) {
  try {
    sources.set(rel, readFileSync(resolve(ROOT, rel), 'utf8'));
  } catch {
    failures.push(`missing file: ${rel}`);
  }
}

if (failures.length === 0) {
  const all = [...sources.values()].join('\n');

  // 1a. 사용된 오류코드 ⊆ 동결 목록
  const used = new Set();
  for (const m of all.matchAll(/(?:errorResponse|errorJson)\(\s*'([a-z_]+)'/g)) used.add(m[1]);
  for (const m of all.matchAll(/code:\s*'([a-z_]+)'/g)) used.add(m[1]);
  for (const code of used) {
    if (!FROZEN_CODES.includes(code)) failures.push(`undeclared error code used: ${code}`);
  }
  // 1b. 동결 목록 전체가 ERROR_STATUS에 존재 (양쪽 파일)
  for (const rel of ['functions/api/observer/_shared.ts', 'observer-registry/src/types.ts']) {
    const src = sources.get(rel) ?? '';
    for (const code of FROZEN_CODES) {
      if (!src.includes(`${code}:`)) failures.push(`${rel}: ERROR_STATUS missing '${code}'`);
    }
  }
  // 1c. 상태코드 매핑 고정값
  const shared = sources.get('functions/api/observer/_shared.ts') ?? '';
  for (const [code, status] of [
    ['observer_not_found', 404], ['observer_key_mismatch', 403], ['observer_taken', 409],
    ['backup_conflict', 409], ['rate_limited', 429], ['blob_too_large', 413],
    ['schema_unsupported', 422], ['storage_error', 500], ['invalid_payload', 400],
  ]) {
    if (!new RegExp(`${code}:\\s*${status}\\b`).test(shared)) {
      failures.push(`_shared.ts: '${code}' must map to ${status}`);
    }
  }

  // 2. 상수
  if (!/BLOB_LIMIT_BYTES\s*=\s*65536\b/.test(shared)) failures.push('_shared.ts: BLOB_LIMIT_BYTES must be 65536');
  if (!/RL_LIMIT\s*=\s*10\b/.test(shared)) failures.push('_shared.ts: RL_LIMIT must be 10');
  if (!/RL_WINDOW_S\s*=\s*600\b/.test(shared)) failures.push('_shared.ts: RL_WINDOW_S must be 600');
  if (!/TextEncoder\(\)\.encode\(/.test(sources.get('functions/api/observer/backup.ts') ?? '')) {
    failures.push('backup.ts: blob size must be measured in UTF-8 bytes (TextEncoder)');
  }

  // 3. 로그 위생
  for (const [rel, src] of sources) {
    for (const line of src.split('\n')) {
      if (!line.includes('console.')) continue;
      if (/\brecoveryKey\b|\bkeyHash\b/.test(line)) {
        failures.push(`${rel}: console line must not reference recoveryKey/keyHash: ${line.trim()}`);
      }
      if (line.includes('observerId') && !line.includes('maskObserverId')) {
        failures.push(`${rel}: console line must mask observerId: ${line.trim()}`);
      }
    }
  }

  // 4. 커밋 순서 계약 — prepare 결과의 KV put이 commit 호출보다 앞서야 함
  const backup = sources.get('functions/api/observer/backup.ts') ?? '';
  const putIdx = backup.indexOf('OBSERVERS.put(');
  const commitIdx = backup.indexOf("'commit'");
  const prepareIdx = backup.indexOf("'prepare'");
  if (prepareIdx === -1 || putIdx === -1 || commitIdx === -1 || !(prepareIdx < putIdx && putIdx < commitIdx)) {
    failures.push('backup.ts: commit-order contract violated (must be prepare -> KV put -> commit)');
  }
}

if (failures.length > 0) {
  console.error('Observer contract validation FAILED:');
  for (const f of failures) console.error('  - ' + f);
  process.exit(1);
}
console.log(`Observer contract validation passed: ${FILES.length} files, ${FROZEN_CODES.length} frozen codes`);
