// 큐레이션 계약 테스트 — 그럴듯한 문장이 검증을 통과하지 못하게
import { test } from 'node:test';
import assert from 'node:assert/strict';

const NOW = 1785000000000;

const intent = {
  date: '2026-07-27',
  pack: 'byeoli',
  centralImage: '누군가 앉았던 빈 의자',
  material: ['🪑 오래된 나무 의자에 앉음', '🐈 빼콩이를 기다렸지만 만나지 못함', '☁️ 흐린 아침에 책을 조금 읽음'],
  focusOrder: ['light', 'movement', 'texture', 'distance'],
  seek: [{ term: '소리의 결', from: 'texture', because: '🪑 오래된 나무 의자에 앉음' }],
  avoid: ['절망적인 이별', '과도하게 밝은 음악', '직접적인 위로'],
  excludeKeys: [],
} as never;

const FETCHED = ['https://pitchfork.example/review/1', 'https://interview.example/artist/2'];

test('검색어 — 납작한 말과 내부 어휘를 거른다', async () => {
  const { validateQueries } = await import('./_music-curate.ts');

  const { ok, rejected } = validateQueries([
    { query: 'songs about waiting without sadness', fromLine: 1 },
    { query: 'quiet folk songs about an empty chair', fromLine: 0 },
    { query: 'sad morning songs', fromLine: 2 },              // 납작 (3단어)
    { query: 'texture of old wooden rooms', fromLine: 0 },    // 내부 어휘 그대로
    { query: '절망적인 이별 노래 모음', fromLine: 1 },          // 피하기로 한 것
    { query: 'songs for waiting', fromLine: 99 },             // 없는 줄을 근거로
  ], intent);

  assert.deepEqual(ok.map((q) => q.query),
    ['songs about waiting without sadness', 'quiet folk songs about an empty chair'],
    '살아남는 건 오늘에서 나온 말뿐');
  const why = Object.fromEntries(rejected.map((r) => [r.query, r.why]));
  assert.match(why['sad morning songs'], /too_flat|no_relation/, '⚠ 네가 콕 집은 그 예시 — 관계를 말하지 않으면 거부');
  assert.equal(why['texture of old wooden rooms'], 'raw_focus_word', '초점 이름을 그대로 던지면 우리 내부 어휘다');
  assert.equal(why['절망적인 이별 노래 모음'], 'contains_avoid');
  assert.equal(why['songs for waiting'], 'fromLine_not_real', '⚠ 없는 줄을 근거로 대면 거부');
});

test('⚠ 핵심 — 읽지 않은 것을 읽었다고 하면 잡는다', async () => {
  const { validateJudgement } = await import('./_music-curate.ts');

  const { ok, rejected } = validateJudgement({
    picks: [
      { title: '진짜곡', artist: 'A', verdict: 'chosen', role: 'center', fromLine: 1,
        because: '빼콩이를 만나지 못한 오늘과 닮았다', sources: [FETCHED[0]] },
      { title: '지어낸출처곡', artist: 'B', verdict: 'chosen', role: 'around', fromLine: 0,
        because: '나무 의자와 닮았다', sources: ['https://내가안읽은곳.example/a'] },
    ],
  } as never, intent, FETCHED);

  assert.deepEqual(ok.map((p) => p.title), ['진짜곡']);
  assert.match(rejected[0].why, /source_not_fetched/,
    '가져오지 않은 주소를 출처로 대면 거부 — 조사한 척을 막는다');
});

test('근거는 문장이 아니라 좌표로 검사한다', async () => {
  const { validateJudgement } = await import('./_music-curate.ts');

  // "그럴듯한 문장"은 검사할 수 없다. 그래서 어느 줄에 걸렸는지를 대게 한다.
  const { ok, rejected } = validateJudgement({
    picks: [
      { title: '좌표있음', artist: 'A', verdict: 'chosen', role: 'center', fromLine: 2,
        because: '흐린 아침에 읽던 책과 같은 속도다', sources: [FETCHED[0]] },
      { title: '좌표없음', artist: 'B', verdict: 'chosen', role: 'around', fromLine: 7,
        because: '오늘과 아주 닮았다', sources: [FETCHED[1]] },
    ],
  } as never, intent, FETCHED);

  assert.deepEqual(ok.map((p) => p.title), ['좌표있음']);
  assert.match(rejected[0].why, /fromLine_not_real/,
    '⚠ 아무리 그럴듯해도 실재하는 관찰 줄에 안 걸리면 거부');
});

test('읽지 않고 고를 수 없다', async () => {
  const { validateJudgement } = await import('./_music-curate.ts');
  const { rejected } = validateJudgement({
    picks: [{ title: '안읽고고름', artist: 'A', verdict: 'chosen', role: 'center', fromLine: 0,
      because: '느낌이 맞다', sources: [] }],
  } as never, intent, FETCHED);
  assert.match(rejected[0].why, /chosen_without_reading/, '출처 없이 고른 것은 조사한 게 아니다');
});

