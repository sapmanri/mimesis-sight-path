// YouTube 서가 계약 테스트 — 망 없이, 가짜 fetch로
import { test } from 'node:test';
import assert from 'node:assert/strict';

const Q = { title: 'Hurt', artist: 'Johnny Cash', durationSec: 218 };

/** 진짜 응답 모양을 흉내낸다. 부른 주소를 전부 기록해 호출 횟수를 검사한다. */
function fakeYT(search: unknown, videos: unknown, opts: { searchOk?: boolean; videosOk?: boolean } = {}) {
  const urls: string[] = [];
  const _fetch = async (url: string) => {
    urls.push(url);
    const isSearch = url.includes('/search?');
    const ok = isSearch ? (opts.searchOk ?? true) : (opts.videosOk ?? true);
    return { ok, status: ok ? 200 : 403, json: async () => (isSearch ? search : videos) };
  };
  return { urls, env: { YOUTUBE_API_KEY: 'test-key', _fetch } };
}

const sItem = (id: string) => ({ id: { videoId: id }, snippet: {} });
const vItem = (id: string, title: string, channel: string, duration: string, extra: Record<string, unknown> = {}) =>
  ({ id, snippet: { title, channelTitle: channel }, contentDetails: { duration }, status: { privacyStatus: 'public', embeddable: true }, ...extra });

test('재생시간 읽기 — 못 읽으면 0이 아니라 null', async () => {
  const { parseDuration } = await import('./_shelf-youtube.ts');
  assert.equal(parseDuration('PT3M38S'), 218);
  assert.equal(parseDuration('PT1H2M3S'), 3723);
  assert.equal(parseDuration('PT45S'), 45);
  assert.equal(parseDuration(''), null, '⚠ 0으로 두면 "길이 0인 곡"이 되어 길이 검사가 통과해버린다');
  assert.equal(parseDuration('garbage'), null);
  assert.equal(parseDuration('PT0S'), null, '0초짜리는 곡이 아니다');
});

test('키가 없으면 조용히 넘어가지 않는다', async () => {
  const { verifyOnYoutube } = await import('./_shelf-youtube.ts');
  const r = await verifyOnYoutube({}, Q);
  assert.equal(r.best, null);
  assert.equal(r.error, 'no_api_key', '못 했다고 말한다');
  assert.deepEqual(r.cost, { search: 0, videos: 0 }, '한도를 쓰지 않는다');
});

test('한 곡에 검색 1회 + 상세 1회 — 검색을 두 번 하지 않는다', async () => {
  const { verifyOnYoutube } = await import('./_shelf-youtube.ts');
  const yt = fakeYT(
    { items: [sItem('a'), sItem('b')] },
    { items: [vItem('a', 'Hurt', 'Johnny Cash - Topic', 'PT3M38S'), vItem('b', 'Hurt (Live)', 'Johnny Cash - Topic', 'PT3M40S')] },
  );
  const r = await verifyOnYoutube(yt.env as never, Q);

  assert.equal(yt.urls.filter((u) => u.includes('/search?')).length, 1, '⚠ 검색은 하루 100회뿐 — 한 번만 쓴다');
  assert.equal(yt.urls.filter((u) => u.includes('/videos?')).length, 1, '상세는 싸니까 한 번 더 본다');
  assert.deepEqual(r.cost, { search: 1, videos: 1 });
  assert.equal(r.best!.candidate.id, 'a', '원곡이 뽑힌다 (라이브는 탈락)');
  assert.ok(yt.urls[0].includes('videoCategoryId=10'), '음악으로 좁혀 검색한다');
});

test('⚠ videos.list가 필수인 이유 — search만으로는 전곡 모음을 못 거른다', async () => {
  const { verifyOnYoutube } = await import('./_shelf-youtube.ts');
  const yt = fakeYT(
    { items: [sItem('album'), sItem('song')] },
    { items: [
      vItem('album', 'Johnny Cash - Hurt', 'Johnny Cash - Topic', 'PT58M12S'),   // 제목·채널은 완벽하다
      vItem('song', 'Hurt', 'Johnny Cash - Topic', 'PT3M38S'),
    ] },
  );
  const r = await verifyOnYoutube(yt.env as never, Q);
  assert.equal(r.best!.candidate.id, 'song');
  assert.match(r.all.find((x) => x.candidate.id === 'album')!.disqualified!, /duration_off/,
    '제목이 아무리 맞아도 58분짜리는 그 곡이 아니다 — 길이는 search가 주지 않는다');
});

test('못 붙이거나 비공개인 것은 서가에 있다고 하지 않는다', async () => {
  const { verifyOnYoutube } = await import('./_shelf-youtube.ts');
  const yt = fakeYT(
    { items: [sItem('x'), sItem('y')] },
    { items: [
      { ...vItem('x', 'Hurt', 'Johnny Cash - Topic', 'PT3M38S'), status: { privacyStatus: 'public', embeddable: false } },
      { ...vItem('y', 'Hurt', 'Johnny Cash - Topic', 'PT3M38S'), status: { privacyStatus: 'private', embeddable: true } },
    ] },
  );
  const r = await verifyOnYoutube(yt.env as never, Q);
  assert.equal(r.best, null, '들을 수 없으면 없는 것과 같다');
});

test('못 찾으면 null — 오류와 구분된다', async () => {
  const { verifyOnYoutube } = await import('./_shelf-youtube.ts');

  const none = await verifyOnYoutube(fakeYT({ items: [] }, { items: [] }).env as never, Q);
  assert.equal(none.best, null);
  assert.equal(none.error, null, '없는 것은 오류가 아니다');
  assert.equal(none.cost.videos, 0, '후보가 없으면 상세를 부르지 않는다');

  const boom = await verifyOnYoutube(fakeYT({}, {}, { searchOk: false }).env as never, Q);
  assert.equal(boom.error, 'search_403', '⚠ 한도 초과·키 문제는 "못 찾음"과 다르게 말한다');
});

test('여러 곡 — 한도를 넘기지 않고, 못 한 것은 정직하게 남긴다', async () => {
  const { verifyMany } = await import('./_shelf-youtube.ts');
  const yt = fakeYT({ items: [sItem('a')] }, { items: [vItem('a', 'Hurt', 'Johnny Cash - Topic', 'PT3M38S')] });

  const qs = Array.from({ length: 5 }, () => ({ ...Q }));
  const r = await verifyMany(yt.env as never, qs, 3);

  assert.equal(r.results.length, 3, '한도만큼만 확인한다');
  assert.equal(r.skipped.length, 2, '⚠ 못 한 것을 조용히 버리지 않는다');
  assert.deepEqual(r.used, { search: 3, videos: 3 });
});

test('서가 검색어는 별이의 문장이 아니라 정확한 이름이다', async () => {
  const { shelfQueryText } = await import('./_shelf-youtube.ts');
  assert.equal(shelfQueryText(Q), 'Johnny Cash Hurt audio', '발견은 끝났고 여기선 확인만 한다');
  assert.equal(shelfQueryText({ ...Q, want: 'live' }), 'Johnny Cash Hurt live');
});
