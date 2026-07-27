// 재생목록 담기 계약 테스트 — 망 없이, 가짜 fetch로
import { test } from 'node:test';
import assert from 'node:assert/strict';

const OAUTH = {
  YOUTUBE_OAUTH_CLIENT_ID: 'id',
  YOUTUBE_OAUTH_CLIENT_SECRET: 'secret',
  YOUTUBE_OAUTH_REFRESH_TOKEN: 'refresh',
};

const track = (videoId: string, title: string) => ({ videoId, title, artist: 'A' });
const TRACKS = [track('v1', '중심곡'), track('v2', '주변1'), track('v3', '주변2')];

/** 부른 주소를 전부 기록한다. 응답은 주소 모양으로 갈라준다. */
function fakeYT(opts: {
  token?: Record<string, unknown> | { httpStatus: number; body: Record<string, unknown> };
  playlist?: Record<string, unknown> | { httpStatus: number; body: Record<string, unknown> };
  /** videoId → 실패 사유 */
  itemFails?: Record<string, string>;
} = {}) {
  const calls: Array<{ url: string; body: unknown }> = [];
  const _fetch = async (url: string, init: unknown) => {
    const raw = (init as { body: string }).body;
    const body = url.includes('oauth2') ? raw : JSON.parse(raw);
    calls.push({ url, body });

    const reply = (r: unknown) => {
      const e = r as { httpStatus?: number; body?: Record<string, unknown> };
      if (typeof e?.httpStatus === 'number') {
        return { ok: false, status: e.httpStatus, json: async () => e.body ?? {} };
      }
      return { ok: true, status: 200, json: async () => r as Record<string, unknown> };
    };

    if (url.includes('oauth2')) return reply(opts.token ?? { access_token: 'at-123' });
    if (url.includes('/playlists?')) return reply(opts.playlist ?? { id: 'PL_today' });

    const vid = (body as { snippet: { resourceId: { videoId: string } } }).snippet.resourceId.videoId;
    const fail = opts.itemFails?.[vid];
    if (fail) {
      return { ok: false, status: 404, json: async () => ({ error: { errors: [{ reason: fail }] } }) };
    }
    return { ok: true, status: 200, json: async () => ({ id: `item_${vid}` }) };
  };
  return { calls, env: { ...OAUTH, _fetch } };
}

const itemCalls = (calls: Array<{ url: string }>) => calls.filter((c) => c.url.includes('/playlistItems'));

// ── 시험 ─────────────────────────────────────────────────────────────────────

test('재생목록 이름은 날짜와 그날의 장면', async () => {
  const { playlistTitle, playlistUrl } = await import('./_shelf-playlist.ts');
  assert.equal(playlistTitle('2026-07-27', '누군가 앉았던 빈 의자'), '2026-07-27 — 누군가 앉았던 빈 의자');
  assert.equal(playlistTitle('2026-07-27', null), '2026-07-27', '장면이 없으면 날짜만');
  assert.equal(playlistUrl('PL_x'), 'https://www.youtube.com/playlist?list=PL_x');
});

test('승인이 없으면 아무것도 부르지 않는다', async () => {
  const { publishDayPlaylist } = await import('./_shelf-playlist.ts');
  const calls: unknown[] = [];
  const env = { _fetch: async (u: string) => { calls.push(u); return { ok: true, status: 200, json: async () => ({}) }; } };

  const r = await publishDayPlaylist(env as never, { date: '2026-07-27', centralImage: null, tracks: TRACKS });
  assert.equal(r.error, 'oauth_not_configured');
  assert.equal(calls.length, 0, '키가 없으면 망을 건드리지 않는다');
  assert.equal(r.cost, 0);
});

test('⚠ invalid_grant는 큰 소리로 말한다 — 사람이 다시 승인해야 풀린다', async () => {
  const { getAccessToken, publishDayPlaylist } = await import('./_shelf-playlist.ts');

  const dead = { token: { httpStatus: 400, body: { error: 'invalid_grant' } } };
  assert.deepEqual(await getAccessToken(fakeYT(dead).env as never), { token: null, error: 'token_invalid_grant' });

  // 승인이 죽었으면 재생목록을 만들지 않는다 — 반쯤 만들어두고 실패하지 않는다
  const bad = fakeYT(dead);
  const r = await publishDayPlaylist(bad.env as never, { date: '2026-07-27', centralImage: null, tracks: TRACKS });
  assert.equal(r.error, 'token_invalid_grant');
  assert.equal(r.playlistId, null);
  assert.equal(bad.calls.length, 1, '토큰 요청 한 번에서 멈춘다');
});

test('곡이 없으면 빈 재생목록을 만들지 않는다', async () => {
  const { publishDayPlaylist } = await import('./_shelf-playlist.ts');
  const yt = fakeYT();
  const r = await publishDayPlaylist(yt.env as never, { date: '2026-07-27', centralImage: null, tracks: [] });

  assert.equal(r.error, 'no_tracks');
  assert.equal(yt.calls.length, 0,
    '⚠ 빈 목록을 만들면 "오늘도 돌긴 돌았다"는 거짓 신호가 남는다 — 쉬는 날은 쉬는 날로 보여야 한다');
});

