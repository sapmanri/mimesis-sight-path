import { Canvas } from '@react-three/fiber';
import { useMemo, useState } from 'react';
import { jejuScenes } from './data/jeju';
import { World } from './scene/World';
import { StoryCard } from './components/StoryCard';
import { ProgressNav } from './components/ProgressNav';

export default function App() {
  const [activeIndex, setActiveIndex] = useState(0);
  const activeScene = useMemo(() => jejuScenes[activeIndex], [activeIndex]);

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">MIMESIS Sight Path 0.1</p>
          <h1>제주, 시선을 따라 걷다</h1>
        </div>
        <p className="counter">{String(activeIndex + 1).padStart(2, '0')} / {jejuScenes.length}</p>
      </header>

      <section className="viewport-card">
        <Canvas camera={{ position: [0, 1.25, 4.8], fov: 42 }} dpr={[1, 2]}>
          <World activeIndex={activeIndex} scenes={jejuScenes} />
        </Canvas>
        <StoryCard scene={activeScene} />
        <ProgressNav scenes={jejuScenes} activeIndex={activeIndex} onChange={setActiveIndex} />
      </section>

      <footer className="hint">스크롤 또는 점을 눌러 작은 빛의 시선을 따라가세요.</footer>
    </main>
  );
}
