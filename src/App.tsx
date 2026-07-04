import { Canvas } from '@react-three/fiber';
import { useEffect, useMemo, useRef, useState } from 'react';
import { jejuScenes } from './data/jeju';
import { World } from './scene/World';
import { StoryCard } from './components/StoryCard';
import { ProgressNav } from './components/ProgressNav';
import { ParallaxLayers } from './components/ParallaxLayers';
import { Soundscape } from './audio/Soundscape';

const AUTO_RESUME_MS = 11000;
const BUILD_LABEL = 'v0.2.1 · PARALLAX ROAD · BUILD 052';

export default function App() {
  const [activeIndex, setActiveIndex] = useState(0);
  const [mode, setMode] = useState<'auto' | 'manual'>('auto');
  const activeScene = useMemo(() => jejuScenes[activeIndex], [activeIndex]);
  const lastMoveAt = useRef(0);
  const lastManualAt = useRef(0);

  useEffect(() => {
    const move = (direction: 1 | -1, input: 'auto' | 'manual' = 'manual') => {
      const now = Date.now();
      if (now - lastMoveAt.current < 620) return;
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
      if (Math.abs(event.deltaY) < 14) return;
      move(event.deltaY > 0 ? 1 : -1, 'manual');
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'ArrowDown' || event.key === 'PageDown') move(1, 'manual');
      if (event.key === 'ArrowUp' || event.key === 'PageUp') move(-1, 'manual');
      if (event.key === ' ') setMode((current) => (current === 'auto' ? 'manual' : 'auto'));
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
    }, activeScene.dwellMs);

    return () => window.clearTimeout(timer);
  }, [activeIndex, activeScene.dwellMs, mode]);

  useEffect(() => {
    if (mode !== 'manual') return;

    const timer = window.setInterval(() => {
      if (Date.now() - lastManualAt.current > AUTO_RESUME_MS) {
        setMode('auto');
      }
    }, 1000);

    return () => window.clearInterval(timer);
  }, [mode]);

  const setSceneManually = (index: number) => {
    lastManualAt.current = Date.now();
    setMode('manual');
    setActiveIndex(index);
  };

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">MIMESIS · OBSERVATION NO.001 · {BUILD_LABEL}</p>
          <h1>JEJU, 시선을 따라 걷다</h1>
        </div>
        <div className="top-status">
          <p className="counter">{String(activeIndex + 1).padStart(2, '0')} / {jejuScenes.length}</p>
          <button className="mode-toggle" onClick={() => setMode(mode === 'auto' ? 'manual' : 'auto')}>
            {mode === 'auto' ? 'AUTO' : 'MANUAL'}
          </button>
        </div>
      </header>

      <section className="viewport-card">
        <ParallaxLayers activeIndex={activeIndex} scene={activeScene} />
        <Canvas className="world-canvas" camera={{ position: [0, 1.05, 3.25], fov: 38 }} dpr={[1, 2]} gl={{ alpha: true }}>
          <World activeIndex={activeIndex} scenes={jejuScenes} mode={mode} />
        </Canvas>
        <Soundscape scene={activeScene} mode={mode} />
        <StoryCard scene={activeScene} mode={mode} />
        <ProgressNav scenes={jejuScenes} activeIndex={activeIndex} onChange={setSceneManually} />
        <div className="build-badge">{BUILD_LABEL}</div>
      </section>

      <footer className="hint">{mode === 'auto' ? '이 장면은 스스로 머무를 시간을 정합니다.' : '잠시 뒤 다시 자동 호흡으로 돌아갑니다.'}</footer>
    </main>
  );
}
