// ---------- BUILD 151·152: SKY DRIFT — 흐르는 하늘 ----------
// spec은 악보, 이것은 연주다. spec 객체는 절대 건드리지 않고 (건드리면 세계가 재건축된다),
// 하늘의 런타임 상태만 별도 채널로 흐르게 한다. World가 매 프레임 이 상태를 읽어
// 빛·안개·비·바람·소리에 바른다.
//
// 151 날씨 유랑: 50~160초마다 목표를 새로 정하고, 분 단위로 스며 이동한다.
//   구름이 걷다가(cloud), 바람이 일다가(wind), 구름이 짙으면 가끔 비가 온다(rainMix).
//   마르코프가 아니라 산책이다 — 목표조차 현재에서 반걸음.
// 152 하루의 빛: dayT 0~1 (0=자정). 해가 동에서 떠서 서로 진다.
//   해의 높이가 그림자를 끌고 다닌다 — 아침의 긴 그림자, 정오의 짧은 그림자, 노을의 금빛.
//   밤에는 태양의 자리를 달이 이어받는다 (BUILD 115의 문법을 시간이 잇는다).

import type { WorldSpec } from './worldSpec';

export type SkyState = {
  /** 0~1, 0=자정, 0.25=일출 부근, 0.5=정오, 0.75=일몰 부근 */
  dayT: number;
  time: 'day' | 'night';
  wind: number;
  cloud: number;
  /** 강수 혼합 0~1 — 파티클 drawRange와 빗소리가 함께 따른다 */
  rainMix: number;
  /** 이 세계의 강수 형태 — 눈의 세계엔 눈이, 나머지엔 비가 온다 */
  form: 'rain' | 'snow';
  lightningOn: boolean;
  kind: 'clear' | 'cloudy' | 'rain' | 'snow';
};

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

/** 부드러운 밴드 — a~b에서 0→1 */
const smooth = (v: number, a: number, b: number) => {
  const t = clamp01((v - a) / (b - a));
  return t * t * (3 - 2 * t);
};

export function createSkyDrift() {
  const st: SkyState = {
    dayT: 0.42, time: 'day', wind: 0, cloud: 0.5, rainMix: 0, form: 'rain', lightningOn: false, kind: 'clear',
  };
  let flowTime = false;
  let flowWeather = false;
  let daySeconds = 12 * 60;
  let tCloud = 0.5; let tWind = 0.1; let tRain = 0;
  let retargetIn = 20 + Math.random() * 30;

  const derive = () => {
    st.time = st.dayT > 0.235 && st.dayT < 0.775 ? 'day' : 'night';
    st.kind = st.rainMix > 0.12 ? st.form : (st.cloud > 0.62 ? 'cloudy' : 'clear');
    st.lightningOn = st.form === 'rain' && st.rainMix > 0.68;
  };

  return {
    state: st,
    /** spec의 현재 값에서 출발한다 — 흐름은 이어달리기지 재시작이 아니다 */
    init(spec: WorldSpec) {
      const w = spec.weather;
      flowTime = !!w?.flow?.time;
      flowWeather = !!w?.flow?.weather;
      daySeconds = Math.max(2, Math.min(60, w?.flow?.dayMinutes ?? 12)) * 60;
      st.form = w?.kind === 'snow' ? 'snow' : 'rain';
      st.wind = w?.wind ?? 0;
      st.cloud = w?.cloudAmount ?? (w?.kind === 'cloudy' || w?.kind === 'rain' || w?.kind === 'snow' ? 0.7 : 0.35);
      st.rainMix = (w?.kind === 'rain' || w?.kind === 'snow') ? (w?.rainAmount ?? 0.6) : 0;
      st.dayT = (w?.time ?? 'day') === 'night' ? 0.93 : 0.42;
      tCloud = st.cloud; tWind = st.wind; tRain = st.rainMix;
      derive();
    },
    enabled: () => flowTime || flowWeather,
    flowTime: () => flowTime,
    flowWeather: () => flowWeather,
    tick(delta: number) {
      if (flowTime) st.dayT = (st.dayT + delta / daySeconds) % 1;
      if (flowWeather) {
        retargetIn -= delta;
        if (retargetIn <= 0) {
          retargetIn = 50 + Math.random() * 110;
          // 구름의 산책 — 목표조차 현재에서 반걸음만
          tCloud = clamp01(st.cloud + (Math.random() - 0.5) * 0.85);
          tWind = clamp01(0.04 + tCloud * 0.45 * Math.random() + (Math.random() - 0.5) * 0.18);
          // 구름이 짙어야 비가 온다. 오던 비는 절반의 확률로 계속 온다
          tRain = tCloud > 0.6 && Math.random() < (st.rainMix > 0.1 ? 0.55 : 0.4)
            ? 0.3 + Math.random() * 0.7 : 0;
        }
        st.cloud += (tCloud - st.cloud) * Math.min(1, delta * 0.02);   // 1분쯤에 걸쳐
        st.wind += (tWind - st.wind) * Math.min(1, delta * 0.028);
        st.rainMix += (tRain - st.rainMix) * Math.min(1, delta * 0.032); // 비는 조금 성급하게 오고 성급하게 갠다
      }
      derive();
    },
  };
}

