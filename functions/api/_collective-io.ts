// BUILD 422-OPS-E — Collective KV 입출력
// 이 파일은 관찰자 개인 데이터(OBSERVERS)를 절대 읽지 않는다.
// 소스 키는 pepper+observerId 해시 — 운영 화면·API 어디에도 역참조 경로가 없다.

import {
  validateSnapshot, applySnapshot, emptyAgg, collectiveConfig,
  type CollectiveAgg, type SourceRecord,
} from './_collective';

async function sourceKey(kv: KVNamespace, observerId: string): Promise<string> {
  let pepper = await kv.get(collectiveConfig.PEPPER_KEY);
  if (!pepper) {
    pepper = crypto.randomUUID() + crypto.randomUUID(); // 서버 내부 전용 — 응답·로그에 안 나간다
    await kv.put(collectiveConfig.PEPPER_KEY, pepper);
  }
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${pepper}:${observerId}`));
  const hex = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
  return collectiveConfig.SRC_PREFIX + hex;
}

/** 백업 요청에 별도로 실린 snapshot을 집계에 반영. 어떤 실패도 백업을 깨지 않는다(호출자가 try). */
export async function ingestCollectiveSnapshot(
  kv: KVNamespace, observerId: string, raw: unknown,
): Promise<void> {
  const snap = validateSnapshot(raw);
  if (!snap) return;
  const srcKey = await sourceKey(kv, observerId);
  const [aggRaw, srcRaw] = await Promise.all([kv.get(collectiveConfig.AGG_KEY), kv.get(srcKey)]);
  const agg: CollectiveAgg = aggRaw ? JSON.parse(aggRaw) : emptyAgg();
  const prev: SourceRecord | null = srcRaw ? JSON.parse(srcRaw) : null;
  const res = applySnapshot(agg, prev, snap, Date.now());
  if (!res.applied) return;
  await kv.put(srcKey, JSON.stringify(res.src));
  await kv.put(collectiveConfig.AGG_KEY, JSON.stringify(res.agg));
}

export async function readCollectiveAgg(kv: KVNamespace): Promise<CollectiveAgg> {
  const raw = await kv.get(collectiveConfig.AGG_KEY);
  return raw ? (JSON.parse(raw) as CollectiveAgg) : emptyAgg();
}
