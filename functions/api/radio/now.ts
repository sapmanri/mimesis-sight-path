// 별리라됴 "지금 나가는 것" 창구 — GET /api/radio/now (공개)
// Liquidsoap의 실제 on-track 사건을 feeder가 Worker에 기록한다. 편성 시각이나
// HLS 재생목록을 추측하지 않고 실제 출력 엔진의 사실만 전달한다.

import { normalizeRadioNow, unavailableRadioNow } from './_now-state.ts';
import { cloudReplayNow, loadLatestCloudReplay, type CloudReplayEnv } from './_cloud-replay.ts';

const NOW_URL = 'https://byeol-radio-ingest-v2.byulsarang.workers.dev/now.json';

export const onRequestGet: PagesFunction<CloudReplayEnv> = async ({ env }) => {
  const unavailable = (reason: string) => new Response(
    JSON.stringify(unavailableRadioNow(reason)),
    {
      status: 503,
      headers: {
        'content-type': 'application/json; charset=utf-8',
        'cache-control': 'no-store, no-cache, must-revalidate',
      },
    },
  );
  const replayOrUnavailable = async (reason: string) => {
    try {
      const replay = await loadLatestCloudReplay(env);
      if (replay) {
        return new Response(JSON.stringify(cloudReplayNow(replay, reason)), {
          headers: {
            'content-type': 'application/json; charset=utf-8',
            'cache-control': 'no-store, no-cache, must-revalidate',
            'access-control-allow-origin': '*',
            'x-byeol-engine': 'cloud-replay',
          },
        });
      }
    } catch {
      return unavailable('cloud_replay_unavailable');
    }
    return unavailable(reason);
  };
  try {
    const response = await fetch(`${NOW_URL}?t=${Date.now()}`, {
      cf: { cacheTtl: 0, cacheEverything: false },
    } as RequestInit);
    if (!response.ok) return replayOrUnavailable(`upstream_${response.status}`);
    const current = normalizeRadioNow(await response.json());
    if (!current) return replayOrUnavailable('stale_or_invalid');
    return new Response(JSON.stringify(current), {
      headers: {
        'content-type': 'application/json; charset=utf-8',
        'cache-control': 'no-store, no-cache, must-revalidate',
        'access-control-allow-origin': '*',
        'x-byeol-engine': 'liquidsoap',
      },
    });
  } catch {
    return replayOrUnavailable('upstream_unreachable');
  }
};
