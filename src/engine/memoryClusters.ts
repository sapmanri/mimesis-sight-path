export type MemoryClusterId = 'forgotten-street' | 'stopped-road' | 'strange-signal' | 'lost-vehicle';

export type MemoryClusterPartKind =
  | 'sign'
  | 'traffic-light'
  | 'payphone'
  | 'lamp'
  | 'road-blocker'
  | 'pipe'
  | 'car'
  | 'cabina'
  | 'warning-sign'
  | 'ufo'
  | 'tardis';

export type MemoryClusterPart = {
  kind: MemoryClusterPartKind;
  role: 'anchor' | 'secondary' | 'trace';
  offset: [number, number, number];
  rotationY: number;
  scale: number;
  opacity: number;
};

export type MemoryCluster = {
  id: MemoryClusterId;
  label: string;
  meaning: string;
  density: number;
  parts: MemoryClusterPart[];
  rules: string[];
};

export const memoryClusters: Record<MemoryClusterId, MemoryCluster> = {
  'forgotten-street': {
    id: 'forgotten-street',
    label: 'Forgotten Street',
    meaning: '도시였던 기억이 길가에 낮게 가라앉은 상태',
    density: 0.42,
    parts: [
      { kind: 'lamp', role: 'anchor', offset: [-1.34, -0.1, -10.2], rotationY: -0.25, scale: 0.52, opacity: 0.26 },
      { kind: 'sign', role: 'secondary', offset: [1.26, -0.32, -12.6], rotationY: 0.42, scale: 0.42, opacity: 0.22 },
      { kind: 'payphone', role: 'trace', offset: [-1.62, -0.54, -16.8], rotationY: -0.6, scale: 0.32, opacity: 0.18 },
      { kind: 'pipe', role: 'trace', offset: [1.48, -0.78, -18.4], rotationY: 0.8, scale: 0.38, opacity: 0.2 },
    ],
    rules: [
      '길 위가 아니라 길가와 단면 아래에 둔다.',
      '도시 소품은 선명하면 안 된다.',
      '하나의 장면처럼 묶되, 설명하지 않는다.',
    ],
  },
  'stopped-road': {
    id: 'stopped-road',
    label: 'Stopped Road',
    meaning: '어딘가에서 멈춘 길의 기억',
    density: 0.35,
    parts: [
      { kind: 'road-blocker', role: 'anchor', offset: [1.36, -0.5, -21.2], rotationY: 0.78, scale: 0.4, opacity: 0.24 },
      { kind: 'traffic-light', role: 'secondary', offset: [-1.5, -0.4, -24.4], rotationY: -0.4, scale: 0.38, opacity: 0.2 },
      { kind: 'warning-sign', role: 'trace', offset: [1.72, -0.68, -27.8], rotationY: 0.2, scale: 0.28, opacity: 0.16 },
    ],
    rules: [
      '막힌 길처럼 보이게 하지 않는다. 지나간 흔적처럼 보이게 한다.',
      '경고 표식은 의미만 남기고 읽히지 않게 한다.',
    ],
  },
  'strange-signal': {
    id: 'strange-signal',
    label: 'Strange Signal',
    meaning: '현실에서 이탈한 기억의 신호',
    density: 0.18,
    parts: [
      { kind: 'ufo', role: 'anchor', offset: [2.6, 1.8, -34.5], rotationY: 0.15, scale: 0.24, opacity: 0.14 },
      { kind: 'tardis', role: 'trace', offset: [-2.2, -0.6, -36.8], rotationY: -0.3, scale: 0.24, opacity: 0.14 },
    ],
    rules: [
      '기이한 오브젝트는 작고 멀어야 한다.',
      '세계관의 중심이 되지 않고 의문만 남긴다.',
    ],
  },
  'lost-vehicle': {
    id: 'lost-vehicle',
    label: 'Lost Vehicle',
    meaning: '이동하려 했지만 도착하지 못한 기억',
    density: 0.28,
    parts: [
      { kind: 'car', role: 'anchor', offset: [-1.72, -0.88, -30.4], rotationY: 0.62, scale: 0.34, opacity: 0.2 },
      { kind: 'cabina', role: 'secondary', offset: [1.86, -0.78, -32.8], rotationY: -0.48, scale: 0.28, opacity: 0.18 },
      { kind: 'pipe', role: 'trace', offset: [-1.42, -1.02, -35.2], rotationY: 1.1, scale: 0.32, opacity: 0.16 },
    ],
    rules: [
      '차량은 길 위를 막지 않는다.',
      '탈것은 이동의 상징이지 탈 수 있는 물건이 아니다.',
    ],
  },
};

export const activeMemoryClusterIds: MemoryClusterId[] = ['forgotten-street', 'stopped-road', 'strange-signal'];
