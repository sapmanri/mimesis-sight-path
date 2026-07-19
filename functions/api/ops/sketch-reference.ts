// BUILD 431 — /api/ops/sketch-reference (Ops 호스트 전용 · Access 뒤)
// 기준 그림 업로드. 앞으로 별이·빼콩·소품·그림체 참조를 계속 쓰게 되므로
// 구조를 지금 고정한다:
//
//   sketch-trials/reference/byeoli.png
//   sketch-trials/reference/ppaekong.png
//
// 운영 captures/ 와 섞이지 않고, sketch-image 라우트가 그대로 읽을 수 있다.
// ⛔ 자동 게시·크론과 연결점 없음.

import { TRIAL_R2_PREFIX } from '../_image-provider.ts';

interface Env { CAPTURES: R2Bucket }

export const REFERENCE_PREFIX = `${TRIAL_R2_PREFIX}reference/`;
const MAX_BYTES = 8 * 1024 * 1024;
const ALLOWED = new Set(['image/png', 'image/jpeg', 'image/webp']);
const JSON_HEADERS = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' };

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });

/** 이름은 우리가 정한 짧은 슬러그만. 경로 조작·확장자 위조를 막는다. */
export function referenceKeyFor(name: string | null, contentType: string): string | null {
  if (!name || !/^[a-z][a-z0-9_-]{0,31}$/.test(name)) return null;
  const ext = contentType === 'image/png' ? 'png' : contentType === 'image/jpeg' ? 'jpg' : contentType === 'image/webp' ? 'webp' : null;
  if (!ext) return null;
  return `${REFERENCE_PREFIX}${name}.${ext}`;
}

/** GET — 등록된 기준 그림 목록. 참조 키를 그대로 시험 요청에 넣으면 된다. */
export const onRequestGet: PagesFunction<Env> = async ({ env }) => {
  const listed = await env.CAPTURES.list({ prefix: REFERENCE_PREFIX, limit: 50 });
  return json(200, {
    ok: true,
    prefix: REFERENCE_PREFIX,
    references: listed.objects.map((o) => ({
      key: o.key,
      size: o.size,
      uploaded: o.uploaded,
      preview: `/api/ops/sketch-image?key=${encodeURIComponent(o.key)}`,
    })),
    howTo: 'POST 본문에 이미지 바이트, ?name=byeoli 로 이름 지정. content-type: image/png|jpeg|webp',
  });
};

/** POST — 기준 그림 등록(덮어쓰기). 같은 이름이면 교체된다. */
export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const url = new URL(request.url);
  const contentType = (request.headers.get('content-type') ?? '').split(';')[0].trim();
  if (!ALLOWED.has(contentType)) {
    return json(415, { error: `unsupported_type: ${[...ALLOWED].join(', ')} 만 가능` });
  }
  const key = referenceKeyFor(url.searchParams.get('name'), contentType);
  if (!key) return json(400, { error: 'bad_name: 소문자로 시작하는 짧은 슬러그 (예: byeoli, ppaekong)' });

  const bytes = await request.arrayBuffer();
  if (!bytes.byteLength) return json(400, { error: 'empty_body' });
  if (bytes.byteLength > MAX_BYTES) return json(413, { error: `too_large: ${MAX_BYTES} bytes 이하` });

  await env.CAPTURES.put(key, bytes, { httpMetadata: { contentType } });
  return json(200, {
    ok: true, key, size: bytes.byteLength,
    preview: `/api/ops/sketch-image?key=${encodeURIComponent(key)}`,
    next: '이 key를 sketch-trial 요청의 referenceKeys 에 넣으면 role=candidate 로 기록된다.',
  });
};
