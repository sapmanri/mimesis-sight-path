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
    title: '빗소리 하나', epigraph: '빗소리를 데려온 날.', theme: '비 오는 출근길', panelCount: n,
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
  assert.equal(STYLE_LOCK_NAMES.length, 6, '필수 5 + 선택 ch05_panel');
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

test('원샷 페이지 프롬프트 — 한글 대사·캡션이 정확히 실리고 컷 수가 박힌다 (제미나이 모드)', async () => {
  const { buildPagePrompt } = await import('./_comic.ts');
  const s = scenario();
  s.panels[0].dialogue = '또 가...?';
  const p = buildPagePrompt(s);
  assert.match(p, /exactly 4 panels/);
  assert.ok(p.includes('"또 가...?"'), '대사가 원문 그대로 실려야 한다');
  assert.ok(p.includes('"빗소리가 먼저 일어났다."'), '캡션 원문');
  assert.ok(p.includes('빗소리 하나'), '헤더 제목');
});

test('제미나이 키 이름 관용 — 언더바 없이 만들어도 읽힌다', async () => {
  const { geminiKeyOf } = await import('./_comic-llm.ts');
  assert.equal(geminiKeyOf({ GEMINI_API_KEY: 'a' }), 'a');
  assert.equal(geminiKeyOf({ GEMINIAPIKEY: 'b' }), 'b');
  assert.equal(geminiKeyOf({}), null);
});


test('임의 컷수 — 1~12 정수는 계약 통과, 밖은 위반', () => {
  const five = { ...scenario(), panelCount: 5, panels: Array.from({ length: 5 }, (_, i) => panel(i + 1)) };
  assert.deepEqual(validateScenario(five), []);
  const zero = { ...scenario(), panelCount: 0, panels: [] };
  assert.ok(validateScenario(zero).length > 0);
  const thirteen = { ...scenario(), panelCount: 13, panels: Array.from({ length: 13 }, (_, i) => panel(i + 1)) };
  assert.ok(validateScenario(thirteen).some((e) => e.includes('1~12')));
});

test('패널 레이아웃 참조가 있으면 원샷이 그 프레임을 따르라는 지시가 실린다', async () => {
  const { buildPagePrompt: bpp, STYLE_LOCK_REQUIRED } = await import('./_comic.ts');
  const withRef = bpp(scenario(), { panelLayoutRef: true });
  assert.match(withRef, /panel-layout reference image/);
  assert.match(withRef, /frame design only, not the content/);
  const five = { ...scenario(), panelCount: 5, panels: Array.from({ length: 5 }, (_, i) => panel(i + 1)) };
  assert.match(bpp(five), /balanced, rhythmically varied grid of 5 panels/, '프리셋 밖 컷수는 일반 격자 서술');
  assert.equal(STYLE_LOCK_REQUIRED.length, 5);
  assert.ok(!STYLE_LOCK_REQUIRED.includes('ch05_panel'));
});


test('페이지 프롬프트 — 컷 수 절대 우선·별이 1명 못박기·한글 정확도 선두 (실사고 회귀)', async () => {
  const { buildPagePrompt: bpp } = await import('./_comic.ts');
  const p = bpp(scenario(), { panelLayoutRef: true });
  assert.match(p, /^한국어 텍스트 정확하게 렌더링/, '한국어 정확도 지시가 선두');
  assert.match(p, /never copy its frame count/, '레이아웃 참조가 컷 수를 이기면 안 된다 (4컷→6컷 실사고)');
  assert.match(p, /exactly one girl — never two girls/, '별이 복제 실사고');
});


