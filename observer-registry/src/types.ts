/**
 * ObserverRegistry — 관찰자별 소유권·리비전 메타의 단일 결정자.
 * 정본: docs/BUILD_419A_OBSERVER_RECOVERY.md (인터페이스 동결 — 설계 변경 금지)
 *
 * Authority DO와 완전 별개 배포 단위. 서버는 프로필 내용을 해석하지 않는다 —
 * blob은 Pages Function이 KV(OBSERVERS)에 저장하고, 이 DO는 메타·판정만 담당한다.
 */

export const OBSERVER_SCHEMA_VERSION = 1;

/** DO storage에 저장되는 관찰자 1명의 메타. keyHash는 Recovery Key의 SHA-256 hex — 평문 키는 어디에도 없다. */
export interface ObserverMeta {
  keyHash: string;
  /** 커밋된 최신 revision. 0 = 등록만 되고 커밋된 blob 없음. */
  currentRevision: number;
  serverSavedAt: number | null;
  /** 참고 메타 — 판정에 사용 금지 (시간·순서의 진실은 revision) */
  clientSavedAt: number | null;
  clientInstanceId: string | null;
  schemaVersion: number;
  createdAt: number;
  /** 예약된 백업. KV blob 저장 성공 확인 후에만 commit으로 승격된다. */
  pending: PendingReservation | null;
}

export interface PendingReservation {
  revision: number;
  /** prepare가 발급, commit이 대조 — 예약이 다른 prepare로 대체(supersede)되면 불일치로 거부 */
  token: string;
  schemaVersion: number;
  clientSavedAt: number | null;
  clientInstanceId: string | null;
}

/** 동결 문서 §4 오류 코드 (전 엔드포인트 공통) */
export type ObserverErrorCode =
  | 'invalid_payload'
  | 'observer_not_found'
  | 'observer_key_mismatch'
  | 'observer_taken'
  | 'backup_conflict'
  | 'rate_limited'
  | 'blob_too_large'
  | 'schema_unsupported'
  | 'storage_error';

export const ERROR_STATUS: Record<ObserverErrorCode, number> = {
  invalid_payload: 400,
  observer_not_found: 404,
  observer_key_mismatch: 403,
  observer_taken: 409,
  backup_conflict: 409,
  rate_limited: 429,
  blob_too_large: 413,
  schema_unsupported: 422,
  storage_error: 500,
};

export interface PrepareRequest {
  keyHash: string;
  baseRevision: number;
  force?: boolean;
  confirmedRevision?: number;
  schemaVersion: number;
  clientSavedAt?: number;
  clientInstanceId?: string;
}

export interface CommitRequest {
  keyHash: string;
  revision: number;
  token: string;
}

export interface RestoreRequest {
  keyHash: string;
}

export type Decision<T> =
  | { ok: true; value: T; meta: ObserverMeta }
  | { ok: false; code: ObserverErrorCode; revision?: number };

export interface PrepareResult {
  nextRevision: number;
  previousRevision: number;
  token: string;
}

export interface CommitResult {
  revision: number;
  serverSavedAt: number;
  previousRevision: number;
}

export interface RestoreResult {
  revision: number;
  serverSavedAt: number | null;
  schemaVersion: number;
  clientSavedAt: number | null;
}
