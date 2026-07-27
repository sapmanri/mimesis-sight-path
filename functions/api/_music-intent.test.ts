// 검색 의도 계약 테스트 — 게놈이 검색어를 정한다
import { test } from 'node:test';
import assert from 'node:assert/strict';

const TODAY = '2026-07-27';
const NOW = 1785000000000;

/** 별이의 오늘 — Vase의 예시 그대로: 빼콩이를 기다렸지만 만나지 못한 흐린 아침 */
const day = {
  version: '431M-v1', memoryEventId: 'e1', sourceCaptureIds: ['c1'],
  date: TODAY, builtAt: NOW, momentCount: 12, photoKey: null, density: 'normal',
  event: {
    date: TODAY, momentAt: NOW, targetLabel: '누군가 앉았던 빈 의자', targetType: 'chair',
    lines: ['🪑 오래된 나무 의자에 앉음', '🐈 빼콩이를 기다렸지만 만나지 못함', '☁️ 흐린 아침에 책을 조금 읽음'],
    density: 'normal', diaryText: null, selectedPhoto: null, sketchDiary: null,
  },
} as never;

const emptyArch = { version: 1 as const, updatedAt: 0, songs: {} };

test('쉬는 날 — 관찰이 없으면 선곡도 없다', async () => {
  const { restReason, buildIntent } = await import('./_music-intent.ts');

  assert.equal(restReason(null), 'no_day');
  assert.equal(restReason({ ...day, event: { ...(day as never as typeof day).event, lines: [] } } as never), 'no_observations',
    '⚠ 빈 하루를 지어내지 않는다 — 그림일기·심전도와 같은 규칙');
  assert.equal(restReason({ ...day, event: { ...(day as never as typeof day).event, targetLabel: null, lines: ['한 줄뿐'] } } as never),
    'too_thin', '재료가 너무 얇으면 쉰다');
  assert.equal(restReason(day), null, '오늘은 찾을 만하다');

  const r = buildIntent({ day: { ...day, event: { ...(day as never as typeof day).event, lines: [] } } as never,
    pack: 'byeoli', archive: emptyArch, todayKst: TODAY });
  assert.equal(r.intent, null, '쉬는 날엔 의도를 만들지 않는다');
  assert.equal(r.rest, 'no_observations');
});

test('⚠ 핵심 — 같은 하루라도 팩이 다르면 다른 방향을 찾는다', async () => {
  const { buildIntent } = await import('./_music-intent.ts');

  const b = buildIntent({ day, pack: 'byeoli', archive: emptyArch, todayKst: TODAY }).intent!;
  const d = buildIntent({ day, pack: 'dry-report', archive: emptyArch, todayKst: TODAY }).intent!;

  // 같은 빈 의자를 봤는데
  assert.equal(b.centralImage, d.centralImage, '중심 장면은 같다 — 같은 하루니까');
  // 보는 방향이 다르다
  assert.deepEqual(b.focusOrder, ['light', 'movement', 'texture', 'distance'], '별이는 빛·움직임·결·거리를 본다');
  assert.deepEqual(d.focusOrder, ['quantity', 'position', 'object'], '건조 보고는 양·위치·사물을 본다');

  const bt = new Set(b.seek.map((s) => s.term));
  const dt = new Set(d.seek.map((s) => s.term));
  assert.ok(bt.has('소리의 결'), '별이는 결을 찾는다');
  assert.ok(!dt.has('소리의 결'), '건조 보고는 결을 안 찾는다');
  assert.ok(dt.has('쌓인 것'), '건조 보고는 양을 찾는다');
  assert.ok(!bt.has('쌓인 것'), '별이는 양을 안 찾는다');

  assert.notDeepEqual(b.avoid, d.avoid, '피하는 것도 팩마다 다르다');
  assert.ok(b.avoid.includes('직접적인 위로'), '별이는 직접적인 위로를 피한다');
});

