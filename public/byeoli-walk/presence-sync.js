// BUILD 422-OPS-D — 익명 presence heartbeat (브라우저 세션 단위, 사람 아님)
// BUILD 431-P — 주기 60초 → 5분 (Vase 승인 2026-07-20).
//   60초 주기 × 서버 쓰기 2건 = 탭 하나로 2,880 writes/day. Free KV 한도가 1,000/day라
//   탭 하나가 한도를 2.88배 넘겼고, 한도를 넘으면 그날 자정까지 feed·capture_meta 등
//   모든 KV 쓰기가 같이 죽는다. 서버 TTL(12분)과 짝을 이룬다 — 둘을 따로 바꾸면 깜빡인다.
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

  window.setInterval(beat, 300000);   // 5분 — 서버 ACTIVE_TTL_S(12분)보다 충분히 짧게
  window.setTimeout(beat, 5000);
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible') beat();
  });
})();
