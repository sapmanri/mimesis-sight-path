import { useEffect, useRef, useState } from 'react';
import type { ObservationScene } from '../data/jeju';

type SoundscapeProps = {
  scene: ObservationScene;
  mode: 'auto' | 'manual';
};

export function Soundscape({ scene, mode }: SoundscapeProps) {
  const [enabled, setEnabled] = useState(false);
  const audioRef = useRef<AudioContext | null>(null);
  const droneRef = useRef<OscillatorNode | null>(null);
  const lfoRef = useRef<OscillatorNode | null>(null);
  const gainRef = useRef<GainNode | null>(null);
  const filterRef = useRef<BiquadFilterNode | null>(null);

  useEffect(() => {
    if (!enabled) return;

    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    const context = new AudioContextClass();
    const gain = context.createGain();
    const filter = context.createBiquadFilter();
    const drone = context.createOscillator();
    const lfo = context.createOscillator();
    const lfoGain = context.createGain();

    drone.type = 'sine';
    drone.frequency.value = scene.soundTone;
    lfo.type = 'sine';
    lfo.frequency.value = 0.045;
    lfoGain.gain.value = 4;
    filter.type = 'lowpass';
    filter.frequency.value = mode === 'auto' ? 520 : 420;
    gain.gain.value = 0.018;

    lfo.connect(lfoGain);
    lfoGain.connect(drone.frequency);
    drone.connect(filter);
    filter.connect(gain);
    gain.connect(context.destination);

    drone.start();
    lfo.start();

    audioRef.current = context;
    droneRef.current = drone;
    lfoRef.current = lfo;
    gainRef.current = gain;
    filterRef.current = filter;

    return () => {
      drone.stop();
      lfo.stop();
      context.close();
    };
  }, [enabled]);

  useEffect(() => {
    const context = audioRef.current;
    const drone = droneRef.current;
    const gain = gainRef.current;
    const filter = filterRef.current;

    if (!context || !drone || !gain || !filter) return;

    const now = context.currentTime;
    drone.frequency.cancelScheduledValues(now);
    drone.frequency.linearRampToValueAtTime(scene.soundTone, now + 1.8);
    filter.frequency.cancelScheduledValues(now);
    filter.frequency.linearRampToValueAtTime(mode === 'auto' ? 520 : 390, now + 1.4);
    gain.gain.cancelScheduledValues(now);
    gain.gain.linearRampToValueAtTime(mode === 'auto' ? 0.02 : 0.012, now + 1);
  }, [scene, mode]);

  return (
    <button className="sound-toggle" onClick={() => setEnabled((current) => !current)}>
      {enabled ? 'SOUND ON' : 'SOUND OFF'}
    </button>
  );
}
