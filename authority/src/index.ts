import { DurableObject } from 'cloudflare:workers';
import {
  AUTHORITY_NAME,
  AUTHORITY_SCHEMA_VERSION,
  type AuthorityHealth,
  type AuthorityPersistence,
} from './types';
import { advanceCanaryRuntime, authorityTickMs, createGenesis, toEnvelope } from './runtime';

interface Env {
  BYEOLI_AUTHORITY: DurableObjectNamespace;
}

const STORAGE_KEY = 'authority-v1';

const JSON_HEADERS = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store',
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, OPTIONS',
  'access-control-allow-headers': 'content-type',
};

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: JSON_HEADERS });
}

export class ByeoliAuthority extends DurableObject<Env> {
  private persisted!: AuthorityPersistence;
  private storageRecovered = false;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.blockConcurrencyWhile(async () => {
      const stored = await ctx.storage.get<AuthorityPersistence>(STORAGE_KEY);
      if (stored?.schemaVersion === AUTHORITY_SCHEMA_VERSION) {
        this.persisted = stored;
        this.storageRecovered = true;
      } else {
        this.persisted = createGenesis(Date.now());
        await ctx.storage.put(STORAGE_KEY, this.persisted);
      }
      await this.ensureAlarm();
    });
  }

  private async ensureAlarm(): Promise<void> {
    const alarm = await this.ctx.storage.getAlarm();
    if (alarm === null) {
      await this.ctx.storage.setAlarm(Date.now() + authorityTickMs);
    }
  }

  async alarm(): Promise<void> {
    this.persisted = advanceCanaryRuntime(this.persisted, Date.now());
    await this.ctx.storage.put(STORAGE_KEY, this.persisted);
    await this.ctx.storage.setAlarm(Date.now() + authorityTickMs);
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: JSON_HEADERS });
    if (request.method !== 'GET') return json({ error: 'read_only_authority' }, 405);

    if (url.pathname === '/state') {
      return json(toEnvelope(this.persisted));
    }

    // 사건 공책 읽기 — **읽기 전용**. Core가 cursor 이후 사건을 빠짐없이 가져간다.
    // (Vase 승인 2026-07-26 · 홈즈 설계: sequence 폴링은 사건 유실로 반려됐다)
    if (url.pathname === '/events') {
      const box = this.persisted.eventOutbox ?? [];
      const cursor = Number(url.searchParams.get('cursor') ?? 0) || 0;
      const limit = Math.min(200, Math.max(1, Number(url.searchParams.get('limit') ?? 100) || 100));
      const events = box.filter((e) => e.authoritySequence > cursor).slice(0, limit);
      const next = events.length ? events[events.length - 1].authoritySequence : cursor;
      return json({
        ok: true,
        authorityId: AUTHORITY_NAME,
        instanceEpoch: this.persisted.instanceEpoch,
        cursor, nextCursor: next, events,
        // 링이 밀려 사건을 놓쳤는지 Core가 스스로 알 수 있어야 한다 — 침묵 금지.
        oldestAvailable: box.length ? box[0].authoritySequence : null,
        dropped: box.length && cursor > 0 && cursor < box[0].authoritySequence - 1,
        ringSize: box.length,
      });
    }

    if (url.pathname === '/health') {
      const health: AuthorityHealth = {
        ok: true,
        schemaVersion: AUTHORITY_SCHEMA_VERSION,
        authorityId: AUTHORITY_NAME,
        instanceEpoch: this.persisted.instanceEpoch,
        sequence: this.persisted.sequence,
        startedAt: this.persisted.startedAt,
        lastTickAt: this.persisted.lastTickAt,
        connectedViewers: 0,
        storageRecovered: this.storageRecovered,
        archiveMode: this.persisted.archiveMode,
      };
      return json(health);
    }

    return json({ error: 'not_found' }, 404);
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: JSON_HEADERS });

    const route = url.pathname;
    // /events — 사건 공책 읽기 (Vase 승인 2026-07-26). 읽기 전용, 커서 기반.
    if (route !== '/api/byeoli/state' && route !== '/api/byeoli/health' && route !== '/api/byeoli/events') {
      return json({ error: 'not_found' }, 404);
    }

    // 단 하나의 고정 이름만 사용한다. 사용자·탭·viewer별 DO 생성 금지.
    const stub = env.BYEOLI_AUTHORITY.getByName(AUTHORITY_NAME);
    const internalPath = route.endsWith('/health') ? '/health'
      : route.endsWith('/events') ? `/events${url.search}`     // cursor·limit을 그대로 넘긴다
      : '/state';
    const internalRequest = new Request(`https://byeoli-authority.internal${internalPath}`, {
      method: 'GET',
      headers: request.headers,
    });
    return stub.fetch(internalRequest);
  },
} satisfies ExportedHandler<Env>;
