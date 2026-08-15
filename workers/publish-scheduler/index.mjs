// byeoli-publish-scheduler — 별이 Social Director + 예약 미디어 배달부.
//
// 2026-08-13 이전: 08/18/22 고정 Cron으로 /api/autopost를 호출했다.
// 2026-08-13 이후: 고정 게시 시각표를 폐기했다. Durable Object의 단 한 번짜리 alarm만 쓰고,
// Pages의 별이 편집 판단이 돌려준 nextLookAt을 우선한다. null이면 실제 사건을 기다리되,
// 무기한 휴면만 막는 12시간 생존 알람이 판단 기회를 한 번 다시 연다. 게시를 강제하지 않는다.
// 게시·댓글 판단·Meta 쓰기는 Pages 한 실행선(/api/radio/social-agent)에만 있다.
// 단, 사용자가 명시적으로 유지한 스크린샷 엽서 08/18/22 KST 예약선은 별도 scheduled
// 이벤트로 /api/autopost만 호출한다. 이 예약선은 Social Director를 깨우거나 편집 판단을
// 대신하지 않는다.

import { DurableObject } from 'cloudflare:workers';
import {
  LIVENESS_GUARD_MS, alarmTriggerKind, planDirectorWake,
} from './schedule.mjs';

const NAME = 'byeoli-social-director';
// v2 starts from a clean one-shot state. The v1 alarm belonged to the faulty
// event/backlog chain and must never be inherited when outbound access reopens.
const STATE_KEY = 'social-director-v2';
const ENDPOINT = 'https://mimesis-sight-path.pages.dev/api/radio/social-agent';
const MEDIA_ENDPOINT = 'https://mimesis-sight-path.pages.dev/api/autopost';
const REQUEST_TIMEOUT_MS = 120_000;
const MEDIA_TIMEOUT_MS = 60_000;
const SLOT_HOURS_KST = [8, 18, 22];
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

const headers = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store',
};
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers });

function eventId(kind, now) {
  return `${kind}:${now}:${crypto.randomUUID().slice(0, 12)}`;
}

function kstIso(utcMs) {
  const k = new Date(utcMs + KST_OFFSET_MS);
  const p = (n) => String(n).padStart(2, '0');
  return `${k.getUTCFullYear()}-${p(k.getUTCMonth() + 1)}-${p(k.getUTCDate())}T${p(k.getUTCHours())}:${p(k.getUTCMinutes())}:00+09:00`;
}

/** now 이전 예약 슬롯을 최신순으로 반환한다. */
export function recentMediaSlots(now, count) {
  const out = [];
  const kst = new Date(now + KST_OFFSET_MS);
  for (let dayBack = 0; dayBack <= 1 && out.length < count + 3; dayBack += 1) {
    const base = new Date(kst);
    base.setUTCDate(base.getUTCDate() - dayBack);
    for (const hour of SLOT_HOURS_KST) {
      const utc = Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), base.getUTCDate(), hour) - KST_OFFSET_MS;
      if (utc <= now) out.push(utc);
    }
  }
  return out.sort((a, b) => b - a).slice(0, count);
}

async function callMediaSlot(env, slotUtc) {
  const slot = kstIso(slotUtc);
  try {
    const response = await fetch(`${MEDIA_ENDPOINT}?scheduledFor=${encodeURIComponent(slot)}`, {
      method: 'POST',
      headers: { 'X-Publish-Key': env.PUBLISH_KEY },
      signal: AbortSignal.timeout(MEDIA_TIMEOUT_MS),
    });
    const body = await response.json().catch(() => null);
    return `${slot} ${response.status} ${body?.skipped ?? (body?.ok ? 'published' : body?.error ?? 'unknown')}`;
  } catch (error) {
    return `${slot} fetch_error:${String(error?.message ?? error).slice(0, 120)}`;
  }
}

