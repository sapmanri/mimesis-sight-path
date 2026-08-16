// 별리 라디오 — 지난 방송 창구. GET /api/radio/archive (공개)
//
//   ?day 없이     → 방송이 있었던 날짜 목록 + 날짜별 편수 (최신이 앞)
//   ?day=YYYY-MM-DD → 그날의 방송 목록 (날짜 보관소 + 편성표 창을 병합 — 보관소 신설 전
//                     등록분도 편성표 창에 남아 있는 동안은 보이게)
// 대본(script)도 공개다 — 방송으로 이미 나간 말이다.

import { PROGRAM_KEY, DAYS_KEY, DAY_KEY, kstDayOf, type ProgramSegment } from '../_station.ts';

interface Env { PLANET: KVNamespace }

const JSON_HEADERS = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' };
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const day = new URL(request.url).searchParams.get('day');
  if (day && !/^\d{4}-\d{2}-\d{2}$/.test(day)) return json(400, { ok: false, error: 'bad_day' });

  const programRaw = await env.PLANET.get(PROGRAM_KEY);
  const program: ProgramSegment[] = programRaw ? JSON.parse(programRaw) : [];

  if (day) {
    const dayRaw = await env.PLANET.get(DAY_KEY(day));
    const stored: ProgramSegment[] = dayRaw ? JSON.parse(dayRaw) : [];
    const seen = new Set(stored.map((s) => `${s.id}|${s.startAt}`));
    for (const s of program) {
      if (kstDayOf(s.startAt) === day && !seen.has(`${s.id}|${s.startAt}`)) stored.push(s);
    }
    stored.sort((a, b) => a.startAt - b.startAt);
    return json(200, { ok: true, day, segments: stored });
  }

  const daysRaw = await env.PLANET.get(DAYS_KEY);
  const days = new Set<string>(daysRaw ? JSON.parse(daysRaw) : []);
  for (const s of program) days.add(kstDayOf(s.startAt));
  const sorted = [...days].sort().reverse();
  const out = [];
  for (const d of sorted.slice(0, 60)) {
    const raw = await env.PLANET.get(DAY_KEY(d));
    const stored: ProgramSegment[] = raw ? JSON.parse(raw) : [];
    const ids = new Set(stored.map((s) => `${s.id}|${s.startAt}`));
    for (const s of program) if (kstDayOf(s.startAt) === d && !ids.has(`${s.id}|${s.startAt}`)) ids.add(`${s.id}|${s.startAt}`);
    const kinds = { talk: 0, story: 0, reading: 0, song: 0 };
    const all = [...stored, ...program.filter((s) => kstDayOf(s.startAt) === d && !stored.some((x) => x.id === s.id && x.startAt === s.startAt))];
    for (const s of all) if (s.kind in kinds) (kinds as Record<string, number>)[s.kind]++;
    out.push({ day: d, count: ids.size, kinds });
  }
  return json(200, { ok: true, days: out });
};
