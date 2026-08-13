// 로컬 Crawl4AI 공개 페이지 관측 적재 창구.
// POST는 수집 결과만 저장한다. 외부 사이트에 쓰는 경로는 존재하지 않는다.

import {
  decodeWebObservationShelf, mergeWebObservation, validateWebObservation,
  WEB_OBSERVATIONS_KEY, WEB_OBSERVATIONS_RECEIPT_KEY,
} from '../_radio-observations.ts';

interface Env { PLANET: KVNamespace; PULSE_KEY?: string }

const JSON_HEADERS = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' };
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });

export const onRequestGet: PagesFunction<Env> = async ({ env }) => {
  const [shelfRaw, receiptRaw] = await Promise.all([
    env.PLANET.get(WEB_OBSERVATIONS_KEY), env.PLANET.get(WEB_OBSERVATIONS_RECEIPT_KEY),
  ]);
  let shelf = decodeWebObservationShelf(null);
  let lastRead: unknown = null;
  try { shelf = shelfRaw ? decodeWebObservationShelf(JSON.parse(shelfRaw)) : shelf; } catch { /* 상태로 드러낸다 */ }
  try { lastRead = receiptRaw ? JSON.parse(receiptRaw) : null; } catch { /* 상태로 드러낸다 */ }
  return json(200, { ok: true, ownership: 'read_only', shelf, lastRead });
};

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  if (!env.PULSE_KEY) return json(500, { ok: false, error: 'PULSE_KEY not configured' });
  if (request.headers.get('X-Pulse-Key') !== env.PULSE_KEY) return json(403, { ok: false, error: 'forbidden' });

  const now = Date.now();
  let body: unknown;
  try { body = await request.json(); } catch { body = null; }
  const checked = validateWebObservation(body, now);
  if (!checked.ok) {
    const receipt = { at: now, ok: false, source: 'crawl4ai', ownership: 'read_only', error: checked.error };
    await env.PLANET.put(WEB_OBSERVATIONS_RECEIPT_KEY, JSON.stringify(receipt));
    return json(400, receipt);
  }

  const raw = await env.PLANET.get(WEB_OBSERVATIONS_KEY);
  let shelf = decodeWebObservationShelf(null);
  try { shelf = raw ? decodeWebObservationShelf(JSON.parse(raw)) : shelf; } catch { /* 새 성공본으로 회복 */ }
  const merged = mergeWebObservation(shelf, checked.source, now);
  const receipt = {
    at: now, ok: true, source: 'crawl4ai', ownership: 'read_only', sourceId: checked.source.id,
    sourceUrl: checked.source.sourceUrl, fetchedAt: checked.source.fetchedAt,
    count: checked.source.items.length, error: null,
  };
  await Promise.all([
    env.PLANET.put(WEB_OBSERVATIONS_KEY, JSON.stringify(merged)),
    env.PLANET.put(WEB_OBSERVATIONS_RECEIPT_KEY, JSON.stringify(receipt)),
  ]);
  return json(200, receipt);
};
