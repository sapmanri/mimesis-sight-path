// BUILD 429-D — Genome Runtime Package 테스트 (node --experimental-strip-types --test)
// 양성 통과만으론 불충분하다 — Identity를 지키는 장치는 반드시 음성 테스트로 검증한다
// (교훈: `undefined < 0.8`로 게이트가 조용히 꺼져 있던 사고).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  IDENTITY_AXES, DAILY_AXES, IDENTITY_GENOME, MAX_FOCUS, GENOME_VERSION,
  composeGenome, selectFrom, buildGenomeContext, provenance,
  SELECTION_POOL, PACK_SELECTION, GENERATION_SOURCES, FORM_KEYS, CORE_FORMS,
} from './_genome-identity.ts';

test('Identity 축과 Daily 축은 겹치지 않는다', () => {
  for (const d of DAILY_AXES) {
    assert.ok(!(IDENTITY_AXES as readonly string[]).includes(d), `Daily 축 "${d}"가 Identity에도 있다`);
  }
});

test('등록된 모든 팩은 Identity 축을 빠짐없이 갖는다', () => {
  for (const [name, profile] of Object.entries(IDENTITY_GENOME)) {
    for (const axis of IDENTITY_AXES) {
      assert.ok(profile[axis], `${name} 팩에 축 "${axis}"가 없다`);
    }
  }
});

test('composeGenome: Daily는 Identity를 덮어쓸 수 없다 (조용한 덮어쓰기 금지)', () => {
  const { rules, errors } = composeGenome('byeoli', { voice: 'jondaetmal', tempo: 'slow' });
  assert.equal(errors.length, 1);
  assert.match(errors[0], /voice/);
  assert.equal(rules?.voice, 'banmal');            // 고정값이 이겼다
  assert.equal(rules?.tempo, 'slow');              // Daily 축은 반영됐다
});

test('composeGenome: 같은 값을 다시 써도 위반이 아니다', () => {
  const { errors } = composeGenome('byeoli', { voice: 'banmal' });
  assert.deepEqual(errors, []);
});

test('composeGenome: 미등록 팩은 실패한다', () => {
  const { rules, errors } = composeGenome('no-such-pack', null);
  assert.equal(rules, null);
  assert.match(errors[0], /미등록/);
});

test('selectFrom: Daily는 순서만 바꾼다', () => {
  const { selected, errors } = selectFrom('byeoli', { focusOrder: ['distance', 'light'] });
  assert.deepEqual(errors, []);
  assert.deepEqual(selected, ['distance', 'light', 'movement', 'texture']);
});

test('selectFrom: Daily는 없던 것을 새로 보게 만들지 못한다', () => {
  const { selected, rejected, errors } = selectFrom('byeoli', { focusOrder: ['person', 'light'] });
  assert.deepEqual(rejected, ['person']);
  assert.equal(errors.length, 1);
  assert.ok(!selected?.includes('person' as never));
});

test('모든 팩의 Selection은 SELECTION_POOL 안에 있다', () => {
  for (const [pack, focuses] of Object.entries(PACK_SELECTION)) {
    for (const f of focuses) {
      assert.ok((SELECTION_POOL as readonly string[]).includes(f), `${pack}의 "${f}"가 POOL 밖이다`);
    }
  }
});

test('별이와 dry-report는 다른 것을 고른다 (Genome은 문체가 아니라 시선)', () => {
  const b = selectFrom('byeoli', null).selected ?? [];
  const d = selectFrom('dry-report', null).selected ?? [];
  assert.equal(b.filter((f) => d.includes(f)).length, 0, '두 팩이 같은 것을 보고 있다');
});

test('buildGenomeContext: 정상 조립', () => {
  const { context, result } = buildGenomeContext('byeoli', { tempo: 'slow' });
  assert.equal(result.pass, true);
  assert.deepEqual(result.errors, []);
  assert.equal(context?.identity.voice, 'banmal');
  assert.ok(context && context.selection.length <= MAX_FOCUS);
  assert.deepEqual(context?.observation.formKeys, FORM_KEYS);
});

test('buildGenomeContext: Identity 위반이면 계약을 세우지 않는다', () => {
  const { context, result } = buildGenomeContext('byeoli', { observer: 'third_person' });
  assert.equal(context, null);          // 조용히 덮어쓰느니 계약 없음
  assert.equal(result.pass, false);
  assert.match(result.errors[0], /observer/);
});

test('CORE_FORMS는 전부 FORM_GROUPS에 실재한다', () => {
  for (const f of CORE_FORMS) assert.ok(FORM_KEYS.includes(f), `CORE_FORM "${f}"에 대응하는 그룹이 없다`);
});

test('provenance: 출처가 기록된다 (genome을 탄 글인지 나중에 확인 가능해야)', () => {
  const p = provenance('genome-live', true);
  assert.deepEqual(p, { generationSource: 'genome-live', genomeVersion: GENOME_VERSION, validation: 'pass' });
  assert.equal(provenance('rule-fallback', false).validation, 'fail');
  assert.deepEqual([...GENERATION_SOURCES], ['genome-live', 'genome-book', 'rule-fallback']); // 우선순위 순서
});
