// Ops 수동 그림 발행. 실제 채택·하루 1장·Threads 발행 계약은 밤 자동선과 공유한다.

import { publishAdoptedSketch, type SketchPublishEnv } from '../_sketch-pub.ts';

const HEADERS = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' };
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: HEADERS });

export const onRequestPost: PagesFunction<SketchPublishEnv> = async ({ request, env }) => {
  const requestedBy = request.headers.get('cf-access-authenticated-user-email') ?? 'unknown';
  let body: { date?: string; confirm?: string };
  try { body = await request.json() as typeof body; } catch { return json(400, { ok: false, error: 'bad_json' }); }
  if (body.confirm !== 'publish-sketch') {
    return json(400, { ok: false, error: 'confirm_required: {"confirm":"publish-sketch"}' });
  }
  const date = body.date ?? '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return json(400, { ok: false, error: 'bad_date: YYYY-MM-DD (KST)' });

  const result = await publishAdoptedSketch(env, date, requestedBy);
  if (result.skipped === 'already_published') {
    return json(409, { ok: false, error: `already_published: ${date}의 그림은 이미 발행됐다 (하루 1장)` });
  }
  console.log(`ops/sketch-publish by=${requestedBy} date=${date} ok=${result.ok} withText=${result.withText ?? false}`);
  return json(result.status, result);
};
