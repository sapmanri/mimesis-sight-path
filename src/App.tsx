import { Canvas } from '@react-three/fiber';
import { useEffect, useRef, useState } from 'react';
import { jejuScenes } from './data/jeju';
import { World } from './scene/World';
import { PlanetWorld } from './scene/PlanetWorld';
import { walkerCount } from './engine/worldCore';
import { DEFAULT_PLANET_SPEC, loadPlanetDraft, savePlanetDraft, type PlanetSpec, type PlanetMemory } from './scene/planetSpec';

// ---------- BUILD 207: 행성 에디터 — 다이얼 한 줄 ----------
function Dial({ label, value, min, max, step, onChange, fmt }: { label: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void; fmt?: (v: number) => string }) {
  return (
    <label style={{ display: 'block', margin: '7px 0', fontSize: 11, color: '#cfc9bb' }}>
      <span style={{ display: 'flex', justifyContent: 'space-between' }}>
        <span>{label}</span>
        <span style={{ color: '#d8b26e' }}>{fmt ? fmt(value) : value}</span>
      </span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} style={{ width: '100%' }} />
    </label>
  );
}
const PANEL_BTN: React.CSSProperties = {
  flex: 1, padding: '6px 4px', fontSize: 11, borderRadius: 8, cursor: 'pointer',
  border: '1px solid rgba(216,178,110,0.45)', background: 'rgba(216,178,110,0.12)', color: '#e8dcc2',
};
import { StoryCard } from './components/StoryCard';
import { ProgressNav } from './components/ProgressNav';
import { TouchTrail } from './components/TouchTrail';
import { footsteps } from './scene/footsteps';
import { ambience } from './audio/ambience';
import { compileScenes } from './engine/blueprint';
import { JEJU_SPEC, type WorldSpec } from './engine/worldSpec';
import './photo-depth-road.css';

const AUTO_RESUME_MS = 12000; // BUILD 101: 탭으로 머문 뒤 12초면 다시 저절로 걷는다
const BUILD_LABEL = 'v1.0.1 · SHE WALKS · BUILD 208';

