// 폐기된 고정 시간 자동발행 입구.
//
// 2026-08-13 이전에는 외부 Cron이 08/18/22 KST에 이 경로를 호출했다. 별이의 게시 판단을
// Social Director로 옮긴 뒤에도 이 URL을 남겨 두면 잊힌 외부 Cron이 다시 강제 발행할 수 있다.
// 그래서 이 라우트는 인증 여부와 관계없이 발행하지 않고 410만 반환한다. 실제 Meta API 공통
// 클라이언트는 _threads-client.ts로 분리되어 자율 판단기와 명시적 운영 도구가 사용한다.

import { appendPublishLog } from './_publish-log.ts';
import type { PublishLogEnv } from './_publish-log.ts';

interface Env extends PublishLogEnv { PUBLISH_KEY?: string }

const HEADERS = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store',
};

const retired = (status = 410) => new Response(JSON.stringify({
  ok: false,
  retired: true,
  error: 'fixed_schedule_retired',
  replacement: 'byeoli-social-director',
}), { status, headers: HEADERS });

export const onRequestGet: PagesFunction<Env> = async () => retired(200);

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  // 유효한 옛 호출만 하나의 폐기 영수증으로 남긴다. 틀린 키/IP/헤더는 저장하지 않는다.
  if (env.PUBLISH_KEY && request.headers.get('X-Publish-Key') === env.PUBLISH_KEY) {
    await appendPublishLog(env, {
      invokedAt: Date.now(),
      scheduledFor: null,
      result: 'legacy_schedule_retired',
      httpStatus: 410,
      textIndex: null,
      imageKey: null,
      threads: { attempted: false, ok: false, errorCode: null, requestId: null },
    }).catch(() => {});
  }
  return retired();
};
