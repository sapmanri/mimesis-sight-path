// 별이 라디오 스테이션 — 편성표 (Vase 승인 08-12: "24시간 방송이 나오는 구조.
// 별이는 그 스테이션 안에서 혼자 계속 놀아.")
//
// 편성표 = 방송 시간축 위의 토막 목록. 서버는 시간축의 연속성만 지킨다 —
// 무엇을 말할지는 별이가(next.ts), 언제 붙는지는 여기가 정한다.
// 오디오 실물은 R2(공개 버킷)에 있고 여기엔 주소만 있다.

export const PROGRAM_KEY = 'radio:program';
// 지난 방송 보관소 (Vase 08-12: "날짜별로 방송 내용 목록·다시 듣기") — 편성표는 이틀 창이지만
// 날짜별 보관은 영구다. 등록 때 이중 기록하고, 소리 실물은 R2가 영구 보관한다.
export const DAYS_KEY = 'radio:days';
export const DAY_KEY = (d: string) => `radio:day:${d}`;
export function kstDayOf(ms: number): string {
  return new Date(ms + 9 * 3_600_000).toISOString().slice(0, 10);
}
export const PROGRAM_KEEP = 300;                    // 토막 수 상한
export const PROGRAM_WINDOW_MS = 48 * 3_600_000;    // 이틀치만 남긴다 — 당기기 한계

export type SegmentKind = 'talk' | 'story' | 'song' | 'ambient';
export type RadioTimeLabel = '새벽' | '아침' | '낮' | '저녁' | '밤';
export const RADIO_TIME_LABELS: RadioTimeLabel[] = ['새벽', '아침', '낮', '저녁', '밤'];

export interface ProgramSegment {
  id: string;
  kind: SegmentKind;
  startAt: number;      // ms — 방송 시간축 위의 자리
  dur: number;          // 초
  url: string;          // R2 공개 주소
  title: string;        // 타임라인 표기용 (별이 첫 줄에서 딴다)
  voiceNote?: string | null;
  storyId?: string | null;
  /** 대본이 만들어진 KST 시간 결. 재방송 선택기가 현재 시간과 맞출 때 쓴다. */
  timeLabel?: RadioTimeLabel | null;
  /** DJ 슬롯 — 초대 DJ는 별이(byeoli). 훗날 다른 게놈이 꽂힌다 (Vase 08-12) */
  dj?: string;
  /** 글자 방송 — 못 듣는 청취자를 위한 대본 전문 (Vase 08-12: "투디워크처럼 글자로 주루륵") */
  script?: string;
  /** 뒤따르는 곡을 별이가 소개했는지, 말없이 바로 틀기로 했는지. talk/song 양쪽에 같은 값. */
  musicTransition?: 'intro' | 'direct' | null;
  /** 멘트와 곡을 재방송에서도 갈라놓지 않기 위한 편성 묶음 ID. */
  pairId?: string | null;
}

/** 새 편 예고 시간 — 청취자 화면이 편성표를 새로 읽는 최악 주기(전면 60초·잠금 심장박동 72초)보다
 * 길게. 등록 즉시 시작하면 발견 전에 지나간다 (08-12 밤 근본 사고: "계속 듣고 있는데 안 나와"). */
export const LIVE_LEAD_MS = 90_000;

/**
 * 새 토막의 자리 — 마지막 토막 끝과 (지금+예고) 중 늦은 쪽.
 * 버퍼가 쌓여 있으면 이어 붙고, 아니면 90초 예고 후 시작 — 모든 청취자가 처음부터 듣는다.
 */
export function placeSegment(lastEnd: number | null, now: number): number {
  return Math.max(lastEnd ?? 0, now + LIVE_LEAD_MS);
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
