// 웹 탐색 실행 계약 테스트 — 망 없이, 가짜 Anthropic 응답으로
import { test } from 'node:test';
import assert from 'node:assert/strict';

const NOW = 1785000000000;

const intent = {
  date: '2026-07-27',
  pack: 'byeoli',
  centralImage: '누군가 앉았던 빈 의자',
  material: ['🪑 오래된 나무 의자에 앉음', '🐈 빼콩이를 기다렸지만 만나지 못함', '☁️ 흐린 아침에 책을 조금 읽음'],
  focusOrder: ['light', 'movement', 'texture', 'distance'],
  seek: [{ term: '소리의 결', from: 'texture', because: '🪑 오래된 나무 의자에 앉음' }],
  avoid: ['절망적인 이별', '과도하게 밝은 음악', '직접적인 위로'],
  excludeKeys: [],
} as never;

// ── 응답 블록 만들기 (진짜 모양을 흉내낸다) ──────────────────────────────────
const txt = (t: string) => ({ type: 'text', text: t });
const searchUse = (q: string) => ({ type: 'server_tool_use', name: 'web_search', input: { query: q } });
const searchRes = (...urls: string[]) =>
  ({ type: 'web_search_tool_result', content: urls.map((url) => ({ type: 'web_search_result', url, title: 't' })) });
const searchErr = (code: string) =>
  ({ type: 'web_search_tool_result', content: { type: 'web_search_tool_result_error', error_code: code } });
const fetchRes = (url: string) =>
  ({ type: 'web_fetch_tool_result', content: { type: 'web_fetch_result', url, content: { type: 'document' } } });
const fetchErr = (code: string) =>
  ({ type: 'web_fetch_tool_result', content: { type: 'web_fetch_tool_result_error', error_code: code } });

const msg = (content: unknown[], stop = 'end_turn') => ({ content, stop_reason: stop });

/** 부른 순서대로 응답을 돌려준다. 마지막 것을 넘어가면 마지막을 반복한다. */
function fakeClaude(responses: Array<Record<string, unknown> | { httpStatus: number }>) {
  const bodies: Array<Record<string, unknown>> = [];
  const _fetch = async (_url: string, init: unknown) => {
    const body = JSON.parse((init as { body: string }).body);
    bodies.push(body);
    const r = responses[Math.min(bodies.length - 1, responses.length - 1)] as Record<string, unknown>;
    if (typeof r.httpStatus === 'number') return { ok: false, status: r.httpStatus, json: async () => ({}) };
    return { ok: true, status: 200, json: async () => r };
  };
  return { bodies, env: { ANTHROPIC_API_KEY: 'test-key', _fetch } };
}

const QUERY_OK = msg([txt('{"queries":[{"query":"quiet folk songs about an empty chair","fromLine":0}]}')]);

// ── 시험 ─────────────────────────────────────────────────────────────────────

test('말 사이에 섞인 JSON을 꺼낸다 — 못 꺼내면 짜맞추지 않는다', async () => {
  const { extractJson } = await import('./_music-web.ts');

  assert.deepEqual(extractJson('{"a":1}'), { a: 1 });
  assert.deepEqual(extractJson('```json\n{"a":1}\n```'), { a: 1 });
  assert.deepEqual(extractJson('다 읽었다.\n{"a":1}\n이상이다.'), { a: 1 });
  assert.deepEqual(extractJson('{"a":{"b":[1,2]},"c":"}"}'), { a: { b: [1, 2] }, c: '}' },
    '문자열 안의 괄호를 괄호로 세지 않는다');
  assert.equal(extractJson('아무것도 못 찾았다'), null);
  assert.equal(extractJson('{"a": 깨짐'), null, '⚠ 반쯤 읽어서 지어내지 않는다');
});

test('⚠ 목록에서 본 것과 펼쳐 읽은 것을 구분한다', async () => {
  const { readTranscript } = await import('./_music-web.ts');

  const t = readTranscript([
    searchUse('quiet folk songs about an empty chair'),
    searchRes('https://a.example/1', 'https://b.example/2'),
    fetchRes('https://a.example/1'),
    txt('{"picks":[]}'),
  ]);

  assert.deepEqual(t.fetched, ['https://a.example/1'], '펼쳐 읽은 것만 출처가 된다');
  assert.deepEqual(t.seen, ['https://a.example/1', 'https://b.example/2'], '검색 결과는 따로 센다');
  assert.deepEqual(t.queriesRun, ['quiet folk songs about an empty chair']);
  assert.equal(t.text, '{"picks":[]}');
});

