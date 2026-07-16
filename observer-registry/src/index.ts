/**
 * mimesis-observer-registry — 관찰자 소유권·리비전 메타의 단일 결정자 워커.
 * 정본: docs/BUILD_419A_OBSERVER_RECOVERY.md
 *
 * Pages Functions(functions/api/observer/*)만 서비스 바인딩으로 호출하는 내부 API.
 * blob 저장은 하지 않는다 — KV(OBSERVERS)는 Pages Function이 소유.
 *
 * 내부 엔드포인트 (POST):
 *   /observer/prepare  키·baseRevision 검증 + nextRevision 예약
 *   /observer/commit   KV blob 저장 성공 확인 후 currentRevision 커밋
 *   /observer/restore  키 대조 후 메타 반환 (blob은 함수가 KV에서 읽음)
 *
 * 관찰자 1명 = DO 인스턴스 1개 (idFromName(observerId)) — 등록·키대조·revision
 * 증가가 DO 직렬화 안에서 원자적으로 처리된다 (check-then-set 레이스 차단).
 */

import { DurableObject } from 'cloudflare:workers';
import { decideCommit, decidePrepare, decideRestore } from './logic.ts';
import { ERROR_STATUS, type Decision, type ObserverErrorCode, type ObserverMeta } from './types.ts';

interface Env {
  OBSERVER_REGISTRY: DurableObjectNamespace;
}

const META_KEY = 'observer-meta-v1';

const JSON_HEADERS = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store',
};

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: JSON_HEADERS });
}

function errorJson(code: ObserverErrorCode, revision?: number): Response {
  // 오류 응답에 키·해시 전문 절대 미포함 (§4)
  const body: { error: ObserverErrorCode; revision?: number } = { error: code };
  if (revision !== undefined) body.revision = revision;
  return json(body, ERROR_STATUS[code]);
}

export class ObserverRegistry extends DurableObject<Env> {
  async fetch(request: Request): Promise<Response> {
    if (request.method !== 'POST') return errorJson('invalid_payload');

    let body: Record<string, unknown>;
    try {
      body = (await request.json()) as Record<string, unknown>;
    } catch {
      return errorJson('invalid_payload');
    }
    const keyHash = body.keyHash;
    if (typeof keyHash !== 'string' || !/^[0-9a-f]{64}$/.test(keyHash)) {
      return errorJson('invalid_payload');
    }

    const url = new URL(request.url);
    if (url.pathname === '/observer/ping') return json({ ok: true, ping: 'do' });
    const meta = (await this.ctx.storage.get<ObserverMeta>(META_KEY)) ?? null;
    const now = Date.now();

    if (url.pathname === '/observer/prepare') {
      const baseRevision = body.baseRevision;
      const schemaVersion = body.schemaVersion;
      if (
        typeof baseRevision !== 'number' || !Number.isInteger(baseRevision) || baseRevision < 0 ||
        typeof schemaVersion !== 'number'
      ) {
        return errorJson('invalid_payload');
      }
      if (body.force === true && typeof body.confirmedRevision !== 'number') {
        return errorJson('invalid_payload');
      }
      const decision = decidePrepare(
        meta,
        {
          keyHash,
          baseRevision,
          force: body.force === true,
          confirmedRevision: typeof body.confirmedRevision === 'number' ? body.confirmedRevision : undefined,
          schemaVersion,
          clientSavedAt: typeof body.clientSavedAt === 'number' ? body.clientSavedAt : undefined,
          clientInstanceId: typeof body.clientInstanceId === 'string' ? body.clientInstanceId : undefined,
        },
        now,
        crypto.randomUUID(),
      );
      return this.settle(decision);
    }

    if (url.pathname === '/observer/commit') {
      const revision = body.revision;
      const token = body.token;
      if (typeof revision !== 'number' || typeof token !== 'string') {
        return errorJson('invalid_payload');
      }
      const decision = decideCommit(meta, { keyHash, revision, token }, now);
      return this.settle(decision);
    }

    if (url.pathname === '/observer/restore') {
      const decision = decideRestore(meta, { keyHash });
      // restore는 메타를 변경하지 않음 — 저장 생략
      if (!decision.ok) return errorJson(decision.code, decision.revision);
      return json({ ok: true, ...decision.value });
    }

    return errorJson('invalid_payload');
  }

  /** 판정 결과를 storage에 반영한 뒤 응답 — put 성공이 응답의 전제 */
  private async settle<T>(decision: Decision<T>): Promise<Response> {
    if (!decision.ok) return errorJson(decision.code, decision.revision);
    try {
      await this.ctx.storage.put(META_KEY, decision.meta);
    } catch {
      return errorJson('storage_error');
    }
    return json({ ok: true, ...decision.value });
  }
}

const OBSERVER_ID_RE = /^BYL-[ABCDEFGHJKMNPQRSTUVWXYZ2-9]{4}-[ABCDEFGHJKMNPQRSTUVWXYZ2-9]{4}$/;

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method !== 'POST') return errorJson('invalid_payload');
    const url = new URL(request.url);
    if (!url.pathname.startsWith('/observer/')) return errorJson('invalid_payload');

    // observerId는 헤더로 전달 — body는 그대로 DO에 중계
    const observerId = request.headers.get('x-observer-id') ?? '';
    if (!OBSERVER_ID_RE.test(observerId)) return errorJson('invalid_payload');

    const stub = env.OBSERVER_REGISTRY.get(env.OBSERVER_REGISTRY.idFromName(observerId));
    try {
      return await stub.fetch(request);
    } catch {
      // DO 디스패치 실패를 1101이 아닌 계약 오류코드로 응답
      return errorJson('storage_error');
    }
  },
};
