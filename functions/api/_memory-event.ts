// BUILD 431-M — MemoryEvent 저장소 (별이의 '오늘'이 서버에 남는 자리)
// 판정: Vase 2026-07-20 — 스타일 판정은 통과로 보고 여기로 넘어간다.
//
// 왜 필요한가: 지금까지 그림 시험은 사람이 손으로 하루를 지어내 넣었다.
//   memory: { targetLabel: '화분', lines: ['화분 앞에 오래 머물렀다.', ...] }
// 그림은 별이가 그리지만 **'오늘'은 우리가 줬다.** 어젯밤 발견과 같은 모양이다 —
// 관찰 기억(archive)이 관찰자 브라우저에만 있고 서버엔 별이의 오늘이 없다.
//
// 하드룰: 하나의 기억에서 글·사진·그림 **세 갈래**가 나온다. 셋이 각각 다른 사건을
// 만들면 실패다. 그래서 저장 단위는 문장도 사진도 아니고 MemoryEvent다.
//
// ⚠ 출처의 한계(정직하게 기록): 지금 유일한 서버측 관찰 흔적은 capture_meta이고,
// 그건 ops 콘솔이 엽서를 올릴 때만 쌓인다. 즉 아직도 사람이 있어야 하루가 남는다.
// 진짜 해법은 Authority가 스스로 관찰을 발생시키는 것인데, 그건 역할 경계
// (홈즈 영역)이자 하드룰(관찰자 무지) 문제라 별도 판단이 필요하다.
// 이 모듈은 **저장 계약**을 먼저 세워, 나중에 어느 출처가 붙어도 같은 자리에 쌓이게 한다.

import {
  buildMemoryEvent, densityOf, type ArchiveEntry, type MemoryEvent, type SketchDensity,
} from './_daily-sketch.ts';
import type { SelectionFocus } from './_genome-identity.ts';

export const MEMORY_VERSION = '431M-v1';

/** capture_meta 한 건 (ops/capture.ts의 CaptureMeta와 같은 모양, 읽기용 최소 필드) */
export interface CaptureLike {
  captureId?: string;
  r2Key?: string;
  capturedAt: number;
  skyPhase?: string | null;
  weather?: string | null;
  byeoliAction?: string | null;
  targetId?: string | null;
  targetType?: string | null;
  targetLabel?: string | null;
  diaryLines?: string[];
}

/**
 * 사건 식별자. `memory:<date>` 하나만으로는 같은 날의 꽃·비·빼콩 사건이 뒤섞인다.
 * 저장 키는 날짜 정본을 유지하되 **내부에 사건 id**를 둬서 잘못 합쳐지지 않게 한다.
 * 형식: `<ISO 초까지>:<대상 슬러그>` — 예) 2026-07-20T14:23:10Z:flowerpot
 */
export function memoryEventId(momentAt: number, targetLabel: string | null): string {
  const iso = new Date(Math.floor(momentAt / 1000) * 1000).toISOString().replace(/\.\d{3}Z$/, 'Z');
  const slug = (targetLabel ?? 'moment')
    .trim().toLowerCase()
    .replace(/[^a-z0-9가-힣]+/g, '-').replace(/^-|-$/g, '')
    .slice(0, 24) || 'moment';
  return `${iso}:${slug}`;
}

/** 하루 한 건. 세 갈래가 여기서 갈라진다. */
export interface DayMemory {
  version: string;
  /** 이 하루에서 고른 **사건**의 id — 날짜만으로 구분되지 않는 것을 구분한다 */
  memoryEventId: string;
  /** 이 사건이 어느 관찰에서 파생됐는지 — 추적 가능해야 한다 */
  sourceCaptureIds: string[];
  date: string;                 // KST YYYY-MM-DD
  builtAt: number;
  /** 하루를 접은 주체. 없는 옛 데이터는 legacy-unknown이며 human으로 추정하지 않는다. */
  foldedBy?: 'human' | 'nightly-auto';
  /** 접기가 완료된 시각. 옛 데이터에는 없을 수 있다. */
  foldedAt?: number;
  /** nightly-auto가 접은 경우 선행 run 영수증과 잇는 id. */
  foldRunId?: string | null;
  /** 그날 서버에 남은 관찰 조각 수 */
  momentCount: number;
  /** 고른 순간 + 그 순간의 관찰들 */
  event: MemoryEvent;
  /** 그 순간에 실제로 찍힌 사진(R2 키) — 있으면 글·그림과 같은 순간이 된다 */
  photoKey: string | null;
  density: SketchDensity;
}

