// BUILD 246: 하늘 시계 (Vase) — 이 세계를 온라인에 띄운다.
// 누구든 이 주소로 들어오면 "같은 순간 같은 하늘"을 본다. 혜성이 뜨면 접속한 전원이 동시에 올려다본다.
// 방법은 서버 중계가 아니다 — 모두가 하나의 절대 시각(UTC)을 보고 같은 공식으로 세계를 그린다.
// 대역폭 0, 지연 0, 각자 60fps. 세계는 동기, 카메라만 각자.
//
// 철학(worldSpec.ts에서 이어받음): "재현 불가능한 세계는 디버깅 불가능한 세계다."
// 이제 한 걸음 더 — "동기화 불가능한 세계는 함께 볼 수 없는 세계다."

import { createRng } from '../engine/worldSpec';

// 세계의 기준점(epoch). 이 순간부터의 경과초가 곧 세계의 나이.
// 고정 상수여야 모든 클라이언트가 동일한 el을 계산한다. (2026-01-01T00:00:00Z)
export const WORLD_EPOCH_MS = 1767225600000;

/**
 * 세계 시각 — 모든 동기화의 심장.
 * 기존 코드의 state.clock.elapsedTime(접속 후 경과)을 이 함수로 대체하면
 * 접속 시점과 무관하게 모두가 같은 값을 공유한다.
 * @param nowMs 테스트 주입용(기본 Date.now()). 벤치에서 특정 순간 검증에 씀.
 */
export function worldTime(nowMs: number = Date.now()): number {
  return (nowMs - WORLD_EPOCH_MS) / 1000;
}

/**
 * 이산 이벤트 스케줄러.
 * "period초마다 한 번, 언제·어떻게"를 절대시각만으로 결정론적으로 답한다.
 * floor(t/period)=사이클 인덱스 → 그 인덱스를 시드로 발생시각·난수를 뽑는다.
 * 그래서 42번째 혜성은 누구에게나 같은 초에 같은 궤도로 뜬다.
 *
 * 반환:
 *  - cycle: 현재 사이클 번호(정수). 바뀌면 "새 이벤트가 예약된 사이클".
 *  - fireAt: 이 사이클에서 이벤트가 발생하는 절대시각(초).
 *  - active(dur): 지금 이벤트가 진행 중인가 + 진행도 u(0~1).
 *  - rng: 이 사이클 전용 시드 난수(방향·크기 등 파생값 동일 보장).
 */
export function eventCycle(t: number, period: number, salt: number) {
  const cycle = Math.floor(t / period);
  // 사이클마다 다른, 그러나 모두에게 동일한 시드
  const seed = ((cycle * 2654435761) ^ (salt * 40503)) >>> 0;
  const rng = createRng(seed);
  // 이 사이클 안에서 이벤트가 터지는 위치(주기의 앞 60% 안 어딘가 — 뒤쪽은 여유)
  const offset = rng() * period * 0.6;
  const fireAt = cycle * period + offset;
  return {
    cycle,
    fireAt,
    rng,
    // 발생 이후 dur초 동안 active. u는 0→1 진행도.
    since(): number { return t - fireAt; },
    active(dur: number): { on: boolean; u: number } {
      const s = t - fireAt;
      if (s < 0 || s > dur) return { on: false, u: 0 };
      return { on: true, u: s / dur };
    },
  };
}

/**
 * 연속 위상 — 누적각(dayAng/ang/spinAng)을 절대시각의 함수로.
 * period초에 2π 도는 것을 t로 직접 계산. +=dt 누적을 대체한다.
 */
export function phaseAngle(t: number, period: number): number {
  if (period <= 0) return 0;
  return (t * Math.PI * 2) / period;
}
