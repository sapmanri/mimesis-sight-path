// @byeol.toon 공개 관측 창구.
// GET  — 마지막으로 Crawl4AI가 읽은 공개 게시물과 수집 영수증.
// POST — 로컬 Crawl4AI 결과를 X-Pulse-Key로 적재. 서버 자체 web_fetch는 쓰지 않는다.
//
// 이 계정은 별이 소유가 아니다. 이 API에는 발행·댓글·답글 기능이 없다.

import {
  decodeToonShelf, TOON_KEY, TOON_RECEIPT_KEY, TOON_URL, validateToonCrawl,
  type ToonShelf,
} from '../_radio-toon.ts';

interface Env { PLANET: KVNamespace; PULSE_KEY?: string }

const JSON_HEADERS = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' };
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });

export const onRequestGet: PagesFunction<Env> = async ({ env }) => {
  const [shelfRaw, receiptRaw] = await Promise.all([
    env.PLANET.get(TOON_KEY), env.PLANET.get(TOON_RECEIPT_KEY),
  ]);
  let shelf: ToonShelf | null = null;
  let lastRead: unknown = null;
  try { shelf = shelfRaw ? decodeToonShelf(JSON.parse(shelfRaw)) : null; } catch { /* 상태로 드러낸다 */ }
  try { lastRead = receiptRaw ? JSON.parse(receiptRaw) : null; } catch { /* 상태로 드러낸다 */ }
  return json(200, {
    ok: true,
    ownership: 'external_read_only',
    sourceUrl: TOON_URL,
    shelf,
    lastRead,
  });
};

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  if (!env.PULSE_KEY) return json(500, { ok: false, error: 'PULSE_KEY not configured' });
  if (request.headers.get('X-Pulse-Key') !== env.PULSE_KEY) return json(403, { ok: false, error: 'forbidden' });

  const now = Date.now();
  let body: unknown;
  try { body = await request.json(); } catch { body = null; }
  const checked = validateToonCrawl(body, now);
  if (!checked.ok) {
    const receipt = {
      at: now, ok: false, source: 'crawl4ai', ownership: 'external_read_only',
      sourceUrl: TOON_URL, count: 0, error: checked.error,
    };
    await env.PLANET.put(TOON_RECEIPT_KEY, JSON.stringify(receipt));
    return json(400, receipt);
  }

  const currentRaw = await env.PLANET.get(TOON_KEY);
  let current: ToonShelf | null = null;
  try { current = currentRaw ? decodeToonShelf(JSON.parse(currentRaw)) : null; } catch { /* 새 성공본으로 회복 */ }
  if (current && current.sourceAt >= checked.payload.fetchedAt) {
    const receipt = {
      at: now, ok: true, skipped: 'not_newer', source: 'crawl4ai', ownership: 'external_read_only',
      sourceUrl: TOON_URL, fetchedAt: current.sourceAt, count: current.posts.length, error: null,
    };
    await env.PLANET.put(TOON_RECEIPT_KEY, JSON.stringify(receipt));
    return json(200, receipt);
  }

  const shelf: ToonShelf = {
    at: now,
    sourceAt: checked.payload.fetchedAt,
    sourceUrl: TOON_URL,
    source: 'crawl4ai',
    ownership: 'external_read_only',
    posts: checked.payload.posts,
  };
  const receipt = {
    at: now, ok: true, source: 'crawl4ai', ownership: 'external_read_only',
    sourceUrl: TOON_URL, fetchedAt: shelf.sourceAt, count: shelf.posts.length, error: null,
  };
  await Promise.all([
    env.PLANET.put(TOON_KEY, JSON.stringify(shelf)),
    env.PLANET.put(TOON_RECEIPT_KEY, JSON.stringify(receipt)),
  ]);
  return json(200, receipt);
};
