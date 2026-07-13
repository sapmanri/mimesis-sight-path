import { serialize2DRegistry, validateObjectRegistry } from '../../src/objects/objectRegistry';

export const onRequest: PagesFunction = async (context) => {
  const response = await context.next();
  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('text/html')) return response;

  let html = await response.text();

  // BUILD 408-A — one object identity source.
  // The static catalog remains an offline fallback, but every deployed 2D page receives
  // catalog/variants/rare/spawn plan generated from src/objects/objectRegistry.ts.
  const registryErrors = validateObjectRegistry();
  if (registryErrors.length) {
    return new Response(`Object registry invalid:\n${registryErrors.join('\n')}`, { status: 500 });
  }
  const twoD = serialize2DRegistry();
  html = html.replace(/const CATALOG = \{[\s\S]*?\n\};\n\n\/\/ variant 라벨/, `const CATALOG = ${JSON.stringify(twoD.catalog)};\n\n// variant 라벨`);
  html = html.replace(/const VARIANTS = \{[\s\S]*?\n\};\n\nconst CATS/, `const VARIANTS = ${JSON.stringify(twoD.variants)};\n\nconst CATS`);
  html = html.replace(/const RARE = \{[\s\S]*?\n\};\n\n\/\/ 배치 비율/, `const RARE = ${JSON.stringify(twoD.rare)};\n\n// 배치 비율`);
  html = html.replace(/const PLAN = \{[\s\S]*?\n\};\n\nfunction buildTown/, `const PLAN = ${JSON.stringify(twoD.plan)};\n\nfunction buildTown`);

  // BUILD 409-E — category-balanced, weighted subset per walk.
  // Before this, every PLAN entry was expanded into every town, so high weights such as
  // flower:6 or bicycle:3 created visible repetition and the 100 new objects made each
  // world unnecessarily long. A town now draws a unique weighted subset from each category.
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
  // Category quotas are fixed, but the final route order remains different for every seed.
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
  // 희귀 이벤트: 5% 확률로 1개 삽입
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
  html = html.replace(
    /\/\/ live 모드용 — 지금은 인터페이스만\.[\s\S]*?let stateProvider = LocalStateProvider;/,
    `// live 모드용 — Single Byeoli Authority의 완결 snapshot만 읽는다.
// ⚠ step()은 절대 update()/brain.decide()를 부르지 않는다.
const RemoteStateProvider = {
  mode:'live',
  _last:null, _timer:null, _inFlight:false, _epoch:null, _sequence:-1,
  _error:null, _stale:true, _lastSeenAt:0,
  step(dt){ /* renderer clock only — authority가 세계를 진행한다 */ },
  getCurrentByeoliState(){ return this._last; },
  status(){ return { error:this._error, stale:this._stale, sequence:this._sequence, epoch:this._epoch }; },
  validate(v){
    if(!v||typeof v!=='object') throw new Error('invalid envelope');
    if(v.schemaVersion!==1) throw new Error('schema mismatch');
    if(typeof v.authorityId!=='string'||!v.authorityId) throw new Error('authority missing');
    if(!Number.isSafeInteger(v.instanceEpoch)||!Number.isSafeInteger(v.sequence)) throw new Error('clock invalid');
    if(!v.state||typeof v.state!=='object') throw new Error('state missing');
    const s=v.state;
    if(!s.byeoli||!s.ppae||!s.sky||!s.camera||!Array.isArray(s.props)) throw new Error('snapshot incomplete');
    return v;
  },
  async poll(){
    if(this._inFlight) return;
    this._inFlight=true;
    try{
      const r=await fetch('/api/byeoli/state',{cache:'no-store',headers:{accept:'application/json'}});
      if(!r.ok) throw new Error('authority '+r.status);
      const v=this.validate(await r.json());
      if(this._epoch===v.instanceEpoch && v.sequence<=this._sequence) return;
      this._epoch=v.instanceEpoch; this._sequence=v.sequence; this._last=v.state;
      this._lastSeenAt=Date.now(); this._stale=false; this._error=null;
      document.getElementById('daytag').textContent='LIVE · '+v.authorityId+' · #'+v.sequence;
    }catch(e){
      this._error=e instanceof Error?e.message:String(e);
      this._stale=!this._lastSeenAt||Date.now()-this._lastSeenAt>5000;
      document.getElementById('daytag').textContent=this._stale?'LIVE · 연결 대기':'LIVE · 재연결 중';
    }finally{ this._inFlight=false; }
  },
  start(){
    if(this._timer) return;
    this.poll();
    this._timer=setInterval(()=>{
      this.poll();
      if(this._lastSeenAt&&Date.now()-this._lastSeenAt>5000) this._stale=true;
    },1000);
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
}else{
  fitCanvas();
  document.getElementById('speedBtn').disabled=true;
  document.getElementById('pauseBtn').disabled=true;
  document.getElementById('reseedBtn').disabled=true;
  document.getElementById('tasteHint').textContent='— LIVE: Authority 읽기 전용';
  streamEl.innerHTML='';
  pushMsg('day','— 단 하나의 별이에 연결 중 —',null);
  RemoteStateProvider.start();
}
requestAnimationFrame(loop);`,
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
