// 음악 발행 시험 — ⚠ **막아야 할 것을 막는지**를 본다. 통과만 보는 건 부족하다.
//
// 이 파이프라인은 2026-07-30까지 「재생목록까지」에서 끊겨 있었다. _music-night 이
// threadText 를 만들어 돌려주는데 아무도 받지 않았고, 밤 결과가 KV에 남지도 않았다.
// 여기서 보는 것은 그 두 자리다 — **남는가**, 그리고 **아무 때나 나가지 않는가.**

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nightKey, saveNight, readNight, type NightReceipt } from './_music-night.ts';

/** KV 흉내 — 넣은 것만 나온다. TTL은 값을 바꾸지 않으므로 무시한다. */
function fakeKV() {
  const m = new Map<string, string>();
  return {
    store: m,
    PLANET: {
      get: async (k: string) => (m.has(k) ? m.get(k)! : null),
      put: async (k: string, v: string) => { m.set(k, v); },
    },
  } as any;
}

const receipt = (over: Partial<NightReceipt> = {}): NightReceipt => ({
  date: '2026-07-30', pack: 'byeoli', rest: null, step: 'done', error: null,
  queries: [], read: [], onShelf: [], notOnShelf: [], archive: null,
  playlistUrl: 'https://www.youtube.com/playlist?list=PL1', threadText: '오늘은 이런 소리였다.',
  notes: [], ...over,
});

test('밤 결과가 남는다 — 발행은 다른 날에 일어날 수 있다', async () => {
  const env = fakeKV();
  await saveNight(env, receipt());
  assert.ok(env.store.has(nightKey('2026-07-30')), '⚠ 저장되지 않으면 발행이 꺼낼 것이 없다');
  const back = await readNight(env, '2026-07-30');
  assert.equal(back?.threadText, '오늘은 이런 소리였다.');
  assert.equal(back?.playlistUrl, 'https://www.youtube.com/playlist?list=PL1');
});

test('없는 날은 null — 오류와 구분된다', async () => {
  assert.equal(await readNight(fakeKV(), '2026-01-01'), null);
});

test('깨진 값은 조용히 통과시키지 않는다', async () => {
  const env = fakeKV();
  env.store.set(nightKey('2026-07-30'), '{깨짐');
  // ⚠ 던져서 발행을 멈추거나, null 로 막거나 — 둘 중 하나여야 한다. 반쯤 읽힌 밤은 안 된다.
  assert.equal(await readNight(env, '2026-07-30'), null);
});

test('날짜마다 따로 남는다 — 어제 것을 오늘 것으로 올리지 않는다', async () => {
  const env = fakeKV();
  await saveNight(env, receipt({ date: '2026-07-29', threadText: '어제' }));
  await saveNight(env, receipt({ date: '2026-07-30', threadText: '오늘' }));
  assert.equal((await readNight(env, '2026-07-29'))?.threadText, '어제');
  assert.equal((await readNight(env, '2026-07-30'))?.threadText, '오늘');
});

/* ── 나가면 안 되는 밤 ────────────────────────────────────────
   music-publish 의 blockedWhy 와 같은 판정. 여기서 막히지 않으면
   조사가 실패한 날에도 스레드가 나간다. */
function blockedWhy(n: NightReceipt | null): string | null {
  if (!n) return 'no_night';
  if (n.rest) return 'rest';
  if (n.step !== 'done') return 'not_done';
  if (!n.threadText?.trim()) return 'no_text';
  return null;
}

test('⚠ 막아야 할 밤은 막는다', () => {
  assert.equal(blockedWhy(null), 'no_night', '안 돌린 날');
  assert.equal(blockedWhy(receipt({ rest: 'no_day' })), 'rest', '관찰이 없으면 선곡도 없다');
  assert.equal(blockedWhy(receipt({ step: 'curate', error: 'nothing_chosen' })), 'not_done', '중간에 멈춘 밤');
  assert.equal(blockedWhy(receipt({ threadText: '' })), 'no_text', '별이가 할 말을 못 만든 밤');
  assert.equal(blockedWhy(receipt({ threadText: '   ' })), 'no_text', '공백만 있는 것도 말이 아니다');
});

test('나갈 수 있는 밤은 막지 않는다', () => {
  assert.equal(blockedWhy(receipt()), null);
  // 재생목록이 없어도 문장이 있으면 나간다 — dry 로 돌린 밤도 올릴 수 있어야 한다
  assert.equal(blockedWhy(receipt({ playlistUrl: null })), null);
});