export const memoryKey = (date: string) => `memory:${date}`;

/** 같은 사건으로 묶는 시간 창 — buildMemoryEvent의 창과 같아야 한다 */
const CLUSTER_WINDOW_MS = 10 * 60 * 1000;

/** KST 날짜 문자열 */
export function kstDate(ms: number): string {
  return new Date(ms + 9 * 3600 * 1000).toISOString().slice(0, 10);
}

/**
 * capture_meta → ArchiveEntry. walk의 logObservation 산출물과 같은 모양으로 맞춰
 * selectMoment/buildMemoryEvent를 그대로 재사용한다.
 *
 * ⚠ duration이 없다. 엽서 메타는 머문 시간을 안 남긴다. 그래서 **그 순간 주변(±10분)에
 * 쌓인 관찰 줄 수**를 머무름의 대리 지표로 쓴다. 한 엽서의 줄 수만 세면 40분 뒤의
 * 고립된 관찰 1건이 앞의 뭉친 2건과 동점이 되고, 동점에선 늦은 쪽이 이겨 엉뚱한 순간이
 * 뽑힌다(테스트가 잡음). 정확한 값이 아니라 대리값임을 명시한다.
 */
export function capturesToEntries(captures: CaptureLike[], date: string): ArchiveEntry[] {
  const out: ArchiveEntry[] = [];
  for (const c of captures) {
    if (!c || typeof c.capturedAt !== 'number') continue;
    if (kstDate(c.capturedAt) !== date) continue;
    const lines = (c.diaryLines ?? []).filter((l) => typeof l === 'string' && l.trim());
    if (!lines.length) continue;
    // 대리 지표(초가 아니다): 이 순간 주변에 관찰이 얼마나 몰렸는가
    const proxyDuration = captures.reduce((n, o) => {
      if (!o || typeof o.capturedAt !== 'number') return n;
      if (Math.abs(o.capturedAt - c.capturedAt) > CLUSTER_WINDOW_MS) return n;
      return n + (o.diaryLines ?? []).filter((l) => typeof l === 'string' && l.trim()).length;
    }, 0);
    lines.forEach((line, i) => {
      out.push({
        observer: 'byeoli',
        kind: c.byeoliAction ? 'act' : 'diary',
        line,
        targetId: c.targetId ?? null,
        targetType: c.targetType ?? null,
        targetLabel: c.targetLabel ?? null,
        // 대표 줄에만 대리 duration을 준다 — 같은 순간의 모든 줄이 경쟁하면 안 된다
        duration: i === 0 ? proxyDuration : null,
        mood: c.byeoliAction ?? null,
        createdAt: c.capturedAt + i,
        date,
        eventId: c.captureId ?? null,
      });
    });
  }
  return out;
}

/** 그 순간에 찍힌 사진 — 글·그림과 같은 순간을 가리키게 한다 */
export function photoForMoment(captures: CaptureLike[], momentAt: number): string | null {
  let best: CaptureLike | null = null;
  for (const c of captures) {
    if (!c?.r2Key || typeof c.capturedAt !== 'number') continue;
    if (Math.abs(c.capturedAt - momentAt) > 10 * 60 * 1000) continue;   // 같은 사건 창(10분)
    if (!best || Math.abs(c.capturedAt - momentAt) < Math.abs(best.capturedAt - momentAt)) best = c;
  }
  return best?.r2Key ?? null;
}

/** 하루를 세운다. 관찰이 없으면 하루도 없다 (빈 기억을 지어내지 않는다). */
export function buildDayMemory(
  captures: CaptureLike[], date: string, focus: SelectionFocus[] = [],
): DayMemory | null {
  const entries = capturesToEntries(captures, date);
  const event = buildMemoryEvent(entries, date, focus);
  if (!event) return null;
  // 이 사건에 실제로 기여한 관찰만 — 같은 사건 창(±10분) 안의 capture id
  const sourceCaptureIds = [...new Set(
    entries
      .filter((e) => Math.abs(e.createdAt - event.momentAt) <= 10 * 60 * 1000 && e.eventId)
      .map((e) => e.eventId as string),
  )];
  return {
    version: MEMORY_VERSION,
    memoryEventId: memoryEventId(event.momentAt, event.targetLabel),
    sourceCaptureIds,
    date,
    builtAt: Date.now(),
    momentCount: entries.length,
    event,
    photoKey: photoForMoment(captures, event.momentAt),
    density: densityOf(entries, date),
  };
}

