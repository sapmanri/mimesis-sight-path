// BUILD 431-M2 — 공통 저장 계약 테스트
// 이 단계의 계약은 "기억을 잘 만든다"가 아니라 **"자율 시스템을 해치지 않는다"**이다.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  appendCaptureMeta, normalizeObservation, observationIdOf, isDuplicate,
  CAPTURE_META_KEY, CAPTURE_META_KEEP, type MemoryObservation,
} from './_capture-meta.ts';
import { capturesToEntries, buildDayMemory } from './_memory-event.ts';

/** 최소 KV 스텁 */
function kv(initial: unknown = null) {
  let store = initial === null ? null : JSON.stringify(initial);
  return {
    calls: { put: 0 },
    async get(k: string) { return k === CAPTURE_META_KEY ? store : null; },
    async put(k: string, v: string) { if (k === CAPTURE_META_KEY) { store = v; this.calls.put++; } },
    read(): MemoryObservation[] { return store ? JSON.parse(store) : []; },
  };
}

const base = {
  observationId: 'x', source: 'autopost' as const, observedAt: 1_800_000_000_000,
  diaryLines: ['라벤더가 기울어 있었다.'],
};

test('observationId는 멱등 키다 — 같은 실행·같은 원천이면 같은 값', () => {
  const a = observationIdOf('autopost', 'run-1', 'cap-9', 111);
  assert.equal(a, observationIdOf('autopost', 'run-1', 'cap-9', 111));
  assert.notEqual(a, observationIdOf('autopost', 'run-2', 'cap-9', 111));
  assert.notEqual(a, observationIdOf('ops-capture', 'run-1', 'cap-9', 111));
});

test('출처가 기록된다 — 무엇이 자동이고 무엇이 수동인지 가려야 한다', () => {
  const r = normalizeObservation({ ...base, source: 'autopost', sourceRunId: 'autopost_1' });
  assert.equal(r.source, 'autopost');
  assert.equal(r.sourceRunId, 'autopost_1');
  assert.equal(normalizeObservation({ ...base, source: 'ops-capture' }).sourceRunId, null);
});

test('capturedAt 하위 호환 — 기존 독자를 깨지 않는다', () => {
  const r = normalizeObservation(base);
  assert.equal(r.capturedAt, r.observedAt, 'observedAt과 항상 같아야 한다');
});

test('append는 저장만 한다 — 같은 id는 두 번 쌓이지 않는다', async () => {
  const env = { PLANET: kv([]) as never };
  const obs = { ...base, observationId: observationIdOf('autopost', 'run-1', 'cap-1', 100) };
  const first = await appendCaptureMeta(env, obs);
  const second = await appendCaptureMeta(env, obs);
  assert.equal(first.duplicate, false);
  assert.equal(second.duplicate, true, '크론 재시도가 기억을 두 번 남기면 안 된다');
  assert.equal((env.PLANET as unknown as ReturnType<typeof kv>).read().length, 1);
});

test('append 실패가 던지지 않는다 — 발행 성공을 뒤집으면 안 된다', async () => {
  const broken = { PLANET: { async get() { throw new Error('kv down'); }, async put() {} } as never };
  const r = await appendCaptureMeta(broken, { ...base, observationId: 'y' });
  assert.equal(r.ok, false);
  assert.match(r.reason ?? '', /kv down/);
});

test('상한을 지킨다 (오래된 것부터 흘려보냄)', async () => {
  const many = Array.from({ length: CAPTURE_META_KEEP }, (_, i) => ({ observationId: `old-${i}` }));
  const env = { PLANET: kv(many) as never };
  await appendCaptureMeta(env, { ...base, observationId: 'new' });
  const list = (env.PLANET as unknown as ReturnType<typeof kv>).read();
  assert.equal(list.length, CAPTURE_META_KEEP);
  assert.equal(list[0].observationId, 'new');
});

/* ── 승인 조건: 중복 메타가 밀집도 점수를 왜곡하지 않는다 ── */

test('회귀: 같은 순간이 중복 저장돼도 밀집도가 부풀지 않는다', async () => {
  const at = Date.parse('2026-07-20T01:00:00Z');
  const dup = {
    ...base, observationId: observationIdOf('autopost', 'run-1', 'cap-1', at),
    captureId: 'cap-1', capturedAt: at, observedAt: at, targetLabel: '라벤더',
  };
  const env = { PLANET: kv([]) as never };
  // 크론이 세 번 재시도했다고 가정
  await appendCaptureMeta(env, dup);
  await appendCaptureMeta(env, dup);
  await appendCaptureMeta(env, dup);
  const stored = (env.PLANET as unknown as ReturnType<typeof kv>).read();
  assert.equal(stored.length, 1, '멱등 키가 막아야 한다');

  // 밀집도(그 순간 주변 관찰 줄 수)가 1을 넘으면 안 된다
  const entries = capturesToEntries(stored, '2026-07-20');
  assert.equal(entries[0].duration, 1, '중복이 머무름을 부풀리면 엉뚱한 순간이 뽑힌다');

  // 대조: 멱등 키 없이 세 번 쌓였다면 밀집도가 3으로 부푼다 (막아야 하는 상태)
  const naive = [dup, { ...dup, observationId: 'a' }, { ...dup, observationId: 'b' }];
  assert.equal(capturesToEntries(naive as never, '2026-07-20')[0].duration, 3);
});

test('회귀: 중복이 하루 기억의 선택을 바꾸지 않는다', () => {
  const at = Date.parse('2026-07-20T01:00:00Z');
  const real = { captureId: 'c1', capturedAt: at, targetLabel: '라벤더', diaryLines: ['기울어 있었다.', '바람은 없었다.'] };
  const other = { captureId: 'c2', capturedAt: at + 40 * 60_000, targetLabel: '벤치', diaryLines: ['따뜻했다.'] };
  const clean = buildDayMemory([real, other], '2026-07-20')!;
  // c2가 세 번 중복되면(멱등 실패 시) 벤치가 이겨버린다 — 그걸 막는 것이 목적
  const polluted = buildDayMemory([real, other, { ...other }, { ...other }], '2026-07-20')!;
  assert.equal(clean.event.targetLabel, '라벤더');
  assert.notEqual(polluted.event.targetLabel, clean.event.targetLabel,
    '중복이 남으면 선택이 뒤집힌다 — 그래서 멱등 키가 필수다');
});

test('isDuplicate는 id만 본다 (내용이 달라도 같은 실행이면 중복)', () => {
  const list = [{ observationId: 'k' }] as MemoryObservation[];
  assert.equal(isDuplicate(list, 'k'), true);
  assert.equal(isDuplicate(list, 'other'), false);
});
