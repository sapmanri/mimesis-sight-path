// BUILD 431-AUTO — POST /api/sketch-daily (외부 Cron · X-Publish-Key — autopost와 같은 보호)
//
// 그림일기 예약 파이프라인. 생성·판정 뒤 추천 1장을 기존 하루 1장 계약으로 발행한다.
//   ① 크론 23:30 KST — 그날 발행 영수증이 다 쌓인 뒤 하루를 접는다
//   ② 사람 우선 — 그날 사람이 이미 하루를 접었으면 자동은 건드리지 않는다
//   ③ 관찰이 없는 날은 접지 않는다 — 빈 기억을 지어내지 않는다
//   ④ seed는 날짜에서 파생 — 같은 날은 같은 3장 (재현 가능)
//   ⑤ 판정기(vision)가 추천한 1장을 자동 채택·발행 — 사람의 기존 채택은 덮지 않음
//   ⑥ 성공 영수증이 있는 날짜는 다시 발행하지 않음
//   ⑦ 비용 상한: 3장 + vision 판정 1회/일
//   ⑧ Threads 실패 시 생성 결과는 보존하고 심야 재시도에서 발행만 다시 시도
//
// 산출물은 기존 시험 경로(sketch-trials/·sketch_trial_meta)에 쌓이고,
// 수동 실험실 버튼도 동일한 채택·발행 함수를 사용한다.

import {
  buildDayMemory, validateDayMemory, memoryKey, kstDate,
  linkPendingDiary, readPendingDiaries,
  type DayMemory, type CaptureLike,
} from './_memory-event.ts';
import {
  buildImagePrompt, CHARACTER_IDENTITY_CHECKS, NIGHTLY_POSE_VARIANTS, SKETCH_RULES, SKETCH_VERSION,
} from './_daily-sketch.ts';
import { selectProvider, trialKey, type ImageProviderEnv } from './_image-provider.ts';
// 431 게놈 배선 (08-11): buildSketchPrompt/buildImagePrompt는 처음부터 게놈 인자를 받게
// 설계됐는데 호출부가 전부 null이었다 — 별이가 그리는데 별이 눈으로 고르질 않았다.
import { buildGenomeContext } from './_genome-identity.ts';
import { translateScene, translateSubjects, hashPrompt, orderCharacterRefs, type TrialRecord } from './ops/sketch-trial.ts';
// ⚠ 2026-07-27: 이 한 줄이 없어서 **매일 밤 그림일기가 죽었다.**
//   d856916이 208~209줄에 readRefRoles·refsWithRole 호출만 넣고 import를 빠뜨렸다.
//   하루를 접은 뒤 이 지점에서 ReferenceError → Cloudflare 1101. reco를 못 남기고 죽으니
//   다음 호출이 「사람이 접은 하루」로 오인해 물러났고, 크래시가 정중한 건너뜀으로 위장됐다.
import { readRefRoles, refsWithRole } from './ops/sketch-reference.ts';
import {
  autoPublishRecommendedSketch, type SketchPublishEnv, type SketchPublishResult,
} from './_sketch-pub.ts';

interface Env extends ImageProviderEnv, SketchPublishEnv {
  CAPTURES: R2Bucket;
  PUBLISH_KEY?: string;
  PULSE_KEY?: string;
  ANTHROPIC_API_KEY?: string;
}

const META_KEY = 'sketch_trial_meta';
const META_KEEP = 60;
const RECO_KEY = (date: string) => `sketch_daily_reco:${date}`;
const RUN_KEY = (date: string) => `sketch_daily_run:${date}`;
type RunStatus = 'folding' | 'generating' | 'done' | 'skipped' | 'failed';
interface DailyRun {
  runId: string;
  date: string;
  owner: 'nightly-auto';
  status: RunStatus;
  stage: string;
  startedAt: number;
  updatedAt: number;
  errorCode?: string;
  errorName?: string;
  errorMessage?: string;
}
interface RunTrace { stage: string; runId: string; diaryLink?: string }

export function foldedDayDecision(
  day: Pick<DayMemory, 'foldedBy'>,
  hasAutoRun: boolean,
): 'resume' | 'human_day' | 'ownership_unknown' {
  if (day.foldedBy === 'nightly-auto' || hasAutoRun) return 'resume';
  if (day.foldedBy === 'human') return 'human_day';
  return 'ownership_unknown';
}

/** 스케줄러 소진 영수증이 덮으면 안 되는 기존 기록 판별 (08-11 실사고의 가드) */
export interface HonestRecoLike { skipped?: unknown; status?: unknown; picks?: unknown; reco?: unknown }
export function hasRecordedRecommendation(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false;
  const reco = value as Record<string, unknown>;
  return Object.prototype.hasOwnProperty.call(reco, 'pick')
    && Array.isArray(reco.verdicts)
    && typeof reco.reasons === 'string';
}
export function recoNeedsJudge(reco: HonestRecoLike | null): boolean {
  return !!reco
    && !(typeof reco.skipped === 'string' && reco.skipped)
    && Array.isArray(reco.picks)
    && reco.picks.length >= 1        // 09-01: 3장 묶음 → 한 장씩. 한 장만 있어도 판정할 차례다
    && !hasRecordedRecommendation(reco.reco);
}
export function recoIsHonestTerminal(reco: HonestRecoLike | null): boolean {
  if (!reco) return false;
  // 건너뜀 3종(no_observations·human_day·ownership_unknown)은 전부 진단 가치가 있다 —
  // ownership_unknown도 「수동 확인 필요」라는 정보라 소진 영수증보다 낫다.
  if (typeof reco.skipped === 'string' && reco.skipped) return true;
  // 그림 3장은 판정 준비일 뿐 완료가 아니다. 08-12 실사고처럼 status=done·picks=3인데
  // reco=null인 기록을 완료로 인정하면 스케줄러 소진 영수증과 아침 감시가 둘 다 거짓말한다.
  // 시도를 다 쓴 하루는 실패지만 **정직한 종결**이다 — 소진 영수증이 이 진단을 덮으면 안 된다.
  if (reco.errorCode === 'attempts_exhausted') return true;
  const judged = hasRecordedRecommendation(reco.reco);
  if (reco.status === 'done') return judged;
  return judged && Array.isArray(reco.picks) && reco.picks.length >= 1;
}
/** 하루에 그려 볼 최대 장 수. 다 쓰면 그 하루는 정직하게 접는다(큐 무한 성장 방지). */
const MAX_ATTEMPTS = 6;
/** 못 끝낸 하루를 며칠까지 이어 그리나 (사장 판정 09-01: 3일). */
const PENDING_DAYS = 3;
/**
 * 못 끝낸 하루를 찾는다 — 09-01 구조 교체 ①: **마감을 없앤다.**
 * 옛 구조는 「그날 밤에 못 끝내면 그날은 영영 없음」이었다. 하루의 기억은 KV에 그대로 남아 있는데
 * 밤이 지났다는 이유로 버렸다. 이제 어제부터 PENDING_DAYS일까지 거슬러 보며 **가장 오래된 미완**을
 * 이어 그린다. 늦게 그려도 그날 날짜로 발행한다 — 일기는 늦게 써도 그날 일기다.
 * 오늘은 보지 않는다(오늘 몫은 23:30 본진이 접는다). 영수증이 없는 날은 시도된 적 없는 날이므로
 * 건드리지 않는다 — 「과거 하루를 새로 접지 않는다」는 엔드포인트 계약 그대로다.
 */
