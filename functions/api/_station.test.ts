import test from 'node:test';
import assert from 'node:assert/strict';
import { placeSegment, lastEndOf, pruneProgram, PROGRAM_KEEP, type ProgramSegment } from './_station.ts';
import { validateRadioScript, situationMessage } from './_radio.ts';

const seg = (id: string, startAt: number, dur: number): ProgramSegment =>
  ({ id, kind: 'talk', startAt, dur, url: 'https://pub-x.r2.dev/radio/x.m4a', title: id });

test('편성 자리 — 버퍼가 있으면 이어 붙고, 비어 있었으면 지금부터', () => {
  // 마지막 토막이 미래까지 차 있다 → 그 끝에 이어 붙는다
  assert.equal(placeSegment(2000, 1000), 2000);
  // 방송이 비어 있었다 → 지금부터 (죽은 공기는 클라이언트가 환경음으로)
  assert.equal(placeSegment(500, 1000), 1000);
  // 첫 토막
  assert.equal(placeSegment(null, 1000), 1000);
});

test('lastEnd — 토막 끝의 최댓값 (등록 순서와 무관)', () => {
  assert.equal(lastEndOf([]), null);
  assert.equal(lastEndOf([seg('a', 0, 10), seg('b', 5000, 10)]), 15000);
});

test('편성표 정리 — 이틀 창 밖과 수 상한 초과는 과거부터 자른다', () => {
  const now = 100 * 3_600_000;                      // 100시간 시점
  const old = seg('old', 0, 60);                    // 끝이 48시간 창 밖
  const keep = seg('keep', now - 3_600_000, 60);    // 1시간 전
  const pruned = pruneProgram([keep, old], now);
  assert.deepEqual(pruned.map((s) => s.id), ['keep']);
  // 수 상한 — 최근 것만 남는다
  const many = Array.from({ length: PROGRAM_KEEP + 50 }, (_, i) => seg(`s${i}`, now - i * 1000, 1));
  const capped = pruneProgram(many, now);
  assert.equal(capped.length, PROGRAM_KEEP);
  assert.equal(capped[capped.length - 1].id, 's0'); // 가장 최근이 끝에 (시간순 정렬)
});

// 스테이션: 사연 없는 틱 — 별이가 혼자 논다
test('사연 없는 상황 — 검증은 별이 말만 보고, 메시지는 혼자 노는 판을 말한다', () => {
  const own = '오늘은 빼콩이가 창턱에서 반나절을 잤다.\n해가 옮겨 가는 만큼만 몸을 옮기더라.\n그늘을 따라가는 건지 해를 따라가는 건지 아직 모르겠다.\n창턱에는 볕이 지나간 자리만큼 온기가 남아 있었다.';
  const r = validateRadioScript(own, null);
  assert.equal(r.pass, true);
  assert.equal(r.warnings.filter((w) => w.startsWith('story_not_read')).length, 0);
  const msg = situationMessage({ timeLabel: '밤', todayLines: [], story: null, waitingCount: 0, recentScripts: [] });
  assert.match(msg, /이번 토막은 온전히 네 것이다/);
  assert.doesNotMatch(msg, /<사연>/);
  // 별리 코믹스 — 별이의 창작물이 상황에 실린다 (게놈 자산 재사용, 08-12)
  const withComics = situationMessage({
    timeLabel: '밤', todayLines: [], story: null, waitingCount: 0, recentScripts: [],
    comicBits: [{ title: '떨어지지 않은 것', epigraph: '하늘이 다 지나갈 때까지 서 있었다.', lines: ['우산을 접었다.'] }],
  });
  assert.match(withComics, /네가 만들던 그림 이야기/);
  assert.match(withComics, /「떨어지지 않은 것」/);
});
