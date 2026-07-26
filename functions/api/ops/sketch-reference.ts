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

interface Env { CAPTURES: R2Bucket; PLANET: KVNamespace }

/* ── 역할 배정을 서버로 (실사고 2026-07-26) ──────────────────────
   역할(캐릭터/스타일/제외)이 **브라우저 localStorage에만** 있었다. 그래서 23:30 크론은
   그걸 볼 수 없어 자기 목록(DAILY_REFS 2장)을 하드코딩해 들고 있었다 — 화면이 보여주는
   배정과 밤에 실제로 실리는 것이 **서로 다른 진실**이었다.

   Vase 지적: "니가 어디 숨겨뒀다가 잘못 나오는 게 있을까 봐. 내가 볼 수 없는 이미지가
   있으면 안 된다." 맞다. 화면에서 정한 것이 곧 밤에 실리는 것이어야 한다.
   → 역할을 KV에 둔다. UI도 크론도 여기만 본다. */
export const REF_ROLES_KEY = 'sketch_ref_roles';
export type RefRole = 'character' | 'style' | 'off';
export const REF_ROLES: readonly RefRole[] = ['character', 'style', 'off'];

export async function readRefRoles(env: { PLANET: KVNamespace }): Promise<Record<string, RefRole>> {
  const raw = await env.PLANET.get(REF_ROLES_KEY).catch(() => null);
  if (!raw) return {};
  try { return JSON.parse(raw) as Record<string, RefRole>; } catch { return {}; }
}

/** 역할이 배정된 참조만, 순서대로. 크론과 UI가 같은 답을 얻는다. */
export function refsWithRole(roles: Record<string, RefRole>, want: RefRole): string[] {
  return Object.keys(roles).filter((k) => roles[k] === want).sort();
}

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
  const roles = await readRefRoles(env);
  return json(200, {
    ok: true,
    prefix: REFERENCE_PREFIX,
    roles,
    // 23:30 크론이 **실제로** 실을 목록. 화면이 이걸 그대로 보여줘야 한다.
    nightlyCharacterRefs: refsWithRole(roles, 'character'),
    nightlyStyleRefs: refsWithRole(roles, 'style'),
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

/** DELETE ?key= — 기준 그림 제거. reference/ prefix 밖은 지울 수 없다 (운영 captures/ 보호). */
export const onRequestDelete: PagesFunction<Env> = async ({ request, env }) => {
  const key = new URL(request.url).searchParams.get('key');
  if (!key || !key.startsWith(REFERENCE_PREFIX) || key.includes('..')) {
    return json(400, { error: `bad_key: ${REFERENCE_PREFIX} 안의 키만 지울 수 있다` });
  }
  await env.CAPTURES.delete(key);
  return json(200, { ok: true, deleted: key });
};

/**
 * PUT — 역할 배정. 화면에서 고른 것이 곧 밤에 실리는 것이 되도록 **서버에 쓴다.**
 * body: { roles: { "<r2 key>": "character"|"style"|"off", ... } }
 *
 * 존재하지 않는 키는 거부한다 — 없는 그림에 역할을 주면 화면은 배정됐다고 보이는데
 * 크론은 아무것도 못 싣는다(또 다른 두 진실).
 */
export const onRequestPut: PagesFunction<Env> = async ({ request, env }) => {
  let body: { roles?: Record<string, string> };
  try { body = (await request.json()) as typeof body; } catch { return json(400, { ok: false, error: 'bad_json' }); }
  const roles = body.roles;
  if (!roles || typeof roles !== 'object') return json(400, { ok: false, error: 'roles_required' });

  const listed = await env.CAPTURES.list({ prefix: REFERENCE_PREFIX, limit: 50 });
  const exist = new Set(listed.objects.map((o) => o.key));
  const clean: Record<string, RefRole> = {};
  const rejected: string[] = [];
  for (const [k, v] of Object.entries(roles)) {
    if (!exist.has(k)) { rejected.push(`missing: ${k}`); continue; }
    if (!(REF_ROLES as readonly string[]).includes(v)) { rejected.push(`bad_role: ${k}=${v}`); continue; }
    clean[k] = v as RefRole;
  }
  if (rejected.length) return json(422, { ok: false, error: 'roles_invalid', detail: rejected });

  await env.PLANET.put(REF_ROLES_KEY, JSON.stringify(clean));
  return json(200, {
    ok: true, roles: clean,
    nightlyCharacterRefs: refsWithRole(clean, 'character'),
    nightlyStyleRefs: refsWithRole(clean, 'style'),
  });
};