test('가사 복사를 막는다', async () => {
  const { validateJudgement, looksLikeLyrics } = await import('./_music-curate.ts');

  assert.ok(looksLikeLyrics('한 줄\n두 줄\n세 줄\n네 줄'), '여러 줄로 이어진 인용');
  assert.ok(looksLikeLyrics('가'.repeat(301)), '지나치게 긴 것');
  assert.ok(!looksLikeLyrics('기다림을 멈춤이 아니라 아직 끝나지 않은 시간처럼 말한다'), '한 줄 해석은 통과');

  const { rejected } = validateJudgement({
    picks: [{ title: '가사곡', artist: 'A', verdict: 'chosen', role: 'center', fromLine: 0,
      because: '좋다', sources: [FETCHED[0]],
      byeoliSummary: '1절 첫 줄\n1절 둘째 줄\n1절 셋째 줄\n후렴 첫 줄' }],
  } as never, intent, FETCHED);
  assert.match(rejected[0].why, /looks_like_lyrics/, '해석 자리에 원문을 붙이면 거부');
});

test('중심곡은 하루에 하나다', async () => {
  const { validateJudgement } = await import('./_music-curate.ts');
  const mk = (title: string, role: string) => ({ title, artist: 'A', verdict: 'chosen', role,
    fromLine: 0, because: '이유', sources: [FETCHED[0]] });

  const { ok, rejected } = validateJudgement({
    picks: [mk('첫중심', 'center'), mk('둘째중심', 'center'), mk('주변', 'around')],
  } as never, intent, FETCHED);

  assert.equal(ok.filter((p) => p.role === 'center').length, 1, '중심은 하나만 남는다');
  assert.deepEqual(ok.map((p) => p.title), ['첫중심', '주변']);
  assert.ok(rejected.some((r) => r.why === 'multiple_centers'), '둘째 중심은 사유와 함께 떨어진다');
});

test('판정 → 저장소 항목 — 탈락 사유가 옮겨 붙는다', async () => {
  const { toEntries } = await import('./_music-curate.ts');
  const es = toEntries([
    { title: 'Hurt', artist: 'Johnny Cash', verdict: 'chosen', role: 'center', fromLine: 1,
      because: '빼콩이를 만나지 못한 오늘과 닮았다', sources: [FETCHED[0], FETCHED[0]],
      byeoliSummary: '기다림을 아직 끝나지 않은 시간처럼 말한다', themes: ['기다림'] },
    { title: '밝은곡', artist: 'B', verdict: 'rejected', fromLine: 2,
      because: '오늘보다 지나치게 밝다', sources: [FETCHED[1]] },
  ] as never, intent, NOW);

  const [chosen, rej] = es;
  assert.equal(chosen.verdict, 'chosen');
  assert.deepEqual(chosen.chosen, [{ date: '2026-07-27', role: 'center', because: '빼콩이를 만나지 못한 오늘과 닮았다' }]);
  assert.deepEqual(chosen.read!.sources, [FETCHED[0]], '같은 출처가 두 번 들어가지 않는다');
  assert.equal(rej.rejectedReason, '오늘보다 지나치게 밝다', '⚠ 탈락 사유가 저장소로 옮겨간다');
  assert.deepEqual(rej.chosen, [], '탈락은 고른 날이 없다');

  // 저장소 검증을 그대로 통과해야 한다 — 두 계약이 어긋나 있으면 여기서 드러난다
  const { validateSong } = await import('./_song-archive.ts');
  for (const e of es) assert.deepEqual(validateSong(e), [], `${e.title} 저장소 검증 통과`);
});

test('검색어 프롬프트에 오늘의 재료가 실제로 들어간다', async () => {
  const { buildQueryPrompt } = await import('./_music-curate.ts');
  const p = buildQueryPrompt(intent);
  for (const l of intent.material) assert.ok(p.includes(l), `관찰 줄이 들어간다: ${l}`);
  for (const a of intent.avoid) assert.ok(p.includes(a), `피할 것이 들어간다: ${a}`);
  assert.ok(p.includes('누군가 앉았던 빈 의자'), '중심 장면');
  assert.ok(p.includes('[0]') && p.includes('[2]'), '줄 번호를 대게 한다');
});

test('⚠ 같은 곡의 다른 판본을 둘 고르지 않는다 (2026-07-28 실물에서 드러남)', async () => {
  const { validateJudgement } = await import('./_music-curate.ts');
  const mk = (title: string, artist: string, role: string) => ({
    title, artist, verdict: 'chosen', role, fromLine: 0, because: '이유', sources: [FETCHED[0]] });

  // 첫 실행에서 실제로 난 일: Autumn Leaves 두 판본. 둘째 이유가
  // 「같은 글의 판본 목록에 올라 있었고」였다 — 찾은 게 아니라 목록을 베낀 것.
  const { ok, rejected } = validateJudgement({
    picks: [
      mk('Autumn Leaves (Les feuilles mortes)', 'Roger Williams', 'center'),
      mk('Autumn Leaves', 'Bill Evans', 'around'),
      mk('전혀 다른 곡', 'C', 'around'),
    ],
  } as never, intent, FETCHED);

  assert.deepEqual(ok.map((p) => p.artist), ['Roger Williams', 'C'], '다른 곡은 남는다');
  assert.match(rejected[0].why, /same_song_twice/, '가수가 달라도 같은 곡이면 거부');

  // 탈락시킨 곡은 이 규칙에 걸리지 않는다 — 저장은 해야 하니까
  const r2 = validateJudgement({
    picks: [mk('X', 'A', 'center'), { ...mk('X', 'B', 'around'), verdict: 'rejected' }],
  } as never, intent, FETCHED);
  assert.equal(r2.ok.length, 2, '탈락 판정은 중복 규칙 밖이다');
});
