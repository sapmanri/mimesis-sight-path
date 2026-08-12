// 별이 서재 산책 창구 (책 분야 개방 — Vase 08-12 밤)
// POST /api/radio/library (X-Pulse-Key): 산책 한 번 — 웹에서 책 하나를 찾아 읽고 서가(KV)에 얹는다.
//   서가가 신선하면(3시간 안 산책) 걷지 않고 그대로 돌아온다 — 조립기가 매 틱 불러도 안전.
//   편성 틱(/next)과 분리한 이유: 산책은 검색·읽기로 1~2분 걸린다 — 틱 안에 넣으면
//   조립기 타임아웃(120s)을 위협하고, 산책 실패가 방송 실패로 번진다. 서가는 비동기로 쌓인다.
// GET  /api/radio/library (공개): 서가 목록 — 점검·아카이브용.
//
// 방송 연결은 next.ts가 한다: 서가의 최근 발견을 상황에 실어 주고, 꺼낼지는 별이가 정한다.

import { runLibraryWalk, LIBRARY_SHELF_KEY, LIBRARY_SHELF_KEEP, LIBRARY_FRESH_MS, type LibraryFind } from '../_radio-library.ts';
import { RADIO_DRAFT_KEY } from '../_radio.ts';
import { timeLabelOf } from './draft.ts';

interface Env { PLANET: KVNamespace; PULSE_KEY?: string; ANTHROPIC_API_KEY?: string }

const JSON_HEADERS = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' };
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });

export const onRequestGet: PagesFunction<Env> = async ({ env }) => {
  const raw = await env.PLANET.get(LIBRARY_SHELF_KEY);
  const shelf: LibraryFind[] = raw ? JSON.parse(raw) : [];
  return json(200, { ok: true, count: shelf.length, shelf });
};

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  if (!env.PULSE_KEY) return json(500, { ok: false, error: 'PULSE_KEY not configured' });
  if (request.headers.get('X-Pulse-Key') !== env.PULSE_KEY) return json(403, { ok: false, error: 'forbidden' });

  const now = Date.now();
  const shelfRaw = await env.PLANET.get(LIBRARY_SHELF_KEY);
  const shelf: LibraryFind[] = shelfRaw ? JSON.parse(shelfRaw) : [];
  const latest = shelf[0]?.at ?? 0;
  if (now - latest < LIBRARY_FRESH_MS) {
    return json(200, { ok: true, skipped: 'fresh', count: shelf.length });
  }

  // 상황 재료 — 편성 틱과 같은 원천(오늘 피드 관찰 + 최근 방송)
  const [feedRaw, indexRaw] = await Promise.all([env.PLANET.get('feed'), env.PLANET.get('radio:drafts')]);
  const feed: { icon?: string; t?: number; text?: string }[] = feedRaw ? JSON.parse(feedRaw) : [];
  const todayKst = new Date(now + 9 * 3_600_000).toISOString().slice(0, 10);
  const todayLines = feed
    .filter((p) => p.icon === '🌏' && p.text
      && new Date((p.t ?? 0) + 9 * 3_600_000).toISOString().slice(0, 10) === todayKst)
    .map((p) => String(p.text))
    .slice(0, 3);
  const draftIds: string[] = indexRaw ? JSON.parse(indexRaw) : [];
  const recentScripts: string[] = [];
  for (const did of draftIds.slice(0, 2)) {
    const dRaw = await env.PLANET.get(RADIO_DRAFT_KEY(did));
    if (dRaw) { const d = JSON.parse(dRaw) as { script?: string }; if (d.script) recentScripts.push(d.script); }
  }
  const hour = Number(new Date(now + 9 * 3_600_000).toISOString().slice(11, 13));

  const receipt = await runLibraryWalk(env, {
    timeLabel: timeLabelOf(hour), todayLines, recentScripts,
    shelfTitles: shelf.map((f) => f.title),
  }, now);

  if (receipt.find) {
    const next = [receipt.find, ...shelf].slice(0, LIBRARY_SHELF_KEEP);
    await env.PLANET.put(LIBRARY_SHELF_KEY, JSON.stringify(next));
  }
  // 영수증 그대로 — 빈손(find null·error null)도, 실패도 숨기지 않는다 (규칙 5)
  return json(receipt.error && !receipt.find ? 502 : 200, {
    ok: !receipt.error || !!receipt.find,
    find: receipt.find,
    queriesRun: receipt.queriesRun, read: receipt.read,
    toolErrors: receipt.toolErrors, error: receipt.error,
  });
};
