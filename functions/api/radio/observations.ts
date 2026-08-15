// 로컬 Crawl4AI 공개 페이지 관측 적재 창구.
// POST는 수집 결과만 저장한다. 외부 사이트에 쓰는 경로는 존재하지 않는다.

import {
  decodeWebObservationReceipts, decodeWebObservationShelf,
  mergeWebObservation, mergeWebObservationReceipt, receiptForWebObservation,
  validateWebObservation, validateWebObservationFailureReceipt,
  WEB_OBSERVATIONS_KEY, WEB_OBSERVATIONS_RECEIPT_KEY, WEB_OBSERVATIONS_RECEIPTS_KEY,
} from '../_radio-observations.ts';
import { deferSocialWake, type SocialWakeEnv } from '../_byeoli-social-wake.ts';

interface Env extends SocialWakeEnv { PULSE_KEY?: string }

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

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
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

    /* 2026-08-15: 설정에서 뺀 소스를 서가에서도 뺀다.
       서가는 병합(mergeWebObservation)이라 소스를 갈아끼워도 옛것이 남는다 —
       실사고: 도서 소스를 국립중앙도서관 → 알라딘으로 바꿨더니 국중도의 검색 UI 안내문
       10건이 서가에 남아 별이 대본 재료로 계속 들어갔다.
       크롤러가 보내주는 activeIds(지금 설정에 있는 소스 전체)가 있을 때만 정리한다 —
       안 보내면 예전처럼 병합만 하므로 옛 크롤러와도 함께 돈다. */
    const rawActive = (body as { activeIds?: unknown } | null)?.activeIds;
    const activeIds = Array.isArray(rawActive)
      ? rawActive.filter((v): v is string => typeof v === 'string')
      : null;
    if (hasSuccess && activeIds && activeIds.length) {
      // 소관 밖(감각 수집기가 채운 소스)은 건드리지 않는다 — 단일 경로 주석 참조
      const keep = new Set(activeIds);
      const CRAWLER_KINDS = new Set(['threads_profile', 'youtube_channel', 'web_page']);
      shelf = {
        ...shelf,
        sources: shelf.sources.filter((s) => !CRAWLER_KINDS.has(s.kind) || keep.has(s.id)),
      };
      receipts = {
        ...receipts,
        receipts: receipts.receipts.filter((r) => !CRAWLER_KINDS.has(r.kind) || keep.has(r.sourceId)),
      };
    }

    const writes = [
      env.PLANET.put(WEB_OBSERVATIONS_RECEIPTS_KEY, JSON.stringify(receipts)),
      env.PLANET.put(WEB_OBSERVATIONS_RECEIPT_KEY, JSON.stringify(lastReceipt)),
    ];
    if (hasSuccess) writes.push(env.PLANET.put(WEB_OBSERVATIONS_KEY, JSON.stringify(shelf)));
    await Promise.all(writes);
    if (hasSuccess) {
      const successIds = checkedBatch.filter((entry) => entry.type === 'success')
        .map((entry) => entry.type === 'success' ? `${entry.source.source.id}:${entry.source.source.fetchedAt}` : '')
        .filter(Boolean).join(':');
      deferSocialWake(context, env, {
        kind: 'observation_arrived',
        eventId: `observation-batch:${successIds}`.slice(0, 180),
        occurredAt: now,
        refId: successIds.slice(0, 120),
      }, 'observation batch');
    }
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
  let merged = mergeWebObservation(shelf, checked.source, now);
  const receipt = receiptForWebObservation(checked.source, now);
  let mergedReceipts = mergeWebObservationReceipt(receipts, receipt, now);
  /* 설정에서 뺀 소스를 서가에서도 뺀다 — batch 경로와 같은 규칙.
     ⚠ 크롤러는 소스마다 **개별 POST**를 하므로 이 단일 경로가 실제로 도는 자리다.
     08-15에 batch 쪽에만 넣었다가 안 걸려서 국립중앙도서관 잔재가 계속 남았다. */
  const rawActiveOne = (body as { activeIds?: unknown } | null)?.activeIds;
  const activeOne = Array.isArray(rawActiveOne)
    ? rawActiveOne.filter((v): v is string => typeof v === 'string')
    : null;
  /* 🔴 소관 밖은 건드리지 않는다 (08-15 실사고).
     서가는 **두 수집기가 함께 쓴다** — crawl_observations.py(웹·유튜브·스레드)와
     sensory_observations.py(하늘·사진·미술관·문헌). 크롤러가 보내는 activeIds에는
     제 것만 들어 있는데, 그것만 남기고 지웠더니 **감각 소스 넷이 통째로 날아갔다**
     (하늘·우리 사진·시카고·위키문헌 → 서가 8개가 3개로). 즉시 복구했지만
     같은 실수를 코드가 막아야 한다.
     그래서 **크롤러가 만드는 kind에 한해서만** 정리한다. */
  if (activeOne && activeOne.length) {
    const keep = new Set(activeOne);
    const CRAWLER_KINDS = new Set(['threads_profile', 'youtube_channel', 'web_page']);
    const inScope = (kind: string) => CRAWLER_KINDS.has(kind);
    merged = {
      ...merged,
      sources: merged.sources.filter((s) => !inScope(s.kind) || keep.has(s.id)),
    };
    mergedReceipts = {
      ...mergedReceipts,
      receipts: mergedReceipts.receipts.filter((r) => !inScope(r.kind) || keep.has(r.sourceId)),
    };
  }
  await Promise.all([
    env.PLANET.put(WEB_OBSERVATIONS_KEY, JSON.stringify(merged)),
    env.PLANET.put(WEB_OBSERVATIONS_RECEIPTS_KEY, JSON.stringify(mergedReceipts)),
    env.PLANET.put(WEB_OBSERVATIONS_RECEIPT_KEY, JSON.stringify(receipt)),
  ]);
  deferSocialWake(context, env, {
    kind: 'observation_arrived',
    eventId: `observation:${checked.source.id}:${checked.source.fetchedAt}`,
    occurredAt: now,
    refId: checked.source.id,
  }, 'observation');
  return json(200, receipt);
};
