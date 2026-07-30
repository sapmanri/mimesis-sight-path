// /api/ops/music-night — 하루치 선곡을 손으로 돌린다 (Ops 호스트 전용 · Access 뒤)
//
// ⛔ 크론과 연결점 없음. 사람이 눌러야만 돈다.
//
//   GET ?                     무엇을 할지 보여주기만 한다 (아무것도 쓰지 않는다)
//   GET ?run=1&dry=1          조사·서가 확인·저장까지. **재생목록은 만들지 않는다**
//   GET ?run=1                전부
//
// ⚠ `run=1`을 요구하는 이유: 이건 **돈과 한도를 쓰는 GET**이다. Claude 호출 두 번,
//   YouTube 검색 여러 번, 재생목록 100유닛. 브라우저가 주소를 미리 당겨오기만 해도
//   하루치가 나가버리면 안 된다. 그래서 기본은 '설명만'이다.

import { runMusicNight, saveNight, SHELF_BUDGET, type NightEnv } from '../_music-night.ts';
import { kstDate } from '../_memory-event.ts';

const JSON_HEADERS = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' };
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body, null, 2), { status, headers: JSON_HEADERS });

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export const onRequestGet: PagesFunction<NightEnv> = async ({ request, env }) => {
  const url = new URL(request.url);
  const date = url.searchParams.get('date') ?? kstDate(Date.now());
  const pack = url.searchParams.get('pack') ?? 'byeoli';
  const dry = url.searchParams.get('dry') === '1';

  if (!DATE_RE.test(date)) return json(400, { error: 'bad_date', got: date });

  if (url.searchParams.get('run') !== '1') {
    return json(200, {
      willRun: false,
      date, pack, dry,
      cost: {
        claude: '검색어 1회 + 조사 1회 (웹 검색·읽기 포함)',
        youtubeSearch: `최대 ${SHELF_BUDGET}회 (하루 한도 100)`,
        youtubeUnits: dry ? 0 : 100,
      },
      note: '실제로 돌리려면 &run=1 을 붙여라. 재생목록 없이 조사만 하려면 &run=1&dry=1.',
    });
  }

  const started = Date.now();
  try {
    const receipt = await runMusicNight(env, { date, pack, now: started, skipPlaylist: dry });
    /* ⚠ 결과를 반드시 남긴다. 발행(/api/ops/music-publish)이 이걸 꺼내 쓴다.
       예전에는 응답에만 있어서, 돌리고 나면 그 밤이 사라졌다. 저장이 실패해도
       조사 결과를 돌려주기는 한다 — 다만 조용히 넘어가지 않고 note 로 남긴다. */
    try { await saveNight(env, receipt); }
    catch (e) { receipt.notes.push(`night_save_failed: ${(e as Error).message}`); }
    return json(200, { willRun: true, elapsedMs: Date.now() - started, saved: true, ...receipt });
  } catch (e) {
    // ⚠ 어디서 터졌는지 삼키지 않는다 — 이 파이프라인은 단계가 많아 사유 없이는 못 고친다
    return json(200, {
      willRun: true, step: 'threw', error: `${(e as Error).message}`, date, pack,
      elapsedMs: Date.now() - started,
    });
  }
};
