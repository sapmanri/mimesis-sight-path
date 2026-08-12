// 별이의 우리 책장 (Vase 08-12 밤: "잠깐멈춰 원고들, 김밥 원고, 남겨둔 것들 원고, 그런 것도
// 보여줘. 관심 갖으면 우리 책들은 낭독을 해도 되는 거니까.")
// GET  /api/radio/bookcase (공개)   : 제목 목록만 — 본문은 안 나간다 (미발표작 보호의 기본자세.
//   잠깐멈춰는 공개 글이지만, 이 창구는 수위를 하나로 통일해 둔다 — 본문 통로는 상황 탑재뿐).
// POST /api/radio/bookcase (키 인증): 책장 전체 교체 — 채우는 손은 byeol-radio/bookcase-sync.sh.
//
// locked 원고(남겨둔 것들·소고기 김밥 등)는 제목·소개만 실린다 — 본문은 애초에 서버로 안 온다.
// 절대 규칙 3(소설 비공개)의 방벽은 여기가 아니라 동기화 스크립트에 있다: 잠긴 원고의 text를
// 아예 안 보낸다. 서버는 받아도 버린다(이중 방벽).

const BOOKCASE_KEY = 'radio:bookcase';
const PIECES_MAX = 200;

interface Piece { title: string; kind: string; text?: string; locked?: boolean; about?: string }
interface Env { PLANET: KVNamespace; PULSE_KEY?: string }

const JSON_HEADERS = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' };
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });

export const onRequestGet: PagesFunction<Env> = async ({ env }) => {
  const raw = await env.PLANET.get(BOOKCASE_KEY);
  const pieces: Piece[] = raw ? JSON.parse(raw) : [];
  return json(200, {
    ok: true, count: pieces.length,
    titles: pieces.map((p) => ({ title: p.title, kind: p.kind, locked: !!p.locked })),
  });
};

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  if (!env.PULSE_KEY) return json(500, { ok: false, error: 'PULSE_KEY not configured' });
  if (request.headers.get('X-Pulse-Key') !== env.PULSE_KEY) return json(403, { ok: false, error: 'forbidden' });

  let body: { pieces?: unknown };
  try { body = (await request.json()) as { pieces?: unknown }; } catch { return json(400, { ok: false, error: 'bad_json' }); }
  if (!Array.isArray(body.pieces) || body.pieces.length > PIECES_MAX) return json(400, { ok: false, error: 'bad_pieces' });

  const pieces: Piece[] = [];
  for (const raw of body.pieces as Partial<Piece>[]) {
    const title = String(raw.title ?? '').trim().slice(0, 60);
    if (!title) return json(400, { ok: false, error: 'bad_title' });
    const locked = !!raw.locked;
    pieces.push({
      title,
      kind: String(raw.kind ?? '원고').trim().slice(0, 20),
      // 잠긴 원고의 본문은 실수로 왔어도 버린다 — 미발표작이 KV에 눕는 일은 없어야 한다
      text: locked ? undefined : (typeof raw.text === 'string' ? raw.text.slice(0, 2000) : undefined),
      locked,
      about: typeof raw.about === 'string' ? raw.about.slice(0, 120) : undefined,
    });
  }
  await env.PLANET.put(BOOKCASE_KEY, JSON.stringify(pieces));
  return json(200, { ok: true, count: pieces.length, open: pieces.filter((p) => !p.locked && p.text).length });
};
