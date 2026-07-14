export const onRequest: PagesFunction = async (context) => {
  const response = await context.next();
  const url = new URL(context.request.url);
  const contentType = response.headers.get('content-type') || '';

  if (url.pathname !== '/byeoli-walk/' || !contentType.includes('text/html')) {
    return response;
  }

  let html = await response.text();

  // The old deferred live-parity script ran outside the module scope, so it could
  // not reach LocalStateProvider, startAction, sky, ppae, or the render loop.
  html = html.replace('<script src="/byeoli-walk/live-parity.js" defer></script>\n', '');

  if (url.searchParams.get('mode') === 'live') {
    // Live uses the exact sandbox update/render loop. Authority only broadcasts
    // decisions and telemetry; it never owns animation frames.
    html = html.replace(
      'let stateProvider = LIVE_MODE ? RemoteStateProvider : LocalStateProvider;',
      'let stateProvider = LocalStateProvider;',
    );

    const bridge = `
// BUILD 411 — Authority decision bridge inside the same module scope.
let liveAuthorityEventId=null;
let liveAuthorityBridgeInstalled=false;
function installLiveAuthorityBridge(){
  if(!LIVE_MODE||liveAuthorityBridgeInstalled) return;
  liveAuthorityBridgeInstalled=true;

  // Keep the original single-player world clock, movement, cat, clouds, flash,
  // shutter timing and renderer. Only encounter decisions come from Authority.
  updateEncounters=function(){};

  const originalAuthorityPoll=RemoteStateProvider.poll.bind(RemoteStateProvider);
  RemoteStateProvider.poll=async function(){
    await originalAuthorityPoll();
    const authority=this._to||this._last;
    if(!authority) return;

    const telemetry=authority.telemetry;
    if(telemetry){
      tally.memories=Number(telemetry.memories||0);
      tally.diary=Number(telemetry.diary||0);
      updateTally();
      const drives=telemetry.drives||{};
      for(const d of DRIVES){
        const v=Number(drives[d]||0);
        const fill=document.getElementById('df-'+d);
        const label=document.getElementById('dv-'+d);
        if(fill) fill.style.width=(v*100)+'%';
        if(label) label.textContent=v.toFixed(2);
      }
      fatVal.textContent=Number(telemetry.fatigue||0).toFixed(2);
    }

    const event=authority.liveEvent;
    if(!event||event.id===liveAuthorityEventId) return;
    liveAuthorityEventId=event.id;
    if(Date.now()-Number(event.occurredAt||0)>15000) return;

    const cls=event.kind==='pass'?'pass':event.kind==='rare'?'rare':event.kind==='diary'?'diary':'act';
    pushMsg(cls,event.text||'',event.sub||null);

    if(event.action){
      const parsed=parseFloat(String(event.sub||''));
      const duration=Number.isFinite(parsed)?parsed:2.8;
      startAction({ action:event.action, targetId:event.targetId||null, duration });
    }
  };

  WakeLockManager.start();
  RemoteStateProvider.start();
  document.getElementById('speedBtn').disabled=true;
  document.getElementById('reseedBtn').disabled=true;
  document.getElementById('tasteHint').textContent='— LIVE · 싱글 렌더러 · Authority 결정';
}
`;

    html = html.replace(
      'requestAnimationFrame(loop);',
      `${bridge}\ninstallLiveAuthorityBridge();\nrequestAnimationFrame(loop);`,
    );
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
