/** 예약 미디어와 자유 게시의 공용 감사 장부 계약을 정적으로 검증한다. */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const read = (path) => readFileSync(resolve(ROOT, path), 'utf8');
const strip = (source) => source.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');
const errors = [];
const logLib = strip(read('functions/api/_publish-log.ts'));
const autopost = strip(read('functions/api/autopost.ts'));
const threads = strip(read('functions/api/_threads-client.ts'));
const ops = strip(read('functions/api/ops/publish-log.ts'));
const middleware = strip(read('functions/_middleware.ts'));

if (/access_token|env\.PUBLISH_KEY/.test(logLib)) errors.push('_publish-log must not read tokens or publish key');
if (/appendPublishLog\([^)]*detail/s.test(autopost)) errors.push('raw Threads detail must not enter publish_log');
if (!/validateSlotIso\(requestedSlot/.test(autopost)) errors.push('scheduledFor is not validated at the route');
if (!/readSlotReceipt/.test(autopost) || !/writeSlotReceipt/.test(autopost)) errors.push('slot receipt guard is missing');
if (!/dispatchToThreads/.test(autopost)) errors.push('scheduled screenshot route does not reach the shared Threads client');
if (!/three-times-daily screenshot lane/.test(autopost)) errors.push('scheduled screenshot lane audit reason is missing');
if (/CF-Connecting-IP|User-Agent/.test(logLib)) errors.push('publish_log must not store IP or user agent');

if (!/\/api\/ops\//.test(middleware) || !/404/.test(middleware) || !/OPS_HOST/.test(middleware)) {
  errors.push('ops routes are not hidden on non-ops hosts');
}
if (/['"]Access-Control-Allow-Origin['"]/.test(ops)) errors.push('ops publish log must not open CORS');
for (const field of ['httpStatus', 'errorCode', 'textIndex', 'imageKey']) {
  if (!logLib.includes(field)) errors.push(`publish record missing ${field}`);
}
for (const field of ['schedule', 'runs', 'missedSlots']) {
  if (!ops.includes(field)) errors.push(`ops response missing ${field}`);
}
if (!threads.includes("'byeoli_log'")) errors.push('shared Threads client lacks @byeoli_log account guard');
if (!threads.includes('auth_or_account_mismatch')) errors.push('shared Threads client does not fail closed');

if (errors.length) {
  console.error('publish_log contract validation FAILED:');
  for (const error of errors) console.error(`  - ${error}`);
  process.exit(1);
}
console.log('publish_log validation passed: autonomy stays unscheduled; media slots are authenticated, validated and receipted');
