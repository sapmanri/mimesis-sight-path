// BUILD 425-A — /api/ops/capture (Ops 호스트 전용 · Access 뒤)
// 정본: docs/BUILD_425_THREADS_CAPTURE_AND_REPLY.md §3-5·§3-6
//
// 콘솔 쓰기 예외 2호(1호=423 이벤트 예약): 엽서 업로드. 공개 클라이언트 업로드는 금지 —
// 위조 캡처 주입을 막기 위해 Access 뒤의 콘솔만 이 경로를 쓴다. 루트 미들웨어가
// 비-ops 호스트의 /api/ops/*를 404로 숨긴다. 감사: Access 이메일 기록.
//
// 저장: R2 captures/walk/<ts>.jpg + KV capture_meta(최신 120건, R2 키와 1:1).
// autopost가 이 메타가 있는 엽서를 우선 선택하고, publish_log의 imageKey로 역추적된다.

interface Env {
  PLANET: KVNamespace;
  CAPTURES: R2Bucket;
  CAPTURES_PUBLIC_BASE?: string;
}

import { appendCaptureMeta, observationIdOf } from '../_capture-meta.ts';

const META_KEY = 'capture_meta';
const META_KEEP = 120;
const MAX_BYTES = 4 * 1024 * 1024;
const JSON_HEADERS = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' };

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });

export interface CaptureMeta {
  captureId: string;
  r2Key: string;
  capturedAt: number;
  uploadedAt: number;
  uploadedBy: string;
  zonePct: number | null;
  skyPhase: string | null;
  weather: string | null;
  byeoliAction: string | null;
  targetId: string | null;
  targetType: string | null;
  /** 화면 표기와 같은 한글 라벨 (예: '라벤더') — 일지 서술 승격용 */
  targetLabel: string | null;
  diaryLines: string[];
}

/** 클라이언트 meta를 화이트리스트로만 수용 — 임의 필드·개인 데이터 유입 차단 */
function sanitizeMeta(raw: Record<string, unknown>): Omit<CaptureMeta, 'captureId' | 'r2Key' | 'uploadedAt' | 'uploadedBy'> {
  const str = (v: unknown, max = 80) => (typeof v === 'string' ? v.slice(0, max) : null);
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
  const lines = Array.isArray(raw.diaryLines)
    ? raw.diaryLines.filter((l): l is string => typeof l === 'string').slice(0, 6).map((l) => l.slice(0, 120))
    : [];
  return {
    capturedAt: num(raw.capturedAt) ?? Date.now(),
    zonePct: num(raw.zonePct),
    skyPhase: str(raw.skyPhase, 16),
    weather: str(raw.weather, 16),
    byeoliAction: str(raw.byeoliAction, 16),
    targetId: str(raw.targetId),
    targetType: str(raw.targetType, 40),
    targetLabel: str(raw.targetLabel, 40),
    diaryLines: lines,
  };
}

export const onRequestGet: PagesFunction<Env> = async ({ env }) => {
  const raw = await env.PLANET.get(META_KEY);
  const list: CaptureMeta[] = raw ? JSON.parse(raw) : [];
  const base = (env.CAPTURES_PUBLIC_BASE ?? '').replace(/\/$/, '');
  return json(200, {
    ok: true,
    captures: list.slice(0, 40).map((m) => ({ ...m, url: base ? `${base}/${m.r2Key}` : null })),
  });
};

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const uploadedBy = request.headers.get('cf-access-authenticated-user-email') ?? 'unknown';
  let body: { action?: string; captureId?: string; imageBase64?: string; meta?: Record<string, unknown> };
  try { body = (await request.json()) as typeof body; } catch { return json(400, { ok: false, error: 'bad_json' }); }

  // 삭제 — 잘못 찍은 엽서를 발행 풀에서 뺀다 (R2 원본 + 메타 동시 제거)
  if (body.action === 'delete') {
    const raw = await env.PLANET.get(META_KEY);
    const list: CaptureMeta[] = raw ? JSON.parse(raw) : [];
    const target = list.find((m) => m.captureId === body.captureId);
    if (!target) return json(404, { ok: false, error: 'not_found' });
    await env.CAPTURES.delete(target.r2Key);
    await env.PLANET.put(META_KEY, JSON.stringify(list.filter((m) => m.captureId !== body.captureId)));
    return json(200, { ok: true, deleted: target.captureId });
  }

  if (!body.imageBase64 || typeof body.imageBase64 !== 'string') return json(400, { ok: false, error: 'no_image' });

  let bytes: Uint8Array;
  try {
    const bin = atob(body.imageBase64);
    if (bin.length > MAX_BYTES) return json(413, { ok: false, error: 'too_large' });
    bytes = Uint8Array.from(bin, (ch) => ch.charCodeAt(0));
  } catch { return json(400, { ok: false, error: 'bad_base64' }); }
  // JPEG 시그니처 확인 — 임의 파일 업로드 방지
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return json(400, { ok: false, error: 'not_jpeg' });

  const ts = Date.now();
  const r2Key = `captures/walk/${ts}.jpg`;
  await env.CAPTURES.put(r2Key, bytes, { httpMetadata: { contentType: 'image/jpeg' } });

  // 431-M2: 저장은 공통 계약으로. ops와 autopost가 같은 자리에 같은 모양으로 쓴다.
  const clean = sanitizeMeta(body.meta ?? {});
  const captureId = `cap_${ts}`;
  const appended = await appendCaptureMeta(env, {
    captureId,
    observationId: observationIdOf('ops-capture', null, captureId, clean.capturedAt),
    source: 'ops-capture',
    sourceRunId: null,
    observedAt: clean.capturedAt,
    r2Key, photoKey: r2Key,
    zonePct: clean.zonePct,
    skyPhase: clean.skyPhase, weather: clean.weather,
    byeoliAction: clean.byeoliAction,
    targetId: clean.targetId, targetType: clean.targetType, targetLabel: clean.targetLabel,
    diaryLines: clean.diaryLines,
    uploadedBy, uploadedAt: ts,
  });
  if (!appended.ok) return json(500, { ok: false, error: 'meta_append_failed', detail: appended.reason });
  const record = { captureId, r2Key };

  const base = (env.CAPTURES_PUBLIC_BASE ?? '').replace(/\/$/, '');
  return json(200, { ok: true, captureId: record.captureId, r2Key, url: base ? `${base}/${r2Key}` : null });
};
