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
  // 방송·관찰·사연은 별이에게 Threads 임무를 배정하지 않는다.
  // 실제 사건은 답글 수집과 선반 갱신 기회만 연다.
  // isAgencyWake가 false인 사건이므로 post/comment/silence 편집 판단은 열리지 않는다.
  if (!context.waitUntil || !env.PULSE_KEY || !env.BYEOLI_SOCIAL_DIRECTOR) return;
  const task = wakeSocialDirector(env, trigger).catch((error) => {
    console.error(JSON.stringify({
      message: 'social director event wake failed', label, kind: trigger.kind,
      error: error instanceof Error ? error.message : String(error),
    }));
  });
  context.waitUntil(task);
}