export async function findPendingDate(
  get: (key: string) => Promise<string | null>, today: string, days: number,
): Promise<string | null> {
  // ⚠ 09-01 실사고: `${today}T00:00:00+09:00`(=UTC 전날 15시)에서 하루씩 빼고 UTC로 찍으면
  //   **날짜가 하루씩 밀려** 어제를 아예 안 봤다(큐가 늘 비어 보였다). 정오 UTC를 기준으로
  //   온전한 하루씩 빼면 문자열 산술이 정확하다(KST엔 서머타임이 없다).
  const base = Date.parse(`${today}T12:00:00Z`);
  for (let i = days; i >= 1; i--) {
    const d = new Date(base - i * 86_400_000).toISOString().slice(0, 10);
    const raw = await get(`sketch_daily_reco:${d}`);
    if (!raw) continue;
    let reco: HonestRecoLike | null = null;
    try { reco = JSON.parse(raw) as HonestRecoLike; } catch { continue; }
    if (recoIsHonestTerminal(reco)) continue;
    return d;
  }
  return null;
}

const DAILY_MODEL = '@cf/black-forest-labs/flux-2-dev';
// steps 12 = 품질 판정값 (07-21 심야, "하고하고 또 해서" 결정) — 품질값은 상수다.
// 07-24 실증: 실패 원인은 스텝이 아니라 30초 클라이언트가 생성 도중 끊은 것.
// 인내심 있는 클라이언트(재시도 경로, 120초)로 부르면 flux-2-dev는 정상 생성된다.
const DAILY_STEPS = 12;
/** 확정 레시피의 캐릭터 참조 — 포즈 시트 2장 (07-21 심야 판정) */
/**
 * ⚠ 폐지 예정 — **화면에서 배정한 역할이 정본이다** (실사고 2026-07-26).
 * 이 하드코딩 목록은 역할이 KV에 하나도 없을 때만 쓰는 최후 폴백이다.
 * 폴백을 탔다는 사실은 결과에 경고로 남긴다 — 조용히 다른 걸 싣지 않는다.
 */
const DAILY_REFS_FALLBACK = ['sketch-trials/reference/byeoli_poses.png', 'sketch-trials/reference/ppaekong_poses.png'];

const JSON_HEADERS = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' };
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });

/** ④ 날짜 → 결정론 seed. 같은 날은 같은 3장. */
export function dailySeed(date: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < date.length; i++) { h ^= date.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return 400000 + ((h >>> 0) % 90000);
}

function bytesToB64(buf: ArrayBuffer): string {
  const u = new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000));
  return btoa(s);
}

type VisionMediaType = 'image/png' | 'image/jpeg' | 'image/webp' | 'image/gif';

/**
 * 파일명·R2 메타를 믿지 않고 실제 바이트를 읽는다.
 * 08-12 실물은 .png 키인데 Anthropic이 image/png 불일치로 거부했다. 확장자를 고치는
 * 땜질이면 옛 파일과 다음 공급자 변경 때 또 죽으므로 판정 경계에서 직접 판별한다.
 */
export function detectVisionMediaType(buf: ArrayBuffer): VisionMediaType | null {
  const b = new Uint8Array(buf);
  if (b.length >= 8
    && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47
    && b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a) return 'image/png';
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (b.length >= 12
    && b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46
    && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return 'image/webp';
  if (b.length >= 6 && b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46
    && b[3] === 0x38 && (b[4] === 0x37 || b[4] === 0x39) && b[5] === 0x61) return 'image/gif';
  return null;
}

/** ⑥ 판정기 — 클로드 vision. 기준은 새로 쓰지 않는다: 체크리스트·규칙·그날의 줄을 조립. */
interface CandidateRecommendation { pick: number | null; reasons: string; verdicts: string[] }
interface JudgeOutcome { reco: CandidateRecommendation | null; error: string | null }

/**
 * 오늘 그림에 누구를 부를지 **별이가 고른다** (사장 판정 2026-08-30 「별이가 선택하게 해」).
 *
 * 왜 생겼나: 08-28·29 이틀 연속 별이가 후보 3장을 **전부 물렸다.** 캐릭터 참조에 늘
 *   빼콩이(고양이)가 들어가는데 그날 주인공이 개여서 그림마다 개 대신 고양이가 나왔다
 *   (별이 판정 원문 「세 장 모두 개가 아닌 고양이로 그려져…」). 「주인공이 고양이가 아니면
 *   빼콩이를 뺀다」는 규칙을 코드에 박을 수도 있었다. 그러나 그건 별이 세계의 선택을 사람이
 *   대신하는 것이다 — 집 원칙은 **동작은 능력 등록만, 선택은 존재의 롤**이다.
 *   그래서 그날 기억을 별이에게 보여 주고, 부를 상대를 별이가 고르게 한다.
 *
 * 별이에게 주는 것: 그날 기억 + 부를 수 있는 상대 목록 + 게놈(별이의 눈) + **참조는 그림을
 *   끌어당긴다는 사실**. 사실은 알려 주되 답은 정해 주지 않는다.
 * 폴백: 키 없음·응답 깨짐이면 **기존대로 전부 부른다**(그림이 아예 없는 것보다 낫다).
 *   고르지 못했다는 사실은 반드시 남긴다 — 조용한 실패 금지.
 */
export function refPersonaName(key: string): string {
  const f = key.split('/').pop() ?? key;
  if (/byeol|girl/i.test(f)) return '별이';
  if (/ppaekong|cat/i.test(f)) return '빼콩이(고양이)';
  return f.replace(/\.[a-z0-9]+$/i, '');
}

/** 별이 응답 → 부를 참조. 파싱 실패는 null(=전부 부르기 폴백)로 돌려 호출부가 남기게 한다. */
export function parseRefChoice(text: string, count: number): { call: number[]; reason: string } | null {
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    const out = JSON.parse(m[0]) as { call?: unknown; reason?: unknown };
    if (!Array.isArray(out.call)) return null;
    const call = [...new Set(out.call.map(Number))].filter((n) => Number.isInteger(n) && n >= 1 && n <= count);
    return { call, reason: String(out.reason ?? '').slice(0, 200) };
  } catch { return null; }
}

