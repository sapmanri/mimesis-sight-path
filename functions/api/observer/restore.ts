/**
 * POST /api/observer/restore — 정본: docs/BUILD_419A_OBSERVER_RECOVERY.md §4
 * DO에서 키 대조·메타 확인 → KV에서 blob 반환.
 * 복구 성공 시 클라이언트는 수신 revision을 자신의 baseRevision으로 삼는다.
 */

import {
  CORS,
  OBSERVER_ID_RE,
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

export const onRequestOptions: PagesFunction<ObserverEnv> = async () =>
  new Response(null, { status: 204, headers: CORS });

export const onRequestPost: PagesFunction<ObserverEnv> = async ({ request, env }) => {
  if (!env.OBSERVER_REGISTRY || !env.OBSERVERS) {
    console.error('observer/restore: binding missing (OBSERVER_REGISTRY or OBSERVERS)');
    return errorResponse('storage_error');
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return errorResponse('invalid_payload');
  }

  const { observerId, recoveryKey } = body as { observerId?: unknown; recoveryKey?: unknown };
  if (
    typeof observerId !== 'string' || !OBSERVER_ID_RE.test(observerId) ||
    typeof recoveryKey !== 'string' || !RECOVERY_KEY_RE.test(recoveryKey)
  ) {
    return errorResponse('invalid_payload');
  }

  const ip = request.headers.get('CF-Connecting-IP') ?? 'unknown';
  if (await isRateLimited(env.OBSERVERS, ip, observerId)) {
    return errorResponse('rate_limited');
  }

  const keyHash = await sha256Hex(recoveryKey);

  const metaRes = await callRegistry(env.OBSERVER_REGISTRY, 'restore', observerId, { keyHash });
  const meta = (await metaRes.json().catch(() => null)) as
    | { ok?: boolean; revision?: number; serverSavedAt?: number | null; schemaVersion?: number; error?: string }
    | null;
  if (!metaRes.ok || !meta?.ok || typeof meta.revision !== 'number') {
    return new Response(JSON.stringify(meta ?? { error: 'storage_error' }), {
      status: metaRes.ok ? 500 : metaRes.status,
      headers: { ...CORS, 'Content-Type': 'application/json; charset=utf-8' },
    });
  }

  const stored = await env.OBSERVERS.get(blobKey(observerId, meta.revision));
  if (stored === null) {
    // 커밋 계약상 blob 없는 revision은 존재 불가 — 발생 시 서버 결함
    console.error(`observer/restore: blob missing id=${maskObserverId(observerId)} rev=${meta.revision}`);
    return errorResponse('storage_error');
  }

  let blob: unknown;
  try {
    blob = JSON.parse(stored);
  } catch {
    console.error(`observer/restore: blob corrupt id=${maskObserverId(observerId)} rev=${meta.revision}`);
    return errorResponse('storage_error');
  }

  return jsonResponse({
    ok: true,
    blob,
    revision: meta.revision,
    serverSavedAt: meta.serverSavedAt ?? null,
    schemaVersion: meta.schemaVersion,
  });
};
