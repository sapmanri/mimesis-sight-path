import test from 'node:test';
import assert from 'node:assert/strict';
import {
  decodeWebObservationShelf, mergeWebObservation, validateWebObservation,
  type WebObservationSource,
} from './_radio-observations.ts';
import { situationMessage, type RadioSituation } from './_radio.ts';

const NOW = 1_786_626_000_000;
const YOUTUBE: WebObservationSource = {
  id: 'sapmanri-youtube', label: '감성찾아삽만리 YouTube 공개 페이지', kind: 'youtube_channel',
  sourceUrl: 'https://www.youtube.com/@sapmanri/videos', fetchedAt: NOW - 1000,
  engine: 'crawl4ai', ownership: 'read_only',
  items: [{
    id: 'yt:abc12345678', title: '손으로 만드는 세계', text: '조회수 24회', when: '2일 전',
    url: 'https://www.youtube.com/watch?v=abc12345678',
  }],
};

test('Crawl4AI 범용 관측 — YouTube 공개 페이지 텍스트를 읽기 전용으로 받는다', () => {
  const checked = validateWebObservation(YOUTUBE, NOW);
  assert.equal(checked.ok, true);
  if (checked.ok) assert.equal(checked.source.items[0].title, '손으로 만드는 세계');
});

test('범용 관측에 Threads를 넣지 않는다 — 자기 계정은 Meta API, 외부 웹툰은 전용선', () => {
  for (const url of ['https://www.threads.com/@byeoli_log', 'https://www.threads.com/@byeol.toon']) {
    const checked = validateWebObservation({ ...YOUTUBE, sourceUrl: url, kind: 'web_page' }, NOW);
    assert.deepEqual(checked, { ok: false, error: 'threads_requires_owned_or_external_dedicated_path' });
  }
});

test('관측 서가는 새 성공본만 교체하고 다른 출처를 보존한다', () => {
  const empty = decodeWebObservationShelf(null);
  const first = mergeWebObservation(empty, YOUTUBE, NOW);
  const older = mergeWebObservation(first, { ...YOUTUBE, fetchedAt: NOW - 5000, items: [{ ...YOUTUBE.items[0], title: '낡은 제목' }] }, NOW + 1);
  assert.equal(older.sources[0].items[0].title, '손으로 만드는 세계');
});

test('YouTube 브라우저 관측은 페이지 텍스트일 뿐 시청·청취가 아니라고 상황에 명시한다', () => {
  const s: RadioSituation = {
    timeLabel: '저녁', todayLines: [], story: null, waitingCount: 0, recentScripts: [],
    webObservations: [{
      id: YOUTUBE.id, label: YOUTUBE.label, kind: YOUTUBE.kind, sourceUrl: YOUTUBE.sourceUrl,
      items: YOUTUBE.items.map(({ title, text, when, url }) => ({ title, text, when, url })),
    }],
  };
  const msg = situationMessage(s);
  assert.match(msg, /Crawl4AI 브라우저가 실제 공개 페이지에서 읽어 둔 글/);
  assert.match(msg, /영상 화면을 봤거나 음성을 들었다고 말하지 않는다/);
  assert.match(msg, /손으로 만드는 세계/);
});
