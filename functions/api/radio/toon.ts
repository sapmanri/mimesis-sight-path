// 별이 웹툰 읽기 창구 (Vase 08-12 밤: "별이 웹툰 스레드는 보라고 해야할듯")
// POST /api/radio/toon (X-Pulse-Key): @byeol.toon 공개 스레드를 펼쳐 읽어 최근 편을 KV에.
//   신선하면(3시간) 안 읽는다. 시도 쿨다운 30분 — 실패 반복이 매 틱 도구 호출로 새지 않게.
// GET  /api/radio/toon (공개): 마지막으로 읽은 편들 + 영수증 — 점검용 (원문이 공개 계정이라 공개 무해).

import { runToonRead, TOON_KEY, TOON_FRESH_MS, type ToonPost } from '../_radio-toon.ts';

interface Env { PLANET: KVNamespace; PULSE_KEY?: string; ANTHROPIC_API_KEY?: string }

const RECEIPT_KEY = 'radio:toon:receipt';
const ATTEMPT_KEY = 'radio:toon:attempt';
const ATTEMPT_COOLDOWN_MS = 30 * 60_000;

const JSON_HEADERS = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' };
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });

export const onRequestGet: PagesFunction<Env> = async ({ env }) => {
  const [raw, receiptRaw] = await Promise.all([
    env.PLANET.get(TOON_KEY), env.PLANET.get(RECEIPT_KEY),
  ]);
  const shelf = raw ? JSON.parse(raw) as { at: number; posts: ToonPost[] } : null;
  return json(200, { ok: true, shelf, lastRead: receiptRaw ? JSON.parse(receiptRaw) : null });
};

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  if (!env.PULSE_KEY) return json(500, { ok: false, error: 'PULSE_KEY not configured' });
  if (request.headers.get('X-Pulse-Key') !== env.PULSE_KEY) return json(403, { ok: false, error: 'forbidden' });

  const now = Date.now();
  const [raw, attemptRaw] = await Promise.all([
    env.PLANET.get(TOON_KEY), env.PLANET.get(ATTEMPT_KEY),
  ]);
  const shelf = raw ? JSON.parse(raw) as { at: number; posts: ToonPost[] } : null;
  if (shelf && now - shelf.at < TOON_FRESH_MS) {
    return json(200, { ok: true, skipped: 'fresh', count: shelf.posts.length });
  }
  const lastAttempt = attemptRaw ? Number(attemptRaw) : 0;
  if (now - lastAttempt < ATTEMPT_COOLDOWN_MS) {
    return json(200, { ok: true, skipped: 'cooldown', count: shelf?.posts.length ?? 0 });
  }
  await env.PLANET.put(ATTEMPT_KEY, String(now));

  const receipt = await runToonRead(env);
  const record = { at: now, ...receipt };
  const writes: Promise<void>[] = [env.PLANET.put(RECEIPT_KEY, JSON.stringify(record))];
  if (receipt.posts.length) {
    writes.push(env.PLANET.put(TOON_KEY, JSON.stringify({ at: now, posts: receipt.posts })));
  }
  await Promise.all(writes);
  return json(receipt.error && !receipt.posts.length ? 502 : 200,
    { ok: !receipt.error || receipt.posts.length > 0, ...record });
};
