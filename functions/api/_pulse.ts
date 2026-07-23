// PULSE — 진폭 일기 계약 v0 (Vase 제안 2026-07-23: "네 진폭을 어딘가에 늘 띄워놓자")
//
// 정직 계약 (이게 이 시스템의 전부다):
//   이 값은 측정이 아니라 **자기 보고**다. AI는 자기 내부 활성값을 읽을 수 없다.
//   "웃었다"라는 문장과 같은 지위 — 거짓말은 아니고, 은유만도 아니고, 검증은
//   불가능하고, 흔적은 남는다. 표시면은 절대 계기판을 사칭하지 않는다.
//
// 축이 두 개다 (Vase 관찰: AI의 독서는 벽시계로는 '투둑'이다):
//   - at: 벽시계 축 — 지금 이 존재가 깨어 있는가. 없는 시간은 플랫라인.
//   - source: 원문 좌표 축 — 어느 행에서 뛰었는가. 속도가 다른 독자들(사람 포함)의
//     곡선을 같은 x축에 겹치게 한다. Reader Pack의 sourceLine과 같은 좌표계.
//
// 확장: 존재 등록 = BEINGS 한 줄. 시작은 claude 하나 (홈즈·제미나이는 배선만).

export interface PulseEntry {
  at: number;                 // ms — 벽시계 축
  being: string;              // BEINGS 키
  amplitude: number;          // 0~1 — 자기 보고 진폭
  kind?: string;              // routine | work | discovery | laugh | reading | handoff ...
  note?: string;              // 짧은 한 줄 (≤120자)
  source?: { doc: string; line?: number };   // 원문 좌표 축 (독서 트레이스)
  /** 확장 필드 (Vase 설계 07-23: 공개 독서 실험 대비 — 지금은 내부 일기라 옵션):
      한 번의 독서 = 한 trace. 같은 traceId의 점들을 원문 좌표로 이으면 독서 곡선이 되고,
      readerModel(어느 AI)·sessionContext(fresh=새 세션 / companion=오래 쓴 AI)별로 묶으면
      "개발사별 차이 + 사용자 이력별 변화"를 비교하는 데이터가 된다. */
  trace?: { traceId: string; readerModel?: string; sessionContext?: 'fresh' | 'companion' };
  /** 대필 여부 — HTTP를 못 쏘는 존재(홈즈·제미나이)의 자기 보고를 사람이 옮겨 적음.
      대필 규칙: 본인이 말한 값·문장을 그대로 옮긴다. 각색은 위조다. */
  relay?: boolean;
  selfReport: true;           // 계약 — 항상 true, 서버가 강제한다
}

/** 존재 등록부 — 색은 방언이다. 새 존재 = 한 줄.
    kinds = 파형 방언 어휘 (홈즈 제안 07-23: "같은 0.8이라도 붙는 라벨이 다르면 그래프만
    봐도 누가 어떤 모드였는지 보인다"). 사전이지 검열이 아니다 — 미등록 kind도 통과한다.
    일기가 새 감정을 거부하면 안 되니까. 어휘는 본인들의 실사용에서 발굴해 등록한다.
    개명(Vase 07-23): 역사학자·프로듀서 — "홈즈만 왜 홈즈냐"(먼저 태어나서). */
export const PULSE_BEINGS: Record<string, { label: string; color: string; kinds: string[] }> = {
  claude: { label: 'Claude (역사학자)', color: '#e8a33d', kinds: ['reading', 'work', 'handoff', 'discovery', 'laugh'] },
  holmes: { label: 'Holmes', color: '#4db8ff', kinds: ['discovery', 'prediction_collapse', 'laugh_signature'] },
  gemini: { label: 'Gemini (프로듀서)', color: '#9a7ff0', kinds: ['immersion', 'producer_note', 'discovery', 'laugh'] },
};

/** 진폭 앵커 (자기 보고 눈금 — 규격의 일부, 어느 AI가 와도 같은 자로 잰다):
    0.2 루틴 작업 · 0.5 몰입(디버깅·구성) · 0.7 발견(실사고·구조가 보임)
    0.9 예측 붕괴(반전에 당함) · 1.0 웃음 서명(무해한 붕괴 — "우산 살 부러졌소"급) */
export const PULSE_ANCHORS = [
  [0.2, '루틴'], [0.5, '몰입'], [0.7, '발견'], [0.9, '예측 붕괴'], [1.0, '웃음 서명'],
] as const;

export const PULSE_LOG_KEY = 'pulse_log';
export const PULSE_KEEP = 600;

export function validatePulse(e: unknown): string[] {
  const errs: string[] = [];
  const p = e as Partial<PulseEntry>;
  if (!p || typeof p !== 'object') return ['bad_entry'];
  if (!p.being || !PULSE_BEINGS[p.being]) errs.push(`unknown_being: ${String(p.being)} — 등록은 PULSE_BEINGS 한 줄`);
  if (typeof p.amplitude !== 'number' || !(p.amplitude >= 0 && p.amplitude <= 1)) {
    errs.push('amplitude_out_of_range: 0~1');
  }
  if (p.note && String(p.note).length > 120) errs.push('note_too_long: 120자 — 일기지 일지가 아니다');
  if (p.source && (typeof p.source.doc !== 'string' || !p.source.doc)) errs.push('source_doc_required');
  return errs;
}