async function chooseCharacterRefs(
  env: Env, day: DayMemory, refKeys: string[], genome: string,
): Promise<{ keys: string[]; note: string }> {
  const all = { keys: refKeys, note: '' };
  if (refKeys.length < 2) return all;
  if (!env.ANTHROPIC_API_KEY) return { keys: refKeys, note: 'refs_choice_skipped: 키 없음 — 전부 불렀다' };
  const roster = refKeys.map((k, i) => `${i + 1}. ${refPersonaName(k)}`).join('\n');
  const prompt = `${genome}

오늘 그림일기에 **누구를 부를지 네가 고른다.**
오늘의 기억: ${day.event.lines.join(' / ')}${day.event.targetLabel ? ` (가장 크게: ${day.event.targetLabel})` : ''}

부를 수 있는 상대:
${roster}

알아 둘 것: 부른 상대의 참조 그림은 그림을 세게 끌어당긴다. 오늘 기억에 없는 상대를 부르면 그 모습이 오늘의 주인공 자리를 차지해 버린다.
오늘 그림에 정말 있어야 할 상대만 골라라. JSON으로만:
{"call": [번호...], "reason": "한 줄"}`;
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({ model: 'claude-sonnet-5', max_tokens: 300, messages: [{ role: 'user', content: prompt }] }),
    });
    if (!res.ok) return { keys: refKeys, note: `refs_choice_http_${res.status} — 전부 불렀다` };
    const data = (await res.json()) as { content?: { type: string; text?: string }[] };
    const parsed = parseRefChoice(data.content?.find((c) => c.type === 'text')?.text ?? '', refKeys.length);
    if (!parsed) return { keys: refKeys, note: 'refs_choice_unparsed — 전부 불렀다' };
    const keys = parsed.call.map((n) => refKeys[n - 1]);
    const left = refKeys.filter((k) => !keys.includes(k)).map(refPersonaName);
    return {
      keys,
      note: `refs_called: ${keys.map(refPersonaName).join('·') || '(아무도 안 부름)'}`
        + (left.length ? ` / 안 부름: ${left.join('·')}` : '')
        + (parsed.reason ? ` — 별이: ${parsed.reason}` : ''),
    };
  } catch (e) {
    return { keys: refKeys, note: `refs_choice_error: ${(e instanceof Error ? e.message : String(e)).slice(0, 100)} — 전부 불렀다` };
  }
}

/**
 * 별이의 판정 응답 → 객체. 08-30 실사고: max_tokens가 모자라 JSON이 중간에 잘리면
 * `{...}` 정규식이 닫는 괄호를 못 찾아 통째로 버려졌다(24회 연속 실패, 그날 그림 무산).
 * 온전한 JSON을 먼저 보고, 잘렸으면 pick·reasons만이라도 건져 낸다 — 3장을 다시 그리는 것보다 싸다.
 */
export function parseJudgeText(text: string): { pick?: number; reasons?: string; verdicts?: string[] } | null {
  const m = text.match(/\{[\s\S]*\}/);
  if (m) {
    try { return JSON.parse(m[0]) as { pick?: number; reasons?: string; verdicts?: string[] }; } catch { /* 잘린 것 — 아래로 */ }
  }
  const pick = text.match(/"pick"\s*:\s*(null|\d+)/);
  if (!pick) return null;
  const reasons = text.match(/"reasons"\s*:\s*"((?:[^"\\]|\\.)*)"/);
  const verdicts = [...text.matchAll(/"((?:[^"\\]|\\.)*?장:[^"]*)"/g)].map((v) => v[1]).slice(0, 5);
  return {
    pick: pick[1] === 'null' ? undefined : Number(pick[1]),
    reasons: reasons ? reasons[1] : '(잘린 응답에서 건져 냄)',
    verdicts,
  };
}

