(() => {
  if (new URLSearchParams(location.search).get('mode') !== 'live') return;

  let lastEventId = null;
  let lastSequence = -1;
  let inFlight = false;
  let syncTimer = null;

  const setText = (id, text) => {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
  };

  // Wake Lock은 여기서 다루지 않는다 — BUILD 424부터 미들웨어 주입 WakeLockManager
  // (liveStatusBadge, 탭 가능한 버튼)가 단일 소유자다. 이 파일의 옛 배지(liveWakeBadge)가
  // 남아 있어 우하단에 배지가 두 개 겹치던 문제를 제거했다 (2026-07-18 Vase 리포트).
  function bindVisibilitySync() {
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') sync();
    });
  }

  const prependLog = (text, kind = 'act') => {
    if (!text) return;
    const stream = document.getElementById('stream');
    if (!stream) return;
    const div = document.createElement('div');
    div.className = `msg ${kind}`;
    div.textContent = text;
    stream.prepend(div);
    while (stream.children.length > 40) stream.removeChild(stream.lastChild);
  };

  async function sync() {
    if (inFlight || document.visibilityState !== 'visible') return;
    inFlight = true;
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 5000);
    try {
      const res = await fetch('/api/byeoli/state', {
        cache: 'no-store',
        headers: { accept: 'application/json' },
        signal: controller.signal,
      });
      if (!res.ok) throw new Error(`authority_http_${res.status}`);
      const envelope = await res.json();
      const sequence = Number(envelope && envelope.sequence);
      if (Number.isSafeInteger(sequence) && sequence <= lastSequence) return;
      if (Number.isSafeInteger(sequence)) lastSequence = sequence;

      const state = envelope && envelope.state;
      if (!state) return;

      const telemetry = state.telemetry || {};
      setText('tally', `기억 ${Number(telemetry.memories || 0)} · 일기 ${Number(telemetry.diary || 0)}`);
      setText('tasteHint', '— LIVE · 싱글 화면 · 백그라운드 동기화');

      const drives = telemetry.drives || {};
      for (const key of ['observe', 'rest', 'record', 'wonder']) {
        const value = Number(drives[key] || 0);
        const fill = document.getElementById(`df-${key}`);
        const label = document.getElementById(`dv-${key}`);
        if (fill) fill.style.width = `${Math.max(0, Math.min(1, value)) * 100}%`;
        if (label) label.textContent = value.toFixed(2);
      }
      setText('fatVal', Number(telemetry.fatigue || 0).toFixed(2));

      const event = state.liveEvent;
      if (event && event.id && event.id !== lastEventId) {
        lastEventId = event.id;
        const age = Date.now() - Number(event.occurredAt || 0);
        if (age >= 0 && age < 15000) {
          const kind = event.kind === 'pass' ? 'pass' : event.kind === 'rare' ? 'rare' : event.kind === 'diary' ? 'diary' : 'act';
          prependLog(event.text || '', kind);
        }
      }
    } catch (error) {
      setText('tasteHint', '— LIVE 동기화 재연결 중');
    } finally {
      window.clearTimeout(timeout);
      inFlight = false;
    }
  }

  function startSyncLoop() {
    if (syncTimer) return;
    sync();
    syncTimer = window.setInterval(sync, 2000);
  }

  bindVisibilitySync();
  startSyncLoop();
})();
