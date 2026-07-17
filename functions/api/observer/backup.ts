/**
 * POST /api/observer/backup — 정본: docs/BUILD_419A_OBSERVER_RECOVERY.md §4
 *
 * 처리 순서 계약 (절대 순서 변경 금지):
 *   1. DO: 키·baseRevision 검증   2. DO: nextRevision 예약   (→ /observer/prepare)
 *   3. KV: blob:<id>:<nextRevision> 저장   4. KV 저장 성공 확인
 *   5. DO: currentRevision 커밋   (→ /observer/commit)   6. 성공 응답
 *
 * KV 저장 성공 후에만 currentRevision이 커밋된다. 3~5 사이 실패 시 기존 revision
 * 유지 — 커밋되지 않은 KV blob은 고아 객체(무해, 추후 정리).
 */

import {
  BLOB_LIMIT_BYTES,
  CORS,
  OBSERVER_ID_RE,
  OBSERVER_SCHEMA_VERSION,
  RECOVERY_KEY_RE,
  blobKey,
  callRegistry,
  errorResponse,
  isRateLimited,
  jsonResponse,
  maskObserverId,
  sha256Hex,
  type ObserverEnv,
} from './_shared';
import { ingestCollectiveSnapshot } from '../_collective-io';

// 422-OPS-E: 집단 통계는 blob과 "별도로" 실린 collectiveSnapshot만 소비한다.
// blob은 여기서도 계속 불투명 — 집계 경로는 blob 내용을 알지 못한다 (§6-4).
interface BackupEnv extends ObserverEnv {
  PLANET?: KVNamespace;
}

export const onRequestOptions: PagesFunction<ObserverEnv> = async () =>
  new Response(null, { status: 204, headers: CORS });

export const onRequestPost: PagesFunction<ObserverEnv> = async ({ request, env }) => {
  if (!env.OBSERVER_REGISTRY || !env.OBSERVERS) {
    console.error('observer/backup: binding missing (OBSERVER_REGISTRY or OBSERVERS)');
    return errorResponse('storage_error');
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return errorResponse('invalid_payload');
  }

  const { observerId, recoveryKey, blob, schemaVersion, baseRevision } = body as {
    observerId?: unknown;
    recoveryKey?: unknown;
    blob?: unknown;
    schemaVersion?: unknown;
    baseRevision?: unknown;
  };

  if (
    typeof observerId !== 'string' || !OBSERVER_ID_RE.test(observerId) ||
    typeof recoveryKey !== 'string' || !RECOVERY_KEY_RE.test(recoveryKey) ||
    typeof baseRevision !== 'number' || !Number.isInteger(baseRevision) || baseRevision < 0 ||
    blob === null || typeof blob !== 'object'
  ) {
    return errorResponse('invalid_payload');
  }
  if (schemaVersion !== OBSERVER_SCHEMA_VERSION) {
    return errorResponse('schema_unsupported');
  }
  const force = body.force === true;
  if (force && typeof body.confirmedRevision !== 'number') {
    return errorResponse('invalid_payload');
  }

  // 64KB — 문자열 길이가 아닌 UTF-8 직렬화 바이트 (§2)
  const blobSerialized = JSON.stringify(blob);
  if (new TextEncoder().encode(blobSerialized).byteLength > BLOB_LIMIT_BYTES) {
    return errorResponse('blob_too_large');
  }

  const ip = request.headers.get('CF-Connecting-IP') ?? 'unknown';
  if (await isRateLimited(env.OBSERVERS, ip, observerId)) {
    return errorResponse('rate_limited');
  }

  // 평문 키는 여기서 즉시 해시 — 이후 어떤 저장·로그·응답에도 평문/전문 미포함
  const keyHash = await sha256Hex(recoveryKey);

  // 1~2. DO 검증 + 예약
  const prepareRes = await callRegistry(env.OBSERVER_REGISTRY, 'prepare', observerId, {
    keyHash,
    baseRevision,
    force,
    confirmedRevision: typeof body.confirmedRevision === 'number' ? body.confirmedRevision : undefined,
    schemaVersion,
    clientSavedAt: typeof body.clientSavedAt === 'number' ? body.clientSavedAt : undefined,
    clientInstanceId: typeof body.clientInstanceId === 'string' ? body.clientInstanceId : undefined,
  });
  const prepared = (await prepareRes.json().catch(() => null)) as
    | { ok?: boolean; nextRevision?: number; token?: string; error?: string; revision?: number }
    | null;
  if (!prepareRes.ok || !prepared?.ok || typeof prepared.nextRevision !== 'number' || typeof prepared.token !== 'string') {
    if (prepared?.error === 'backup_conflict') {
      console.warn(
        `observer/backup conflict id=${maskObserverId(observerId)} base=${baseRevision} server=${prepared.revision} ci=${typeof body.clientInstanceId === 'string' ? body.clientInstanceId : '-'}`,
      );
    }
    return new Response(prepareRes.ok ? JSON.stringify({ error: 'storage_error' }) : JSON.stringify(prepared ?? { error: 'storage_error' }), {
      status: prepareRes.ok ? 500 : prepareRes.status,
      headers: { ...CORS, 'Content-Type': 'application/json; charset=utf-8' },
    });
  }

  // 3~4. KV blob 저장 + 성공 확인 (put 예외 = 실패 → 커밋하지 않음)
  try {
    await env.OBSERVERS.put(blobKey(observerId, prepared.nextRevision), blobSerialized);
  } catch (err) {
    console.error(`observer/backup: KV put failed id=${maskObserverId(observerId)} rev=${prepared.nextRevision}`, err);
    return errorResponse('storage_error');
  }

  // 5. KV 성공 후에만 currentRevision 커밋
  const commitRes = await callRegistry(env.OBSERVER_REGISTRY, 'commit', observerId, {
    keyHash,
    revision: prepared.nextRevision,
    token: prepared.token,
  });
  const committed = (await commitRes.json().catch(() => null)) as
    | { ok?: boolean; revision?: number; serverSavedAt?: number; previousRevision?: number; error?: string }
    | null;
  if (!commitRes.ok || !committed?.ok) {
    // 예약이 다른 prepare로 대체된 레이스 등 — 저장된 blob은 고아(무해)
    return new Response(JSON.stringify(committed ?? { error: 'storage_error' }), {
      status: commitRes.ok ? 500 : commitRes.status,
      headers: { ...CORS, 'Content-Type': 'application/json; charset=utf-8' },
    });
  }

  // 422-OPS-E: 커밋 성공 후 집단 snapshot 반영 — 어떤 실패도 백업 성공 응답을 깨지 않는다.
  const planet = (env as BackupEnv).PLANET;
  if (planet && body.collectiveSnapshot !== undefined) {
    try {
      await ingestCollectiveSnapshot(planet, observerId, body.collectiveSnapshot);
    } catch (err) {
      console.warn('collective ingest failed (backup unaffected)', err);
    }
  }

  // 6. 성공 응답
  return jsonResponse({
    ok: true,
    revision: committed.revision,
    serverSavedAt: committed.serverSavedAt,
    previousRevision: committed.previousRevision,
  });
};
