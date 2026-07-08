// BUILD 252: 대형 이벤트 — 예고된 하늘 (Vase)
// 잦은 배경 혜성/별똥별과 별개의 '큰 사건' 레이어. 실제 시간(UTC) 하루 3번, 혜성 또는 유성우.
// 자율 삽만리가 이걸 읽어 "몇시몇분, 어느 하늘"이라고 예고하고 — 그 시각에 진짜로 온다.
// 밤낮 무관하게 실현된다(예고가 생명이므로). 결정론: 같은 날은 누구에게나 같은 이벤트.
//
// 시연: forceDemo()로 지금 즉시 하나를 띄운다(에디터 판단용). 헌법 6조 — 시간 고지형 이벤트엔 항상 시연 버튼.

export type MajorKind = 'comet' | 'meteor_shower';
export type MajorEvent = {
  kind: MajorKind;
  at: number;        // 발생 절대 UTC epoch초
  whenMs: number;    // = at*1000 (편의)
  az: number;        // 방위각(rad)
  el: number;        // 고도(rad)
  dur: number;       // 지속(초) — 혜성 ~8, 유성우 ~1200(20분)
  dir: string;       // 한국어 방위('남','북서'…)
  slot: number;      // 그날의 몇 번째(0~2)
};

const DAY = 86400;   // 실제 하루(초)
const SLOTS = 3;     // 하루 3번
const SALT = 9001;
const COMET_DUR = 8;
const METEOR_DUR = 1200; // 20분

function rngOf(seed: number) {
  let a = seed >>> 0;
  return () => {
    a += 0x6d2b79f5;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function azToCompass(az: number): string {
  const deg = ((az * 180) / Math.PI) % 360;
  const dirs = ['동', '남동', '남', '남서', '서', '북서', '북', '북동'];
  return dirs[Math.round(deg / 45) % 8];
}

// UTC 날짜(에폭 며칠째)의 대형 이벤트 3개 — 결정론
export function majorEventsForDay(dayIndex: number): MajorEvent[] {
  const rng = rngOf(((dayIndex * 2654435761) ^ (SALT * 40503)) >>> 0);
  const out: MajorEvent[] = [];
  for (let i = 0; i < SLOTS; i += 1) {
    const slotStart = (i / SLOTS) * DAY;
    // 구간의 15~85% 지점 — 새벽 너무 이르거나 서로 붙지 않게
    const within = (0.15 + rng() * 0.7) * (DAY / SLOTS);
    const at = Math.floor(dayIndex * DAY + slotStart + within);
    const kind: MajorKind = rng() < 0.55 ? 'comet' : 'meteor_shower';
    const az = rng() * Math.PI * 2;
    const el = 0.4 + rng() * 0.5;
    const dur = kind === 'comet' ? COMET_DUR : METEOR_DUR;
    out.push({ kind, at, whenMs: at * 1000, az, el, dur, dir: azToCompass(az), slot: i });
  }
  return out;
}

// 지금부터 앞으로 hours시간의 대형 이벤트 (예보). nowMs=실제 UTC.
export function forecastMajor(nowMs: number, hours = 24): MajorEvent[] {
  const nowSec = nowMs / 1000;
  const today = Math.floor(nowSec / DAY);
  const out: MajorEvent[] = [];
  for (const d of [today, today + 1, today + 2]) {
    for (const e of majorEventsForDay(d)) {
      if (e.whenMs < nowMs || e.whenMs > nowMs + hours * 3600 * 1000) continue;
      out.push(e);
    }
  }
  return out.sort((a, b) => a.whenMs - b.whenMs);
}

// 지금 이 순간 진행 중인 대형 이벤트가 있으면 반환(+진행도 u). 없으면 null.
export function activeMajor(nowMs: number): { ev: MajorEvent; u: number } | null {
  const nowSec = nowMs / 1000;
  const today = Math.floor(nowSec / DAY);
  for (const d of [today - 1, today, today + 1]) { // 자정 경계 대비 앞뒤 하루
    for (const e of majorEventsForDay(d)) {
      const s = nowSec - e.at;
      if (s >= 0 && s <= e.dur) return { ev: e, u: s / e.dur };
    }
  }
  return null;
}

// 다음 대형 이벤트 하나 (예보 헤드라인용)
export function nextMajor(nowMs: number): MajorEvent | null {
  const list = forecastMajor(nowMs, 48);
  return list.length ? list[0] : null;
}
