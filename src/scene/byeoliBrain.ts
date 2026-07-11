// ---------- BUILD 296: ByeoliBrain — 별리의 행동양식 (본토·행성·동네·하우스 공용) ----------
// 별리는 어디 놔둬도 똑같이 논다: 걷다 멈춰 딴짓하고, 이어서 또 하고, 가끔 웅얼거리고,
// 가끔 스테이지(춤·캠프·잠…)를 펼친다. 이 '노는 법'을 하나로 통일한다.
//
// 무대가 다른 건 '걷는 방식'뿐 — 패스 따라/자유 로밍/한쪽 스크롤/이동 없음.
// brain은 "지금 걸어 / 지금 멈춰 놀아"만 결정하고, 걸을 신호는 무대가 자기 방식으로 실행한다.
// brain은 방향을 강제하지 않는다 — 놀 때 별리는 알아서 이리저리 본다(뒤통수든 옆이든 자유).

import type { WalkerRig } from './walkerRig';
import { STAGE_RECIPES, type Stage } from './stageModule';

// 무대가 brain에 제공하는 것
export type BrainHost = {
  rig: () => WalkerRig | null;                 // 모션 대상(로드 전이면 null)
  stageMount: () => import('three').Object3D | null; // 스테이지 오브젝트를 담을 그룹(캐릭터 근처)
  stage: () => Stage | null;                   // 스테이지 모듈(없으면 스테이지 세션 생략)
  speak: (icon?: string, pitch?: number) => void; // 웅얼웅얼
  // 설정 (무대 spec에서)
  lingerEvery: () => number;   // 걷는 시간(초). 0 = 체류 없음(계속 걷기)
  lingerLength: () => number;  // 체류 길이 배율
  stageChance?: () => number;  // 딴짓 대신 스테이지 세션을 펼칠 확률(기본 0.2)
  stageIds?: () => string[];   // 펼칠 수 있는 스테이지 목록(기본 ['dance'])
  // BUILD 356: 별이 자기 세계를 직접 찍는다. brain이 "지금 찍고 싶다"고 판단하면 부른다.
  //   각 맵이 자기 capture(현재 씬 촬영→R2→기록)를 주입. brain은 타이밍만 정한다.
  capture?: (reason: 'stage' | 'mood' | 'event') => void;
};

export function makeByeoliBrain(host: BrainHost) {
  let phase: 'walk' | 'linger' = 'walk';
  const L = { left: 0, gap: 0, walkLeft: 4 + Math.random() * 3 };
  // BUILD 297: 체류 한 번 = 하나의 무드. 그 무드로 딴짓을 이어가 맥락을 만든다(관조 흐름, 활기 흐름…).
  const MOODS = ['contemplative', 'contemplative', 'playful', 'idle']; // 관조에 가중치(별리다움)
  let mood = 'contemplative';

  return {
    phase: () => phase,
    // 매 프레임. 반환 { moving }: 무대가 이 신호로 자기 방식 이동을 실행한다.
    update(dt: number, paused: boolean): { moving: boolean } {
      const lingerEvery = Math.max(0, host.lingerEvery());
      const lingerLen = Math.max(0.2, host.lingerLength());
      const stage = host.stage();

      if (paused) return { moving: false };

      if (phase === 'linger') {
        if (stage?.isActive()) {
          // 스테이지 세션 진행 중 — 엔진이 모션·오브젝트·분위기를 관리(무대가 stage.update 호출).
          return { moving: false };
        }
        L.gap -= dt;
        if (L.gap <= 0 && L.left > 0) {
          const rig = host.rig();
          const mnt = host.stageMount();
          const chance = host.stageChance?.() ?? 0.2;
          const ids = host.stageIds?.() ?? ['dance'];
          // BUILD 324: 현재 무드에 맞는 레시피만 고른다(맥락). moods 없는 레시피는 아무 무드나 허용.
          //   관조 땐 눕기/연주, 활기 땐 춤/달리기 — 맥락 있는 딴짓.
          const moodIds = ids.filter((id) => {
            const m = STAGE_RECIPES[id]?.moods;
            return !m || m.includes(mood);
          });
          const pool = moodIds.length ? moodIds : ids; // 맞는 게 없으면 전체 허용(안전)
          // 가끔 스테이지 세션(춤 등). 아니면 평범한 딴짓(flourish)+가끔 웅얼웅얼.
          if (stage && rig && mnt && Math.random() < chance
              && stage.play(pool[Math.floor(Math.random() * pool.length)], { parent: mnt, rig })) {
            L.left -= 1;
            if (Math.random() < 0.3) host.capture?.('stage'); // BUILD 356: 스테이지 하는 순간 30% 촬영
          } else {
            const dur = rig?.flourish?.(mood) ?? 0;
            if (Math.random() < 0.4) {
              const r = Math.random();
              host.speak(r < 0.72 ? undefined : r < 0.86 ? '♪' : r < 0.94 ? '~' : '!', 0.85 + Math.random() * 0.35);
            }
            L.left -= 1;
            // 로봇 차렷 제거 — 대개 클립 끝나기 직전 다음 동작 크로스페이드, 가끔(25%)만 진짜 쉼.
            if (Math.random() < 0.25) {
              L.gap = (dur > 0 ? dur : 1.2) + (0.8 + Math.random() * 2.0) * lingerLen;
            } else {
              L.gap = dur > 0 ? Math.max(0.2, dur - 0.35) : 1.0;
            }
          }
        }
        // BUILD 365: 걷기로 넘어가기 전, 리그의 동작(flourish 등)이 실제로 끝났는지 확인한다.
        //   gap은 크로스페이드용으로 클립보다 0.35초 짧게 잡혀(위) 다음이 flourish면 자연스럽지만,
        //   다음이 '걷기'면 그 잔여 시간에 동작한 채 미끄러진다. 동작을 끝까지 마치고 걷게 한다.
        if (!stage?.isActive() && L.left <= 0 && L.gap <= 0 && !host.rig()?.inspecting?.()) {
          phase = 'walk';
          L.walkLeft = lingerEvery; // 정확히 이 초만큼 걷는다
        }
        return { moving: false };
      }

      // walk — 걷는다(무대가 실행). lingerEvery초 걷다 체류로. 0이면 계속 걷는다.
      if (lingerEvery > 0) {
        L.walkLeft -= dt;
        if (L.walkLeft <= 0) {
          phase = 'linger';
          mood = MOODS[Math.floor(Math.random() * MOODS.length)]; // 이번 체류의 성격을 정한다
          L.left = Math.max(1, Math.round((2 + Math.random() * 3) * lingerLen));
          L.gap = 0.6 + Math.random() * 1.4;
          if (Math.random() < 0.3) host.capture?.('mood'); // BUILD 356: 문득 멈춰 바라보는 순간 30% 촬영
          return { moving: false };
        }
      }
      return { moving: true };
    },
  };
}

export type ByeoliBrain = ReturnType<typeof makeByeoliBrain>;
