import { Canvas } from '@react-three/fiber';
import { useEffect, useMemo, useRef, useState } from 'react';
import { jejuScenes } from './data/jeju';
import { World } from './scene/World';
import { StoryCard } from './components/StoryCard';
import { ProgressNav } from './components/ProgressNav';

export default function App() {
  const [activeIndex, setActiveIndex] = useState(0);
  const activeScene = useMemo(() => jejuScenes[activeIndex], [activeIndex]);
  const lastMoveAt = useRef(0);

  useEffect(() => {
    const move = (direction: 1 | -1) => {
      const now = Date.now();
      if (now - lastMoveAt.current < 620) return;
      lastMoveAt.current = now;
      setActiveIndex((current) => {
        const next = current + direction;
        return Math.max(0, Math.min(jejuScenes.length - 1, next));
      });
    };

    const onWheel = (event: WheelEvent) => {
      if (Math.abs(event.deltaY) < 14) return;
      move(event.deltaY > 0 ? 1 : -1);
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'ArrowDown' || event.key === 'PageDown') move(1);
      if (event.key === 'ArrowUp' || event.key === 'PageUp') move(-1);
    };

    window.addEventListener('wheel', onWheel, { passive: true });
    window.addEventListener('keydown', onKeyDown);

    return () => {
      window.removeEventListener('wheel', onWheel);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, []);

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">MIMESIS · OBSERVATION NO.001</p>
          <h1>JEJU, 시선을 따라 걷다</h1>
        </div>
        <p className="counter">{String(activeIndex + 1).padStart(2, '0')} / {jejuScenes.length}</p>
      </header>

      <section className="viewport-card">
        <Canvas camera={{ position: [0, 1.05, 3.25], fov: 38 }} dpr={[1, 2]}>
          <World activeIndex={activeIndex} scenes={jejuScenes} />
        </Canvas>
        <StoryCard scene={activeScene} />
        <ProgressNav scenes={jejuScenes} activeIndex={activeIndex} onChange={setActiveIndex} />
      </section>

      <footer className="hint">빛이 멈춘 곳에서 문장이 열린다.</footer>
    </main>
  );
}
