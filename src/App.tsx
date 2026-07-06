import { Canvas } from '@react-three/fiber';
import { useEffect, useRef, useState } from 'react';
import { jejuScenes } from './data/jeju';
import { World } from './scene/World';
import { StoryCard } from './components/StoryCard';
import { ProgressNav } from './components/ProgressNav';
import { TouchTrail } from './components/TouchTrail';
import { footsteps } from './scene/footsteps';
import { ambience } from './audio/ambience';
import { compileScenes } from './engine/blueprint';
import { JEJU_SPEC, type WorldSpec } from './engine/worldSpec';
import './photo-depth-road.css';

const AUTO_RESUME_MS = 12000; // BUILD 101: 탭으로 머문 뒤 12초면 다시 저절로 걷는다
const BUILD_LABEL = 'v0.56.2 · THE UNSINKING · BUILD 154';

export default function App() {
  const [activeIndex, setActiveIndex] = useState(0);
  const [mode, setMode] = useState<'auto' | 'manual'>('auto');
  const [muted, setMuted] = useState(false);
  const [riding, setRiding] = useState(false); // BUILD 136: 구름 탑승
  const [stroll, setStroll] = useState(false); // BUILD 150: 무한 산책 — 카드도 도착도 없이, 그냥 걷는다
  // BUILD 099: 카드는 도착의 것 — 걷는 동안엔 접히고, 머무를 때 펼쳐진다
  const [cardAt, setCardAt] = useState<number | null>(0);
  // BUILD 096: 에디터 문서로 열기 (?draft=1) — 에디터가 지은 세계를 그대로 걷는다
  const [draft] = useState(() => {
    if (!new URLSearchParams(window.location.search).has('draft')) return null;
    try {
      const d = JSON.parse(localStorage.getItem('mimesis:world-draft:v1') ?? '');
      if (d?.blueprints?.length && d?.spec) {
        return { scenes: compileScenes(d.blueprints), spec: d.spec as WorldSpec, props: d.props ?? [] };
      }
    } catch { /* 기본 세계로 */ }
    return null;
  });
  const scenes = draft?.scenes ?? jejuScenes;
  const [spec] = useState<WorldSpec>(draft?.spec ?? JEJU_SPEC);
  const lastMoveAt = useRef(0);
  const lastManualAt = useRef(0);

  // BUILD 095: 모바일 오디오 잠금 해제 — 어떤 제스처든 첫 접촉에서 (제스처 콜스택 안에서만 유효)
  useEffect(() => {
    const unlock = () => { footsteps.unlock(); ambience.unlock(); };
    window.addEventListener('pointerdown', unlock, { passive: true });
    window.addEventListener('touchstart', unlock, { passive: true });
    window.addEventListener('keydown', unlock);
    return () => {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('touchstart', unlock);
      window.removeEventListener('keydown', unlock);
    };
  }, []);

  // BUILD 100: 길 탭 = 그 기억으로 걷기 (절대 인덱스, 쿨다운 없음 — 의도가 명확한 입력)
  const goTo = (index: number) => {
    lastManualAt.current = Date.now();
    lastMoveAt.current = Date.now();
    setMode('manual');
    setActiveIndex(Math.max(0, Math.min(scenes.length - 1, index)));
  };

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
        return Math.max(0, Math.min(scenes.length - 1, next));
      });
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'ArrowDown' || event.key === 'PageDown') move(1, 'manual');
      if (event.key === 'ArrowUp' || event.key === 'PageUp') move(-1, 'manual');
    };

    window.addEventListener('keydown', onKeyDown);

    return () => {
      window.removeEventListener('keydown', onKeyDown);
    };
  }, []);

  useEffect(() => {
    if (mode !== 'auto' || stroll) return; // BUILD 150: 산책 중엔 카드 시계가 멈춘다

    const timer = window.setTimeout(() => {
      setActiveIndex((current) => {
        if (current >= scenes.length - 1) return 0;
        return current + 1;
      });
    }, scenes[activeIndex].dwellMs ?? 9000);

    return () => window.clearTimeout(timer);
  }, [activeIndex, mode, stroll]);

  useEffect(() => {
    if (mode !== 'manual') return;

    const timer = window.setInterval(() => {
      if (Date.now() - lastManualAt.current > AUTO_RESUME_MS) setMode('auto');
    }, 1000);

    return () => window.clearInterval(timer);
  }, [mode]);

  const handleNavChange = (index: number) => {
    lastManualAt.current = Date.now();
    setMode('manual');
    setActiveIndex(index);
  };

  return (
    <main className="app-shell world-core-shell">
      <header className="topbar road-only-topbar">
        <div>
          <p className="eyebrow">MIMESIS · OBSERVATION NO.001</p>
          <h1>JEJU, 시선을 따라 걷다</h1>
        </div>
        <div className="top-status">
          <p className="counter">{String(activeIndex + 1).padStart(2, '0')} / {scenes.length}</p>
        </div>
      </header>

      <section className="viewport-card world-core-viewport">
        <Canvas
          className="world-canvas"
          camera={{ position: [0, 3.1, 8.4], fov: 42 }}
          dpr={[1, 2]}
          shadows
        >
          <World
            activeIndex={activeIndex}
            scenes={scenes}
            mode={mode}
            spec={spec}
            onArrive={(i) => setCardAt(i)}
            onDepart={() => setCardAt(null)}
            onPathTap={goTo}
            props={draft?.props}
            riding={riding}
            stroll={stroll}
          />
        </Canvas>
        <div className="atmosphere-grain" aria-hidden="true" />
        <div className="atmosphere-vignette" aria-hidden="true" />
        <ProgressNav scenes={scenes} activeIndex={activeIndex} onChange={handleNavChange} />
        <StoryCard scene={cardAt !== null ? scenes[cardAt] : null} mode={mode} />
        <div className="float-controls">
          <button
            type="button"
            className="icon-btn"
            aria-label={muted ? '소리 켜기' : '소리 끄기'}
            onClick={() => { footsteps.unlock(); ambience.unlock(); footsteps.setMuted(!muted); ambience.setMuted(!muted); setMuted(!muted); }}
          >{muted ? '🔇' : '🔊'}</button>
          <button
            type="button"
            className="icon-btn"
            aria-label={stroll ? '산책 끝내기' : '무한 산책'}
            title={stroll ? '산책 끝내기 — 기억 앞에 다시 멈춘다' : '무한 산책 — 도착 없이 그냥 걷는다'}
            onClick={() => { setStroll((v) => { const nv = !v; if (nv) setCardAt(null); return nv; }); }}
          >{stroll ? '🧍' : '♾️'}</button>
          {spec.walker?.mount?.enabled && (
            <button
              type="button"
              className="icon-btn"
              aria-label={riding ? '구름에서 내리기' : '구름 타기'}
              onClick={() => setRiding((v) => !v)}
            >{riding ? '🚶' : '☁️'}</button>
          )}
        </div>
        <div className="build-badge">{BUILD_LABEL}</div>
      </section>
      <TouchTrail />
    </main>
  );
}
