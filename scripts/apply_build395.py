from pathlib import Path
import re

APP = Path('src/App.tsx')
PLANET = Path('src/scene/PlanetWorld.tsx')

app = APP.read_text()
planet = PLANET.read_text()

# --- App: finish the observation journal integration and bump the visible build label.
if "import { ObservationJournal, type ByeoliJournalEntry } from './components/ObservationJournal';" not in app:
    app = app.replace(
        "import { TouchTrail } from './components/TouchTrail';",
        "import { TouchTrail } from './components/TouchTrail';\nimport { ObservationJournal, type ByeoliJournalEntry } from './components/ObservationJournal';",
        1,
    )

app = re.sub(
    r"const BUILD_LABEL = '[^']*BUILD 393[^']*';",
    "const BUILD_LABEL = 'v2.46.0 · BUILD 395 · 관찰일기 + 손 소품/접근 거리 교정';",
    app,
    count=1,
)

old_state = """  // BUILD 393: 실제 상태 전환에 근거한 제3자 관찰자 나레이션.
  const [byeoliNarration, setByeoliNarration] = useState({ text: '별이는 천천히 주변을 살피며 걷고 있다.', key: 0 });
  const onByeoliNarration = (text: string) => setByeoliNarration({ text, key: Date.now() });"""
new_state = """  // BUILD 395: 티커가 아니라 누적되는 관찰일기. 새 기록은 써지고 오래된 줄은 흐려진다.
  const [byeoliJournal, setByeoliJournal] = useState<ByeoliJournalEntry[]>([
    { id: 1, text: '별이는 천천히 주변을 살피며 걷고 있다.', at: Date.now() },
  ]);
  const onByeoliNarration = (text: string) => setByeoliJournal((prev) => {
    if (prev[prev.length - 1]?.text === text) return prev;
    return [...prev, { id: Date.now(), text, at: Date.now() }].slice(-12);
  });"""
if old_state in app:
    app = app.replace(old_state, new_state, 1)
elif 'const [byeoliJournal' not in app:
    raise SystemExit('App journal state anchor not found')

if '<ObservationJournal entries={byeoliJournal} />' not in app:
    pattern = re.compile(
        r"        <div key=\{byeoliNarration\.key\} style=\{\{.*?        </div>\n(?=        \{flagWhisper && \()",
        re.S,
    )
    app, n = pattern.subn("        <ObservationJournal entries={byeoliJournal} />\n", app, count=1)
    if n != 1:
        raise SystemExit(f'old narration card replacement count={n}')

# --- PlanetWorld: stop scaling the device mount by the inverse hand world scale.
old_mount = """        group.updateMatrixWorld(true);
        const ws = new THREE.Vector3(); h.getWorldScale(ws);
        const mountDevice = (kind: 'camera' | 'phone') => {
          const wrapper = new THREE.Group();
          wrapper.scale.setScalar(1 / Math.max(ws.x, 1e-6));
          wrapper.visible = false;
          h.add(wrapper);"""
new_mount = """        group.updateMatrixWorld(true);
        const mountDevice = (kind: 'camera' | 'phone') => {
          const wrapper = new THREE.Group();
          // BUILD 395: 손 본의 자식은 이미 본 변환을 상속한다. 월드 스케일 역보정은
          // 작은 로컬 오프셋까지 크게 증폭해 소품이 몸 주위를 공전하게 만들었다.
          wrapper.scale.setScalar(1);
          wrapper.visible = false;
          h.add(wrapper);"""
if old_mount not in planet:
    raise SystemExit('held-device mount anchor not found')
planet = planet.replace(old_mount, new_mount, 1)

planet = planet.replace(
    "wrapper.position.set(0.015, -0.035, -0.035);\n            wrapper.rotation.set(Math.PI / 2, 0, Math.PI);",
    "wrapper.position.set(0, -0.018, -0.01);\n            wrapper.rotation.set(Math.PI / 2, 0, Math.PI);",
    1,
)
planet = planet.replace(
    "wrapper.position.set(0.01, -0.025, -0.02);\n            wrapper.rotation.set(Math.PI / 2, 0, Math.PI / 2);",
    "wrapper.position.set(0, -0.012, -0.006);\n            wrapper.rotation.set(Math.PI / 2, 0, Math.PI / 2);",
    1,
)

# --- PlanetWorld: use object-specific arrival distances instead of the old universal 0.14 radians.
old_arrival = """            const ang = Math.acos(THREE.MathUtils.clamp(RM.d.dot(T2.d), -1, 1));
            if (ang < 0.14) {
              // 도착 — 소품을 바라보게 몸을 돌린다(등지고 딴 데 보는 것 방지). 그다음 욕구로 행동 선택."""
new_arrival = """            const ang = Math.acos(THREE.MathUtils.clamp(RM.d.dot(T2.d), -1, 1));
            const targetProp = SP.props.find((pr) => pr.id === T2.id);
            const arrivalAngleByObject: Record<string, number> = {
              book: 0.034,
              'rock-small': 0.034,
              chair: 0.042,
              tree: 0.055,
              'rock-big': 0.06,
              lighthouse: 0.085,
            };
            const arrivalAngle = arrivalAngleByObject[targetProp?.obj ?? ''] ?? 0.05;
            if (ang < arrivalAngle) {
              // BUILD 395: 책·작은 물건은 손 닿을 만큼 가까이, 큰 구조물은 적당한 감상 거리를 둔다.
              // 도착 — 소품을 바라보게 몸을 돌린다(등지고 딴 데 보는 것 방지). 그다음 욕구로 행동 선택."""
if old_arrival not in planet:
    raise SystemExit('arrival-distance anchor not found')
planet = planet.replace(old_arrival, new_arrival, 1)

APP.write_text(app)
PLANET.write_text(planet)
