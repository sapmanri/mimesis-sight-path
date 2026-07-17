// BUILD 423-EVENTS — World Director 소비 (모든 시청 화면 공통, live·sandbox 무관)
// 정본: docs/BUILD_423_EVENTS_WORLD_DIRECTOR.md
//
// GET /api/world-event/active 만 호출한다(읽기 전용). 활성 인스턴스가 보이면
// 앱이 노출한 최소 훅(window.__worldEventStage)으로 무대에 올린다.
// 같은 instanceId는 한 번만. 무대가 이미 진행 중이면 끼어들지 않는다.
(function () {
  'use strict';
  var seen = Object.create(null);
  var inFlight = false;

  function poll() {
    if (inFlight || document.visibilityState !== 'visible') return;
    var stage = window.__worldEventStage;
    if (!stage) return; // 앱 모듈이 아직 준비 전 — 다음 틱에서
    inFlight = true;
    fetch('/api/world-event/active', { cache: 'no-store', headers: { accept: 'application/json' } })
      .then(function (res) { return res.ok ? res.json() : null; })
      .then(function (data) {
        var a = data && data.active;
        if (!a || !a.eventInstanceId) return;
        if (seen[a.eventInstanceId]) return;
        if (Date.now() >= a.endsAt) return;
        if (stage.isActive()) return;
        seen[a.eventInstanceId] = 1;
        stage.start(a);
      })
      .catch(function () { /* 조용히 — 다음 폴링에서 */ })
      .then(function () { inFlight = false; });
  }

  window.setInterval(poll, 15000);
  window.setTimeout(poll, 3000); // 초기 진입 직후 한 번 (모듈 로드 여유)
})();
