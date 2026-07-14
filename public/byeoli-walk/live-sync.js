(() => {
  if (new URLSearchParams(location.search).get('mode') !== 'live') return;

  let lastEventId = null;
  let inFlight = false;

  const setText = (id, text) => {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
  };

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
    if (inFlight) return;
    inFlight = true;
    try {
      const res = await fetch('/api/byeoli/state', {
        cache: 'no-store',
        headers: { accept: 'application/json' },
      });
      if (!res.ok) throw new Error(`authority_http_${res.status}`);
      const envelope = await res.json();
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
      inFlight = false;
    }
  }

  sync();
  setInterval(sync, 1000);
})();
