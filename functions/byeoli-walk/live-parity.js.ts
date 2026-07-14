const script = String.raw`(function(){
  if(new URLSearchParams(location.search).get('mode')!=='live') return;
  if(typeof RemoteStateProvider==='undefined') return;

  const provider=RemoteStateProvider;
  const originalPoll=provider.poll.bind(provider);
  let lastEventId=null;
  let flashUntil=0;
  let lastFootstepAt=0;
  let visual=null;
  let visualAction=null;

  function clone(v){ return v?structuredClone(v):null; }
  function wrap(value,span){
    if(!span) return value;
    value%=span;
    return value<0?value+span:value;
  }
  function wrapDelta(from,to,span){
    let d=to-from;
    if(d>span/2)d-=span;
    else if(d<-span/2)d+=span;
    return d;
  }
  function actionDuration(event){
    const parsed=parseFloat(String(event&&event.sub||''));
    return Number.isFinite(parsed)?Math.max(.45,parsed):2.8;
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
        fill.classList.toggle('win',!!visualAction&&visualAction.action===key);
      }
      if(label) label.textContent=value.toFixed(2);
    });
    const fatigue=document.getElementById('fatVal');
    if(fatigue) fatigue.textContent=Number(telemetry.fatigue||0).toFixed(2);
    const hint=document.getElementById('tasteHint');
    if(hint) hint.textContent='— LIVE · 기억 '+(telemetry.memories||0)+' · 일기 '+(telemetry.diary||0);
  }

  function startLocalAction(event){
    if(!visual||!event||!event.action) return;
    const duration=actionDuration(event);
    const now=performance.now();
    visualAction={
      id:event.id,
      action:event.action,
      targetId:event.targetId||null,
      startedAt:now,
      endsAt:now+duration*1000,
    };
    visual.byeoli.state='acting';
    visual.byeoli.actAction=event.action;
    visual.byeoli.actTarget=event.targetId||null;
    visual.byeoli.actTimer=duration;

    if(event.action==='record'){
      flashUntil=now+120;
      if(typeof Sound!=='undefined'&&Sound.on){
        try{ Sound.wake(); }catch(e){}
        setTimeout(function(){ try{ Sound.shutter(); }catch(e){} },35);
      }
    }else if(typeof Sound!=='undefined'&&Sound.on){
      try{ Sound.act(event.action); }catch(e){}
    }
  }

  function playEvent(event){
    if(!event||event.id===lastEventId) return;
    lastEventId=event.id;
    if(Date.now()-Number(event.occurredAt||0)>15000) return;

    const cls=event.kind==='pass'?'pass':event.kind==='rare'?'rare':event.kind==='diary'?'diary':'act';
    if(typeof pushMsg==='function') pushMsg(cls,event.text||'',event.sub||null);
    if(event.action) startLocalAction(event);
  }

  function seedVisual(authority){
    visual=clone(authority);
    if(!visual) return;
    visual.flash={on:false,timer:0};
    if(visual.byeoli.state==='acting'&&Number(visual.byeoli.actTimer||0)>0){
      const now=performance.now();
      visualAction={
        id:'join-'+String(visual.byeoli.actTarget||visual.updatedAt||now),
        action:visual.byeoli.actAction,
        targetId:visual.byeoli.actTarget,
        startedAt:now,
        endsAt:now+Number(visual.byeoli.actTimer)*1000,
      };
    }
  }

  function reconcile(authority){
    if(!authority) return;
    if(!visual){ seedVisual(authority); return; }
    const worldLen=Number(authority.camera&&authority.camera.worldLen||visual.camera.worldLen||4000);
    const delta=wrapDelta(Number(visual.byeoli.worldX||0),Number(authority.byeoli.worldX||0),worldLen);
    // Authority는 방향을 잡고 Viewer는 연속 재생한다. 큰 순간이동도 한 프레임에 붙잡지 않는다.
    visual.byeoli.worldX=wrap(Number(visual.byeoli.worldX||0)+delta*.12,worldLen);
    visual.camera.worldLen=worldLen;
    visual.props=clone(authority.props)||visual.props;
    visual.telemetry=clone(authority.telemetry)||visual.telemetry;
    visual.sky.phase=authority.sky.phase;
    visual.sky.weather=authority.sky.weather;
    visual.sky.cloudDark=authority.sky.cloudDark;
    visual.epoch=authority.epoch;
    visual.updatedAt=authority.updatedAt;
    if(!visualAction&&authority.byeoli.state==='acting'&&Number(authority.byeoli.actTimer||0)>0){
      const now=performance.now();
      visualAction={
        id:'recover-'+String(authority.byeoli.actTarget||authority.updatedAt),
        action:authority.byeoli.actAction,
        targetId:authority.byeoli.actTarget,
        startedAt:now,
        endsAt:now+Number(authority.byeoli.actTimer)*1000,
      };
      visual.byeoli.state='acting';
      visual.byeoli.actAction=authority.byeoli.actAction;
      visual.byeoli.actTarget=authority.byeoli.actTarget;
      visual.byeoli.actTimer=Number(authority.byeoli.actTimer);
    }
  }

  provider.poll=async function(){
    await originalPoll();
    const authority=this._to||this._last;
    if(!authority) return;
    reconcile(authority);
    showTelemetry(authority);
    playEvent(authority.liveEvent);
  };

  provider.getCurrentByeoliState=function(){
    if(!visual){
      const authority=this._to||this._last;
      if(authority) seedVisual(authority);
    }
    if(!visual) return null;
    const state=clone(visual);
    const flashing=performance.now()<flashUntil;
    state.flash={on:flashing,timer:flashing?.12:0};
    return state;
  };

  provider.step=function(dt){
    if(!visual) return;
    dt=Math.max(0,Math.min(Number(dt)||0,.12));
    const now=performance.now();

    if(visualAction){
      const left=Math.max(0,(visualAction.endsAt-now)/1000);
      visual.byeoli.state='acting';
      visual.byeoli.actAction=visualAction.action;
      visual.byeoli.actTarget=visualAction.targetId;
      visual.byeoli.actTimer=left;
      if(left<=0){
        visualAction=null;
        visual.byeoli.state='walk';
        visual.byeoli.actAction=null;
        visual.byeoli.actTarget=null;
        visual.byeoli.actTimer=0;
      }
    }

    if(visual.byeoli.state==='walk'){
      const worldLen=Number(visual.camera.worldLen||4000);
      visual.byeoli.worldX=wrap(Number(visual.byeoli.worldX||0)+Number(visual.byeoli.speed||18)*dt,worldLen);
      visual.byeoli.walkPhase=Number(visual.byeoli.walkPhase||0)+dt*8;
      if(now-lastFootstepAt>=330){
        lastFootstepAt=now;
        if(typeof Sound!=='undefined'&&Sound.on){ try{ Sound.step(); }catch(e){} }
      }
    }

    visual.camera.worldX=visual.byeoli.worldX;
    visual.camera.camShift=visual.byeoli.worldX-visual.byeoli.screenX;

    visual.ppae.phase=Number(visual.ppae.phase||0)+dt*5;
    visual.ppae.x=Number(visual.ppae.x||0)+Number(visual.ppae.facing||1)*48*dt;
    if(visual.ppae.x>280){ visual.ppae.x=280; visual.ppae.facing=-1; }
    if(visual.ppae.x<110){ visual.ppae.x=110; visual.ppae.facing=1; }

    if(visual.sky&&Array.isArray(visual.sky.clouds)){
      visual.sky.clouds.forEach(function(cloud){
        cloud.x=Number(cloud.x)-Number(cloud.spd||0)*dt;
        if(cloud.x<-Number(cloud.w||0)-10) cloud.x=370;
      });
    }
  };
})();`;

export const onRequest: PagesFunction = async () => new Response(script, {
  headers: {
    'content-type': 'application/javascript; charset=utf-8',
    'cache-control': 'no-store',
  },
});