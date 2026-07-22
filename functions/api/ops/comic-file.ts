// BUILD 434-COMIC — GET /api/ops/comic-file?key= (Ops 호스트 전용 · Access 뒤)
// comic/ prefix 전용 스트리머 — 다른 실험실·운영 captures/ 는 읽지 않는다.

interface Env { CAPTURES: R2Bucket }

/** comic/ 안, 경로 조작 없음 — sketch-image의 isTrialKey와 같은 원칙. */
export function isComicKey(key: string | null): key is string {
  return !!key && key.startsWith('comic/') && !key.includes('..') && !key.includes('//');
}

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const key = new URL(request.url).searchParams.get('key');
  if (!isComicKey(key)) return new Response('bad_key', { status: 400 });
  const obj = await env.CAPTURES.get(key);
  if (!obj) return new Response('not_found', { status: 404 });
  return new Response(obj.body, {
    headers: { 'content-type': obj.httpMetadata?.contentType ?? 'image/png', 'cache-control': 'no-store' },
  });
};
