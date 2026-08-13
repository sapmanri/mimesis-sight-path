// /api/ops/music-publish — 그날 밤 고른 음악을 스레드에 올린다 (Ops 호스트 전용 · Access 뒤)
//
// ⛔ Social Director와 연결점 없음. 사람이 눌러야만 돈다.
//    공통 Threads 클라이언트만 재사용한다 — sketch-publish 와 같은 선례.
//
//   GET  ?date=YYYY-MM-DD      나갈 문장을 **보여주기만** 한다. 아무것도 안 나간다
//   POST {date, confirm:true}  실제로 올린다
//
// ⚠ 왜 만들기(music-night)와 발행을 나눴나.
//   조사는 돈이 들고 발행은 되돌릴 수 없다. 성질이 다른 두 일을 한 버튼에 묶으면
//   「조사만 해보려다 발행되는」 사고가 반드시 난다. 그림 쪽(sketch-lab → sketch-publish)이
//   이미 그렇게 갈라져 있고, 음악도 같은 모양을 따른다.
//
// ⚠ 2026-07-30 이전에는 이 파일이 없었다. _music-night 이 threadText 를 만들어 돌려주는데
//   아무도 받지 않아서, 파이프라인이 「재생목록까지」에서 끊겨 있었다.

import { dispatchToThreads, type ThreadsEnv } from '../_threads-client.ts';
import { appendPublishLog } from '../_publish-log.ts';
import { readNight, type NightEnv, type NightReceipt } from '../_music-night.ts';
import { kstDate } from '../_memory-event.ts';

type Env = ThreadsEnv & NightEnv;

const JSON_HEADERS = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' };
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body, null, 2), { status, headers: JSON_HEADERS });

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const PUB_KEY = 'music_publish_log';
const PUB_KEEP = 90;

interface MusicPubRecord {
  date: string; at: number; ok: boolean;
  playlistUrl: string | null; chars: number;
  requestedBy: string; errorCode: string | null;
}

/** 나갈 문장을 못 만든 이유를 한 줄로. 사람이 보고 판단할 수 있어야 한다. */
function blockedWhy(n: NightReceipt | null): string | null {
  if (!n) return 'no_night — 그날 밤을 아직 안 돌렸다. /api/ops/music-night?run=1 먼저';
  if (n.rest) return `rest — 쉬는 날이었다: ${n.rest}`;
  if (n.step !== 'done') return `not_done — ${n.step} 에서 멈췄다${n.error ? `: ${n.error}` : ''}`;
  if (!n.threadText?.trim()) return 'no_text — 별이가 할 말을 못 만들었다';
  return null;
}

async function pubLog(env: Env): Promise<MusicPubRecord[]> {
  const raw = await env.PLANET.get(PUB_KEY);
  try { return raw ? (JSON.parse(raw) as MusicPubRecord[]) : []; } catch { return []; }
}

/* ── 보여주기 ─────────────────────────────────────────────── */
export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const url = new URL(request.url);
  const date = url.searchParams.get('date') ?? kstDate(Date.now());
  if (!DATE_RE.test(date)) return json(400, { error: 'bad_date', got: date });

  const night = await readNight(env, date);
  const why = blockedWhy(night);
  const already = (await pubLog(env)).find((r) => r.date === date && r.ok) ?? null;

  return json(200, {
    willPublish: false, date,
    ready: !why,
    blocked: why,
    /* 나갈 문장을 **그대로** 보여준다. 요약하지 않는다 — 사람이 이걸 보고 누른다 */
    text: night?.threadText ?? null,
    chars: night?.threadText?.length ?? 0,
    playlistUrl: night?.playlistUrl ?? null,
    onShelf: night?.onShelf?.length ?? 0,
    /* ⚠ 별이의 입에 우리 어휘가 섞였는지 등, 밤이 남긴 경고를 숨기지 않는다 */
    notes: night?.notes ?? [],
    alreadyPublished: already,
    note: '올리려면 POST {"date":"…","confirm":true}. 한 번 나가면 되돌릴 수 없다.',
  });
};

/* ── 올리기 ───────────────────────────────────────────────── */
export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  let body: { date?: string; confirm?: boolean; force?: boolean } = {};
  try { body = (await request.json()) as typeof body; } catch { return json(400, { ok: false, error: 'bad_json' }); }

  const date = body.date ?? kstDate(Date.now());
  if (!DATE_RE.test(date)) return json(400, { ok: false, error: 'bad_date', got: date });
  /* ⚠ confirm 을 요구한다. 주소를 미리 당겨오는 것만으로 발행되면 안 된다. */
  if (body.confirm !== true) return json(400, { ok: false, error: 'need_confirm' });

  const night = await readNight(env, date);
  const why = blockedWhy(night);
  if (why) return json(409, { ok: false, error: 'not_ready', blocked: why });

  const log = await pubLog(env);
  /* 같은 날 두 번 올리지 않는다. 정말 다시 올려야 하면 force 로 사람이 뚫는다. */
  const already = log.find((r) => r.date === date && r.ok);
  if (already && !body.force) return json(409, { ok: false, error: 'already_published', already });

  const text = night!.threadText!;
  const now = Date.now();
  /* 음악은 이미지가 없다. 재생목록 주소는 문장 안에 들어 있다(buildThreadText). */
  const threads = await dispatchToThreads(env, text, null, false);

  await appendPublishLog(env, {
    invokedAt: now,
    scheduledFor: null,  // 수동 발행 — 예정 슬롯이 없다(08-09 사고)
    result: threads.ok ? 'success' : 'threads_failed',
    httpStatus: 200,
    textIndex: null,
    imageKey: null,
    threads: { attempted: threads.attempted, ok: threads.ok, errorCode: threads.errorCode, requestId: threads.requestId },
  }).catch(() => {});

  const record: MusicPubRecord = {
    date, at: now, ok: threads.ok,
    playlistUrl: night!.playlistUrl ?? null,
    chars: text.length,
    requestedBy: request.headers.get('cf-access-authenticated-user-email') ?? 'unknown',
    errorCode: threads.errorCode,
  };
  await env.PLANET.put(PUB_KEY, JSON.stringify([record, ...log].slice(0, PUB_KEEP)));

  console.log(`ops/music-publish date=${date} ok=${threads.ok} chars=${text.length}`);
  return json(200, { ok: threads.ok, date, chars: text.length,
    playlistUrl: record.playlistUrl, threads, detail: threads.detail ?? null });
};
