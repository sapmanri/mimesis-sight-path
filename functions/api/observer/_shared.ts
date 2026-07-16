/**
 * /api/observer/* 공유 유틸 — 정본: docs/BUILD_419A_OBSERVER_RECOVERY.md
 *
 * 원칙:
 *  - Recovery Key 평문은 이 레이어에서 즉시 SHA-256으로 해시. 저장·로그·응답 어디에도 평문/해시 전문 미노출.
 *  - observerId는 로그에 뒷 4자리 마스킹 (클라이언트 관례 slice(0,-4)와 동일).
 *  - 오류 응답은 동결 오류코드만. 남은 시도 수 등 열거에 도움되는 정보 미표시.
 */

export interface ObserverEnv {
  /** Pages 서비스 바인딩 → mimesis-observer-registry 워커 */
  OBSERVER_REGISTRY: Fetcher;
  /** Pages KV 바인딩 → mimesis-observers */
  OBSERVERS: KVNamespace;
}

export const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Cache-Control': 'no-store',
} as const;

const JSON_HEADERS = { ...CORS, 'Content-Type': 'application/json; charset=utf-8' };

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

/** 클라이언트 Observer Code 형식과 동일 (I,L,O,0,1 제외 31자) */
export const OBSERVER_ID_RE = /^BYL-[ABCDEFGHJKMNPQRSTUVWXYZ2-9]{4}-[ABCDEFGHJKMNPQRSTUVWXYZ2-9]{4}$/;
/** Recovery Key: Crockford base32 24자 (I/L/O/U 제외) */
export const RECOVERY_KEY_RE =
  /^BYLR-[0-9ABCDEFGHJKMNPQRSTVWXYZ]{6}-[0-9ABCDEFGHJKMNPQRSTVWXYZ]{6}-[0-9ABCDEFGHJKMNPQRSTVWXYZ]{6}-[0-9ABCDEFGHJKMNPQRSTVWXYZ]{6}$/;

export const OBSERVER_SCHEMA_VERSION = 1;
/** UTF-8 직렬화 바이트 기준 (§2) */
export const BLOB_LIMIT_BYTES = 65536;

export const RL_LIMIT = 10;
export const RL_WINDOW_S = 600;

export function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: JSON_HEADERS });
}

export function errorResponse(code: ObserverErrorCode, revision?: number): Response {
  const body: { error: ObserverErrorCode; revision?: number } = { error: code };
  if (revision !== undefined) body.revision = revision;
  return jsonResponse(body, ERROR_STATUS[code]);
}

/** 로그용 마스킹 — 뒷 4자리 가림 */
export function maskObserverId(id: string): string {
  return id.length > 4 ? id.slice(0, -4) + '****' : '****';
}

export async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * IP당 + observerId당 10회/10분 (§4 레이트리밋). KV 고정 윈도 카운터, TTL로 자연 소멸.
 * KV는 최종 일관성이라 엄밀 카운터는 아니지만 동결 문서가 KV 카운터를 명시 — 123bit 키와
 * 결합하면 온라인 무차별 대입은 실질 불가능.
 */
export async function isRateLimited(
  kv: KVNamespace,
  ip: string,
  observerId: string,
): Promise<boolean> {
  const slot = Math.floor(Date.now() / (RL_WINDOW_S * 1000));
  const keys = [`rl:ip:${ip}:${slot}`, `rl:obs:${observerId}:${slot}`];
  let limited = false;
  for (const key of keys) {
    const raw = await kv.get(key);
    const count = raw === null ? 0 : parseInt(raw, 10) || 0;
    if (count >= RL_LIMIT) {
      limited = true;
      continue;
    }
    await kv.put(key, String(count + 1), { expirationTtl: RL_WINDOW_S });
  }
  return limited;
}

export function blobKey(observerId: string, revision: number): string {
  return `blob:${observerId}:${revision}`;
}

/** 워커 내부 호출 — observerId는 헤더, 나머지는 body */
export async function callRegistry(
  registry: Fetcher,
  path: 'prepare' | 'commit' | 'restore',
  observerId: string,
  body: Record<string, unknown>,
): Promise<Response> {
  return registry.fetch(`https://observer-registry.internal/observer/${path}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-observer-id': observerId,
    },
    body: JSON.stringify(body),
  });
}
