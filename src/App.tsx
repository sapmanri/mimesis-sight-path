import { Canvas } from '@react-three/fiber';
import { useEffect, useRef, useState } from 'react';
import { jejuScenes } from './data/jeju';
import { World } from './scene/World';
import { PlanetWorld, flagIsKnownCountry } from './scene/PlanetWorld';
import { walkerCount } from './engine/worldCore';
import { DEFAULT_PLANET_SPEC, loadPlanetDraft, savePlanetDraft, type PlanetSpec, type PlanetMemory, type PlanetContact, type PlanetApi } from './scene/planetSpec';
import { PROP_CATALOG } from './engine/props';
import { PET_ROSTER } from './engine/pets';

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
import { planetSound } from './audio/planetSound';
import { compileScenes } from './engine/blueprint';
import { eventToEntry, type TimelineEntry } from './planet/timeline';
import { ACHIEVEMENTS, evaluateAchievements } from './planet/achievements';
import { makeComments, makeLikes, type FeedComment } from './planet/thread';
import type { PlanetEvent } from './scene/planetEvents';
import { JEJU_SPEC, type WorldSpec } from './engine/worldSpec';
import './photo-depth-road.css';

const AUTO_RESUME_MS = 12000; // BUILD 101: 탭으로 머문 뒤 12초면 다시 저절로 걷는다
const BUILD_LABEL = 'v1.8.9 · CLEAN THE GHOST · BUILD 261';

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
    if (q.has('edit') || q.has('draft')) {
      const draft = loadPlanetDraft();
      // BUILD 261: 유령 소품 청소 — ?cleartent=1 이면 드래프트에서 텐트 제거 (목록에서 안 지워지는 것 강제 정리)
      if (q.has('cleartent')) {
        const cleaned = { ...draft, props: (draft.props ?? []).filter((p) => p.obj !== 'tent') };
        savePlanetDraft(cleaned);
        return cleaned;
      }
      return draft;
    }
    const s = { ...DEFAULT_PLANET_SPEC, memories: [] as PlanetMemory[], walker: 0 }; // BUILD 253: 방문자 기본 캐릭터 0(랜덤 금지, KV 도착 전까지)
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
  // BUILD 248: 방문자는 '세상에 나간 행성'(KV live)을 읽는다. 에디터/드래프트는 제외(각자 놀이터).
  // 도착 전까지 DEFAULT로 렌더하다가, 응답이 오면 조용히 교체한다.
  useEffect(() => {
    if (!planetMode) return;
    const q = new URLSearchParams(window.location.search);
    if (q.has('edit') || q.has('draft')) return; // 놀이터 모드는 KV 안 읽음
    let alive = true;
    fetch('/api/planet')
      .then((r) => (r.status === 200 ? r.json() : null))
      .then((live) => {
        if (!alive || !live) return;
        setPSpec({
          ...DEFAULT_PLANET_SPEC,
          ...live,
          walker: typeof live.walker === 'number' ? live.walker : 0, // BUILD 253: 발행에 walker 없으면 0 고정(랜덤 금지)
          moon: { ...DEFAULT_PLANET_SPEC.moon, ...(live.moon ?? {}) },
          sun: { ...DEFAULT_PLANET_SPEC.sun, ...(live.sun ?? {}) },
          memories: Array.isArray(live.memories) ? live.memories : [],
          props: Array.isArray(live.props) ? live.props : [],
        });
      })
      .catch(() => { /* KV 없거나 실패 → DEFAULT 유지 */ });
    return () => { alive = false; };
  }, [planetMode]);
  // BUILD 248: 세상에 반영 — 현재 드래프트를 KV live 슬롯으로 발행. 발행 키는 한 번만 물어보고 세션에 기억.
  const [pubState, setPubState] = useState<'idle' | 'busy' | 'ok' | 'err'>('idle');
  const publishLive = async () => {
    let key = sessionStorage.getItem('mimesis.publishKey') || '';
    if (!key) {
      key = window.prompt('발행 키를 입력하세요 (세상에 반영)') || '';
      if (!key) return;
      sessionStorage.setItem('mimesis.publishKey', key);
    }
    setPubState('busy');
    try {
      const r = await fetch('/api/planet', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'X-Publish-Key': key },
        body: JSON.stringify(pSpec),
      });
      if (r.ok) { setPubState('ok'); setTimeout(() => setPubState('idle'), 2500); }
      else {
        if (r.status === 401) sessionStorage.removeItem('mimesis.publishKey'); // 틀린 키는 잊는다
        setPubState('err'); setTimeout(() => setPubState('idle'), 3000);
      }
    } catch { setPubState('err'); setTimeout(() => setPubState('idle'), 3000); }
  };
  const planetWalker = pSpec.walker ?? -1; // BUILD 251: 산책자는 스펙이 정한다 (발행 시 고정)
  const [planetPaused, setPlanetPaused] = useState(false); // BUILD 224: 찍기의 평화
  // BUILD 214: 소품 심기 — 접점은 PlanetWorld가 매 프레임 보고한다
  const planetContact = useRef<PlanetContact | null>(null);
  const [propPick, setPropPick] = useState('tree');
  const [propScale, setPropScale] = useState(1);
  // BUILD 216: 찍어서 배치 + 선택·키보드 편집 — 에디터의 본분
  const planetApi = useRef<PlanetApi | null>(null);
  const [placeArm, setPlaceArm] = useState<null | { mode: 'new' } | { mode: 'move'; id: string }>(null);
  const [propSel, setPropSel] = useState<string | null>(null);
  // BUILD 222: 깃발 속삭임 — 멈추지 않고, 이름만 스친다
  const [flagWhisper, setFlagWhisper] = useState<string | null>(null);
  const whisperTimer = useRef<number | null>(null);
  // BUILD 226: 여권 — 우연히 지난 곳들의 기록. 도장이 아니라 기억.
  const PASSPORT_KEY = 'mimesis.planetPassport.v1';
  const [passport, setPassport] = useState<string[]>(() => {
    try {
      const raw = localStorage.getItem(PASSPORT_KEY);
      if (!raw) return [];
      const d = JSON.parse(raw) as { date: string; names: string[] };
      // BUILD 253: 예전에 새어 들어간 이니셜(ㅎ·호·훗)을 로드 시 걸러낸다 — 진짜 나라만 남긴다
      const clean = (d.date === new Date().toDateString() ? d.names : []).filter((n) => flagIsKnownCountry(n));
      return clean;
    } catch { return []; }
  });
  const [passportOpen, setPassportOpen] = useState(false);
  const TIMELINE_KEY = 'mimesis.planetTimeline.v1';
  const [timeline, setTimeline] = useState<TimelineEntry[]>(() => {
    try { const raw = localStorage.getItem(TIMELINE_KEY); if (raw) { const p = JSON.parse(raw); if (p.date === new Date().toDateString() && Array.isArray(p.items)) return p.items; } } catch { /* 조용히 */ }
    return [];
  });
  const lastEntryKind = useRef<{ kind: string; t: number }>({ kind: '', t: 0 });
  const FEED_KEY = 'mimesis.planetFeed.v1';
  type FeedPost = { id: string; achId: string; icon: string; title: string; text: string; img: string | null; likes: number; comments: FeedComment[]; t: number };
  const [feed, setFeed] = useState<FeedPost[]>(() => {
    try { const raw = localStorage.getItem(FEED_KEY); if (raw) { const p = JSON.parse(raw); if (p.date === new Date().toDateString() && Array.isArray(p.items)) return p.items; } } catch { /* 조용히 */ }
    return [];
  });
  const [threadOpen, setThreadOpen] = useState(false);
  // BUILD 251: 안 읽음 빨간점 — 각 클라이언트 로컬 저장(사람마다 읽은 상태가 다르다)
  const [threadSeenT, setThreadSeenT] = useState<number>(() => { try { return Number(localStorage.getItem('mimesis.threadSeenT')) || 0; } catch { return 0; } });
  const [passportSeenN, setPassportSeenN] = useState<number>(() => { try { return Number(localStorage.getItem('mimesis.passportSeenN')) || 0; } catch { return 0; } });
  const [threadMuted, setThreadMuted] = useState<boolean>(() => { try { return localStorage.getItem('mimesis.threadMuted') === '1'; } catch { return false; } });
  const threadMutedRef = useRef(threadMuted);
  threadMutedRef.current = threadMuted;
  const earnedIds = useRef<Set<string>>(new Set());
  // BUILD 250: 공용 스레드 — 삽만리(에디터/드래프트)만 글을 쓰고, 방문자는 KV 공용 피드를 읽는다.
  const isSapmanri = useRef<boolean>((() => {
    const q = new URLSearchParams(window.location.search);
    return q.has('edit') || q.has('draft');
  })()).current;
  // 방문자: 공용 스레드를 읽어온다 (10초마다 새로고침 — 삽만리가 새 글 올리면 곧 보인다)
  useEffect(() => {
    if (!planetMode || isSapmanri) return; // 삽만리는 자기 로컬 피드를 쓰고 KV에도 발행(아래)
    let alive = true;
    const load = () => fetch('/api/feed')
      .then((r) => r.ok ? r.json() : [])
      .then((list: FeedPost[]) => { if (alive && Array.isArray(list)) setFeed(list); })
      .catch(() => { /* 조용히 */ });
    load();
    const iv = window.setInterval(load, 10000);
    return () => { alive = false; window.clearInterval(iv); };
  }, [planetMode, isSapmanri]);
  useEffect(() => { feed.forEach((p) => earnedIds.current.add(p.achId)); }, []); // 초기 복원
  // 타임라인이 바뀔 때마다 성과 판정 → 새 성과면 스크린샷 + 피드 포스트
  useEffect(() => {
    if (!timeline.length) return;
    if (!isSapmanri) return; // BUILD 250: 방문자 산책은 공용 피드를 오염시키지 않는다 — 읽기만
    const nowEarned = evaluateAchievements(timeline);
    const fresh = [...nowEarned].filter((id) => !earnedIds.current.has(id));
    if (!fresh.length) return;
    // 캡처는 다음 프레임 이후에 — api·canvas가 준비되고 한 프레임 그려진 뒤라야 그림이 담긴다
    const timer = setTimeout(() => {
      for (const id of fresh) {
        if (earnedIds.current.has(id)) continue;
        earnedIds.current.add(id);
        const ach = ACHIEVEMENTS.find((a) => a.id === id);
        if (!ach) continue;
        const img = planetApi.current?.capture() ?? null;
        const post: FeedPost = { id: `${id}-${Date.now()}`, achId: id, icon: ach.icon, title: ach.title, text: ach.earnedText, img, likes: makeLikes(), comments: makeComments(id, 2 + Math.floor(Math.random() * 2)), t: Date.now() };
        if (!threadMuted) {
          planetSound.shutter(); // 찰칵 — 사진 올린다
          post.comments.forEach((_, ci) => window.setTimeout(() => { if (!threadMutedRef.current) planetSound.comment(); }, 700 + ci * 550)); // 댓글이 하나씩 달린다
        }
        setFeed((prev) => {
          const next = [post, ...prev].slice(0, 60);
          try { localStorage.setItem(FEED_KEY, JSON.stringify({ date: new Date().toDateString(), items: next })); } catch { /* 조용히 */ }
          return next;
        });
        // BUILD 250: 삽만리가 남긴 관찰을 공용 스레드로도 발행 (방문자 전원이 본다)
        const key = sessionStorage.getItem('mimesis.publishKey');
        if (key) {
          fetch('/api/feed', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-Publish-Key': key },
            body: JSON.stringify({ title: post.title, text: post.text, img: post.img, icon: post.icon, likes: post.likes, comments: post.comments }),
          }).catch(() => { /* 발행 실패는 조용히 — 로컬엔 이미 남았다 */ });
        }
      }
    }, 120);
    return () => clearTimeout(timer);
  }, [timeline]);
  const onPlanetEvent = (e: PlanetEvent) => {
    const entry = eventToEntry(e);
    if (!entry) return;
    // 같은 종류 연타 방지 (밤낮·비 등): 8초 내 같은 kind는 무시
    const L = lastEntryKind.current;
    if (L.kind === entry.kind && e.t - L.t < 8000) return;
    lastEntryKind.current = { kind: entry.kind, t: e.t };
    setTimeline((prev) => {
      const next = [entry, ...prev].slice(0, 200);
      try { localStorage.setItem(TIMELINE_KEY, JSON.stringify({ date: new Date().toDateString(), items: next })); } catch { /* 조용히 */ }
      return next;
    });
  };
  const onFlagPop = (name: string) => {
    if (!name || !name.trim()) return; // BUILD 238: 이름 없는 깃발(이니셜 페넌트)은 여권에 남기지 않는다
    if (!flagIsKnownCountry(name)) return; // BUILD 253: 진짜 나라만 여권에 — 'ㅎ·호·훗' 이중 방어
    setFlagWhisper(name);
    if (whisperTimer.current) window.clearTimeout(whisperTimer.current);
    whisperTimer.current = window.setTimeout(() => setFlagWhisper(null), 3400);
    setPassport((prev) => {
      if (prev.includes(name)) return prev;
      const next = [...prev, name];
      try { localStorage.setItem(PASSPORT_KEY, JSON.stringify({ date: new Date().toDateString(), names: next })); } catch { /* 조용히 */ }
      return next;
    });
  };
  const placeAt = (e: React.PointerEvent) => {
    const hit = planetApi.current?.pick(e.clientX, e.clientY);
    if (!hit || !placeArm) { setPlaceArm(null); return; }
    if (placeArm.mode === 'new') {
      const id = `p${Date.now().toString(36)}${Math.floor(Math.random() * 99)}`;
      updSpec((s) => ({ ...s, props: [...(s.props ?? []), { id, obj: propPick, dir: hit.dir, r: hit.r, rotY: 0, scale: propScale, tilt: 0, lift: 0 }] }));
      setPropSel(id);
    } else {
      const mid = placeArm.id;
      updSpec((s) => ({ ...s, props: (s.props ?? []).map((x) => (x.id === mid ? { ...x, dir: hit.dir, r: hit.r } : x)) }));
    }
    setPlaceArm(null);
  };
  useEffect(() => {
    if (!planetEdit) return undefined;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setPlaceArm(null); return; }
      if (!propSel) return;
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
      const big = e.shiftKey;
      const upd = (fn: (p: PlanetSpec['props'][number]) => Partial<PlanetSpec['props'][number]>) =>
        updSpec((s) => ({ ...s, props: (s.props ?? []).map((x) => (x.id === propSel ? { ...x, ...fn(x) } : x)) }));
      const move = (du: number, dv: number) => upd((p) => {
        const [dx, dy, dz] = p.dir;
        // 접선 기저: e=cross(up0,dir), n=cross(dir,e) — 극점 근처는 x축 기준으로 회피
        const up0 = Math.abs(dy) > 0.94 ? [1, 0, 0] : [0, 1, 0];
        let ex = up0[1] * dz - up0[2] * dy, ey = up0[2] * dx - up0[0] * dz, ez = up0[0] * dy - up0[1] * dx;
        const el = Math.hypot(ex, ey, ez) || 1; ex /= el; ey /= el; ez /= el;
        const nx = dy * ez - dz * ey, ny = dz * ex - dx * ez, nz = dx * ey - dy * ex;
        const st = big ? 0.3 : 0.08;
        const px = dx * p.r + (ex * du + nx * dv) * st, py = dy * p.r + (ey * du + ny * dv) * st, pz = dz * p.r + (ez * du + nz * dv) * st;
        const r0 = Math.hypot(px, py, pz);
        return { dir: [px / r0, py / r0, pz / r0] as [number, number, number] };
      });
      switch (e.key) {
        case 'ArrowLeft': e.preventDefault(); move(-1, 0); break;
        case 'ArrowRight': e.preventDefault(); move(1, 0); break;
        case 'ArrowUp': e.preventDefault(); move(0, 1); break;
        case 'ArrowDown': e.preventDefault(); move(0, -1); break;
        case 'PageUp': e.preventDefault(); upd((p) => ({ lift: +((p.lift ?? 0) + (big ? 0.12 : 0.04)).toFixed(3) })); break;
        case 'PageDown': e.preventDefault(); upd((p) => ({ lift: +((p.lift ?? 0) - (big ? 0.12 : 0.04)).toFixed(3) })); break;
        case 'r': case 'R': upd((p) => ({ rotY: p.rotY + ((big ? 30 : 10) * Math.PI) / 180 })); break;
        case 'f': case 'F': upd((p) => ({ rotY: p.rotY - ((big ? 30 : 10) * Math.PI) / 180 })); break;
        case 't': case 'T': upd((p) => ({ tilt: (p.tilt ?? 0) + (5 * Math.PI) / 180 })); break;
        case 'g': case 'G': upd((p) => ({ tilt: (p.tilt ?? 0) - (5 * Math.PI) / 180 })); break;
        case '+': case '=': upd((p) => ({ scale: +(p.scale * 1.08).toFixed(3) })); break;
        case '-': case '_': upd((p) => ({ scale: +(p.scale / 1.08).toFixed(3) })); break;
        case 'Delete': case 'Backspace':
          e.preventDefault();
          updSpec((s) => ({ ...s, props: (s.props ?? []).filter((x) => x.id !== propSel) }));
          setPropSel(null);
          break;
        default: break;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [planetEdit, propSel]);
  const plantProp = () => {
    const c = planetContact.current;
    if (!c) return;
    // 발밑에서 좌우로 살짝 비켜 심는다 — 그녀가 밟고 지나가지 않게
    const [dx, dy, dz] = c.dir;
    const [tx, ty, tz] = c.tan;
    let sx = dy * tz - dz * ty, sy = dz * tx - dx * tz, sz = dx * ty - dy * tx;
    const sl = Math.hypot(sx, sy, sz) || 1;
    const off = (Math.random() < 0.5 ? 1 : -1) * 0.62;
    let px = dx * c.r + (sx / sl) * off, py = dy * c.r + (sy / sl) * off, pz = dz * c.r + (sz / sl) * off;
    const r = Math.hypot(px, py, pz);
    px /= r; py /= r; pz /= r;
    updSpec((s) => ({
      ...s,
      props: [...(s.props ?? []), { id: `p${Date.now().toString(36)}${Math.floor(Math.random() * 99)}`, obj: propPick, dir: [px, py, pz] as [number, number, number], r, rotY: Math.random() * Math.PI * 2, scale: propScale }],
    }));
  };
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
          <Canvas className="world-canvas" camera={{ position: [0, 2.25, 5.6], fov: 42 }} dpr={[1, 2]} shadows gl={{ preserveDrawingBuffer: true }}>
            <PlanetWorld spec={pSpec} walkerIdx={planetWalker} paused={planetPaused} onMemory={setMemCard} onFlag={onFlagPop} onEvent={onPlanetEvent} contactRef={planetContact} apiRef={planetApi} />
          </Canvas>
        </div>
        <div className="atmosphere-grain" aria-hidden="true" />
        {passportOpen && (
          <div style={{
            position: 'fixed', top: 76, right: planetEdit ? 318 : 18, width: 250, zIndex: 6,
            padding: '14px 16px', borderRadius: 14, color: '#e8dcc2',
            background: 'rgba(18,24,26,0.9)', border: '1px solid rgba(216,178,110,0.3)',
            backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)',
          }}>
            <div style={{ fontSize: 12, color: '#d8b26e', letterSpacing: 2, marginBottom: 8 }}>여권 — 오늘의 우연</div>
            {passport.length > 0 && (
              <div style={{ fontSize: 12.5, lineHeight: 1.9, marginBottom: 10, paddingBottom: 10, borderBottom: '1px solid rgba(216,178,110,0.15)' }}>{passport.join(' · ')}</div>
            )}
            {timeline.length > 0 ? (
              <div style={{ maxHeight: 320, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 7 }}>
                {timeline.map((it) => (
                  <div key={it.id} style={{ display: 'flex', gap: 8, alignItems: 'baseline', fontSize: 12.5, lineHeight: 1.5 }}>
                    <span style={{ fontSize: 14, flexShrink: 0 }}>{it.icon}</span>
                    <span>{it.text}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ fontSize: 12, opacity: 0.6, lineHeight: 1.7 }}>아직 아무 일도 일어나지 않았어요.<br />돌려두고, 하던 일을 하세요.</div>
            )}
            <div style={{ fontSize: 11, opacity: 0.55, marginTop: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>오늘 {timeline.length}가지 일이 있었습니다</span>
              <button type="button" onClick={() => { setPassport([]); setTimeline([]); try { localStorage.removeItem(PASSPORT_KEY); localStorage.removeItem(TIMELINE_KEY); } catch { /* 조용히 */ } }}
                style={{ background: 'none', border: '1px solid rgba(216,178,110,0.35)', color: '#d8b26e', borderRadius: 8, padding: '2px 8px', fontSize: 10.5, cursor: 'pointer' }}>비우기</button>
            </div>
            <div style={{ fontSize: 10.5, opacity: 0.4, marginTop: 10, textAlign: 'right' }}>오늘도 느리게 · slow days</div>
          </div>
        )}
        {threadOpen && (
          <div style={{
            position: 'fixed', top: 76, right: planetEdit ? 318 : 18, width: 300, maxHeight: '78vh', zIndex: 7, overflowY: 'auto',
            padding: '14px 14px', borderRadius: 16, color: '#e8dcc2',
            background: 'rgba(16,20,24,0.94)', border: '1px solid rgba(216,178,110,0.3)',
            backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <span style={{ fontSize: 13, color: '#d8b26e', letterSpacing: 1 }}>기록 · @she_walks_slow</span>
              <button type="button" onClick={() => { const v = !threadMuted; setThreadMuted(v); try { localStorage.setItem('mimesis.threadMuted', v ? '1' : '0'); } catch { /* 조용히 */ } }}
                title={threadMuted ? '스레드 알람 켜기' : '스레드 알람 끄기'}
                style={{ background: 'none', border: '1px solid rgba(216,178,110,0.3)', color: '#d8b26e', borderRadius: 8, padding: '3px 9px', fontSize: 11, cursor: 'pointer' }}>
                {threadMuted ? '🔕 알람 꺼짐' : '🔔 알람 켜짐'}
              </button>
            </div>
            {feed.length === 0 ? (
              <div style={{ fontSize: 12, opacity: 0.6, lineHeight: 1.7 }}>아직 남긴 기록이 없어요.<br />걷다 보면 하나씩 쌓입니다.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                {feed.map((post) => (
                  <div key={post.id} style={{ borderBottom: '1px solid rgba(216,178,110,0.14)', paddingBottom: 12 }}>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6 }}>
                      <span style={{ fontSize: 20 }}>{post.icon}</span>
                      <div style={{ lineHeight: 1.2 }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: '#e8dcc2' }}>{post.title}</div>
                        <div style={{ fontSize: 11, opacity: 0.55 }}>@she_walks_slow</div>
                      </div>
                    </div>
                    {post.img && (
                      <div style={{ position: 'relative', marginBottom: 6 }}>
                        <img src={post.img} alt="" style={{ width: '100%', borderRadius: 10, display: 'block' }} />
                        <button type="button" title="사진 저장"
                          onClick={() => { const a = document.createElement('a'); a.href = post.img!; a.download = `sapmanri_${post.achId}_${post.t}.jpg`; a.click(); }}
                          style={{ position: 'absolute', right: 8, bottom: 8, background: 'rgba(0,0,0,0.55)', border: '1px solid rgba(255,255,255,0.3)', color: '#fff', borderRadius: 8, padding: '4px 9px', fontSize: 11, cursor: 'pointer', backdropFilter: 'blur(4px)' }}>
                          ⬇ 저장
                        </button>
                      </div>
                    )}
                    <div style={{ fontSize: 12.5, lineHeight: 1.5, marginBottom: 6 }}>{post.text}</div>
                    <div style={{ fontSize: 11.5, opacity: 0.6, marginBottom: 6 }}>♥ {post.likes}</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      {post.comments.map((c, i) => (
                        <div key={i} style={{ fontSize: 11.5, lineHeight: 1.4 }}>
                          <span style={{ marginRight: 5 }}>{c.persona.avatar}</span>
                          <span style={{ color: '#d8b26e' }}>{c.persona.name}</span>
                          <span style={{ opacity: 0.85 }}> {c.text}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
            {isSapmanri && feed.length > 0 && (
              <button type="button" onClick={() => { setFeed([]); earnedIds.current.clear(); try { localStorage.removeItem(FEED_KEY); } catch { /* 조용히 */ } }}
                style={{ marginTop: 10, background: 'none', border: '1px solid rgba(216,178,110,0.35)', color: '#d8b26e', borderRadius: 8, padding: '3px 10px', fontSize: 10.5, cursor: 'pointer' }}>기록 비우기 (로컬)</button>
            )}
          </div>
        )}
        {flagWhisper && (
          <div key={flagWhisper + String(Date.now() % 7)} style={{
            position: 'fixed', top: 64, left: '50%', transform: 'translateX(-50%)', zIndex: 6,
            padding: '8px 22px', borderRadius: 999, fontSize: 14, letterSpacing: 1,
            color: '#f4efe2', background: 'rgba(18,24,26,0.72)', border: '1px solid rgba(216,178,110,0.3)',
            backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)',
            animation: 'whisper-in 0.45s cubic-bezier(0.34,1.56,0.64,1)',
          }}>
            <style>{'@keyframes whisper-in { from { opacity: 0; transform: translateX(-50%) translateY(10px) scale(0.92); } to { opacity: 1; transform: translateX(-50%) translateY(0) scale(1); } }'}</style>
            저기는, {flagWhisper}
          </div>
        )}
        {placeArm && (
          <div onPointerDown={placeAt} style={{
            position: 'fixed', inset: 0, zIndex: 7, cursor: 'crosshair',
            background: 'rgba(216,178,110,0.04)',
          }}>
            <div style={{
              position: 'absolute', top: 16, left: '50%', transform: 'translateX(-50%)',
              padding: '7px 16px', borderRadius: 999, fontSize: 12, color: '#e8dcc2',
              background: 'rgba(18,24,26,0.9)', border: '1px solid rgba(216,178,110,0.4)',
            }}>{placeArm.mode === 'new' ? '표면을 찍으세요 — 그 자리에 심어집니다' : '표면을 찍으세요 — 그 자리로 옮깁니다'} (Esc 취소)</div>
          </div>
        )}
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
          {(([
            // 에디터 전용 — 세계를 바꾸거나 동기를 깨는 도구는 방문자에게 숨긴다 (BUILD 249)
            ...(planetEdit ? [
              ['🪐', () => updSpec((s) => ({ ...s, theme: (['earth', 'luna', 'moon', 'desert'] as const)[((['earth', 'luna', 'moon', 'desert'] as const).indexOf(s.theme) + 1) % 4] })), false],
              ['🚶', () => updSpec((s) => ({ ...s, walker: (((s.walker ?? -1) + 2) % (walkerCount() + 1)) - 1 })), false],
              [planetPaused ? '▶' : '⏸', () => setPlanetPaused((v) => !v), false],
            ] as [string, () => void, boolean][] : []),
            // 방문자도 함께 — 세계를 바꾸지 않는 '구경' 도구. 세 번째 = 안 읽음 빨간점.
            ['🛂', () => { setPassportOpen((v) => !v); setPassportSeenN(passport.length); try { localStorage.setItem('mimesis.passportSeenN', String(passport.length)); } catch { /* 조용히 */ } }, passport.length > passportSeenN],
            ['📖', () => { setThreadOpen((v) => !v); const t = feed[0]?.t ?? 0; setThreadSeenT(t); try { localStorage.setItem('mimesis.threadSeenT', String(t)); } catch { /* 조용히 */ } }, (feed[0]?.t ?? 0) > threadSeenT],
          ]) as [string, () => void, boolean][]).map(([label, fn, dot]) => (
            <button key={label} type="button" onClick={fn} style={{
              width: 46, height: 46, borderRadius: 999, fontSize: 20, cursor: 'pointer', position: 'relative',
              border: '1px solid rgba(255,255,255,0.35)', background: 'rgba(255,255,255,0.10)',
              backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)', color: '#fff',
            }}>{label}
              {dot && (<span style={{
                position: 'absolute', top: 4, right: 4, width: 10, height: 10, borderRadius: 999,
                background: '#e5484d', border: '1.5px solid rgba(18,24,26,0.6)',
              }} />)}
            </button>
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
            <Dial label="반지름" value={pSpec.radius} min={1} max={22} step={0.25} onChange={(v) => updSpec((s) => ({ ...s, radius: v }))} />
            <Dial label="굴곡" value={pSpec.relief} min={0} max={8} step={0.05} onChange={(v) => updSpec((s) => ({ ...s, relief: v }))} />
            <Dial label="안개 수위" value={pSpec.fogLevel} min={0} max={1.2} step={0.01} onChange={(v) => updSpec((s) => ({ ...s, fogLevel: v }))} />
            <Dial label="안개 농도" value={pSpec.fogStrength} min={0} max={1} step={0.02} onChange={(v) => updSpec((s) => ({ ...s, fogStrength: v }))} />
            <Dial label="시야 거리" value={pSpec.viewDist ?? 41} min={6} max={140} step={1} onChange={(v) => updSpec((s) => ({ ...s, viewDist: v }))} />
            <Dial label="걸음" value={pSpec.walkSpeed} min={0.25} max={1.4} step={0.01} onChange={(v) => updSpec((s) => ({ ...s, walkSpeed: v }))} />
            <Dial label="감김 (바퀴)" value={pSpec.wraps} min={2} max={7} step={1} onChange={(v) => updSpec((s) => ({ ...s, wraps: v }))} />
            <Dial label="길의 요동" value={pSpec.wobble} min={0.2} max={1.8} step={0.05} onChange={(v) => updSpec((s) => ({ ...s, wobble: v }))} />
            <Dial label="교차로 — 저 길을 고를 확률" value={pSpec.ponderChance} min={0} max={1} step={0.05} onChange={(v) => updSpec((s) => ({ ...s, ponderChance: v }))} />
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11.5, margin: '10px 0', cursor: 'pointer' }}>
              <input type="checkbox" checked={pSpec.roam ?? false} onChange={(e) => updSpec((s) => ({ ...s, roam: e.target.checked }))} />
              🧭 자유 배회 — 지구본 모드 (길·기억 없이 마음대로)
            </label>
            <Dial label="뛰기 주기 (s · 0=안 뜀)" value={pSpec.runEvery ?? 45} min={0} max={180} step={5} onChange={(v) => updSpec((s) => ({ ...s, runEvery: v }))} />
            <Dial label="탈것 주기 (s · 0=안 탐)" value={pSpec.rideEvery ?? 120} min={0} max={360} step={10} onChange={(v) => updSpec((s) => ({ ...s, rideEvery: v }))} />
            <label style={{ display: 'block', fontSize: 11, margin: '6px 0' }}>
              반려 — 뒤를 따라오는 작은 식구
              <select value={pSpec.pet ?? 'none'} onChange={(e) => updSpec((s) => ({ ...s, pet: e.target.value }))}
                style={{ width: '100%', marginTop: 4, background: '#101617', color: '#e8dcc2', border: '1px solid #3a423f', borderRadius: 6, padding: 5 }}>
                <option value="none">없음</option>
                {PET_ROSTER.map((pd) => <option key={pd.id} value={pd.id}>{pd.label}</option>)}
              </select>
            </label>
            <div style={{ fontSize: 12, color: '#d8b26e', margin: '12px 0 2px' }}>하늘</div>
            <Dial label="구름 — 하늘의 흰 구름 수" value={pSpec.clouds ?? 5} min={0} max={12} step={1} onChange={(v) => updSpec((s) => ({ ...s, clouds: v }))} />
            <Dial label="구름의 자유 — 0=지형처럼, 1=달처럼" value={pSpec.cloudFree ?? 0.1} min={0} max={1} step={0.05} onChange={(v) => updSpec((s) => ({ ...s, cloudFree: v }))} />
            <Dial label="구름 반투명도" value={pSpec.cloudOpacity ?? 1} min={0.1} max={1} step={0.05} onChange={(v) => updSpec((s) => ({ ...s, cloudOpacity: v }))} />
            <Dial label="비 주기 (s · 0=안 옴)" value={pSpec.rainEvery ?? 0} min={0} max={300} step={5} onChange={(v) => updSpec((s) => ({ ...s, rainEvery: v }))} />
            <Dial label="눈 주기 (s · 0=안 옴)" value={pSpec.snowEvery ?? 0} min={0} max={300} step={5} onChange={(v) => updSpec((s) => ({ ...s, snowEvery: v }))} />
            <Dial label="비행기 주기 (s · 0=없음)" value={pSpec.planeEvery ?? 0} min={0} max={180} step={5} onChange={(v) => updSpec((s) => ({ ...s, planeEvery: v }))} />
            <Dial label="배 주기 (s · 0=없음)" value={pSpec.shipEvery ?? 0} min={0} max={180} step={5} onChange={(v) => updSpec((s) => ({ ...s, shipEvery: v }))} />
            <Dial label="달 크기 (행성=1)" value={M.size} min={0.08} max={0.6} step={0.005} onChange={(v) => updSpec((s) => ({ ...s, moon: { ...s.moon, size: v } }))} />
            <Dial label="달 거리" value={M.dist} min={16} max={70} step={1} onChange={(v) => updSpec((s) => ({ ...s, moon: { ...s.moon, dist: v } }))} />
            <Dial label="달 공전 주기 (s)" value={M.period} min={30} max={480} step={5} onChange={(v) => updSpec((s) => ({ ...s, moon: { ...s.moon, period: v } }))} />
            <Dial label="달 궤도 기울기 (°)" value={M.tilt} min={0} max={60} step={1} onChange={(v) => updSpec((s) => ({ ...s, moon: { ...s.moon, tilt: v } }))} />
            <Dial label="달빛" value={M.light} min={0} max={8} step={0.1} onChange={(v) => updSpec((s) => ({ ...s, moon: { ...s.moon, light: v } }))} />
            <Dial label="달 자전 (조석고정=1)" value={M.spin ?? 1} min={-3} max={3} step={0.05} onChange={(v) => updSpec((s) => ({ ...s, moon: { ...s.moon, spin: v } }))} />
            <Dial label="태양 방위 (°)" value={SN.az} min={0} max={360} step={2} onChange={(v) => updSpec((s) => ({ ...s, sun: { ...s.sun, az: v } }))} />
            <Dial label="태양 고도 (°)" value={SN.el} min={4} max={85} step={1} onChange={(v) => updSpec((s) => ({ ...s, sun: { ...s.sun, el: v } }))} />
            <Dial label="낮밤 주기 (s · 0=늘 낮)" value={SN.period ?? 0} min={0} max={600} step={10} onChange={(v) => updSpec((s) => ({ ...s, sun: { ...s.sun, period: v } }))} />
            <div style={{ fontSize: 12, color: '#d8b26e', margin: '12px 0 4px' }}>소품 — 표면에 심기</div>
            <select value={propPick} onChange={(e) => setPropPick(e.target.value)}
              style={{ width: '100%', background: '#101617', color: '#e8dcc2', border: '1px solid #3a423f', borderRadius: 6, padding: 5, fontSize: 11 }}>
              {PROP_CATALOG.map((p) => <option key={p.id} value={p.id}>[{p.cat}] {p.label}</option>)}
            </select>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center', margin: '6px 0 8px' }}>
              <span style={{ fontSize: 11 }}>크기</span>
              <input type="number" value={propScale} step={0.1} min={0.2} max={6}
                onChange={(e) => setPropScale(Number(e.target.value) || 1)}
                style={{ width: 54, background: '#101617', color: '#e8dcc2', border: '1px solid #3a423f', borderRadius: 6, padding: 4, fontSize: 11 }} />
              <button type="button" onClick={plantProp} style={{
                flex: 1, padding: '6px 8px', borderRadius: 6, cursor: 'pointer', fontSize: 11,
                border: '1px solid rgba(216,178,110,0.4)', background: 'rgba(216,178,110,0.14)', color: '#e8dcc2',
              }}>🌱 발밑에</button>
              <button type="button" onClick={() => setPlaceArm({ mode: 'new' })} style={{
                flex: 1.4, padding: '6px 8px', borderRadius: 6, cursor: 'pointer', fontSize: 11,
                border: '1px dashed rgba(216,178,110,0.55)', background: placeArm?.mode === 'new' ? 'rgba(216,178,110,0.3)' : 'rgba(216,178,110,0.1)', color: '#e8dcc2',
              }}>⊕ 화면을 찍어 배치</button>
            </div>
            {(pSpec.props ?? []).length > 0 ? (pSpec.props ?? []).map((pr) => (
              <div key={pr.id} onClick={() => setPropSel(propSel === pr.id ? null : pr.id)} style={{
                fontSize: 11, padding: '4px 6px', borderRadius: 6, cursor: 'pointer', marginBottom: 2,
                border: propSel === pr.id ? '1px solid rgba(216,178,110,0.6)' : '1px solid transparent',
                background: propSel === pr.id ? 'rgba(216,178,110,0.12)' : 'transparent',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span>{PROP_CATALOG.find((c) => c.id === pr.obj)?.label ?? pr.obj} · ×{pr.scale}</span>
                  <button type="button" onClick={(ev) => { ev.stopPropagation(); updSpec((s) => ({ ...s, props: (s.props ?? []).filter((x) => x.id !== pr.id) })); if (propSel === pr.id) setPropSel(null); }}
                    style={{ border: 'none', background: 'transparent', color: '#c97b6a', cursor: 'pointer', fontSize: 11 }}>삭제</button>
                </div>
                {propSel === pr.id && (
                  <div style={{ marginTop: 4 }}>
                    <div style={{ opacity: 0.6, fontSize: 10.5, marginBottom: 4 }}>
                      회전 {Math.round((pr.rotY * 180) / Math.PI) % 360}° · 기울임 {Math.round(((pr.tilt ?? 0) * 180) / Math.PI)}° · 높이 {(pr.lift ?? 0).toFixed(2)}
                    </div>
                    <button type="button" onClick={(ev) => { ev.stopPropagation(); setPlaceArm({ mode: 'move', id: pr.id }); }} style={{
                      width: '100%', padding: '5px 8px', borderRadius: 6, cursor: 'pointer', fontSize: 11,
                      border: '1px dashed rgba(216,178,110,0.55)', background: 'rgba(216,178,110,0.1)', color: '#e8dcc2',
                    }}>⊕ 자리 다시 찍기</button>
                    <input placeholder="이벤트 제목 (비우면 조용한 소품)" value={pr.title ?? ''}
                      onClick={(ev) => ev.stopPropagation()}
                      onChange={(ev) => updSpec((s) => ({ ...s, props: (s.props ?? []).map((x) => (x.id === pr.id ? { ...x, title: ev.target.value } : x)) }))}
                      style={{ width: '100%', marginTop: 6, background: '#101617', color: '#e8dcc2', border: '1px solid #3a423f', borderRadius: 6, padding: 5, fontSize: 11, boxSizing: 'border-box' }} />
                    <textarea placeholder="가까이 가면 폽 — 여기 적은 이야기가 뜹니다" value={pr.text ?? ''} rows={3}
                      onClick={(ev) => ev.stopPropagation()}
                      onChange={(ev) => updSpec((s) => ({ ...s, props: (s.props ?? []).map((x) => (x.id === pr.id ? { ...x, text: ev.target.value } : x)) }))}
                      style={{ width: '100%', marginTop: 4, background: '#101617', color: '#e8dcc2', border: '1px solid #3a423f', borderRadius: 6, padding: 5, fontSize: 11, boxSizing: 'border-box', resize: 'vertical' }} />
                  </div>
                )}
              </div>
            )) : <div style={{ fontSize: 11, opacity: 0.55, marginBottom: 4 }}>화면을 찍거나, 그녀 발밑에 심어보세요</div>}
            <div style={{ fontSize: 10.5, opacity: 0.55, lineHeight: 1.7, margin: '6px 0 2px', padding: '6px 8px', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 6 }}>
              키보드로 조정 (목록에서 선택 후)<br />화살표 이동 · PgUp/Dn 높이 · R/F 회전 · T/G 기울임 · +/− 크기 · Shift 크게 · Del 삭제
            </div>
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
            <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid rgba(216,178,110,0.15)' }}>
              <div style={{ fontSize: 11, color: '#d8b26e', letterSpacing: 1, marginBottom: 6 }}>대형 이벤트 시연 — 지금 즉시 확인</div>
              <div style={{ display: 'flex', gap: 6 }}>
                <button type="button" style={{ ...PANEL_BTN, flex: 1 }} onClick={() => planetApi.current?.demoComet?.()}>☄️ 혜성</button>
                <button type="button" style={{ ...PANEL_BTN, flex: 1 }} onClick={() => planetApi.current?.demoShower?.()}>☄️☄️ 유성우</button>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
              <button type="button" style={{
                ...PANEL_BTN, width: '100%', fontWeight: 700,
                background: pubState === 'ok' ? '#355743' : pubState === 'err' ? '#7a3b3b' : '#2e4a3a',
                color: '#eaf0e8', opacity: pubState === 'busy' ? 0.6 : 1,
              }} disabled={pubState === 'busy'} onClick={publishLive}>
                {pubState === 'busy' ? '반영 중…' : pubState === 'ok' ? '🌍 세상에 나갔어요 ✓' : pubState === 'err' ? '실패 — 다시' : '🌍 세상에 반영'}
              </button>
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
            onClick={() => { footsteps.unlock(); ambience.unlock(); planetSound.unlock(); footsteps.setMuted(!muted); ambience.setMuted(!muted); planetSound.setMuted(!muted); setMuted(!muted); }}
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