test('⚠ 넣은 순서를 지킨다 — 중심곡이 첫 곡이다', async () => {
  const { publishDayPlaylist } = await import('./_shelf-playlist.ts');
  const yt = fakeYT();
  const r = await publishDayPlaylist(yt.env as never, {
    date: '2026-07-27', centralImage: '누군가 앉았던 빈 의자', tracks: TRACKS, privacy: 'unlisted',
  });

  assert.equal(r.error, null);
  assert.equal(r.url, 'https://www.youtube.com/playlist?list=PL_today');
  assert.deepEqual(r.added.map((t) => t.videoId), ['v1', 'v2', 'v3']);

  const ids = itemCalls(yt.calls).map((c) => (c.body as { snippet: { resourceId: { videoId: string } } }).snippet.resourceId.videoId);
  assert.deepEqual(ids, ['v1', 'v2', 'v3'],
    '병렬로 던지면 순서가 뒤섞여 중심곡이 가운데로 밀린다');

  const made = yt.calls.find((c) => c.url.includes('/playlists?'))!.body as
    { snippet: { title: string }; status: { privacyStatus: string } };
  assert.equal(made.snippet.title, '2026-07-27 — 누군가 앉았던 빈 의자');
  assert.equal(made.status.privacyStatus, 'unlisted');
});

test('한 곡이 실패해도 나머지는 담는다 — 사유를 들고', async () => {
  const { publishDayPlaylist } = await import('./_shelf-playlist.ts');
  const yt = fakeYT({ itemFails: { v2: 'videoNotFound' } });
  const r = await publishDayPlaylist(yt.env as never, { date: '2026-07-27', centralImage: null, tracks: TRACKS });

  assert.deepEqual(r.added.map((t) => t.videoId), ['v1', 'v3'], '하나 때문에 하루를 버리지 않는다');
  assert.deepEqual(r.failed, [{ track: TRACKS[1], error: 'videoNotFound' }],
    '⚠ 구글이 준 reason을 그대로 들고 온다 — 상태 코드보다 이게 쓸모 있다');
  assert.equal(r.error, null, '부분 실패는 하루 실패가 아니다');
  assert.equal(itemCalls(yt.calls).length, 3, '실패한 곡을 재시도하지 않는다 — 유닛이 아깝다');
});

test('재생목록을 못 만들면 곡을 담지 않는다', async () => {
  const { publishDayPlaylist } = await import('./_shelf-playlist.ts');
  const yt = fakeYT({ playlist: { httpStatus: 403, body: { error: { errors: [{ reason: 'quotaExceeded' }] } } } });
  const r = await publishDayPlaylist(yt.env as never, { date: '2026-07-27', centralImage: null, tracks: TRACKS });

  assert.equal(r.error, 'quotaExceeded');
  assert.equal(itemCalls(yt.calls).length, 0, '담을 곳이 없는데 담으려 하지 않는다');
  assert.equal(r.cost, 50, '쓴 만큼만 센다');
});

test('유닛을 정직하게 센다 — 담기가 확인보다 훨씬 비싸다', async () => {
  const { publishDayPlaylist } = await import('./_shelf-playlist.ts');
  const yt = fakeYT();
  const r = await publishDayPlaylist(yt.env as never, { date: '2026-07-27', centralImage: null, tracks: TRACKS });
  assert.equal(r.cost, 50 + 3 * 50, '재생목록 50 + 곡마다 50 (하루 한도 10,000)');
});

test('어느 채널에 묶였는지 확인한다', async () => {
  const { getMyChannel } = await import('./_shelf-playlist.ts');
  const seen: string[] = [];
  const env = {
    _fetch: async (u: string, i: unknown) => {
      seen.push(`${(i as { method: string }).method} ${u}`);
      return { ok: true, status: 200, json: async () => ({ items: [{ id: 'UC_x', snippet: { title: 'vase Lim' } }] }) };
    },
  };
  assert.deepEqual(await getMyChannel(env as never, 'at'), { id: 'UC_x', title: 'vase Lim', error: null });
  assert.ok(seen[0].startsWith('GET '), '읽기다 — 본문을 보내지 않는다');

  const none = { _fetch: async () => ({ ok: true, status: 200, json: async () => ({ items: [] }) }) };
  assert.equal((await getMyChannel(none as never, 'at')).error, 'no_channel',
    '채널이 없으면 없다고 한다 — 빈 이름으로 넘어가지 않는다');
});

test('⚠ 삭제는 204에 본문이 없다 — json()을 부르면 성공한 자리에서 터진다', async () => {
  const { deletePlaylist } = await import('./_shelf-playlist.ts');
  const env = {
    _fetch: async () => ({
      ok: true, status: 204,
      json: async () => { throw new Error('Unexpected end of JSON input'); },
    }),
  };
  assert.deepEqual(await deletePlaylist(env as never, 'at', 'PL_x'), { ok: true, error: null });
});

test('access token을 헤더로 들고 간다', async () => {
  const { createPlaylist } = await import('./_shelf-playlist.ts');
  const seen: unknown[] = [];
  const env = {
    _fetch: async (_u: string, i: unknown) => {
      seen.push((i as { headers: Record<string, string> }).headers.authorization);
      return { ok: true, status: 200, json: async () => ({ id: 'PL_x' }) };
    },
  };
  await createPlaylist(env as never, 'at-123', 't', 'd', 'public');
  assert.deepEqual(seen, ['Bearer at-123']);
});
