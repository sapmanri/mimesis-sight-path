// 별이 라디오 (가칭) — 사연 접수. POST /api/radio/story (공개)
//
// 여기는 문 앞이다: 기계적 필터(길이·URL·연락처·도배)와 속도 제한만. AI 검열과 원고는
// draft(키 인증)에서 — 공개 입구에서 토큰을 태우지 않는다.
// 개인정보 원칙: IP를 저장하지 않는다. 속도 제한 키는 날짜 소금 해시 + TTL로만 쓴다.

import { RADIO_QUEUE_KEY, RADIO_QUEUE_KEEP, mechanicalFilter, type RadioStory } from '../_radio.ts';

interface Env { PLANET: KVNamespace }

const JSON_HEADERS = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' };
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });

async function throttleKey(ip: string): Promise<string> {
  const day = new Date().toISOString().slice(0, 10);
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${day}:${ip}`));
  const hex = [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
  return `radio:ip:${hex.slice(0, 16)}`;
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  let body: { text?: unknown; hp?: unknown };
  try { body = (await request.json()) as { text?: unknown; hp?: unknown }; } catch { return json(400, { ok: false, error: 'bad_json' }); }

  // 허니팟 — 봇이 채우는 숨은 칸. 채워져 있으면 조용히 성공한 척한다 (봇에게 힌트를 주지 않는다).
  if (typeof body.hp === 'string' && body.hp.trim() !== '') return json(200, { ok: true });

  const text = typeof body.text === 'string' ? body.text.trim() : '';
  const check = mechanicalFilter(text);
  if (!check.ok) return json(400, { ok: false, error: check.reason });

  const ip = request.headers.get('CF-Connecting-IP') ?? 'unknown';
  const tk = await throttleKey(ip);
  if (await env.PLANET.get(tk)) return json(429, { ok: false, error: 'slow_down' });
  await env.PLANET.put(tk, '1', { expirationTtl: 60 });

  const raw = await env.PLANET.get(RADIO_QUEUE_KEY);
  const queue: RadioStory[] = raw ? JSON.parse(raw) : [];
  const story: RadioStory = {
    id: crypto.randomUUID().slice(0, 8),
    text,
    at: Date.now(),
    status: 'waiting',
  };
  await env.PLANET.put(RADIO_QUEUE_KEY, JSON.stringify([story, ...queue].slice(0, RADIO_QUEUE_KEEP)));
  return json(200, { ok: true });
};
