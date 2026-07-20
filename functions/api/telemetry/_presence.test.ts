// BUILD 431-P — presence KV 쓰기 예산 회귀 테스트 (Vase 승인 조건 7·8)
// 계약: "기억을 잘 센다"가 아니라 **"자율 시스템의 KV 예산을 먹지 않는다"**.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ACTIVE_TTL_S, BEAT_INTERVAL_MS, MIN_BEAT_MS, kstDay, expectedWritesPerTabPerDay,
} from './presence.ts';

const FREE_KV_WRITES_PER_DAY = 1000;
/** 자율 시스템(feed·capture_meta·world_event_schedule·threads_auth) 몫 */
const RESERVED_FOR_AUTONOMOUS = 500;

test('탭 1개 하루 쓰기 예산 — 289건 (수정 전 2,880건)', () => {
  assert.equal(expectedWritesPerTabPerDay(), 289, '288 heartbeat + 1 첫 진입');
  // 수정 전: 60초 주기 × 쓰기 2건
  const before = Math.floor((24 * 3600_000) / 60_000) * 2;
  assert.equal(before, 2880);
  assert.ok(before > FREE_KV_WRITES_PER_DAY, '수정 전에는 탭 하나로 한도를 넘겼다');
});

test('자율 시스템 몫 500건 이상을 남긴다 (승인 조건 8)', () => {
  const headroom = FREE_KV_WRITES_PER_DAY - expectedWritesPerTabPerDay();
  assert.ok(headroom >= RESERVED_FOR_AUTONOMOUS,
    `여유 ${headroom} < ${RESERVED_FOR_AUTONOMOUS} — feed 발행이 죽을 수 있다`);
});

test('탭 2개까지도 한도 안에 들어온다', () => {
  assert.ok(expectedWritesPerTabPerDay() * 2 < FREE_KV_WRITES_PER_DAY - 300);
});

test('TTL이 heartbeat 주기보다 길다 — 접속 표시가 깜빡이지 않는다', () => {
  assert.ok(ACTIVE_TTL_S * 1000 > BEAT_INTERVAL_MS * 2,
    'TTL은 최소 두 박자 이상이어야 한 번 놓쳐도 꺼지지 않는다');
});

test('스로틀이 정상 주기를 막지 않는다 (하지만 폭주는 막는다)', () => {
  assert.ok(MIN_BEAT_MS < BEAT_INTERVAL_MS, '정상 heartbeat는 통과해야 한다');
  assert.ok(MIN_BEAT_MS > 60_000, '분당 여러 번 오는 폭주는 쓰기 없이 막아야 한다');
});

test('KST 경계 — 일 방문 집계가 UTC 기준으로 새지 않는다', () => {
  assert.equal(kstDay(Date.parse('2026-07-19T15:30:00Z')), '2026-07-20');
  assert.equal(kstDay(Date.parse('2026-07-19T14:00:00Z')), '2026-07-19');
});