test('도구가 실패하면 빈 결과로 둔갑하지 않는다', async () => {
  const { readTranscript } = await import('./_music-web.ts');

  // ⚠ 성공은 배열, 실패는 객체다. 색인부터 하면 실패가 "결과 0건"으로 조용히 지나간다.
  const t = readTranscript([searchErr('max_uses_exceeded'), fetchErr('url_not_accessible')]);
  assert.deepEqual(t.fetched, []);
  assert.deepEqual(t.toolErrors, ['search: max_uses_exceeded', 'fetch: url_not_accessible'],
    '못 한 것을 영수증에 남긴다');
});

test('⚠ 핵심 — 검색 목록에서 본 주소를 출처로 대면 그 곡은 떨어진다', async () => {
  const { investigate } = await import('./_music-web.ts');

  const yes = 'https://pitchfork.example/review/1';
  const onlySeen = 'https://never-opened.example/2';
  const fake = fakeClaude([msg([
    searchUse('quiet folk songs about an empty chair'),
    searchRes(yes, onlySeen),
    fetchRes(yes),                      // 하나만 실제로 펼쳤다
    txt(JSON.stringify({ picks: [
      { title: '읽고고른곡', artist: 'A', verdict: 'chosen', role: 'center', fromLine: 1,
        because: '빼콩이를 만나지 못한 오늘과 닮았다', sources: [yes] },
      { title: '본척한곡', artist: 'B', verdict: 'chosen', role: 'around', fromLine: 0,
        because: '나무 의자와 닮았다', sources: [onlySeen] },
    ] })),
  ])]);

  const r = await investigate(fake.env as never, intent, [{ query: 'q', fromLine: 0 }]);

  assert.deepEqual(r.picks.map((p) => p.title), ['읽고고른곡']);
  assert.match(r.rejected[0].why, /source_not_fetched/,
    '⚠ 정직성 증거는 모델의 말이 아니라 도구 기록에서 나온다');
  assert.deepEqual(r.transcript.fetched, [yes]);
});

test('도구를 붙여 부른다 — 검색·읽기 상한과 함께', async () => {
  const { investigate, MUSIC_MODEL } = await import('./_music-web.ts');
  const fake = fakeClaude([msg([txt('{"picks":[]}')])]);
  await investigate(fake.env as never, intent, [{ query: 'q', fromLine: 0 }]);

  const body = fake.bodies[0] as { model: string; tools: Array<{ type: string; max_uses: number }> };
  assert.equal(body.model, MUSIC_MODEL);
  assert.deepEqual(body.tools.map((t) => t.type), ['web_search_20260209', 'web_fetch_20260209']);
  assert.ok(body.tools.every((t) => t.max_uses > 0), '한도 없이 풀어놓지 않는다');
});

test('pause_turn이면 이어 부른다 — 사람 말을 새로 덧붙이지 않는다', async () => {
  const { investigate } = await import('./_music-web.ts');

  const url = 'https://a.example/1';
  const fake = fakeClaude([
    msg([searchUse('q1'), searchRes(url)], 'pause_turn'),
    msg([fetchRes(url), txt(JSON.stringify({ picks: [
      { title: '곡', artist: 'A', verdict: 'chosen', role: 'center', fromLine: 2,
        because: '흐린 아침에 읽던 책과 같은 속도다', sources: [url] },
    ] }))]),
  ]);

  const r = await investigate(fake.env as never, intent, [{ query: 'q', fromLine: 0 }]);

  assert.equal(fake.bodies.length, 2, '이어서 한 번 더 부른다');
  const second = fake.bodies[1] as { messages: Array<{ role: string }> };
  assert.deepEqual(second.messages.map((m) => m.role), ['user', 'assistant'],
    '⚠ "계속해" 같은 새 user 메시지를 넣지 않는다 — 지금까지의 답만 돌려주면 서버가 이어간다');
  assert.deepEqual(r.picks.map((p) => p.title), ['곡'], '두 번에 걸친 기록이 합쳐진다');
  assert.deepEqual(r.transcript.fetched, [url]);
});

