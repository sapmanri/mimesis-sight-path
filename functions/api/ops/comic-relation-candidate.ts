// S-04 — Relation Candidate 저장 (Vase 설계: Relation Discovery Mode)
//
// Discovery Mode로 만들어진 작품이 "아, 별이는 홈즈를 이렇게 대하는구나"를 발견했다면
// 그 발견을 후보로 저장한다. Observer 승인 → Relation Registry 정식 등록(코드·문서 자산)은
// 사람의 몫 — 여기는 후보의 보관소일 뿐이다. 관계를 지어내지 않고, 발견을 잃지 않는다.
//
// Relation Genome의 시작점 (Vase, 2026-07-22 심야).

import { withTransientRetry } from '../_retry.ts';

interface Env { PLANET: KVNamespace }

const KEY = 'relation_candidates';
const KEEP = 50;
const JSON_HEADERS = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' };
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });

export const onRequestGet: PagesFunction<Env> = async ({ env }) => {
  const raw = await withTransientRetry('relcand_get', () => env.PLANET.get(KEY));
  return json(200, { ok: true, candidates: raw ? JSON.parse(raw) : [] });
};

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  let body: { pairs?: string[]; comicId?: string; topic?: string; note?: string };
  try { body = (await request.json()) as typeof body; } catch { return json(400, { ok: false, error: 'bad_json' }); }
  const pairs = (body.pairs ?? []).filter((p) => /^[a-z]+-[a-z]+$/.test(p));
  if (!pairs.length) return json(400, { ok: false, error: 'pairs_required' });
  const raw = await withTransientRetry('relcand_get', () => env.PLANET.get(KEY));
  const log: unknown[] = raw ? JSON.parse(raw) : [];
  const entry = {
    at: Date.now(), pairs, comicId: body.comicId ?? null,
    topic: (body.topic ?? '').slice(0, 200), note: (body.note ?? '').slice(0, 500),
    status: 'candidate',   // Observer 승인 전 — UNVERIFIED 문화 그대로
  };
  await withTransientRetry('relcand_put', () =>
    env.PLANET.put(KEY, JSON.stringify([entry, ...log].slice(0, KEEP))));
  return json(200, { ok: true, saved: entry });
};
