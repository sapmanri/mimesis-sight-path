// ---------- BUILD 148: AMBIENCE — 공기의 소리 ----------
// 음악이 아니라 공기다. 감정을 지시하지 않고, 켜져 있는 줄도 모르다가
// 끄면 세계가 죽는 소리. 에셋 파일 없이 전부 웹오디오 실시간 합성 —
// 루프 파일이 없으니 루프가 들릴 일도 없고, 두 번 같은 소리가 나지 않는다.
//
// 4겹 구조 (spec이 전부 정한다):
//   1겹 바탕 공기 — 바람 저역(무게) + 중역(스침). weather.wind가 게인과 숨결을 민다.
//   2겹 날씨     — 비(고역 노이즈 셔머), 눈(소리를 '빼는' 것 — 먹먹한 저역), 천둥(번개와 동기).
//   3겹 파도     — spec.ambience.sea. 느린 밀물 LFO 두 개가 어긋나며 밀려온다.
//   4겹 생명     — 낮의 새(문답), 밤의 풀벌레. 포아송풍 간격 — 뇌가 패턴을 못 잡는다.
//
// 전환은 전부 setTargetAtTime(τ≈0.8s) — applyThemeEnv의 머지 철학을 소리로.
// 자동재생 정책: 첫 제스처에서 스스로 잠금 해제(자체 리스너) + App/에디터가 unlock() 호출 가능.

import { footsteps } from '../scene/footsteps';

export type AmbienceState = {
  kind: 'clear' | 'cloudy' | 'rain' | 'snow';
  /** 0~1 — 구름을 밀던 그 바람이 이제 귀에서도 분다 */
  wind: number;
  /** 0~1 — 빗줄기 세기 (kind==='rain'일 때만 소리에 반영) */
  rainAmount: number;
  time: 'day' | 'night';
  /** 0~1 — 파도. 제주 0.55, 겨울 0 */
  sea: number;
  /** 0~1 — 생명의 소리(새·풀벌레) 밀도 */
  life: number;
};

type Layer = { gain: GainNode };

const DEFAULT: AmbienceState = { kind: 'clear', wind: 0, rainAmount: 0.6, time: 'day', sea: 0, life: 1 };

