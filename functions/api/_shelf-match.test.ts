// 서가 대조 계약 테스트 — 엉뚱한 녹음을 담느니 없다고 하는 게 낫다
import { test } from 'node:test';
import assert from 'node:assert/strict';

const Q = { title: 'Hurt', artist: 'Johnny Cash', durationSec: 218 };

test('탈락이 점수를 이긴다 — 라이브가 원곡을 못 이긴다', async () => {
  const { pickBest } = await import('./_shelf-match.ts');

  // ⚠ 이 시험이 이 파일의 존재 이유다.
  //   Vase의 첫 점수표는 정확 일치 +75, 라이브 -30이었다. 그러면 제목·가수가 정확한
  //   **라이브 버전이 원곡보다 높게 나온다**. 그래서 라이브는 감점이 아니라 탈락으로 바꿨다.
  const { best, all } = pickBest(Q, [
    { id: 'live', title: 'Hurt (Live at Folsom)', channel: 'Johnny Cash - Topic', durationSec: 220 },
    { id: 'orig', title: 'Hurt', channel: 'Johnny Cash - Topic', durationSec: 218 },
  ]);
  assert.equal(best!.candidate.id, 'orig', '원곡이 이긴다');
  assert.equal(all.find((r) => r.candidate.id === 'live')!.disqualified, 'live_but_studio_wanted',
    '라이브는 점수 경쟁에 들어오지도 못한다');
});

test('원곡이 아닌 것들은 무조건 탈락한다', async () => {
  const { matchOne } = await import('./_shelf-match.ts');
  const cases: Array<[string, string, string]> = [
    ['Hurt (Karaoke Version)', 'karaoke_or_instrumental', '노래방'],
    ['Hurt 노래방 MR', 'karaoke_or_instrumental', '한국어 노래방'],
    ['Hurt - Piano Cover', 'cover', '커버'],
    ['Hurt 커버 불러봤습니다', 'cover', '한국어 커버'],
    ['Hurt (sped up)', 'speed_or_pitch_edit', '배속'],
    ['Hurt [slowed + reverb]', 'speed_or_pitch_edit', '느리게+리버브'],
    ['Hurt 8D AUDIO', 'audio_gimmick', '8D'],
    ['Hurt REACTION!!', 'not_music', '리액션'],
    ['Hurt (AI Cover)', 'ai_cover', 'AI 커버'],
  ];
  for (const [title, why, label] of cases) {
    const r = matchOne(Q, { id: 'x', title, channel: 'Johnny Cash - Topic', durationSec: 218 });
    assert.equal(r.disqualified, why, `${label} 탈락`);
    assert.equal(r.score, 0, `${label}은 점수도 안 매긴다`);
  }
});

test('러닝타임이 어긋나면 다른 것이다', async () => {
  const { matchOne } = await import('./_shelf-match.ts');

  assert.match(matchOne(Q, { id: 'a', title: 'Hurt', channel: 'Johnny Cash - Topic', durationSec: 3600 })!.disqualified!,
    /duration_off/, '한 시간짜리는 전곡 모음이지 한 곡이 아니다');
  assert.equal(matchOne(Q, { id: 'b', title: 'Hurt', channel: 'Johnny Cash - Topic', durationSec: 221 }).disqualified, null,
    '3초 차이는 같은 곡');
  // 러닝타임을 모를 때의 최소 방어
  assert.equal(matchOne({ title: 'Hurt', artist: 'Johnny Cash' },
    { id: 'c', title: 'Hurt', channel: 'Johnny Cash - Topic', durationSec: 4000 }).disqualified,
    'too_long_probably_album', '길이를 몰라도 15분 넘으면 막는다');
});

test('공식 음원(- Topic)을 알아본다', async () => {
  const { isTopicChannel, matchOne } = await import('./_shelf-match.ts');
  assert.ok(isTopicChannel('Johnny Cash - Topic'), '자동 생성 음원 채널');
  assert.ok(!isTopicChannel('Johnny Cash Fan Channel'), '팬 채널은 아니다');
  assert.ok(!isTopicChannel('Topic Records'), '이름에 Topic이 들어갈 뿐인 채널은 아니다');

  const official = matchOne(Q, { id: 'a', title: 'Hurt', channel: 'Johnny Cash - Topic', durationSec: 218 });
  const random = matchOne(Q, { id: 'b', title: 'Hurt', channel: 'music uploads 2011', durationSec: 218 });
  assert.ok(official.reasons.includes('official_channel'));
  assert.ok(official.score > random.score, '공식 음원이 더 높다');
});

test('제목 표기가 달라도 같은 곡으로 본다', async () => {
  const { norm, matchOne } = await import('./_shelf-match.ts');
  assert.equal(norm('Hurt (Official Audio)'), norm('Hurt'));
  assert.equal(norm('Hurt - 2011 Remaster'), norm('Hurt'));
  assert.equal(norm('Johnny Cash - Hurt [4K]'), 'johnny cash hurt');

  // YouTube는 영상 제목에 "가수 - 곡명"이 함께 오는 일이 흔하다
  const r = matchOne(Q, { id: 'a', title: 'Johnny Cash - Hurt (Official Audio)', channel: 'JohnnyCashVEVO', durationSec: 218 });
  assert.equal(r.disqualified, null);
  assert.ok(r.reasons.includes('artist_contains'), '제목 안의 가수 이름도 읽는다');
});

test('못 찾으면 null — 억지로 담지 않는다', async () => {
  const { pickBest } = await import('./_shelf-match.ts');

  const { best } = pickBest(Q, [
    { id: 'x', title: '전혀 다른 노래', channel: '아무개', durationSec: 200 },
    { id: 'y', title: 'Hurt (Karaoke)', channel: 'Johnny Cash - Topic', durationSec: 218 },
  ]);
  assert.equal(best, null, '⚠ 서가에 없으면 없다고 한다. 엉뚱한 녹음을 담는 것보다 낫다');
  assert.equal(pickBest(Q, []).best, null, '후보가 아예 없어도 터지지 않는다');
});

test('별이가 일부러 라이브를 찾을 때는 라이브가 이긴다', async () => {
  const { pickBest } = await import('./_shelf-match.ts');
  const { best } = pickBest({ ...Q, want: 'live' }, [
    { id: 'orig', title: 'Hurt', channel: 'Johnny Cash - Topic', durationSec: 218 },
    { id: 'live', title: 'Hurt (Live at Folsom)', channel: 'Johnny Cash - Topic', durationSec: 220 },
  ]);
  assert.equal(best!.candidate.id, 'live', '찾는 것이 라이브면 스튜디오판이 물러난다');
});
