import test from 'node:test';
import assert from 'node:assert/strict';
import {
  decodeWebObservationReceipts, decodeWebObservationShelf,
  mergeWebObservation, mergeWebObservationReceipt, receiptForWebObservation,
  validateWebObservation, validateWebObservationFailureReceipt,
  type WebObservationSource,
} from './_radio-observations.ts';
import { situationMessage, type RadioSituation } from './_radio.ts';
import { onRequestGet, onRequestPost } from './radio/observations.ts';

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

test('D5 네 통로는 실제 엔진 이름과 맞을 때만 들어온다', () => {
  const cases: WebObservationSource[] = [
    { ...YOUTUBE, id: 'today-sky', label: '오늘의 서울 하늘', kind: 'sky_data', engine: 'sunrise-sunset-api' },
    { ...YOUTUBE, id: 'sapmanri-images', label: '우리 사진 서가', kind: 'image_library', engine: 'local-image-index' },
    { ...YOUTUBE, id: 'artic-public-domain', label: '미술관 공개 소장품', kind: 'art_collection', engine: 'artic-api' },
    { ...YOUTUBE, id: 'korean-wikisource', label: '위키문헌 옛 문장', kind: 'wikisource', engine: 'mediawiki-api' },
  ];
  for (const source of cases) assert.equal(validateWebObservation(source, NOW).ok, true, source.id);
  assert.deepEqual(
    validateWebObservation({ ...cases[0], engine: 'crawl4ai' }, NOW),
    { ok: false, error: 'source_engine_mismatch' },
  );
});

test('관측 서가는 새 성공본만 교체하고 다른 출처를 보존한다', () => {
  const empty = decodeWebObservationShelf(null);
  const first = mergeWebObservation(empty, YOUTUBE, NOW);
  const older = mergeWebObservation(first, { ...YOUTUBE, fetchedAt: NOW - 5000, items: [{ ...YOUTUBE.items[0], title: '낡은 제목' }] }, NOW + 1);
  assert.equal(older.sources[0].items[0].title, '손으로 만드는 세계');
});

test('통로별 실패 영수증은 직전 성공 자료를 지우지 않고 따로 갱신된다', () => {
  const source = { ...YOUTUBE, id: 'today-sky', label: '오늘의 서울 하늘', kind: 'sky_data' as const, engine: 'sunrise-sunset-api' as const };
  const success = receiptForWebObservation(source, NOW);
  const first = mergeWebObservationReceipt(decodeWebObservationReceipts(null), success, NOW);
  const failed = validateWebObservationFailureReceipt({
    receiptOnly: true, outcome: 'failure', id: source.id, label: source.label,
    kind: source.kind, sourceUrl: source.sourceUrl, engine: source.engine,
    ownership: 'read_only', fetchedAt: NOW + 1000, error: 'network_timeout',
  }, NOW + 1000);
  assert.equal(failed.ok, true);
  if (!failed.ok) return;
  const merged = mergeWebObservationReceipt(first, failed.receipt, NOW + 1000);
  assert.equal(merged.receipts.length, 1);
  assert.equal(merged.receipts[0].ok, false);
  assert.equal(merged.receipts[0].error, 'network_timeout');
});

test('YouTube 브라우저 관측은 페이지 텍스트일 뿐 시청·청취가 아니라고 상황에 명시한다', () => {
  const s: RadioSituation = {
    timeLabel: '저녁', todayLines: [], story: null, waitingCount: 0, recentScripts: [],
    webObservations: [{
      id: YOUTUBE.id, label: YOUTUBE.label, kind: YOUTUBE.kind, sourceUrl: YOUTUBE.sourceUrl,
      engine: YOUTUBE.engine,
      items: YOUTUBE.items.map(({ title, text, when, url }) => ({ title, text, when, url })),
    }],
  };
  const msg = situationMessage(s);
  assert.match(msg, /읽기 전용 통로에서 받아 둔 오늘의 재료/);
  assert.match(msg, /영상 화면을 봤거나 음성을 들었다고 말하지 않는다/);
  assert.match(msg, /손으로 만드는 세계/);
});

test('D5 배치 적재는 성공 자료와 통로별 실패 영수증을 한 번에 보존한다', async () => {
  const liveNow = Date.now();
  const store = new Map<string, string>();
  const PLANET = {
    get: async (key: string) => store.get(key) ?? null,
    put: async (key: string, value: string) => { store.set(key, value); },
  };
  const sky = {
    ...YOUTUBE, id: 'today-sky', label: '오늘의 서울 하늘', kind: 'sky_data' as const,
    engine: 'sunrise-sunset-api' as const, fetchedAt: liveNow - 1000,
  };
  const artFailure = {
    receiptOnly: true, outcome: 'failure', id: 'artic-public-domain', label: '미술관 공개 소장품',
    kind: 'art_collection', sourceUrl: 'https://www.artic.edu/collection', engine: 'artic-api',
    ownership: 'read_only', fetchedAt: liveNow - 1000, error: 'source_timeout',
  };
  const request = new Request('https://example.test/api/radio/observations', {
    method: 'POST', headers: { 'content-type': 'application/json', 'X-Pulse-Key': 'test-key' },
    body: JSON.stringify({ batch: [sky, artFailure] }),
  });
  const response = await onRequestPost({ request, env: { PLANET, PULSE_KEY: 'test-key' } } as never);
  assert.equal(response.status, 200);
  const getResponse = await onRequestGet({ env: { PLANET, PULSE_KEY: 'test-key' } } as never);
  const body = await getResponse.json() as {
    shelf: { sources: WebObservationSource[] };
    receipts: { receipts: Array<{ sourceId: string; ok: boolean; error: string | null }> };
  };
  assert.deepEqual(body.shelf.sources.map((source) => source.id), ['today-sky']);
  assert.deepEqual(
    body.receipts.receipts.map((receipt) => [receipt.sourceId, receipt.ok, receipt.error]),
    [['artic-public-domain', false, 'source_timeout'], ['today-sky', true, null]],
  );
});