async function judgeCandidates(
  env: Env, day: DayMemory, images: { seed: number; bytes: ArrayBuffer; mediaType: VisionMediaType }[],
): Promise<JudgeOutcome> {
  if (!env.ANTHROPIC_API_KEY) return { reco: null, error: 'judge_key_missing' };
  if (!images.length) return { reco: null, error: 'judge_images_missing' };
  try {
    const content: unknown[] = [{
      type: 'text',
      text: `별이의 그림일기 후보 ${images.length}장이다. 판정 기준(예쁜가가 아니다):
- Character Identity: ${CHARACTER_IDENTITY_CHECKS.join(' · ')}
- 그림 습관: ${SKETCH_RULES.join(' · ')}
- 이 하루의 기억과 맞는가: ${day.event.lines.join(' / ')} (가장 크게: ${day.event.targetLabel ?? '—'})
각 장의 합격/불합격과 한 줄 사유, 그리고 추천 1장(1~${images.length}, 전부 불합격이면 0)을 JSON으로만:
{"verdicts": ["1장: ..."], "pick": n, "reasons": "추천 사유 한 줄"}`,
    }];
    for (const im of images) {
      content.push({
        type: 'image',
        source: { type: 'base64', media_type: im.mediaType, data: bytesToB64(im.bytes) },
      });
    }
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({ model: 'claude-sonnet-5', max_tokens: 1500, messages: [{ role: 'user', content }] }),
    });
    if (!res.ok) {
      const detail = (await res.text().catch(() => '')).replace(/\s+/g, ' ').slice(0, 160);
      return { reco: null, error: `judge_http_${res.status}${detail ? `: ${detail}` : ''}` };
    }
    const data = (await res.json()) as { content?: { type: string; text?: string }[] };
    const text = data.content?.find((c) => c.type === 'text')?.text ?? '';
    const parsed = parseJudgeText(text);
    if (!parsed) {
      // ⚠ 08-30 실사고: judge_non_json_response가 24번 났는데 **별이가 뭐라고 답했는지 영수증에 없어**
      //   아침에 원인을 못 봤다(08-16에 배운 것의 재발). 이제 앞머리를 실어 보낸다.
      const head = text.replace(/\s+/g, ' ').slice(0, 200);
      return { reco: null, error: `judge_non_json_response: ${head || '(빈 응답)'}` };
    }
    const out = parsed;
    const pick = Number(out.pick);
    return { reco: {
        pick: Number.isInteger(pick) && pick >= 1 && pick <= images.length ? pick : null,
        reasons: String(out.reasons ?? '').slice(0, 300),
        verdicts: Array.isArray(out.verdicts) ? out.verdicts.map((v) => String(v).slice(0, 200)) : [],
      }, error: null };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { reco: null, error: `judge_exception: ${message.slice(0, 160)}` };
  }
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const trace: RunTrace = { stage: 'request', runId: '' };
  const url = new URL(context.request.url);
  const rawDate = url.searchParams.get('date');
  const date = rawDate && /^\d{4}-\d{2}-\d{2}$/.test(rawDate) ? rawDate : kstDate(Date.now());
  try {
    return await handleDaily(context, trace);
  } catch (error) {
    const e = error instanceof Error ? error : new Error(String(error));
    const now = Date.now();
    let previous: DailyRun | null = null;
    let previousReco: Record<string, unknown> | null = null;
    try {
      const [raw, recoRaw] = await Promise.all([
        context.env.PLANET.get(RUN_KEY(date)),
        context.env.PLANET.get(RECO_KEY(date)),
      ]);
      previous = raw ? JSON.parse(raw) as DailyRun : null;
      previousReco = recoRaw ? JSON.parse(recoRaw) as Record<string, unknown> : null;
    } catch { /* 실패 영수증 쓰기를 계속 시도한다 */ }
    const runId = trace.runId || previous?.runId || `${date}-${now.toString(36)}`;
    const failed: DailyRun = {
      runId, date, owner: 'nightly-auto', status: 'failed', stage: trace.stage,
      startedAt: previous?.startedAt ?? now, updatedAt: now,
      errorCode: 'unhandled_exception', errorName: e.name.slice(0, 80), errorMessage: e.message.slice(0, 300),
    };
    try {
      await Promise.all([
        context.env.PLANET.put(RUN_KEY(date), JSON.stringify(failed)),
        context.env.PLANET.put(RECO_KEY(date), JSON.stringify({
          ...(previousReco ?? {}), date, at: now, status: 'failed', failed: true, stage: trace.stage,
          errorCode: 'unhandled_exception', errorName: failed.errorName,
          errorMessage: failed.errorMessage, runId,
        })),
      ]);
    } catch (receiptError) {
      console.error(`sketch-daily receipt_write_failed date=${date} runId=${runId}`, receiptError);
    }
    console.error(`sketch-daily failed date=${date} runId=${runId} stage=${trace.stage}`, e);
    return json(500, {
      ok: false, failed: true, date, runId, stage: trace.stage,
      errorCode: 'unhandled_exception', errorName: failed.errorName, errorMessage: failed.errorMessage,
    });
  }
};