export default function App() {
  const [activeIndex, setActiveIndex] = useState(0);
  const [mode, setMode] = useState<'auto' | 'manual'>('auto');
  const [muted, setMuted] = useState(false);
  const [riding, setRiding] = useState(false); // BUILD 136: 구름 탑승
  const [stroll, setStroll] = useState(false); // BUILD 150: 무한 산책 — 카드도 도착도 없이, 그냥 걷는다
  const [mailItem, setMailItem] = useState<{ text?: string; photo?: string } | null>(null); // BUILD 169: 배달된 편지
  const [uiIdle, setUiIdle] = useState(false); // BUILD 156: UI 유휴 — 틀어놓는 화면에서 단추는 유령이 된다
  useEffect(() => {
    let t = window.setTimeout(() => setUiIdle(true), 3500);
    const wakeUi = () => {
      setUiIdle(false);
      window.clearTimeout(t);
      t = window.setTimeout(() => setUiIdle(true), 3500);
    };
    ['pointermove', 'pointerdown', 'touchstart', 'keydown'].forEach((ev) => window.addEventListener(ev, wakeUi, { passive: true }));
    return () => {
      window.clearTimeout(t);
      ['pointermove', 'pointerdown', 'touchstart', 'keydown'].forEach((ev) => window.removeEventListener(ev, wakeUi));
    };
  }, []);
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
  // BUILD 194: ?planet=1 — 작은 행성 전용 입구. 기존 세계와 코드가 섞이지 않는 별도 무대.
  // BUILD 207: &edit=1 — 행성 에디터. &draft=1 — 에디터의 초안을 그대로 걷는다.
  const [planetMode] = useState(() => new URLSearchParams(window.location.search).has('planet'));
  const [planetEdit] = useState(() => new URLSearchParams(window.location.search).has('edit'));
  const [pSpec, setPSpec] = useState<PlanetSpec>(() => {
    const q = new URLSearchParams(window.location.search);
    if (q.has('edit') || q.has('draft')) return loadPlanetDraft();
    const s = { ...DEFAULT_PLANET_SPEC, memories: [] as PlanetMemory[] };
    const th = q.get('theme');
    if (th === 'earth' || th === 'luna' || th === 'moon' || th === 'desert') s.theme = th;
    return s;
  });
  const updSpec = (mut: (s: PlanetSpec) => PlanetSpec) => {
    setPSpec((prev) => {
      const next = mut(prev);
      savePlanetDraft(next);
      return next;
    });
  };
  const [planetWalker, setPlanetWalker] = useState(-1);
  const [memCard, setMemCard] = useState<PlanetMemory | null>(null);
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

  if (planetMode) {
    const M = pSpec.moon;
    const SN = pSpec.sun;
    return (
      <main className={`app-shell world-core-shell${uiIdle ? ' ui-idle' : ''}`}>
        <div className="world-core-viewport" style={{ position: 'fixed', inset: 0 }}>
          <Canvas className="world-canvas" camera={{ position: [0, 2.25, 5.6], fov: 42 }} dpr={[1, 2]} shadows>
            <PlanetWorld spec={pSpec} walkerIdx={planetWalker} onMemory={setMemCard} />
          </Canvas>
        </div>
        <div className="atmosphere-grain" aria-hidden="true" />
        {memCard && (
          <div style={{
            position: 'fixed', left: '50%', bottom: 84, transform: 'translateX(-50%)', maxWidth: 420,
            padding: '14px 20px', borderRadius: 14, background: 'rgba(248,244,234,0.92)', color: '#3c3529',
            boxShadow: '0 8px 30px rgba(0,0,0,0.25)', zIndex: 7, textAlign: 'center', backdropFilter: 'blur(6px)',
          }}>
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 6 }}>{memCard.title}</div>
            <div style={{ fontSize: 12.5, lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>{memCard.text}</div>
          </div>
        )}
        <div style={{ position: 'fixed', top: 18, right: planetEdit ? 318 : 18, display: 'flex', gap: 10, zIndex: 6 }}>
          {([['🪐', () => updSpec((s) => ({ ...s, theme: (['earth', 'luna', 'moon', 'desert'] as const)[((['earth', 'luna', 'moon', 'desert'] as const).indexOf(s.theme) + 1) % 4] }))],
            ['🚶', () => setPlanetWalker((i) => (i + 1) % walkerCount())]] as [string, () => void][]).map(([label, fn]) => (
            <button key={label} type="button" onClick={fn} style={{
              width: 46, height: 46, borderRadius: 999, fontSize: 20, cursor: 'pointer',
              border: '1px solid rgba(255,255,255,0.35)', background: 'rgba(255,255,255,0.10)',
              backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)', color: '#fff',
            }}>{label}</button>
          ))}
        </div>
        {planetEdit && (
          <aside style={{
            position: 'fixed', top: 0, right: 0, bottom: 0, width: 300, zIndex: 8, overflowY: 'auto',
            background: 'rgba(18,24,26,0.94)', borderLeft: '1px solid rgba(216,178,110,0.25)',
            padding: '14px 14px 40px', color: '#cfc9bb', backdropFilter: 'blur(10px)',
          }}>
            <div style={{ fontSize: 13, color: '#d8b26e', letterSpacing: 2, marginBottom: 10 }}>작은 행성 에디터</div>
            <label style={{ display: 'block', fontSize: 11, margin: '6px 0' }}>
              테마
              <select value={pSpec.theme} onChange={(e) => updSpec((s) => ({ ...s, theme: e.target.value as PlanetSpec['theme'] }))}
                style={{ width: '100%', marginTop: 4, background: '#101617', color: '#e8dcc2', border: '1px solid #3a423f', borderRadius: 6, padding: 5 }}>
                <option value="earth">지구</option><option value="luna">달 (조각)</option>
                <option value="moon">달 (높이맵)</option><option value="desert">사막</option>
              </select>
            </label>
            <Dial label="반지름" value={pSpec.radius} min={5} max={22} step={0.5} onChange={(v) => updSpec((s) => ({ ...s, radius: v }))} />
            <Dial label="굴곡" value={pSpec.relief} min={0} max={2.5} step={0.05} onChange={(v) => updSpec((s) => ({ ...s, relief: v }))} />
            <Dial label="안개 수위" value={pSpec.fogLevel} min={0} max={1.2} step={0.02} onChange={(v) => updSpec((s) => ({ ...s, fogLevel: v }))} />
            <Dial label="안개 농도" value={pSpec.fogStrength} min={0} max={1} step={0.02} onChange={(v) => updSpec((s) => ({ ...s, fogStrength: v }))} />
            <Dial label="걸음" value={pSpec.walkSpeed} min={0.25} max={1.4} step={0.01} onChange={(v) => updSpec((s) => ({ ...s, walkSpeed: v }))} />
            <Dial label="감김 (바퀴)" value={pSpec.wraps} min={2} max={7} step={1} onChange={(v) => updSpec((s) => ({ ...s, wraps: v }))} />
            <Dial label="길의 요동" value={pSpec.wobble} min={0.2} max={1.8} step={0.05} onChange={(v) => updSpec((s) => ({ ...s, wobble: v }))} />
            <Dial label="교차로 — 저 길을 고를 확률" value={pSpec.ponderChance} min={0} max={1} step={0.05} onChange={(v) => updSpec((s) => ({ ...s, ponderChance: v }))} />
            <div style={{ fontSize: 12, color: '#d8b26e', margin: '12px 0 2px' }}>하늘</div>
            <Dial label="달 크기 (행성=1)" value={M.size} min={0.08} max={0.6} step={0.005} onChange={(v) => updSpec((s) => ({ ...s, moon: { ...s.moon, size: v } }))} />
            <Dial label="달 거리" value={M.dist} min={16} max={70} step={1} onChange={(v) => updSpec((s) => ({ ...s, moon: { ...s.moon, dist: v } }))} />
            <Dial label="달 공전 주기 (s)" value={M.period} min={30} max={480} step={5} onChange={(v) => updSpec((s) => ({ ...s, moon: { ...s.moon, period: v } }))} />
            <Dial label="달 궤도 기울기 (°)" value={M.tilt} min={0} max={60} step={1} onChange={(v) => updSpec((s) => ({ ...s, moon: { ...s.moon, tilt: v } }))} />
            <Dial label="달빛" value={M.light} min={0} max={8} step={0.1} onChange={(v) => updSpec((s) => ({ ...s, moon: { ...s.moon, light: v } }))} />
            <Dial label="태양 방위 (°)" value={SN.az} min={0} max={360} step={2} onChange={(v) => updSpec((s) => ({ ...s, sun: { ...s.sun, az: v } }))} />
            <Dial label="태양 고도 (°)" value={SN.el} min={4} max={85} step={1} onChange={(v) => updSpec((s) => ({ ...s, sun: { ...s.sun, el: v } }))} />
            <div style={{ fontSize: 12, color: '#d8b26e', margin: '12px 0 4px', display: 'flex', justifyContent: 'space-between' }}>
              <span>기억 — 길 위의 멈춤</span>
              <button type="button" style={{ ...PANEL_BTN, flex: 'none', padding: '2px 10px' }}
                onClick={() => updSpec((s) => ({ ...s, memories: [...s.memories, { title: '기억', text: '', t: Math.random(), stay: 4 }] }))}>+ 추가</button>
            </div>
            {pSpec.memories.map((m, i) => (
              <div key={i} style={{ border: '1px solid #33403c', borderRadius: 8, padding: 8, margin: '6px 0' }}>
                <input value={m.title} placeholder="제목" onChange={(e) => updSpec((s) => ({ ...s, memories: s.memories.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)) }))}
                  style={{ width: '100%', background: '#101617', color: '#e8dcc2', border: '1px solid #3a423f', borderRadius: 5, padding: 4, fontSize: 11 }} />
                <textarea value={m.text} placeholder="문장" rows={2} onChange={(e) => updSpec((s) => ({ ...s, memories: s.memories.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)) }))}
                  style={{ width: '100%', marginTop: 4, background: '#101617', color: '#e8dcc2', border: '1px solid #3a423f', borderRadius: 5, padding: 4, fontSize: 11, resize: 'vertical' }} />
                <Dial label="자리 (길 위 0~1)" value={m.t} min={0} max={1} step={0.005} fmt={(v) => v.toFixed(3)}
                  onChange={(v) => updSpec((s) => ({ ...s, memories: s.memories.map((x, j) => (j === i ? { ...x, t: v } : x)) }))} />
                <Dial label="머무름 (s)" value={m.stay} min={1} max={12} step={0.5}
                  onChange={(v) => updSpec((s) => ({ ...s, memories: s.memories.map((x, j) => (j === i ? { ...x, stay: v } : x)) }))} />
                <button type="button" style={{ ...PANEL_BTN, width: '100%' }} onClick={() => updSpec((s) => ({ ...s, memories: s.memories.filter((_, j) => j !== i) }))}>삭제</button>
              </div>
            ))}
            <div style={{ display: 'flex', gap: 6, marginTop: 14 }}>
              <button type="button" style={PANEL_BTN} onClick={() => {
                const blob = new Blob([JSON.stringify(pSpec, null, 2)], { type: 'application/json' });
                const a2 = document.createElement('a');
                a2.href = URL.createObjectURL(blob);
                a2.download = 'little-planet.world.json';
                a2.click();
              }}>내보내기</button>
              <button type="button" style={PANEL_BTN} onClick={() => {
                const inp = document.createElement('input');
                inp.type = 'file';
                inp.accept = '.json';
                inp.onchange = () => {
                  const f = inp.files?.[0];
                  if (!f) return;
                  void f.text().then((txt) => {
                    try { const p = JSON.parse(txt) as PlanetSpec; updSpec(() => ({ ...DEFAULT_PLANET_SPEC, ...p, moon: { ...DEFAULT_PLANET_SPEC.moon, ...p.moon }, sun: { ...DEFAULT_PLANET_SPEC.sun, ...p.sun }, memories: p.memories ?? [] })); } catch { /* 무시 */ }
                  });
                };
                inp.click();
              }}>불러오기</button>
            </div>
            <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
              <button type="button" style={PANEL_BTN} onClick={() => window.open('/?planet=1&draft=1', '_blank')}>뷰어로 보기</button>
              <button type="button" style={PANEL_BTN} onClick={() => updSpec(() => ({ ...DEFAULT_PLANET_SPEC, memories: [] }))}>초기화</button>
            </div>
          </aside>
        )}
        <div className="build-badge">{BUILD_LABEL}</div>
      </main>
    );
  }
  return (
    <main className={`app-shell world-core-shell${uiIdle ? ' ui-idle' : ''}`}>
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
            onMail={setMailItem}
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
        {mailItem && (
          <div className="mail-card" role="status">
            {mailItem.photo && <img className="mail-photo" src={mailItem.photo} alt="" />}
            {mailItem.text && <p className="mail-text">{mailItem.text}</p>}
            <div className="mail-stamp">— 길 위의 우체통에서</div>
          </div>
        )}
        <div className="build-badge">{BUILD_LABEL}</div>
      </section>
      <TouchTrail />
    </main>
  );
}
