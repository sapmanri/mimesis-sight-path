from pathlib import Path

p = Path('src/App.tsx')
s = p.read_text()

s = s.replace("import type { PlanetEvent } from './scene/planetEvents';", "import type { PlanetEvent } from './scene/planetEvents';\nimport { getArchiveMode, getPublication, rememberCapture, rememberPlanetEvent, setArchiveMode, shouldStoreCapture, type ArchiveMode } from './life/lifeArchive';", 1)
s = s.replace("const BUILD_LABEL = 'v2.50.0 · BUILD 399 · 별이의 눈 — 먼저 바라보고, 그다음 다가간다';", "const BUILD_LABEL = 'v2.51.0 · BUILD 400 · Life Archive — 별이는 오늘부터 하루를 기록하기 시작합니다';", 1)

old = """  // BUILD 361: 촬영 허용 — 발행(세계 방송)과 완전히 별개.
  //   별이가 찍은 사진을 R2에 올리려면 이 세션에 촬영키(=발행키와 같은 PUBLISH_KEY)가 있어야 한다.
  //   세계를 KV에 발행하는 publishLive와 달리, 여기선 오직 키를 세션에 저장할 뿐 아무것도 방송하지 않는다.
  const [captureAllowed, setCaptureAllowed] = useState<boolean>(() => !!sessionStorage.getItem('mimesis.publishKey'));
  const grantCapture = () => {
    if (sessionStorage.getItem('mimesis.publishKey')) {
      // 이미 있으면 해제(토글) — 잘못 넣었을 때 다시 넣게
      sessionStorage.removeItem('mimesis.publishKey');
      setCaptureAllowed(false);
      return;
    }
    const key = window.prompt('촬영 허용 키를 입력하세요 (별이 사진을 R2에 저장)') || '';
    if (!key) return;
    sessionStorage.setItem('mimesis.publishKey', key);
    setCaptureAllowed(true);
  };
"""
new = """  // BUILD 400: R2는 촬영 허용 스위치가 아니라 Memory Archive 정책을 따른다.
  // OFF = Memory만 남기고 이미지 보관 안 함 / SMART = 의미 있는 순간만 / ALL = 모든 사진 보관.
  const [archiveMode, setArchiveModeState] = useState<ArchiveMode>(() => getArchiveMode());
  const cycleArchiveMode = () => {
    const next: ArchiveMode = archiveMode === 'OFF' ? 'SMART' : archiveMode === 'SMART' ? 'ALL' : 'OFF';
    if (next !== 'OFF' && !sessionStorage.getItem('mimesis.publishKey')) {
      const key = window.prompt('Memory Archive 키를 입력하세요 (선별된 별이 사진을 R2에 저장)') || '';
      if (!key) return;
      sessionStorage.setItem('mimesis.publishKey', key);
    }
    setArchiveMode(next);
    setArchiveModeState(next);
  };
"""
if old not in s:
    raise SystemExit('capture policy block not found')
s = s.replace(old, new, 1)

start = s.index("  // BUILD 356: 별이 스스로 찍은 순간")
end = s.index("\n  const onPlanetEvent =", start)
new_capture = """  // BUILD 400: 촬영도 먼저 Memory가 되고, R2와 Thread는 그 Memory에서 파생된다.
  const byeoliShotAt = useRef(0);
  const onByeoliCapture = (dataUrl: string, reason: 'stage' | 'mood' | 'event') => {
    if (!isSapmanri) return;
    const now = Date.now();
    if (now - byeoliShotAt.current < 3000) return;
    byeoliShotAt.current = now;
    const key = sessionStorage.getItem('mimesis.publishKey');
    const curMap = planetMode ? 'planet' : theatreMode ? 'theatre' : 'region';
    const cap = BYEOLI_SHOT_TEXT[reason];
    const text = cap[Math.floor(Math.random() * cap.length)];
    const mode = getArchiveMode();
    const storeImage = Boolean(key) && shouldStoreCapture(mode, reason, text);

    const finalizeMemory = (img: string | null) => {
      const memory = rememberCapture({ planet: curMap, reason, image: img, caption: text, archiveMode: mode });
      const publication = getPublication(memory.id);
      if (!publication?.threadReady || Math.random() > 0.4) return;
      const post: FeedPost = { id: `byeoli-${now}`, achId: `memory_${memory.id}`, icon: '📷', title: '', text, img, likes: makeLikes(), comments: makeComments('night_owl', 1 + Math.floor(Math.random() * 2)), t: now };
      setFeed((prev) => {
        const next = [post, ...prev].slice(0, 60);
        try { localStorage.setItem(FEED_KEY, JSON.stringify({ date: new Date().toDateString(), items: next })); } catch { /* 조용히 */ }
        return next;
      });
      if (key) {
        fetch('/api/feed', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Publish-Key': key },
          body: JSON.stringify({ title: post.title, text: post.text, img: post.img, icon: post.icon, likes: post.likes, comments: post.comments, memoryId: memory.id }),
        }).catch(() => { /* 발행 실패는 Memory를 바꾸지 않는다 */ });
      }
    };

    if (!storeImage) {
      finalizeMemory(null);
      return;
    }
    fetch('/api/upload-capture', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Publish-Key': key! },
      body: JSON.stringify({ map: curMap, dataUrl }),
    })
      .then((r) => r.json())
      .then((res: { ok?: boolean; url?: string }) => finalizeMemory(res.ok && res.url ? res.url : null))
      .catch(() => finalizeMemory(null));
  };
"""
s = s[:start] + new_capture + s[end:]

old = """  const onPlanetEvent = (e: PlanetEvent) => {
    const entry = eventToEntry(e);
    if (!entry) return;
"""
new = """  const onPlanetEvent = (e: PlanetEvent) => {
    const entry = eventToEntry(e);
    if (!entry) return;
    // BUILD 400: Timeline보다 먼저가 아니라, Timeline과 같은 사건에서 불변 Memory를 만든다.
    rememberPlanetEvent(e, entry.text, planetMode ? 'planet' : theatreMode ? 'theatre' : 'region');
"""
if old not in s:
    raise SystemExit('onPlanetEvent anchor not found')
s = s.replace(old, new, 1)

ui_start = s.index("  const captureGrantUI = isSapmanri ? (")
ui_end = s.index("\n  const passportFeedUI =", ui_start)
new_ui = """  const captureGrantUI = isSapmanri ? (
    <button
      type="button"
      onClick={cycleArchiveMode}
      title={archiveMode === 'OFF' ? 'Memory는 남기고 사진 파일은 보관하지 않음' : archiveMode === 'SMART' ? 'AI 편집장이 의미 있는 Memory 사진만 R2에 보관' : '모든 Memory 사진을 R2에 보관'}
      style={{
        position: 'fixed', bottom: 18, left: 18, zIndex: 9,
        padding: '8px 12px', borderRadius: 10, cursor: 'pointer', fontSize: 12, fontWeight: 600,
        border: '1px solid ' + (archiveMode === 'SMART' ? '#6d7652' : archiveMode === 'ALL' ? '#355743' : '#5a5346'),
        background: archiveMode === 'SMART' ? 'rgba(79,86,57,0.92)' : archiveMode === 'ALL' ? 'rgba(53,87,67,0.92)' : 'rgba(24,26,25,0.86)',
        color: '#eaf5ec',
      }}
    >🗃 Memory Archive · {archiveMode}</button>
  ) : null;
"""
s = s[:ui_start] + new_ui + s[ui_end:]

p.write_text(s)