async function handleDaily(
  context: Parameters<PagesFunction<Env>>[0], trace: RunTrace,
): Promise<Response> {
  const { request, env } = context;
  // 날짜 오버라이드 — 이미 접힌 날짜의 생성 재시도 전용. 과거 하루를 새로 접지는 않는다.
  const url = new URL(request.url);
  const dateParam = url.searchParams.get('date');
  const resetParam = url.searchParams.get('reset') === '1';
  if (dateParam && !/^\d{4}-\d{2}-\d{2}$/.test(dateParam)) return json(400, { ok: false, error: 'bad_date' });
  const pendingParam = url.searchParams.get('pending') === '1';
  let date = dateParam ?? kstDate(Date.now());
  trace.stage = 'authenticate';

  // 인증: 크론(PUBLISH_KEY)이 정문. 재시도(?date=)에 한해 PULSE_KEY 보조 허용 —
  // (07-24: 검증·완주를 기록자가 직접 할 수 있어야 한다. 48시간 실사고의 구조적 수리.
  //  하루를 접는 권한은 여전히 PUBLISH_KEY 전용이다.)
  if (!env.PUBLISH_KEY) return json(500, { ok: false, error: 'PUBLISH_KEY not configured' });
  const pubOk = request.headers.get('X-Publish-Key') === env.PUBLISH_KEY;
  const pulseRetryOk = !!dateParam && !!env.PULSE_KEY && request.headers.get('X-Pulse-Key') === env.PULSE_KEY;
  if (!pubOk && !pulseRetryOk) return json(403, { ok: false, error: 'forbidden' });

  // ?pending=1 — 못 끝낸 하루를 이어 그린다(마감 없음). 없으면 조용히 물러난다.
  if (pendingParam) {
    const found = await findPendingDate((k) => env.PLANET.get(k), kstDate(Date.now()), PENDING_DAYS);
    if (!found) return json(200, { ok: true, done: true, skipped: 'no_pending', phase: 'no_pending' });
    date = found;
  }

  // 스케줄러가 모든 재시도를 소진했을 때 남기는 최종 영수증. 같은 인증 경로를 써서
  // Worker에 PLANET 바인딩이라는 두 번째 진실을 만들지 않는다.
  if (request.headers.get('X-Scheduler-Receipt') === 'failed') {
    const now = Date.now();
    // ⚠ 실사고 2026-08-11 밤(08-05에도 동일): 본진이 남긴 정직한 no_observations 영수증을
    //   심야 재시도의 「스케줄러 소진」 영수증이 덮어써 진단이 사라졌다 — 아침 감시자가
    //   상류 결함(관찰 없음) 대신 엉뚱한 실패를 보고했다. 정당한 종료 기록은 실패 영수증보다
    //   진실에 가깝다 — 지우지 않는다. partial·failed·무기록만 소진 영수증으로 덮는다.
    const prevRecoRaw = await env.PLANET.get(RECO_KEY(date));
    const prevReco = prevRecoRaw ? JSON.parse(prevRecoRaw) as HonestRecoLike : null;
    if (recoIsHonestTerminal(prevReco)) {
      return json(200, { ok: true, receipt: 'kept', kept: prevReco });
    }
    const priorRaw = await env.PLANET.get(RUN_KEY(date));
    const prior = priorRaw ? JSON.parse(priorRaw) as DailyRun : null;
    const runId = prior?.runId ?? `${date}-${now.toString(36)}`;

    // ⚠ 실사고 2026-08-15: 2장에서 멈췄는데 영수증에 사유가 없었다. 여기가 원인이었다 —
    //   무엇 때문에 멈췄든 **항상 max_calls_exhausted라고 적었다.** 시간예산으로 멈춰도,
    //   호출이 되풀이 실패해도 같은 문장이 나갔다. 침묵보다 나쁜 건 **틀린 이름**이다.
    //   이제 스케줄러가 몸통에 진짜 사유를 실어 보낸다(없으면 옛 문구로 떨어진다).
    const sent = await request.json().catch(() => null) as {
      reason?: string; detail?: string; fetchErrors?: number; elapsedMs?: number;
    } | null;
    const REASONS: Record<string, { name: string; msg: string }> = {
      time_budget_exhausted: {
        name: 'SchedulerTimeBudget',
        msg: '스케줄러 시간예산(12분)을 다 써서 멈췄다 — 콜은 남아 있었다',
      },
      fetch_errors: {
        name: 'SchedulerFetchErrors',
        msg: '생성 엔드포인트 호출이 되풀이 실패해 멈췄다 (타임아웃·네트워크)',
      },
      not_folded: {
        name: 'SchedulerNotFolded',
        msg: '접힌 적 없는 하루라 재시도가 살릴 수 없다 — 본진이 안 돌았다',
      },
      max_calls_exhausted: {
        name: 'SchedulerExhausted',
        msg: 'scheduler exhausted MAX_CALLS without done or a valid terminal skip',
      },
    };
    const picked = REASONS[String(sent?.reason ?? '')] ?? REASONS.max_calls_exhausted;
    const errorCode = String(sent?.reason ?? 'max_calls_exhausted');

    const failed: DailyRun = {
      runId, date, owner: 'nightly-auto', status: 'failed', stage: 'scheduler_exhausted',
      startedAt: prior?.startedAt ?? now, updatedAt: now,
      errorCode, errorName: picked.name, errorMessage: picked.msg,
    };
    // ⚠ 옛 판은 여기서 영수증을 통째로 갈아끼워 **picks·errors·trialId를 지웠다.**
    //   08-11 영수증에 몇 장까지 갔는지·AI가 뭐라 했는지가 하나도 안 남은 이유가 이것이다.
    //   실패했다는 사실을 적는 것과 거기까지의 기록을 지우는 것은 다른 일이다.
    const kept = (prevReco ?? {}) as Record<string, unknown>;
    await Promise.all([
      env.PLANET.put(RUN_KEY(date), JSON.stringify(failed)),
      env.PLANET.put(RECO_KEY(date), JSON.stringify({
        ...kept,
        date, at: now, status: 'failed', failed: true, stage: failed.stage,
        errorCode, errorName: failed.errorName, errorMessage: failed.errorMessage, runId,
        schedulerDetail: typeof sent?.detail === 'string' ? sent.detail.slice(0, 900) : null,
        schedulerFetchErrors: typeof sent?.fetchErrors === 'number' ? sent.fetchErrors : null,
        schedulerElapsedMs: typeof sent?.elapsedMs === 'number' ? sent.elapsedMs : null,
      })),
    ]);
    return json(200, { ok: true, receipt: 'failed', runId, reason: errorCode });
  }

  // 건너뛰어도 기록은 남긴다 — 아침 실험실이 "왜 없는지"를 말할 수 있게 (침묵이 버그다).
  // 이미 생성 기록이 있으면 덮지 않는다.
  const recordSkip = async (skipped: string) => {
    if (!(await env.PLANET.get(RECO_KEY(date)))) {
      await env.PLANET.put(RECO_KEY(date), JSON.stringify({ date, at: Date.now(), skipped }));
    }
  };

  // ② 사람 우선 — 이미 접힌 하루가 있으면 자동은 물러난다
  trace.stage = 'read_memory';
  const [storedRaw, runRaw] = await Promise.all([
    env.PLANET.get(memoryKey(date)),
    env.PLANET.get(RUN_KEY(date)),
  ]);
  let run = runRaw ? JSON.parse(runRaw) as DailyRun : null;
  trace.runId = run?.runId ?? '';
  let day: DayMemory;
  if (storedRaw) {
    // 실사고(07-23 첫 실전): 크론이 하루를 접었는데 AI가 3연속 실패(AiError 3040/5030).
    // 이때 재실행하면 '사람 우선'으로 오인해 물러났다 — 자동 생성이 전멸한 날은
    // 접힌 하루를 재사용해 생성만 재시도한다 (하루는 다시 접지 않는다).
    const recoRaw = await env.PLANET.get(RECO_KEY(date));
    const prevReco = recoRaw ? JSON.parse(recoRaw) as {
      picks?: unknown[]; errors?: unknown[]; skipped?: string; reco?: unknown;
    } : null;
    day = JSON.parse(storedRaw) as DayMemory;
    const ownership = foldedDayDecision(
      day,
      !!run && run.owner === 'nightly-auto' && run.date === date,
    );
    const ownedByAuto = ownership === 'resume';
    const resumable = ownedByAuto || (!!prevReco && !prevReco.skipped
      && Array.isArray(prevReco.picks) && prevReco.picks.length < 3)
      // 08-12 실사고 복구: 세 장과 reco:null은 판정기가 응답 뒤에서 증발했다는 직접 증거다.
      // 옛 하루에 foldedBy가 없더라도 그림을 다시 만들지 않고 판정 단계만 재개한다.
      || recoNeedsJudge(prevReco)
      // 실사고(07-24, 매일 밤 반복된 교착): 크론이 하루를 접은 직후 30초에 살해당하면
      // memoryKey는 있는데 reco엔 자정의 no_observations 잔해만 남는다. 하루가 접혔다는
      // 것은 관측이 있었다는 뜻 — 그 위의 '관측 없음' 기록은 모순이며 사람일 수 없다.
      // 이 잔해는 재개 신호로 읽는다 (human_day는 그대로 존중 — 사람 우선 원칙 무손상).
      || prevReco?.skipped === 'no_observations'
      || (resetParam && pulseRetryOk);   // 리셋: 시험분 폐기 후 정규 품질로 재생성 (재시도 경로 전용)
    if (!resumable) {
      const skipped = ownership;
      await recordSkip(skipped);
      return json(200, {
        ok: true, skipped,
        detail: skipped === 'human_day'
          ? `${date}의 하루를 사람이 접었다 — 사람 우선(조건 ②)`
          : `${date}의 옛 하루는 접은 주체를 증명할 수 없어 자동이 덮지 않는다`,
      });
    }
  } else {
    if (dateParam) {
      return json(400, { ok: false, error: `not_folded: ${date} — 날짜 지정은 접힌 하루의 재시도 전용 (과거 하루를 새로 접지 않는다)` });
    }
    // ③ 하루 접기 — 관찰이 없으면 접지 않는다
    const capturesRaw = await env.PLANET.get('capture_meta');
    const captures: CaptureLike[] = capturesRaw ? JSON.parse(capturesRaw) : [];
    // 순간 고르기에 별이의 Selection 가산점이 이제야 흐른다 (라이브 별이 상태만 — 관찰자 로그 아님)
    const foldGenome = buildGenomeContext('byeoli', null).context;
    const built = buildDayMemory(captures, date, foldGenome?.selection ?? []);
    if (!built) {
      await recordSkip('no_observations');
      return json(200, { ok: true, skipped: 'no_observations', detail: `${date}에 관찰이 없다 — 빈 기억을 지어내지 않는다(조건 ③)` });
    }
    const now = Date.now();
    const runId = `${date}-${now.toString(36)}-${crypto.randomUUID().slice(0, 8)}`;
    trace.runId = runId;
    run = {
      runId, date, owner: 'nightly-auto', status: 'folding', stage: 'before_memory',
      startedAt: now, updatedAt: now,
    };
    // KV 다중 키 트랜잭션은 없으므로 원자성을 주장하지 않는다. memory보다 이 영수증을
    // 먼저 써 어느 지점에서 죽어도 다음 호출이 nightly-auto 소유임을 증명하게 한다.
    trace.stage = 'before_memory';
    await env.PLANET.put(RUN_KEY(date), JSON.stringify(run));
    let folded: DayMemory = {
      ...built, foldedBy: 'nightly-auto', foldedAt: Date.now(), foldRunId: runId,
    };
    // 431-M A안 보정 — 그날 발행된 글을 **사진으로 대조해** 붙인다. 발행은 접히기 전에
    // 끝나므로 발행 시점에는 붙일 수 없었다(실측 4일 전부). 사진이 어긋나면 안 붙인다.
    const linked = linkPendingDiary(folded, await readPendingDiaries(env, date).catch(() => []));
    folded = linked.day;
    trace.diaryLink = linked.result;
    const errs = validateDayMemory(folded);
    if (errs.length) return json(500, { ok: false, error: 'invalid_memory', detail: errs });
    trace.stage = 'write_memory';
    await env.PLANET.put(memoryKey(date), JSON.stringify(folded));
    day = folded;
    run = { ...run, status: 'generating', stage: 'prepare_refs', updatedAt: Date.now() };
    trace.stage = 'prepare_refs';
    await env.PLANET.put(RUN_KEY(date), JSON.stringify(run));
  }

  // 실측 확정(07-24): 응답 이후의 백그라운드 실행(waitUntil)은 이 환경에서 기록을 남기지
  // 못한다 (202 후 무변화 2회 실증). 결론: 30초 안에 동기로 끝내고, 한 장 끝날 때마다
  // 즉시 기록한다 — 도중에 끊겨도 부분 결과가 남는다.
  trace.stage = 'generate';
  const summary = await generateDaily(env, date, day, resetParam && pulseRetryOk);
  let autoPublish: SketchPublishResult | null = null;
  if (summary.done) {
    trace.stage = 'publish_recommended';
    autoPublish = await autoPublishRecommendedSketch(env, date);
  }
  const pipelineDone = summary.done && !!autoPublish?.ok;
  const requestOk = summary.made > 0 || pipelineDone;
  const now = Date.now();
  const currentRunRaw = await env.PLANET.get(RUN_KEY(date));
  const currentRun = currentRunRaw ? JSON.parse(currentRunRaw) as DailyRun : run;
  if (currentRun) {
    await env.PLANET.put(RUN_KEY(date), JSON.stringify({
      ...currentRun,
      status: pipelineDone ? 'done' : 'generating',
      stage: pipelineDone
        ? 'complete'
        : summary.done ? 'publish_retry' : summary.phase === 'images_ready' ? 'judge_next' : summary.phase,
      updatedAt: now,
    }));
  }
  return json(requestOk ? 200 : 502, {
    ok: requestOk, date, memoryEventId: day.memoryEventId,
    generatedNow: summary.made, totalImages: summary.total, done: pipelineDone,
    artDone: summary.done,
    trialId: summary.trialId, errors: summary.errors,
    phase: summary.phase,
    autoPublish,
    next: pipelineDone
      ? (autoPublish?.skipped === 'no_recommended_pick'
          ? '3장 모두 불합격 — 자동 발행하지 않았다'
          : autoPublish?.skipped === 'already_published'
            ? '오늘 그림은 이미 발행됐다 — 중복하지 않았다'
            : '추천 그림 1장 자동 채택·발행 완료')
      : summary.done
        ? `판정 완료·발행 대기 — 심야 재시도 (${autoPublish?.error ?? 'unknown'})`
      : summary.phase === 'images_ready'
        ? '3장 완성 — 같은 호출을 한 번 더 해 판정을 기록한다'
        : summary.phase === 'judge_retry'
          ? '판정 실패 — 같은 호출을 다시 해 판정만 재시도한다'
          : '아직 부족 — 같은 호출을 다시 (한 호출 = 한 장)',
  });
}

