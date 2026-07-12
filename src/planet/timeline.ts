// BUILD 241: 사건을 일기의 한 줄로 — 삽만리의 말투로.
import type { PlanetEvent } from '../scene/planetEvents';

export type TimelineEntry = { id: string; icon: string; text: string; t: number; kind: string };

const RIDE_NAME: Record<string, string> = { cloud: '구름', broom: '빗자루' };

export function eventToEntry(e: PlanetEvent): TimelineEntry | null {
  const id = `${e.kind}-${Math.round(e.t)}`;
  switch (e.kind) {
    case 'flag':
      return { id, icon: '🚩', text: `${e.data?.country}을(를) 지났다`, t: e.t, kind: e.kind };
    case 'ride_start':
      return { id, icon: e.data?.kind === 'broom' ? '🧹' : '☁️', text: `${RIDE_NAME[e.data?.kind ?? 'cloud']}을(를) 타고 떠올랐다`, t: e.t, kind: e.kind };
    case 'ride_end':
      return { id, icon: '🛬', text: `${RIDE_NAME[e.data?.kind ?? 'cloud']}을(를) 타고 ${e.data?.meters ?? 0}m를 날았다`, t: e.t, kind: e.kind };
    case 'rain_in':
      return { id, icon: '🌧', text: '소나기를 만났다', t: e.t, kind: e.kind };
    case 'rain_out':
      return { id, icon: '🌤', text: `${e.data?.seconds ?? 0}초간 비를 맞으며 걸었다`, t: e.t, kind: e.kind };
    case 'snow_in':
      return { id, icon: '🌨', text: '첫눈을 만났다', t: e.t, kind: e.kind };
    case 'moon_phase': {
      const p = e.data?.phase;
      const label = p === 'new' ? '그믐달이 숨었다' : p === 'full' ? '보름달이 떴다' : p === 'waxing' ? '초승달이 차오른다' : '하현달이 기운다';
      return { id, icon: '🌙', text: label, t: e.t, kind: e.kind };
    }
    case 'gull':
      return { id, icon: '🕊', text: '해안에서 갈매기를 만났다', t: e.t, kind: e.kind };
    case 'distance':
      return { id, icon: '👣', text: `${e.data?.km}km를 걸었다`, t: e.t, kind: e.kind };
    case 'nightfall':
      return { id, icon: '🌆', text: '밤이 내렸다', t: e.t, kind: e.kind };
    case 'daybreak':
      return { id, icon: '🌅', text: '날이 밝았다', t: e.t, kind: e.kind };
    case 'plane':
      return { id, icon: '✈️', text: '비행기 한 대가 하늘을 가로질렀다', t: e.t, kind: e.kind };
    case 'ship':
      return { id, icon: '⛵', text: '배 한 척이 수평선을 지났다', t: e.t, kind: e.kind };
    case 'shooting_star':
      return { id, icon: '🌠', text: '별똥별이 스쳤다', t: e.t, kind: e.kind };
    case 'comet':
      return { id, icon: '☄️', text: '혜성이 긴 꼬리를 끌며 지나갔다', t: e.t, kind: e.kind };
    // BUILD 329: 동네 이벤트 — 삽만리의 말투로.
    case 'theatre_arrive': {
      const v = e.data?.village;
      const name = v === 'train' ? '기차 동네' : (v ?? '어느 동네');
      return { id, icon: '🏘', text: `${name}의 밤을 걷다`, t: e.t, kind: e.kind };
    }
    case 'stage_play': {
      const s = e.data?.stage;
      const label = s === 'piano' ? '가만히 건반을 눌러 보았다'
        : s === 'sleep' ? '길가에 누워 잠시 눈을 감았다'
        : s === 'workout' ? '괜히 몸을 움직여 보았다'
        : s === 'dance' ? '아무도 없는 밤, 혼자 춤췄다'
        : s === 'treadmill' ? '제자리에서 한참을 달렸다'
        : '문득 걸음을 멈추고 딴짓을 했다';
      const icon = s === 'piano' ? '🎹' : s === 'sleep' ? '💤' : s === 'workout' ? '💪' : s === 'dance' ? '💃' : s === 'treadmill' ? '🏃' : '✨';
      return { id, icon, text: label, t: e.t, kind: `${e.kind}_${s ?? 'x'}` }; // kind에 stage 포함 → 연타방지가 종류별로
    }
    // BUILD 360: 지역(본토) 이벤트 — 삽만리의 말투로.
    case 'region_arrive': {
      const m = e.data?.memory;
      return { id, icon: '📖', text: m ? `‘${m}’ 앞에 오래 머물렀다` : '어느 기억 앞에 오래 머물렀다', t: e.t, kind: e.kind };
    }
    case 'mail': {
      const m = e.data?.memory;
      return { id, icon: '✉️', text: m ? `우체통에서 편지를 받았다 — ‘${m}’` : '우체통에서 편지 한 통을 받았다', t: e.t, kind: e.kind };
    }
    case 'campfire':
      return { id, icon: '🔥', text: '모닥불 앞에 앉아 잠시 쉬어갔다', t: e.t, kind: e.kind };
    case 'interaction': {
      const label = e.data?.label ?? e.data?.object ?? '무언가';
      const phase = e.data?.interactionPhase ?? 'start';
      return { id, icon: '🌱', text: phase === 'start' ? `별이는 ${label} 앞에 멈춰 섰다` : `별이는 ${label} 곁에서 다시 길을 나섰다`, t: e.t, kind: `${e.kind}_${e.data?.objectId ?? label}_${phase}` };
    }
    default:
      return null;
  }
}
