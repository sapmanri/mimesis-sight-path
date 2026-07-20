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
  return errs;
}
