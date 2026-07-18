// 429-B 평가 세트 — 30개 관찰 사건. 좋은 것만 고르지 않기 위해 사건을 먼저 고정한다.
// 슬롯·mood·날씨·상황(rare/passed/first/trace)·조회층(1층 주역/2층 카테고리/3층 무대상)을 고루 덮는다.
export const EVENTS = [
  // ── morning (dawn) ───────────────────────────────────────────────
  { id: 1, slot: 'morning', weather: 'clear', mood: 'observe', targetType: 'dandelion', targetName: '홀씨', cat: 'nature', layer: 1, state: 'normal' },
  { id: 2, slot: 'morning', weather: 'clear', mood: 'photo', targetType: 'puddle', targetName: '웅덩이', cat: 'nature', layer: 1, state: 'normal' },
  { id: 3, slot: 'morning', weather: 'rain', mood: 'rest', targetType: 'bench', targetName: '벤치', cat: 'rest', layer: 1, state: 'normal' },
  { id: 4, slot: 'morning', weather: 'rain', mood: 'observe', targetType: 'leaves', targetName: '낙엽', cat: 'nature', layer: 1, state: 'first' },
  { id: 5, slot: 'morning', weather: 'clear', mood: 'wonder', targetType: 'mailbox', targetName: '우편함', cat: 'thing', layer: 2, state: 'normal' },
  { id: 6, slot: 'morning', weather: 'cloudy', mood: 'observe', targetType: 'bench', targetName: '벤치', cat: 'rest', layer: 1, state: 'trace-warm' },
  { id: 7, slot: 'morning', weather: 'clear', mood: 'observe', targetType: null, targetName: null, cat: null, layer: 3, state: 'habit-sky' },

  // ── afternoon (day) ──────────────────────────────────────────────
  { id: 8, slot: 'afternoon', weather: 'clear', mood: 'observe', targetType: 'oldtree', targetName: '큰나무', cat: 'nature', layer: 1, state: 'normal' },
  { id: 9, slot: 'afternoon', weather: 'clear', mood: 'rest', targetType: 'oldtree', targetName: '큰나무', cat: 'nature', layer: 1, state: 'normal' },
  { id: 10, slot: 'afternoon', weather: 'clear', mood: 'photo', targetType: 'streetcat', targetName: '길고양이', cat: 'animal', layer: 1, state: 'normal' },
  { id: 11, slot: 'afternoon', weather: 'cloudy', mood: 'observe', targetType: 'stone', targetName: '돌멩이', cat: 'nature', layer: 1, state: 'trace-moved' },
  { id: 12, slot: 'afternoon', weather: 'clear', mood: 'wonder', targetType: 'streetcat', targetName: '길고양이', cat: 'animal', layer: 1, state: 'rare' },
  { id: 13, slot: 'afternoon', weather: 'rain', mood: 'observe', targetType: 'puddle', targetName: '웅덩이', cat: 'nature', layer: 1, state: 'normal' },
  { id: 14, slot: 'afternoon', weather: 'clear', mood: 'observe', targetType: 'jangdok', targetName: '장독대', cat: 'thing', layer: 2, state: 'passed' },
  { id: 15, slot: 'afternoon', weather: 'clear', mood: 'rest', targetType: 'wall', targetName: '담장', cat: 'rest', layer: 1, state: 'normal' },
  { id: 16, slot: 'afternoon', weather: 'cloudy', mood: 'wonder', targetType: 'sparrow', targetName: '참새', cat: 'animal', layer: 2, state: 'first' },

  // ── sunset (dusk) ────────────────────────────────────────────────
  { id: 17, slot: 'sunset', weather: 'clear', mood: 'observe', targetType: 'dandelion', targetName: '홀씨', cat: 'nature', layer: 1, state: 'normal' },
  { id: 18, slot: 'sunset', weather: 'clear', mood: 'photo', targetType: 'oldtree', targetName: '큰나무', cat: 'nature', layer: 1, state: 'normal' },
  { id: 19, slot: 'sunset', weather: 'cloudy', mood: 'rest', targetType: 'bench', targetName: '벤치', cat: 'rest', layer: 1, state: 'normal' },
  { id: 20, slot: 'sunset', weather: 'clear', mood: 'observe', targetType: 'wall', targetName: '담장', cat: 'rest', layer: 1, state: 'trace-warm' },
  { id: 21, slot: 'sunset', weather: 'rain', mood: 'observe', targetType: 'leaves', targetName: '낙엽', cat: 'nature', layer: 1, state: 'normal' },
  { id: 22, slot: 'sunset', weather: 'clear', mood: 'wonder', targetType: 'chimney-smoke', targetName: '굴뚝 연기', cat: 'thing', layer: 2, state: 'rare' },
  { id: 23, slot: 'sunset', weather: 'clear', mood: 'observe', targetType: null, targetName: null, cat: null, layer: 3, state: 'habit-stand' },
  { id: 24, slot: 'sunset', weather: 'cloudy', mood: 'photo', targetType: 'stone', targetName: '돌멩이', cat: 'nature', layer: 1, state: 'passed' },

  // ── night ────────────────────────────────────────────────────────
  { id: 25, slot: 'night', weather: 'clear', mood: 'observe', targetType: 'streetcat', targetName: '길고양이', cat: 'animal', layer: 1, state: 'normal' },
  { id: 26, slot: 'night', weather: 'clear', mood: 'rest', targetType: 'bench', targetName: '벤치', cat: 'rest', layer: 1, state: 'normal' },
  { id: 27, slot: 'night', weather: 'rain', mood: 'observe', targetType: 'puddle', targetName: '웅덩이', cat: 'nature', layer: 1, state: 'trace-moved' },
  { id: 28, slot: 'night', weather: 'clear', mood: 'wonder', targetType: 'nightwindow', targetName: '불 켜진 창', cat: 'thing', layer: 2, state: 'normal' },
  { id: 29, slot: 'night', weather: 'cloudy', mood: 'observe', targetType: 'dandelion', targetName: '홀씨', cat: 'nature', layer: 1, state: 'first' },
  { id: 30, slot: 'night', weather: 'clear', mood: 'photo', targetType: 'oldtree', targetName: '큰나무', cat: 'nature', layer: 1, state: 'rare' },
];

export const SLOT_PHASE = { morning: 'dawn', afternoon: 'day', sunset: 'dusk', night: 'night' };
export const SLOT_KO = { morning: '아침', afternoon: '낮', sunset: '노을', night: '밤' };
export const WEATHER_KO = { clear: '맑음', cloudy: '흐림', rain: '비', snow: '눈' };
export const STATE_KO = {
  normal: '평범한 만남', first: '오늘 처음 본 것', rare: '희귀한 순간', passed: '멈추지 않고 지나침',
  'trace-warm': '누군가 앉았던 온기가 남은 자리', 'trace-moved': '자리가 조금 달라져 있음',
  'habit-sky': '대상 없이 하늘을 봄', 'habit-stand': '대상 없이 그냥 서 있음',
};