test('끝없이 멈추면 못 끝냈다고 말한다', async () => {
  const { investigate } = await import('./_music-web.ts');
  const fake = fakeClaude([msg([searchUse('q')], 'pause_turn')]);
  const r = await investigate(fake.env as never, intent, [{ query: 'q', fromLine: 0 }]);
  assert.equal(r.error, 'paused_too_many_times', '도중 결과를 완성본인 척하지 않는다');
  assert.ok(fake.bodies.length <= 5, '무한히 부르지 않는다');
});

test('못 한 것은 조용히 넘어가지 않는다', async () => {
  const { planQueries, investigate, curateDay } = await import('./_music-web.ts');

  assert.equal((await planQueries({}, intent)).error, 'anthropic_key_missing');
  assert.equal((await investigate({}, intent, [{ query: 'q', fromLine: 0 }])).error, 'anthropic_key_missing');
  assert.equal((await investigate(fakeClaude([]).env as never, intent, [])).error, 'no_queries',
    '검색어가 없으면 조사하지 않는다');

  const boom = fakeClaude([{ httpStatus: 529 }]);
  assert.equal((await curateDay(boom.env as never, intent, NOW)).error, 'claude_529');

  const junk = fakeClaude([msg([txt('음... 잘 모르겠다')])]);
  assert.equal((await curateDay(junk.env as never, intent, NOW)).error, 'query_json_unreadable');
});

test('검색어가 전부 떨어지면 웹을 뒤지지 않는다', async () => {
  const { curateDay } = await import('./_music-web.ts');
  // 납작한 말 + 피하기로 한 것 — 둘 다 검사에서 떨어진다
  const fake = fakeClaude([msg([txt('{"queries":[{"query":"sad morning songs","fromLine":0},'
    + '{"query":"절망적인 이별 노래","fromLine":1}]}')])]);

  const r = await curateDay(fake.env as never, intent, NOW);
  assert.equal(r.error, 'no_query_survived');
  assert.equal(fake.bodies.length, 1, '⚠ 검색어가 하나도 안 남으면 검색 한 번도 쓰지 않는다');
  assert.deepEqual(r.rejectedQueries.map((x) => x.query), ['sad morning songs', '절망적인 이별 노래'],
    '왜 떨어졌는지 영수증에 남는다');
});

test('전체 — 검색어부터 저장소 항목까지', async () => {
  const { curateDay } = await import('./_music-web.ts');
  const { validateSong } = await import('./_song-archive.ts');

  const url = 'https://pitchfork.example/review/1';
  const fake = fakeClaude([
    QUERY_OK,
    msg([
      searchUse('quiet folk songs about an empty chair'),
      searchRes(url, 'https://other.example/x'),
      fetchRes(url),
      fetchErr('url_not_accessible'),
      txt('읽었다.\n' + JSON.stringify({ picks: [
        { title: 'Hurt', artist: 'Johnny Cash', verdict: 'chosen', role: 'center', fromLine: 1,
          because: '빼콩이를 만나지 못한 오늘과 닮았다', sources: [url],
          byeoliSummary: '기다림을 아직 끝나지 않은 시간처럼 말한다', themes: ['기다림'] },
        { title: '밝은곡', artist: 'B', verdict: 'rejected', fromLine: 0,
          because: '오늘보다 지나치게 밝다', sources: [url] },
      ] })),
    ]),
  ]);

  const r = await curateDay(fake.env as never, intent, NOW);

  assert.equal(r.error, null);
  assert.deepEqual(r.queries, ['quiet folk songs about an empty chair']);
  assert.deepEqual(r.read, [url], '실제로 읽은 글이 영수증에 남는다');
  assert.deepEqual(r.toolErrors, ['fetch: url_not_accessible'], '실패한 읽기도 남는다');

  assert.deepEqual(r.entries.map((e) => e.verdict), ['chosen', 'rejected'],
    '⚠ 탈락한 곡도 저장한다 — 같은 조사를 두 번 하지 않기 위해서다');
  assert.equal(r.entries[0].chosen[0].role, 'center');
  assert.equal(r.entries[1].rejectedReason, '오늘보다 지나치게 밝다');
  assert.equal(r.entries[0].shelf, null, '서가 확인은 아직 안 붙었다');

  for (const e of r.entries) assert.deepEqual(validateSong(e), [], `${e.title} 저장소 검증 통과`);
});