async function runScheduledMedia(env, now) {
  if (!env.PUBLISH_KEY) {
    console.error('scheduled-media: PUBLISH_KEY missing; no call made');
    return;
  }
  // 현재 슬롯과 직전 슬롯을 함께 호출한다. 성공 영수증이 있으면 둘 다 무해한 no-op이고,
  // 장애로 비었던 직전 슬롯만 13시간 안에서 보충된다.
  const slots = recentMediaSlots(now, 2);
  const results = [];
  for (const slot of slots) results.push(await callMediaSlot(env, slot));
  console.log(`scheduled-media: ${results.join(' | ')}`);
}

export class ByeoliSocialDirector extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.state = {
      version: 'social-director-v2', lastWakeAt: null, lastFinishedAt: null,
      lastStatus: 'idle', lastRunId: null, nextLookAt: null, lastError: null,
      continuationPending: false, selfWakeAt: null, livenessWakeAt: null,
      lastTriggerKind: null,
    };
    this.queue = Promise.resolve();
    ctx.blockConcurrencyWhile(async () => {
      const stored = await ctx.storage.get(STATE_KEY);
      if (stored) this.state = { ...this.state, ...stored };
      else {
        // A stale v1 alarm may still be retrying while publishing is locked.
        await ctx.storage.deleteAlarm();
      }
      const alarmAt = await ctx.storage.getAlarm();
      if (alarmAt == null) {
        const schedule = planDirectorWake({
          now: Date.now(), triggerKind: 'state_recovery', editorialNext: null,
          continuationPending: this.state.continuationPending, continuationDelayMs: 1_000,
          existingSelfWakeAt: this.state.selfWakeAt,
          existingLivenessWakeAt: this.state.livenessWakeAt,
        });
        this.state = { ...this.state, ...schedule };
        await ctx.storage.setAlarm(schedule.nextLookAt);
      }
      await ctx.storage.put(STATE_KEY, this.state);
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
      const schedule = planDirectorWake({
        now: Date.now(), triggerKind: normalizedTrigger.kind,
        editorialNext: payload?.nextLookAt,
        continuationPending, continuationDelayMs: payload?.continuationDelayMs,
        existingSelfWakeAt: this.state.selfWakeAt,
        existingLivenessWakeAt: this.state.livenessWakeAt,
      });
      this.state = {
        ...this.state, lastFinishedAt: Date.now(), lastStatus: payload?.ok ? 'ok' : 'partial',
        lastRunId: payload?.runId ?? null,
        nextLookAt: schedule.nextLookAt,
        lastError: payload?.error ?? payload?.replies?.errors?.[0] ?? null,
        continuationPending, selfWakeAt: schedule.selfWakeAt,
        livenessWakeAt: schedule.livenessWakeAt, lastTriggerKind: normalizedTrigger.kind,
      };
      await this.ctx.storage.deleteAlarm();
      await this.ctx.storage.setAlarm(this.state.nextLookAt);
      await this.persist();
      return payload;
    } catch (error) {
      const message = String(error?.message ?? error).slice(0, 240);
      // 실행 장애는 별이의 편집 선택이 아니다. 유실 방지용 기술 재시도만 10분 뒤 한 번 예약한다.
      const retryAt = Date.now() + 10 * 60_000;
      this.state = {
        ...this.state, lastFinishedAt: Date.now(), lastStatus: 'failed',
        nextLookAt: retryAt, lastError: message, continuationPending: true,
        lastTriggerKind: normalizedTrigger.kind,
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
    const kind = alarmTriggerKind(this.state);
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
  async scheduled(event, env, ctx) {
    ctx.waitUntil(runScheduledMedia(env, event.scheduledTime ?? Date.now()));
  },
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === 'GET' && url.pathname === '/health') {
      return json({
        ok: true, service: NAME, mode: 'byeoli_chosen_wake_plus_scheduled_media',
        scheduledMediaKst: SLOT_HOURS_KST,
        livenessGuardHours: LIVENESS_GUARD_MS / 3_600_000,
      });
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
