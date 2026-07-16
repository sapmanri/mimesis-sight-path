/**
 * 순수 판정 로직 — DO storage와 분리된 상태 in/out 함수.
 * node --test로 커밋 순서 계약을 직접 검증한다 (tests/logic.test.ts).
 *
 * 계약 (동결 문서 §4):
 *   1. 키·baseRevision 검증  2. nextRevision 예약
 *   3. (함수가 KV blob 저장)  4. KV 성공 확인
 *   5. 그 후에만 currentRevision 커밋
 * prepare는 절대 currentRevision을 전진시키지 않는다. 전진은 commit에서만.
 */

import type {
  CommitRequest,
  CommitResult,
  Decision,
  ObserverMeta,
  PrepareRequest,
  PrepareResult,
  RestoreRequest,
  RestoreResult,
} from './types.ts';

export function decidePrepare(
  meta: ObserverMeta | null,
  req: PrepareRequest,
  now: number,
  token: string,
): Decision<PrepareResult> {
  if (meta === null) {
    // 미등록 관찰자: baseRevision 0(신규 등록)만 허용
    if (req.baseRevision !== 0) {
      return { ok: false, code: 'observer_not_found' };
    }
    const fresh: ObserverMeta = {
      keyHash: req.keyHash,
      currentRevision: 0,
      serverSavedAt: null,
      clientSavedAt: null,
      clientInstanceId: null,
      schemaVersion: req.schemaVersion,
      createdAt: now,
      pending: {
        revision: 1,
        token,
        schemaVersion: req.schemaVersion,
        clientSavedAt: req.clientSavedAt ?? null,
        clientInstanceId: req.clientInstanceId ?? null,
      },
    };
    return { ok: true, value: { nextRevision: 1, previousRevision: 0, token }, meta: fresh };
  }

  if (meta.keyHash !== req.keyHash) {
    // 타 키의 등록 시도(base 0) = 선점 충돌, 그 외 = 키 불일치
    return req.baseRevision === 0
      ? { ok: false, code: 'observer_taken' }
      : { ok: false, code: 'observer_key_mismatch' };
  }

  if (req.force === true) {
    // force는 수동·확인 경로만. 확인 시점 revision이 처리 순간과 다르면 재409 (§4)
    if (req.confirmedRevision !== meta.currentRevision) {
      return { ok: false, code: 'backup_conflict', revision: meta.currentRevision };
    }
  } else if (req.baseRevision !== meta.currentRevision) {
    // 다른 기기가 그 사이 백업함 — 무조건 덮어쓰기 금지 (§6)
    return { ok: false, code: 'backup_conflict', revision: meta.currentRevision };
  }

  const nextRevision = meta.currentRevision + 1;
  const updated: ObserverMeta = {
    ...meta,
    // 새 prepare는 이전 예약을 대체(supersede)한다 — 이전 예약의 commit은 token 불일치로 거부됨
    pending: {
      revision: nextRevision,
      token,
      schemaVersion: req.schemaVersion,
      clientSavedAt: req.clientSavedAt ?? null,
      clientInstanceId: req.clientInstanceId ?? null,
    },
  };
  return {
    ok: true,
    value: { nextRevision, previousRevision: meta.currentRevision, token },
    meta: updated,
  };
}

export function decideCommit(
  meta: ObserverMeta | null,
  req: CommitRequest,
  now: number,
): Decision<CommitResult> {
  if (meta === null) return { ok: false, code: 'observer_not_found' };
  if (meta.keyHash !== req.keyHash) return { ok: false, code: 'observer_key_mismatch' };
  if (
    meta.pending === null ||
    meta.pending.revision !== req.revision ||
    meta.pending.token !== req.token
  ) {
    // 예약 없음/대체됨 — currentRevision은 전진하지 않았고, 저장된 KV blob은 고아(무해)
    return { ok: false, code: 'backup_conflict', revision: meta.currentRevision };
  }

  const previousRevision = meta.currentRevision;
  const updated: ObserverMeta = {
    ...meta,
    currentRevision: meta.pending.revision,
    serverSavedAt: now,
    clientSavedAt: meta.pending.clientSavedAt,
    clientInstanceId: meta.pending.clientInstanceId,
    schemaVersion: meta.pending.schemaVersion,
    pending: null,
  };
  return {
    ok: true,
    value: { revision: updated.currentRevision, serverSavedAt: now, previousRevision },
    meta: updated,
  };
}

export function decideRestore(
  meta: ObserverMeta | null,
  req: RestoreRequest,
): Decision<RestoreResult> {
  if (meta === null) return { ok: false, code: 'observer_not_found' };
  if (meta.keyHash !== req.keyHash) return { ok: false, code: 'observer_key_mismatch' };
  if (meta.currentRevision === 0) {
    // 등록만 되고 커밋된 blob이 없음 — blob 없는 revision은 복구 불능 (§4)
    return { ok: false, code: 'observer_not_found' };
  }
  return {
    ok: true,
    value: {
      revision: meta.currentRevision,
      serverSavedAt: meta.serverSavedAt,
      schemaVersion: meta.schemaVersion,
      clientSavedAt: meta.clientSavedAt,
    },
    meta,
  };
}
