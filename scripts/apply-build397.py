from pathlib import Path

p = Path('src/App.tsx')
s = p.read_text()

old = "const BUILD_LABEL = 'v2.47.0 · BUILD 396 · 모바일 에디터 접기 — 화면을 가리지 않는 슬라이더';"
new = "const BUILD_LABEL = 'v2.48.0 · BUILD 397 · 모바일 UI 레일 — 여권·기록·에디터를 한 형식으로';"
assert old in s, 'build label missing'
s = s.replace(old, new, 1)

old = "  const [planetEditorOpen, setPlanetEditorOpen] = useState(() => window.innerWidth > 760); // BUILD 396: 모바일 기본 접힘"
new = old + "\n  const [compactUI, setCompactUI] = useState(() => window.innerWidth <= 760);\n  useEffect(() => {\n    const onResize = () => setCompactUI(window.innerWidth <= 760);\n    window.addEventListener('resize', onResize);\n    return () => window.removeEventListener('resize', onResize);\n  }, []);"
assert old in s, 'editor state missing'
s = s.replace(old, new, 1)

old = """        {passportOpen && (
          <div style={{
            position: 'fixed', top: 76, right: planetEdit ? 318 : 18, width: 250, zIndex: 6,
            padding: '14px 16px', borderRadius: 14, color: '#e8dcc2',
            background: 'rgba(18,24,26,0.9)', border: '1px solid rgba(216,178,110,0.3)',
            backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)',
          }}>"""
new = """        {passportOpen && (
          <div style={{
            position: 'fixed', top: compactUI ? 0 : 76, right: compactUI ? 0 : (planetEditorOpen ? 318 : 18), bottom: compactUI ? 0 : 'auto',
            width: compactUI ? 'min(300px, 84vw)' : 250, maxHeight: compactUI ? 'none' : '78vh', zIndex: 7, overflowY: 'auto',
            padding: compactUI ? '70px 14px calc(24px + env(safe-area-inset-bottom))' : '14px 16px', borderRadius: compactUI ? 0 : 14, color: '#e8dcc2',
            background: 'rgba(18,24,26,0.95)', border: '1px solid rgba(216,178,110,0.3)',
            backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)', WebkitOverflowScrolling: 'touch',
          }}>"""
assert old in s, 'passport panel anchor missing'
s = s.replace(old, new, 1)

old = """        {threadOpen && (
          <div style={{
            position: 'fixed', top: 76, right: planetEdit ? 318 : 18, width: 300, maxHeight: '78vh', zIndex: 7, overflowY: 'auto',
            padding: '14px 14px', borderRadius: 16, color: '#e8dcc2',
            background: 'rgba(16,20,24,0.94)', border: '1px solid rgba(216,178,110,0.3)',
            backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)',
          }}>"""
new = """        {threadOpen && (
          <div style={{
            position: 'fixed', top: compactUI ? 0 : 76, right: compactUI ? 0 : (planetEditorOpen ? 318 : 18), bottom: compactUI ? 0 : 'auto',
            width: compactUI ? 'min(300px, 84vw)' : 300, maxHeight: compactUI ? 'none' : '78vh', zIndex: 7, overflowY: 'auto',
            padding: compactUI ? '70px 14px calc(24px + env(safe-area-inset-bottom))' : '14px 14px', borderRadius: compactUI ? 0 : 16, color: '#e8dcc2',
            background: 'rgba(16,20,24,0.95)', border: '1px solid rgba(216,178,110,0.3)',
            backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)', WebkitOverflowScrolling: 'touch',
          }}>"""
assert old in s, 'thread panel anchor missing'
s = s.replace(old, new, 1)

old = "        <ObservationJournal entries={byeoliJournal} />"
new = "        {(!compactUI || !(planetEditorOpen || passportOpen || threadOpen)) && <ObservationJournal entries={byeoliJournal} />}"
assert old in s, 'journal anchor missing'
s = s.replace(old, new, 1)

