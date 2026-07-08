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
    case 'shooting_star':
      return { id, icon: '🌠', text: '별똥별이 스쳤다', t: e.t, kind: e.kind };
    default:
      return null;
  }
}
