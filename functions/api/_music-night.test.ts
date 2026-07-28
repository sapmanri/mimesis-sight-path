// 밤 배선 계약 테스트 — 망 없이, 주소로 갈라주는 가짜 fetch 하나로 전 구간
import { test } from 'node:test';
import assert from 'node:assert/strict';

const DATE = '2026-07-27';
const NOW = 1785000000000;

const dayMemory = (lines: string[], targetLabel: string | null = '누군가 앉았던 빈 의자') => ({
  version: '431M-v1', memoryEventId: 'ev1', sourceCaptureIds: ['c1'], date: DATE, builtAt: NOW,
  momentCount: lines.length, photoKey: null, density: 'normal',
  event: { lines, targetLabel, momentAt: NOW },
});

const LINES = ['🪑 오래된 나무 의자에 앉음', '🐈 빼콩이를 기다렸지만 만나지 못함', '☁️ 흐린 아침에 책을 조금 읽음'];
const URL_READ = 'https://pitchfork.example/review/1';

/** 아주 작은 KV */
function fakeKV(seed: Record<string, string> = {}) {
  const store = new Map(Object.entries(seed));
  return {
    store,
    kv: {
      get: async (k: string) => store.get(k) ?? null,
      put: async (k: string, v: string) => { store.set(k, v); },
    },
  };
}

const claudeMsg = (content: unknown[], stop = 'end_turn') => ({ content, stop_reason: stop });
const txt = (t: string) => ({ type: 'text', text: t });
const searchRes = (...urls: string[]) =>
  ({ type: 'web_search_tool_result', content: urls.map((url) => ({ type: 'web_search_result', url, title: 't' })) });
const fetchRes = (url: string) =>
  ({ type: 'web_fetch_tool_result', content: { type: 'web_fetch_result', url, content: { type: 'document' } } });

const PICKS = (n = 2) => ({
  picks: [
    { title: '중심곡', artist: 'A', verdict: 'chosen', role: 'center', fromLine: 1,
      because: '빼콩이를 만나지 못한 오늘과 닮았다', sources: [URL_READ], themes: ['기다림'] },
    ...(n > 1 ? [{ title: '주변곡', artist: 'B', verdict: 'chosen', role: 'around', fromLine: 0,
      because: '나무 의자와 닮았다', sources: [URL_READ] }] : []),
    { title: '밝은곡', artist: 'C', verdict: 'rejected', fromLine: 2,
      because: '오늘보다 지나치게 밝다', sources: [URL_READ] },
  ],
});

/** 주소로 갈라주는 가짜 하나가 전 구간(클로드·유튜브·OAuth·재생목록)을 대신한다 */
function fakeWorld(opts: {
  picks?: unknown;
  /** 이 제목들은 서가에서 못 찾은 것으로 처리한다 */
  notOnShelf?: string[];
  playlistFails?: boolean;
} = {}) {
  const calls: string[] = [];
  const itemsAdded: string[] = [];

  const _fetch = async (url: string, init?: unknown) => {
    calls.push(url);
    const body = init && (init as { body?: string }).body;
    const ok = (j: unknown) => ({ ok: true, status: 200, json: async () => j });

    if (url.includes('api.anthropic.com')) {
      const sent = JSON.parse(body as string) as { tools?: unknown[] };
      // 도구가 붙어 있으면 조사 단계, 없으면 검색어 단계
      if (!sent.tools) return ok(claudeMsg([txt('{"queries":[{"query":"quiet folk songs about an empty chair","fromLine":0}]}')]));
      return ok(claudeMsg([
        searchRes(URL_READ), fetchRes(URL_READ),
        txt(JSON.stringify(opts.picks ?? PICKS())),
      ]));
    }

    if (url.includes('/youtube/v3/search')) {
      const q = decodeURIComponent(new URL(url).searchParams.get('q') ?? '');
      const title = q.split(' ')[1] ?? '';
      if ((opts.notOnShelf ?? []).some((t) => q.includes(t))) return ok({ items: [] });
      return ok({ items: [{ id: { videoId: `vid_${title}` } }] });
    }
    if (url.includes('/youtube/v3/videos')) {
      const id = new URL(url).searchParams.get('id') ?? '';
      return ok({ items: [{
        id, snippet: { title: id.replace('vid_', ''), channelTitle: 'A - Topic' },
        contentDetails: { duration: 'PT3M38S' }, status: { privacyStatus: 'public', embeddable: true },
      }] });
    }

    if (url.includes('oauth2.googleapis.com')) return ok({ access_token: 'at' });
    if (url.includes('/playlists?')) {
      if (opts.playlistFails) return { ok: false, status: 403, json: async () => ({ error: { errors: [{ reason: 'quotaExceeded' }] } }) };
      return ok({ id: 'PL_today' });
    }
    if (url.includes('/playlistItems')) {
      itemsAdded.push((JSON.parse(body as string) as { snippet: { resourceId: { videoId: string } } }).snippet.resourceId.videoId);
      return ok({ id: 'it' });
    }
    throw new Error(`가짜가 모르는 주소: ${url}`);
  };

  return { calls, itemsAdded, _fetch };
}

