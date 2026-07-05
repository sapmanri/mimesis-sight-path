// ---------- BUILD 095: EDITOR v0 (Phase 4 개시) ----------
// 홈즈 설계문서: "Sight Path는 제품이 아니다. World Generator가 제품이다."
// v0 범위: Walker(캐릭터·속도) / Camera(모드·호흡) / Sound(음량) 패널 + 프리셋 저장/불러오기.
// '적용'은 세계를 다시 짓는다 — 스펙이 곧 세계다.

import { useEffect, useState } from 'react';
import type { WorldSpec } from '../engine/worldSpec';
import { WALKER_ROSTER } from '../engine/worldCore';
import { footsteps } from '../scene/footsteps';

type Props = {
  spec: WorldSpec;
  onApply: (next: WorldSpec) => void;
  onClose: () => void;
};

const PRESET_KEY = 'mimesis-sight-path:presets:v1';

function loadPresets(): Record<string, WorldSpec> {
  try { return JSON.parse(localStorage.getItem(PRESET_KEY) ?? '{}'); } catch { return {}; }
}

export function EditorPanel({ spec, onApply, onClose }: Props) {
  const [draft, setDraft] = useState<WorldSpec>(() => JSON.parse(JSON.stringify(spec)));
  const [presets, setPresets] = useState<Record<string, WorldSpec>>(loadPresets);
  const [presetName, setPresetName] = useState('');
  const [volume, setVolume] = useState(1);

  useEffect(() => { footsteps.setVolume(volume); }, [volume]);

  const set = (fn: (d: WorldSpec) => void) => {
    setDraft((d) => { const n = JSON.parse(JSON.stringify(d)) as WorldSpec; fn(n); return n; });
  };

  const savePreset = () => {
    const name = presetName.trim() || `프리셋 ${Object.keys(presets).length + 1}`;
    const next = { ...presets, [name]: draft };
    setPresets(next);
    localStorage.setItem(PRESET_KEY, JSON.stringify(next));
    setPresetName('');
  };

  return (
    <aside className="editor-panel">
      <header className="editor-head">
        <strong>WORLD EDITOR</strong>
        <span className="editor-sub">v0 · Walker / Camera / Sound</span>
        <button type="button" className="editor-x" onClick={onClose}>×</button>
      </header>

      <section>
        <h4>Walker — 걷는 사람</h4>
        <label>
          캐릭터
          <select
            value={String(draft.walker.character ?? 'random')}
            onChange={(e) => set((d) => { d.walker.character = e.target.value === 'random' ? 'random' : Number(e.target.value); })}
          >
            <option value="random">랜덤 — 오늘의 걷는 사람</option>
            {WALKER_ROSTER.map((w, i) => (
              <option key={w.file} value={i}>{w.file.replace('.glb', '')}</option>
            ))}
          </select>
        </label>
        <label>
          걷기 속도 <em>{draft.walker.walkSpeed.toFixed(2)} u/s</em>
          <input type="range" min="0.25" max="1.0" step="0.01" value={draft.walker.walkSpeed}
            onChange={(e) => set((d) => { d.walker.walkSpeed = Number(e.target.value); })} />
        </label>
        <label>
          뛰기 속도 <em>{draft.walker.runSpeed.toFixed(2)} u/s</em>
          <input type="range" min="1.0" max="2.6" step="0.02" value={draft.walker.runSpeed}
            onChange={(e) => set((d) => { d.walker.runSpeed = Number(e.target.value); })} />
        </label>
      </section>

      <section>
        <h4>Camera — 시선</h4>
        <label>
          모드
          <select value={draft.camera.mode}
            onChange={(e) => set((d) => { d.camera.mode = e.target.value as 'held' | 'follow'; })}>
            <option value="held">held — 잠긴 액자 (릴의 문법)</option>
            <option value="follow">follow — 등 뒤 동행</option>
          </select>
        </label>
        <label>
          구도 전환 호흡 <em>{draft.camera.reframeSec.toFixed(1)}s</em>
          <input type="range" min="0.8" max="5" step="0.1" value={draft.camera.reframeSec}
            onChange={(e) => set((d) => { d.camera.reframeSec = Number(e.target.value); })} />
        </label>
        <label>
          구도의 숨(드리프트) <em>{draft.camera.drift.toFixed(2)}</em>
          <input type="range" min="0" max="0.3" step="0.01" value={draft.camera.drift}
            onChange={(e) => set((d) => { d.camera.drift = Number(e.target.value); })} />
        </label>
      </section>

      <section>
        <h4>Sound — 발소리</h4>
        <label>
          음량 <em>{Math.round(volume * 100)}%</em>
          <input type="range" min="0" max="1" step="0.05" value={volume}
            onChange={(e) => setVolume(Number(e.target.value))} />
        </label>
        <p className="editor-note">음량은 즉시 적용. 나머지는 아래 '세계 다시 짓기'.</p>
      </section>

      <section>
        <h4>Preset — 프리셋</h4>
        <div className="editor-row">
          <input type="text" placeholder="프리셋 이름" value={presetName}
            onChange={(e) => setPresetName(e.target.value)} />
          <button type="button" onClick={savePreset}>저장</button>
        </div>
        {Object.keys(presets).length > 0 && (
          <div className="editor-row">
            <select id="preset-pick" defaultValue=""
              onChange={(e) => { const p = presets[e.target.value]; if (p) setDraft(JSON.parse(JSON.stringify(p))); }}>
              <option value="" disabled>불러오기…</option>
              {Object.keys(presets).map((k) => <option key={k} value={k}>{k}</option>)}
            </select>
          </div>
        )}
      </section>

      <footer className="editor-foot">
        <button type="button" className="editor-apply" onClick={() => onApply(draft)}>세계 다시 짓기</button>
      </footer>
    </aside>
  );
}
