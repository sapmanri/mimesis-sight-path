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

/** 하루 한 건. 세 갈래가 여기서 갈라진다. */
export interface DayMemory {
  version: string;
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

/** KST 날짜 문자열 */
export function kstDate(ms: number): string {
  return new Date(ms + 9 * 3600 * 1000).toISOString().slice(0, 10);
}

/**
 * capture_meta → ArchiveEntry. walk의 logObservation 산출물과 같은 모양으로 맞춰
 * selectMoment/buildMemoryEvent를 그대로 재사용한다.
 *
 * ⚠ duration이 없다. 엽서 메타는 머문 시간을 안 남긴다. 그래서 그 순간의
 * 관찰 줄 수(diaryLines.length)를 **머무름의 대리 지표**로 쓴다 — 더 오래 머문
 * 순간일수록 관찰이 더 쌓였다는 가정이고, 정확한 값이 아니라 대리값임을 명시한다.
 */
export function capturesToEntries(captures: CaptureLike[], date: string): ArchiveEntry[] {
  const out: ArchiveEntry[] = [];
  for (const c of captures) {
    if (!c || typeof c.capturedAt !== 'number') continue;
    if (kstDate(c.capturedAt) !== date) continue;
    const lines = (c.diaryLines ?? []).filter((l) => typeof l === 'string' && l.trim());
    if (!lines.length) continue;
    const proxyDuration = lines.length;          // 대리 지표 (초가 아니다)
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
  return {
    version: MEMORY_VERSION,
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
  return errs;
}
