(() => {
  if (new URLSearchParams(location.search).get('mode') !== 'live') return;

  let lastEventId = null;
  let lastSequence = -1;
  let inFlight = false;
  let syncTimer = null;
  let wakeLock = null;
  let wakeRetryBound = false;

  const setText = (id, text) => {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
  };

  const ensureWakeBadge = () => {
    let badge = document.getElementById('liveWakeBadge');
    if (badge) return badge;
    badge = document.createElement('div');
    badge.id = 'liveWakeBadge';
    badge.style.cssText = 'position:fixed;right:8px;bottom:8px;z-index:80;padding:5px 7px;border:1px solid #4f5d4f;background:rgba(10,18,11,.88);color:#b9c7b5;font:10px ui-monospace,monospace;letter-spacing:.03em;pointer-events:none';
    document.body.appendChild(badge);
    return badge;
  };

  const setWakeBadge = (text, warning = false) => {
    const badge = ensureWakeBadge();
    badge.textContent = text;
    badge.style.color = warning ? '#e9b0a8' : '#b9c7b5';
  };

  async function acquireWakeLock() {
    if (document.visibilityState !== 'visible') return;
    if (!('wakeLock' in navigator)) {
      setWakeBadge('⚠ 화면 자동 잠금 가능', true);
      return;
    }
    try {
      if (wakeLock && !wakeLock.released) return;
      wakeLock = await navigator.wakeLock.request('screen');
      setWakeBadge('🔋 화면 유지 중');
      wakeLock.addEventListener('release', () => {
        wakeLock = null;
        if (document.visibilityState === 'visible') {
          setWakeBadge('⚠ 화면 유지 재시도 중', true);
          window.setTimeout(acquireWakeLock, 300);
        }
      }, { once: true });
    } catch (error) {
      setWakeBadge('⚠ 화면 자동 잠금 가능', true);
    }
  }

  async function releaseWakeLock() {
    const current = wakeLock;
    wakeLock = null;
    if (current && !current.released) {
      try { await current.release(); } catch (error) {}
    }
  }

  function bindWakeLockRetries() {
    if (wakeRetryBound) return;
    wakeRetryBound = true;
    const retry = () => acquireWakeLock();
    window.addEventListener('pointerdown', retry, { passive: true });
    window.addEventListener('keydown', retry);
    window.addEventListener('pageshow', retry);
    window.addEventListener('pagehide', releaseWakeLock);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        acquireWakeLock();
        sync();
      } else {
        releaseWakeLock();
      }
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

  bindWakeLockRetries();
  acquireWakeLock();
  startSyncLoop();
})();
