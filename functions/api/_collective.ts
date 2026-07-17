// BUILD 422-OPS-E — Collective Observatory 순수 로직
// 정본: docs/BUILD_422_OPS_OBSERVER_CONSOLE.md §6-4·§6-5·§11
//
// 원칙 (홈즈 QC 5):
//   OBSERVERS blob은 계속 불투명 — 이 모듈은 blob을 절대 열지 않는다.
//   집계는 백업 요청에 blob과 "별도로" 실린 collectiveSnapshot만 소비한다.
//   sourceRevision이 이전보다 클 때만 반영, 차이(delta)만 더한다 → 재전송 멱등.
//   acts 의미(§6-5)는 미검증 — observe/rest/record/wonder 내부 명칭 그대로 저장·표시.
//   k-익명: 참여자 5명 미만 → 전체 숨김 · 대상별 기여자 5명 미만 → 항목 숨김.

export const K_ANON = 5;
const MAX_TARGET_TYPES = 400;
const MAX_COUNT = 10_000_000;
const MAX_KEY_LEN = 40;

export const ACTS = ['observe', 'rest', 'record', 'wonder'] as const;
export type ActName = (typeof ACTS)[number];
export type TargetActs = Record<ActName, number>;

export interface CollectiveSnapshot {
  schemaVersion: number;
  sourceRevision: number;
  totals: { diary: number; memories: number; observedMs: number; pass: number };
  targets: Record<string, TargetActs>;
}

/** 한 관찰자(익명 소스)가 마지막으로 반영한 snapshot — delta 계산 기준 */
export interface SourceRecord {
  rev: number;
  totals: CollectiveSnapshot['totals'];
  targets: Record<string, TargetActs>;
}

export interface CollectiveAgg {
  schemaVersion: 1;
  participants: number;
  totals: { diary: number; memories: number; observedMs: number; pass: number };
  targets: Record<string, TargetActs & { contributors: number }>;
  updatedAt: number;
}

export function emptyAgg(): CollectiveAgg {
  return {
    schemaVersion: 1, participants: 0,
    totals: { diary: 0, memories: 0, observedMs: 0, pass: 0 },
    targets: {}, updatedAt: 0,
  };
}

const num = (v: unknown, max = MAX_COUNT) =>
  typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.min(Math.floor(v), max) : 0;

/** 클라이언트 snapshot을 화이트리스트·상한으로만 수용. 형식이 어긋나면 null(무시). */
export function validateSnapshot(raw: unknown): CollectiveSnapshot | null {
  if (raw === null || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (r.schemaVersion !== 1) return null;
  if (typeof r.sourceRevision !== 'number' || !Number.isInteger(r.sourceRevision) || r.sourceRevision < 0) return null;
  const t = (r.totals ?? {}) as Record<string, unknown>;
  const totals = {
    diary: num(t.diary), memories: num(t.memories),
    observedMs: num(t.observedMs, 10_000_000_000), pass: num(t.pass),
  };
  const targets: Record<string, TargetActs> = {};
  const rawTargets = (r.targets ?? {}) as Record<string, unknown>;
  const keys = Object.keys(rawTargets).slice(0, MAX_TARGET_TYPES);
  for (const key of keys) {
    if (!/^[a-z0-9-]{1,40}$/.test(key) || key.length > MAX_KEY_LEN) continue;
    const acts = (rawTargets[key] ?? {}) as Record<string, unknown>;
    targets[key] = { observe: num(acts.observe), rest: num(acts.rest), record: num(acts.record), wonder: num(acts.wonder) };
  }
  return { schemaVersion: 1, sourceRevision: r.sourceRevision, totals, targets };
}

const actsTotal = (a: TargetActs | undefined) =>
  a ? ACTS.reduce((s, k) => s + (a[k] ?? 0), 0) : 0;

/**
 * snapshot을 집계에 반영한다. 반환된 agg/src를 저장하는 건 호출자 몫.
 * sourceRevision이 이전 이하이면 아무것도 바꾸지 않는다(멱등).
 * 값이 줄어든 필드의 delta는 0으로 클램프(리셋·복구 시 집계 오염 방지).
 */
export function applySnapshot(
  agg: CollectiveAgg, prev: SourceRecord | null, snap: CollectiveSnapshot, now: number,
): { agg: CollectiveAgg; src: SourceRecord; applied: boolean } {
  if (prev && snap.sourceRevision <= prev.rev) {
    return { agg, src: prev, applied: false };
  }
  const next: CollectiveAgg = JSON.parse(JSON.stringify(agg));
  if (!prev) next.participants += 1;

  const pt = prev?.totals;
  next.totals.diary += Math.max(0, snap.totals.diary - (pt?.diary ?? 0));
  next.totals.memories += Math.max(0, snap.totals.memories - (pt?.memories ?? 0));
  next.totals.observedMs += Math.max(0, snap.totals.observedMs - (pt?.observedMs ?? 0));
  next.totals.pass += Math.max(0, snap.totals.pass - (pt?.pass ?? 0));

  for (const [key, acts] of Object.entries(snap.targets)) {
    const prevActs = prev?.targets[key];
    const cur = next.targets[key] ?? { observe: 0, rest: 0, record: 0, wonder: 0, contributors: 0 };
    for (const act of ACTS) cur[act] += Math.max(0, (acts[act] ?? 0) - (prevActs?.[act] ?? 0));
    if (actsTotal(prevActs) === 0 && actsTotal(acts) > 0) cur.contributors += 1;
    next.targets[key] = cur;
  }
  next.updatedAt = now;
  return {
    agg: next,
    src: { rev: snap.sourceRevision, totals: snap.totals, targets: snap.targets },
    applied: true,
  };
}

/** 운영 화면용 k-익명 필터 — 원본 agg는 그대로 두고 보기만 거른다 */
export function kAnonView(agg: CollectiveAgg): {
  hidden: boolean; participants: number;
  totals?: CollectiveAgg['totals'];
  targets?: Record<string, TargetActs & { contributors: number; total: number }>;
} {
  if (agg.participants < K_ANON) {
    return { hidden: true, participants: agg.participants };
  }
  const targets: Record<string, TargetActs & { contributors: number; total: number }> = {};
  for (const [key, t] of Object.entries(agg.targets)) {
    if (t.contributors < K_ANON) continue; // 항목별 k-익명 (§6-4)
    targets[key] = { ...t, total: actsTotal(t) };
  }
  return { hidden: false, participants: agg.participants, totals: agg.totals, targets };
}

export const collectiveConfig = {
  AGG_KEY: 'collective_agg',
  SRC_PREFIX: 'collective_src:',
  PEPPER_KEY: 'collective_pepper',
};