// ---------- 하루의 빛: dayT → 빛의 형질 ----------
// 해의 자리: 동(-X 하늘)에서 떠서 서(+X 하늘)로 진다. 높이는 sin 활.
// 반환값을 World가 매 프레임 sun/hemi/fog/background에 바른다.

export type DayLight = {
  /** 해(또는 달)의 방향 단위벡터 — sun.position = target + dir × 거리 */
  dir: [number, number, number];
  sunColor: string;
  /** 기준 대비 배율 */
  sunIntensityK: number;
  hemiK: number;
  fillK: number;
  /** 안개·배경 혼합량 */
  dawnK: number;
  duskK: number;
  nightK: number;
  isMoon: boolean;
};

export function dayLightAt(dayT: number): DayLight {
  const day = dayT > 0.235 && dayT < 0.775;
  // 해: dayT 0.25→0.75 를 활 하나로. 달: 0.75→1.25(감아서) 를 활 하나로.
  const arcT = day ? (dayT - 0.25) / 0.5 : (((dayT + 0.25) % 1)) / 0.5;
  const el = Math.sin(Math.PI * clamp01(arcT)) * (day ? 1 : 0.8);        // 높이 0~1
  const az = (clamp01(arcT) - 0.5) * Math.PI * 0.75;                     // 동→서 ±67.5°
  const elevRad = 0.12 + el * 1.05;                                      // 지평선 살짝 위 ~ 높이
  const dir: [number, number, number] = [
    Math.sin(az) * Math.cos(elevRad),
    Math.sin(elevRad),
    Math.cos(az) * Math.cos(elevRad) * 0.55 + 0.45, // 살짝 남쪽에서 — 길을 비스듬히 비춘다
  ];
  const n = Math.hypot(...dir);
  dir[0] /= n; dir[1] /= n; dir[2] /= n;

  // 노을·새벽·밤 혼합량 (부드러운 밴드)
  const dawnK = smooth(dayT, 0.2, 0.27) * (1 - smooth(dayT, 0.3, 0.38));
  const duskK = smooth(dayT, 0.62, 0.72) * (1 - smooth(dayT, 0.755, 0.8));
  const nightK = Math.max(1 - smooth(dayT, 0.21, 0.3), smooth(dayT, 0.73, 0.81));

  // 해의 색: 낮은 해 = 금빛, 높은 해 = 본색. 밤 = 달빛
  const low = 1 - smooth(el, 0, 0.42);
  const sunColor = !day ? '#c3d2ee'
    : low > 0.6 ? '#ff9d63'
    : low > 0.3 ? '#ffc08a'
    : '#fff2dd';
  const sunIntensityK = day
    ? (0.25 + 0.75 * smooth(el, 0, 0.5))
    : 0.3 * (0.4 + 0.6 * el); // 달빛 — BUILD 115의 0.3 배율을 시간이 잇는다
  return {
    dir,
    sunColor,
    sunIntensityK,
    hemiK: day ? 0.62 + 0.38 * smooth(el, 0, 0.5) : 0.55,
    fillK: day ? 1 : 0.45,
    dawnK, duskK, nightK,
    isMoon: !day,
  };
}
