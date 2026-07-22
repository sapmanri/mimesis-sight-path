// BUILD 434-COMIC — /api/ops/comic-lab (Ops 호스트 전용 · Access 뒤)
//
// BYEOLI Comic Lab — 그림실험실의 형제 페이지 (홈즈 설계 2026-07-22).
// 그림실험실은 이미지 실험이고, 이곳은 게놈과 공식 바이블로 완성된 이야기를 만드는 곳.
//
// Phase 1 (이 파일): Style Lock 장착 확인 + 주제 + 컷 수 + 게놈 시나리오 생성·표시.
// Phase 2 (다음 배선): [이 시나리오로 그리기] → 컷별 이미지 → 페이지 조립 → 검사.
//
// ⛔ 자동 게시·크론 연결 없음.

import { STYLE_LOCK_NAMES, STYLE_LOCK_VERSION } from '../_comic.ts';

const NAMES_JS = JSON.stringify(STYLE_LOCK_NAMES);

const HTML = `<!doctype html><html lang="ko"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>BYEOLI Comic Lab</title>
<style>
  :root{color-scheme:dark}
  body{margin:0;padding:24px;background:#12160f;color:#e7dcc4;
    font:14px/1.6 ui-monospace,SFMono-Regular,Menlo,monospace}
  h1{font-size:18px;margin:0 0 4px} h2{font-size:13px;color:#A7B49A;margin:0 0 10px;font-weight:600}
  .lead{color:#7d8a76;margin:0 0 18px;font-size:12px}
  .cols{display:grid;grid-template-columns:360px 1fr;gap:20px;align-items:start}
  @media (max-width:900px){.cols{grid-template-columns:1fr}}
  .panel{background:#1a1f16;border:1px solid #2b352a;border-radius:6px;padding:14px;margin-bottom:14px}
  label{display:block;font-size:11px;color:#7d8a76;margin:8px 0 2px}
  input[type=text]{width:100%;box-sizing:border-box;background:#12160f;color:#e7dcc4;
    border:1px solid #2b352a;border-radius:4px;padding:8px 10px;font:inherit;font-size:13px}
  button{background:#2b352a;color:#e7dcc4;border:1px solid #3d4a3b;border-radius:4px;
    padding:6px 12px;font:inherit;font-size:12px;cursor:pointer}
  button:hover{background:#3d4a3b}
  button.primary{background:#4a5d3a;border-color:#5d7548;font-weight:600}
  button.sel{background:#4a5d3a;border-color:#5d7548}
  button:disabled{opacity:.4;cursor:default}
  .row{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
  .muted{color:#7d8a76;font-size:11px}
  .ok{color:#A7B49A} .warn{color:#c8a878} .bad{color:#c8a0a0}
  .lockgrid{display:grid;grid-template-columns:repeat(5,1fr);gap:6px;margin-top:8px}
  .lockgrid img{width:100%;height:56px;object-fit:cover;border-radius:3px;background:#fff}
  .lockgrid .miss{height:56px;display:grid;place-content:center;border:1px dashed #5d3a3a;
    border-radius:3px;color:#c8a0a0;font-size:10px;text-align:center}
  .lockname{font-size:9px;color:#5d6a5f;text-align:center;word-break:break-all}
  .cut{border:1px solid #2b352a;border-radius:6px;background:#1a1f16;padding:12px;margin-bottom:10px}
  .cut h3{margin:0 0 6px;font-size:12px;color:#A7B49A}
  .cut .vis{font-size:11px;color:#7d8a76;line-height:1.7}
  .cut .cap{margin-top:8px;font-size:13px;color:#e7dcc4;border-left:2px solid var(--sage,#A7B49A);padding-left:10px}
  .cut .dlg{margin-top:6px;font-size:13px;color:#c9beA6}
  .cut .dlg::before{content:'💬 '}
  .banner{padding:8px 12px;border-radius:4px;font-size:12px;margin-bottom:10px;display:none}
  .banner.show{display:block}
  .banner.err{background:#2a1a1a;border:1px solid #5d3a3a;color:#c8a0a0}
  .banner.info{background:#1a231a;border:1px solid #3d4a3b;color:#A7B49A}
  .spin{display:inline-block;animation:sp 1s linear infinite}
  @keyframes sp{to{transform:rotate(360deg)}}
  a{color:#A7B49A}
  details{margin-top:8px} summary{cursor:pointer;color:#A7B49A;font-size:12px}
</style></head><body>
<h1>BYEOLI Comic Lab</h1>
<p class="lead">주제 → 별이 게놈 → 시나리오 → (승인) → 웹툰. 두뇌·그림 모두 어댑터 — 기본 GPT.
· <a href="/api/ops/sketch-lab">그림실험실 ←</a></p>
<div id="banner" class="banner"></div>
<div class="cols">
<div>

  <div class="panel">
    <h2>🔒 Style Lock <span class="muted" id="lockVer"></span></h2>
    <div id="lockStatus" class="muted">확인 중…</div>
    <details><summary>바이블 5장</summary>
      <div id="lockGrid" class="lockgrid"></div>
      <div class="muted" style="margin-top:6px">비면: 그림실험실 ②에서 같은 이름으로 업로드
      (ch00_master · ch01_turnaround · ch02_expression · ch03_pose · ch04_hair)</div>
    </details>
  </div>

  <div class="panel">
    <h2>오늘 별이가 겪을 일</h2>
    <input type="text" id="theme" placeholder="비 오는 출근길">
    <label>몇 컷?</label>
    <div class="row" id="cuts">
      <button data-cut="4" class="sel">4컷</button>
      <button data-cut="6">6컷</button>
      <button data-cut="8">8컷</button>
    </div>
    <div style="margin-top:12px">
      <button id="go" class="primary" style="width:100%;padding:10px">별이 게놈으로 이야기 만들기</button>
    </div>
    <div class="muted" style="margin-top:6px">그림은 아직 안 만든다 — 시나리오가 별이답지 않으면 여기서 다시.</div>
  </div>

</div>
<div id="out">
  <div class="panel muted">주제를 넣고 이야기를 만들면 컷 시나리오가 여기 선다.<br>
  별이다우면 [이 시나리오로 그리기] — 그건 다음 배선(Phase 2)에서 열린다.</div>
</div>
</div>
<script>
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var LOCK_NAMES = ${NAMES_JS};
  var state = { cut: 4, scenario: null };

  function banner(msg, kind) {
    var b = $('banner');
    b.textContent = msg;
    b.className = 'banner show ' + (kind || 'info');
  }
  function api(path, opts) {
    return fetch(path, opts).then(function (r) {
      return r.json().catch(function () { return { error: 'HTTP ' + r.status }; });
    });
  }
  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // ── Style Lock 장착 확인 — 이름으로 자동 (매번 업로드하지 않는다) ──
  function checkLock() {
    api('/api/ops/sketch-reference').then(function (r) {
      var refs = r.references || [];
      var grid = $('lockGrid');
      grid.innerHTML = '';
      var found = 0;
      LOCK_NAMES.forEach(function (name) {
        var hit = refs.filter(function (x) { return x.key.indexOf('/' + name + '.') >= 0; })[0];
        var cell = document.createElement('div');
        if (hit) {
          found++;
          cell.innerHTML = '<img src="' + esc(hit.preview) + '" loading="lazy">' +
            '<div class="lockname">' + esc(name) + '</div>';
        } else {
          cell.innerHTML = '<div class="miss">없음</div><div class="lockname">' + esc(name) + '</div>';
        }
        grid.appendChild(cell);
      });
      $('lockVer').textContent = '${STYLE_LOCK_VERSION}';
      $('lockStatus').innerHTML = found === LOCK_NAMES.length
        ? '<span class="ok">🔒 ' + found + '/5 장착 — 잠김</span>'
        : '<span class="warn">⚠ ' + found + '/5 — 바이블이 비어 있다 (그리기 전까지 채울 것)</span>';
    });
  }

  // ── 컷 수 선택 ──
  Array.prototype.forEach.call(document.querySelectorAll('#cuts button'), function (b) {
    b.onclick = function () {
      state.cut = Number(b.getAttribute('data-cut'));
      Array.prototype.forEach.call(document.querySelectorAll('#cuts button'), function (x) {
        x.className = x === b ? 'sel' : '';
      });
    };
  });

  // ── 시나리오 렌더 ──
  function renderScenario(s, meta) {
    var html = '<div class="panel"><h2>「' + esc(s.title) + '」 <span class="muted">' +
      esc(s.panelCount) + '컷 · ' + esc(meta.provider) + ' · ' + esc(meta.model) + '</span></h2>';
    s.panels.forEach(function (p) {
      html += '<div class="cut"><h3>' + p.index + '컷</h3>' +
        '<div class="vis">' + esc(p.location) + ' · ' + esc(p.shot) + ' · 초점: ' + esc(p.subject) +
        '<br>별이: ' + esc(p.action) + ' (' + esc(p.expression) + ')' +
        (p.ppaekong ? '<br>빼콩이: ' + esc(p.ppaekong) : '<br><span class="muted">빼콩이 없음</span>') + '</div>' +
        (p.caption ? '<div class="cap">' + esc(p.caption) + '</div>' : '') +
        (p.dialogue ? '<div class="dlg">' + esc(p.dialogue) + '</div>' : '') +
        '</div>';
    });
    html += '<div class="row">' +
      '<button id="redo">다른 이야기로 다시</button>' +
      '<button class="primary" disabled title="Phase 2 배선에서 열린다">이 시나리오로 그리기 (다음 배선)</button>' +
      '</div>' +
      '<details><summary>시나리오 JSON (계약 원문)</summary><pre style="white-space:pre-wrap;font-size:11px;color:#c9beA6">' +
      esc(JSON.stringify(s, null, 2)) + '</pre></details></div>';
    $('out').innerHTML = html;
    var rd = $('redo');
    if (rd) rd.onclick = makeStory;
  }

  // ── 생성 ──
  function makeStory() {
    var theme = $('theme').value.trim();
    if (!theme) { banner('주제가 비어 있다 — 오늘 별이가 겪을 일 한 줄', 'err'); return; }
    var go = $('go');
    go.disabled = true;
    go.innerHTML = '<span class="spin">◐</span> 별이가 이야기를 고르는 중…';
    api('/api/ops/comic-scenario', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ theme: theme, panelCount: state.cut }),
    }).then(function (r) {
      go.disabled = false; go.textContent = '별이 게놈으로 이야기 만들기';
      if (r.error === 'scenario_invalid') {
        banner('시나리오가 계약 미달 — ' + (r.detail || []).join(' / ') + ' · 다시 눌러 재생성', 'err');
        if (r.scenario && r.scenario.panels) renderScenario(r.scenario, { provider: '미달본', model: '' });
        return;
      }
      if (r.error) { banner('실패: ' + r.error, 'err'); return; }
      state.scenario = r.scenario;
      banner('시나리오 완성 — 별이다운지 읽어보고, 아니면 다시');
      renderScenario(r.scenario, r);
    }).catch(function (e) {
      go.disabled = false; go.textContent = '별이 게놈으로 이야기 만들기';
      banner('요청 실패: ' + e, 'err');
    });
  }
  $('go').onclick = makeStory;
  $('theme').onkeydown = function (e) { if (e.key === 'Enter') makeStory(); };

  checkLock();
})();
</script>
</body></html>`;

export const onRequestGet: PagesFunction = async () =>
  new Response(HTML, {
    headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' },
  });
