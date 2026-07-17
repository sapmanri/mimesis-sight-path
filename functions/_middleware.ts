import { transformWalkHtml } from './byeoli-walk/_middleware';

/**
 * BUILD 421-B — 공개 도메인 host-rewrite (B방식, internal rewrite).
 * byeoli.sapmanri.com 의 루트(/)에서 걷기 앱을 제공한다. redirect가 아니므로 주소는 유지된다.
 * 오직 이 호스트의 정확히 '/'만 대상 — /api/*, /byeoli-walk/*, 정적 자산, manifest,
 * service worker 등 다른 모든 경로·호스트는 기존 파이프라인을 그대로 탄다.
 * pages.dev 의 루트(3D 앱)와 /byeoli-walk/ 는 변화 없음.
 */
const PUBLIC_WALK_HOST = 'byeoli.sapmanri.com';

/** 걷기 앱 셸 변환 — live-parity 제거 + ?mode=live 처리 (기존 루트 미들웨어 로직 그대로) */
function transformWalkShell(html: string, url: URL): string {
  html = html.replace('<script src="/byeoli-walk/live-parity.js" defer></script>\n', '');

  if (url.searchParams.get('mode') === 'live') {
    // Live keeps the exact single-player runtime and renderer.
    // Authority data is read only by the background sync script below.
    html = html.replace(
      'let stateProvider = LIVE_MODE ? RemoteStateProvider : LocalStateProvider;',
      'let stateProvider = LocalStateProvider;',
    );

    const tag = '<script src="/byeoli-walk/live-sync.js" defer></script>';
    if (!html.includes(tag)) {
      html = html.replace('</body>', `${tag}\n</body>`);
    }
  }

  return html;
}

function htmlResponse(html: string, base: Response): Response {
  const headers = new Headers(base.headers);
  headers.delete('content-length');
  headers.set('cache-control', 'no-store');
  return new Response(html, {
    status: base.status,
    statusText: base.statusText,
    headers,
  });
}

interface Env {
  ASSETS: Fetcher;
}

export const onRequest: PagesFunction<Env> = async (context) => {
  const url = new URL(context.request.url);
  const host = (context.request.headers.get('host') ?? url.hostname).toLowerCase();

  if (host === PUBLIC_WALK_HOST && url.pathname === '/') {
    // 정적 자산에서 걷기 앱 HTML을 직접 가져와 기존 두 변환(CATALOG 주입 → 셸)을
    // 같은 순서로 적용한다. 파일 이동 없음 — /byeoli-walk/ 원본이 유일한 소스.
    const asset = await context.env.ASSETS.fetch(new URL('/byeoli-walk/', url));
    if (!asset.ok) return asset;
    let html = await asset.text();
    try {
      html = transformWalkHtml(html);
    } catch (err) {
      return new Response(err instanceof Error ? err.message : String(err), { status: 500 });
    }
    html = transformWalkShell(html, url);
    return htmlResponse(html, asset);
  }

  const response = await context.next();
  const contentType = response.headers.get('content-type') || '';

  if (url.pathname !== '/byeoli-walk/' || !contentType.includes('text/html')) {
    return response;
  }

  let html = await response.text();
  html = transformWalkShell(html, url);
  return htmlResponse(html, response);
};
