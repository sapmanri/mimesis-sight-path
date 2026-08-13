// 별이 Threads 자율 실행 창구. POST는 방송 계통과 Social Director만 호출한다.
// GET은 운영 영수증을 보여 주되 댓글 원문·토큰·사용자 원문은 내보내지 않는다.

import {
  parseSocialTrigger, readSocialAgentStatus, runSocialAgent, type SocialAgentEnv,
} from '../_byeoli-social-agent.ts';

interface Env extends SocialAgentEnv { PULSE_KEY?: string }
const HEADERS = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' };
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: HEADERS });

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  if (!env.PULSE_KEY) return json(500, { ok: false, error: 'PULSE_KEY not configured' });
  if (request.headers.get('X-Pulse-Key') !== env.PULSE_KEY) return json(403, { ok: false, error: 'forbidden' });
  const { state, receipts } = await readSocialAgentStatus(env);
  return json(200, { ok: true, state, receipts: receipts.slice(0, 30) });
};

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  if (!env.PULSE_KEY) return json(500, { ok: false, error: 'PULSE_KEY not configured' });
  if (request.headers.get('X-Pulse-Key') !== env.PULSE_KEY) return json(403, { ok: false, error: 'forbidden' });
  let raw: unknown;
  try { raw = await request.json(); } catch { return json(400, { ok: false, error: 'bad_json' }); }
  const trigger = parseSocialTrigger((raw as { trigger?: unknown } | null)?.trigger);
  if (!trigger) return json(400, { ok: false, error: 'bad_trigger' });
  const receipt = await runSocialAgent(env, trigger);
  return json(receipt.ok ? 200 : receipt.error?.startsWith('agent_busy') ? 202 : 207, receipt);
};
