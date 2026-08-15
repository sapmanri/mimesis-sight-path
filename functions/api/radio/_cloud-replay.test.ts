import test from 'node:test';
import assert from 'node:assert/strict';
import {
  cloudReplayNow,
  loadLatestCloudReplay,
  radioR2Key,
  resolvedByteRange,
  selectLatestCompletedReplay,
} from './_cloud-replay.ts';
import { DAY_KEY, DAYS_KEY, PROGRAM_KEY, type ProgramSegment } from '../_station.ts';

const audio = (id: string, startAt: number, dur = 60, kind: ProgramSegment['kind'] = 'talk'): ProgramSegment => ({
  id,
  kind,
  startAt,
  dur,
  title: id,
  url: `https://pub-8ec6440aae5545379fcfdd50a243847a.r2.dev/radio/${id}.m4a`,
});

test('newest completed broadcast wins while current and future audio stay out', () => {
  const now = 1_000_000;
  const selected = selectLatestCompletedReplay([
    audio('old', 100_000),
    audio('newest-complete', 800_000, 100),
    audio('still-airing', 950_000, 100),
    audio('future', 1_100_000),
  ], now);
  assert.equal(selected?.id, 'newest-complete');
});

test('ambient and foreign URLs can never become the public replay', () => {
  const foreign = audio('foreign', 900_000);
  foreign.url = 'https://example.com/radio/foreign.m4a';
  assert.equal(selectLatestCompletedReplay([
    audio('room', 950_000, 10, 'ambient'),
    foreign,
    audio('safe', 800_000),
  ], 1_000_000)?.id, 'safe');
  assert.equal(radioR2Key(foreign.url), null);
  assert.equal(radioR2Key(audio('safe', 1).url), 'radio/safe.m4a');
});

test('permanent archive is used when the rolling programme window is empty', async () => {
  const values = new Map<string, string>([
    [PROGRAM_KEY, '[]'],
    [DAYS_KEY, JSON.stringify(['2026-08-13', '2026-08-14'])],
    [DAY_KEY('2026-08-14'), JSON.stringify([audio('archive-new', 800_000)])],
  ]);
  const replay = await loadLatestCloudReplay({
    PLANET: { get: async (key: string) => values.get(key) ?? null },
  }, 1_000_000);
  assert.equal(replay?.id, 'archive-new');
});

test('cloud replay metadata is explicitly replay, never fake live', () => {
  const now = cloudReplayNow(audio('latest', 800_000), 'origin_unavailable');
  assert.equal(now.mode, 'replay');
  assert.equal(now.isReplay, true);
  assert.equal(now.cloudFallback, true);
  assert.equal(now.available, true);
  assert.equal('startedAt' in now, false, 'old wall-clock position must not drive current subtitle progress');
});

test('R2 byte ranges are normalized for ordinary and suffix requests', () => {
  assert.deepEqual(resolvedByteRange({ offset: 10, length: 20 }, 100), { offset: 10, length: 20 });
  assert.deepEqual(resolvedByteRange({ suffix: 25 }, 100), { offset: 75, length: 25 });
  assert.deepEqual(resolvedByteRange({ offset: 90 }, 100), { offset: 90, length: 10 });
});
