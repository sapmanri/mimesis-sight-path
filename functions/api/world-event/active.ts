// BUILD 423-EVENTS — GET /api/world-event/active (공개, read 진입점이자 lazy 런타임)
// 정본: docs/BUILD_423_EVENTS_WORLD_DIRECTOR.md
//
// 시청 화면이 폴링한다. 만기 예약이 있으면 이 요청이 조건·쿨다운을 재검증한 뒤에만
// 인스턴스를 개시한다(부적합 → skipped 기록, 세계 불변). Authority는 관여하지 않는다.
// 동시 폴링 경합은 예약 기반 결정론 instanceId로 같은 인스턴스에 수렴한다(±수초 허용, v1).

import {
  loadSchedule, saveSchedule, loadActive, saveActive, resolveDue,
  type WorldEventEnv, type DirectorContext,
} from '../_world-events';

const JSON_HEADERS = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' };

export const onRequestGet: PagesFunction<WorldEventEnv> = async ({ request, env }) => {
  const now = Date.now();
  let schedule = await loadSchedule(env);

  if (schedule.some((r) => r.status === 'pending' && r.fireAtMs <= now)) {
    // 만기 예약이 있을 때만 Authority 상태를 읽는다 (평시 폴링은 KV 1회로 끝)
    let ctx: DirectorContext = { now, phase: null, weather: null, sequence: 0 };
    try {
      const res = await fetch(new URL('/api/byeoli/state', request.url), {
        headers: { accept: 'application/json' },
      });
      if (res.ok) {
        const envl = (await res.json()) as { sequence?: number; state?: { sky?: { phase?: string; weather?: string } } };
        ctx = {
          now,
          phase: envl.state?.sky?.phase ?? null,
          weather: envl.state?.sky?.weather ?? null,
          sequence: Number(envl.sequence) || 0,
        };
      }
    } catch { /* 상태를 못 읽으면 conditions 미충족으로 skipped 처리됨 */ }

    const resolved = resolveDue(schedule, ctx);
    if (resolved.changed) {
      schedule = resolved.schedule;
      await saveSchedule(env, schedule);
      if (resolved.activated) await saveActive(env, resolved.activated);
    }
  }

  const active = await loadActive(env);
  const live = active && now < active.endsAt ? active : null;
  return new Response(JSON.stringify({ ok: true, active: live }), { status: 200, headers: JSON_HEADERS });
};
