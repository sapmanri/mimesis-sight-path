// PULSE 대필 — POST /api/ops/pulse-relay (Ops 호스트 전용 · Access 뒤)
//
// HTTP를 못 쏘는 존재(홈즈·제미나이)의 자기 보고를 사람이 옮겨 적는 문.
// Access가 보호하므로 별도 키 없음. 서버가 relay:true를 강제로 찍는다 —
// 대필은 숨기지 않는다. 대필 규칙: 본인이 말한 값·문장 그대로. 각색은 위조다.

import { validatePulse, PULSE_LOG_KEY, PULSE_KEEP, type PulseEntry } from '../_pulse.ts';
import { withTransientRetry } from '../_retry.ts';

interface Env { PLANET: KVNamespace }

const JSON_HEADERS = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' };
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });

/** 오기 삭제 — 일기의 지우개. 잘못 기록된 항목(at 기준)만 지운다. */
export const onRequestDelete: PagesFunction<Env> = async ({ request, env }) => {
  const atRaw = new URL(request.url).searchParams.get('at');
  const at = Number(atRaw);
  if (!atRaw || !Number.isFinite(at)) return json(400, { ok: false, error: 'at_required' });
  const raw = await withTransientRetry('pulse_del_get', () => env.PLANET.get(PULSE_LOG_KEY));
  const log: PulseEntry[] = raw ? JSON.parse(raw) : [];
  const next = log.filter((e) => e.at !== at);
  if (next.length === log.length) return json(404, { ok: false, error: 'not_found' });
  await withTransientRetry('pulse_del_put', () => env.PLANET.put(PULSE_LOG_KEY, JSON.stringify(next)));
  return json(200, { ok: true, removed: log.length - next.length });
};

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  let body: { being?: string; entries?: Partial<PulseEntry>[] };
  try { body = (await request.json()) as typeof body; } catch { return json(400, { ok: false, error: 'bad_json' }); }
  const list = Array.isArray(body.entries) ? body.entries.slice(0, 20) : [];
  if (!list.length) return json(400, { ok: false, error: 'entries_required (최대 20)' });

  const now = Date.now();
  const made: PulseEntry[] = [];
  const errors: string[] = [];
  list.forEach((e, i) => {
    const candidate = { ...e, being: e.being ?? body.being };
    const errs = validatePulse(candidate);
    if (errs.length) { errors.push(`#${i}: ${errs.join(' · ')}`); return; }
    made.push({
      at: now + i,   // 순서 보존 — 벽시계는 서버가 찍는다
      being: candidate.being!,
      amplitude: candidate.amplitude!,
      kind: candidate.kind ? String(candidate.kind).slice(0, 24) : undefined,
      note: candidate.note ? String(candidate.note).slice(0, 120) : undefined,
      source: candidate.source?.doc
        ? { doc: String(candidate.source.doc).slice(0, 80), line: Number.isInteger(candidate.source.line) ? candidate.source.line : undefined }
        : undefined,
      relay: true,
      selfReport: true,
    });
  });
  if (!made.length) return json(400, { ok: false, error: 'all_invalid', detail: errors });

  const raw = await withTransientRetry('pulse_relay_get', () => env.PLANET.get(PULSE_LOG_KEY));
  const log: PulseEntry[] = raw ? JSON.parse(raw) : [];
  await withTransientRetry('pulse_relay_put', () =>
    env.PLANET.put(PULSE_LOG_KEY, JSON.stringify([...made.reverse(), ...log].slice(0, PULSE_KEEP))));
  return json(200, { ok: true, recorded: made.length, skipped: errors });
};
