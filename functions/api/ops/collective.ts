// BUILD 422-OPS-E — GET /api/ops/collective (Ops 호스트 전용 · Access 뒤)
// k-익명(참여자·항목별 5명) 적용 "후"의 보기만 반환한다.
// 개인 snapshot 조회 API는 존재하지 않는다 — 이 파일이 유일한 읽기 표면이다.

import { readCollectiveAgg } from '../_collective-io';
import { kAnonView, K_ANON } from '../_collective';
import { OBJECT_REGISTRY } from '../../../src/objects/objectRegistry';

interface Env {
  PLANET: KVNamespace;
}

const JSON_HEADERS = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' };

const LABELS = new Map(
  OBJECT_REGISTRY.map((e) => [e.id, { label: e.label, emoji: e.views.twoD?.emoji ?? '' }]),
);

export const onRequestGet: PagesFunction<Env> = async ({ env }) => {
  const agg = await readCollectiveAgg(env.PLANET);
  const view = kAnonView(agg);

  if (view.hidden) {
    return new Response(JSON.stringify({
      ok: true, hidden: true, participants: view.participants, kAnon: K_ANON,
    }), { status: 200, headers: JSON_HEADERS });
  }

  const targets = Object.entries(view.targets ?? {})
    .map(([type, t]) => ({
      type,
      label: LABELS.get(type)?.label ?? type,
      emoji: LABELS.get(type)?.emoji ?? '',
      total: t.total,
      contributors: t.contributors,
      acts: { observe: t.observe, rest: t.rest, record: t.record, wonder: t.wonder },
    }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 30);

  return new Response(JSON.stringify({
    ok: true, hidden: false, participants: view.participants, kAnon: K_ANON,
    totals: view.totals, targets,
  }), { status: 200, headers: JSON_HEADERS });
};
