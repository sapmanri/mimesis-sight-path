// byeoli-publish-scheduler — 별이 Social Director.
//
// 2026-08-13 이전: 08/18/22 고정 Cron으로 /api/autopost를 호출했다.
// 2026-08-13 이후: 고정 시각표를 폐기했다. Durable Object의 단 한 번짜리 alarm만 쓰고,
// Pages의 별이 편집 판단이 돌려준 nextLookAt을 다음 알람으로 삼는다. null이면 새 사건까지 쉰다.
// 게시·댓글 판단·Meta 쓰기는 Pages 한 실행선(/api/radio/social-agent)에만 있다.

import { DurableObject } from 'cloudflare:workers';

const NAME = 'byeoli-social-director';
const STATE_KEY = 'social-director-v1';
const ENDPOINT = 'https://mimesis-sight-path.pages.dev/api/radio/social-agent';
const REQUEST_TIMEOUT_MS = 120_000;

const headers = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store',
};
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers });

function eventId(kind, now) {
  return `${kind}:${now}:${crypto.randomUUID().slice(0, 12)}`;
}

export class ByeoliSocialDirector extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.state = {
      version: 'social-director-v1', lastWakeAt: null, lastFinishedAt: null,
      lastStatus: 'idle', lastRunId: null, nextLookAt: null, lastError: null,
      continuationPending: false,
    };
    this.queue = Promise.resolve();
    ctx.blockConcurrencyWhile(async () => {
      this.state = { ...this.state, ...((await ctx.storage.get(STATE_KEY)) ?? {}) };
    });
  }

  async persist() {
    await this.ctx.storage.put(STATE_KEY, this.state);
  }

  async wake(trigger) {
    const now = Date.now();
    const requested = trigger && typeof trigger === 'object' ? trigger : {};
    const kind = typeof requested.kind === 'string' ? requested.kind : 'curiosity';
    const normalizedTrigger = {
      kind,
      eventId: typeof requested.eventId === 'string' && requested.eventId
        ? requested.eventId.slice(0, 180)
        : eventId(kind, now),
      occurredAt: Number.isFinite(Number(requested.occurredAt)) ? Number(requested.occurredAt) : now,
      refId: requested.refId == null ? null : String(requested.refId).slice(0, 120),
    };
    this.state = { ...this.state, lastWakeAt: now, lastStatus: 'running', lastError: null };
    await this.persist();
    let payload;
    try {
      const response = await fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'X-Pulse-Key': this.env.PULSE_KEY },
        body: JSON.stringify({ trigger: normalizedTrigger }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      payload = await response.json().catch(() => null);
      if (!response.ok && response.status !== 207) {
        throw new Error(`pages_http_${response.status}:${payload?.error ?? 'unknown'}`);
      }
      const continuationPending = payload?.continuationNeeded === true;
      const requestedDelay = Number(payload?.continuationDelayMs);
      const continuationDelay = Number.isFinite(requestedDelay)
        ? Math.min(10 * 60_000, Math.max(1_000, Math.trunc(requestedDelay)))
        : 1_000;
      const editorialNext = Number(payload?.nextLookAt);
      const next = continuationPending ? Date.now() + continuationDelay : editorialNext;
      this.state = {
        ...this.state, lastFinishedAt: Date.now(), lastStatus: payload?.ok ? 'ok' : 'partial',
        lastRunId: payload?.runId ?? null,
        nextLookAt: Number.isFinite(next) && next > Date.now() ? Math.trunc(next) : null,
        lastError: payload?.error ?? payload?.replies?.errors?.[0] ?? null,
        continuationPending,
      };
      await this.ctx.storage.deleteAlarm();
      if (this.state.nextLookAt) await this.ctx.storage.setAlarm(this.state.nextLookAt);
      await this.persist();
      return payload;
    } catch (error) {
      const message = String(error?.message ?? error).slice(0, 240);
      // 실행 장애는 별이의 편집 선택이 아니다. 유실 방지용 기술 재시도만 10분 뒤 한 번 예약한다.
      const retryAt = Date.now() + 10 * 60_000;
      this.state = {
        ...this.state, lastFinishedAt: Date.now(), lastStatus: 'failed',
        nextLookAt: retryAt, lastError: message, continuationPending: true,
      };
      await this.ctx.storage.setAlarm(retryAt);
      await this.persist();
      throw error;
    }
  }

  enqueue(trigger) {
    const run = this.queue.then(() => this.wake(trigger));
    this.queue = run.catch(() => {});
    return run;
  }

  async alarm() {
    const kind = this.state.continuationPending ? 'backlog_continue' : 'curiosity';
    await this.enqueue({ kind, eventId: eventId(kind, Date.now()), occurredAt: Date.now() });
  }

  async fetch(request) {
    const url = new URL(request.url);
    if (request.method === 'GET' && url.pathname === '/state') {
      return json({ ok: true, ...this.state, alarmAt: await this.ctx.storage.getAlarm() });
    }
    if (request.method === 'POST' && url.pathname === '/start') {
      const result = await this.enqueue({ kind: 'manual_start', eventId: eventId('manual_start', Date.now()), occurredAt: Date.now() });
      return json(result, result?.ok ? 200 : 207);
    }
    if (request.method === 'POST' && url.pathname === '/wake') {
      const body = await request.json().catch(() => ({}));
      const trigger = body?.trigger ?? body;
      this.state = { ...this.state, lastWakeAt: Date.now(), lastStatus: 'queued', lastError: null };
      await this.persist();
      this.ctx.waitUntil(this.enqueue(trigger));
      return json({ ok: true, accepted: true, trigger });
    }
    return json({ ok: false, error: 'not_found' }, 404);
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === 'GET' && url.pathname === '/health') {
      return json({ ok: true, service: NAME, mode: 'event_and_byeoli_chosen_wake' });
    }
    if (request.method === 'GET' && url.pathname === '/state') {
      if (!env.PULSE_KEY || request.headers.get('X-Pulse-Key') !== env.PULSE_KEY) {
        return json({ ok: false, error: 'forbidden' }, 403);
      }
      const stub = env.BYEOLI_SOCIAL_DIRECTOR.getByName(NAME);
      return stub.fetch('https://social-director.internal/state');
    }
    if (request.method !== 'POST' || (url.pathname !== '/start' && url.pathname !== '/wake')) {
      return json({ ok: false, error: 'not_found' }, 404);
    }
    if (!env.PULSE_KEY || request.headers.get('X-Pulse-Key') !== env.PULSE_KEY) {
      return json({ ok: false, error: 'forbidden' }, 403);
    }
    const stub = env.BYEOLI_SOCIAL_DIRECTOR.getByName(NAME);
    return stub.fetch(`https://social-director.internal${url.pathname}`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: await request.text(),
    });
  },
};