test('검색어에는 출처가 붙는다 — 지어내지 않는다', async () => {
  const { buildIntent } = await import('./_music-intent.ts');
  const { intent } = buildIntent({ day, pack: 'byeoli', archive: emptyArch, todayKst: TODAY });

  assert.ok(intent!.seek.length > 0);
  for (const s of intent!.seek) {
    assert.ok(s.term && s.from && s.because, '모든 항목이 term·from·because를 갖는다');
    assert.ok(intent!.material.includes(s.because), '⚠ because는 오늘 실제 관찰 줄이어야 한다');
    assert.ok(intent!.focusOrder.includes(s.from), 'from은 게놈이 허용한 초점이어야 한다');
  }
});

test('오늘은 순서만 바꾼다 — 없던 초점을 새로 보진 못한다', async () => {
  const { buildIntent } = await import('./_music-intent.ts');

  const moved = buildIntent({ day, pack: 'byeoli', focusOrder: ['texture'], archive: emptyArch, todayKst: TODAY }).intent!;
  assert.equal(moved.focusOrder[0], 'texture', '오늘 결을 먼저 보기로 했으면 앞으로 온다');
  assert.deepEqual([...moved.focusOrder].sort(), ['distance', 'light', 'movement', 'texture'], '구성은 그대로');

  // 게놈에 없는 초점을 오늘이 요구하면 거부되고 그 사실이 남는다
  const bad = buildIntent({ day, pack: 'byeoli', focusOrder: ['quantity'], archive: emptyArch, todayKst: TODAY });
  assert.ok(!bad.intent!.focusOrder.includes('quantity' as never), '⚠ 없던 것을 새로 보게 만들 수 없다');
  assert.ok(bad.errors.some((e) => e.includes('quantity')), '거부된 사실이 조용히 사라지지 않는다');
});

test('저장소가 탐색에 실제로 영향을 준다', async () => {
  const { buildIntent, screen } = await import('./_music-intent.ts');
  const { emptyArchive, mergeSong, songKey } = await import('./_song-archive.ts');

  const recent = { key: '', title: '어제곡', artist: 'A', verdict: 'chosen' as const,
    firstSeenAt: NOW, lastTouchedAt: NOW,
    chosen: [{ date: '2026-07-26', role: 'center' as const, because: '어제와 닮았다' }] };
  recent.key = songKey(recent);
  const rejected = { key: '', title: '밝은곡', artist: 'B', verdict: 'rejected' as const,
    rejectedReason: '오늘보다 지나치게 밝다', firstSeenAt: NOW, lastTouchedAt: NOW, chosen: [] };
  rejected.key = songKey(rejected);

  let arch = mergeSong(emptyArchive(), recent, NOW);
  arch = mergeSong(arch, rejected, NOW);

  const { intent } = buildIntent({ day, pack: 'byeoli', archive: arch, todayKst: TODAY });
  assert.ok(intent!.excludeKeys.includes(recent.key), '최근 고른 곡은 미리 제외된다');

  assert.deepEqual(screen({ key: recent.key, title: '어제곡', artist: 'A' }, intent!, arch),
    { keep: false, why: 'recently_chosen' });

  // ⚠ 이게 저장소를 두는 이유 — 같은 조사를 두 번 하지 않는다
  const r = screen({ key: rejected.key, title: '밝은곡', artist: 'B' }, intent!, arch);
  assert.equal(r.keep, false);
  assert.match(r.why!, /rejected_before: 오늘보다 지나치게 밝다/, '전에 탈락시킨 사유를 그대로 들고 온다');

  assert.deepEqual(screen({ key: 'name:c|처음보는곡', title: '처음보는곡', artist: 'C' }, intent!, arch),
    { keep: true, why: null }, '처음 보는 곡은 통과');
});

test('피하기로 한 것은 후보 단계에서 걸러진다', async () => {
  const { buildIntent, screen } = await import('./_music-intent.ts');
  const { intent } = buildIntent({ day, pack: 'byeoli', archive: emptyArch, todayKst: TODAY });

  const r = screen({ key: 'name:x|y', title: '이별가', artist: 'X', note: '절망적인 이별을 노래한다' }, intent!, emptyArch);
  assert.equal(r.keep, false);
  assert.match(r.why!, /avoid: 절망적인 이별/);
});