/** 진짜 SSE 응답 모양. `event:` 줄과 빈 줄까지 섞어 흘린다. */
function sseBody(events: unknown[]) {
  const text = events.map((e) => `event: ${(e as { type: string }).type}\ndata: ${JSON.stringify(e)}\n\n`).join('');
  const chunks = text.match(/[\s\S]{1,17}/g) ?? [];   // 줄 중간에서 끊기게 잘게 쪼갠다
  let i = 0;
  return new ReadableStream<Uint8Array>({
    pull(c) {
      if (i >= chunks.length) { c.close(); return; }
      c.enqueue(new TextEncoder().encode(chunks[i++]));
    },
  });
}

test('⚠ 도구가 붙은 호출은 스트리밍으로 보낸다 — 안 그러면 524로 죽는다', async () => {
  const { investigate } = await import('./_music-web.ts');

  const url = 'https://pitchfork.example/review/1';
  const sent: Array<Record<string, unknown>> = [];
  const env = {
    ANTHROPIC_API_KEY: 'k',
    _fetch: async (_u: string, init: unknown) => {
      sent.push(JSON.parse((init as { body: string }).body));
      return {
        ok: true, status: 200,
        json: async () => { throw new Error('스트림인데 json()을 불렀다'); },
        body: sseBody([
          { type: 'content_block_start', index: 0, content_block: { type: 'server_tool_use', name: 'web_search', input: {} } },
          { type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta', partial_json: '{"query":"quiet ' } },
          { type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta', partial_json: 'folk songs"}' } },
          { type: 'content_block_stop', index: 0 },
          { type: 'content_block_start', index: 1, content_block: { type: 'web_fetch_tool_result', content: { type: 'web_fetch_result', url } } },
          { type: 'content_block_stop', index: 1 },
          { type: 'content_block_start', index: 2, content_block: { type: 'text', text: '' } },
          { type: 'content_block_delta', index: 2, delta: { type: 'text_delta', text: '{"picks":[{"title":"곡","artist":"A",' } },
          { type: 'content_block_delta', index: 2, delta: { type: 'text_delta', text: '"verdict":"chosen","role":"center","fromLine":1,' } },
          { type: 'content_block_delta', index: 2, delta: { type: 'text_delta', text: `"because":"오늘과 닮았다","sources":["${url}"]}]}` } },
          { type: 'content_block_stop', index: 2 },
          { type: 'message_delta', delta: { stop_reason: 'end_turn' } },
        ]),
      };
    },
  };

  const r = await investigate(env as never, intent, [{ query: 'q', fromLine: 0 }]);

  assert.equal(sent[0].stream, true, '⚠ 도구 호출에는 stream:true가 붙어야 한다');
  assert.deepEqual(r.transcript.fetched, [url], '조각난 스트림에서 도구 기록이 복원된다');
  assert.deepEqual(r.transcript.queriesRun, ['quiet folk songs'], '조각난 JSON 입력이 합쳐진다');
  assert.deepEqual(r.picks.map((p) => p.title), ['곡'], '조각난 본문이 합쳐져 JSON으로 읽힌다');
  assert.equal(r.error, null);
});

test('검색어 호출은 짧으니 스트리밍하지 않는다', async () => {
  const { planQueries } = await import('./_music-web.ts');
  const fake = fakeClaude([QUERY_OK]);
  await planQueries(fake.env as never, intent);
  assert.ok(!(fake.bodies[0] as { stream?: boolean }).stream, '짧은 호출까지 스트리밍할 이유는 없다');
});

test('조사 프롬프트가 오늘의 재료와 규칙을 실제로 들고 간다', async () => {
  const { buildInvestigatePrompt } = await import('./_music-web.ts');
  const p = buildInvestigatePrompt(intent, [{ query: 'quiet folk songs about an empty chair', fromLine: 0 }]);

  for (const l of intent.material) assert.ok(p.includes(l), `관찰 줄: ${l}`);
  for (const a of intent.avoid) assert.ok(p.includes(a), `피할 것: ${a}`);
  assert.ok(p.includes('quiet folk songs about an empty chair'), '지은 검색어');
  assert.ok(p.includes('web_fetch로 실제로 펼쳐 읽은 주소만'),
    '⚠ 코드가 막는 것을 프롬프트에도 적는다 — 안 그러면 왜 떨어졌는지 별이가 모른다');
  assert.ok(p.includes('picks를 빈 배열'), '못 고르면 안 고를 수 있어야 한다');
});
