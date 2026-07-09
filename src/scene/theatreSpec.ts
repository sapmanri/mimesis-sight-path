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
  walker?: number;     // 산책자 인덱스 (행성과 공유 로스터). undefined/-1 = 랜덤
  // BUILD 282 계승: 체류(2단계에서 연결)
  lingerEvery?: number;
  lingerLength?: number;
};

export const DEFAULT_THEATRE_SPEC: TheatreSpec = {
  skyTop: '#e6d3b6',
  skyBottom: '#f4ecdb',
  fogTint: '#efe6d4',
  walkSpeed: 1.0,
  far:  { color: '#c7b795', speed: 0.18, baseY: 0.52, amp: 0.10, freq: 1.4, seed: 11 },
  mid:  { color: '#a68f63', speed: 0.45, baseY: 0.40, amp: 0.14, freq: 2.3, seed: 27 },
  near: { color: '#6e5b38', speed: 1.00, baseY: 0.26, amp: 0.08, freq: 3.6, seed: 53 },
  ground: '#5c4a2e',
  groundAmp: 0.6,  // BUILD 286: 눈에 보이는 오르내림
  groundFreq: 0.5,
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
