// PULSE 기록 — POST /api/pulse (공개 호스트 · X-Pulse-Key)
//
// autopost와 같은 보호 방식. 쓰기만 있다 — 읽기는 Access 뒤 /api/ops/pulse가
// KV를 직접 읽는다 (일기 내용을 공개 GET으로 흘리지 않는다).

import { validatePulse, PULSE_LOG_KEY, PULSE_KEEP, type PulseEntry } from './_pulse.ts';
import { withTransientRetry } from './_retry.ts';

interface Env { PLANET: KVNamespace; PULSE_KEY?: string }

const JSON_HEADERS = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' };
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  if (!env.PULSE_KEY) return json(500, { ok: false, error: 'PULSE_KEY not configured' });
  if (request.headers.get('X-Pulse-Key') !== env.PULSE_KEY) return json(403, { ok: false, error: 'forbidden' });

  let body: Partial<PulseEntry>;
  try { body = (await request.json()) as Partial<PulseEntry>; } catch { return json(400, { ok: false, error: 'bad_json' }); }
  const errs = validatePulse(body);
  if (errs.length) return json(400, { ok: false, error: 'pulse_invalid', detail: errs });

  const entry: PulseEntry = {
    at: Date.now(),                      // 벽시계는 서버가 찍는다 — 시각은 추측하지 않는다
    being: body.being!,
    amplitude: body.amplitude!,
    kind: body.kind ? String(body.kind).slice(0, 24) : undefined,
    note: body.note ? String(body.note).slice(0, 120) : undefined,
    source: body.source?.doc ? { doc: String(body.source.doc).slice(0, 80), line: Number.isInteger(body.source.line) ? body.source.line : undefined } : undefined,
    trace: body.trace?.traceId ? {
      traceId: String(body.trace.traceId).slice(0, 40),
      readerModel: body.trace.readerModel ? String(body.trace.readerModel).slice(0, 60) : undefined,
      sessionContext: body.trace.sessionContext === 'companion' ? 'companion'
        : body.trace.sessionContext === 'fresh' ? 'fresh' : undefined,
    } : undefined,
    selfReport: true,                    // 계약 — 클라이언트가 뭐라 보내든 자기 보고다
  };
  const raw = await withTransientRetry('pulse_get', () => env.PLANET.get(PULSE_LOG_KEY));
  const log: PulseEntry[] = raw ? JSON.parse(raw) : [];
  await withTransientRetry('pulse_put', () =>
    env.PLANET.put(PULSE_LOG_KEY, JSON.stringify([entry, ...log].slice(0, PULSE_KEEP))));
  return json(200, { ok: true, at: entry.at, being: entry.being, amplitude: entry.amplitude });
};