function createAmbience() {
  let ctx: AudioContext | null = null;
  let master: GainNode | null = null;
  let muted = false;
  let state: AmbienceState = { ...DEFAULT };
  let listenersInstalled = false;
  let birdTimer: number | null = null;
  let cricketTimer: number | null = null;
  let fireLevel = 0; // BUILD 168: 모닥불 — 가까울수록 타닥거린다
  let fireGain: GainNode | null = null;
  let crackleTimer: number | null = null;

  // 레이어 노드들 (ensure에서 생성)
  let windLow: Layer & { lp: BiquadFilterNode } | null = null;
  let windMid: Layer & { bp: BiquadFilterNode } | null = null;
  let rainL: Layer & { hp: BiquadFilterNode } | null = null;
  let seaL: Layer | null = null;
  let noiseSrc: AudioBufferSourceNode | null = null;

  const rnd = (a: number, b: number) => a + Math.random() * (b - a);

  /** 느린 LFO — param에 base 위로 얹히는 흔들림. 어긋난 주기 두 개면 주기가 안 들린다 */
  const lfo = (c: AudioContext, param: AudioParam, freq: number, depth: number) => {
    const o = c.createOscillator();
    o.type = 'sine';
    o.frequency.value = freq;
    const g = c.createGain();
    g.gain.value = depth;
    o.connect(g).connect(param);
    o.start();
    return g; // depth를 나중에 조절할 수 있게
  };

  // LFO depth 핸들 (applyTargets가 갱신)
  let windLowLfo: GainNode[] = [];
  let windMidLfo: GainNode[] = [];
  let midFreqLfo: GainNode | null = null;
  let seaLfo: GainNode[] = [];

  const ensure = (): boolean => {
    if (!ctx) {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = muted ? 0 : 1;
      master.connect(ctx.destination);

      // 공용 노이즈 원료 — 2초 화이트노이즈 루프. 모든 레이어가 여기서 갈라진다.
      const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 2), ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < d.length; i += 1) d[i] = Math.random() * 2 - 1;
      noiseSrc = ctx.createBufferSource();
      noiseSrc.buffer = buf;
      noiseSrc.loop = true;
      noiseSrc.start();

      // 1겹a — 바람 저역: 무게. 눈 오는 날엔 컷오프를 내려 먹먹하게.
      {
        const lp = ctx.createBiquadFilter();
        lp.type = 'lowpass'; lp.frequency.value = 230; lp.Q.value = 0.4;
        const g = ctx.createGain(); g.gain.value = 0;
        noiseSrc.connect(lp).connect(g).connect(master);
        windLow = { gain: g, lp };
        windLowLfo = [lfo(ctx, g.gain, 0.047, 0), lfo(ctx, g.gain, 0.113, 0)];
      }
      // 1겹b — 바람 중역: 스침(whoosh). 필터 주파수도 숨쉬듯 오르내린다.
      {
        const bp = ctx.createBiquadFilter();
        bp.type = 'bandpass'; bp.frequency.value = 560; bp.Q.value = 0.6;
        const g = ctx.createGain(); g.gain.value = 0;
        noiseSrc.connect(bp).connect(g).connect(master);
        windMid = { gain: g, bp };
        windMidLfo = [lfo(ctx, g.gain, 0.083, 0), lfo(ctx, g.gain, 0.031, 0)];
        midFreqLfo = lfo(ctx, bp.frequency, 0.059, 0);
      }
      // 2겹 — 비: 고역 노이즈. 셔머 LFO가 아주 살짝 밀도를 흔든다.
      {
        const hp = ctx.createBiquadFilter();
        hp.type = 'highpass'; hp.frequency.value = 1500; hp.Q.value = 0.5;
        const lp2 = ctx.createBiquadFilter();
        lp2.type = 'lowpass'; lp2.frequency.value = 6800; lp2.Q.value = 0.4;
        const g = ctx.createGain(); g.gain.value = 0;
        noiseSrc.connect(hp).connect(lp2).connect(g).connect(master);
        rainL = { gain: g, hp };
        lfo(ctx, g.gain, 0.21, 0.0012);
      }
      // 3겹 — 파도: 저역 노이즈가 느리게 밀려왔다 물러난다. 어긋난 밀물 둘.
      {
        const lp = ctx.createBiquadFilter();
        lp.type = 'lowpass'; lp.frequency.value = 390; lp.Q.value = 0.5;
        const g = ctx.createGain(); g.gain.value = 0;
        noiseSrc.connect(lp).connect(g).connect(master);
        seaL = { gain: g };
        seaLfo = [lfo(ctx, g.gain, 0.071, 0), lfo(ctx, g.gain, 0.043, 0)];
      }
      // BUILD 168: 모닥불 잉걸 — 낮은 웅웅거림. 타닥임은 스케줄러가 얹는다
      {
        const lp = ctx.createBiquadFilter();
        lp.type = 'lowpass'; lp.frequency.value = 380; lp.Q.value = 0.5;
        const g = ctx.createGain(); g.gain.value = 0;
        noiseSrc.connect(lp).connect(g).connect(master);
        fireGain = g;
        lfo(ctx, g.gain, 0.9, 0.002); // 잉걸의 숨
      }
      applyTargets(0.1);
      scheduleBirds();
      scheduleCrickets();
      scheduleCrackle();
    }
    if (ctx.state !== 'running') void ctx.resume(); // suspended뿐 아니라 iOS의 'interrupted'도
    return ctx.state === 'running';
  };

  /** 현재 state → 각 레이어 목표값. τ≈0.8이면 체감 2~3초 크로스페이드 */
  const applyTargets = (tau = 0.8) => {
    if (!ctx || !windLow || !windMid || !rainL || !seaL) return;
    const t = ctx.currentTime;
    const snow = state.kind === 'snow';
    const rain = state.kind === 'rain';
    const w = state.wind;

    // 바람 — 눈은 소리를 흡수한다(×0.55). 비는 공기를 조금 채운다(+).
    const lowBase = (0.010 + w * 0.032 + (rain ? 0.005 : 0)) * (snow ? 0.55 : 1);
    const midBase = (0.0035 + w * 0.030 + (rain ? 0.004 : 0)) * (snow ? 0.5 : 1);
    windLow.gain.gain.setTargetAtTime(lowBase, t, tau);
    windLow.lp.frequency.setTargetAtTime(snow ? 165 : 230, t, tau);
    windMid.gain.gain.setTargetAtTime(midBase, t, tau);
    windMid.bp.frequency.setTargetAtTime(470 + w * 420, t, tau);
    windLowLfo[0]?.gain.setTargetAtTime(lowBase * 0.45, t, tau);
    windLowLfo[1]?.gain.setTargetAtTime(lowBase * 0.3, t, tau);
    windMidLfo[0]?.gain.setTargetAtTime(midBase * 0.55, t, tau);
    windMidLfo[1]?.gain.setTargetAtTime(midBase * 0.35, t, tau);
    midFreqLfo?.gain.setTargetAtTime(60 + w * 190, t, tau);

    // 비
    rainL.gain.gain.setTargetAtTime(rain ? 0.006 + state.rainAmount * 0.030 : 0, t, tau);

    // 파도 — 베이스는 낮게, 밀물 LFO가 크게(밀려오는 감각은 변화량에서 온다)
    const seaBase = state.sea * 0.017;
    seaL.gain.gain.setTargetAtTime(seaBase, t, tau);
    seaLfo[0]?.gain.setTargetAtTime(seaBase * 0.75, t, tau);
    seaLfo[1]?.gain.setTargetAtTime(seaBase * 0.5, t, tau);
  };

  // ---------- 4겹: 생명 ----------

  /** 새 한 마리 — 2~4음. 가끔 저 멀리서 다른 새가 답한다(문답) */
  const birdChirp = (pan: number, pitch: number, vol: number) => {
    if (!ctx || !master) return;
    const t0 = ctx.currentTime;
    const p = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    const out = ctx.createGain();
    out.gain.value = vol;
    if (p) { p.pan.value = pan; out.connect(p).connect(master); } else out.connect(master);
    const notes = 2 + Math.floor(Math.random() * 3);
    let t = t0;
    for (let i = 0; i < notes; i += 1) {
      const o = ctx.createOscillator();
      o.type = 'sine';
      const f = pitch * rnd(0.92, 1.1);
      const dur = rnd(0.08, 0.15);
      o.frequency.setValueAtTime(f, t);
      o.frequency.exponentialRampToValueAtTime(f * rnd(0.72, 0.86), t + dur); // 내려앉는 음 — 지저귐의 문법
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(1, t + 0.015);
      g.gain.exponentialRampToValueAtTime(0.001, t + dur);
      o.connect(g).connect(out);
      o.start(t); o.stop(t + dur + 0.02);
      t += dur + rnd(0.09, 0.22);
    }
  };

  const scheduleBirds = () => {
    if (birdTimer !== null) return;
    const tick = () => {
      const quietDensity = state.life;
      if (
        ctx && ctx.state === 'running' && !muted && quietDensity > 0 &&
        state.time === 'day' && state.kind !== 'rain' && state.kind !== 'snow'
      ) {
        const pan = rnd(-0.8, 0.8);
        const pitch = rnd(2300, 3400);
        birdChirp(pan, pitch, 0.013 * quietDensity);
        // 35% 확률로 반대편에서 답가 — 조금 다른 키로
        if (Math.random() < 0.35) {
          window.setTimeout(() => birdChirp(-pan * rnd(0.7, 1), pitch * rnd(0.85, 1.18), 0.009 * quietDensity), rnd(700, 2100));
        }
      }
      birdTimer = window.setTimeout(tick, rnd(9000, 26000) / Math.max(0.25, state.life || 1));
    };
    birdTimer = window.setTimeout(tick, rnd(2500, 7000));
  };

  /** 풀벌레 — 반송파를 22~27Hz로 게이팅한 찌르르. 밤의 점묘 */
  const cricketChirp = () => {
    if (!ctx || !master) return;
    const t0 = ctx.currentTime;
    const dur = rnd(0.35, 1.05);
    const o = ctx.createOscillator();
    o.type = 'triangle';
    o.frequency.value = rnd(3900, 4700);
    const gate = ctx.createOscillator();
    gate.type = 'square';
    gate.frequency.value = rnd(21, 27);
    const gateG = ctx.createGain();
    gateG.gain.value = 0.5;
    const gateBias = ctx.createGain(); // base 0.5 + square(-1..1)*0.5 → 0..1 게이트
    gateBias.gain.value = 0.5;
    gate.connect(gateG).connect(gateBias.gain);
    const env = ctx.createGain();
    env.gain.setValueAtTime(0, t0);
    env.gain.linearRampToValueAtTime(0.005 * state.life, t0 + 0.06);
    env.gain.setValueAtTime(0.005 * state.life, t0 + dur - 0.08);
    env.gain.linearRampToValueAtTime(0, t0 + dur);
    const p = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    const chain = o.connect(gateBias).connect(env);
    if (p) { p.pan.value = rnd(-0.85, 0.85); chain.connect(p).connect(master); } else chain.connect(master);
    o.start(t0); gate.start(t0);
    o.stop(t0 + dur + 0.02); gate.stop(t0 + dur + 0.02);
  };

  const scheduleCrickets = () => {
    if (cricketTimer !== null) return;
    const tick = () => {
      if (
        ctx && ctx.state === 'running' && !muted && state.life > 0 &&
        state.time === 'night' && state.kind !== 'rain' && state.kind !== 'snow'
      ) {
        cricketChirp();
        if (Math.random() < 0.3) window.setTimeout(cricketChirp, rnd(300, 900)); // 겹쳐 우는 놈
      }
      cricketTimer = window.setTimeout(tick, rnd(2200, 6500) / Math.max(0.25, state.life || 1));
    };
    cricketTimer = window.setTimeout(tick, rnd(1500, 4000));
  };

  // ---------- 2겹: 천둥 (World의 번개 시퀀스가 부른다) ----------
  /** 빛이 먼저, 소리는 늦게 — 거리감은 지연에서 온다 */
  const thunder = () => {
    if (!ensure() || !ctx || !master || muted) return;
    const delay = rnd(1.1, 3.4); // 번쩍임과 우르릉 사이, 그 먼 거리
    const t0 = ctx.currentTime + delay;
    const dur = rnd(2.0, 3.6);
    // 우르릉 — 저역 노이즈, 컷오프가 가라앉으며 멀어진다
    const src = ctx.createBufferSource();
    const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * (dur + 0.2)), ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i += 1) d[i] = Math.random() * 2 - 1;
    src.buffer = buf;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.Q.value = 0.7;
    lp.frequency.setValueAtTime(130, t0);
    lp.frequency.exponentialRampToValueAtTime(52, t0 + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(rnd(0.05, 0.085), t0 + rnd(0.06, 0.18));
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    src.connect(lp).connect(g).connect(master);
    src.start(t0); src.stop(t0 + dur + 0.1);
    // 배 밑을 지나가는 첫 쿵
    const o = ctx.createOscillator();
    o.type = 'sine'; o.frequency.setValueAtTime(44, t0);
    const og = ctx.createGain();
    og.gain.setValueAtTime(0.04, t0);
    og.gain.exponentialRampToValueAtTime(0.001, t0 + 0.7);
    o.connect(og).connect(master);
    o.start(t0); o.stop(t0 + 0.8);
  };

  // ---------- BUILD 168: 타닥타닥 ----------
  /** 장작 팝 — 25~60ms의 밴드패스 버스트. 가끔 두 번 연달아 */
  const cracklePop = () => {
    if (!ctx || !master || muted || fireLevel <= 0.02) return;
    const t0 = ctx.currentTime;
    const dur = 0.025 + Math.random() * 0.035;
    const src = ctx.createBufferSource();
    const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * (dur + 0.01)), ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i += 1) d[i] = Math.random() * 2 - 1;
    src.buffer = buf;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass'; bp.frequency.value = 1500 + Math.random() * 2300; bp.Q.value = 1.2;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.028 * fireLevel * (0.4 + Math.random() * 0.6), t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    src.connect(bp).connect(g).connect(master);
    src.start(t0); src.stop(t0 + dur + 0.02);
  };
  const scheduleCrackle = () => {
    if (crackleTimer !== null) return;
    const tick = () => {
      if (ctx && ctx.state === 'running' && !muted && fireLevel > 0.02) {
        cracklePop();
        if (Math.random() < 0.3) window.setTimeout(cracklePop, 40 + Math.random() * 90); // 타-닥
      }
      crackleTimer = window.setTimeout(tick, (120 + Math.random() * 430) / Math.max(0.3, fireLevel || 1));
    };
    crackleTimer = window.setTimeout(tick, 300);
  };

  // ---------- BUILD 175: 웅얼거림 ----------
  /** 심즈어 — 뜻 없는 3~6음절. 낮고 작게, 혼잣말의 부피로 */
  const mumble = (pitch = 1) => {
    if (!ensure() || !ctx || !master || muted) return;
    let t = ctx.currentTime + 0.02;
    const n = 3 + Math.floor(Math.random() * 4);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 900; lp.Q.value = 0.6;
    const out = ctx.createGain(); out.gain.value = 0.016;
    lp.connect(out).connect(master);
    for (let i = 0; i < n; i += 1) {
      const dur = 0.055 + Math.random() * 0.07;
      const o = ctx.createOscillator();
      o.type = 'triangle';
      const f = (150 + Math.random() * 90) * pitch;
      o.frequency.setValueAtTime(f, t);
      o.frequency.linearRampToValueAtTime(f * (0.9 + Math.random() * 0.25), t + dur);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.8 + Math.random() * 0.2, t + 0.018);
      g.gain.exponentialRampToValueAtTime(0.001, t + dur);
      o.connect(g).connect(lp);
      o.start(t); o.stop(t + dur + 0.02);
      t += dur + 0.02 + Math.random() * 0.05;
    }
  };

  // ---------- BUILD 173: 꼬끼오 ----------
  /** 수탉 — 4음절: 꼬, 끼, 오오오(비브라토), 오(내려앉음). 만화적이지만 이 세계의 만화다 */
  const roosterCrow = (vol = 1) => {
    if (!ensure() || !ctx || !master || muted) return;
    let t = ctx.currentTime + 0.05;
    const out = ctx.createGain();
    out.gain.value = 0.05 * Math.min(1, Math.max(0.15, vol));
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass'; bp.frequency.value = 1150; bp.Q.value = 1.4;
    out.connect(master);
    const syll = (f0: number, f1: number, dur: number, vib = 0) => {
      if (!ctx) return;
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(f0, t);
      o.frequency.exponentialRampToValueAtTime(Math.max(60, f1), t + dur);
      if (vib > 0) {
        const v = ctx.createOscillator(); v.type = 'sine'; v.frequency.value = 9;
        const vg = ctx.createGain(); vg.gain.value = vib;
        v.connect(vg).connect(o.frequency);
        v.start(t); v.stop(t + dur + 0.02);
      }
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(1, t + 0.03);
      g.gain.setValueAtTime(1, t + dur - 0.05);
      g.gain.exponentialRampToValueAtTime(0.001, t + dur);
      o.connect(bp).connect(g).connect(out);
      o.start(t); o.stop(t + dur + 0.02);
      t += dur + 0.045;
    };
    syll(540, 620, 0.13);          // 꼬
    syll(720, 820, 0.11);          // 끼
    syll(980, 1240, 0.4, 55);      // 오오오~
    syll(820, 480, 0.3);           // 오...
  };

  // ---------- BUILD 149: 갈매기 ----------
  /** 끼룩 — 내려앉는 미음(mew). 1~3번, 멀리서. World의 갈매기들이 부른다 */
  const gullCry = () => {
    if (!ctx || ctx.state !== 'running' || !master || muted) return;
    const calls = 1 + Math.floor(Math.random() * 3);
    const pan = rnd(-0.9, 0.9);
    let t = ctx.currentTime + rnd(0, 0.3);
    const p = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    const out = ctx.createGain();
    out.gain.value = rnd(0.006, 0.011) * Math.max(0.3, state.life);
    if (p) { p.pan.value = pan; out.connect(p).connect(master); } else out.connect(master);
    for (let i = 0; i < calls; i += 1) {
      const dur = rnd(0.28, 0.42);
      const o = ctx.createOscillator();
      o.type = 'triangle';
      const f0 = rnd(1050, 1300);
      o.frequency.setValueAtTime(f0, t);
      o.frequency.exponentialRampToValueAtTime(f0 * rnd(0.58, 0.7), t + dur); // 길게 미끄러져 내려앉는다
      const vib = ctx.createOscillator(); // 갈매기 특유의 떨림
      vib.type = 'sine'; vib.frequency.value = rnd(5.5, 7.5);
      const vibG = ctx.createGain(); vibG.gain.value = f0 * 0.025;
      vib.connect(vibG).connect(o.frequency);
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass'; bp.frequency.value = 950; bp.Q.value = 0.9;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(1, t + 0.05);
      g.gain.exponentialRampToValueAtTime(0.001, t + dur);
      o.connect(bp).connect(g).connect(out);
      o.start(t); vib.start(t);
      o.stop(t + dur + 0.02); vib.stop(t + dur + 0.02);
      t += dur + rnd(0.12, 0.3);
    }
  };

  // ---------- BUILD 155: iOS 3중 자물쇠 ----------
  // ① 제스처 종류: 구형 iOS는 touchend/click만 오디오 해제로 인정한다 (touchstart는 무효)
  // ② 무음 스위치: Web Audio는 '벨소리' 채널 — 옆면 스위치가 무음이면 소리가 죽는다.
  //    audioSession='playback'(16.4+) + 무음 <audio> 루프(구형)로 '미디어' 채널로 승격
  // ③ 빈 버퍼 의식: 제스처 콜스택 안에서 무음 버퍼를 한 번 재생해야 진짜로 깨어난다
  let silentEl: HTMLAudioElement | null = null;
  const SILENT_WAV = 'data:audio/wav;base64,UklGRsQPAABXQVZFZm10IBAAAAABAAEAQB8AAIA+AAACABAAZGF0YaAPAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
  const blipEmpty = () => {
    if (!ctx) return;
    try {
      const b = ctx.createBuffer(1, 1, 22050);
      const s = ctx.createBufferSource();
      s.buffer = b; s.connect(ctx.destination); s.start(0);
    } catch { /* 의식은 실패해도 조용히 */ }
  };
  const wake = () => {
    try { // ② 세션 승격 — iOS 16.4+
      const nav = navigator as unknown as { audioSession?: { type: string } };
      if (nav.audioSession) nav.audioSession.type = 'playback';
    } catch { /* 미지원 브라우저 */ }
    if (!silentEl) { // ② 구형 커버 — 무음 루프가 세션을 미디어로 끌어올린다
      try {
        silentEl = new Audio(SILENT_WAV);
        silentEl.loop = true;
        (silentEl as unknown as { playsInline: boolean }).playsInline = true;
      } catch { silentEl = null; }
    }
    if (silentEl && silentEl.paused) void silentEl.play().catch(() => { /* 다음 제스처에 재시도 */ });
    footsteps.unlock(); // 발소리도 같은 열쇠로
    ensure();
    blipEmpty(); // ③
  };
  const installGestureUnlock = () => {
    if (listenersInstalled) return;
    listenersInstalled = true;
    // ①: touchend·click·pointerup이 진짜 열쇠. 나머지는 조기 시도용
    ['touchend', 'click', 'pointerup', 'pointerdown', 'touchstart', 'keydown'].forEach((ev) =>
      window.addEventListener(ev, wake, { passive: true }));
    // 백그라운드 갔다 오면 iOS가 컨텍스트를 정지시킨다 — 돌아올 때 되살린다
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden && ctx && ctx.state !== 'running') void ctx.resume();
    });
  };

  return {
    /** spec → 소리. World가 spec.weather/ambience 변화마다 부른다 */
    apply(next: Partial<AmbienceState>) {
      state = { ...state, ...next };
      installGestureUnlock();
      if (ctx) applyTargets();
    },
    thunder,
    gullCry,
    roosterCrow,
    mumble,
    /** 모닥불 근접도 0~1 — 잉걸 게인과 타닥임 밀도가 함께 따른다 */
    setFire(level: number) {
      fireLevel = Math.min(1, Math.max(0, level));
      if (ctx && fireGain) fireGain.gain.setTargetAtTime(fireLevel * 0.011, ctx.currentTime, 0.4);
    },
    unlock() { installGestureUnlock(); wake(); },
    setMuted(m: boolean) {
      muted = m;
      if (ctx && master) master.gain.setTargetAtTime(m ? 0 : 1, ctx.currentTime, 0.25);
    },
    muted: () => muted,
  };
}

// 싱글턴 — World가 상태를 밀고, App/에디터가 잠금해제·음소거를 관리한다 (footsteps와 같은 문법)
export const ambience = createAmbience();
