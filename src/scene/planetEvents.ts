// BUILD 241: 행성의 사건 — 타임라인과 성과가 여기서 태어난다.
// PlanetWorld가 onEvent로 흘리고, App이 모아서 일기·성과·피드로 빚는다.
export type PlanetEventKind =
  | 'flag'        // 나라를 지났다 (data: country)
  | 'ride_start'  // 탈것에 올랐다 (data: kind = 'cloud'|'broom')
  | 'ride_end'    // 내렸다 (data: kind, meters)
  | 'rain_in'     // 비를 만났다
  | 'rain_out'    // 비를 벗어났다 (data: seconds)
  | 'snow_in'     // 눈을 만났다
  | 'moon_phase'  // 달의 위상이 바뀌었다 (data: phase = 'new'|'waxing'|'full'|'waning')
  | 'gull'        // 갈매기를 만났다
  | 'distance'    // 걸음 이정표 (data: km)
  | 'nightfall'   // 밤이 내렸다
  | 'daybreak'    // 날이 밝았다
  | 'plane'       // 비행기가 하늘을 갈랐다
  | 'ship'        // 배가 수평선을 지났다
  | 'shooting_star'; // 별똥별을 봤다

export type PlanetEvent = {
  kind: PlanetEventKind;
  data?: { country?: string; kind?: string; meters?: number; seconds?: number; phase?: string; km?: number };
  t: number; // performance.now()
};
