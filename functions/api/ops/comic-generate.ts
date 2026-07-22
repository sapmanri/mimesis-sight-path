// BUILD 434-COMIC — POST /api/ops/comic-generate (Ops 호스트 전용 · Access 뒤)
//
// 승인된 시나리오의 컷을 그린다. 클라이언트가 컷 단위로 부른다(panels:[i]) —
// 진행이 눈에 보이고, 실패·재생성이 컷 단위가 된다("3컷만 다시"가 공짜).
//
// comicId는 시나리오에서 결정론으로 파생 — 같은 시나리오의 컷별 호출이 같은 자리에 모인다.
// 재생성은 같은 키 덮어쓰기 = 최신본이 그 컷의 현재다.
//
// ⛔ 자동 게시·크론 연결 없음. 산출물은 comic/strips/ 에만.

import { validateScenario, buildPanelPrompt, buildPagePrompt, pickStyleRefs, STYLE_LOCK_NAMES, type ComicScenario } from '../_comic.ts';
import { generatePanelImage, generatePageImage, refCapFor, type ComicImageEnv, type RefBytes } from '../_comic-image.ts';
import { COMIC_LOCK_PREFIX } from './comic-style-lock.ts';

interface Env extends ComicImageEnv {
  PLANET: KVNamespace;
  CAPTURES: R2Bucket;
}

export const COMIC_STRIP_PREFIX = 'comic/strips/';
const META_KEY = 'comic_meta';
const META_KEEP = 12;
const JSON_HEADERS = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' };
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });

/** 시나리오 → 결정론 id. 같은 시나리오의 컷들이 같은 폴더에 모인다. */
export function comicIdOf(s: ComicScenario): string {
  const src = `${s.title}|${s.theme}|${s.panelCount}`;
  let h = 0x811c9dc5;
  for (let i = 0; i < src.length; i++) { h ^= src.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return (h >>> 0).toString(16).padStart(8, '0');
}

export const panelKey = (comicId: string, index: number) => `${COMIC_STRIP_PREFIX}${comicId}/p${index}.png`;

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  let body: { scenario?: ComicScenario; panels?: number[] };
  try { body = (await request.json()) as typeof body; } catch { return json(400, { ok: false, error: 'bad_json' }); }
  const scenario = body.scenario;
  const errs = scenario ? validateScenario(scenario) : ['scenario required'];
  if (errs.length) return json(400, { ok: false, error: 'scenario_invalid', detail: errs });
  const s = scenario as ComicScenario;
  const provider = (env.COMIC_IMAGE_PROVIDER || 'gemini').toLowerCase();
  const cap = refCapFor(provider);
  const comicId = comicIdOf(s);
  // 제미나이 = 원샷 페이지 (실증: 한 캔버스가 일관성을 이긴다 + 한글 텍스트 가능).
  // gpt/flux = 컷별 모드 (한글은 폰트로 얹는 기존 구조).
  const mode = provider === 'gemini' ? 'page' : 'panels';

  const want = Array.isArray(body.panels) && body.panels.length
    ? body.panels.filter((n) => Number.isInteger(n) && n >= 1 && n <= s.panelCount)
    : s.panels.map((p) => p.index);
  if (mode === 'panels') {
    if (!want.length) return json(400, { ok: false, error: 'no_valid_panels' });
    if (want.length > 2) return json(400, { ok: false, error: 'max_2_per_call: 컷 단위로 나눠 부른다 (진행 표시·부분 재시도)' });
  }

  // Style Lock 로드 — 실제로 읽는다. 키만 믿지 않는다.
  const lockCache = new Map<string, RefBytes>();
  async function loadRef(slot: string): Promise<RefBytes | null> {
    if (lockCache.has(slot)) return lockCache.get(slot)!;
    const listed = await env.CAPTURES.list({ prefix: `${COMIC_LOCK_PREFIX}${slot}.`, limit: 1 });
    const key = listed.objects[0]?.key;
    if (!key) return null;
    const obj = await env.CAPTURES.get(key);
    if (!obj) return null;
    const r: RefBytes = {
      name: `${slot}.png`, bytes: await obj.arrayBuffer(),
      contentType: obj.httpMetadata?.contentType ?? 'image/png',
    };
    lockCache.set(slot, r);
    return r;
  }

  // ── 페이지 모드 — 한 번의 호출로 페이지 전체 ──
  if (mode === 'page') {
    const refs: RefBytes[] = [];
    const missing: string[] = [];
    for (const slot of STYLE_LOCK_NAMES) {
      const r = await loadRef(slot);
      if (r) refs.push(r); else missing.push(slot);
    }
    if (!refs.length) return json(409, { ok: false, error: 'style_lock_empty: 바이블 없이 그리면 남의 그림체가 된다' });
    const prompt = buildPagePrompt(s);
    const art = await generatePageImage(env, prompt, refs, s.panelCount);
    if ('error' in art) return json(502, { ok: false, error: art.error, provider: art.provider });
    const key = `${COMIC_STRIP_PREFIX}${comicId}/page.png`;
    await env.CAPTURES.put(key, art.bytes, { httpMetadata: { contentType: 'image/png' } });
    try {
      const raw = await env.PLANET.get(META_KEY);
      const log: { comicId: string }[] = raw ? JSON.parse(raw) : [];
      await env.PLANET.put(META_KEY, JSON.stringify([
        { comicId, at: Date.now(), title: s.title, theme: s.theme, panelCount: s.panelCount, mode: 'page', scenario: s },
        ...log.filter((x) => x.comicId !== comicId),
      ].slice(0, META_KEEP)));
    } catch { /* 메타 실패가 생성을 막지 않는다 */ }
    return json(200, {
      ok: true, mode: 'page', comicId, key, model: art.model, provider,
      warnings: missing.length ? [`lock_missing: ${missing.join(', ')}`] : [],
    });
  }

  const made: { index: number; key: string; model: string; provider: string }[] = [];
  const errors: string[] = [];
  for (const idx of want) {
    const panel = s.panels.find((p) => p.index === idx)!;
    const slots = pickStyleRefs(panel.shot, cap);
    const refs: RefBytes[] = [];
    for (const slot of slots) {
      const r = await loadRef(slot);
      if (r) refs.push(r);
      else errors.push(`lock_missing:${slot} (컷 ${idx} — 바이블 없이 그리면 남의 그림체가 된다)`);
    }
    if (!refs.length) { errors.push(`panel_${idx}_skipped: Style Lock이 비어 있다`); continue; }
    const prompt = buildPanelPrompt(panel);
    const art = await generatePanelImage(env, prompt, refs);
    if ('error' in art) { errors.push(`panel_${idx}: ${art.error}`); continue; }
    const key = panelKey(comicId, idx);
    await env.CAPTURES.put(key, art.bytes, { httpMetadata: { contentType: 'image/png' } });
    made.push({ index: idx, key, model: art.model, provider: art.provider });
  }

  // 메타 — 최근 작품 목록 (재방문·재조립용)
  try {
    const raw = await env.PLANET.get(META_KEY);
    const log: { comicId: string }[] = raw ? JSON.parse(raw) : [];
    const rest = log.filter((x) => x.comicId !== comicId);
    await env.PLANET.put(META_KEY, JSON.stringify([
      { comicId, at: Date.now(), title: s.title, theme: s.theme, panelCount: s.panelCount, scenario: s },
      ...rest,
    ].slice(0, META_KEEP)));
  } catch { /* 메타 실패가 생성을 막지 않는다 */ }

  return json(200, { ok: errors.length === 0, comicId, made, errors, provider });
};
