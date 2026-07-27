// 곡 저장소 계약 테스트 — 기억은 쌓이는 것이지 갈아치우는 게 아니다
import { test } from 'node:test';
import assert from 'node:assert/strict';

const NOW = 1785000000000;

test('열쇠 — ISRC → 서가 id → 이름 순으로 내려간다', async () => {
  const { songKey, normalizeName } = await import('./_song-archive.ts');

  assert.equal(songKey({ isrc: 'GB-AYE-06-01498', title: 'Hurt', artist: 'Johnny Cash' }), 'isrc:GBAYE0601498',
    'ISRC가 있으면 ISRC. 하이픈·대소문자는 떨어낸다');
  assert.equal(songKey({ title: 'Hurt', artist: 'Johnny Cash', shelf: { shelf: 'youtube', id: 'abc123' } }), 'youtube:abc123',
    'ISRC가 없으면 서가 id');
  assert.match(songKey({ title: 'Hurt', artist: 'Johnny Cash' }), /^name:johnny cash\|hurt$/,
    '둘 다 없으면 이름');

  // 이게 이 저장소가 존재하는 이유 중 하나 — 같은 녹음을 두 곡으로 세지 않는다
  assert.equal(normalizeName('Hurt - 2011 Remaster'), normalizeName('Hurt (Remastered)'),
    '리마스터 표기가 달라도 같은 곡');
  assert.equal(normalizeName('Blue Skies feat. Someone'), normalizeName('Blue Skies'),
    'feat 표기는 곡을 가르지 않는다');
  // ⚠ 12자리가 아니면 ISRC로 안 본다 (오타·빈 문자열이 열쇠가 되면 안 된다)
  assert.match(songKey({ isrc: 'ABC', title: 'x', artist: 'y' }), /^name:/, '길이가 안 맞는 ISRC는 무시');
});

test('검증 — 탈락은 사유가, 선택은 근거가 있어야 한다', async () => {
  const { validateSong } = await import('./_song-archive.ts');
  const base = { title: 'Hurt', artist: 'Johnny Cash' };

  assert.deepEqual(validateSong({ ...base, verdict: 'candidate' }), [], '후보는 이것만으로 충분');

  // 사유 없는 탈락은 다음 판단에 아무것도 못 준다 — 그래서 막는다
  assert.ok(validateSong({ ...base, verdict: 'rejected' }).includes('rejected_reason_required'),
    '탈락에 사유가 없으면 거부 (음성)');
  assert.deepEqual(validateSong({ ...base, verdict: 'rejected', rejectedReason: '오늘보다 지나치게 밝다' }), [],
    '사유가 있으면 통과');

  // "왜 오늘 이 곡인가"가 없으면 고른 게 아니다
  assert.ok(validateSong({ ...base, verdict: 'chosen' }).includes('chosen_mark_required'),
    '고른 날 기록이 없으면 거부 (음성)');
  assert.ok(validateSong({ ...base, verdict: 'chosen',
    chosen: [{ date: '2026-07-27', role: 'center', because: '' }] }).includes('chosen_mark_incomplete'),
    '이유가 빈 문자열이면 거부 (음성)');
  assert.deepEqual(validateSong({ ...base, verdict: 'chosen',
    chosen: [{ date: '2026-07-27', role: 'center', because: '빼콩이를 만나지 못한 오늘과 닮았다' }] }), [],
    '날짜와 이유가 있으면 통과');

  assert.ok(validateSong({ ...base, verdict: 'candidate', title: '' }).includes('title_required'));
  assert.ok(validateSong({ ...base, verdict: 'candidate',
    read: { sources: [], byeoliSummary: 'x'.repeat(401) } }).includes('summary_too_long'),
    '해석이지 옮겨적기가 아니다 — 길이로 막는다 (음성)');
});

