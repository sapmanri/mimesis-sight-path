import { useEffect, useRef, useState } from 'react';

export type ByeoliJournalEntry = { id: number; text: string; at: number };

export function ObservationJournal({ entries }: { entries: ByeoliJournalEntry[] }) {
  const newest = entries[entries.length - 1];
  const [typed, setTyped] = useState(newest?.text ?? '별이는 천천히 주변을 살피며 걷고 있다.');
  const audioRef = useRef<AudioContext | null>(null);

  useEffect(() => {
    if (!newest) return;
    setTyped('');
    let i = 0;
    const timer = window.setInterval(() => {
      i += 1;
      setTyped(newest.text.slice(0, i));
      if (i % 3 === 0) {
        try {
          const AudioCtx = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
          if (AudioCtx) {
            const ctx = audioRef.current ?? new AudioCtx();
            audioRef.current = ctx;
            const len = Math.max(1, Math.floor(ctx.sampleRate * 0.025));
            const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
            const data = buffer.getChannelData(0);
            for (let n = 0; n < len; n += 1) data[n] = (Math.random() * 2 - 1) * (1 - n / len);
            const src = ctx.createBufferSource();
            const filter = ctx.createBiquadFilter();
            const gain = ctx.createGain();
            filter.type = 'bandpass';
            filter.frequency.value = 1450;
            filter.Q.value = 0.7;
            gain.gain.value = 0.018;
            src.buffer = buffer;
            src.connect(filter);
            filter.connect(gain);
            gain.connect(ctx.destination);
            src.start();
          }
        } catch {
          // Browser autoplay policy can block audio until the user interacts.
        }
      }
      if (i >= newest.text.length) window.clearInterval(timer);
    }, 42);
    return () => window.clearInterval(timer);
  }, [newest?.id, newest?.text]);

  const visible = entries.slice(-4);
  const date = new Intl.DateTimeFormat('ko-KR', { month: 'long', day: 'numeric' }).format(new Date());

  return (
    <div style={{
      position: 'fixed', left: 18, bottom: 48, zIndex: 6,
      width: 'min(360px, calc(100vw - 36px))', maxHeight: '42vh', overflow: 'hidden',
      padding: '18px 20px 17px 28px', borderRadius: 10,
      color: '#473f33', background: 'rgba(249,245,232,0.93)',
      border: '1px solid rgba(115,94,60,0.24)', boxShadow: '0 12px 34px rgba(0,0,0,0.2)',
      backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)', pointerEvents: 'none',
      backgroundImage: 'repeating-linear-gradient(to bottom, transparent 0, transparent 27px, rgba(113,139,159,0.16) 28px)',
      fontFamily: "'Nanum Pen Script', 'Apple SD Gothic Neo', cursive",
    }}>
      <div style={{ position: 'absolute', left: 15, top: 0, bottom: 0, width: 1, background: 'rgba(201,99,99,0.25)' }} />
      <div style={{ fontSize: 11, letterSpacing: 1.4, color: '#8a7658', marginBottom: 5 }}>{date}</div>
      <div style={{ fontSize: 17, fontWeight: 700, marginBottom: 10, letterSpacing: 0.4 }}>별이의 관찰일기</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
        {visible.map((entry, idx) => {
          const isLatest = entry.id === newest?.id;
          const ageRank = visible.length - 1 - idx;
          const opacity = isLatest ? 1 : Math.max(0.22, 0.7 - ageRank * 0.18);
          return (
            <div key={entry.id} style={{ fontSize: 15.5, lineHeight: '28px', opacity, transition: 'opacity 1.2s ease' }}>
              {isLatest ? typed : entry.text}
              {isLatest && typed.length < entry.text.length ? <span style={{ opacity: 0.45 }}>│</span> : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
