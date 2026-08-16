import test from 'node:test';
import assert from 'node:assert/strict';
import { PROGRAM_KEY, DAYS_KEY, type ProgramSegment } from '../_station.ts';
import { onRequestPost } from './program.ts';

const ORIGIN = 'https://pub-8ec6440aae5545379fcfdd50a243847a.r2.dev/radio/';

function fakeEnv() {
  const values = new Map<string, string>();
  const puts: { key: string; value: string }[] = [];
  return {
    values,
    puts,
    env: {
      PULSE_KEY: 'test-key',
      PLANET: {
        get: async (key: string) => values.get(key) ?? null,
        put: async (key: string, value: string) => {
          values.set(key, value);
          puts.push({ key, value });
        },
      },
    },
  };
}

const segment = (id: string, kind: ProgramSegment['kind'], dur: number) => ({
  id, kind, dur, url: `${ORIGIN}${id}.m4a`, title: id, pairId: 'plate-1',
});

test('한 판 배열은 전부 검증된 뒤 소개→낭독→곡 순서로 한 번에 공개된다', async () => {
  const fixture = fakeEnv();
  fixture.values.set(PROGRAM_KEY, '[]');
  fixture.values.set(DAYS_KEY, '[]');
  const response = await onRequestPost({
    request: new Request('https://radio.test/api/radio/program', {
      method: 'POST',
      headers: { 'X-Pulse-Key': 'test-key', 'content-type': 'application/json' },
      body: JSON.stringify({ segments: [
        segment('plate-1', 'talk', 30),
        segment('plate-1-reading', 'reading', 65),
        segment('plate-1-song', 'song', 180),
      ] }),
    }),
    env: fixture.env,
  } as never);
  const reply = await response.json() as { ok: boolean; batch: boolean };
  assert.deepEqual(reply, { ...reply, ok: true, batch: true });
  const programmeWrites = fixture.puts.filter((entry) => entry.key === PROGRAM_KEY);
  assert.equal(programmeWrites.length, 1, '공개 편성표는 한 번만 쓴다');
  const programme = JSON.parse(programmeWrites[0].value) as ProgramSegment[];
  assert.deepEqual(programme.map((item) => item.kind), ['talk', 'reading', 'song']);
  assert.equal(programme[1].startAt, programme[0].startAt + 30_000);
  assert.equal(programme[2].startAt, programme[1].startAt + 65_000);
});

test('낭독 실물이 잘못된 판은 소개 음성까지 전부 등록하지 않는다', async () => {
  const fixture = fakeEnv();
  fixture.values.set(PROGRAM_KEY, '[]');
  const response = await onRequestPost({
    request: new Request('https://radio.test/api/radio/program', {
      method: 'POST',
      headers: { 'X-Pulse-Key': 'test-key', 'content-type': 'application/json' },
      body: JSON.stringify({ segments: [
        segment('plate-2', 'talk', 30),
        { ...segment('plate-2-reading', 'reading', 65), url: 'https://example.com/missing.m4a' },
      ] }),
    }),
    env: fixture.env,
  } as never);
  assert.equal(response.status, 400);
  assert.equal(fixture.puts.some((entry) => entry.key === PROGRAM_KEY), false);
});

test('낭독보다 곡을 먼저 놓은 판도 전부 거부한다', async () => {
  const fixture = fakeEnv();
  fixture.values.set(PROGRAM_KEY, '[]');
  const response = await onRequestPost({
    request: new Request('https://radio.test/api/radio/program', {
      method: 'POST',
      headers: { 'X-Pulse-Key': 'test-key', 'content-type': 'application/json' },
      body: JSON.stringify({ segments: [
        segment('plate-3', 'talk', 30),
        { ...segment('plate-3-song', 'song', 180), pairId: 'plate-3' },
        { ...segment('plate-3-reading', 'reading', 65), pairId: 'plate-3' },
      ] }),
    }),
    env: fixture.env,
  } as never);
  assert.equal(response.status, 400);
  assert.equal(fixture.puts.some((entry) => entry.key === PROGRAM_KEY), false);
});
