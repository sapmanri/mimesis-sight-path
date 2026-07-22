// BUILD 434-COMIC — /api/ops/comic-style-lock (Ops 호스트 전용 · Access 뒤)
//
// Comic Lab 전용 Style Lock 저장소. 그림실험실과 접점 0 — 별개 R2 prefix, 별개 엔드포인트.
// (실사고 2026-07-22: 초판이 sketch-reference에 얹혀 두 실험실이 엮였다 — Vase 판정으로 분리.
//  "응용만 하라고 했지 둘을 엮지 말라고." 포크는 패턴 재사용이지 저장소 공유가 아니다.)
//
// 슬롯은 바이블 5장 고정 — 임의 이름 업로드 불가. 잠김(Lock)의 의미가 그것이다.

import { STYLE_LOCK_NAMES } from '../_comic.ts';

interface Env { CAPTURES: R2Bucket }

export const COMIC_LOCK_PREFIX = 'comic/style-lock/';
const MAX_BYTES = 8 * 1024 * 1024;
const ALLOWED = new Set(['image/png', 'image/jpeg', 'image/webp']);
const JSON_HEADERS = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' };
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });

/** 슬롯 검증 — 바이블 5장 외에는 이 저장소에 들어올 수 없다. */
export function isLockSlot(slot: string | null): slot is (typeof STYLE_LOCK_NAMES)[number] {
  return !!slot && (STYLE_LOCK_NAMES as readonly string[]).includes(slot);
}

const extOf = (ct: string) => (ct === 'image/png' ? 'png' : ct === 'image/jpeg' ? 'jpg' : 'webp');

async function findSlotObject(env: Env, slot: string, thumb = false):
  Promise<{ key: string; size: number; uploaded: number } | null> {
  const prefix = `${COMIC_LOCK_PREFIX}${slot}${thumb ? '.thumb' : ''}.`;
  const listed = await env.CAPTURES.list({ prefix, limit: 5 });
  // 원본 조회 시 .thumb 파일이 섞여 잡히지 않게 거른다
  const o = listed.objects.filter((x) => thumb || !x.key.includes('.thumb.'))[0];
  return o ? { key: o.key, size: o.size, uploaded: Number(new Date(o.uploaded)) } : null;
}

/**
 * GET            — 슬롯 5개의 장착 상태
 * GET ?file=슬롯 — 그 바이블 이미지 스트리밍 (Access 뒤에서만)
 */
export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const url = new URL(request.url);
  const file = url.searchParams.get('file');
  if (file) {
    if (!isLockSlot(file)) return json(400, { error: 'bad_slot' });
    const wantThumb = url.searchParams.get('thumb') === '1';
    // 썸네일 요청인데 아직 없으면 원본으로 폴백 (백필 전 상태)
    const found = (wantThumb ? await findSlotObject(env, file, true) : null) ?? await findSlotObject(env, file);
    if (!found) return json(404, { error: 'empty_slot' });
    const obj = await env.CAPTURES.get(found.key);
    if (!obj) return json(404, { error: 'empty_slot' });
    // 원본을 매번 다시 받던 실사고(2026-07-22) — URL의 v=uploaded가 교체를 반영하므로 길게 캐시
    return new Response(obj.body, {
      headers: {
        'content-type': obj.httpMetadata?.contentType ?? 'image/png',
        'cache-control': 'private, max-age=604800',
      },
    });
  }
  const slots = [] as { slot: string; loaded: boolean; key: string | null; size: number | null; uploaded: number | null; hasThumb: boolean }[];
  for (const slot of STYLE_LOCK_NAMES) {
    const found = await findSlotObject(env, slot);
    const thumb = found ? await findSlotObject(env, slot, true) : null;
    slots.push({
      slot, loaded: !!found, key: found?.key ?? null, size: found?.size ?? null,
      uploaded: found?.uploaded ?? null, hasThumb: !!thumb,
    });
  }
  return json(200, { ok: true, prefix: COMIC_LOCK_PREFIX, slots, loaded: slots.filter((s) => s.loaded).length });
};

/**
 * POST ?slot=ch00_master           — 바이블 교체(덮어쓰기). 옛 확장자·옛 썸네일 제거.
 * POST ?slot=ch00_master&thumb=1  — 썸네일 저장(클라이언트가 200px로 만들어 보냄).
 */
export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const url = new URL(request.url);
  const slot = url.searchParams.get('slot');
  if (!isLockSlot(slot)) return json(400, { error: `bad_slot: ${STYLE_LOCK_NAMES.join(' | ')} 만 가능` });
  const isThumb = url.searchParams.get('thumb') === '1';
  const contentType = (request.headers.get('content-type') ?? '').split(';')[0].trim();
  if (!ALLOWED.has(contentType)) return json(415, { error: 'png/jpeg/webp만 가능' });
  const bytes = await request.arrayBuffer();
  if (!bytes.byteLength) return json(400, { error: 'empty_body' });
  if (bytes.byteLength > MAX_BYTES) return json(413, { error: '8MB 이하만' });

  if (isThumb) {
    const key = `${COMIC_LOCK_PREFIX}${slot}.thumb.${extOf(contentType)}`;
    const prevT = await findSlotObject(env, slot, true);
    await env.CAPTURES.put(key, bytes, { httpMetadata: { contentType } });
    if (prevT && prevT.key !== key) await env.CAPTURES.delete(prevT.key);
    return json(200, { ok: true, slot, key, size: bytes.byteLength, thumb: true });
  }

  const prev = await findSlotObject(env, slot);
  const prevThumb = await findSlotObject(env, slot, true);
  const key = `${COMIC_LOCK_PREFIX}${slot}.${extOf(contentType)}`;
  await env.CAPTURES.put(key, bytes, { httpMetadata: { contentType } });
  if (prev && prev.key !== key) await env.CAPTURES.delete(prev.key);   // 확장자 바뀐 교체 — 잔재 없이
  if (prevThumb) await env.CAPTURES.delete(prevThumb.key);            // 원본 교체 → 옛 썸네일 무효
  return json(200, { ok: true, slot, key, size: bytes.byteLength });
};

/** DELETE ?slot= — 슬롯 비우기. */
export const onRequestDelete: PagesFunction<Env> = async ({ request, env }) => {
  const slot = new URL(request.url).searchParams.get('slot');
  if (!isLockSlot(slot)) return json(400, { error: 'bad_slot' });
  const found = await findSlotObject(env, slot);
  const thumb = await findSlotObject(env, slot, true);
  if (found) await env.CAPTURES.delete(found.key);
  if (thumb) await env.CAPTURES.delete(thumb.key);
  return json(200, { ok: true, slot, deleted: !!found });
};
