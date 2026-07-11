from pathlib import Path

p = Path('src/App.tsx')
s = p.read_text()

old_dial = """// ---------- BUILD 207: 행성 에디터 — 다이얼 한 줄 ----------
function Dial({ label, value, min, max, step, onChange, fmt }: { label: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void; fmt?: (v: number) => string }) {
  return (
    <label style={{ display: 'block', margin: '7px 0', fontSize: 11, color: '#cfc9bb' }}>
      <span style={{ display: 'flex', justifyContent: 'space-between' }}>
        <span>{label}</span>
        <span style={{ color: '#d8b26e' }}>{fmt ? fmt(value) : value}</span>
      </span>
      <input type=\"range\" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} style={{ width: '100%' }} />
    </label>
  );
}
"""
new_dial = """// ---------- BUILD 396: 모바일에서는 다이얼을 접어 화면을 되찾는다 ----------
function Dial({ label, value, min, max, step, onChange, fmt }: { label: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void; fmt?: (v: number) => string }) {
  const [open, setOpen] = useState(() => window.innerWidth > 760);
  return (
    <div style={{ margin: '5px 0', fontSize: 11, color: '#cfc9bb', borderBottom: '1px solid rgba(255,255,255,0.045)', paddingBottom: open ? 7 : 3 }}>
      <button type=\"button\" onClick={() => setOpen((v) => !v)} style={{
        width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8,
        padding: '7px 2px', border: 0, background: 'transparent', color: '#cfc9bb', cursor: 'pointer', textAlign: 'left',
      }}>
        <span><span style={{ display: 'inline-block', width: 15, color: '#8f9b94' }}>{open ? '▾' : '▸'}</span>{label}</span>
        <span style={{ color: '#d8b26e', flexShrink: 0 }}>{fmt ? fmt(value) : value}</span>
      </button>
      {open && <input type=\"range\" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} style={{ width: '100%', touchAction: 'pan-y' }} />}
    </div>
  );
}
"""
if old_dial not in s:
    raise SystemExit('Dial anchor not found')
s = s.replace(old_dial, new_dial, 1)

old_label = "const BUILD_LABEL = 'v2.46.0 · BUILD 395 · 관찰일기 + 손 소품/접근 거리 교정';"
new_label = "const BUILD_LABEL = 'v2.47.0 · BUILD 396 · 모바일 에디터 접기 — 화면을 가리지 않는 슬라이더';"
if old_label not in s:
    raise SystemExit('BUILD 395 label not found')
s = s.replace(old_label, new_label, 1)

old_state = "  const [planetEdit] = useState(() => new URLSearchParams(window.location.search).has('edit'));"
new_state = old_state + "\n  const [planetEditorOpen, setPlanetEditorOpen] = useState(() => window.innerWidth > 760); // BUILD 396: 모바일 기본 접힘"
if old_state not in s:
    raise SystemExit('planetEdit state anchor not found')
s = s.replace(old_state, new_state, 1)

old_aside = "        {planetEdit && (\n          <aside style={{"
new_aside = "        {planetEdit && (\n          <button type=\"button\" onClick={() => setPlanetEditorOpen((v) => !v)} aria-label={planetEditorOpen ? '에디터 접기' : '에디터 펼치기'} style={{\n            position: 'fixed', top: 76, right: planetEditorOpen ? 'min(312px, 84vw)' : 12, zIndex: 9,\n            width: 44, height: 44, borderRadius: 999, cursor: 'pointer', fontSize: 18,\n            color: '#e8dcc2', background: 'rgba(18,24,26,0.92)', border: '1px solid rgba(216,178,110,0.42)',\n            boxShadow: '0 6px 20px rgba(0,0,0,0.24)', backdropFilter: 'blur(8px)',\n          }}>{planetEditorOpen ? '×' : '⚙️'}</button>\n        )}\n        {planetEdit && planetEditorOpen && (\n          <aside style={{"
if old_aside not in s:
    raise SystemExit('editor aside anchor not found')
s = s.replace(old_aside, new_aside, 1)

old_style = "            position: 'fixed', top: 0, right: 0, bottom: 0, width: 300, zIndex: 8, overflowY: 'auto',\n            background: 'rgba(18,24,26,0.94)', borderLeft: '1px solid rgba(216,178,110,0.25)',\n            padding: '14px 14px 40px', color: '#cfc9bb', backdropFilter: 'blur(10px)',"
new_style = "            position: 'fixed', top: 0, right: 0, bottom: 0, width: 'min(300px, 84vw)', zIndex: 8, overflowY: 'auto',\n            background: 'rgba(18,24,26,0.94)', borderLeft: '1px solid rgba(216,178,110,0.25)',\n            padding: '14px 14px calc(40px + env(safe-area-inset-bottom))', color: '#cfc9bb', backdropFilter: 'blur(10px)',\n            WebkitOverflowScrolling: 'touch', overscrollBehavior: 'contain',"
if old_style not in s:
    raise SystemExit('aside style anchor not found')
s = s.replace(old_style, new_style, 1)

old_title = "            <div style={{ fontSize: 13, color: '#d8b26e', letterSpacing: 2, marginBottom: 10 }}>작은 행성 에디터</div>"
new_title = "            <div style={{ position: 'sticky', top: -14, zIndex: 2, margin: '-14px -14px 8px', padding: '16px 58px 10px 14px', fontSize: 13, color: '#d8b26e', letterSpacing: 2, background: 'rgba(18,24,26,0.97)', borderBottom: '1px solid rgba(216,178,110,0.16)' }}>작은 행성 에디터</div>"
if old_title not in s:
    raise SystemExit('editor title anchor not found')
s = s.replace(old_title, new_title, 1)

p.write_text(s)
