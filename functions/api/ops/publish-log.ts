// BUILD 422-OPS-A — GET /api/ops/publish-log
// 정본: docs/BUILD_422_OPS_OBSERVER_CONSOLE.md §3-2, §6-6, §7-2
//
// Ops 호스트 전용. 루트 미들웨어가 byeoli-ops 호스트가 아니면 이 경로를 404로 막고,
// Cloudflare Access가 인증을 앞단에서 처리한다(422-OPS-B). 이 함수는 read-only.
// CORS를 public 앱에 열지 않는다 — Ops 응답에 Access-Control-Allow-Origin: * 금지.

import { computeMissedSlots, publishLogConfig, type PublishLogRecord } from '../_publish-log';

interface Env {
  PLANET: KVNamespace;
}

const JSON_HEADERS = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' };

export const onRequestGet: PagesFunction<Env> = async ({ env }) => {
  const raw = await env.PLANET.get(publishLogConfig.LOG_KEY);
  const log: PublishLogRecord[] = raw ? JSON.parse(raw) : [];
  const now = Date.now();

  // 두 층 표현 소스를 한 레코드로 내려보낸다. 콘솔이 Layer1/Layer2로 나눠 읽는다.
  const runs = log.map((r) => ({
    // Layer 1 — 운영 로그
    runId: r.runId,
    scheduledFor: r.scheduledFor,
    invokedAt: r.invokedAt,
    result: r.result,
    httpStatus: r.httpStatus,
    threads: r.threads,
    // Layer 2 — 별이 일지 (원문 문장은 콘솔이 feed에서 textIndex로 조회)
    textIndex: r.textIndex,
    imageKey: r.imageKey,
  }));

  const missed = computeMissedSlots(log, now);

  return new Response(JSON.stringify({
    ok: true,
    generatedAt: now,
    schedule: publishLogConfig.SLOT_HOURS_KST,
    runs,
    missedSlots: missed, // 예정 시각 지났는데 run 없음 → 크론 미실행 추정
  }), { status: 200, headers: JSON_HEADERS });
};
