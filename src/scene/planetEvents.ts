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
  | 'comet'       // 혜성이 스쳤다 (특별)
  | 'shooting_star' // 별똥별을 봤다
  // BUILD 329: 동네(theatre) 이벤트 — 이름은 planet이지만 세 무대 공유 시스템.
  | 'theatre_arrive' // 동네에 들어섰다 (data: village)
  | 'stage_play'     // 별리가 무언가 했다 (data: stage = 'piano'|'sleep'|'workout'|'dance'|'treadmill')
  // BUILD 360: 지역(World/본토) 이벤트 — 세 무대 공유 시스템에 지역을 마저 배선.
  | 'region_arrive'  // 기억 앞에 닿았다 (data: memory = 장면 제목)
  | 'mail'           // 우체통에서 편지를 받았다 (data: memory = 편지 첫 구절, 있으면)
  | 'campfire';      // 모닥불 앞에 쉬어갔다

export type PlanetEvent = {
  kind: PlanetEventKind;
  data?: { country?: string; kind?: string; meters?: number; seconds?: number; phase?: string; km?: number; village?: string; stage?: string; memory?: string };
  t: number; // performance.now()
};
