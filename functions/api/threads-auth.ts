// BUILD 417: Threads OAuth 헬퍼 — 토큰 발급을 클릭 한 번으로.
//
// 사용법:
//   1) GET /api/threads-auth?key=<PUBLISH_KEY>
//      → threads.net 인증 화면으로 리다이렉트. @mimesis_op로 승인.
//   2) Meta가 이 엔드포인트로 다시 리다이렉트 (?code=...&state=...)
//      → 서버가 코드→단기토큰→60일 장기토큰 교환 후 KV에 저장.
//      → 완료 화면에 만료일 표시. 이후 발급 절차 없음 — autopost가 자동 갱신.
//
// 필요한 env (Cloudflare Pages, 암호화):
//   THREADS_APP_ID / THREADS_APP_SECRET — Meta 앱 대시보드 > 설정 > 기본
//   PUBLISH_KEY — 기존 것 재사용 (state 검증)
//
// KV: PLANET['threads_auth'] = { token, userId, refreshedAt }
// 보안 메모: state에 PUBLISH_KEY를 그대로 쓴다 — 브라우저 히스토리에 남는
// 트레이드오프가 있지만 개인 프로젝트 규모에선 수용. 유출 시 키 교체로 대응.

interface Env {
  PLANET: KVNamespace;
  PUBLISH_KEY?: string;
  THREADS_APP_ID?: string;
  THREADS_APP_SECRET?: string;
}

export const THREADS_AUTH_KEY = 'threads_auth';

const page = (title: string, body: string, ok: boolean) =>
  new Response(
    `<!doctype html><meta charset="utf-8"><title>${title}</title>
     <body style="font-family:system-ui;max-width:560px;margin:80px auto;line-height:1.7">
     <h2 style="color:${ok ? '#355743' : '#a33'}">${title}</h2>${body}</body>`,
    { status: ok ? 200 : 400, headers: { 'Content-Type': 'text/html; charset=utf-8' } },
  );

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  if (!env.THREADS_APP_ID || !env.THREADS_APP_SECRET || !env.PUBLISH_KEY) {
    return page('설정 필요', '<p>THREADS_APP_ID / THREADS_APP_SECRET / PUBLISH_KEY 환경변수가 필요합니다.</p>', false);
  }
  const url = new URL(request.url);
  const redirectUri = `${url.origin}/api/threads-auth`;
  const code = url.searchParams.get('code');

  // ---- 1단계: 인증 시작 ----
  if (!code) {
    if (url.searchParams.get('key') !== env.PUBLISH_KEY) {
      return page('unauthorized', '<p>?key=PUBLISH_KEY 가 필요합니다.</p>', false);
    }
    const auth = new URL('https://threads.net/oauth/authorize');
    auth.searchParams.set('client_id', env.THREADS_APP_ID);
    auth.searchParams.set('redirect_uri', redirectUri);
    auth.searchParams.set('scope', 'threads_basic,threads_content_publish');
    auth.searchParams.set('response_type', 'code');
    auth.searchParams.set('state', env.PUBLISH_KEY);
    return Response.redirect(auth.toString(), 302);
  }

  // ---- 2단계: 콜백 — 코드 교환 ----
  if (url.searchParams.get('state') !== env.PUBLISH_KEY) {
    return page('state 불일치', '<p>인증 시작 지점이 이 서버가 아닙니다. 처음부터 다시 시도하세요.</p>', false);
  }

  // 코드 → 단기 토큰 (+userId)
  const shortForm = new FormData();
  shortForm.set('client_id', env.THREADS_APP_ID);
  shortForm.set('client_secret', env.THREADS_APP_SECRET);
  shortForm.set('grant_type', 'authorization_code');
  shortForm.set('redirect_uri', redirectUri);
  shortForm.set('code', code.replace(/#_$/, '')); // Meta가 붙이는 #_ 제거
  const shortRes = await fetch('https://graph.threads.net/oauth/access_token', { method: 'POST', body: shortForm });
  const shortJson = (await shortRes.json()) as { access_token?: string; user_id?: string | number; error_message?: string };
  if (!shortRes.ok || !shortJson.access_token) {
    return page('단기 토큰 교환 실패', `<pre>${JSON.stringify(shortJson).slice(0, 400)}</pre>`, false);
  }

  // 단기 → 60일 장기 토큰
  const longUrl = new URL('https://graph.threads.net/access_token');
  longUrl.searchParams.set('grant_type', 'th_exchange_token');
  longUrl.searchParams.set('client_secret', env.THREADS_APP_SECRET);
  longUrl.searchParams.set('access_token', shortJson.access_token);
  const longRes = await fetch(longUrl.toString());
  const longJson = (await longRes.json()) as { access_token?: string; expires_in?: number; error_message?: string };
  if (!longRes.ok || !longJson.access_token) {
    return page('장기 토큰 교환 실패', `<pre>${JSON.stringify(longJson).slice(0, 400)}</pre>`, false);
  }

  const record = {
    token: longJson.access_token,
    userId: String(shortJson.user_id ?? ''),
    refreshedAt: Date.now(),
  };
  await env.PLANET.put(THREADS_AUTH_KEY, JSON.stringify(record));

  const days = Math.round((longJson.expires_in ?? 5184000) / 86400);
  return page(
    '별리 Threads 연결 완료',
    `<p>@mimesis_op 발행 준비가 끝났습니다.</p>
     <p>토큰 만료: 약 <b>${days}일</b> 후 — 크론이 돌 때마다 자동 갱신되므로 다시 발급할 일은 없습니다.</p>
     <p>테스트: <code>POST /api/autopost?draft=1</code> (X-Publish-Key 헤더) → 컨테이너 생성까지만 확인.</p>`,
    true,
  );
};