async function generateDaily(
  env: Env, date: string, day: DayMemory, reset = false,
): Promise<{
  made: number; total: number; done: boolean; trialId: string; errors: string[];
  phase: 'generate_next' | 'images_ready' | 'judge_retry' | 'complete';
}> {
  // 이어 그리기 상태 — flux-2-dev는 느리다(장당 10~20초). 한 호출은 한 장만 (30초 창 준수).
  const prevRaw = await env.PLANET.get(RECO_KEY(date));
  const prev = prevRaw ? JSON.parse(prevRaw) as {
    trialId?: string; picks?: { seed: number; r2Key: string }[]; errors?: string[]; skipped?: string;
    status?: string; reco?: CandidateRecommendation | null;
  } : null;
  const priorPicks = (!reset && !prev?.skipped && Array.isArray(prev?.picks)) ? prev!.picks! : [];
  const errors: string[] = [];
  if (reset && (prev?.picks?.length ?? 0) > 0) errors.push(`reset: 이전 ${prev!.picks!.length}장 폐기 후 정규 품질로 재생성`);

  // ⚙ 09-01 구조 교체 (사장 판정 「그림일기는 아예 새로 설계해야겠다」).
  //   68일 실측: 무개입 완주 3일(4%) · 연속 성공 최장 이틀 · 실패 1위가 「별이가 전부 물림」 21일.
  //   옛 구조는 곱셈이었다 — 관찰 있음 × 3장 다 그림 × 그중 합격 × 판정 파싱 × 밤 안에.
  //   하나만 어긋나도 그날은 영영 없었다. 그래서 셋을 뒤집는다:
//     ① 마감을 없앤다 — 못 끝낸 하루는 큐에 남고 다음 날들이 이어 그린다(?pending=1).
//     ② 3장 묶음 → 한 장씩: 그리고 바로 보이고, 통과하면 거기서 끝난다(운 좋은 날은 1/3 시간).
//     ③ 물린 이유가 다음 장 프롬프트에 실린다 — 같은 이유로 셋이 물리던 21일의 정체를 친다.
  const judgedCount = (!reset && typeof prev?.judgedCount === 'number') ? prev.judgedCount : 0;
  const rejections: string[] = (!reset && Array.isArray(prev?.rejections)) ? prev!.rejections! : [];

  // ① 아직 별이가 안 본 장이 있으면 **그 한 장**을 본다
  if (priorPicks.length > judgedCount) {
    if (hasRecordedRecommendation(prev?.reco)) {
      return { made: 0, total: priorPicks.length, done: true, trialId: prev?.trialId ?? '', errors: ['already_complete'], phase: 'complete' };
    }
    const pk = priorPicks[judgedCount];
    const obj = await env.CAPTURES.get(pk.r2Key);
    const bytes = obj ? await obj.arrayBuffer() : null;
    const mediaType = bytes ? detectVisionMediaType(bytes) : null;
    if (!bytes || !mediaType) {
      const judgeError = `judge_image_missing: ${pk.r2Key}`;
      errors.push(judgeError);
      // 읽을 수 없는 장은 본 것으로 치고 넘어간다 — 여기서 멈추면 그날이 영영 막힌다
      await env.PLANET.put(RECO_KEY(date), JSON.stringify({
        ...prev, date, at: Date.now(), picks: priorPicks, reco: null, judgedCount: judgedCount + 1,
        rejections: [...rejections, `${judgedCount + 1}장: 파일을 읽지 못함`],
        status: 'partial', errors: [...(prev?.errors ?? []), ...errors], judgeError,
      }));
      return { made: 0, total: priorPicks.length, done: false, trialId: prev?.trialId ?? '', errors, phase: 'judge_skip_unreadable' };
    }
    const judged = await judgeCandidates(env, day, [{ seed: pk.seed, bytes, mediaType }]);
    if (!judged.reco) {
      const judgeError = judged.error ?? 'judge_unknown_failure';
      errors.push(judgeError);
      await env.PLANET.put(RECO_KEY(date), JSON.stringify({
        ...prev, date, at: Date.now(), picks: priorPicks, reco: null, judgedCount, rejections,
        status: 'judge_failed', errors: [...(prev?.errors ?? []), ...errors], judgeError,
      }));
      return { made: 0, total: priorPicks.length, done: false, trialId: prev?.trialId ?? '', errors, phase: 'judge_retry' };
    }
    const passed = Number(judged.reco.pick) === 1;
    if (passed) {
      // 이 장이 오늘의 그림이다. pick은 **전체 목록에서의 번호**로 적는다(발행이 picks[pick-1]을 쓴다).
      await env.PLANET.put(RECO_KEY(date), JSON.stringify({
        ...prev, date, at: Date.now(), picks: priorPicks,
        reco: { ...judged.reco, pick: judgedCount + 1 },
        judgedCount: judgedCount + 1, rejections,
        status: 'done', failed: false, errors: [...(prev?.errors ?? []), ...errors],
        judgedAt: Date.now(), judgeError: null,
        errorCode: null, errorName: null, errorMessage: null, stage: 'complete',
      }));
      return { made: 0, total: priorPicks.length, done: true, trialId: prev?.trialId ?? '', errors, phase: 'complete' };
    }
    // 물렸다 — 사유를 쌓고 다음 장으로. 이 사유가 다음 프롬프트에 실린다.
    const why = (judged.reco.verdicts?.[0] || judged.reco.reasons || '사유 미기록').slice(0, 200);
    await env.PLANET.put(RECO_KEY(date), JSON.stringify({
      ...prev, date, at: Date.now(), picks: priorPicks, reco: null,
      judgedCount: judgedCount + 1, rejections: [...rejections, `${judgedCount + 1}장: ${why}`],
      status: 'partial', errors: [...(prev?.errors ?? []), ...errors],
    }));
    return { made: 0, total: priorPicks.length, done: false, trialId: prev?.trialId ?? '', errors: [...errors, `rejected_${judgedCount + 1}: ${why.slice(0, 80)}`], phase: 'rejected_draw_next' };
  }

  // ② 시도 상한 — 큐가 무한히 자라지 않게. 다 쓰면 정직한 종결로 접는다.
  if (priorPicks.length >= MAX_ATTEMPTS) {
    await env.PLANET.put(RECO_KEY(date), JSON.stringify({
      ...prev, date, at: Date.now(), picks: priorPicks, reco: null, judgedCount, rejections,
      status: 'failed', failed: true, stage: 'attempts_exhausted',
      errorCode: 'attempts_exhausted', errorName: 'AttemptsExhausted',
      errorMessage: `${MAX_ATTEMPTS}장을 그렸는데 별이가 전부 물렸다 — 그날 기억과 맞는 그림을 못 얻었다`,
      errors: [...(prev?.errors ?? []), ...errors, ...rejections],
    }));
    return { made: 0, total: priorPicks.length, done: false, skipped: 'attempts_exhausted', trialId: prev?.trialId ?? '', errors, phase: 'attempts_exhausted' };
  }

  const n = priorPicks.length;   // 다음에 그릴 장 번호 (seed 결정론 유지)

  // 생성 준비 — 확정 레시피 그대로 (수동 흐름과 동일 재료·동일 모델 flux-2-dev)
  const provider = selectProvider('workers-ai', env);
  const sceneEn = await translateScene(env, day.event.lines).catch(() => null);
  const subjTr = day.event.targetLabel
    ? await translateSubjects(env, [day.event.targetLabel])
    : { subjects: [] as string[], notes: [] as string[] };
  errors.push(...subjTr.notes);
  // 참조는 화면이 정한다 — 크론이 자기 목록을 따로 들고 있으면 화면과 밤이 어긋난다.
  const roles = await readRefRoles(env);
  const assigned = refsWithRole(roles, 'character');
  if (!assigned.length) {
    errors.push('ref_roles_empty: 화면에서 배정된 캐릭터 참조가 없어 폴백 목록을 썼다 — 실험실 ②에서 역할을 지정하라');
  }
  const allRefKeys = orderCharacterRefs(assigned.length ? assigned : DAILY_REFS_FALLBACK);
  const drawGenome = buildGenomeContext('byeoli', null).context;
  // 누구를 부를지는 별이가 고른다 (08-30 사장 판정) — 못 고르면 전부 부르고 사유를 남긴다
  const chosen = await chooseCharacterRefs(env, day, allRefKeys, drawGenome);
  const refKeys = chosen.keys;
  if (chosen.note) errors.push(chosen.note);
  const refs: { name: string; bytes: ArrayBuffer; contentType: string }[] = [];
  for (const key of refKeys) {
    const obj = await env.CAPTURES.get(key);
    if (obj) refs.push({ name: key.split('/').pop() ?? 'ref', bytes: await obj.arrayBuffer(), contentType: obj.httpMetadata?.contentType ?? 'image/png' });
  }
  const prompt = buildImagePrompt(
    day.event, drawGenome, sceneEn, subjTr.subjects,
    { characters: refs.length, styles: 0 },
    NIGHTLY_POSE_VARIANTS[n % NIGHTLY_POSE_VARIANTS.length],
    rejections,   // 별이가 앞서 물린 이유 — 같은 실수를 되풀이하지 않는다
  );
  const promptHash = hashPrompt(prompt);
  // trialId는 첫 호출 것을 계승 — 번역이 매번 조금 달라도 같은 하루의 한 시도로 묶는다
  const trialId = prev?.trialId && !prev.skipped
    ? prev.trialId
    : `${date}-${hashPrompt(`${prompt}\n#refs:${refKeys.join(',')}|\n#steps:${DAILY_STEPS}`)}`;

  const base = dailySeed(date);
  const TRANSIENT_AI = /3040|5030|429|capacity|timeout|temporarily/i;
  const gen = (withRefs: boolean) => provider.generate(env, {
    plan: { memory: day.event, prompt, referenceKeys: withRefs ? refKeys : [] },
    model: DAILY_MODEL, params: { steps: DAILY_STEPS, width: 1024, height: 1024 },
    references: withRefs ? refs : [], seed: base + n,
  });
  let usedRefs = refs.length > 0;
  let art = await gen(usedRefs);
  if ('error' in art && TRANSIENT_AI.test(String(art.error)) && usedRefs) {
    errors.push(`#${n}: refs_dropped_after_transient — 무참조 재시도`);
    usedRefs = false;
    art = await gen(false);
  }

  const persist = async (newPick: { seed: number; r2Key: string } | null) => {
    await env.PLANET.put(RECO_KEY(date), JSON.stringify({
      date, at: Date.now(), trialId,
      picks: newPick ? [...priorPicks, newPick] : priorPicks,
      judgedCount, rejections,
      reco: null,
      errors: [...(prev?.errors ?? []).filter((e) => typeof e === 'string'), ...errors],
      status: newPick ? 'images_ready' : 'partial',   // 09-01: 한 장 그리면 곧 판정 차례다
    }));
  };

  if ('error' in art) { errors.push(`#${n}: ${art.error}`); await persist(null); return { made: 0, total: priorPicks.length, done: false, trialId, errors, phase: 'generate_next' }; }
  if (!art.bytes) { errors.push(`#${n}: empty`); await persist(null); return { made: 0, total: priorPicks.length, done: false, trialId, errors, phase: 'generate_next' }; }

  const r2Key = trialKey(trialId, DAILY_MODEL, n);
  const outputMediaType = detectVisionMediaType(art.bytes);
  if (!outputMediaType) {
    errors.push(`#${n}: unsupported_image_bytes`);
    await persist(null);
    return { made: 0, total: priorPicks.length, done: false, trialId, errors, phase: 'generate_next' };
  }
  await env.CAPTURES.put(r2Key, art.bytes, { httpMetadata: { contentType: outputMediaType } });
  const record: TrialRecord = {
    trialId, createdAt: Date.now(), providerId: 'workers-ai', model: DAILY_MODEL,
    params: { steps: DAILY_STEPS, width: 1024, height: 1024 }, seed: base + n, r2Key,
    promptHash, sketchVersion: SKETCH_VERSION, note: 'daily-auto (판정 추천작 1장 예약 발행)',
    referenceApplied: usedRefs, role: usedRefs ? 'candidate' : 'control',
    sceneLabel: null, refKeys: usedRefs ? refKeys : [],
  };
  const metaRaw = await env.PLANET.get(META_KEY);
  const prevMeta: TrialRecord[] = metaRaw ? JSON.parse(metaRaw) : [];
  await env.PLANET.put(META_KEY, JSON.stringify([record, ...prevMeta.filter((r) => r.r2Key !== r2Key)].slice(0, META_KEEP)));
  await persist({ seed: base + n, r2Key });

  const total = priorPicks.length + 1;
  console.log(`sketch-daily one-shot date=${date} n=${n} total=${total} errors=${errors.length}`);
  return {
    made: 1, total, done: false, trialId, errors,
    phase: total >= 3 ? 'images_ready' : 'generate_next',
  };
}
