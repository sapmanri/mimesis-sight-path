// 별이 라디오 스테이션 — 편성표 (Vase 승인 08-12: "24시간 방송이 나오는 구조.
// 별이는 그 스테이션 안에서 혼자 계속 놀아.")
//
// 편성표 = 방송 시간축 위의 토막 목록. 서버는 시간축의 연속성만 지킨다 —
// 무엇을 말할지는 별이가(next.ts), 언제 붙는지는 여기가 정한다.
// 오디오 실물은 R2(공개 버킷)에 있고 여기엔 주소만 있다.

export const PROGRAM_KEY = 'radio:program';
export const PROGRAM_KEEP = 300;                    // 토막 수 상한
export const PROGRAM_WINDOW_MS = 48 * 3_600_000;    // 이틀치만 남긴다 — 당기기 한계

export type SegmentKind = 'talk' | 'story' | 'song' | 'ambient';

export interface ProgramSegment {
  id: string;
  kind: SegmentKind;
  startAt: number;      // ms — 방송 시간축 위의 자리
  dur: number;          // 초
  url: string;          // R2 공개 주소
  title: string;        // 타임라인 표기용 (별이 첫 줄에서 딴다)
  voiceNote?: string | null;
  storyId?: string | null;
}

/**
 * 새 토막의 자리 — 마지막 토막 끝과 지금 중 늦은 쪽.
 * 버퍼가 쌓여 있으면 이어 붙고(미래로), 방송이 비어 있었으면 지금부터 시작한다
 * (빈 구간은 클라이언트가 환경음으로 채운다 — 죽은 공기도 방의 시간이다).
 */
export function placeSegment(lastEnd: number | null, now: number): number {
  return Math.max(lastEnd ?? 0, now);
}

export function lastEndOf(segments: ProgramSegment[]): number | null {
  if (!segments.length) return null;
  return Math.max(...segments.map((s) => s.startAt + s.dur * 1000));
}

/** 오래된 토막 정리 — 수 상한 + 시간 창. 자르는 건 앞(과거)이다. */
export function pruneProgram(segments: ProgramSegment[], now: number): ProgramSegment[] {
  const cutoff = now - PROGRAM_WINDOW_MS;
  return segments
    .filter((s) => s.startAt + s.dur * 1000 >= cutoff)
    .sort((a, b) => a.startAt - b.startAt)
    .slice(-PROGRAM_KEEP);
}
