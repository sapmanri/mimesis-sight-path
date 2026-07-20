// BUILD 431-M2 — capture_meta 공통 저장 계약
// 승인: Vase 2026-07-20 — "저장만 담당하고 선택·해석은 하지 않는다."
//
// 왜 뽑았나: 기록이 ops/capture.ts에 인라인이라 재사용이 불가능했다. autopost가
// 같은 자리에 쓰려면 계약이 하나여야 한다. 두 벌이면 언젠가 어긋난다.
//
// ⛔ 이 모듈의 책임 경계 (승인 범위):
//   - 저장만 한다. 무엇을 관찰할지 **고르지 않는다**.
//   - Authority를 조회하지 않는다.
//   - 하루 기억(memory:<date>)을 조립하지 않는다 — 그건 memory builder의 일.
//
// autopost가 남기는 것은 "새 관찰"이 아니라 **이미 발행에 사용한 문맥의 영수증**이다.
// 정직한 이름: 별이가 스스로 관찰하기 시작한 게 아니라,
// 별이의 자율 행동이 처음으로 자동 기억 흔적을 남기기 시작했다.

export const CAPTURE_META_KEY = 'capture_meta';
export const CAPTURE_META_KEEP = 120;

/** 어디서 온 기록인가 — 출처가 섞이면 나중에 무엇이 자동이고 무엇이 수동인지 못 가린다. */
export type ObservationSource = 'ops-capture' | 'autopost';

export interface MemoryObservation {
  captureId: string;
  zonePct?: number | null;
  /** 멱등 키 — 같은 id는 다시 append하지 않는다 (크론 재시도·네트워크 재실행 대비) */
  observationId: string;
  source: ObservationSource;
  /** 그 실행을 특정하는 값 (autopost run id 등). 수동 기록은 null */
  sourceRunId: string | null;
  observedAt: number;
  /**
   * 하위 호환: 기존 저장분과 읽는 쪽(ops 콘솔·_memory-event)이 capturedAt을 쓴다.
   * observedAt과 항상 같은 값을 쓴다 — 이름만 새로 두고 기존 독자를 깨지 않는다.
   */
  capturedAt: number;
  /** ops 콘솔 표기용 (기존 필드 유지) */
  zonePct: number | null;
  r2Key: string | null;
  photoKey: string | null;
  skyPhase: string | null;
  weather: string | null;
  byeoliAction: string | null;
  targetId: string | null;
  targetType: string | null;
  targetLabel: string | null;
  diaryLines: string[];
  /** 수동 업로드의 감사 정보 (Access 이메일). 자동 기록은 null */
  uploadedBy: string | null;
  uploadedAt: number;
}

export interface CaptureMetaEnv {
  PLANET: KVNamespace;
}

/**
 * 멱등 관찰 id. 같은 발행이 재시도돼도 기억이 두 번 쌓이지 않아야 한다 —
 * 원천 메타가 중복되면 밀집도 점수(그 순간 주변 관찰 수)가 왜곡되고,
 * 결국 '가장 오래 머문 순간'이 잘못 뽑힌다.
 */
export function observationIdOf(
  source: ObservationSource, sourceRunId: string | null, sourceCaptureId: string | null, at: number,
): string {
  return [source, sourceRunId ?? '-', sourceCaptureId ?? '-', String(at)].join('|');
}

const str = (v: unknown, max = 80) => (typeof v === 'string' && v.trim() ? v.slice(0, max) : null);

/** 화이트리스트 정규화 — 임의 필드·개인 데이터 유입 차단 (ops/capture의 sanitize와 같은 규칙). */
export function normalizeObservation(
  raw: Partial<MemoryObservation> & { observationId: string; source: ObservationSource },
): MemoryObservation {
  const at = typeof raw.observedAt === 'number' && Number.isFinite(raw.observedAt) ? raw.observedAt : Date.now();
  const lines = Array.isArray(raw.diaryLines)
    ? raw.diaryLines.filter((l): l is string => typeof l === 'string' && !!l.trim()).slice(0, 6).map((l) => l.slice(0, 120))
    : [];
  return {
    captureId: str(raw.captureId, 64) ?? `cap_${at}`,
    observationId: raw.observationId,
    source: raw.source,
    sourceRunId: str(raw.sourceRunId, 64),
    observedAt: at,
    capturedAt: at,
    zonePct: typeof raw.zonePct === 'number' && Number.isFinite(raw.zonePct) ? raw.zonePct : null,
    r2Key: str(raw.r2Key, 200),
    photoKey: str(raw.photoKey, 200) ?? str(raw.r2Key, 200),
    skyPhase: str(raw.skyPhase, 16),
    weather: str(raw.weather, 16),
    byeoliAction: str(raw.byeoliAction, 16),
    targetId: str(raw.targetId),
    targetType: str(raw.targetType, 40),
    targetLabel: str(raw.targetLabel, 40),
    diaryLines: lines,
    uploadedBy: str(raw.uploadedBy, 120),
    uploadedAt: typeof raw.uploadedAt === 'number' ? raw.uploadedAt : at,
  };
}

/** 이미 있는 관찰인가 — 멱등성의 실제 판정 지점. */
export function isDuplicate(list: MemoryObservation[], observationId: string): boolean {
  return list.some((m) => m?.observationId === observationId);
}

export interface AppendResult {
  ok: boolean;
  duplicate: boolean;
  observationId: string;
  reason?: string;
}

/**
 * 관찰 한 건을 append한다. 저장만 한다.
 * 실패해도 던지지 않는다 — 호출자(자율 시스템)의 성공을 뒤집으면 안 된다.
 */
export async function appendCaptureMeta(
  env: CaptureMetaEnv, observation: Parameters<typeof normalizeObservation>[0],
): Promise<AppendResult> {
  const record = normalizeObservation(observation);
  try {
    const raw = await env.PLANET.get(CAPTURE_META_KEY);
    const list: MemoryObservation[] = raw ? JSON.parse(raw) : [];
    if (isDuplicate(list, record.observationId)) {
      return { ok: true, duplicate: true, observationId: record.observationId };
    }
    await env.PLANET.put(
      CAPTURE_META_KEY,
      JSON.stringify([record, ...list].slice(0, CAPTURE_META_KEEP)),
    );
    return { ok: true, duplicate: false, observationId: record.observationId };
  } catch (e) {
    return { ok: false, duplicate: false, observationId: record.observationId, reason: String(e).slice(0, 120) };
  }
}
