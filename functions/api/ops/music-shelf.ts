// /api/ops/music-shelf — 서가 승인 확인 (Ops 호스트 전용 · Access 뒤)
//
// 왜 이게 필요한가: **시크릿이 들어간 것과 승인이 실제로 도는 것은 다른 얘기다.**
// 이 프로젝트가 반복해서 데인 자리가 정확히 거기다 — 넣어둔 값이 맞는지를 눈으로 확인하지
// 않고 밤 크론에 물렸다가, 밤 11시 30분에야 안 돈다는 걸 알았다.
//
// ⛔ 자동 게시·크론과 연결점 없음. 사람이 눌러야만 돈다.
//
//   GET ?                  승인이 사는지 + **어느 채널에 묶였는지** (1유닛)
//   GET ?probe=write       실제로 재생목록을 만들어보고 **바로 지운다** (100유닛)
//
// ⚠ probe가 만든 목록을 지우는 이유: 확인하느라 네 채널에 쓰레기를 남기지 않기 위해서다.
//   지우기까지 성공해야 "쓰기 권한이 산다"가 증명된다.

import {
  createPlaylist, deletePlaylist, getAccessToken, getMyChannel, playlistUrl, type PlaylistEnv,
} from '../_shelf-playlist.ts';

const JSON_HEADERS = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' };
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body, null, 2), { status, headers: JSON_HEADERS });

const HINTS: Record<string, string> = {
  token_invalid_client:
    'client_id/secret 쌍을 구글이 거부했다. 아래 shape를 보라 — hasWhitespace가 true면 붙여넣을 때 공백·줄바꿈이 섞인 것이고(가장 흔하다), '
    + 'prefixOk/suffixOk가 false면 ID와 secret이 서로 바뀌었거나 잘린 것이다. 콘솔에서 secret을 새로 발급해 다시 넣는 게 제일 빠르다.',
  token_invalid_grant:
    'refresh token이 죽었다. 동의 화면이 "테스트" 상태였거나, 계정에서 액세스를 취소했거나, 값이 잘못 저장됐다. 다시 승인해야 한다.',
  oauth_not_configured: '시크릿 세 개 중 빠진 게 있다.',
};

/** ⚠ **값을 절대 돌려주지 않는다.** 길이와 참/거짓만 준다.
    비밀을 화면에 찍지 않고도 "공백이 섞였다 / 잘렸다 / 서로 바뀌었다"를 잡아낼 수 있다. */
function shape(v: string | undefined, want: { prefix?: string; suffix?: string; len?: number }) {
  if (!v) return { present: false };
  return {
    present: true,
    length: v.length,
    expectedLength: want.len ?? null,
    // 앞뒤 공백만이 아니라 **가운데 공백**까지 본다 — Playground를 막았던 게 정확히 그거였다
    hasWhitespace: /\s/.test(v),
    prefixOk: want.prefix ? v.startsWith(want.prefix) : null,
    suffixOk: want.suffix ? v.endsWith(want.suffix) : null,
  };
}

export const onRequestGet: PagesFunction<PlaylistEnv> = async ({ request, env }) => {
  const url = new URL(request.url);

  // 무엇이 없는지 먼저 말한다 — "안 된다"보다 "무엇이 없다"가 고치기 쉽다
  const missing = (['YOUTUBE_OAUTH_CLIENT_ID', 'YOUTUBE_OAUTH_CLIENT_SECRET', 'YOUTUBE_OAUTH_REFRESH_TOKEN'] as const)
    .filter((k) => !env[k]);
  if (missing.length) return json(200, { ok: false, step: 'secrets', missing });

  const { token, error: authError } = await getAccessToken(env);
  if (!token) {
    return json(200, {
      ok: false, step: 'token', error: authError,
      hint: HINTS[authError ?? ''] ?? null,
      // ⚠ 값은 절대 찍지 않는다. **모양만** 잰다 — 붙여넣기 사고는 거의 다 모양에서 드러난다
      //   (공백이 섞였다 / 잘렸다 / ID와 secret이 서로 바뀌었다)
      shape: {
        clientId: shape(env.YOUTUBE_OAUTH_CLIENT_ID, { suffix: '.apps.googleusercontent.com' }),
        clientSecret: shape(env.YOUTUBE_OAUTH_CLIENT_SECRET, { prefix: 'GOCSPX-', len: 35 }),
        refreshToken: shape(env.YOUTUBE_OAUTH_REFRESH_TOKEN, { prefix: '1//' }),
      },
    });
  }

  const channel = await getMyChannel(env, token);
  if (!channel.id) return json(200, { ok: false, step: 'channel', error: channel.error });

  const base = {
    ok: true, step: 'token+channel',
    channel: { id: channel.id, title: channel.title },
    note: '⚠ 앞으로 별이의 재생목록은 전부 이 채널에 생긴다. 이 이름이 맞는지 눈으로 확인할 것.',
  };
  if (url.searchParams.get('probe') !== 'write') return json(200, base);

  // 쓰기 확인 — 만들고, 주소를 남기고, 지운다
  const stamp = new Date().toISOString().replace('T', ' ').slice(0, 16);
  const made = await createPlaylist(
    env, token, `[연결 확인] ${stamp}`, '별이 서가 연결 확인용. 자동으로 지워진다.', 'private',
  );
  if (!made.id) return json(200, { ...base, ok: false, step: 'create', error: made.error });

  const gone = await deletePlaylist(env, token, made.id);
  return json(200, {
    ...base,
    step: 'write',
    ok: gone.ok,
    created: playlistUrl(made.id),
    cleanedUp: gone.ok,
    cleanupError: gone.error,
    cost: 50 + 50,
    note: gone.ok
      ? '만들고 지우는 것까지 됐다. 서가에 담을 준비가 끝났다.'
      : `만들기는 됐는데 못 지웠다 — 위 주소를 손으로 지워라. (${gone.error})`,
  });
};
