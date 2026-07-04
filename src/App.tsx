import { Canvas } from '@react-three/fiber';
import { useEffect, useRef, useState } from 'react';
import { jejuScenes } from './data/jeju';
import { World } from './scene/World';
import { ParallaxLayers } from './components/ParallaxLayers';
import './photo-depth-road.css';

const AUTO_RESUME_MS = 18000;
const BUILD_LABEL = 'v0.3.4 · CONTINUOUS WALK · BUILD 059';

export default function App() {
  const [activeIndex, setActiveIndex] = useState(0);
  const [mode, setMode] = useState<'auto' | 'manual'>('auto');
  const lastMoveAt = useRef(0);
  const lastManualAt = useRef(0);

  useEffect(() => {
    const move = (direction: 1 | -1, input: 'auto' | 'manual' = 'manual') => {
      const now = Date.now();
      if (now - lastMoveAt.current < 1400) return;
      lastMoveAt.current = now;

      if (input === 'manual') {
        lastManualAt.current = now;
        setMode('manual');
      }

      setActiveIndex((current) => {
        const next = current + direction;
        return Math.max(0, Math.min(jejuScenes.length - 1, next));
      });
    };

    const onWheel = (event: WheelEvent) => {
      if (Math.abs(event.deltaY) < 18) return;
      move(event.deltaY > 0 ? 1 : -1, 'manual');
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'ArrowDown' || event.key === 'PageDown') move(1, 'manual');
      if (event.key === 'ArrowUp' || event.key === 'PageUp') move(-1, 'manual');
    };

    window.addEventListener('wheel', onWheel, { passive: true });
    window.addEventListener('keydown', onKeyDown);

    return () => {
      window.removeEventListener('wheel', onWheel);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, []);

  useEffect(() => {
    if (mode !== 'auto') return;

    const timer = window.setTimeout(() => {
      setActiveIndex((current) => {
        if (current >= jejuScenes.length - 1) return 0;
        return current + 1;
      });
    }, 9000);

    return () => window.clearTimeout(timer);
  }, [activeIndex, mode]);

  useEffect(() => {
    if (mode !== 'manual') return;

    const timer = window.setInterval(() => {
      if (Date.now() - lastManualAt.current > AUTO_RESUME_MS) setMode('auto');
    }, 1000);

    return () => window.clearInterval(timer);
  }, [mode]);

  return (
    <main className="app-shell road-only-shell">
      <header className="topbar road-only-topbar">
        <div>
          <p className="eyebrow">MIMESIS · OBSERVATION NO.001 · {BUILD_LABEL}</p>
          <h1>JEJU, 시선을 따라 걷다</h1>
        </div>
        <div className="top-status">
          <p className="counter">{String(activeIndex + 1).padStart(2, '0')} / {jejuScenes.length}</p>
        </div>
      </header>

      <section className="viewport-card road-only-viewport">
        <ParallaxLayers activeIndex={activeIndex} scene={jejuScenes[activeIndex]} />
        <Canvas className="world-canvas" camera={{ position: [0, 1.35, 4.8], fov: 40 }} dpr={[1, 2]} gl={{ alpha: true }}>
          <World activeIndex={activeIndex} scenes={jejuScenes} mode={mode} />
        </Canvas>
        <div className="build-badge">{BUILD_LABEL}</div>
      </section>
    </main>
  );
}
