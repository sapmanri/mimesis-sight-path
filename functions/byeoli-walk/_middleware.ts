export const onRequest: PagesFunction = async (context) => {
  const response = await context.next();
  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('text/html')) return response;

  let html = await response.text();

  // iOS audio unlock patch introduced a tiny silent WAV loop on every platform.
  // Some browsers emit a click at each loop boundary, which sounds exactly like
  // the old rapid-fire footstep regression. Only old iOS needs this fallback.
  html = html.replace(
    "if(this.on){\n      if(!this._silentEl){",
    "if(this.on && (/iP(hone|ad|od)/.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1)) && !navigator.audioSession){\n      if(!this._silentEl){",
  );

  // Restore the previously verified BUILD 405+ footstep generator. The cadence
  // remains controlled by the existing 0.42 second step timer.
  html = html.replace(
    /  _lastStepAt:0,[\s\S]*?  },       \/\/ 발소리: 짧은 저역 노이즈 한 번\. tone 반복\/중첩 금지\n/,
    "  step(){ this.blip(120+rng()*30,0.05,'sine',0.04); },       // 발소리: BUILD 405+ 검증 리듬\n",
  );

  const headers = new Headers(response.headers);
  headers.delete('content-length');
  headers.set('cache-control', 'no-store');

  return new Response(html, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
};
