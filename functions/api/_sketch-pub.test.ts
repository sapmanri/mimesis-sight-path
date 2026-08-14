import test from 'node:test';
import assert from 'node:assert/strict';
import { alreadyPublished, recommendedSketchKey } from './_sketch-pub.ts';

test('판정기가 고른 1-based pick을 정확한 그림 키로 바꾼다', () => {
  const reco = {
    status: 'done',
    picks: [
      { seed: 1, r2Key: 'sketch-trials/a.png' },
      { seed: 2, r2Key: 'sketch-trials/b.png' },
      { seed: 3, r2Key: 'sketch-trials/c.png' },
    ],
    reco: { pick: 2, reasons: '둘째', verdicts: ['a', 'b', 'c'] },
  };
  assert.equal(recommendedSketchKey(reco), 'sketch-trials/b.png');
});

test('불완전 판정·전부 불합격·시험 폴더 밖 키는 자동 발행하지 않는다', () => {
  assert.equal(recommendedSketchKey({ status: 'images_ready', picks: [], reco: { pick: 1 } }), null);
  assert.equal(recommendedSketchKey({ status: 'done', picks: [{ r2Key: 'sketch-trials/a.png' }], reco: { pick: 0 } }), null);
  assert.equal(recommendedSketchKey({ status: 'done', picks: [{ r2Key: 'captures/a.png' }], reco: { pick: 1 } }), null);
});

test('하루 1장 상한은 성공만 세고 실패는 재시도를 허용한다', () => {
  assert.equal(alreadyPublished([{ date: '2026-08-14', ok: false }], '2026-08-14'), false);
  assert.equal(alreadyPublished([{ date: '2026-08-14', ok: true }], '2026-08-14'), true);
});
