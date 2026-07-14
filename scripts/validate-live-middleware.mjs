import fs from 'node:fs';

const src = fs.readFileSync(new URL('../functions/byeoli-walk/_middleware.ts', import.meta.url), 'utf8');
const required = [
  'BYEOLI_AUTHORITY',
  'authority_service_binding_missing',
  "navigator.wakeLock.request('screen')",
  'WakeLockManager.start()',
  '마지막 화면 유지',
  'LiveUi.showAuthorityError',
];
const missing = required.filter((token) => !src.includes(token));
if (missing.length) {
  console.error('Live middleware validation failed. Missing:', missing.join(', '));
  process.exit(1);
}
console.log('Live middleware validation passed.');
