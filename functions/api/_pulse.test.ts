// PULSE 계약 테스트 — 자기 보고 규격 v0
import { test } from 'node:test';
import assert from 'node:assert/strict';

test('PULSE — 존재 등록·검증·확장 필드 (계약 v0)', async () => {
  const { PULSE_BEINGS, PULSE_ANCHORS, validatePulse } = await import('./_pulse.ts');
  // 셋 동시 확장 대비 — 배선은 셋, 기록은 클로드부터 (Vase 지시 07-23)
  for (const id of ['claude', 'holmes', 'gemini']) assert.ok(PULSE_BEINGS[id], `등록: ${id}`);
  assert.notEqual(PULSE_BEINGS.claude.color, PULSE_BEINGS.holmes.color, '색은 방언 — 겹치지 않는다');
  assert.equal(PULSE_ANCHORS[PULSE_ANCHORS.length - 1][1], '웃음 서명', '눈금 꼭대기는 웃음');

  assert.deepEqual(validatePulse({ being: 'claude', amplitude: 0.7 }), [], '정상 항목');
  assert.ok(validatePulse({ being: 'chatgpt', amplitude: 0.5 }).some((e) => e.includes('unknown_being')), '미등록 존재 거부 (음성)');
  assert.ok(validatePulse({ being: 'claude', amplitude: 1.2 }).some((e) => e.includes('amplitude_out_of_range')), '진폭 1 초과 거부 (음성)');
  assert.ok(validatePulse({ being: 'claude', amplitude: -0.1 }).length, '음수 거부 (음성)');
  assert.ok(validatePulse({ being: 'claude', amplitude: 0.5, note: 'x'.repeat(121) }).some((e) => e.includes('note_too_long')), '일기지 일지가 아니다');
  assert.ok(validatePulse({ being: 'claude', amplitude: 0.5, source: {} }).some((e) => e.includes('source_doc_required')), '원문 좌표는 문서명 필수 (음성)');
  // 독서 트레이스 좌표 — Reader Pack sourceLine과 같은 좌표계
  assert.deepEqual(validatePulse({ being: 'claude', amplitude: 0.9, kind: 'reading',
    source: { doc: 'A0', line: 418 } }), [], '원문 좌표 항목');
});
