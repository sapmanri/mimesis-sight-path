// BUILD 431-PUB — 그림 발행의 순수 계약 (테스트 가능하도록 autopost와 분리)
// sketch-publish.ts가 사용한다. 하루 1장 상한의 판정이 여기 산다.

export interface SketchPubRecord {
  date: string;
  at: number;
  ok: boolean;
  sourceKey: string;
  publicKey: string;
  memoryEventId: string;
  withText: boolean;
  requestedBy: string;
  errorCode: string | null;
}

/** 조건 ③ — 같은 날짜의 성공 발행이 이미 있는가. 실패 기록은 상한을 소모하지 않는다. */
export function alreadyPublished(log: { date: string; ok: boolean }[], date: string): boolean {
  return log.some((r) => r.date === date && r.ok);
}
