// ---------- BUILD 094: FOOTSTEPS ----------
// 발자국 소리. 임시지만 에셋 없이 — 웹오디오로 즉석 합성한다.
// 모래 길: 낮은 톤의 무게(thud) + 짧은 모래 스치는 소리(shhk).
// 브라우저 자동재생 정책: 첫 사용자 제스처 후에만 소리가 난다 (resume 시도).

export type Footsteps = {
  /** intensity 0(살금)~1(질주). 발이 땅에 닿는 순간 호출 */
  step: (intensity: number) => void;
  /** 사용자 제스처 핸들러 안에서 호출 — 모바일 오디오 잠금 해제 */
  unlock: () => void;
  setMuted: (m: boolean) => void;
  muted: () => boolean;
  setVolume: (v: number) => void;
};

export function createFootsteps(): Footsteps {
  let ctx: AudioContext | null = null;
  let noiseBuf: AudioBuffer | null = null;
  let muted = false;
  let volume = 1;

  const ensure = () => {
    if (!ctx) {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      // 화이트노이즈 0.25s 버퍼 (모래 질감의 원료)
      noiseBuf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.25), ctx.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i += 1) d[i] = Math.random() * 2 - 1;
    }
    if (ctx.state !== 'running') void ctx.resume(); // iOS 'interrupted' 포함
    return ctx.state === 'running';
  };

  return {
    unlock() {
      ensure();
      // BUILD 155: 빈 버퍼 의식 — 제스처 안에서 한 번 울려야 iOS가 진짜로 깬다
      if (ctx) {
        try {
          const b = ctx.createBuffer(1, 1, 22050);
          const s = ctx.createBufferSource();
          s.buffer = b; s.connect(ctx.destination); s.start(0);
        } catch { /* 조용히 */ }
      }
    },
    setMuted(m) { muted = m; },
    muted: () => muted,
    setVolume(v) { volume = Math.min(1, Math.max(0, v)); },
    step(intensity: number) {
      if (muted) return;
      if (!ensure() || !ctx || !noiseBuf) return;
      const t = ctx.currentTime;
      const k = Math.min(1, Math.max(0, intensity));
      const master = ctx.createGain();
      master.gain.value = (0.019 + k * 0.034) * volume; // BUILD 177: 2차 감량 — 발소리는 배경의 배경
      master.connect(ctx.destination);

      // 1) 무게: 사인 thud (주파수 살짝 랜덤 — 걸음마다 같은 소리는 없다)
      const osc = ctx.createOscillator();
      const og = ctx.createGain();
      osc.frequency.value = 82 + Math.random() * 30 + k * 25;
      og.gain.setValueAtTime(0.9, t);
      og.gain.exponentialRampToValueAtTime(0.001, t + 0.09 + k * 0.03);
      osc.connect(og).connect(master);
      osc.start(t);
      osc.stop(t + 0.14);

      // 2) 모래: 밴드패스 노이즈 스침
      const src = ctx.createBufferSource();
      src.buffer = noiseBuf;
      src.playbackRate.value = 0.9 + Math.random() * 0.3;
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 900 + Math.random() * 500 + k * 400;
      bp.Q.value = 0.8;
      const ng = ctx.createGain();
      ng.gain.setValueAtTime(0.5 + k * 0.35, t);
      ng.gain.exponentialRampToValueAtTime(0.001, t + 0.07 + k * 0.05);
      src.connect(bp).connect(ng).connect(master);
      src.start(t, Math.random() * 0.1);
      src.stop(t + 0.16);
    },
  };
}

// BUILD 095: 싱글턴 — World가 밟고, App이 잠금해제/음소거를 관리한다
export const footsteps = createFootsteps();
