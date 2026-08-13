// 로컬 Crawl4AI 공개 페이지 관측 적재 창구.
// POST는 수집 결과만 저장한다. 외부 사이트에 쓰는 경로는 존재하지 않는다.

import {
  decodeWebObservationReceipts, decodeWebObservationShelf,
  mergeWebObservation, mergeWebObservationReceipt, receiptForWebObservation,
  validateWebObservation, validateWebObservationFailureReceipt,
  WEB_OBSERVATIONS_KEY, WEB_OBSERVATIONS_RECEIPT_KEY, WEB_OBSERVATIONS_RECEIPTS_KEY,
} from '../_radio-observations.ts';

interface Env { PLANET: KVNamespace; PULSE_KEY?: string }

const JSON_HEADERS = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' };
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });

export const onRequestGet: PagesFunction<Env> = async ({ env }) => {
  const [shelfRaw, receiptRaw, receiptsRaw] = await Promise.all([
    env.PLANET.get(WEB_OBSERVATIONS_KEY),
    env.PLANET.get(WEB_OBSERVATIONS_RECEIPT_KEY),
    env.PLANET.get(WEB_OBSERVATIONS_RECEIPTS_KEY),
  ]);
  let shelf = decodeWebObservationShelf(null);
  let receipts = decodeWebObservationReceipts(null);
  let lastRead: unknown = null;
  try { shelf = shelfRaw ? decodeWebObservationShelf(JSON.parse(shelfRaw)) : shelf; } catch { /* 상태로 드러낸다 */ }
  try { receipts = receiptsRaw ? decodeWebObservationReceipts(JSON.parse(receiptsRaw)) : receipts; } catch { /* 상태로 드러낸다 */ }
  try { lastRead = receiptRaw ? JSON.parse(receiptRaw) : null; } catch { /* 상태로 드러낸다 */ }
  return json(200, { ok: true, ownership: 'read_only', shelf, receipts, lastRead });
};

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  if (!env.PULSE_KEY) return json(500, { ok: false, error: 'PULSE_KEY not configured' });
  if (request.headers.get('X-Pulse-Key') !== env.PULSE_KEY) return json(403, { ok: false, error: 'forbidden' });

  const now = Date.now();
  let body: unknown;
  try { body = await request.json(); } catch { body = null; }

  const batch = (body as { batch?: unknown } | null)?.batch;
  if (Array.isArray(batch)) {
    if (batch.length < 1 || batch.length > 8) return json(400, { ok: false, error: 'batch_size_invalid' });
    const checkedBatch: Array<
      | { type: 'success'; source: ReturnType<typeof validateWebObservation> & { ok: true } }
      | { type: 'failure'; failure: ReturnType<typeof validateWebObservationFailureReceipt> & { ok: true } }
    > = [];
    for (let index = 0; index < batch.length; index++) {
      const value = batch[index];
      if ((value as { receiptOnly?: unknown } | null)?.receiptOnly === true) {
        const failure = validateWebObservationFailureReceipt(value, now);
        if (!failure.ok) return json(400, { ok: false, error: failure.error, index });
        checkedBatch.push({ type: 'failure', failure });
      } else {
        const source = validateWebObservation(value, now);
        if (!source.ok) return json(400, { ok: false, error: source.error, index });
        checkedBatch.push({ type: 'success', source });
      }
    }

    const [shelfRaw, receiptsRaw] = await Promise.all([
      env.PLANET.get(WEB_OBSERVATIONS_KEY), env.PLANET.get(WEB_OBSERVATIONS_RECEIPTS_KEY),
    ]);
    let shelf = decodeWebObservationShelf(null);
    let receipts = decodeWebObservationReceipts(null);
    try { shelf = shelfRaw ? decodeWebObservationShelf(JSON.parse(shelfRaw)) : shelf; } catch { /* 배치 성공본으로 회복 */ }
    try { receipts = receiptsRaw ? decodeWebObservationReceipts(JSON.parse(receiptsRaw)) : receipts; } catch { /* 배치 영수증으로 회복 */ }

    const results: unknown[] = [];
    let lastReceipt: unknown = null;
    let hasSuccess = false;
    for (const entry of checkedBatch) {
      if (entry.type === 'success') {
        shelf = mergeWebObservation(shelf, entry.source.source, now);
        const receipt = receiptForWebObservation(entry.source.source, now);
        receipts = mergeWebObservationReceipt(receipts, receipt, now);
        lastReceipt = receipt;
        hasSuccess = true;
        results.push({ sourceId: receipt.sourceId, ok: true, count: receipt.count });
      } else {
        receipts = mergeWebObservationReceipt(receipts, entry.failure.receipt, now);
        lastReceipt = entry.failure.receipt;
        results.push({ sourceId: entry.failure.receipt.sourceId, ok: false, error: entry.failure.receipt.error });
      }
    }

    const writes = [
      env.PLANET.put(WEB_OBSERVATIONS_RECEIPTS_KEY, JSON.stringify(receipts)),
      env.PLANET.put(WEB_OBSERVATIONS_RECEIPT_KEY, JSON.stringify(lastReceipt)),
    ];
    if (hasSuccess) writes.push(env.PLANET.put(WEB_OBSERVATIONS_KEY, JSON.stringify(shelf)));
    await Promise.all(writes);
    return json(200, { ok: true, batch: true, results });
  }

  if ((body as { receiptOnly?: unknown } | null)?.receiptOnly === true) {
    const checkedFailure = validateWebObservationFailureReceipt(body, now);
    if (!checkedFailure.ok) return json(400, { ok: false, error: checkedFailure.error });
    const raw = await env.PLANET.get(WEB_OBSERVATIONS_RECEIPTS_KEY);
    let receipts = decodeWebObservationReceipts(null);
    try { receipts = raw ? decodeWebObservationReceipts(JSON.parse(raw)) : receipts; } catch { /* 실패 영수증으로 회복 */ }
    const merged = mergeWebObservationReceipt(receipts, checkedFailure.receipt, now);
    await Promise.all([
      env.PLANET.put(WEB_OBSERVATIONS_RECEIPTS_KEY, JSON.stringify(merged)),
      env.PLANET.put(WEB_OBSERVATIONS_RECEIPT_KEY, JSON.stringify(checkedFailure.receipt)),
    ]);
    return json(200, { ok: true, recorded: true, receipt: checkedFailure.receipt });
  }

  const checked = validateWebObservation(body, now);
  if (!checked.ok) {
    const receipt = { at: now, ok: false, source: 'observation_ingest', ownership: 'read_only', error: checked.error };
    await env.PLANET.put(WEB_OBSERVATIONS_RECEIPT_KEY, JSON.stringify(receipt));
    return json(400, receipt);
  }

  const [raw, receiptsRaw] = await Promise.all([
    env.PLANET.get(WEB_OBSERVATIONS_KEY), env.PLANET.get(WEB_OBSERVATIONS_RECEIPTS_KEY),
  ]);
  let shelf = decodeWebObservationShelf(null);
  let receipts = decodeWebObservationReceipts(null);
  try { shelf = raw ? decodeWebObservationShelf(JSON.parse(raw)) : shelf; } catch { /* 새 성공본으로 회복 */ }
  try { receipts = receiptsRaw ? decodeWebObservationReceipts(JSON.parse(receiptsRaw)) : receipts; } catch { /* 새 성공본으로 회복 */ }
  const merged = mergeWebObservation(shelf, checked.source, now);
  const receipt = receiptForWebObservation(checked.source, now);
  const mergedReceipts = mergeWebObservationReceipt(receipts, receipt, now);
  await Promise.all([
    env.PLANET.put(WEB_OBSERVATIONS_KEY, JSON.stringify(merged)),
    env.PLANET.put(WEB_OBSERVATIONS_RECEIPTS_KEY, JSON.stringify(mergedReceipts)),
    env.PLANET.put(WEB_OBSERVATIONS_RECEIPT_KEY, JSON.stringify(receipt)),
  ]);
  return json(200, receipt);
};
