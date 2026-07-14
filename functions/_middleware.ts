export const onRequest: PagesFunction = async (context) => {
  const response = await context.next();
  const url = new URL(context.request.url);
  const contentType = response.headers.get('content-type') || '';

  if (url.pathname !== '/byeoli-walk/' || !contentType.includes('text/html')) {
    return response;
  }

  let html = await response.text();
  html = html.replace('<script src="/byeoli-walk/live-parity.js" defer></script>\n', '');

  if (url.searchParams.get('mode') === 'live') {
    const tag = '<script src="/byeoli-walk/live-sync.js" defer></script>';
    if (!html.includes(tag)) {
      html = html.replace('</body>', `${tag}\n</body>`);
    }
  }

  const headers = new Headers(response.headers);
  headers.delete('content-length');
  headers.set('cache-control', 'no-store');

  return new Response(html, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
};
