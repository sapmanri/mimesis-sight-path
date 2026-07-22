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
  .lockgrid{display:grid;grid-template-columns:repeat(6,1fr);gap:6px;margin-top:8px}
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
  .strip{max-width:520px}
  .pframe{border:1px solid #2b352a;border-radius:6px;overflow:hidden;background:#1a1f16;margin-bottom:4px;position:relative}
  .pframe img{width:100%;display:block;background:#fff}
  .pframe .making{height:220px;display:grid;place-content:center;color:#7d8a76;font-size:12px}
  .pdlg{position:absolute;top:10px;left:10px;max-width:70%;background:#FAF7F2;color:#111111;
    border:1.5px solid #111111;border-radius:14px;padding:6px 12px;font-size:13px;line-height:1.5}
  .pcap{font-size:13px;color:#c9beA6;padding:6px 2px 16px;line-height:1.6}
  .ptools{position:absolute;top:8px;right:8px}
  .ptools button{font-size:10px;padding:3px 8px;opacity:.85}
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
<p class="lead">주제 → 별이 게놈 → 시나리오 → (승인) → 웹툰. 두뇌·그림 모두 어댑터 — 기본 제미나이(원샷 페이지). 독립 실험실 — 다른 실험실과 섞이지 않는다.</p>
<div id="banner" class="banner"></div>
<div class="cols">
<div>

  <div class="panel">
    <h2>🔒 Style Lock <span class="muted" id="lockVer"></span></h2>
    <div id="lockStatus" class="muted">확인 중…</div>
    <details open><summary>바이블 5장 + 패널 레이아웃(선택) — 칸을 눌러 업로드·교체</summary>
      <div id="lockGrid" class="lockgrid"></div>
      <div class="muted" style="margin-top:6px">Comic Lab 전용 저장소 — 다른 실험실과 섞이지 않는다.
      한 번 올리면 계속 장착된다.</div>
    </details>
    <input type="file" id="lockFile" accept="image/png,image/jpeg,image/webp" style="display:none">
  </div>

  <div class="panel">
    <h2>오늘 별이가 겪을 일</h2>
    <input type="text" id="theme" placeholder="비 오는 출근길">
    <label>몇 컷?</label>
    <div class="row" id="cuts">
      <button data-cut="4" class="sel">4컷</button>
      <button data-cut="6">6컷</button>
      <button data-cut="8">8컷</button>
      <input type="number" id="cutCustom" min="1" max="12" placeholder="직접"
        style="width:64px;background:#12160f;color:#e7dcc4;border:1px solid #2b352a;border-radius:4px;padding:6px 8px;font:inherit;font-size:12px">
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
  // comic-generate 전용 — NDJSON 스트림(하트비트 + 마지막 줄 결과). 524 대책.
  function generateCall(bodyObj) {
    return fetch('/api/ops/comic-generate', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify(bodyObj),
    }).then(function (res) {
      return res.text().then(function (t) {
        var lines = t.trim().split('\\n').filter(Boolean);
        try { return JSON.parse(lines[lines.length - 1]); }
        catch (e) { return { error: 'bad_stream: ' + t.slice(0, 120) }; }
      });
    });
  }
  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // ── Style Lock — Comic Lab 전용 저장소 (comic/style-lock/). 칸 클릭 = 업로드/교체 ──
  var pendingSlot = null;
  function checkLock() {
    api('/api/ops/comic-style-lock').then(function (r) {
      var grid = $('lockGrid');
      grid.innerHTML = '';
      (r.slots || []).forEach(function (s) {
        var cell = document.createElement('div');
        cell.style.cursor = 'pointer';
        cell.title = s.loaded ? s.slot + ' — 눌러서 교체' : s.slot + ' — 눌러서 업로드';
        cell.innerHTML = (s.loaded
          ? '<img src="/api/ops/comic-style-lock?file=' + esc(s.slot) + '&v=' + Date.now() + '" loading="lazy">'
          : '<div class="miss">비어 있음<br>+</div>') +
          '<div class="lockname">' + esc(s.slot) + '</div>';
        cell.onclick = function () { pendingSlot = s.slot; $('lockFile').click(); };
        grid.appendChild(cell);
      });
      var required = (r.slots || []).filter(function (x) { return x.slot !== 'ch05_panel'; });
      var reqLoaded = required.filter(function (x) { return x.loaded; }).length;
      var panelOn = (r.slots || []).some(function (x) { return x.slot === 'ch05_panel' && x.loaded; });
      $('lockVer').textContent = '${STYLE_LOCK_VERSION}';
      $('lockStatus').innerHTML = (reqLoaded === required.length
        ? '<span class="ok">🔒 ' + reqLoaded + '/5 필수 장착</span>'
        : '<span class="warn">⚠ ' + reqLoaded + '/5 필수 — 빈 칸을 눌러 올릴 것</span>') +
        ' · 패널 레이아웃 ' + (panelOn ? '<span class="ok">✓ (원샷이 이 레이아웃을 따른다)</span>' : '<span class="muted">— (없으면 기본 격자)</span>');
    });
  }
  $('lockFile').onchange = function () {
    var f = $('lockFile').files[0];
    if (!f || !pendingSlot) return;
    var slot = pendingSlot;
    pendingSlot = null;
    $('lockFile').value = '';
    if (['image/png', 'image/jpeg', 'image/webp'].indexOf(f.type) < 0) {
      banner('png/jpeg/webp만 가능 (' + (f.type || '타입 없음') + ')', 'err'); return;
    }
    banner(slot + ' 업로드 중…');
    fetch('/api/ops/comic-style-lock?slot=' + encodeURIComponent(slot), {
      method: 'POST', headers: { 'content-type': f.type }, body: f,
    }).then(function (res) {
      return res.json().catch(function () { return { error: 'HTTP ' + res.status }; });
    }).then(function (r) {
      if (r.error) { banner(slot + ' 업로드 실패: ' + r.error, 'err'); return; }
      banner('🔒 ' + slot + ' 장착됨 (' + Math.round(r.size / 1024) + 'KB)');
      checkLock();
    }).catch(function (e) { banner('업로드 요청 실패: ' + e, 'err'); });
  };

  // ── 컷 수 선택 ──
  Array.prototype.forEach.call(document.querySelectorAll('#cuts button'), function (b) {
    b.onclick = function () {
      state.cut = Number(b.getAttribute('data-cut'));
      $('cutCustom').value = '';
      Array.prototype.forEach.call(document.querySelectorAll('#cuts button'), function (x) {
        x.className = x === b ? 'sel' : '';
      });
    };
  });
  $('cutCustom').oninput = function () {
    var n = Number($('cutCustom').value);
    if (Number.isInteger(n) && n >= 1 && n <= 12) {
      state.cut = n;
      Array.prototype.forEach.call(document.querySelectorAll('#cuts button'), function (x) { x.className = ''; });
    }
  };

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
      '<button class="primary" id="draw">🎨 이 시나리오로 그리기 (' + s.panelCount + '장 생성)</button>' +
      '</div>' +
      '<details><summary>시나리오 JSON (계약 원문)</summary><pre style="white-space:pre-wrap;font-size:11px;color:#c9beA6">' +
      esc(JSON.stringify(s, null, 2)) + '</pre></details></div>';
    $('out').innerHTML = html;
    var rd = $('redo');
    if (rd) rd.onclick = makeStory;
    var dw = $('draw');
    if (dw) dw.onclick = drawComic;
  }

  // ── Phase 2: 컷별 생성 → 세로 조립 (캡션·대사는 진짜 폰트 — 그림엔 글자가 없다) ──
  function panelFrame(p) {
    return '<div class="pframe" id="pf' + p.index + '">' +
      '<div class="making"><span class="spin">◐</span>&nbsp; ' + p.index + '컷 그리는 중…</div></div>' +
      (p.caption ? '<div class="pcap">' + esc(p.caption) + '</div>' : '<div style="height:12px"></div>');
  }
  function fillPanel(p, key) {
    var f = $('pf' + p.index);
    if (!f) return;
    f.innerHTML = '<img src="/api/ops/comic-file?key=' + encodeURIComponent(key) + '&v=' + Date.now() + '">' +
      (p.dialogue ? '<div class="pdlg">' + esc(p.dialogue) + '</div>' : '') +
      '<div class="ptools"><button data-repanel="' + p.index + '">이 컷 다시</button></div>';
  }
  function failPanel(p, why) {
    var f = $('pf' + p.index);
    if (!f) return;
    f.innerHTML = '<div class="making bad">' + p.index + '컷 실패 — ' + esc(why) +
      '<br><button data-repanel="' + p.index + '" style="margin-top:8px">다시 시도</button></div>';
  }
  function genPanel(idx) {
    var s = state.scenario;
    var p = s.panels.filter(function (x) { return x.index === idx; })[0];
    return generateCall({ scenario: s, panels: [idx] }).then(function (r) {
      if (r.made && r.made.length) fillPanel(p, r.made[0].key);
      else failPanel(p, (r.errors && r.errors[0]) || r.error || '?');
      return r;
    }).catch(function (e) { failPanel(p, String(e)); return { errors: [String(e)] }; });
  }
  function drawComic() {
    var s = state.scenario;
    if (!s) { banner('시나리오가 없다', 'err'); return; }
    // 먼저 서버에 물어본다 — 페이지 모드(제미나이)면 한 방, 아니면 컷별
    var probe = $('out');
    probe.innerHTML = '<div class="panel"><span class="spin">◐</span> 페이지를 그리는 중… (제미나이 원샷 — 1~2분)</div>' + probe.innerHTML;
    generateCall({ scenario: s }).then(function (r) {
      if (r.mode === 'page') {
        var pg = '<div class="panel" style="max-width:760px"><h2>「' + esc(s.title) + '」 <span class="muted">' +
          esc(r.provider) + ' · ' + esc(r.model) + ' · 원샷 페이지</span></h2>' +
          '<img style="width:100%;display:block;border-radius:4px" src="/api/ops/comic-file?key=' +
          encodeURIComponent(r.key) + '&v=' + Date.now() + '">' +
          (r.warnings && r.warnings.length ? '<div class="warn" style="font-size:11px;margin-top:6px">' + esc(r.warnings.join(' · ')) + '</div>' : '') +
          '<div class="row" style="margin-top:10px"><button id="redraw" class="primary">🎲 전체 다시 그리기</button></div>' +
          '<div class="muted" style="margin-top:8px">검사 축: 같은 별이 · 머리 단색 면 · 빼콩이 유지 · 컷 수 ' +
          s.panelCount + ' · <b>한글 오탈자</b> (원샷 모드의 검사 항목 — 시나리오 문장과 대조)</div></div>';
        $('out').innerHTML = pg;
        var rb = $('redraw');
        if (rb) rb.onclick = drawComic;
        banner('페이지 완성 — 오탈자·별이 동일성 확인');
        return;
      }
      if (r.error) {
        $('out').firstChild.remove();
        banner('실패: ' + r.error, 'err');
        return;
      }
      // 컷별 모드 (gpt/flux 어댑터) — 기존 흐름
      $('out').firstChild.remove();
      drawPanels();
    }).catch(function (e) { banner('요청 실패: ' + e, 'err'); });
  }
  function drawPanels() {
    var s = state.scenario;
    var strip = '<div class="panel strip" id="strip"><h2>「' + esc(s.title) + '」</h2>';
    s.panels.forEach(function (p) { strip += panelFrame(p); });
    strip += '<div class="muted" id="stripStatus">0/' + s.panelCount + '</div>' +
      '<div class="muted" style="margin-top:8px">검사 축: 같은 별이인가 · 머리가 단색 면인가 · ' +
      '앞머리 유지 · 빼콩이 유지 · 컷 수 일치 · (글자는 그림에 없어야 정상 — 캡션·대사는 아래 폰트가 담당)</div></div>';
    $('out').innerHTML = strip + $('out').innerHTML;
    var done = 0;
    // 순차 생성 — 진행이 보이고, 실패해도 다음 컷은 계속
    var chain = Promise.resolve();
    s.panels.forEach(function (p) {
      chain = chain.then(function () {
        return genPanel(p.index).then(function () {
          done++;
          var st = $('stripStatus');
          if (st) st.textContent = done + '/' + s.panelCount + (done === s.panelCount ? ' — 완성. 이상한 컷은 [이 컷 다시]' : '');
        });
      });
    });
  }
  // 컷별 재생성 — 위임 리스너
  $('out').addEventListener('click', function (ev) {
    var t = ev.target;
    var idx = t && t.getAttribute ? t.getAttribute('data-repanel') : null;
    if (!idx || !state.scenario) return;
    var p = state.scenario.panels.filter(function (x) { return x.index === Number(idx); })[0];
    var f = $('pf' + idx);
    if (f) f.innerHTML = '<div class="making"><span class="spin">◐</span>&nbsp; ' + idx + '컷 다시 그리는 중…</div>';
    genPanel(Number(idx));
  });

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
