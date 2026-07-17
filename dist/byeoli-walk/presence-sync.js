// BUILD 422-OPS-D — 익명 presence heartbeat (브라우저 세션 단위, 사람 아님)
// 정본: docs/BUILD_422_OPS_OBSERVER_CONSOLE.md §6-3
//
// 보내는 것: 브라우저별 익명 난수 ID + 모드뿐. Observer Code·Recovery Key·개인 기록은
// 어떤 경로로도 싣지 않는다. 관측소 iframe(top≠self)에서는 세지 않는다.
(function () {
  'use strict';
  if (window.top !== window.self) return; // 콘솔 iframe·임베드는 세션으로 세지 않는다
  var KEY = 'mimesis.presence.anon.v1';
  var anonId = null;
  try {
    anonId = localStorage.getItem(KEY);
    if (!anonId) {
      anonId = (window.crypto && crypto.randomUUID)
        ? crypto.randomUUID().replace(/-/g, '')
        : 's' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
      localStorage.setItem(KEY, anonId);
    }
  } catch (e) {
    anonId = 's' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
  }
  var mode = /[?&]mode=live(&|$)/.test(location.search) ? 'live' : 'sandbox';

  function beat() {
    if (document.visibilityState !== 'visible') return;
    fetch('/api/telemetry/presence', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ anonId: anonId, mode: mode }),
    }).catch(function () { /* 다음 심장박동에서 */ });
  }

  window.setInterval(beat, 60000);
  window.setTimeout(beat, 5000);
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible') beat();
  });
})();