/** 세 갈래 중 하나를 채운다. 나머지는 건드리지 않는다 — 같은 기억에 붙는 것이 핵심. */
export function attachBranch(
  day: DayMemory, branch: 'diaryText' | 'selectedPhoto' | 'sketchDiary', value: string,
): DayMemory {
  return { ...day, event: { ...day.event, [branch]: value } };
}

/* ── 431-M A안 (홈즈 판정 2026-07-25, 집행 07-26) ──────────────────
   증상: `갈래: 글 — · 사진 ✓ · 그림 ✓` 가 반복. 홈즈 판정 — 고장이 아니라 계약이 그랬다.
   "431-M 원칙은 '하나의 기억에서 세 갈래'였지만, 실제 구현은 더 약한 **사후 역추적**이었다.
    '세 갈래 완성'이라는 이름과 실제 보장이 어긋나 있다."

   원인은 **독립 선택기 두 개**. 기억은 하루 사건 하나의 `photoKey`를 고르고, autopost는
   40장 후보에서 임의로 고른다 — 같은 사진일 보장이 없다.

   A안: 발행 선택과 기억 선택이 **같은 사건을 공유한다.**
     · DayMemory가 있으면 그 `photoKey`를 발행 사진으로 우선한다 (autopost 쪽)
     · 발행이 성공하면 그 글을 **발행 시점에** 같은 사건의 글 갈래로 붙인다 (역추적이 아니라)
     · 셋 다 같은 `memoryEventId`를 들고 다닌다 — 아래 함수가 그 id를 대조한다 */

export type DiaryAttachResult = 'attached' | 'already' | 'event_changed' | 'no_memory';

/**
 * 발행된 글을 그 사건의 글 갈래로 붙인다. **멱등** — 이미 붙어 있으면 덮지 않는다.
 *
 * `memoryEventId`를 대조하는 것이 핵심이다. 발행 도중 하루가 다시 세워졌다면(다른 사건이
 * 뽑혔다면) 붙이지 않는다 — 엉뚱한 사건에 남의 글을 매다는 것이 빈칸보다 나쁘다.
 */
export async function attachPublishedDiary(
  env: { PLANET: KVNamespace },
  date: string,
  expectedEventId: string,
  text: string,
): Promise<DiaryAttachResult> {
  const raw = await env.PLANET.get(memoryKey(date));
  if (!raw) return 'no_memory';
  const day = JSON.parse(raw) as DayMemory;
  if (day.memoryEventId !== expectedEventId) return 'event_changed';
  if (day.event.diaryText) return 'already';
  let next = attachBranch(day, 'diaryText', text);
  // 사진 갈래도 같은 사건의 photoKey로 함께 승격 — 셋이 같은 순간을 가리키게 한다
  if (!next.event.selectedPhoto && next.photoKey) next = attachBranch(next, 'selectedPhoto', next.photoKey);
  await env.PLANET.put(memoryKey(date), JSON.stringify(next));
  return 'attached';
}

/**
 * 글 갈래의 상태. `—` 하나로 뭉쳐 있던 것을 다섯으로 가른다 (홈즈 지시).
 * ⚠ **표시만 고치는 게 아니다** — 전부 실제 상태에서 파생된다.
 *
 *  - `linked`         연결됨 — 글 갈래가 채워졌다
 *  - `unused`         미사용 — 그날 발행 시도 자체가 없었다
 *  - `publish_failed` 발행 실패 — 시도는 있었으나 성공이 없다
 *  - `untraceable`    추적 불가 — 성공 발행은 있으나 이 사건에 사진이 없어 이을 근거가 없다
 *  - `awaiting_link`  연결 대기 — 성공 발행도 사진도 있는데 아직 안 붙었다 (재조정 대상)
 */
