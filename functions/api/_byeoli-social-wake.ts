import type { SocialTrigger } from './_byeoli-social-agent-logic.ts';

export interface SocialWakeEnv {
  PULSE_KEY?: string;
  BYEOLI_SOCIAL_DIRECTOR?: Fetcher;
}

/** 사건 생산자는 Threads를 직접 만지지 않는다. 단일 상태형 감독에게 깨우기만 맡긴다. */
export async function wakeSocialDirector(env: SocialWakeEnv, trigger: SocialTrigger): Promise<void> {
  if (!env.PULSE_KEY) throw new Error('PULSE_KEY_not_configured');
  if (!env.BYEOLI_SOCIAL_DIRECTOR) throw new Error('BYEOLI_SOCIAL_DIRECTOR_binding_missing');
  const response = await env.BYEOLI_SOCIAL_DIRECTOR.fetch('https://social-director.internal/wake', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'X-Pulse-Key': env.PULSE_KEY },
    body: JSON.stringify({ trigger }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok && response.status !== 202 && response.status !== 207) {
    throw new Error(`social_director_http_${response.status}`);
  }
}

/** Pages의 waitUntil이 있는 운영에서는 응답과 분리하고, 순수 단위시험에서는 조용히 완료시킨다. */
export function deferSocialWake(
  context: { waitUntil?: (promise: Promise<unknown>) => void },
  env: SocialWakeEnv,
  trigger: SocialTrigger,
  label: string,
): void {
  // Pages 운영에는 waitUntil이 항상 있다. 순수 단위시험은 감독 바인딩이 없으므로
  // 가짜 실패를 만들지 않는다. 운영에서 바인딩이 빠졌다면 아래 task가 명시적으로 기록한다.
  if (typeof context.waitUntil !== 'function') return;
  const task = wakeSocialDirector(env, trigger)
    .catch((error) => console.error(`social-director ${label}`, error));
  context.waitUntil(task);
}