const envWith = (kv: unknown, world: { _fetch: unknown }) => ({
  PLANET: kv, _fetch: world._fetch,
  ANTHROPIC_API_KEY: 'a', YOUTUBE_API_KEY: 'y',
  YOUTUBE_OAUTH_CLIENT_ID: 'i', YOUTUBE_OAUTH_CLIENT_SECRET: 's', YOUTUBE_OAUTH_REFRESH_TOKEN: 'r',
});

const OPTS = { date: DATE, pack: 'byeoli', now: NOW };

// ── 시험 ─────────────────────────────────────────────────────────────────────

test('기억이 없으면 아무 데도 부르지 않는다', async () => {
  const { runMusicNight } = await import('./_music-night.ts');
  const w = fakeWorld();
  const r = await runMusicNight(envWith(fakeKV().kv, w) as never, OPTS);

  assert.equal(r.step, 'memory');
  assert.equal(r.error, 'no_memory');
  assert.equal(w.calls.length, 0, '기억이 없는데 검색부터 하지 않는다');
});

test('⚠ 쉬는 날은 실패가 아니다 — 관찰이 없으면 억지로 짜내지 않는다', async () => {
  const { runMusicNight } = await import('./_music-night.ts');
  const w = fakeWorld();
  const { kv } = fakeKV({ [`memory:${DATE}`]: JSON.stringify(dayMemory([], null)) });
  const r = await runMusicNight(envWith(kv, w) as never, OPTS);

  assert.equal(r.step, 'intent');
  assert.equal(r.rest, 'no_observations');
  assert.equal(r.error, null, '쉬는 날에 오류를 남기지 않는다');
  assert.equal(w.calls.length, 0, '한 번도 부르지 않는다 — 돈도 한도도 안 쓴다');
});

test('전체 — 기억부터 재생목록·스레드 문장까지', async () => {
  const { runMusicNight } = await import('./_music-night.ts');
  const w = fakeWorld();
  const { kv, store } = fakeKV({ [`memory:${DATE}`]: JSON.stringify(dayMemory(LINES)) });
  const r = await runMusicNight(envWith(kv, w) as never, OPTS);

  assert.equal(r.error, null);
  assert.equal(r.step, 'done');
  assert.deepEqual(r.queries, ['quiet folk songs about an empty chair']);
  assert.deepEqual(r.read, [URL_READ], '실제로 읽은 글이 영수증에 남는다');
  assert.equal(r.onShelf.length, 2, '고른 두 곡이 서가에서 확인됐다');
  assert.equal(r.playlistUrl, 'https://www.youtube.com/playlist?list=PL_today');

  // 저장소에는 탈락한 곡까지 들어간다
  assert.equal(r.archive!.saved, 3, '⚠ 고른 것만이 아니라 탈락도 저장한다 — 같은 조사를 두 번 하지 않으려고');
  const saved = JSON.parse(store.get('song_archive')!) as { songs: Record<string, { verdict: string }> };
  assert.equal(Object.values(saved.songs).filter((s) => s.verdict === 'rejected').length, 1);

  // 스레드는 문장만 만든다
  assert.ok(r.threadText!.includes('중심곡 — A'));
  assert.ok(r.threadText!.includes('빼콩이를 만나지 못한 오늘과 닮았다'));
  assert.ok(r.threadText!.includes('PL_today'));
  assert.ok(!w.calls.some((c) => c.includes('threads')), '⚠ 여기서 스레드에 올리지 않는다 — 발행 주체는 하나여야 한다');
});