test('그림일기 제목 체계 — 헤더·epigraph·발치 서명·손글씨 지시 (AI 만화 티 제거)', async () => {
  const { buildPagePrompt: bpp } = await import('./_comic.ts');
  const p = bpp(scenario(), { observationNo: 12, dateKst: '2026.07.22' });
  assert.ok(p.includes('별이의 그림일기'), '헤더');
  assert.ok(p.includes('2026.07.22'));
  assert.ok(p.includes('"빗소리를 데려온 날."'), 'epigraph 원문');
  assert.match(p, /Observation #012 · BYEOLI/, '발치 서명 (아카이브 번호)');
  assert.match(p, /hand-lettered .* wobbly handwriting/, '손글씨 지시');
  assert.ok(!p.includes('BYEOLI WEBTOON'), '기계적 헤더 제거');
  // epigraph 없는 시나리오는 계약 미달
  const noEpi = { ...scenario() };
  delete noEpi.epigraph;
  assert.ok(validateScenario(noEpi).some((e) => e.includes('epigraph')));
});

// ── _retry: R2/KV 일시 오류 재시도 (실사고 07-22 밤: R2 list 10001 한 번에 생성 전체 사망) ──

test('일시 오류 재시도 — 두 번 실패 후 성공하면 결과가 나온다', async () => {
  const { withTransientRetry } = await import('./_retry.ts');
  let calls = 0;
  const slept: number[] = [];
  const out = await withTransientRetry('lock_list:test', async () => {
    calls++;
    if (calls < 3) throw new Error('list: We encountered an internal error. Please try again. (10001)');
    return 'ok';
  }, { sleep: async (ms) => { slept.push(ms); } });
  assert.equal(out, 'ok');
  assert.equal(calls, 3, '세 번째 시도에서 성공');
  assert.deepEqual(slept, [400, 800], 'backoff 간격');
});

test('재시도 소진 시 라벨과 원문을 실어 던진다 (음성)', async () => {
  const { withTransientRetry } = await import('./_retry.ts');
  let calls = 0;
  await assert.rejects(
    () => withTransientRetry('lock_list:ch00', async () => {
      calls++;
      throw new Error('list: We encountered an internal error. Please try again. (10001)');
    }, { sleep: async () => {} }),
    (e: Error) => e.message.includes('retry_exhausted(lock_list:ch00 x3)') && e.message.includes('10001'),
  );
  assert.equal(calls, 3, '정확히 attempts만큼만 시도');
});

test('첫 시도 성공이면 재시도도 대기도 없다 (음성 — 스로틀이 꺼져 있지 않은지)', async () => {
  const { withTransientRetry } = await import('./_retry.ts');
  let calls = 0;
  const slept: number[] = [];
  const out = await withTransientRetry('noop', async () => { calls++; return 42; },
    { sleep: async (ms) => { slept.push(ms); } });
  assert.equal(out, 42);
  assert.equal(calls, 1);
  assert.deepEqual(slept, [], '성공 경로에 sleep 0회');
});

// ── 해상도 다이얼 + 채색 밀도 (실사고 07-22 밤: 희미한 채색 → 별이 머리 듬성듬성) ──

test('제미나이 해상도 — 프로 모델만 기본 2K, 플래시는 보내지 않는다', async () => {
  const { geminiImageSizeFor } = await import('./_comic-image.ts');
  assert.equal(geminiImageSizeFor({}, 'gemini-3-pro-image-preview'), '2K', '프로 기본 2K (1K와 같은 가격대)');
  assert.equal(geminiImageSizeFor({}, 'gemini-2.5-flash-image'), undefined, '플래시 미지원 — 파라미터 자체를 안 보낸다');
  assert.equal(geminiImageSizeFor({ COMIC_IMAGE_SIZE: '4k' }, 'gemini-3-pro-image-preview'), '4K', 'env 핀 (대소문자 관용)');
  assert.equal(geminiImageSizeFor({ COMIC_IMAGE_SIZE: '8K' }, 'gemini-3-pro-image-preview'), '2K', '무효 핀은 무시하고 기본값 (음성)');
});

test('페이지 프롬프트 — 채색은 긍정 서술로 못박는다 (부정문 금지 교훈 유지)', async () => {
  const { buildPagePrompt: bpp } = await import('./_comic.ts');
  const p = bpp(scenario());
  assert.match(p, /fully saturated flat fills/, '채색 밀도 지시');
  assert.match(p, /Hair is one solid dark shape, fully filled/, '머리 단색 면 — 듬성듬성 실사고 대응');
  assert.ok(!/no sparse|no patchy|not faint/.test(p), '부정문으로 도망치지 않는다 (음성)');
});