/* ── 431-M A안 보정 (Vase 판정 2026-07-28 00:0x, 실측 근거) ─────────────
   위 A안은 "발행 시점에 붙인다"였다. 판단은 맞았는데 **전제가 틀렸다.**
   발행은 08·18·22시고 하루는 23:30에 접힌다 — 실측 4일 전부:

     07-24 기억 00:21(다음날) · 07-25 23:38 · 07-26 23:50 · 07-27 23:43

   발행이 기억보다 먼저인 날이 하루도 없다. 그래서 autopost의 attachPublishedDiary는
   **한 번도 불리지 못했다.** `갈래: 글 —`이 매일 뜬 이유가 이것이다.

   근본은 이렇다 — **하루의 사건은 하루가 끝나야 정해진다.** 08시에 발행하면서 그날의
   사건을 알 수는 없다. 구조적으로 불가능한 것을 요구하고 있었다.

   보정: 발행 **시점에 글을 남겨두고**, 접을 때 **사진으로 대조해** 붙인다.
   홈즈가 사후 역추적을 물린 이유(엉뚱한 사진에 남의 글)는 그 대조가 막는다.
   ⚠ 운영 로그(_publish-log)는 원문을 담지 않는다(Layer 1). 그래서 키를 따로 둔다. */

export const pendingDiaryKey = (date: string) => `diary_pending:${date}`;

export interface PendingDiary {
  at: number;
  /** 그 발행에 실제로 실린 사진의 R2 키. 이것이 대조 근거다 */
  imageKey: string | null;
  text: string;
}

/** 하루에 남길 발행 기록 수. 슬롯이 셋이니 넉넉하다. */
const PENDING_KEEP = 6;

export async function stashPendingDiary(
  env: { PLANET: KVNamespace }, date: string, entry: PendingDiary,
): Promise<void> {
  const raw = await env.PLANET.get(pendingDiaryKey(date)).catch(() => null);
  let prev: PendingDiary[] = [];
  if (raw) { try { prev = JSON.parse(raw) as PendingDiary[]; } catch { prev = []; } }
  const next = [...(Array.isArray(prev) ? prev : []), entry].slice(-PENDING_KEEP);
  await env.PLANET.put(pendingDiaryKey(date), JSON.stringify(next));
}

export async function readPendingDiaries(
  env: { PLANET: KVNamespace }, date: string,
): Promise<PendingDiary[]> {
  const raw = await env.PLANET.get(pendingDiaryKey(date)).catch(() => null);
  if (!raw) return [];
  try { const p = JSON.parse(raw); return Array.isArray(p) ? p : []; } catch { return []; }
}

export type DiaryLinkResult = 'linked' | 'linked_by_date' | 'already' | 'no_pending';

/**
 * 접을 때 그날 발행된 글을 사건에 붙인다.
 *
 * ── 왜 사진 대조를 포기했나 (Vase 판정 C, 2026-07-28) ──────────────────
 * 처음엔 **사진이 같은 것만** 붙였다. 「엉뚱한 사진에 남의 글」을 막으려는 것이었고
 * 판단 자체는 옳았다. 그런데 실측하니 붙는 날이 하루도 없었다:
 *
 *   07-28 08:06 발행이 쓴 사진 = captures/walk/1784729115741.jpg → **07-22 것**
 *
 * autopost는 그날 기억이 없으면(=발행 시각엔 늘 없다) 전체 사진 풀에서 무작위로 뽑는다.
 * 그날 사건의 사진과 겹칠 일이 사실상 없다. 대조를 유지하면 계약은 아름답고 결과는 영영 빈칸이다.
 *
 * 더 근본적으로는 — **발행 글과 그날 사건은 같은 순간에서 나올 수가 없다.**
 * 글은 게놈이 08·18·22시에 쓰고, 사건은 하루가 끝나야 정해진다.
 * 그래서 「글 갈래」의 뜻을 바꾼다: *그 순간의 글*이 아니라 **그날의 글**이다.
 *
 * 사진이 같으면 여전히 그게 낫다 — `linked`로 구분해 남긴다. 아니면 `linked_by_date`.
 * 무엇으로 이었는지를 삼키지 않는다.
 */
