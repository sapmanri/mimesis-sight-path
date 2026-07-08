// BUILD 242: 가상의 스레드 — 나를 주인공으로 도는 피드. AI 호출 없이 페르소나 대본으로.
// 계정 이름은 삽만리 세계의 주민들. 성과 종류마다 말투가 다른 댓글 풀.

export type Persona = { handle: string; name: string; avatar: string };

export const PERSONAS: Persona[] = [
  { handle: '@cloud_collector', name: '구름수집가', avatar: '☁️' },
  { handle: '@moonrabbit_fc', name: '달토끼팬클럽', avatar: '🐰' },
  { handle: '@slow_walker', name: '느린산책자', avatar: '🌿' },
  { handle: '@dawn_keeper', name: '새벽등대지기', avatar: '🌅' },
  { handle: '@pressed_flowers', name: '마른꽃갈피', avatar: '🌾' },
  { handle: '@film_grain_', name: '필름입자', avatar: '🎞' },
  { handle: '@midnight_tea', name: '자정의홍차', avatar: '🫖' },
  { handle: '@paper_boat_', name: '종이배', avatar: '🛶' },
  { handle: '@cloud_runway', name: '구름활주로', avatar: '🛫' },
  { handle: '@tide_letters', name: '밀물의편지', avatar: '🌊' },
];

// 성과 종류별 댓글 풀 — 페르소나 말투를 섞어 쓴다
const COMMENT_POOL: Record<string, string[]> = {
  cloud10: ['열 번이나… 하늘이 길이 되어주네요', '구름 발자국이 부럽습니다', '오늘 하늘 붐볐겠어요 ☁️'],
  moon_cycle: ['달의 처음과 끝을 다 봤다니', '차오르고 기우는 걸 지켜보는 마음, 알 것 같아요', '보름까지 놓치지 않으셨네요 🌕'],
  rain_walker: ['비를 피하지 않는 사람이 좋아요', '젖은 어깨가 보이는 듯', '우산 없이도 괜찮은 날이 있죠 🌧'],
  marathon: ['십 리라니, 다리 안 아프세요?', '그 길 위의 풍경이 궁금해요', '먼 길 걸은 발에게 박수 👏'],
  shooting3: ['소원 세 개, 뭐 비셨어요?', '별똥별을 세 번이나… 운이 좋으시네', '밤하늘을 오래 올려다본 사람만 아는 것'],
  globetrotter: ['세계 지도에 발도장 다섯 개', '다음은 어느 나라예요?', '작은 행성에서 세계일주 🗺'],
  gull_friend: ['끼룩— 소리가 여기까지 들려요', '갈매기랑 나란히 걷다니 멋져요', '바다 냄새가 날 것 같아요 🕊'],
  night_owl: ['세 번의 밤을 걸었군요', '밤을 무서워하지 않는 사람', '어둠 속에서도 걷는 걸 멈추지 않았네요 🌙'],
  sky_watcher: ['비행기 소리 들리면 꼭 올려다보게 되죠', '저 위엔 누가 타고 있을까요', '하늘길도 길이니까요 ✈️'],
  harbor_soul: ['떠나는 배를 보면 마음이 이상해져요', '수평선 너머가 궁금하네요', '무사히 닿기를 ⛵'],
};

const GENERIC = ['좋다…', '오늘도 느리게 🌿', '이 장면 저장했어요', '부럽습니다', '평화롭네요', '잘 지내고 계시죠?'];

let seed = 917;
const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
const pick = <T,>(a: T[]) => a[Math.floor(rnd() * a.length)];

export type FeedComment = { persona: Persona; text: string };

export function makeComments(achId: string, n = 2): FeedComment[] {
  const pool = COMMENT_POOL[achId] ?? GENERIC;
  const usedP = new Set<string>();
  const usedT = new Set<string>();
  const out: FeedComment[] = [];
  let guard = 0;
  while (out.length < n && guard++ < 30) {
    const p = pick(PERSONAS);
    if (usedP.has(p.handle)) continue;
    const text = rnd() < 0.7 ? pick(pool) : pick(GENERIC);
    if (usedT.has(text)) continue;
    usedP.add(p.handle);
    usedT.add(text);
    out.push({ persona: p, text });
  }
  return out;
}

export function makeLikes(): number {
  return 3 + Math.floor(rnd() * 40);
}
