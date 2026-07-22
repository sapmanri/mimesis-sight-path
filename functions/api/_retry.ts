// 일시 오류 재시도 — 실사고(2026-07-22 밤): Comic Lab 생성이 R2 list의 일시 내부 오류
// "list: We encountered an internal error. Please try again. (10001)" 한 번으로 통째로 죽었다.
// R2/KV의 이런 내부 오류는 짧게 기다렸다 다시 부르면 대개 지나간다 — 431의 AiError 4002 판정
// ("자동 생성이 열리는 날 재시도 로직 필수")과 같은 계열.
//
// ⚠ 멱등 연산에만 감쌀 것 (읽기 · 같은 키 덮어쓰기 · 값 재계산이 안전한 put).
//   카운터 증가처럼 두 번 실행되면 값이 달라지는 연산은 호출자가 판단한다.

export interface RetryOpts {
  attempts?: number;                       // 총 시도 횟수 (기본 3)
  baseDelayMs?: number;                    // backoff 기저 (기본 400ms → 400·800)
  sleep?: (ms: number) => Promise<void>;   // 테스트 주입용
}

export async function withTransientRetry<T>(
  label: string, fn: () => Promise<T>, opts: RetryOpts = {},
): Promise<T> {
  const attempts = Math.max(1, opts.attempts ?? 3);
  const base = opts.baseDelayMs ?? 400;
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try { return await fn(); }
    catch (e) {
      lastErr = e;
      if (i < attempts - 1) await sleep(base * (i + 1));
    }
  }
  // 원문을 삼키지 않는다 — 라벨(어느 연산인가)과 마지막 오류를 함께 싣는다
  throw new Error(`retry_exhausted(${label} x${attempts}): ${String(lastErr).slice(0, 160)}`);
}
