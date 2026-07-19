// BUILD 431 — /api/ops/sketch-image?key=... (Ops 호스트 전용 · Access 뒤)
// 시험 산출물만 스트리밍한다. R2 임의 읽기 통로가 되면 안 되므로 prefix를 강제한다.

import { TRIAL_R2_PREFIX } from '../_image-provider.ts';

interface Env { CAPTURES: R2Bucket }

/** sketch-trials/ 밖은 읽지 않는다. 경로 탈출(..)도 막는다. */
export function isTrialKey(key: string | null): key is string {
  if (!key) return false;
  if (!key.startsWith(TRIAL_R2_PREFIX)) return false;
  if (key.includes('..') || key.includes('//')) return false;
  return /^[a-z0-9._/-]+$/i.test(key);
}

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const key = new URL(request.url).searchParams.get('key');
  if (!isTrialKey(key)) return new Response('bad key', { status: 400 });
  const obj = await env.CAPTURES.get(key);
  if (!obj) return new Response('not found', { status: 404 });
  return new Response(obj.body, {
    headers: {
      'content-type': obj.httpMetadata?.contentType ?? 'image/png',
      'cache-control': 'private, max-age=300',
    },
  });
};
