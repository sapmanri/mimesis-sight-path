// ---------- BUILD 096: WORLD EDITOR (전용 페이지) ----------
// "Sight Path는 제품이 아니다. World Generator가 제품이다."
// 이 페이지가 그 제품의 조종석이다: 기억을 배열하고, 환경을 고르고,
// 걷는 사람과 시선을 정하고 — 세계를 짓는다.
//
// 구조: 좌(기억 목록) · 중(살아있는 3D 프리뷰) · 우(인스펙터 탭)
// 문서: { name, blueprints, spec } — localStorage 자동저장, JSON 내보내기/가져오기,
//       '뷰어에서 열기' = 본편이 ?draft=1로 이 문서를 읽는다.

import { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { World } from '../scene/World';
import { PROP_CATALOG, PROP_CATEGORIES, type PlacedProp } from '../engine/props';
import { compileScenes, type SceneBlueprint } from '../engine/blueprint';
import { JEJU_SPEC, type WorldSpec } from '../engine/worldSpec';
import { WALKER_ROSTER } from '../engine/worldCore';
import { jejuBlueprints } from '../data/jeju';

const DRAFT_KEY = 'mimesis:world-draft:v1';

type WorldDoc = { version: 1; name: string; blueprints: SceneBlueprint[]; spec: WorldSpec; props?: PlacedProp[] };

// ---------- BUILD 100: 자유 카메라 (WASD/화살표 + 우클릭 드래그 룩) ----------
// 다른 에디터들과 같은 문법 — 멀리 날아가 오브젝트를 찍는다.
function FlyRig() {
  const { camera, gl } = useThree();
  const keys = useRef<Record<string, boolean>>({});
  const look = useRef({ dragging: false, px: 0, py: 0, yaw: 0, pitch: 0, init: false });
  useEffect(() => {
    const kd = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT')) return;
      keys.current[e.key.toLowerCase()] = true;
      if (e.key.startsWith('Arrow')) e.preventDefault();
    };
    const ku = (e: KeyboardEvent) => { keys.current[e.key.toLowerCase()] = false; };
    const el = gl.domElement;
    const ctx = (e: MouseEvent) => e.preventDefault();
    const down = (e: PointerEvent) => {
      if (e.button !== 2) return;
      look.current.dragging = true;
      look.current.px = e.clientX;
      look.current.py = e.clientY;
    };
    const move = (e: PointerEvent) => {
      const L = look.current;
      if (!L.dragging) return;
      L.yaw -= (e.clientX - L.px) * 0.0042;
      L.pitch = Math.max(-1.35, Math.min(1.35, L.pitch - (e.clientY - L.py) * 0.0038));
      L.px = e.clientX;
      L.py = e.clientY;
    };
    const up = () => { look.current.dragging = false; };
    window.addEventListener('keydown', kd);
    window.addEventListener('keyup', ku);
    el.addEventListener('contextmenu', ctx);
    el.addEventListener('pointerdown', down);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    return () => {
      window.removeEventListener('keydown', kd);
      window.removeEventListener('keyup', ku);
      el.removeEventListener('contextmenu', ctx);
      el.removeEventListener('pointerdown', down);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
  }, [gl]);
  useFrame((_, dt) => {
    const L = look.current;
    if (!L.init) {
      // 현재 카메라 방향에서 시작
      const d = camera.getWorldDirection(new THREE.Vector3());
      L.yaw = Math.atan2(-d.x, -d.z) + Math.PI;
      L.pitch = Math.asin(THREE.MathUtils.clamp(d.y, -1, 1));
      L.init = true;
    }
    camera.rotation.set(L.pitch, L.yaw, 0, 'YXZ');
    const k = keys.current;
    const speed = (k['shift'] ? 12 : 4) * dt;
    const fwd = new THREE.Vector3(-Math.sin(L.yaw), 0, -Math.cos(L.yaw));
    const right = new THREE.Vector3(-fwd.z, 0, fwd.x);
    if (k['w'] || k['arrowup']) camera.position.addScaledVector(fwd, speed);
    if (k['s'] || k['arrowdown']) camera.position.addScaledVector(fwd, -speed);
    if (k['a'] || k['arrowleft']) camera.position.addScaledVector(right, -speed);
    if (k['d'] || k['arrowright']) camera.position.addScaledVector(right, speed);
    if (k['e'] || k[' ']) camera.position.y += speed;
    if (k['q']) camera.position.y -= speed;
  });
  return null;
}

const KITS = ['door-kit', 'person-kit', 'cloud-kit', 'suitcase-kit', 'book-kit', 'cup-kit', 'stone-wall-kit', 'cd-shelf-kit', 'fruit-kit', 'airplane-wing-kit', 'sea-edge-kit'] as const;
const PATHS = ['straight', 'soft-curve', 'deep-curve', 'bridge', 'stair', 'threshold', 'open-field'] as const;
const SURFACES = ['dry-stone', 'wet-stone', 'mud', 'sand', 'grass-edge', 'snow-thin', 'rain-puddle', 'moss-aged'] as const;
const WEATHERS = ['clear-day', 'soft-cloud', 'rain-cloud', 'drizzle', 'moon-night', 'sunset-fade', 'fog-morning'] as const;
const SHOTS = ['wide', 'macro', 'walk', 'overhead', 'side'] as const;

const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v));

