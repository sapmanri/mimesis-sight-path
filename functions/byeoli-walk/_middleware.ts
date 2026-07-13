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

  // BUILD 407-A3 — 2D canary live provider.
  // `?mode=live` is explicitly opt-in while sandbox remains the default.
  // Live mode only polls the same-origin read-only authority endpoint and never
  // invokes update(), brain.decide(), Memory writes, or Habit writes.
  html = html.replace(
    /\/\/ live 모드용 — 지금은 인터페이스만\.[\s\S]*?let stateProvider = LocalStateProvider;/,
    `// live 모드용 — Single Byeoli Authority의 완결 snapshot만 읽는다.\n// ⚠ step()은 절대 update()/brain.decide()를 부르지 않는다.\nconst RemoteStateProvider = {\n  mode:'live',\n  _last:null, _timer:null, _inFlight:false, _epoch:null, _sequence:-1,\n  _error:null, _stale:true, _lastSeenAt:0,\n  step(dt){ /* renderer clock only — authority가 세계를 진행한다 */ },\n  getCurrentByeoliState(){ return this._last; },\n  status(){ return { error:this._error, stale:this._stale, sequence:this._sequence, epoch:this._epoch }; },\n  validate(v){\n    if(!v||typeof v!=='object') throw new Error('invalid envelope');\n    if(v.schemaVersion!==1) throw new Error('schema mismatch');\n    if(typeof v.authorityId!=='string'||!v.authorityId) throw new Error('authority missing');\n    if(!Number.isSafeInteger(v.instanceEpoch)||!Number.isSafeInteger(v.sequence)) throw new Error('clock invalid');\n    if(!v.state||typeof v.state!=='object') throw new Error('state missing');\n    const s=v.state;\n    if(!s.byeoli||!s.ppae||!s.sky||!s.camera||!Array.isArray(s.props)) throw new Error('snapshot incomplete');\n    return v;\n  },\n  async poll(){\n    if(this._inFlight) return;\n    this._inFlight=true;\n    try{\n      const r=await fetch('/api/byeoli/state',{cache:'no-store',headers:{accept:'application/json'}});\n      if(!r.ok) throw new Error('authority '+r.status);\n      const v=this.validate(await r.json());\n      if(this._epoch===v.instanceEpoch && v.sequence<=this._sequence) return;\n      this._epoch=v.instanceEpoch; this._sequence=v.sequence; this._last=v.state;\n      this._lastSeenAt=Date.now(); this._stale=false; this._error=null;\n      document.getElementById('daytag').textContent='LIVE · '+v.authorityId+' · #'+v.sequence;\n    }catch(e){\n      this._error=e instanceof Error?e.message:String(e);\n      this._stale=!this._lastSeenAt||Date.now()-this._lastSeenAt>5000;\n      document.getElementById('daytag').textContent=this._stale?'LIVE · 연결 대기':'LIVE · 재연결 중';\n    }finally{ this._inFlight=false; }\n  },\n  start(){\n    if(this._timer) return;\n    this.poll();\n    this._timer=setInterval(()=>{\n      this.poll();\n      if(this._lastSeenAt&&Date.now()-this._lastSeenAt>5000) this._stale=true;\n    },1000);\n  },\n  stop(){ if(this._timer) clearInterval(this._timer); this._timer=null; },\n};\n\nconst LIVE_MODE=new URLSearchParams(location.search).get('mode')==='live';\nlet stateProvider = LIVE_MODE ? RemoteStateProvider : LocalStateProvider;`,
  );

  // Observatory widgets are local-brain diagnostics. Do not display stale local
  // values in live mode, where the renderer is read-only.
  html = html.replace(
    "    renderDrives(); renderTaste();   // Observatory/sandbox UI — 캔버스 렌더 경로와 분리 (live: TODO authority telemetry)",
    "    if(stateProvider.mode==='sandbox'){ renderDrives(); renderTaste(); }",
  );

  // Live mode must not boot or advance a second local Byeoli. Only initialize
  // layout/controls and begin polling the canonical snapshot.
  html = html.replace(
    "boot();\nrequestAnimationFrame(loop);",
    `if(stateProvider.mode==='sandbox'){\n  boot();\n}else{\n  fitCanvas();\n  document.getElementById('speedBtn').disabled=true;\n  document.getElementById('pauseBtn').disabled=true;\n  document.getElementById('reseedBtn').disabled=true;\n  document.getElementById('tasteHint').textContent='— LIVE: Authority 읽기 전용';\n  streamEl.innerHTML='';\n  pushMsg('day','— 단 하나의 별이에 연결 중 —',null);\n  RemoteStateProvider.start();\n}\nrequestAnimationFrame(loop);`,
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
