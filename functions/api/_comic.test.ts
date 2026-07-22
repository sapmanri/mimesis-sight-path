// BUILD 434-COMIC — 중간 산출물 계약 테스트
// 이 계약이 무너지면 두뇌·그림 어댑터 교체가 전부 무의미해진다. 계약이 곧 제품이다.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  validateScenario, pickStyleRefs, buildPanelPrompt, STYLE_LOCK_NAMES,
  type ComicScenario, type ComicPanel,
} from './_comic.ts';
import { extractJson, userPrompt } from './_comic-llm.ts';

function panel(i: number, over: Partial<ComicPanel> = {}): ComicPanel {
  return {
    index: i, location: 'bedroom', shot: 'medium', subject: 'rain on window',
    action: 'listens without getting up', expression: 'sleepy',
    ppaekong: 'looks toward window', dialogue: null, caption: '빗소리가 먼저 일어났다.',
    ...over,
  };
}
function scenario(n: 4 | 6 | 8 = 4): ComicScenario {
  return {
    title: '빗소리 하나', theme: '비 오는 출근길', panelCount: n,
    panels: Array.from({ length: n }, (_, i) => panel(i + 1)),
  };
}

test('정상 시나리오는 계약을 통과한다', () => {
  assert.deepEqual(validateScenario(scenario()), []);
});

test('컷 수 불일치·인덱스 어긋남은 계약 위반', () => {
  const s = scenario();
  s.panels.pop();
  assert.ok(validateScenario(s).length > 0);
  const s2 = scenario();
  s2.panels[1].index = 5;
  assert.ok(validateScenario(s2).some((e) => e.includes('index')));
});

test('시각 필드의 한글은 계약 위반 — 이미지 모델이 글자를 그린다', () => {
  const s = scenario();
  s.panels[0].action = '창밖을 본다';
  assert.ok(validateScenario(s).some((e) => e.includes('English')));
});

test('별이는 말이 적다 — 모든 컷에 대사가 있으면 위반', () => {
  const s = scenario();
  s.panels.forEach((p) => { p.dialogue = '응.'; });
  assert.ok(validateScenario(s).some((e) => e.includes('말이 적다')));
});

test('참조 선택 — 상시 3장 + 샷별 1장, 상한을 지킨다', () => {
  assert.deepEqual(pickStyleRefs('medium', 4),
    ['ch00_master', 'ch04_hair', 'ch03_pose', 'ch02_expression']);
  assert.deepEqual(pickStyleRefs('back', 4),
    ['ch00_master', 'ch04_hair', 'ch03_pose', 'ch01_turnaround']);
  assert.equal(pickStyleRefs('wide', 5).length, 5, 'GPT 어댑터는 5장 전부');
  assert.equal(pickStyleRefs('wide', 2).length, 2);
  assert.equal(STYLE_LOCK_NAMES.length, 5);
});

test('컷 프롬프트 — 한글·대사·캡션이 절대 들어가지 않는다 (글자는 조립 단계 몫)', () => {
  const p = buildPanelPrompt(panel(1, { dialogue: '왔네.', caption: '비가 왔다.' }));
  assert.ok(!/[가-힣]/.test(p), '한글이 샜다:\n' + p);
  assert.ok(!p.includes('왔네'));
  assert.match(p, /white cat/);
  const solo = buildPanelPrompt(panel(1, { ppaekong: null }));
  assert.match(solo, /not in this panel/);
});

test('extractJson — 코드펜스·서론이 섞여도 JSON만 뽑는다', () => {
  assert.deepEqual(extractJson('설명입니다\n```json\n{"a":1}\n```'), { a: 1 });
  assert.equal(extractJson('json 없음'), null);
  assert.ok(userPrompt('비', 4).includes('4'));
});

test('Style Lock 저장소는 바이블 5칸만 받는다 — 임의 이름 불가', async () => {
  const { isLockSlot, COMIC_LOCK_PREFIX } = await import('./ops/comic-style-lock.ts');
  assert.equal(isLockSlot('ch00_master'), true);
  assert.equal(isLockSlot('ch04_hair'), true);
  assert.equal(isLockSlot('byeoli_poses'), false, '그림실험실 참조는 여기 못 들어온다');
  assert.equal(isLockSlot('../captures/x'), false);
  assert.equal(isLockSlot(null), false);
  assert.ok(COMIC_LOCK_PREFIX.startsWith('comic/'), '그림실험실 prefix와 분리');
});

test('comicId는 결정론 — 컷별 호출이 같은 폴더에 모인다', async () => {
  const { comicIdOf, panelKey, COMIC_STRIP_PREFIX } = await import('./ops/comic-generate.ts');
  const s = scenario();
  assert.equal(comicIdOf(s), comicIdOf({ ...s, panels: [...s.panels] }));
  assert.notEqual(comicIdOf(s), comicIdOf({ ...s, title: '다른 제목' }));
  assert.ok(panelKey(comicIdOf(s), 3).startsWith(COMIC_STRIP_PREFIX));
});

test('comic-file은 comic/ 밖을 읽지 않는다', async () => {
  const { isComicKey } = await import('./ops/comic-file.ts');
  assert.equal(isComicKey('comic/strips/abc/p1.png'), true);
  assert.equal(isComicKey('comic/style-lock/ch00_master.png'), true);
  assert.equal(isComicKey('captures/walk/1.jpg'), false, '운영 캡처 금지');
  assert.equal(isComicKey('sketch-trials/x.png'), false, '그림실험실 금지 — 접점 0');
  assert.equal(isComicKey('comic/../captures/x.png'), false);
  assert.equal(isComicKey(null), false);
});

test('참조 상한 — flux 4장, gpt 5장', async () => {
  const { refCapFor } = await import('./_comic-image.ts');
  assert.equal(refCapFor('workers-ai'), 4);
  assert.equal(refCapFor('gpt'), 5);
});
