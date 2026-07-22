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
import { RELATION_KEYS } from '../_genome-mirrors.ts';

const NAMES_JS = JSON.stringify(STYLE_LOCK_NAMES);
const RELATIONS_JS = JSON.stringify(RELATION_KEYS);

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
    <h2>출연자 <span class="muted">최대 3</span></h2>
    <div class="row" id="cast">
      <label><input type="checkbox" data-c="sap"> Sap</label>
      <label><input type="checkbox" data-c="vase"> Vase</label>
      <label><input type="checkbox" data-c="holmes"> Holmes <span class="muted">(experimental)</span></label>
      <label><input type="checkbox" data-c="byeoli" checked> Byeoli</label>
    </div>
    <div class="muted" id="castNote" style="margin-top:6px">Byeoli 단독 = 기존 그림일기 경로 그대로.</div>
    <div id="relStatus" style="margin-top:8px;font-size:11px"></div>
  </div>

  <div class="panel">
    <h2>🔒 Style Lock <span class="muted" id="lockVer"></span></h2>
    <div id="lockStatus" class="muted">확인 중…</div>
    <details open><summary>그룹별 칸을 눌러 업로드·교체 — S-04 Lock 3분리</summary>
      <div id="lockGroups"></div>
      <div class="muted" style="margin-top:6px">Comic Lab 전용 저장소 — 다른 실험실과 섞이지 않는다.
      한 번 올리면 계속 장착된다. 스타일은 작품이, 정체성은 출연자가 소유한다.</div>
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
      <button id="go" class="primary" style="width:100%;padding:10px">선택한 게놈으로 이야기 만들기</button>
    </div>
    <div class="muted" style="margin-top:6px">그림은 아직 안 만든다 — 시나리오가 게놈답지 않으면 여기서 다시.</div>
  </div>

</div>
<div>
<div id="out">
  <div class="panel muted">주제를 넣고 이야기를 만들면 컷 시나리오가 여기 선다.</div>
