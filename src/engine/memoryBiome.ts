export type MemoryBiomeId = 'forgotten-village' | 'private-room' | 'winter-memory' | 'floating-cliff' | 'lighthouse-island';

export type MemoryFragmentKind =
  | 'house'
  | 'room'
  | 'bedroom'
  | 'bathroom'
  | 'plant'
  | 'coffee'
  | 'lighthouse'
  | 'terrain'
  | 'wood'
  | 'shelter'
  | 'moon'
  | 'asteroid';

export type MemoryBiome = {
  id: MemoryBiomeId;
  label: string;
  density: number;
  atmosphere: 'soft' | 'cold' | 'distant' | 'eroded' | 'domestic';
  palette: {
    ground: string;
    structure: string;
    accent: string;
    haze: string;
  };
  fragmentWeights: Partial<Record<MemoryFragmentKind, number>>;
  rules: string[];
};

export const memoryBiomes: Record<MemoryBiomeId, MemoryBiome> = {
  'forgotten-village': {
    id: 'forgotten-village',
    label: 'Forgotten Village',
    density: 0.72,
    atmosphere: 'eroded',
    palette: {
      ground: '#9d8f69',
      structure: '#7f806c',
      accent: '#b6a37b',
      haze: '#d9d2bd',
    },
    fragmentWeights: {
      house: 10,
      shelter: 6,
      wood: 7,
      terrain: 5,
      plant: 3,
    },
    rules: [
      '집은 완성된 집보다 지붕과 벽 일부로 등장한다.',
      '길 양옆 단면에 마을이 침식된 듯 매몰된다.',
      '오브젝트는 길보다 먼저 눈에 띄지 않는다.',
    ],
  },
  'private-room': {
    id: 'private-room',
    label: 'Private Room',
    density: 0.66,
    atmosphere: 'domestic',
    palette: {
      ground: '#a99b77',
      structure: '#8f866d',
      accent: '#b9a980',
      haze: '#ded7c5',
    },
    fragmentWeights: {
      room: 10,
      bedroom: 9,
      bathroom: 5,
      plant: 6,
      coffee: 7,
      wood: 4,
    },
    rules: [
      '방은 풍경보다 개인적인 기억이다.',
      '방은 절벽 속, 길 아래, 공중에 잘린 단면으로 등장한다.',
      '사람은 없고 사용 흔적만 남긴다.',
    ],
  },
  'winter-memory': {
    id: 'winter-memory',
    label: 'Winter Memory',
    density: 0.52,
    atmosphere: 'cold',
    palette: {
      ground: '#c6c1aa',
      structure: '#b7b69f',
      accent: '#ddd8c7',
      haze: '#e6e1d4',
    },
    fragmentWeights: {
      house: 6,
      moon: 8,
      terrain: 6,
      asteroid: 3,
    },
    rules: [
      '겨울 기억은 적은 수의 오브젝트와 넓은 빈 공간으로 만든다.',
      '집은 멀고 낮게 보이며, 밝지만 따뜻하지 않다.',
    ],
  },
  'floating-cliff': {
    id: 'floating-cliff',
    label: 'Floating Cliff',
    density: 0.48,
    atmosphere: 'distant',
    palette: {
      ground: '#92886d',
      structure: '#717d6f',
      accent: '#9b9279',
      haze: '#c9c8b8',
    },
    fragmentWeights: {
      terrain: 10,
      asteroid: 8,
      wood: 3,
      shelter: 2,
    },
    rules: [
      '절벽과 떠다니는 지형이 주인공이다.',
      '집과 방은 거의 등장하지 않는다.',
      '멀리 갈수록 형태는 단순한 실루엣이 된다.',
    ],
  },
  'lighthouse-island': {
    id: 'lighthouse-island',
    label: 'Lighthouse Island',
    density: 0.42,
    atmosphere: 'soft',
    palette: {
      ground: '#9c9272',
      structure: '#d8cfb8',
      accent: '#e7dfc8',
      haze: '#cfd8cc',
    },
    fragmentWeights: {
      lighthouse: 10,
      terrain: 7,
      coffee: 3,
      plant: 2,
    },
    rules: [
      '등대는 첫 번째 랜드마크 후보지만 너무 빨리 크게 보이면 안 된다.',
      '목적지가 아니라 기억 저편의 작은 신호처럼 보여야 한다.',
    ],
  },
};

export const activeMemoryBiome: MemoryBiome = memoryBiomes['private-room'];