function freshDoc(): WorldDoc {
  return { version: 1, name: 'JEJU, 시선을 따라 걷다', blueprints: clone(jejuBlueprints), spec: clone(JEJU_SPEC) };
}

function loadDoc(): WorldDoc {
  try {
    const d = JSON.parse(localStorage.getItem(DRAFT_KEY) ?? '');
    if (d?.blueprints?.length && d?.spec) return d as WorldDoc;
  } catch { /* 새 문서로 */ }
  return freshDoc();
}

export function EditorApp() {
  const [doc, setDoc] = useState<WorldDoc>(loadDoc);
  const [sel, setSel] = useState(0);
  const [tab, setTab] = useState<'scene' | 'place' | 'env' | 'walker' | 'camera'>('scene');
  const [preview, setPreview] = useState<WorldDoc>(() => clone(doc));
  const [savedAt, setSavedAt] = useState<number | null>(null);
  // BUILD 100: 픽 대상 일반화 — 기억 자리 / 새 배치물 / 배치물 자리 다시 찍기
  const [pickTarget, setPickTarget] = useState<null | 'scene' | 'prop-new' | 'prop-repos'>(null);
  const [propCat, setPropCat] = useState(PROP_CATEGORIES[0]);
  const [propObj, setPropObj] = useState(PROP_CATALOG[0].id);
  const [selProp, setSelProp] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setPickTarget(null); };
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, []);
  const photoRef = useRef<HTMLInputElement | null>(null);

  // 자동저장 + 프리뷰 커밋 (0.5s 디바운스 — 슬라이더 드래그 중 세계 재생성 폭주 방지)
  useEffect(() => {
    const t = setTimeout(() => {
      localStorage.setItem(DRAFT_KEY, JSON.stringify(doc));
      setSavedAt(Date.now());
      setPreview(clone(doc));
    }, 500);
    return () => clearTimeout(t);
  }, [doc]);

  const scenes = useMemo(() => compileScenes(preview.blueprints), [preview]);
  const cur = doc.blueprints[sel];

  const edit = (fn: (d: WorldDoc) => void) => setDoc((d) => { const n = clone(d); fn(n); return n; });
  const editScene = (fn: (s: SceneBlueprint) => void) => edit((d) => { fn(d.blueprints[sel]); });

  const addScene = () => edit((d) => {
    const bs = d.blueprints;
    const last = bs[bs.length - 1];
    const prev = bs[bs.length - 2];
    // 마지막 걸음의 방향을 이어서 다음 자리를 잡는다
    const dx = prev ? last.position[0] - prev.position[0] : 0.6;
    const dz = prev ? last.position[2] - prev.position[2] : -2.8;
    bs.push({
      ...clone(last),
      id: Math.max(...bs.map((b) => b.id)) + 1,
      title: '새 기억',
      objectLabel: 'new memory',
      emoji: '✦',
      text: '아직 쓰이지 않은\n기억.',
      position: [last.position[0] + dx, last.position[1], last.position[2] + dz],
      photo: undefined,
    });
    setSel(bs.length - 1);
  });

  const removeScene = (i: number) => edit((d) => {
    if (d.blueprints.length <= 2) return; // 길은 최소 두 점
    d.blueprints.splice(i, 1);
    setSel(Math.max(0, Math.min(i, d.blueprints.length - 1)));
  });

  const moveScene = (i: number, dir: -1 | 1) => edit((d) => {
    const j = i + dir;
    if (j < 0 || j >= d.blueprints.length) return;
    const [b] = d.blueprints.splice(i, 1);
    d.blueprints.splice(j, 0, b);
    setSel(j);
  });

  const exportJson = () => {
    const blob = new Blob([JSON.stringify(doc, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${doc.name.replace(/\s+/g, '_')}.world.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const importJson = (file: File) => {
    const r = new FileReader();
    r.onload = () => {
      try {
        const d = JSON.parse(String(r.result));
        if (d?.blueprints?.length && d?.spec) { setDoc(d); setSel(0); }
        else alert('world.json 형식이 아닙니다');
      } catch { alert('JSON을 읽을 수 없습니다'); }
    };
    r.readAsText(file);
  };

  const attachPhoto = (file: File) => {
    const r = new FileReader();
    r.onload = () => editScene((s) => { s.photo = String(r.result); });
    r.readAsDataURL(file);
  };

  const openViewer = () => {
    localStorage.setItem(DRAFT_KEY, JSON.stringify(doc));
    window.open('/?draft=1', '_blank');
  };

  return (
    <div className="ed-root">
      <header className="ed-top">
        <div className="ed-brand">MIMESIS <span>WORLD EDITOR</span></div>
        <input className="ed-docname" value={doc.name} onChange={(e) => edit((d) => { d.name = e.target.value; })} />
        <div className="ed-top-actions">
          <span className="ed-saved">{savedAt ? '자동저장됨' : ''}</span>
          <button type="button" onClick={() => { if (confirm('제주 템플릿으로 새로 시작할까요? 현재 문서는 사라집니다.')) { setDoc(freshDoc()); setSel(0); } }}>새 문서</button>
          <button type="button" onClick={() => fileRef.current?.click()}>가져오기</button>
          <button type="button" onClick={exportJson}>내보내기</button>
          <button type="button" className="ed-primary" onClick={openViewer}>뷰어에서 열기 ↗</button>
          <input ref={fileRef} type="file" accept=".json" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) importJson(f); e.currentTarget.value = ''; }} />
        </div>
      </header>

      <div className="ed-body">
        {/* ---- 좌: 기억 목록 ---- */}
        <aside className="ed-scenes">
          <div className="ed-col-head">
            <h3>기억 {doc.blueprints.length}</h3>
            <button type="button" onClick={addScene}>＋ 추가</button>
          </div>
          <ol>
            {doc.blueprints.map((b, i) => (
              <li key={b.id} className={i === sel ? 'on' : ''}>
                <button type="button" className="ed-scene-pick" onClick={() => { setSel(i); setTab('scene'); }}>
                  <span className="ed-emoji">{b.emoji}</span>
                  <span className="ed-scene-title">{b.title}</span>
                  {b.photo && <span className="ed-hasphoto">📷</span>}
                </button>
                <span className="ed-scene-ops">
                  <button type="button" onClick={() => moveScene(i, -1)} aria-label="위로">▲</button>
                  <button type="button" onClick={() => moveScene(i, 1)} aria-label="아래로">▼</button>
                  <button type="button" onClick={() => removeScene(i)} aria-label="삭제">✕</button>
                </span>
              </li>
            ))}
          </ol>
        </aside>

        {/* ---- 중: 살아있는 프리뷰 ---- */}
        <main className="ed-preview">
          <Canvas className={pickTarget ? 'ed-canvas ed-picking' : 'ed-canvas'} camera={{ position: [0, 3.1, 8.4], fov: 42 }} dpr={[1, 1.5]} shadows>
            <FlyRig />
            <World
              activeIndex={Math.min(sel, scenes.length - 1)}
              scenes={scenes}
              mode="manual"
              spec={preview.spec}
              props={preview.props}
              freeCamera
              onGroundPick={pickTarget ? (pt) => {
                if (pickTarget === 'scene') {
                  editScene((sc) => { sc.position[0] = +pt.x.toFixed(2); sc.position[2] = +pt.z.toFixed(2); });
                } else if (pickTarget === 'prop-new') {
                  const id = 'p' + Date.now().toString(36);
                  edit((d) => {
                    d.props = d.props ?? [];
                    d.props.push({ id, obj: propObj, position: [+pt.x.toFixed(2), +pt.y.toFixed(2), +pt.z.toFixed(2)], rotY: 0, rotX: 0, scale: 1 });
                  });
                  setSelProp(id);
                } else if (pickTarget === 'prop-repos' && selProp) {
                  edit((d) => {
                    const pp = (d.props ?? []).find((q) => q.id === selProp);
                    if (pp) pp.position = [+pt.x.toFixed(2), +pt.y.toFixed(2), +pt.z.toFixed(2)];
                  });
                }
                setPickTarget(null);
              } : undefined}
            />
          </Canvas>
          {pickTarget && (
            <div className="ed-pick-hint">
              {pickTarget === 'scene' ? '지면을 클릭하면 이 기억의 자리가 됩니다' : pickTarget === 'prop-new' ? '지면을 클릭하면 그 자리에 배치됩니다' : '지면을 클릭하면 그리로 옮깁니다'} · ESC 취소
            </div>
          )}
          <div className="ed-flyhint">WASD/화살표 이동 · Q/E 상하 · 우클릭 드래그 시선 · Shift 가속</div>
          <div className="ed-preview-bar">
            <button type="button" onClick={() => setSel((v) => Math.max(0, v - 1))}>←</button>
            <span>{String(sel + 1).padStart(2, '0')} / {doc.blueprints.length} · {cur?.title}</span>
            <button type="button" onClick={() => setSel((v) => Math.min(doc.blueprints.length - 1, v + 1))}>→</button>
          </div>
        </main>

        {/* ---- 우: 인스펙터 ---- */}
        <aside className="ed-inspector">
          <nav className="ed-tabs">
            {([['scene', '기억'], ['place', '배치'], ['env', '환경'], ['walker', '걷는 사람'], ['camera', '시선']] as const).map(([k, label]) => (
              <button key={k} type="button" className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{label}</button>
            ))}
          </nav>

          {tab === 'scene' && cur && (
            <div className="ed-fields">
              <label>제목<input value={cur.title} onChange={(e) => editScene((s) => { s.title = e.target.value; })} /></label>
              <div className="ed-grid2">
                <label>이모지<input value={cur.emoji} onChange={(e) => editScene((s) => { s.emoji = e.target.value; })} /></label>
                <label>색조<input type="color" value={cur.hue} onChange={(e) => editScene((s) => { s.hue = e.target.value; })} /></label>
              </div>
              <label>문장<textarea rows={4} value={cur.text} onChange={(e) => editScene((s) => { s.text = e.target.value; })} /></label>
              <label>사물 (오브젝트 킷)
                <select value={cur.objectKit} onChange={(e) => editScene((s) => { s.objectKit = e.target.value as SceneBlueprint['objectKit']; })}>
                  {KITS.map((k) => <option key={k} value={k}>{k}</option>)}
                </select>
              </label>
              <div className="ed-grid2">
                <label>길의 결
                  <select value={cur.pathKind} onChange={(e) => editScene((s) => { s.pathKind = e.target.value as SceneBlueprint['pathKind']; })}>
                    {PATHS.map((k) => <option key={k} value={k}>{k}</option>)}
                  </select>
                </label>
                <label>바닥
                  <select value={cur.surface} onChange={(e) => editScene((s) => { s.surface = e.target.value as SceneBlueprint['surface']; })}>
                    {SURFACES.map((k) => <option key={k} value={k}>{k}</option>)}
                  </select>
                </label>
                <label>날씨
                  <select value={cur.weather} onChange={(e) => editScene((s) => { s.weather = e.target.value as SceneBlueprint['weather']; })}>
                    {WEATHERS.map((k) => <option key={k} value={k}>{k}</option>)}
                  </select>
                </label>
                <label>구도 힌트
                  <select value={cur.cameraShot} onChange={(e) => editScene((s) => { s.cameraShot = e.target.value as SceneBlueprint['cameraShot']; })}>
                    {SHOTS.map((k) => <option key={k} value={k}>{k}</option>)}
                  </select>
                </label>
              </div>
              <label>머무름 <em>{cur.stillness.toFixed(2)}</em>
                <input type="range" min="0.3" max="1.6" step="0.05" value={cur.stillness} onChange={(e) => editScene((s) => { s.stillness = Number(e.target.value); })} />
              </label>
              <label>무게(중요도) <em>{cur.importance.toFixed(2)}</em>
                <input type="range" min="0.4" max="1.6" step="0.05" value={cur.importance} onChange={(e) => editScene((s) => { s.importance = Number(e.target.value); })} />
              </label>
              <div className="ed-grid2">
                <label>자리 X<input type="number" step="0.2" value={cur.position[0]} onChange={(e) => editScene((s) => { s.position[0] = Number(e.target.value); })} /></label>
                <label>자리 Z<input type="number" step="0.2" value={cur.position[2]} onChange={(e) => editScene((s) => { s.position[2] = Number(e.target.value); })} /></label>
              </div>
              <button type="button" className={pickTarget === 'scene' ? 'ed-pickbtn on' : 'ed-pickbtn'} onClick={() => setPickTarget((v) => (v === 'scene' ? null : 'scene'))}>
                {pickTarget === 'scene' ? '클릭 대기 중… (취소)' : '⌖ 프리뷰에서 자리 찍기'}
              </button>
              <label>사물 크기 <em>{(cur.scale || 1).toFixed(2)}×</em>
                <input type="range" min="0.4" max="2" step="0.05" value={cur.scale || 1}
                  onChange={(e) => editScene((sc) => { sc.scale = Number(e.target.value); })} />
              </label>
              <label>사물 회전 · 좌우 <em>{Math.round((cur.objectRotY ?? 0) * 180 / Math.PI)}°</em>
                <input type="range" min={-Math.PI} max={Math.PI} step="0.02" value={cur.objectRotY ?? 0}
                  onChange={(e) => editScene((s) => { s.objectRotY = Number(e.target.value); })} />
              </label>
              <label>사물 기울임 · 위아래 <em>{Math.round((cur.objectRotX ?? 0) * 180 / Math.PI)}°</em>
                <input type="range" min={-0.8} max={0.8} step="0.02" value={cur.objectRotX ?? 0}
                  onChange={(e) => editScene((s) => { s.objectRotX = Number(e.target.value); })} />
              </label>
              <div className="ed-photo">
                <span>사진 <small>(폴라로이드 액자 예정)</small></span>
                {cur.photo
                  ? <div className="ed-photo-thumb"><img src={cur.photo} alt="" /><button type="button" onClick={() => editScene((s) => { s.photo = undefined; })}>제거</button></div>
                  : <button type="button" onClick={() => photoRef.current?.click()}>사진 첨부…</button>}
                <input ref={photoRef} type="file" accept="image/*" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) attachPhoto(f); e.currentTarget.value = ''; }} />
              </div>
            </div>
          )}

          {tab === 'place' && (
            <div className="ed-fields">
              <h4>오브젝트 카탈로그</h4>
              <div className="ed-grid2">
                <label>카테고리
                  <select value={propCat} onChange={(e) => { setPropCat(e.target.value); const first = PROP_CATALOG.find((q) => q.cat === e.target.value); if (first) setPropObj(first.id); }}>
                    {PROP_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </label>
                <label>오브젝트
                  <select value={propObj} onChange={(e) => setPropObj(e.target.value)}>
                    {PROP_CATALOG.filter((q) => q.cat === propCat).map((q) => <option key={q.id} value={q.id}>{q.label}</option>)}
                  </select>
                </label>
              </div>
              <button type="button" className={pickTarget === 'prop-new' ? 'ed-pickbtn on' : 'ed-pickbtn'}
                onClick={() => setPickTarget((v) => (v === 'prop-new' ? null : 'prop-new'))}>
                {pickTarget === 'prop-new' ? '클릭 대기 중… (취소)' : '⌖ 배치 — 화면을 찍으세요'}
              </button>

              <h4>배치된 사물 {(doc.props ?? []).length}</h4>
              {(doc.props ?? []).length === 0 && <p className="ed-note">아직 없습니다. 위에서 골라 배치하세요.</p>}
              <ul className="ed-proplist">
                {(doc.props ?? []).map((pp) => {
                  const def = PROP_CATALOG.find((q) => q.id === pp.obj);
                  return (
                    <li key={pp.id} className={selProp === pp.id ? 'on' : ''}>
                      <button type="button" onClick={() => setSelProp(pp.id)}>{def?.label ?? pp.obj}</button>
                      <button type="button" className="ed-del" onClick={() => { edit((d) => { d.props = (d.props ?? []).filter((q) => q.id !== pp.id); }); if (selProp === pp.id) setSelProp(null); }}>✕</button>
                    </li>
                  );
                })}
              </ul>
              {selProp && (() => {
                const pp = (doc.props ?? []).find((q) => q.id === selProp);
                if (!pp) return null;
                const editProp = (fn: (q: PlacedProp) => void) => edit((d) => { const q = (d.props ?? []).find((x) => x.id === selProp); if (q) fn(q); });
                return (
                  <div className="ed-propedit">
                    <label>회전 · 좌우 <em>{Math.round(pp.rotY * 180 / Math.PI)}°</em>
                      <input type="range" min={-Math.PI} max={Math.PI} step="0.02" value={pp.rotY} onChange={(e) => editProp((q) => { q.rotY = Number(e.target.value); })} />
                    </label>
                    <label>기울임 · 위아래 <em>{Math.round(pp.rotX * 180 / Math.PI)}°</em>
                      <input type="range" min={-0.8} max={0.8} step="0.02" value={pp.rotX} onChange={(e) => editProp((q) => { q.rotX = Number(e.target.value); })} />
                    </label>
                    <label>크기 <em>{pp.scale.toFixed(2)}×</em>
                      <input type="range" min="0.3" max="3" step="0.05" value={pp.scale} onChange={(e) => editProp((q) => { q.scale = Number(e.target.value); })} />
                    </label>
                    <label>높이 <em>{pp.position[1].toFixed(2)}u</em>
                      <input type="range" min="-0.5" max="9" step="0.1" value={pp.position[1]} onChange={(e) => editProp((q) => { q.position[1] = Number(e.target.value); })} />
                    </label>
                    <button type="button" className={pickTarget === 'prop-repos' ? 'ed-pickbtn on' : 'ed-pickbtn'}
                      onClick={() => setPickTarget((v) => (v === 'prop-repos' ? null : 'prop-repos'))}>
                      {pickTarget === 'prop-repos' ? '클릭 대기 중… (취소)' : '⌖ 자리 다시 찍기'}
                    </button>
                  </div>
                );
              })()}
            </div>
          )}

          {tab === 'env' && (
            <div className="ed-fields">
              <h4>식생</h4>
              <label>풀 다발 <em>{doc.spec.decoration.grassCount}</em>
                <input type="range" min="0" max="500" step="10" value={doc.spec.decoration.grassCount} onChange={(e) => edit((d) => { d.spec.decoration.grassCount = Number(e.target.value); })} />
              </label>
              <label>수풀 <em>{doc.spec.decoration.vegetation.bushCount}</em>
                <input type="range" min="0" max="80" step="1" value={doc.spec.decoration.vegetation.bushCount} onChange={(e) => edit((d) => { d.spec.decoration.vegetation.bushCount = Number(e.target.value); })} />
              </label>
              <label>작은 나무 <em>{doc.spec.decoration.vegetation.treeCount}</em>
                <input type="range" min="0" max="30" step="1" value={doc.spec.decoration.vegetation.treeCount} onChange={(e) => edit((d) => { d.spec.decoration.vegetation.treeCount = Number(e.target.value); })} />
              </label>
              <div className="ed-grid3">
                {doc.spec.decoration.vegetation.greens.map((g, i) => (
                  <label key={i}>초록 {i + 1}<input type="color" value={g} onChange={(e) => edit((d) => { d.spec.decoration.vegetation.greens[i] = e.target.value; })} /></label>
                ))}
              </div>
              <h4>돌담의 리듬</h4>
              <label>담 구간 길이 <em>{doc.spec.decoration.edgeWall.segMin.toFixed(1)}–{doc.spec.decoration.edgeWall.segMax.toFixed(1)}u</em>
                <input type="range" min="0.6" max="4" step="0.1" value={doc.spec.decoration.edgeWall.segMax} onChange={(e) => edit((d) => { d.spec.decoration.edgeWall.segMax = Number(e.target.value); d.spec.decoration.edgeWall.segMin = Math.min(d.spec.decoration.edgeWall.segMin, d.spec.decoration.edgeWall.segMax); })} />
              </label>
              <label>빈틈 길이 <em>{doc.spec.decoration.edgeWall.gapMin.toFixed(1)}–{doc.spec.decoration.edgeWall.gapMax.toFixed(1)}u</em>
                <input type="range" min="0.3" max="4" step="0.1" value={doc.spec.decoration.edgeWall.gapMax} onChange={(e) => edit((d) => { d.spec.decoration.edgeWall.gapMax = Number(e.target.value); d.spec.decoration.edgeWall.gapMin = Math.min(d.spec.decoration.edgeWall.gapMin, d.spec.decoration.edgeWall.gapMax); })} />
              </label>
              <label>양쪽에 설 확률 <em>{Math.round(doc.spec.decoration.edgeWall.bothChance * 100)}%</em>
                <input type="range" min="0" max="0.8" step="0.05" value={doc.spec.decoration.edgeWall.bothChance} onChange={(e) => edit((d) => { d.spec.decoration.edgeWall.bothChance = Number(e.target.value); })} />
              </label>
            </div>
          )}

          {tab === 'walker' && (
            <div className="ed-fields">
              <label>걷는 사람
                <select value={String(doc.spec.walker.character ?? 'random')} onChange={(e) => edit((d) => { d.spec.walker.character = e.target.value === 'random' ? 'random' : Number(e.target.value); })}>
                  <option value="random">랜덤 — 오늘의 걷는 사람</option>
                  {WALKER_ROSTER.map((w, i) => <option key={w.file} value={i}>{w.file.replace('.glb', '')}</option>)}
                </select>
              </label>
              <label>걷기 속도 <em>{doc.spec.walker.walkSpeed.toFixed(2)} u/s</em>
                <input type="range" min="0.25" max="1.0" step="0.01" value={doc.spec.walker.walkSpeed} onChange={(e) => edit((d) => { d.spec.walker.walkSpeed = Number(e.target.value); })} />
              </label>
              <label>뛰기 속도 <em>{doc.spec.walker.runSpeed.toFixed(2)} u/s</em>
                <input type="range" min="1.0" max="2.6" step="0.02" value={doc.spec.walker.runSpeed} onChange={(e) => edit((d) => { d.spec.walker.runSpeed = Number(e.target.value); })} />
              </label>
            </div>
          )}

          {tab === 'camera' && (
            <div className="ed-fields">
              <label>모드
                <select value={doc.spec.camera.mode} onChange={(e) => edit((d) => { d.spec.camera.mode = e.target.value as 'held' | 'follow'; })}>
                  <option value="held">held — 잠긴 액자 (릴의 문법)</option>
                  <option value="follow">follow — 등 뒤 동행</option>
                </select>
              </label>
              <label>구도 전환 호흡 <em>{doc.spec.camera.reframeSec.toFixed(1)}s</em>
                <input type="range" min="0.8" max="5" step="0.1" value={doc.spec.camera.reframeSec} onChange={(e) => edit((d) => { d.spec.camera.reframeSec = Number(e.target.value); })} />
              </label>
              <label>구도의 숨 <em>{doc.spec.camera.drift.toFixed(2)}</em>
                <input type="range" min="0" max="0.3" step="0.01" value={doc.spec.camera.drift} onChange={(e) => edit((d) => { d.spec.camera.drift = Number(e.target.value); })} />
              </label>
              <label>시선 높이 <em>{doc.spec.camera.height.toFixed(1)}</em>
                <input type="range" min="1" max="5" step="0.1" value={doc.spec.camera.height} onChange={(e) => edit((d) => { d.spec.camera.height = Number(e.target.value); })} />
              </label>
              <label>기본 이격 <em>{doc.spec.camera.baseDist.toFixed(1)}u</em>
                <input type="range" min="3" max="9" step="0.1" value={doc.spec.camera.baseDist} onChange={(e) => edit((d) => { d.spec.camera.baseDist = Number(e.target.value); })} />
              </label>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
