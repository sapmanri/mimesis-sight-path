// ---------- BUILD 223: 행성의 소리 — 스노우글로브의 켜 ----------
// 본토(ambience)는 "자연 속에 있는 소리", 여기는 "작은 세계를 내려다보는 소리".
// 폽(깃발이 솟는 통), 쇽(들어가는 슝), 풍경 한 방울, 그리고 오르골 낟알 —
// 30초~1분에 한 번 펜타토닉 음 하나가 톡. 멜로디가 아니라 낟알이다.
// 전부 합성, 외부 에셋 없음 (ambience와 같은 헌법).

function createPlanetSound() {
  let ctx: AudioContext | null = null;
  let master: GainNode | null = null;
  let muted = false;
  let grainTimer: number | null = null;
  let unlockInstalled = false;

  const ensure = (): boolean => {
    if (ctx) return true;
    try {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = muted ? 0 : 1;
      master.connect(ctx.destination);
    } catch { return false; }
    return true;
  };

  const installGestureUnlock = () => {
    if (unlockInstalled) return;
    unlockInstalled = true;
    const wake = () => { if (ensure() && ctx && ctx.state !== 'running') void ctx.resume(); };
    ['pointerdown', 'touchstart', 'keydown'].forEach((ev) => window.addEventListener(ev, wake, { once: false, passive: true }));
  };

  const rnd = (a: number, b: number) => a + Math.random() * (b - a);

  const tone = (freq: number, f2: number | null, t0: number, dur: number, vol: number, pan = 0, type: OscillatorType = 'sine', glideTo?: number) => {
    if (!ctx || !master) return;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t0);
    if (glideTo) o.frequency.exponentialRampToValueAtTime(Math.max(20, glideTo), t0 + dur * 0.85);
    const env = ctx.createGain();
    env.gain.setValueAtTime(0, t0);
    env.gain.linearRampToValueAtTime(vol, t0 + 0.012);
    env.gain.exponentialRampToValueAtTime(0.0004, t0 + dur);
    const p = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    const chain = o.connect(env);
    if (p) { p.pan.value = pan; chain.connect(p).connect(master); } else chain.connect(master);
    o.start(t0); o.stop(t0 + dur + 0.03);
    if (f2) tone(f2, null, t0, dur * 0.7, vol * 0.22, pan, type);
  };

  return {
    unlock() { installGestureUnlock(); if (ensure() && ctx && ctx.state !== 'running') void ctx.resume(); },
    setMuted(m: boolean) {
      muted = m;
      if (ctx && master) master.gain.setTargetAtTime(m ? 0 : 1, ctx.currentTime, 0.2);
    },

    /** 깃발의 폽(위로 통) / 쇽(아래로 슝) */
    /** BUILD 245: 찰칵 — 스레드에 사진 올릴 때 (짧은 셔터) */
    shutter() {
      installGestureUnlock();
      if (!ensure() || !ctx || muted) return;
      const t0 = ctx.currentTime;
      tone(2600, null, t0, 0.025, 0.05, 0, 'square', 1400);       // 찰-
      window.setTimeout(() => { if (ctx) tone(1800, null, ctx.currentTime, 0.03, 0.045, 0, 'square', 900); }, 40); // -칵
    },
    /** BUILD 245: 댓글 알림 — 물방울 같은 짧은 팝 */
    comment() {
      installGestureUnlock();
      if (!ensure() || !ctx || muted) return;
      const t0 = ctx.currentTime;
      tone(880, null, t0, 0.12, 0.03, rnd(-0.2, 0.2), 'sine', 1320);
    },

    pop(up: boolean) {
      installGestureUnlock();
      if (!ensure() || !ctx || muted) return;
      const t0 = ctx.currentTime;
      if (up) {
        tone(340, null, t0, 0.16, 0.05, rnd(-0.3, 0.3), 'sine', 680); // 통—
        window.setTimeout(() => { if (ctx) tone(1318, 1318 * 2.76, ctx.currentTime, 1.3, 0.016, rnd(-0.4, 0.4)); }, 130); // 풍경 한 방울
      } else {
        tone(620, null, t0, 0.13, 0.032, rnd(-0.3, 0.3), 'sine', 235); // 슝(쇽)
      }
    },

    /** 오르골 낟알 시작/정지 — 24~70초에 한 알 */
    startGrains() {
      installGestureUnlock();
      if (grainTimer !== null) return;
      // A3 펜타토닉 언저리: A3 C4 D4 E4 G4 A4 C5
      const SCALE = [220, 261.63, 293.66, 329.63, 392, 440, 523.25];
      const tick = () => {
        if (ensure() && ctx && ctx.state === 'running' && !muted) {
          const f = SCALE[Math.floor(Math.random() * SCALE.length)] * rnd(0.997, 1.003);
          tone(f, f * 3.42, ctx.currentTime, rnd(1.5, 2.2), 0.02, rnd(-0.55, 0.55));
          if (Math.random() < 0.18) { // 아주 가끔, 5도 위 답음 하나
            window.setTimeout(() => { if (ctx) tone(f * 1.5, f * 1.5 * 3.42, ctx.currentTime, 1.6, 0.013, rnd(-0.5, 0.5)); }, rnd(500, 1200));
          }
        }
        grainTimer = window.setTimeout(tick, rnd(24000, 70000));
      };
      grainTimer = window.setTimeout(tick, rnd(9000, 20000));
    },
    stopGrains() {
      if (grainTimer !== null) { window.clearTimeout(grainTimer); grainTimer = null; }
    },
  };
}

// 싱글턴 — ambience·footsteps와 같은 문법
export const planetSound = createPlanetSound();