/**
 * 이 발행이 **그날의 기억 사진**을 들고 나가야 하는가.
 *
 * ⚠ 하루 3회 발행인데 사건은 하루 하나다. 셋 다 같은 사진으로 나가면 안 되므로
 *   **하루에 한 번만** 들려 보낸다. 그런데 「이미 아무 사진이나 붙은 발행이 있으면 넘긴다」로
 *   판정하면 안 된다 — 아침 발행이 **임의로 고른 남의 날 사진**을 붙였을 때 그날 나머지가
 *   전부 막힌다 (2026-07-30 실측: 08:05가 어제 사진을 붙여 하루가 통째로 닫혔다).
 *   **그 사진이 이미 나갔는가**만 본다. 그러면 저녁 발행이 대신 들고 갈 수 있다.
 */
export function shouldCarryMemoryPhoto(
  photoKey: string | null | undefined,
  pending: readonly { imageKey?: string | null }[] | null | undefined,
): boolean {
  if (!photoKey) return false;
  if (!Array.isArray(pending)) return true;
  return !pending.some((p) => p?.imageKey === photoKey);
}

export function linkPendingDiary(
  day: DayMemory, pending: readonly PendingDiary[],
): { day: DayMemory; result: DiaryLinkResult } {
  if (day.event.diaryText) return { day, result: 'already' };

  const usable = pending.filter((p) => p?.text?.trim());
  if (!usable.length) return { day, result: 'no_pending' };

  // 같은 사진으로 나간 것이 있으면 그게 낫다 (여러 번이면 마지막 것 — 그날을 가장 늦게 말한 글)
  const exact = day.photoKey
    ? [...usable].reverse().find((p) => p.imageKey && p.imageKey === day.photoKey)
    : undefined;
  const pick = exact ?? usable[usable.length - 1];

  let next = attachBranch(day, 'diaryText', pick.text);
  if (!next.event.selectedPhoto && day.photoKey) next = attachBranch(next, 'selectedPhoto', day.photoKey);
  return { day: next, result: exact ? 'linked' : 'linked_by_date' };
}

export type DiaryBranchStatus = 'linked' | 'unused' | 'publish_failed' | 'untraceable' | 'awaiting_link';

export function diaryBranchStatus(
  day: Pick<DayMemory, 'photoKey'> & { event: Pick<MemoryEvent, 'diaryText'> },
  logsForDate: readonly { result: string }[],
): DiaryBranchStatus {
  if (day.event.diaryText) return 'linked';
  if (!logsForDate.length) return 'unused';
  if (!logsForDate.some((r) => r.result === 'success')) return 'publish_failed';
  if (!day.photoKey) return 'untraceable';
  return 'awaiting_link';
}

export const DIARY_STATUS_KO: Record<DiaryBranchStatus, string> = {
  linked: '연결됨',
  unused: '미사용',
  publish_failed: '발행 실패',
  untraceable: '추적 불가',
  awaiting_link: '연결 대기',
};

/** 저장 전 구조 검증. 실패한 기억은 쓰지 않는다. */
export function validateDayMemory(x: unknown): string[] {
  const errs: string[] = [];
  if (typeof x !== 'object' || x === null) return ['not an object'];
  const d = x as Partial<DayMemory>;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d.date ?? '')) errs.push('date must be KST YYYY-MM-DD');
  if (!d.event || typeof d.event !== 'object') errs.push('event required');
  else {
    if (!Array.isArray(d.event.lines) || !d.event.lines.length) errs.push('event.lines is empty');
    if (d.event.date !== d.date) errs.push('event.date must match date');
  }
  if (typeof d.momentCount !== 'number' || d.momentCount < 1) errs.push('momentCount must be >= 1');
  // 사건 id가 없으면 같은 날의 다른 사건과 뒤섞인다
  if (!d.memoryEventId || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z:.+$/.test(d.memoryEventId)) {
    errs.push('memoryEventId must be <ISO>:<slug>');
  }
  if (!Array.isArray(d.sourceCaptureIds)) errs.push('sourceCaptureIds must be an array');
  if (d.foldedBy !== undefined && d.foldedBy !== 'human' && d.foldedBy !== 'nightly-auto') {
    errs.push('foldedBy must be human|nightly-auto');
  }
  if (d.foldedAt !== undefined && (!Number.isFinite(d.foldedAt) || (d.foldedAt as number) <= 0)) {
    errs.push('foldedAt must be a positive timestamp');
  }
  if (d.foldedBy === 'nightly-auto' && !d.foldRunId) errs.push('nightly-auto requires foldRunId');
  return errs;
}
