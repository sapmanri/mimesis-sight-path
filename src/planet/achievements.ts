// BUILD 242: 성과 — 타임라인의 사건들이 모여 하나의 이야기가 될 때.
// 삽만리 부제투로 이름 짓는다. 게임투 말고, 느린 삶의 훈장.
import type { TimelineEntry } from './timeline';

export type Achievement = {
  id: string;
  icon: string;
  title: string;     // "구름 수집가"
  desc: string;      // 조건 설명
  earnedText: string; // 달성 순간 피드에 남길 한 줄
};

export const ACHIEVEMENTS: Achievement[] = [
  { id: 'cloud10', icon: '☁️', title: '구름 수집가', desc: '하루에 구름·빗자루를 10번 탔다', earnedText: '오늘 하늘길을 열 번 걸었다' },
  { id: 'moon_cycle', icon: '🌗', title: '달의 목격자', desc: '그믐부터 보름까지 달의 모든 얼굴을 봤다', earnedText: '달이 차고 기우는 걸 처음부터 끝까지 지켜봤다' },
  { id: 'rain_walker', icon: '🌧', title: '비를 걷는 사람', desc: '비를 세 번 만났다', earnedText: '젖는 걸 두려워하지 않고 세 번의 비를 지났다' },
  { id: 'marathon', icon: '👣', title: '먼 길', desc: '하루에 10km를 걸었다', earnedText: '오늘, 십 리를 훌쩍 넘겨 걸었다' },
  { id: 'shooting3', icon: '🌠', title: '소원을 세 번', desc: '별똥별을 세 번 봤다', earnedText: '별똥별에 세 번 소원을 빌었다' },
  { id: 'globetrotter', icon: '🗺', title: '세계의 산책자', desc: '다섯 나라를 지났다', earnedText: '지도 위 다섯 곳에 발자국을 남겼다' },
  { id: 'gull_friend', icon: '🕊', title: '해안의 친구', desc: '갈매기를 만났다', earnedText: '파도가 부른 자리에서 갈매기와 나란히 걸었다' },
  { id: 'night_owl', icon: '🌙', title: '밤을 걷는 이', desc: '밤을 세 번 맞았다', earnedText: '세 번의 밤을 온전히 걸어서 지났다' },
  { id: 'sky_watcher', icon: '✈️', title: '하늘을 올려다본 사람', desc: '비행기를 다섯 번 봤다', earnedText: '지나가는 비행기를 다섯 번 눈으로 좇았다' },
  { id: 'harbor_soul', icon: '⛵', title: '항구의 마음', desc: '배를 다섯 번 봤다', earnedText: '수평선을 지나는 배를 다섯 번 배웅했다' },
  { id: 'comet_witness', icon: '☄️', title: '혜성을 본 밤', desc: '혜성을 목격했다 (드문 일)', earnedText: '긴 꼬리를 끄는 혜성을 두 눈으로 봤다 — 흔치 않은 밤' },
];

// 타임라인 전체를 보고 '지금 달성된' 성과 id들을 판정
export function evaluateAchievements(timeline: TimelineEntry[]): Set<string> {
  const count = (kind: string) => timeline.filter((e) => e.kind === kind).length;
  const earned = new Set<string>();
  if (timeline.filter((e) => e.kind === 'ride_start').length >= 10) earned.add('cloud10');
  if (count('rain_in') >= 3) earned.add('rain_walker');
  if (count('shooting_star') >= 3) earned.add('shooting3');
  if (count('gull') >= 1) earned.add('gull_friend');
  if (count('nightfall') >= 3) earned.add('night_owl');
  if (count('plane') >= 5) earned.add('sky_watcher');
  if (count('ship') >= 5) earned.add('harbor_soul');
  if (count('comet') >= 1) earned.add('comet_witness');
  // 걸음: distance 이정표의 최대 km
  const maxKm = timeline.filter((e) => e.kind === 'distance').reduce((m, e) => {
    const km = Number(/(\d+)km/.exec(e.text)?.[1] ?? 0);
    return Math.max(m, km);
  }, 0);
  if (maxKm >= 10) earned.add('marathon');
  // 나라: flag 고유 개수
  const countries = new Set(timeline.filter((e) => e.kind === 'flag').map((e) => e.text));
  if (countries.size >= 5) earned.add('globetrotter');
  // 달 위상 사이클: waxing→full→waning→new 네 위상을 모두 봤나
  const phases = new Set(timeline.filter((e) => e.kind === 'moon_phase').map((e) => e.text));
  if (phases.size >= 3) earned.add('moon_cycle');
  return earned;
}
