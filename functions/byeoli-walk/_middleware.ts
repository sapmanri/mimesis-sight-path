import { serialize2DRegistry, validateObjectRegistry } from '../../src/objects/objectRegistry';

/**
 * BUILD 421-B: CATALOG 치환 변환을 순수 함수로 분리.
 * 이 미들웨어(/byeoli-walk/)와 루트 미들웨어의 공개 도메인 host-rewrite가 공유한다.
 * 변환 내용은 기존과 바이트 단위로 동일 — 레지스트리 무결성 실패만 예외로 던진다(호출측이 500 변환).
 */
export function transformWalkHtml(html: string): string {
  // BUILD 408-A — one object identity source.
  const registryErrors = validateObjectRegistry();
  if (registryErrors.length) {
    throw new Error(`Object registry invalid:\n${registryErrors.join('\n')}`);
  }
  const twoD = serialize2DRegistry();
  html = html.replace(/const CATALOG = \{[\s\S]*?\n\};\n\n\/\/ variant 라벨/, `const CATALOG = ${JSON.stringify(twoD.catalog)};\n\n// variant 라벨`);
  html = html.replace(/const VARIANTS = \{[\s\S]*?\n\};\n\nconst CATS/, `const VARIANTS = ${JSON.stringify(twoD.variants)};\n\nconst CATS`);
  html = html.replace(/const RARE = \{[\s\S]*?\n\};\n\n\/\/ 배치 비율/, `const RARE = ${JSON.stringify(twoD.rare)};\n\n// 배치 비율`);
  html = html.replace(/const PLAN = \{[\s\S]*?\n\};\n\nfunction buildTown/, `const PLAN = ${JSON.stringify(twoD.plan)};\n\nfunction buildTown`);

  // BUILD 409-E — category-balanced, weighted subset per walk.
  html = html.replace(
    /function buildTown\(rng\)\{[\s\S]*?return \{ items, worldLen:x\+200, rareItem \};\n\}/,
    `const SPAWN_BUDGET = { nature:22, thing:20, animal:12, rest:8 };

function pickWeightedUnique(types,count,rng){
  const candidates=types.filter((type)=>CATALOG[type]&&(PLAN[type]??0)>0);
  const picked=[];
  while(picked.length<count&&candidates.length){
    let total=0;
    for(const type of candidates){
      const rarity=CATALOG[type].rarity;
      const rarityFactor=rarity==='uncommon'?0.72:rarity==='rare'?0.2:1;
      total+=(PLAN[type]??1)*rarityFactor;
    }
    let roll=rng()*total, chosen=0;
    for(let i=0;i<candidates.length;i++){
      const type=candidates[i], rarity=CATALOG[type].rarity;
      const rarityFactor=rarity==='uncommon'?0.72:rarity==='rare'?0.2:1;
      roll-=(PLAN[type]??1)*rarityFactor;
      if(roll<=0){ chosen=i; break; }
    }
    picked.push(candidates.splice(chosen,1)[0]);
  }
  return picked;
}

function buildTown(rng){
  const items=[];
  const pool=[];
  for(const cat of ['nature','thing','animal','rest']){
    pool.push(...pickWeightedUnique(CATS[cat]??[],SPAWN_BUDGET[cat]??0,rng));
  }
  for(let i=pool.length-1;i>0;i--){ const j=(rng()*(i+1))|0; [pool[i],pool[j]]=[pool[j],pool[i]]; }

  let x=150, idx=0;
  for(const type of pool){
    const def=CATALOG[type];
    const gap = def.cat==='animal' ? 300 + (rng()*160|0)
              : def.rarity==='uncommon' ? 160 + (rng()*100|0)
              : 100 + (rng()*70|0);
    x += gap;
    const vs=VARIANTS[type]; const variant = vs ? vs[(rng()*vs.length)|0] : '';
    items.push({
      id:\`${'${type}'}-${'${variant||\'a\'}'}-${'${idx}'}\`, type, variant,
      x, layer: def.cat==='thing'||type==='oldtree'?'middle':'front',
      phase:'unseen', reactedThisPass:false,
    });
    idx++;
  }
  let rareItem=null;
  if(rng()<0.05){
    const keys=Object.keys(RARE); const rk=keys[(rng()*keys.length)|0];
    const rx=200+(rng()*(x-400))|0;
    rareItem={ id:\`rare-${'${rk}'}-${'${idx}'}\`, type:rk, variant:'', x:rx, layer:'middle',
      phase:'unseen', reactedThisPass:false, rare:true };
    items.push(rareItem); items.sort((a,b)=>a.x-b.x);
  }
  return { items, worldLen:x+200, rareItem };
}`,
  );

  // iOS audio unlock / footstep regression fixes.
  html = html.replace(
    "if(this.on){\n      if(!this._silentEl){",
    "if(this.on && (/iP(hone|ad|od)/.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1)) && !navigator.audioSession){\n      if(!this._silentEl){",
  );
  html = html.replace(
    /  _lastStepAt:0,[\s\S]*?  },       \/\/ 발소리: 짧은 저역 노이즈 한 번\. tone 반복\/중첩 금지\n/,
    "  step(){ this.blip(120+rng()*30,0.05,'sine',0.04); },       // 발소리: BUILD 405+ 검증 리듬\n",
  );

  // BUILD 410-F/K1 — resilient live provider + Wake Lock + snapshot interpolation.
  html = html.replace(
    /\/\/ live 모드용 — 지금은 인터페이스만\.[\s\S]*?let stateProvider = LocalStateProvider;/,
    `// live 모드용 — Single Byeoli Authority의 완결 snapshot만 읽는다.
const LiveUi = {
  badge:null,
  ensure(){
    if(this.badge) return this.badge;
    const el=document.createElement('div');
    el.id='liveStatusBadge';
    // 424: 배지는 탭 가능한 버튼이다. 이전엔 pointer-events:none이라 눌리지 않았고,
    // Wake Lock 재시도가 "화면 아무 데나 탭"에만 의존해 사용자가 인지할 수 없었다.
    // 최소 탭 타깃 44px 확보, 우하단(우상단 HUD와 겹치지 않음).
    el.style.cssText='position:fixed;right:8px;bottom:8px;z-index:50;min-height:44px;display:flex;align-items:center;padding:8px 12px;border:1px solid #4f5d4f;border-radius:8px;background:rgba(10,18,11,.88);color:#b9c7b5;font:10px ui-monospace,monospace;letter-spacing:.03em;cursor:pointer;-webkit-tap-highlight-color:transparent;user-select:none';
    el.setAttribute('role','button');
    el.setAttribute('tabindex','0');
    el.addEventListener('click',()=>{ WakeLockManager.retryFromUser(); });
    el.addEventListener('keydown',(e)=>{ if(e.key==='Enter'||e.key===' '){ e.preventDefault(); WakeLockManager.retryFromUser(); } });
    document.body.appendChild(el); this.badge=el; return el;
  },
  set(text,warning=false){ const el=this.ensure(); el.textContent=text; el.style.color=warning?'#e9b0a8':'#b9c7b5'; },
  showAuthorityError(code){
    const map={
      authority_service_binding_missing:'LIVE 오류 · Authority 서비스 연결 없음',
      schema_mismatch:'LIVE 오류 · 상태 형식 불일치',
      snapshot_incomplete:'LIVE 오류 · 상태 데이터 불완전',
    };
    const msg=map[code]||('LIVE 연결 오류 · '+code);
    document.getElementById('daytag').textContent=msg;
    document.getElementById('tasteHint').textContent='— '+msg;
  },
};

const WakeLockManager = {
  sentinel:null, enabled:false, retryBound:false,
  async acquire(){
    if(!this.enabled || document.visibilityState!=='visible') return;
    if(!('wakeLock' in navigator)){ LiveUi.set('⚠ 화면 자동 잠금 가능',true); return; }
    try{
      if(this.sentinel && !this.sentinel.released) return;
      this.sentinel=await navigator.wakeLock.request('screen');
      LiveUi.set('🔋 화면 유지 중');
      this.sentinel.addEventListener('release',()=>{ this.sentinel=null; if(this.enabled) LiveUi.set('⚠ 화면 유지 해제됨',true); });
    }catch(e){ LiveUi.set('⚠ 화면 자동 잠금 가능',true); }
  },
  start(){
    if(this.enabled) return; this.enabled=true; this.acquire();
    document.addEventListener('visibilitychange',()=>{ if(document.visibilityState==='visible') this.acquire(); });
    window.addEventListener('pageshow',()=>this.acquire());
    window.addEventListener('pagehide',()=>this.release());
    if(!this.retryBound){
      const retry=()=>this.acquire();
      window.addEventListener('pointerdown',retry,{passive:true});
      window.addEventListener('keydown',retry); this.retryBound=true;
    }
  },
  async release(){ const s=this.sentinel; this.sentinel=null; if(s&&!s.released){ try{ await s.release(); }catch{} } },
  // 424: 배지를 직접 눌렀을 때 — 사용자 제스처가 확실하므로 브라우저가 요청을 받아준다.
  retryFromUser(){
    if(!this.enabled) this.start();
    else { LiveUi.set('🔋 화면 유지 확인 중…'); this.acquire(); }
  },
};

function liveLerp(a,b,t){ return a+(b-a)*t; }
function liveLerpWrap(a,b,t,span){
  let d=b-a;
  if(d>span/2)d-=span; else if(d<-span/2)d+=span;
  let v=a+d*t;
  while(v<0)v+=span; while(v>=span)v-=span;
  return v;
}
function interpolateLiveState(a,b,t){
  if(!a||!b) return b||a;
  const s=structuredClone(b);
  const worldLen=(b.camera&&b.camera.worldLen)||4000;
  s.byeoli.worldX=liveLerpWrap(a.byeoli.worldX,b.byeoli.worldX,t,worldLen);
  s.byeoli.walkPhase=liveLerp(a.byeoli.walkPhase,b.byeoli.walkPhase,t);
  s.byeoli.actTimer=liveLerp(a.byeoli.actTimer||0,b.byeoli.actTimer||0,t);
  s.ppae.x=liveLerp(a.ppae.x,b.ppae.x,t);
  s.ppae.y=liveLerp(a.ppae.y,b.ppae.y,t);
  s.ppae.phase=liveLerp(a.ppae.phase,b.ppae.phase,t);
  s.sky.t=liveLerpWrap(a.sky.t,b.sky.t,t,1);
  if(Array.isArray(a.sky.clouds)&&Array.isArray(b.sky.clouds)){
    s.sky.clouds=b.sky.clouds.map((c,i)=>{
      const p=a.sky.clouds[i];
      return p?{...c,x:liveLerp(p.x,c.x,t),y:liveLerp(p.y,c.y,t)}:c;
    });
  }
  s.camera.worldX=s.byeoli.worldX;
  s.camera.camShift=s.byeoli.worldX-s.byeoli.screenX;
  s.updatedAt=liveLerp(a.updatedAt||0,b.updatedAt||0,t);
  return s;
}

const RemoteStateProvider = {
  mode:'live',
  _last:null, _from:null, _to:null, _receivedAt:0, _blendMs:1000,
  _timer:null, _inFlight:false, _epoch:null, _sequence:-1,
  _error:null, _errorCode:null, _stale:true, _lastSeenAt:0,
  step(dt){},
  getCurrentByeoliState(){
    if(!this._to) return this._last;
    if(!this._from) return this._to;
    const t=Math.max(0,Math.min(1,(performance.now()-this._receivedAt)/this._blendMs));
    return interpolateLiveState(this._from,this._to,t);
  },
  status(){ return { error:this._error, errorCode:this._errorCode, stale:this._stale, sequence:this._sequence, epoch:this._epoch }; },
  validate(v){
    if(!v||typeof v!=='object') throw new Error('invalid_envelope');
    if(v.schemaVersion!==1) throw new Error('schema_mismatch');
    if(typeof v.authorityId!=='string'||!v.authorityId) throw new Error('authority_missing');
    if(!Number.isSafeInteger(v.instanceEpoch)||!Number.isSafeInteger(v.sequence)) throw new Error('clock_invalid');
    if(!v.state||typeof v.state!=='object') throw new Error('state_missing');
    const s=v.state;
    if(!s.byeoli||!s.ppae||!s.sky||!s.camera||!Array.isArray(s.props)) throw new Error('snapshot_incomplete');
    return v;
  },
  async poll(){
    if(this._inFlight) return; this._inFlight=true;
    try{
      const r=await fetch('/api/byeoli/state',{cache:'no-store',headers:{accept:'application/json'}});
      let body=null;
      try{ body=await r.json(); }catch{}
      if(!r.ok){ const code=body&&body.error?body.error:('authority_http_'+r.status); throw new Error(code); }
      const v=this.validate(body);
      if(this._epoch===v.instanceEpoch && v.sequence<=this._sequence) return;
      const current=this.getCurrentByeoliState();
      const previousUpdatedAt=this._to&&this._to.updatedAt;
      this._epoch=v.instanceEpoch; this._sequence=v.sequence;
      this._from=current||v.state; this._to=v.state; this._last=v.state;
      const serverGap=previousUpdatedAt?Math.max(700,Math.min(1400,v.state.updatedAt-previousUpdatedAt)):1000;
      this._blendMs=serverGap; this._receivedAt=performance.now();
      this._lastSeenAt=Date.now(); this._stale=false; this._error=null; this._errorCode=null;
      document.getElementById('daytag').textContent='LIVE · '+v.authorityId+' · #'+v.sequence;
      document.getElementById('tasteHint').textContent='— LIVE: Authority 읽기 전용';
    }catch(e){
      this._error=e instanceof Error?e.message:String(e); this._errorCode=this._error;
      this._stale=!this._lastSeenAt||Date.now()-this._lastSeenAt>5000;
      if(this._last){
        document.getElementById('daytag').textContent='LIVE · 마지막 화면 유지 · 재연결 중';
      }else{
        LiveUi.showAuthorityError(this._errorCode||'unknown');
      }
    }finally{ this._inFlight=false; }
  },
  start(){
    if(this._timer) return; this.poll();
    this._timer=setInterval(()=>{ this.poll(); if(this._lastSeenAt&&Date.now()-this._lastSeenAt>5000) this._stale=true; },1000);
  },
  stop(){ if(this._timer) clearInterval(this._timer); this._timer=null; },
};

const LIVE_MODE=new URLSearchParams(location.search).get('mode')==='live';
let stateProvider = LIVE_MODE ? RemoteStateProvider : LocalStateProvider;`,
  );

  html = html.replace(
    "    renderDrives(); renderTaste();   // Observatory/sandbox UI — 캔버스 렌더 경로와 분리 (live: TODO authority telemetry)",
    "    if(stateProvider.mode==='sandbox'){ renderDrives(); renderTaste(); }",
  );

  html = html.replace(
    "boot();\nrequestAnimationFrame(loop);",
    `if(stateProvider.mode==='sandbox'){
  boot();
  // BUILD 424: 공개 사이트(sandbox)도 화면 유지가 필요하다. 걷기를 지켜보는 앱인데
  // 그동안 Wake Lock이 live 모드에서만 시작돼 byeoli.sapmanri.com에서는 화면이 꺼졌다.
  WakeLockManager.start();
}else{
  fitCanvas();
  document.getElementById('speedBtn').disabled=true;
  document.getElementById('pauseBtn').disabled=true;
  document.getElementById('reseedBtn').disabled=true;
  document.getElementById('tasteHint').textContent='— LIVE: Authority 읽기 전용';
  streamEl.innerHTML='';
  pushMsg('day','— 단 하나의 별이에 연결 중 —',null);
  WakeLockManager.start();
  RemoteStateProvider.start();
}
requestAnimationFrame(loop);`,
  );

  return html;
}

export const onRequest: PagesFunction = async (context) => {
  const response = await context.next();
  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('text/html')) return response;

  let html = await response.text();
  try {
    html = transformWalkHtml(html);
  } catch (err) {
    return new Response(err instanceof Error ? err.message : String(err), { status: 500 });
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