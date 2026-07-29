// 발행 사진이 그날의 기억과 같은 사건을 가리키는가 (2026-07-29 실사고 회귀시험)
//
// ⚠ 증상: 431-M A안이 코드에 있는데 **한 번도 발동한 적이 없었다.**
//   `memory:{오늘}`은 23:30에 접힐 때 생기는데 발행은 08·18·22시다. 조건이 늘 거짓이라
//   사진은 항상 40장 임의 추첨으로 떨어졌고, 글 갈래는 사진이 아니라 날짜로 붙었다.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildDayMemory, kstDate, type CaptureLike } from './_memory-event';

const at = (h: number, m = 0) => Date.parse(`2026-07-29T${String(h - 9).padStart(2, '0')}:${String(m).padStart(2, '0')}:00Z`);
// ⚠ diaryLines가 없는 캡처는 capturesToEntries가 **통째로 버린다.** 그래서 사건이 안 선다.
//   시험을 처음 쓸 때 이걸 빠뜨려 buildDayMemory가 null을 냈다 — 실제 capture_meta에는 들어 있다.
const cap = (h: number, key: string, label: string): CaptureLike =>
  ({ captureId: key, r2Key: key, capturedAt: at(h), targetLabel: label, targetType: 'x',
     byeoliAction: 'watch', diaryLines: [`${label}을 보았다`] });

test('접히기 전에도 오늘 캡처만으로 그날의 사진을 정할 수 있다', () => {
  const todays = [cap(9, 'captures/walk/a.jpg', '나팔꽃'), cap(9, 'captures/walk/b.jpg', '나팔꽃'), cap(20, 'captures/walk/c.jpg', '평상')];
  const day = buildDayMemory(todays, '2026-07-29');
  assert.ok(day, '캡처가 있으면 하루가 세워진다');
  assert.ok(day.photoKey, '⚠ photoKey가 없으면 발행이 다시 임의 추첨으로 떨어진다');
  assert.ok(todays.some((c) => c.r2Key === day.photoKey), '오늘 찍은 것 중에서 고른다');

  // 23:30에 같은 캡처로 다시 세우면 같은 사진이어야 한다 — 그래야 글이 사진으로 붙는다
  assert.equal(buildDayMemory(todays, '2026-07-29')?.photoKey, day.photoKey, '같은 입력이면 같은 결과');
});

test('관찰이 없으면 하루도 없다 — 빈 사진을 지어내지 않는다', () => {
  assert.equal(buildDayMemory([], '2026-07-29'), null);
});

test('오늘 것만 걸러야 한다 — 어제 사진을 오늘 글에 걸면 안 된다', () => {
  const mixed: CaptureLike[] = [
    { captureId: 'y', r2Key: 'captures/walk/yesterday.jpg', capturedAt: Date.parse('2026-07-28T05:00:00Z'),
      targetLabel: '어제', diaryLines: ['어제를 보았다'] },
    cap(10, 'captures/walk/today.jpg', '오늘'),
  ];
  const todays = mixed.filter((c) => kstDate(c.capturedAt) === '2026-07-29');
  assert.deepEqual(todays.map((c) => c.r2Key), ['captures/walk/today.jpg']);
  assert.equal(buildDayMemory(todays, '2026-07-29')?.photoKey, 'captures/walk/today.jpg');
  // ⚠ 음성: 거르지 않으면 어제 것이 뽑힐 수 있다
  // ⚠ buildDayMemory 자체가 date로 한 번 거른다. 그래도 호출 쪽에서 거르는 습관을 지킨다 —
  //   같은 거름이 두 군데 있으면 한쪽이 바뀌어도 다른 쪽이 버틴다.
  assert.equal(buildDayMemory(mixed, '2026-07-29')?.photoKey, 'captures/walk/today.jpg');
});

test('diaryLines가 없으면 사건이 서지 않는다 — 이 조건을 잊으면 고침이 조용히 죽는다', () => {
  const noLines: CaptureLike[] = [{ captureId: 'n', r2Key: 'captures/walk/n.jpg', capturedAt: at(10), targetLabel: 'x' }];
  assert.equal(buildDayMemory(noLines, '2026-07-29'), null,
    '⚠ capture_meta에 diaryLines가 안 들어오는 날이 오면 발행 사진이 다시 임의 추첨이 된다');
});