start = s.index("        <div style={{ position: 'fixed', top: 18, right: planetEdit ? 318 : 18, display: 'flex', gap: 10, zIndex: 6 }}>")
end_marker = "        {planetEdit && (\n          <div style={{"
end = s.index(end_marker, start)
old_block = s[start:end]
new_block = """        <div style={{
          position: 'fixed', top: compactUI ? 76 : 18,
          right: compactUI && (planetEditorOpen || passportOpen || threadOpen) ? 'calc(min(300px, 84vw) + 8px)' : (compactUI ? 12 : (planetEditorOpen ? 318 : 18)),
          display: 'flex', flexDirection: compactUI ? 'column' : 'row', gap: 10, zIndex: 10,
        }}>
          {(([
            ...(planetEdit ? [
              ['⚙️', () => { const opening = !planetEditorOpen; setPlanetEditorOpen(opening); if (opening) { setPassportOpen(false); setThreadOpen(false); } }, false],
            ] as [string, () => void, boolean][] : []),
            ...((planetEdit && !compactUI) ? [
              ['🪐', () => updSpec((s) => ({ ...s, theme: (['earth', 'luna', 'moon', 'desert'] as const)[((['earth', 'luna', 'moon', 'desert'] as const).indexOf(s.theme) + 1) % 4] })), false],
              ['🚶', () => updSpec((s) => ({ ...s, walker: (((s.walker ?? -1) + 2) % (walkerCount() + 1)) - 1 })), false],
              [planetPaused ? '▶' : '⏸', () => setPlanetPaused((v) => !v), false],
            ] as [string, () => void, boolean][] : []),
            ['🛂', () => { const opening = !passportOpen; setPassportOpen(opening); if (opening) { setThreadOpen(false); setPlanetEditorOpen(false); } setPassportSeenN(passport.length); try { localStorage.setItem('mimesis.passportSeenN', String(passport.length)); } catch { /* 조용히 */ } }, passport.length > passportSeenN],
            ['📖', () => { const opening = !threadOpen; setThreadOpen(opening); if (opening) { setPassportOpen(false); setPlanetEditorOpen(false); } const t = feed[0]?.t ?? 0; setThreadSeenT(t); try { localStorage.setItem('mimesis.threadSeenT', String(t)); } catch { /* 조용히 */ } }, (feed[0]?.t ?? 0) > threadSeenT],
          ]) as [string, () => void, boolean][]).map(([label, fn, dot]) => (
            <button key={label} type="button" onClick={fn} style={{
              width: 46, height: 46, borderRadius: 999, fontSize: 20, cursor: 'pointer', position: 'relative',
              border: '1px solid rgba(216,178,110,0.45)', background: 'rgba(18,24,26,0.82)',
              boxShadow: '0 6px 20px rgba(0,0,0,0.22)', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)', color: '#fff',
            }}>{label}
              {dot && (<span style={{
                position: 'absolute', top: 4, right: 4, width: 10, height: 10, borderRadius: 999,
                background: '#e5484d', border: '1.5px solid rgba(18,24,26,0.6)',
              }} />)}
            </button>
          ))}
        </div>
"""
s = s[:start] + new_block + s[end:]

old = "        {planetEdit && (\n          <div style={{\n            position: 'fixed', top: 70, right: 318, zIndex: 6,"
new = "        {planetEdit && !compactUI && (\n          <div style={{\n            position: 'fixed', top: 70, right: planetEditorOpen ? 318 : 18, zIndex: 6,"
assert old in s, 'walker badge anchor missing'
s = s.replace(old, new, 1)

# Remove the separate BUILD 396 gear button; it now lives in the shared UI rail.
old = """        {planetEdit && (
          <button type="button" onClick={() => setPlanetEditorOpen((v) => !v)} aria-label={planetEditorOpen ? '에디터 접기' : '에디터 펼치기'} style={{
            position: 'fixed', top: 76, right: planetEditorOpen ? 'min(312px, 84vw)' : 12, zIndex: 9,
            width: 44, height: 44, borderRadius: 999, cursor: 'pointer', fontSize: 18,
            color: '#e8dcc2', background: 'rgba(18,24,26,0.92)', border: '1px solid rgba(216,178,110,0.42)',
            boxShadow: '0 6px 20px rgba(0,0,0,0.24)', backdropFilter: 'blur(8px)',
          }}>{planetEditorOpen ? '×' : '⚙️'}</button>
        )}
"""
assert old in s, 'separate gear button missing'
s = s.replace(old, '', 1)

p.write_text(s)