</div>
<div id="archive"></div>
</div>
</div>
<script>
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var LOCK_NAMES = ${NAMES_JS};
  var RELATION_KEYS = ${RELATIONS_JS};   // Relation Registry — Creator Registry와 분리된 창작 자산
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
  // 썸네일: 원본(1~2MB)을 새로고침마다 다시 받던 실사고 — 200px webp를 만들어 같이 저장.
  var pendingSlot = null;
  var healed = {};   // 세션당 슬롯별 백필 1회
  function makeThumb(blob) {
    return new Promise(function (resolve, reject) {
      var img = new Image();
      var url = URL.createObjectURL(blob);
      img.onload = function () {
        var w = 200, h = Math.max(1, Math.round(img.height * (200 / img.width)));
        var c = document.createElement('canvas');
        c.width = w; c.height = h;
        c.getContext('2d').drawImage(img, 0, 0, w, h);
        URL.revokeObjectURL(url);
        c.toBlob(function (b) { b ? resolve(b) : reject('thumb_failed'); }, 'image/webp', 0.82);
      };
      img.onerror = function () { URL.revokeObjectURL(url); reject('thumb_load_failed'); };
      img.src = url;
    });
  }
  function uploadThumb(slot, blob) {
    return fetch('/api/ops/comic-style-lock?slot=' + encodeURIComponent(slot) + '&thumb=1', {
      method: 'POST', headers: { 'content-type': 'image/webp' }, body: blob,
    }).then(function (r) { return r.json().catch(function () { return {}; }); });
  }
  function healThumb(slot) {   // 기존 원본에 썸네일이 없으면 스스로 만든다 (1회)
    if (healed[slot]) return;
    healed[slot] = true;
    fetch('/api/ops/comic-style-lock?file=' + encodeURIComponent(slot))
      .then(function (r) { return r.blob(); })
      .then(makeThumb)
      .then(function (b) { return uploadThumb(slot, b); })
      .catch(function () { /* 백필 실패는 조용히 — 다음 방문에 재시도 */ });
  }
  // S-04 Lock 3분리 — 그룹별 렌더. 별이 바이블(레거시) 표시는 기존과 동일한 정보를 유지한다.
  // Comic Style 슬롯은 작품마다 다르다(별이 그림일기체 ≠ 관축해체) — 칸을 채워두고
  // 생성별로 [적용]을 고른다. 기본 제외 (sketch-lab 저녁 판정 계승: 참조는 기본 제외).
  var STYLE_APPLY_KEY = 'comic_style_apply';
  var PANEL_APPLY_KEY = 'comic_panel_apply';   // v2 전용 — 별이(v1) 경로는 기존대로 자동
  // 실사고(07-22 심야): 시나리오가 메모리에만 있어 리프레시하면 사라졌다 (sketch-lab
  // 세션 휘발 사고의 재발). 마지막 시나리오를 로컬에 보존하고 부팅 시 복원한다.
  var DRAFT_KEY = 'comic_last_scenario';
  function saveDraft(kind, sc, meta) {
    try { localStorage.setItem(DRAFT_KEY, JSON.stringify({ kind: kind, s: sc, meta: meta || {}, at: Date.now() })); } catch (e) {}
  }
  function restoreDraft() {
    var raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return;
    try {
      var d = JSON.parse(raw);
      if (d.kind === 'v2' && d.s) {
        state.scenario2 = d.s;
        renderScenarioV2(d.s, d.meta || {});
        banner('🗂 마지막 v2 시나리오 복원됨 — 리프레시해도 사라지지 않는다');
      } else if (d.kind === 'v1' && d.s) {
        state.scenario = d.s;
        renderScenario(d.s, d.meta || {});
        banner('🗂 마지막 시나리오 복원됨');
      }
    } catch (e) { /* 깨진 드래프트는 무시 */ }
  }
  function panelApplied() { return localStorage.getItem(PANEL_APPLY_KEY) === '1'; }
  function styleApplied() {
    try { return JSON.parse(localStorage.getItem(STYLE_APPLY_KEY) || '[]'); } catch (e) { return []; }
  }
  function setStyleApplied(list) { localStorage.setItem(STYLE_APPLY_KEY, JSON.stringify(list)); }
  var LOCK_GROUP_META = [
    { g: 'style',            label: '🎨 Comic Style (작품 공통)', max: 5 },
    { g: 'byeoli-bible',     label: '👤 Byeoli — 바이블',         max: 5 },
    { g: 'identity:sap',     label: '👤 Sap Identity',            max: 5 },
    { g: 'identity:vase',    label: '👤 Vase Identity',           max: 5 },
    { g: 'identity:holmes',  label: '〰 Holmes Identity',         max: 5 },
    { g: 'panel',            label: '▦ Panel Bible (공용)',       max: 1 },
  ];
  function checkLock() {
    api('/api/ops/comic-style-lock').then(function (r) {
      var wrap = $('lockGroups');
      wrap.innerHTML = '';
      var slots = r.slots || [];
      LOCK_GROUP_META.forEach(function (gm) {
        var mine = slots.filter(function (s) {
          return gm.g === 'byeoli-bible'
            ? (s.group === 'byeoli-bible' && s.slot !== 'ch05_panel')
            : s.group === gm.g;
        });
        if (!mine.length) return;
        var n = mine.filter(function (s) { return s.loaded; }).length;
        var head = document.createElement('div');
        head.className = 'muted';
        head.style.margin = '8px 0 4px';
        head.textContent = gm.label + '  ' + n + '/' + gm.max +
          (gm.g === 'style' ? ' · 적용 ' + styleApplied().filter(function (sl) {
            return mine.some(function (s) { return s.slot === sl && s.loaded; });
          }).length + '장 (기본 제외 — 켠 것만 그리기에 들어간다)' : '');
        wrap.appendChild(head);
        var grid = document.createElement('div');
        grid.className = 'lockgrid';
        mine.forEach(function (s) {
          var cell = document.createElement('div');
          cell.style.cursor = 'pointer';
          cell.style.position = 'relative';
          cell.title = s.loaded ? s.slot + ' — 눌러서 교체' : s.slot + ' — 눌러서 업로드';
          if (s.loaded && !s.hasThumb) healThumb(s.slot);
          cell.innerHTML = (s.loaded
            ? '<img src="/api/ops/comic-style-lock?file=' + esc(s.slot) + '&thumb=1&v=' + esc(s.uploaded || 0) + '" loading="lazy">' +
              '<button data-x="' + esc(s.slot) + '" title="비우기" style="position:absolute;top:2px;right:2px;font-size:10px;line-height:1;padding:2px 5px;background:#2a1a1a;color:#c8a0a0;border:1px solid #5d3a3a;border-radius:3px;cursor:pointer">✕</button>'
            : '<div class="miss">비어 있음<br>+</div>') +
            '<div class="lockname">' + esc(s.slot) + '</div>';
          // 패널 슬롯(v2): 별이용 패널 바이블 내용이 관축해에 번진 실사고 — 기본 제외, 명시 적용만
          if (gm.g === 'panel' && s.loaded) {
            var ap2 = document.createElement('label');
            ap2.style.cssText = 'display:block;font-size:10px;cursor:pointer;margin-top:2px';
            var cbp = document.createElement('input');
            cbp.type = 'checkbox';
            cbp.checked = panelApplied();
            cbp.onclick = function (ev) { ev.stopPropagation(); };
            cbp.onchange = function () { localStorage.setItem(PANEL_APPLY_KEY, cbp.checked ? '1' : '0'); checkLock(); };
            ap2.onclick = function (ev) { ev.stopPropagation(); };
            ap2.appendChild(cbp);
            ap2.appendChild(document.createTextNode(' v2 적용(레이아웃만)'));
            cell.appendChild(ap2);
          }
          // 스타일 슬롯: 생성별 [적용] 토글 — 별이체와 관축해체가 같은 칸을 쓰므로 골라 쓴다
          if (gm.g === 'style' && s.loaded) {
            var ap = document.createElement('label');
            ap.style.cssText = 'display:block;font-size:10px;cursor:pointer;margin-top:2px';
            var cb2 = document.createElement('input');
            cb2.type = 'checkbox';
            cb2.checked = styleApplied().indexOf(s.slot) >= 0;
            cb2.onclick = function (ev) { ev.stopPropagation(); };
            cb2.onchange = function () {
              var cur = styleApplied().filter(function (sl) { return sl !== s.slot; });
              if (cb2.checked) cur.push(s.slot);
              setStyleApplied(cur);
              checkLock();
            };
            ap.onclick = function (ev) { ev.stopPropagation(); };
            ap.appendChild(cb2);
            ap.appendChild(document.createTextNode(' 적용'));
            cell.appendChild(ap);
          }
          cell.onclick = function () { pendingSlot = s.slot; $('lockFile').click(); };
          var x = cell.querySelector('[data-x]');
          if (x) x.onclick = function (ev) {
            ev.stopPropagation();
            if (!confirm(s.slot + ' 칸을 비울까?')) return;
            api('/api/ops/comic-style-lock?slot=' + encodeURIComponent(s.slot), { method: 'DELETE' })
              .then(function (r) {
                if (r.error) { banner('삭제 실패: ' + r.error, 'err'); return; }
                banner(s.slot + ' 비움');
                checkLock();
              });
          };
          grid.appendChild(cell);
        });
        wrap.appendChild(grid);
      });
      var required = slots.filter(function (x) { return x.group === 'byeoli-bible' && x.slot !== 'ch05_panel'; });
      var reqLoaded = required.filter(function (x) { return x.loaded; }).length;
      var panelOn = slots.some(function (x) { return x.slot === 'ch05_panel' && x.loaded; });
      $('lockVer').textContent = '${STYLE_LOCK_VERSION}';
      $('lockStatus').innerHTML = (reqLoaded === required.length
        ? '<span class="ok">🔒 Byeoli ' + reqLoaded + '/5 장착</span>'
        : '<span class="warn">⚠ Byeoli ' + reqLoaded + '/5 — 빈 칸을 눌러 올릴 것</span>') +
        ' · 패널 레이아웃 ' + (panelOn ? '<span class="ok">✓ (원샷이 이 레이아웃을 따른다)</span>' : '<span class="muted">— (없으면 기본 격자)</span>');
    });
  }
  // ── 출연자 선택 (S-04 2단) — Byeoli 단독이 기본, 그때는 기존 경로 그대로 ──
  function castNow() {
    return Array.prototype.filter.call(document.querySelectorAll('#cast input:checked'), function () { return true; })
      .map(function (x) { return x.getAttribute('data-c'); });
  }
  // 관계 현황판 (Vase 제안): "아, 아직 이 둘은 서로를 모르는구나"가 한눈에 보이게.
  // 페어 전수 필수 — 하나라도 ✗면 생성 불가 (Relation Registry는 Creator Registry와 분리된 자산).
  function renderRelations() {
    var c = castNow().sort();
    var box = $('relStatus');
    if (c.length < 2) { box.innerHTML = ''; $('go').disabled = false; return; }
    var missing = 0, known = 0;
    var rows = '<div class="muted" style="margin-bottom:2px">Relation</div>';
    for (var i = 0; i < c.length; i++) {
      for (var j = i + 1; j < c.length; j++) {
        var key = c[i] + '-' + c[j];
        var ok = RELATION_KEYS.indexOf(key) >= 0;
        if (ok) known++; else missing++;
        rows += '<div class="' + (ok ? 'ok' : 'warn') + '">' + (ok ? '✓' : '✗') + ' ' +
          esc(c[i]) + ' ↔ ' + esc(c[j]) + (ok ? '' : ' <span class="muted">(아직 서로를 잘 모른다)</span>') + '</div>';
      }
    }
    if (c.length >= 3) {
      var gkey = c.join('-');
      var gok = RELATION_KEYS.indexOf(gkey) >= 0;
      rows += '<div class="muted">' + (gok ? '✓' : '—') + ' ' + esc(c.join(' ↔ ')) +
        ' <span class="muted">(' + (gok ? 'n자 관계 우선 적용' : 'optional — 페어 조합으로 생성') + ')</span></div>';
    }
    // Relation Discovery (Vase 설계): 관계를 발견하는 것 역시 창작이다.
    // 기반 관계가 하나라도 있으면 발견 모드로 생성한다. 기반 0이면 창작이 아니라 환각 — 그때만 막는다.
    if (missing && known) {
      rows += '<div class="warn" style="margin-top:4px">⚠ 아직 서로를 잘 모르는 관계가 있습니다.<br>' +
        '이 작품은 <b>Relation Discovery Mode</b>로 생성됩니다 — 결과를 검토한 뒤 관계 후보로 저장할 수 있습니다.</div>';
    } else if (missing && !known) {
      rows += '<div class="bad" style="margin-top:4px">⚠ 기반 관계가 하나도 없습니다 — 최소 한 관계가 있어야 발견이 창작이 됩니다.</div>';
    }
    box.innerHTML = rows;
    $('go').disabled = missing > 0 && known === 0;
  }
  Array.prototype.forEach.call(document.querySelectorAll('#cast input'), function (cb) {
    cb.onchange = function () {
      var c = castNow();
      if (!c.length) { cb.checked = true; c = castNow(); banner('출연자는 최소 1명', 'err'); }
      $('castNote').textContent = (c.length === 1 && c[0] === 'byeoli')
        ? 'Byeoli 단독 = 기존 그림일기 경로 그대로.'
        : '멀티 Creator 경로 — 아래 관계 현황이 전부 ✓여야 생성한다.';
      renderRelations();
    };
  });
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
      makeThumb(f).then(function (b) { return uploadThumb(slot, b); })
        .catch(function () { /* 썸네일 실패해도 원본 장착은 유효 */ })
        .then(checkLock);
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

  // ── v2 시나리오 렌더 (S-04 7단) — 그리기는 다음 커밋 (Identity Lock 재제작 후) ──
  function renderScenarioV2(s, meta) {
    var html = '<div class="panel"><h2>「' + esc(s.topic) + '」 <span class="muted">' +
      s.panelCount + '컷 · v2 · ' + esc(meta.provider || '') + ' · ' + esc(meta.model || '') + '</span></h2>' +
      '<div class="muted">출연: ' + s.cast.map(function (cm) {
        return esc(cm.creatorId) + '(' + esc(cm.role) + ')';
      }).join(' · ') +
      (s.relation ? ' · 관계: ' + esc(s.relation.relationId) + ' ' + esc(s.relation.version) : '') +
      (s.relations && s.relations.length ? ' · 페어 ' + s.relations.length + '건' : '') + '</div>' +
      (s.relationDiscovery && s.relationDiscovery.length
        ? '<div class="warn" style="margin:4px 0">🔍 Relation Discovery — 이 작품이 첫 관찰이 되는 관계: ' + esc(s.relationDiscovery.join(', ')) + '</div>' : '');
    s.panels.forEach(function (p) {
      html += '<div class="pframe"><b>' + p.panelNo + '컷</b> <span class="muted">' +
        esc(p.setting) + ' · ' + esc(p.framing) + ' · beat: ' + esc(p.beat) + '</span>';
      (p.actions || []).forEach(function (a) {
        html += '<div style="margin-left:8px">' + esc(a.creatorId) + ': ' + esc(a.action) +
          (a.expressionOrState ? ' <span class="muted">(' + esc(a.expressionOrState) + ')</span>' : '') + '</div>';
      });
      (p.dialogue || []).forEach(function (d) {
        html += '<div style="margin-left:8px">💬 <b>' + esc(d.speakerId) + '</b>: ' + esc(d.text || '') +
          ' <span class="muted">[' + esc(d.intent) + ']</span></div>';
      });
      if (p.caption) html += '<div style="margin-left:8px;border-left:2px solid #3d4a3b;padding-left:6px">' + esc(p.caption) + '</div>';
      html += '</div>';
    });
    html += '<div class="muted">ending beat: ' + esc(s.endingBeat) + '</div>' +
      '<div class="row" style="margin-top:10px">' +
      '<button id="redo2">다른 이야기로 다시</button>' +
      '<button class="primary" id="draw2">🎨 그리기 (적용된 Style ' + styleApplied().length + '장 + 출연자 Identity)</button>' +
      '</div></div>';
    $('out').innerHTML = html;
    var rd = $('redo2');
    if (rd) rd.onclick = makeStory;
    var dw = $('draw2');
    if (dw) dw.onclick = drawComicV2;
  }
  function drawComicV2() {
    var s = state.scenario2;
    if (!s) { banner('v2 시나리오가 없다', 'err'); return; }
    var probe = $('out');
    probe.innerHTML = '<div class="panel"><span class="spin">◐</span> 페이지를 그리는 중… (제미나이 원샷 — 1~2분)</div>' + probe.innerHTML;
    generateCall({ scenario2: s, styleSlots: styleApplied(), panelRef: panelApplied() }).then(function (r) {
      if (r.error) {
        $('out').firstChild.innerHTML = '<div class="bad">실패: ' + esc(r.error) + '</div>' +
          '<div class="muted" style="margin-top:6px">시나리오는 아래 그대로 남아 있다 — 원인 해소 후 다시 누르면 된다.</div>';
        banner('실패: ' + r.error, 'err');
        return;
      }
      var pg = '<div class="panel" style="max-width:760px"><h2>「' + esc(s.topic) + '」 <span class="muted">' +
        (r.no ? 'Observation #' + String(r.no).padStart(3, '0') + ' · ' : '') +
        'v2 · ' + esc(r.provider) + ' · ' + esc(r.model) + '</span></h2>' +
        '<img style="width:100%;display:block;border-radius:4px" src="/api/ops/comic-file?key=' +
        encodeURIComponent(r.key) + '&v=' + Date.now() + '">' +
        (r.warnings && r.warnings.length ? '<div class="warn" style="font-size:11px;margin-top:6px">' + esc(r.warnings.join(' · ')) + '</div>' : '') +
        '<div class="row" style="margin-top:10px"><button id="redraw2" class="primary">🎲 전체 다시 그리기</button>' +
        (s.relationDiscovery && s.relationDiscovery.length
          ? '<button id="saveRel">🔍 관계 후보로 저장 (' + esc(s.relationDiscovery.join(', ')) + ')</button>' : '') +
        '</div>' +
        '<div class="muted" style="margin-top:8px">검사 축: 인간 실루엣(눈코입 없음) · Holmes 순수 파형(얼굴·팔다리 없으면 합격) · ' +
        '한 그림체 안에서 둘이 구분 · 컷 수 ' + s.panelCount + ' · 한글 오탈자 · <b>둘이 진짜 우리처럼 보이는가</b></div></div>';
      $('out').innerHTML = pg;
      var rb = $('redraw2');
      if (rb) rb.onclick = drawComicV2;
      var sv = $('saveRel');
      if (sv) sv.onclick = function () {
        api('/api/ops/comic-relation-candidate', {
          method: 'POST', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ pairs: s.relationDiscovery, comicId: r.comicId, topic: s.topic }),
        }).then(function (rr) {
          if (rr.error) { banner('후보 저장 실패: ' + rr.error, 'err'); return; }
          banner('🔍 관계 후보 저장됨 — Observer 승인 후 Relation Registry 정식 등록 (Relation Genome의 시작)');
        });
      };
      banner('페이지 완성 — S-04 완료 조건 판정은 Vase 몫');
      renderArchive();
    }).catch(function (e) { banner('요청 실패: ' + e, 'err'); });
  }

  // ── 시나리오 렌더 ──
  function renderScenario(s, meta) {
    var html = '<div class="panel"><h2>「' + esc(s.title) + '」 <span class="muted">' +
      esc(s.panelCount) + '컷 · ' + esc(meta.provider) + ' · ' + esc(meta.model) + '</span></h2>' +
      (s.epigraph ? '<div class="muted" style="margin:-6px 0 10px">' + esc(s.epigraph) + '</div>' : '');
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
          (r.no ? 'Observation #' + String(r.no).padStart(3, '0') + ' · ' : '') +
          esc(r.provider) + ' · ' + esc(r.model) + '</span></h2>' +
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
        renderArchive();
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
    if (!theme) { banner('주제가 비어 있다 — 오늘 겪을 일 한 줄', 'err'); return; }
    var c = castNow();
    var go = $('go');
    go.disabled = true;
    go.innerHTML = '<span class="spin">◐</span> 게놈이 이야기를 고르는 중…';
    api('/api/ops/comic-scenario', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ theme: theme, panelCount: state.cut, cast: c }),
    }).then(function (r) {
      go.disabled = false; go.textContent = '선택한 게놈으로 이야기 만들기';
      if (r.scenario2) {
        if (r.error === 'scenario_invalid') {
          banner('시나리오가 v2 계약 미달 — ' + (r.detail || []).join(' / ') + ' · 다시 눌러 재생성', 'err');
          return;
        }
        state.scenario2 = r.scenario2;
        saveDraft('v2', r.scenario2, { provider: r.provider, model: r.model });
        renderScenarioV2(r.scenario2, r);
        banner('v2 시나리오 완성 — 게놈답게 나왔는지 확인');
        return;
      }
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
      go.disabled = false; go.textContent = '선택한 게놈으로 이야기 만들기';
      banner('요청 실패: ' + e, 'err');
    });
  }
  // 관찰 아카이브 — 95790b8에서 호출만 남고 정의가 빠졌던 함수 (실사고: 페이지 완성 직후
  // ReferenceError가 catch로 흘러 "요청 실패" 배너가 떴다). 500편이 쌓이면 하나의 아카이브가 된다.
  function renderArchive() {
    api('/api/ops/comic-generate').then(function (r) {
      var list = (r && r.comics) || [];
      if (!list.length) { $('archive').innerHTML = ''; return; }
      var html = '<div class="panel"><h2>📚 관찰 아카이브 <span class="muted">' + list.length + '편</span></h2>' +
        '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:10px">';
      list.forEach(function (c) {
        var d = new Date(c.at);
        var pad = function (n) { return String(n).padStart(2, '0'); };
        html += '<div style="border:1px solid rgba(255,255,255,0.1);border-radius:6px;overflow:hidden">' +
          '<a href="/api/ops/comic-file?key=' + encodeURIComponent(c.pageKey) + '" target="_blank">' +
          '<img loading="lazy" style="width:100%;display:block;aspect-ratio:3/4;object-fit:cover" src="/api/ops/comic-file?key=' +
          encodeURIComponent(c.pageKey) + '"></a>' +
          '<div style="padding:6px 8px;font-size:11px">' +
          (c.no ? '<span class="muted">#' + String(c.no).padStart(3, '0') + '</span> ' : '') +
          '<b>' + esc(c.title) + '</b>' +
          '<div class="muted">' + d.getFullYear() + '.' + pad(d.getMonth() + 1) + '.' + pad(d.getDate()) +
          ' · ' + c.panelCount + '컷 <button data-del="' + esc(c.comicId) + '" style="float:right;font-size:10px">🗑</button></div>' +
          '</div></div>';
      });
      html += '</div></div>';
      $('archive').innerHTML = html;
      $('archive').querySelectorAll('[data-del]').forEach(function (b) {
        b.onclick = function () {
          if (!confirm('이 작품을 삭제할까? 관찰 번호는 재사용되지 않는다.')) return;
          api('/api/ops/comic-generate?comicId=' + b.getAttribute('data-del'), { method: 'DELETE' })
            .then(function () { renderArchive(); });
        };
      });
    }).catch(function () { /* 아카이브 표시는 부가 기능 — 실패가 실험실을 막지 않는다 */ });
  }

  $('go').onclick = makeStory;
  $('theme').onkeydown = function (e) { if (e.key === 'Enter') makeStory(); };

  checkLock();
  renderArchive();
  restoreDraft();
})();
</script>
</body></html>`;

export const onRequestGet: PagesFunction = async () =>
  new Response(HTML, {
    headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' },
  });