test('중심곡이 재생목록 첫 곡이다', async () => {
  const { runMusicNight } = await import('./_music-night.ts');
  const w = fakeWorld();
  const { kv } = fakeKV({ [`memory:${DATE}`]: JSON.stringify(dayMemory(LINES)) });
  await runMusicNight(envWith(kv, w) as never, OPTS);

  assert.equal(w.itemsAdded[0], 'vid_중심곡', '그날의 중심이 목록 맨 앞에 온다');
  assert.equal(w.itemsAdded.length, 2);
});

test('서가에 없는 곡 — 조사는 남고 재생목록에만 안 담긴다', async () => {
  const { runMusicNight } = await import('./_music-night.ts');
  const w = fakeWorld({ notOnShelf: ['주변곡'] });
  const { kv } = fakeKV({ [`memory:${DATE}`]: JSON.stringify(dayMemory(LINES)) });
  const r = await runMusicNight(envWith(kv, w) as never, OPTS);

  assert.deepEqual(r.notOnShelf.map((x) => x.title), ['주변곡']);
  assert.deepEqual(w.itemsAdded, ['vid_중심곡'], '못 찾은 곡은 안 담는다');
  assert.equal(r.archive!.saved, 3, '⚠ 서가에 없다고 조사를 버리지 않는다');
});

test('⚠ 재생목록이 실패해도 그날 조사는 저장소에 남는다', async () => {
  const { runMusicNight } = await import('./_music-night.ts');
  const w = fakeWorld({ playlistFails: true });
  const { kv, store } = fakeKV({ [`memory:${DATE}`]: JSON.stringify(dayMemory(LINES)) });
  const r = await runMusicNight(envWith(kv, w) as never, OPTS);

  assert.equal(r.step, 'playlist');
  assert.equal(r.error, 'quotaExceeded');
  assert.equal(r.archive!.saved, 3,
    '조사가 이 파이프라인에서 제일 비싸다 — 재생목록 실패로 그날을 통째로 잃으면 다음 날 같은 조사를 또 한다');
  assert.ok(store.get('song_archive'), '저장이 재생목록보다 먼저 일어난다');
  assert.equal(r.playlistUrl, null);
});

test('재생목록을 건너뛰고 조사만 할 수 있다', async () => {
  const { runMusicNight } = await import('./_music-night.ts');
  const w = fakeWorld();
  const { kv } = fakeKV({ [`memory:${DATE}`]: JSON.stringify(dayMemory(LINES)) });
  const r = await runMusicNight(envWith(kv, w) as never, { ...OPTS, skipPlaylist: true });

  assert.equal(r.step, 'done');
  assert.equal(r.playlistUrl, null);
  assert.equal(r.archive!.saved, 3);
  assert.ok(!w.calls.some((c) => c.includes('/playlists?')), '재생목록을 만들지 않는다');
  assert.ok(r.notes.includes('playlist_skipped'));
  // ⚠ 실사고 2026-07-28: skipPlaylist가 스레드 문장보다 **앞에서** 반환해
  //   dry 실행에서 threadText가 늘 null이었다. 문장은 재생목록이 없어도 만들 수 있다.
  assert.ok(r.threadText, 'dry 실행에서도 스레드 문장은 나와야 한다');
  assert.ok(r.threadText.includes('중심곡 — A'));
  assert.ok(!r.threadText.includes('http'), '재생목록이 없으니 주소는 없다');
});

test('⚠ 읽은 글이 한 곳뿐이면 신호를 남긴다 — 발견이 얕았다는 뜻', async () => {
  const { runMusicNight } = await import('./_music-night.ts');
  const w = fakeWorld();
  const { kv } = fakeKV({ [`memory:${DATE}`]: JSON.stringify(dayMemory(LINES)) });
  const r = await runMusicNight(envWith(kv, w) as never, { ...OPTS, skipPlaylist: true });

  assert.ok(r.notes.some((n) => n.startsWith('single_source_domain')),
    '한 도메인만 읽었으면 막지는 않되 남긴다');
});

test('스레드 문장 — 중심곡이 없으면 만들지 않는다', async () => {
  const { buildThreadText } = await import('./_music-night.ts');
  assert.equal(buildThreadText(null, 'https://x'), null, '지어내지 않는다');
  assert.equal(
    buildThreadText({ title: 'Hurt', artist: 'Johnny Cash', because: '기다림과 닮았다' }, 'https://x'),
    'Hurt — Johnny Cash\n\n기다림과 닮았다\n\nhttps://x',
  );
});
