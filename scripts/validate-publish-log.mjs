/**
 * BUILD 422-OPS-A — publish_log 계약 정적 검증 (게이트).
 * 정본: docs/BUILD_422_OPS_OBSERVER_CONSOLE.md §3-2, §7-2
 * 검사:
 *   1. 민감정보 저장 금지 — _publish-log.ts / autopost.ts 로그 경로에 토큰·키·원문 message 미유입
 *   2. 401은 건별 기록 금지 — appendPublishLog가 401 경로에서 호출되지 않음(버킷 카운터만)
 *   3. Ops API가 운영 호스트 전용 — 미들웨어에 /api/ops/ 404 가드 존재
 *   4. Ops 응답에 CORS 개방(Access-Control-Allow-Origin) 없음
 *   5. 두 층 소스 존재 — 레코드에 Layer1(httpStatus/errorCode) + Layer2(textIndex/imageKey)
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const read = (p) => readFileSync(resolve(ROOT, p), 'utf8');
const errors = [];

// 주석·문자열 리터럴을 제거하고 실제 코드 라인만 검사한다(오탐 방지)
const stripComments = (src) => src.split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');
const logLib = stripComments(read('functions/api/_publish-log.ts'));
const autopost = stripComments(read('functions/api/autopost.ts'));
const opsApi = stripComments(read('functions/api/ops/publish-log.ts'));
const mw = stripComments(read('functions/_middleware.ts'));

// 1. 민감정보 — 로그 레코드에 토큰/키가 코드로 유입되면 안 됨 (주석 제외)
if (/access_token|env\.PUBLISH_KEY/.test(logLib)) errors.push('_publish-log.ts must not reference access_token/env.PUBLISH_KEY');
// appendPublishLog 호출 인자에 threads.detail(원문)을 넣으면 안 됨
if (/appendPublishLog\([^)]*detail/s.test(autopost)) errors.push('autopost: raw threads.detail must not be passed into appendPublishLog');
// 로그에 넣는 threads 요약은 errorCode/requestId만
if (!/errorCode: threads\.errorCode/.test(autopost)) errors.push('autopost: publish log must record structured errorCode');

// 2. 401 경로 — appendPublishLog 금지, bump401Bucket만
const key401 = autopost.indexOf("!== env.PUBLISH_KEY");
const block401 = key401 >= 0 ? autopost.slice(key401, key401 + 400) : '';
if (!block401) errors.push('autopost: could not locate 401 key-mismatch block');
if (/appendPublishLog/.test(block401)) errors.push('autopost: 401 path must NOT append a per-request log record');
if (!/bump401Bucket/.test(block401)) errors.push('autopost: 401 path must bump the 10-min bucket counter');
// 버킷은 TTL과 함께 저장, IP/헤더 저장 금지
if (!/expirationTtl/.test(logLib)) errors.push('_publish-log.ts: 401 bucket must use expirationTtl');
if (/CF-Connecting-IP|User-Agent|headers\.get\(['"]x-publish-key/i.test(logLib)) errors.push('_publish-log.ts must not read IP/UA/key');

// 3. Ops 호스트 가드
if (!/\/api\/ops\//.test(mw) || !/404/.test(mw) || !/OPS_HOST/.test(mw)) {
  errors.push('_middleware.ts must 404 /api/ops/* on non-ops hosts');
}

// 4. Ops 응답 CORS 미개방 (주석 제외한 코드 기준)
if (/['"]Access-Control-Allow-Origin['"]/.test(opsApi)) errors.push('ops/publish-log.ts must not open CORS');

// 5. 두 층 소스
for (const f of ['httpStatus', 'errorCode', 'textIndex', 'imageKey']) {
  if (!logLib.includes(f)) errors.push(`_publish-log.ts record missing field: ${f}`);
}
// 두 층 필드가 응답에 실제로 매핑되는지 (Layer1: httpStatus,threads / Layer2: textIndex,imageKey)
for (const f of ['httpStatus', 'threads', 'textIndex', 'imageKey', 'missedSlots']) {
  if (!opsApi.includes(f)) errors.push(`ops/publish-log.ts response missing: ${f}`);
}

if (errors.length) {
  console.error('publish_log contract validation FAILED:');
  for (const e of errors) console.error('  - ' + e);
  process.exit(1);
}
console.log('publish_log validation passed: two-layer, 401-bucketed, ops-host-gated, no secrets');
