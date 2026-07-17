// BUILD 423-EVENTS — GET /api/world-event/active (공개, read 진입점이자 lazy 런타임)
// 정본: docs/BUILD_423_EVENTS_WORLD_DIRECTOR.md
//
// 시청 화면이 폴링한다. 만기 예약이 있으면 이 요청이 조건·쿨다운을 재검증한 뒤에만
// 인스턴스를 개시한다(부적합 → skipped 기록, 세계 불변). Authority는 관여하지 않는다.
// 동시 폴링 경합은 예약 기반 결정론 instanceId로 같은 인스턴스에 수렴한다(±수초 허용, v1).

import {
  loadSchedule, saveSchedule, loadActive, saveActive, resolveDue, resolveNatural,
  naturalRoll, worldEventConfig, WORLD_EVENT_REGISTRY,
  type WorldEventEnv, type DirectorContext,
} from '../_world-events';

const JSON_HEADERS = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' };

export const onRequestGet: PagesFunction<WorldEventEnv> = async ({ request, env }) => {
  const now = Date.now();
  let schedule = await loadSchedule(env);

  const hasDue = schedule.some((r) => r.status === 'pending' && r.fireAtMs <= now);
  // 426-C: 자연 발생 후보 — 주사위(순수 계산)를 먼저 굴려서, 통과 가능성이 있을 때만
  // Authority 상태를 읽는다. 대부분의 폴링은 KV 1회로 끝난다.
  const slotStart = Math.floor(now / worldEventConfig.NATURAL_SLOT_MS) * worldEventConfig.NATURAL_SLOT_MS;
  const diceCandidate = WORLD_EVENT_REGISTRY.some((def) =>
    !schedule.some((r) => r.id === `nat-${def.id}-${slotStart}`)
    && naturalRoll(def.id, slotStart) < (worldEventConfig.NATURAL_P[def.rarity] ?? 0));

  if (hasDue || diceCandidate) {
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
    } catch { /* 상태를 못 읽으면 conditions 미충족 취급 */ }

    let activatedNow = false;
    if (hasDue) {
      const resolved = resolveDue(schedule, ctx);
      if (resolved.changed) {
        schedule = resolved.schedule;
        await saveSchedule(env, schedule);
        if (resolved.activated) { await saveActive(env, resolved.activated); activatedNow = true; }
      }
    }
    // 예약이 우선 — 예약 개시가 없고, 진행 중인 무대도 없을 때만 세계가 스스로 움직인다
    if (!activatedNow && diceCandidate) {
      const current = await loadActive(env);
      if (!current || now >= current.endsAt) {
        const nat = resolveNatural(schedule, ctx);
        if (nat.changed) {
          schedule = nat.schedule;
          await saveSchedule(env, schedule);
          if (nat.activated) await saveActive(env, nat.activated);
        }
      }
    }
  }

  const active = await loadActive(env);
  const live = active && now < active.endsAt ? active : null;
  return new Response(JSON.stringify({ ok: true, active: live }), { status: 200, headers: JSON_HEADERS });
};