test('합치기 — 한 번 고른 곡은 강등되지 않는다', async () => {
  const { emptyArchive, mergeSong, songKey, seen } = await import('./_song-archive.ts');

  const chosen = {
    key: '', isrc: 'GBAYE0601498', title: 'Hurt', artist: 'Johnny Cash',
    verdict: 'chosen' as const, firstSeenAt: NOW, lastTouchedAt: NOW,
    read: { sources: ['https://a.example'], byeoliSummary: '기다림을 멈춤이 아니라 말한다', themes: ['기다림'] },
    chosen: [{ date: '2026-07-27', role: 'center' as const, because: '오늘과 닮았다' }],
  };
  chosen.key = songKey(chosen);
  let a = mergeSong(emptyArchive(), chosen, NOW);
  assert.equal(Object.keys(a.songs).length, 1);

  // 다음 달, 같은 곡을 후보로 다시 만난다
  const again = { ...chosen, verdict: 'candidate' as const, chosen: [],
    read: { sources: ['https://b.example'], themes: ['남은 온기'] } };
  a = mergeSong(a, again, NOW + 864e5 * 30);

  const s = seen(a, chosen.key)!;
  assert.equal(Object.keys(a.songs).length, 1, '같은 곡이 두 항목이 되면 안 된다');
  assert.equal(s.verdict, 'chosen', '⚠ 핵심 — 후보로 다시 만나도 chosen이 유지된다');
  assert.equal(s.chosen.length, 1, '고른 기록이 지워지지 않는다');
  assert.deepEqual(s.read!.sources, ['https://a.example', 'https://b.example'], '읽은 곳은 합쳐진다');
  assert.deepEqual(s.read!.themes, ['기다림', '남은 온기'], '주제도 합쳐진다');
  assert.equal(s.read!.byeoliSummary, '기다림을 멈춤이 아니라 말한다', '새 해석이 없으면 앞의 것을 잃지 않는다');
  assert.equal(s.firstSeenAt, NOW, '처음 만난 때는 안 바뀐다');
  assert.equal(s.lastTouchedAt, NOW + 864e5 * 30, '마지막으로 만진 때는 갱신된다');

  // 서가 정보는 한 번 확인되면 유지된다
  let b = mergeSong(a, { ...chosen, shelf: { shelf: 'youtube', id: 'v1', official: true } }, NOW);
  b = mergeSong(b, { ...chosen, shelf: null }, NOW);
  assert.equal(seen(b, chosen.key)!.shelf!.id, 'v1', '다음에 못 찾아도 앞서 확인한 서가를 잃지 않는다');
});

test('최근 선곡 — 며칠은 피하되 영원히 막지는 않는다', async () => {
  const { emptyArchive, mergeSong, songKey, recentlyChosen } = await import('./_song-archive.ts');
  const mk = (title: string, date: string) => {
    const e = { key: '', title, artist: 'A', verdict: 'chosen' as const,
      firstSeenAt: NOW, lastTouchedAt: NOW,
      chosen: [{ date, role: 'center' as const, because: '이유' }] };
    e.key = songKey(e); return e;
  };
  let a = emptyArchive();
  a = mergeSong(a, mk('어제곡', '2026-07-26'), NOW);
  a = mergeSong(a, mk('보름전곡', '2026-07-12'), NOW);
  a = mergeSong(a, mk('반년전곡', '2026-01-20'), NOW);

  const r = recentlyChosen(a, 7, '2026-07-27');
  assert.equal(r.size, 1, '7일 안에 고른 것만');
  assert.ok(r.has(songKey({ title: '어제곡', artist: 'A' })));
  assert.ok(!r.has(songKey({ title: '반년전곡', artist: 'A' })), '반년 전 곡은 다시 오늘과 닮을 수 있다');
});

test('안전장치 — 기억이 줄어드는 저장은 멈춘다', async () => {
  const { emptyArchive, mergeSong, songKey, guardShrink } = await import('./_song-archive.ts');
  const e = { key: '', title: 'A', artist: 'B', verdict: 'candidate' as const, firstSeenAt: NOW, lastTouchedAt: NOW, chosen: [] };
  e.key = songKey(e);
  const full = mergeSong(emptyArchive(), e, NOW);

  assert.equal(guardShrink(full, full), null, '같으면 통과');
  assert.equal(guardShrink(emptyArchive(), full), null, '늘어나면 통과');
  assert.match(guardShrink(full, emptyArchive())!, /archive_shrank: 1 → 0/,
    '⚠ 줄어들면 멈춘다 — 빈 저장소로 덮어쓰는 사고를 막는다 (음성)');
});

// ── 보관 ──────────────────────────────────────────────────────
/** 가짜 KV — 망 없이 저장 규칙을 시험한다. put/get 횟수까지 센다. */
function fakeKV(seed?: string) {
  const store = new Map<string, string>();
  if (seed !== undefined) store.set('song_archive', seed);
  const calls = { get: 0, put: 0 };
  return {
    calls,
    env: {
      PLANET: {
        get: async (k: string) => { calls.get++; return store.get(k) ?? null; },
        put: async (k: string, v: string) => { calls.put++; store.set(k, v); },
      } as unknown as KVNamespace,
    },
    raw: () => store.get('song_archive'),
  };
}

