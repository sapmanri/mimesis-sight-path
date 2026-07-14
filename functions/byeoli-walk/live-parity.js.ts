const script = String.raw`(function(){
  if(new URLSearchParams(location.search).get('mode')!=='live') return;
  if(typeof RemoteStateProvider==='undefined') return;

  const provider=RemoteStateProvider;
  const originalPoll=provider.poll.bind(provider);
  let lastEventId=null;
  let flashUntil=0;
  let lastFootstepAt=0;

  function wrap(value,span){
    if(!span) return value;
    value%=span;
    return value<0?value+span:value;
  }

  function showTelemetry(state){
    const telemetry=state&&state.telemetry;
    if(!telemetry) return;
    if(typeof tally!=='undefined'){
      tally.memories=telemetry.memories||0;
      tally.diary=telemetry.diary||0;
      if(typeof updateTally==='function') updateTally();
    }
    const drives=telemetry.drives||{};
    ['observe','rest','record','wonder'].forEach(function(key){
      const value=Number(drives[key]||0);
      const fill=document.getElementById('df-'+key);
      const label=document.getElementById('dv-'+key);
      if(fill){
        fill.style.width=(value*100)+'%';
        fill.classList.toggle('win',state.byeoli.state==='acting'&&state.byeoli.actAction===key);
      }
      if(label) label.textContent=value.toFixed(2);
    });
    const fatigue=document.getElementById('fatVal');
    if(fatigue) fatigue.textContent=Number(telemetry.fatigue||0).toFixed(2);
    const hint=document.getElementById('tasteHint');
    if(hint) hint.textContent='— LIVE · 기억 '+(telemetry.memories||0)+' · 일기 '+(telemetry.diary||0);
  }

  function playEvent(event){
    if(!event||event.id===lastEventId) return;
    lastEventId=event.id;
    if(Date.now()-Number(event.occurredAt||0)>15000) return;

    const cls=event.kind==='pass'?'pass':event.kind==='rare'?'rare':event.kind==='diary'?'diary':'act';
    if(typeof pushMsg==='function') pushMsg(cls,event.text||'',event.sub||null);

    if(event.action==='record'){
      flashUntil=performance.now()+120;
      if(typeof Sound!=='undefined'&&Sound.on){
        try{ Sound.wake(); }catch(e){}
        setTimeout(function(){ try{ Sound.shutter(); }catch(e){} },35);
      }
    }else if(event.action&&typeof Sound!=='undefined'&&Sound.on){
      try{ Sound.act(event.action); }catch(e){}
    }
  }

  provider.poll=async function(){
    await originalPoll();
    const state=this._to||this._last;
    if(!state) return;
    showTelemetry(state);
    playEvent(state.liveEvent);
  };

  provider.getCurrentByeoliState=function(){
    const source=this._to||this._last;
    if(!source) return null;
    const state=structuredClone(source);
    let elapsed=Math.max(0,(performance.now()-this._receivedAt)/1000);
    elapsed=Math.min(elapsed,1.35);
    const worldLen=Number(state.camera.worldLen||4000);

    if(state.byeoli.state==='acting'){
      const actionLeft=Math.max(0,Number(state.byeoli.actTimer||0));
      if(elapsed<actionLeft){
        state.byeoli.actTimer=actionLeft-elapsed;
        elapsed=0;
      }else{
        elapsed-=actionLeft;
        state.byeoli.state='walk';
        state.byeoli.actAction=null;
        state.byeoli.actTarget=null;
        state.byeoli.actTimer=0;
      }
    }

    if(state.byeoli.state==='walk'&&elapsed>0){
      state.byeoli.worldX=wrap(Number(state.byeoli.worldX)+Number(state.byeoli.speed||0)*elapsed,worldLen);
      state.byeoli.walkPhase=Number(state.byeoli.walkPhase||0)+elapsed*8;
    }

    state.camera.worldX=state.byeoli.worldX;
    state.camera.camShift=state.byeoli.worldX-state.byeoli.screenX;

    state.ppae.phase=Number(state.ppae.phase||0)+elapsed*5;
    state.ppae.x=Number(state.ppae.x||0)+Number(state.ppae.facing||1)*7*elapsed;
    if(state.ppae.x>280){ state.ppae.x=280; state.ppae.facing=-1; }
    if(state.ppae.x<110){ state.ppae.x=110; state.ppae.facing=1; }

    if(state.sky&&Array.isArray(state.sky.clouds)){
      state.sky.clouds.forEach(function(cloud){
        cloud.x=Number(cloud.x)-Number(cloud.spd||0)*elapsed;
        if(cloud.x<-Number(cloud.w||0)-10) cloud.x=370;
      });
    }

    const flashing=performance.now()<flashUntil;
    state.flash={on:flashing,timer:flashing?0.12:0};
    return state;
  };

  provider.step=function(){
    const state=this._to||this._last;
    if(!state||state.byeoli.state!=='walk') return;
    const now=performance.now();
    if(now-lastFootstepAt<330) return;
    lastFootstepAt=now;
    if(typeof Sound!=='undefined'&&Sound.on){
      try{ Sound.step(); }catch(e){}
    }
  };
})();`;

export const onRequest: PagesFunction = async () => new Response(script, {
  headers: {
    'content-type': 'application/javascript; charset=utf-8',
    'cache-control': 'no-store',
  },
});
