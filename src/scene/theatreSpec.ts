// ---------- BUILD 285: TheatreSpec — 그림자 극장(페러럴)의 악보 ----------
// 옆면 고정 카메라. 캐릭터는 제자리에서 걷고, 근/중/원경 판때기가 서로 다른 속도로 흐른다.
// 3D 구면(행성)도 자유 카메라(본토)도 아닌, 제3의 렌즈 — 그림자 연극(皮影戏)의 문법.
// 깊이는 진짜 거리가 아니라 '레이어가 다른 속도로 흐르는 착시'로 만든다 (패럴럭스).

export type TheatreLayer = {
  color: string;   // 실루엣 색 (뒤=옅게, 앞=짙게)
  speed: number;   // 흐름 속도 배율 (원경 느림 → 근경 빠름)
  baseY: number;   // 화면상 기준 높이 (0=하단, 1=상단 근처)
  amp: number;     // 능선 높낮이 진폭
  freq: number;    // 능선 촘촘함
  seed: number;    // 실루엣 시드 (모양 고정)
};

export type TheatreSpec = {
  // BUILD 329: 동네 식별자 — 여권 기록·다중 동네 라우팅용(기본 'train')
  village?: string;
  // BUILD 328: 패럴럭스 배경 팩 — 동네마다 이것만 갈아끼우면 새 동네가 된다.
  //   각 레이어 = { 파일, z(깊이), speed(흐름 배율) }. 뒤(작은 z)에서 앞으로 나열.
  bgLayers?: { file: string; z: number; speed: number }[];
  skyTop: string;      // 하늘 위쪽 색
  skyBottom: string;   // 하늘 아래쪽 색
  fogTint: string;     // 대기 원근(옅어짐) 색
  walkSpeed: number;   // 배경이 흐르는 기준 속도 (별리는 제자리)
  far: TheatreLayer;   // 원경 — 먼 산맥, 가장 느림
  mid: TheatreLayer;   // 중경 — 언덕/나무 띠
  near: TheatreLayer;  // 근경 — 발밑 지면, 가장 빠름
  ground: string;      // 캐릭터가 딛는 지면 띠 색
  groundAmp?: number;  // BUILD 286: 지면 오르내림 크기(월드 유닛) — 별리가 타는 언덕의 높낮이
  groundFreq?: number; // BUILD 286: 지면 언덕 촘촘함
  floorFogH?: number;  // BUILD 315: 바닥 안개 높이(화면 세로 대비 0~1). 0=끔. 발 높이쯤이 자연스러움
  floorFogColor?: string; // BUILD 315: 바닥 안개 색 (밤 대기색)
  moonlight?: number;  // BUILD 318: 달빛 세기(0~2). 배경 달 방향에서 오는 방향광. 별리를 은은히 비춤
  walker?: number;     // 산책자 인덱스 (행성과 공유 로스터). undefined/-1 = 랜덤
  // BUILD 282 계승: 체류(2단계에서 연결)
  lingerEvery?: number;
  lingerLength?: number;
};

export const DEFAULT_THEATRE_SPEC: TheatreSpec = {
  village: 'train', // BUILD 329: 첫 동네
  // BUILD 328: 첫 동네 = 기차 동네. 새 동네는 이 배열만 교체(+에셋 추가)하면 된다.
  bgLayers: [
    { file: 'train_far.png', z: -12, speed: 0.15 },
    { file: 'train_near.png', z: -6, speed: 0.5 },
    { file: 'train_posts.png', z: -4, speed: 0.7 },
    { file: 'train_cars.png', z: -3, speed: 0.9 },
  ],
  skyTop: '#dce6ea',
  skyBottom: '#eef2ec',
  fogTint: '#e4ebe6',
  walkSpeed: 1.0,
  far:  { color: '#c3ccc9', speed: 0.18, baseY: 0.54, amp: 0.11, freq: 1.3, seed: 11 }, // 먼 능선 — 옅은 회청
  mid:  { color: '#a9b8a4', speed: 0.45, baseY: 0.40, amp: 0.15, freq: 2.1, seed: 27 }, // 중경 — 부드러운 세이지
  near: { color: '#8a9c7e', speed: 1.00, baseY: 0.27, amp: 0.09, freq: 3.4, seed: 53 }, // 근경 — 차분한 녹회
  ground: '#4a5f3a',
  groundAmp: 0,    // BUILD 303: 기차 배경은 평평한 철길 — 오르내림 없음
  groundFreq: 0.5,
  floorFogH: 0.16,          // BUILD 315: 발 높이쯤까지 옅게 깔리는 밤안개
  floorFogColor: '#2a3550', // 밤 대기색
  moonlight: 1.5,           // BUILD 319: 달빛 세기 — 배경 달 방향에서 오는 방향광(별리를 비춤)
  walker: 13, // 별리(Kid5b)
  lingerEvery: 3,
  lingerLength: 1,
};

const KEY = 'mimesis.theatreDraft.v1';

export function loadTheatreDraft(): TheatreSpec {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULT_THEATRE_SPEC };
    const p = JSON.parse(raw) as Partial<TheatreSpec>;
    return {
      ...DEFAULT_THEATRE_SPEC,
      ...p,
      far: { ...DEFAULT_THEATRE_SPEC.far, ...(p.far ?? {}) },
      mid: { ...DEFAULT_THEATRE_SPEC.mid, ...(p.mid ?? {}) },
      near: { ...DEFAULT_THEATRE_SPEC.near, ...(p.near ?? {}) },
    };
  } catch {
    return { ...DEFAULT_THEATRE_SPEC };
  }
}

export function saveTheatreDraft(s: TheatreSpec): void {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* 조용히 */ }
}