const mkEntry = (title: string, over: Record<string, unknown> = {}) => ({
  key: '', title, artist: 'Johnny Cash',
  verdict: 'candidate' as const, firstSeenAt: NOW, lastTouchedAt: NOW, chosen: [],
  ...over,
});

test('보관 — 빈 저장소에서 시작하고, 없으면 없는 대로 연다', async () => {
  const { readArchive } = await import('./_song-archive.ts');
  const k = fakeKV();
  const a = await readArchive(k.env);
  assert.deepEqual(a.songs, {}, '값이 없으면 빈 저장소');
  assert.equal(a.version, 1);
});

test('보관 — 깨진 값은 조용히 넘어가지 않는다', async () => {
  const { readArchive } = await import('./_song-archive.ts');
  await assert.rejects(() => readArchive(fakeKV('{{{ 깨진 json').env), /song_archive_unreadable/,
    'JSON이 깨졌으면 던진다 (음성)');
  await assert.rejects(() => readArchive(fakeKV('{"version":1}').env), /song_archive_unreadable/,
    'songs가 없는 모양도 던진다 — 빈 저장소로 덮어쓰는 사고를 막는다 (음성)');
});

test('보관 — 후보·탈락도 함께 저장된다', async () => {
  const { recordSongs, readArchive } = await import('./_song-archive.ts');
  const k = fakeKV();
  const r = await recordSongs(k.env, [
    mkEntry('중심곡', { verdict: 'chosen', chosen: [{ date: '2026-07-27', role: 'center', because: '오늘과 닮았다' }] }),
    mkEntry('탈락곡', { verdict: 'rejected', rejectedReason: '오늘보다 지나치게 밝다' }),
    mkEntry('후보곡'),
  ], NOW);

  assert.equal(r.saved, 3, '고른 것만이 아니라 셋 다 저장');
  assert.equal(r.total, 3);
  assert.equal(k.calls.put, 1, '한 번만 쓴다 — 곡마다 쓰지 않는다');

  const a = await readArchive(k.env);
  assert.equal(Object.values(a.songs).find((s) => s.title === '탈락곡')!.rejectedReason, '오늘보다 지나치게 밝다',
    '⚠ 탈락 사유가 남아야 다음 달에 같은 곡을 또 조사하지 않는다');
});

test('보관 — 검증에 걸린 것은 조용히 버리지 않는다', async () => {
  const { recordSongs } = await import('./_song-archive.ts');
  const k = fakeKV();
  const r = await recordSongs(k.env, [
    mkEntry('정상곡'),
    mkEntry('사유없는탈락', { verdict: 'rejected' }),
    mkEntry('', {}),
  ], NOW);

  assert.equal(r.saved, 1, '정상인 것만 저장');
  assert.equal(r.skipped.length, 2, '나머지는 버리는 게 아니라 돌려준다');
  assert.ok(r.skipped.some((s) => s.why.includes('rejected_reason_required')));
  assert.ok(r.skipped.some((s) => s.why.includes('title_required')));
});

test('보관 — 아무것도 저장할 게 없으면 쓰지 않는다', async () => {
  const { recordSongs } = await import('./_song-archive.ts');
  const k = fakeKV();
  const r = await recordSongs(k.env, [mkEntry('', {})], NOW);
  assert.equal(r.saved, 0);
  assert.equal(k.calls.put, 0, '빈 쓰기로 updatedAt만 흔들지 않는다');
});

test('보관 — 줄어드는 저장은 던진다', async () => {
  const { writeArchive, emptyArchive, mergeSong, songKey } = await import('./_song-archive.ts');
  const e = mkEntry('A'); e.key = songKey(e);
  const full = mergeSong(emptyArchive(), e as never, NOW);
  const k = fakeKV(JSON.stringify(full));

  await assert.rejects(() => writeArchive(k.env, full, emptyArchive()), /archive_shrank: 1 → 0/,
    '⚠ 기억이 줄어드는 쓰기는 막는다 (음성)');
  assert.equal(k.calls.put, 0, '막혔으면 실제로 쓰지도 않는다');
});
