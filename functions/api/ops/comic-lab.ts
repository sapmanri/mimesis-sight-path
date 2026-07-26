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
    <div class="row" style="margin-bottom:8px">
      <button id="tabTheme" class="sel">주제로 만들기</button>
      <button id="tabDialogue">대화로 만들기</button>
    </div>
    <div id="themeForm">
    <h2>오늘 별이가 겪을 일</h2>
    <input type="text" id="theme" placeholder="비 오는 출근길">
    <label>몇 컷?</label>
    <div class="row" id="cuts">
      <button data-cut="auto">자동</button>
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
    <div id="dialogueForm" style="display:none">
      <h2>대화 원문 <span class="muted">이미 있었던 대화에서 만화가 될 사건을 발견한다</span></h2>
      <textarea id="dlgRaw" placeholder="Sap: 그거 맞아?&#10;Holmes: 현재 구조상으로는…&#10;Sap: 아닐걸." style="width:100%;box-sizing:border-box;min-height:140px;background:#12160f;color:#e7dcc4;border:1px solid #2b352a;border-radius:4px;padding:8px 10px;font:inherit;font-size:12px"></textarea>
      <div id="dlgSpeakers" class="muted" style="margin-top:6px"></div>
      <label>컷 수</label>
      <div class="row" id="dlgCuts">
        <button data-dcut="auto" class="sel">자동</button>
        <button data-dcut="4">4컷</button>
        <button data-dcut="6">6컷</button>
        <button data-dcut="8">8컷</button>
      </div>
      <label>원문 보존 강도</label>
      <div class="row">
        <label class="muted"><input type="radio" name="dlgMode" value="strict"> 엄격</label>
        <label class="muted"><input type="radio" name="dlgMode" value="balanced" checked> 균형</label>
        <label class="muted"><input type="radio" name="dlgMode" value="reconstruct"> 재구성</label>
      </div>
      <label>장소</label>
      <div class="row">
        <label class="muted"><input type="radio" name="dlgPlace" value="auto" checked> 자동 추출</label>
        <label class="muted"><input type="radio" name="dlgPlace" value="workshop"> 작업실</label>
        <label class="muted"><input type="radio" name="dlgPlace" value="none"> 선택 안 함</label>
      </div>
      <div style="margin-top:12px">
        <button id="goDlg" class="primary" style="width:100%;padding:10px">대화를 웹툰 시나리오로 만들기</button>
      </div>
      <div class="muted" style="margin-top:6px">원문은 불변 자산으로 보관된다 — 각색은 원문을 덮어쓰지 않는다.<br>📌 꼭 살릴 대사는 <b>*별표*</b>로 감싼다 — 긴 발화 블록 중간의 문장만 감싸도 된다. 생략·수정되면 각색이 반려되고, 위반 목록을 들려주며 1회 자동 재시도한다.</div>
    </div>
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
  // 패널 바이블 2종 — 홈즈 설계(2026-07-25). 상호 배타 선택.
  //   grid    「격자 프레임」 네모 칸·외곽선·칸 아래 캡션
  //   organic 「여백섬」     흰 종이 위 유기적 덩어리, 테두리 없음, 승인된 한 주체만 경계 밖으로
  // 옛 저장값('1' = 켬)은 grid로 읽어 무회귀를 지킨다.
  var PANEL_MODE_KEY = 'comiclab.panelMode';
  function panelMode() {
    var m = localStorage.getItem(PANEL_MODE_KEY);
    if (m === 'grid' || m === 'organic' || m === 'none') return m;
    return localStorage.getItem(PANEL_APPLY_KEY) === '1' ? 'grid' : 'none';   // 레거시 승계
  }
  function setPanelMode(m) { localStorage.setItem(PANEL_MODE_KEY, m); }
  function panelApplied() { return panelMode() !== 'none'; }
  // 최상위 계약 시트 — 칸은 있지만 **기본 제외**다. 시트가 다섯 약속의 삽화·한글 라벨로 가득해서
  // 참조로 실으면 모델이 그걸 그리려 든다(annotation 사고 계열). 철학은 문장과 판정으로 먼저 흐르고,
  // 이 체크박스는 "그림 참조로도 써 보겠다"는 Vase의 명시 선택일 때만 켜진다.
  var PHILO_APPLY_KEY = 'comic_philosophy_apply';
  function philosophyApplied() { return localStorage.getItem(PHILO_APPLY_KEY) === '1'; }
  function setPhilosophyApplied(on) { localStorage.setItem(PHILO_APPLY_KEY, on ? '1' : '0'); }
  function styleApplied() {
    try { return JSON.parse(localStorage.getItem(STYLE_APPLY_KEY) || '[]'); } catch (e) { return []; }
  }
  function setStyleApplied(list) { localStorage.setItem(STYLE_APPLY_KEY, JSON.stringify(list)); }
  var LOCK_GROUP_META = [
    // 최상위 계약이 맨 위. 다른 칸과 똑같이 올리고 ✕로 비운다 — 문제 생기면 빼면 된다.
    { g: 'philosophy',       label: '⚖ Philosophy Bible — 최상위 계약', max: 1 },
    { g: 'style',            label: '🎨 Comic Style (작품 공통)', max: 5 },
    { g: 'byeoli-bible',     label: '👤 Byeoli — 바이블',         max: 5 },
    { g: 'identity:sap',     label: '👤 Sap Identity',            max: 5 },
    { g: 'identity:vase',    label: '👤 Vase Identity',           max: 5 },
    { g: 'identity:holmes',  label: '〰 Holmes Identity',         max: 5 },
    { g: 'prop:sap',         label: '🎒 Prop — 삽의 소품',        max: 5 },
    { g: 'place:workshop',   label: '🏠 Place — 작업실',          max: 5 },
    { g: 'panel',            label: '▦ Panel Bible — 격자/여백섬', max: 2 },
  ];
  function checkLock() {
    api('/api/ops/comic-style-lock').then(function (r) {
      var wrap = $('lockGroups');
      wrap.innerHTML = '';
      var slots = r.slots || [];
      LOCK_GROUP_META.forEach(function (gm) {
        var mine = slots.filter(function (s) {
          return gm.g === 'byeoli-bible'
            ? (s.group === 'byeoli-bible' && s.slot !== 'ch05_panel' && s.slot !== 'ch06_panel_organic')
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
          }).length + '장 (기본 제외 — 켠 것만 그리기에 들어간다)' : '') +
          (gm.g === 'philosophy'
            ? ' · 시나리오·판정에는 항상 적용 (문장으로) · 그림 참조는 ' +
              (philosophyApplied() ? '켜짐' : '기본 제외')
            : '');
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
            // 2026-07-25: 패널 바이블 2종 상호 배타 선택. 하나를 켜면 다른 하나는 꺼진다.
            var myMode = (s.slot === 'ch06_panel_organic') ? 'organic' : 'grid';
            cbp.checked = (panelMode() === myMode);
            cbp.onclick = function (ev) { ev.stopPropagation(); };
            cbp.onchange = function () { setPanelMode(cbp.checked ? myMode : 'none'); checkLock(); };
            ap2.onclick = function (ev) { ev.stopPropagation(); };
            ap2.appendChild(cbp);
            ap2.appendChild(document.createTextNode(
              myMode === 'organic' ? ' 여백섬으로 그리기' : ' 격자 프레임으로 그리기'));
            cell.appendChild(ap2);
          }
          // 최상위 계약 슬롯: 그림 참조로 실을지만 정하는 토글. 꺼도 철학은 문장·판정으로 계속 간다.
          if (gm.g === 'philosophy' && s.loaded) {
            var apf = document.createElement('label');
            apf.style.cssText = 'display:block;font-size:10px;cursor:pointer;margin-top:2px';
            var cbf = document.createElement('input');
            cbf.type = 'checkbox';
            cbf.checked = philosophyApplied();
            cbf.onclick = function (ev) { ev.stopPropagation(); };
            cbf.onchange = function () { setPhilosophyApplied(cbf.checked); checkLock(); };
            apf.onclick = function (ev) { ev.stopPropagation(); };
            apf.appendChild(cbf);
            apf.appendChild(document.createTextNode(' 그림 참조로도 싣기'));
            cell.appendChild(apf);
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
      var required = slots.filter(function (x) { return x.group === 'byeoli-bible' && x.slot !== 'ch05_panel' && x.slot !== 'ch06_panel_organic'; });
      var reqLoaded = required.filter(function (x) { return x.loaded; }).length;
      var panelOn = slots.some(function (x) { return x.slot === 'ch05_panel' && x.loaded; });
      $('lockVer').textContent = '${STYLE_LOCK_VERSION}';
      $('lockStatus').innerHTML = (reqLoaded === required.length
        ? '<span class="ok">🔒 Byeoli ' + reqLoaded + '/5 장착</span>'
        : '<span class="warn">⚠ Byeoli ' + reqLoaded + '/5 — 빈 칸을 눌러 올릴 것</span>') +
        ' · 패널 문법 ' + (panelMode() === 'organic'
          ? '<span class="ok">🌿 여백섬 (테두리 없음 · 경계 밖 돌출 허용)</span>'
          : panelMode() === 'grid'
            ? '<span class="ok">▦ 격자 프레임</span>'
            : '<span class="muted">— 기본 격자 (바이블 미적용)</span>');
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
      var cv = b.getAttribute('data-cut');
      state.cut = (cv === 'auto') ? 'auto' : Number(cv);
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
    // 관찰자 캡션 (07-23) — 처음 보는 독자용 나레이터. Vase가 여기서 직접 고쳐 쓴다.
    html += '<div style="margin:8px 0">' +
      '<div class="muted" style="font-size:11px">🖋 관찰자 캡션 — 도입 (그림 위 서술 띠. 고치면 그대로 그려진다)</div>' +
      '<textarea id="capIntro" style="width:100%;box-sizing:border-box;min-height:44px;background:#12160f;color:#e7dcc4;border:1px solid #2b352a;border-radius:4px;font:inherit;font-size:12px;padding:6px">' + esc(s.intro || '') + '</textarea>' +
      '<div class="muted" style="font-size:11px;margin-top:4px">🖋 여운 — 마지막 컷 아래 한 줄</div>' +
      '<input id="capOutro" type="text" value="' + esc(s.outro || '') + '" style="width:100%;box-sizing:border-box;background:#12160f;color:#e7dcc4;border:1px solid #2b352a;border-radius:4px;font:inherit;font-size:12px;padding:6px">' +
      '</div>';
    var ranges = {};
    if (s.provenance) (s.provenance.sourceRanges || []).forEach(function (r) { ranges[r.panelNo] = r; });
    var beats = (meta && meta.beats) || [];
    if (beats.length) {
      html += '<div class="muted" style="margin:4px 0">🎵 비트 ' + beats.length + '개: ' + beats.map(function (b) {
        return '[' + b.id + ' ' + esc(b.type) + ' ' + b.startLine + '–' + b.endLine + '행]';
      }).join(' ') + '</div>';
    }
    s.panels.forEach(function (p) {
      html += '<div class="pframe"><b>' + p.panelNo + '컷</b> <span class="muted">' +
        esc(p.setting) + ' · ' + esc(p.framing) + ' · beat: ' + esc(p.beat) +
        (ranges[p.panelNo] ? ' · 원문 ' + ranges[p.panelNo].startLine + '–' + ranges[p.panelNo].endLine + '행' : (s.provenance ? ' · <span class="warn">근거 없음</span>' : '')) +
        (p.beatIds && p.beatIds.length ? ' · 🎵 ' + p.beatIds.join(',') : '') + '</span>';
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
      (s.provenance ? '<button id="cmpSrc">원문과 비교</button><button id="reAdapt">다시 압축</button>' : '') +
      '</div>' +
      (s.provenance ? '<div id="cmpBox" style="display:none;margin-top:8px;font-size:11px">' +
        '<div class="ok">보존 ' + (s.provenance.preservedLines || []).length + '건</div>' +
        (s.provenance.preservedLines || []).map(function (l) { return '<div class="muted">· ' + esc(l) + '</div>'; }).join('') +
        '<div class="warn" style="margin-top:4px">생략 ' + (s.provenance.omittedLines || []).length + '건</div>' +
        (s.provenance.omittedLines || []).map(function (l) { return '<div class="muted" style="text-decoration:line-through">· ' + esc(l) + '</div>'; }).join('') +
        ((s.provenance.reconstructedLines || []).length ? '<div class="bad" style="margin-top:4px">재구성 ' + s.provenance.reconstructedLines.length + '건</div>' +
          s.provenance.reconstructedLines.map(function (r) { return '<div class="muted">· ' + esc(r.output) + ' <span style="opacity:.6">(근거: ' + esc((r.basis || []).join(' / ')) + ')</span></div>'; }).join('') : '') +
        '</div>' : '') +
      '</div>';
    $('out').innerHTML = html;
    var ci = $('capIntro'), co = $('capOutro');
    if (ci) ci.onchange = function () {
      s.intro = ci.value.trim() || null;
      if (state.scenario2) state.scenario2.intro = s.intro;
      saveDraft('v2', s, meta);
    };
    if (co) co.onchange = function () {
      s.outro = co.value.trim() || null;
      if (state.scenario2) state.scenario2.outro = s.outro;
      saveDraft('v2', s, meta);
    };
    var rd = $('redo2');
    if (rd) rd.onclick = makeStory;
    var dw = $('draw2');
    if (dw) dw.onclick = drawComicV2;
    var cs = $('cmpSrc');
    if (cs) cs.onclick = function () {
      var b = $('cmpBox');
      b.style.display = b.style.display === 'none' ? '' : 'none';
    };
    var ra = $('reAdapt');
    if (ra) ra.onclick = function () {
      if (dlgState.lastInput) makeDialogueStory(dlgState.lastInput.lineRange || null);
      else banner('이 세션의 대화 입력이 없다 — 대화 탭에서 다시', 'err');
    };
  }
  function drawComicV2() {
    var s = state.scenario2;
    if (!s) { banner('v2 시나리오가 없다', 'err'); return; }
    var probe = $('out');
    probe.innerHTML = '<div class="panel"><span class="spin">◐</span> 페이지를 그리는 중… (제미나이 원샷 — 1~2분)</div>' + probe.innerHTML;
    generateCall({ scenario2: s, styleSlots: styleApplied(), panelRef: panelApplied(), panelMode: panelMode() }).then(function (r) {
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
        '<div class="muted" style="font-size:11px;margin-top:4px">🏠 장소 참조: ' +
        (r.places && r.places.length ? esc(r.places.join(', ')) + ' 적용'
          : (r.placesDetected && r.placesDetected.length ? esc(r.placesDetected.join(', ')) + ' 감지됐지만 락이 비어 미적용' : '감지 안 됨 — setting에 장소 영단어가 없다')) + '</div>' +
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
  // ── 다운로드: 통짜 1장 / 인스타툰 분절 (Vase 요구 2026-07-25) ──
  // 분절 규격 1080x1350 (4:5, 인스타 세로 최대). **슬라이드 수 = 컷 수. 한 장에 한 칸.**
  //
  // ⚠ 규격 정정 (Vase 판정 2026-07-26): 초판 문서는 "슬라이드 수 = 행 수 = ceil(컷수/2)",
  //   즉 한 슬라이드에 2컷이었다. **말이 안 된다** — 2단 격자의 한 행은 가로로 길어서
  //   세로 4:5에 넣으면 화면 절반이 빈다. 실측으로 확인했다(#015 4컷).
  //   코드는 739ffc4(칸 경계 감지)부터 이미 **칸 단위**로 자르고 있었고, 문서만 옛 규격에
  //   남아 있었다. 그 문구를 믿고 행 단위로 다시 만든 판이 실제로 나왔다 — 문서가 코드보다
  //   뒤처지면 그 문서를 읽는 쪽이 틀린 걸 만든다. 여기서 문구를 코드에 맞춘다.
  var IG_W = 1080, IG_H = 1350;
  /** 분절 슬라이드 수 = 컷 수. (행 수는 페이지 격자의 축이지 슬라이드의 축이 아니다.) */
  function igSlidesOf(n) { return Math.max(1, n); }
  function safeName(s) { return String(s || 'byeoli').replace(/[\\\\/:*?"<>|\\s]+/g, '_').slice(0, 40); }

  function fileUrl(key) { return '/api/ops/comic-file?key=' + encodeURIComponent(key); }

  // ── 조립기 (여백섬 컷별 경로) — 홈즈 판정 2026-07-26 ─────────────────
  // 조건 넷: Layout Plan 좌표를 입력으로 받는 **순수 함수** / 고정 캔버스·고정 DPR /
  //          FontFace 적재 후 렌더 / 완성 bitmap과 manifest를 R2에 함께 저장.
  // "브라우저에서 보이는 결과가 정본이 되면 안 된다" — 같은 입력이 기기마다 달라지면
  // 나중에 서버 렌더러로 옮길 때 계약이 깨진다. 그래서 DPR을 1로 못박는다.
  //
  // 조판 폰트 — **Gaegu(개구)**. JIKJI SOFT, SIL OFL 1.1 (상업 이용·재배포·임베딩 허용).
  // 왜 이것인가: 별이 페이지의 글자 규약은 "다섯 살 아이의 조심스럽고 살짝 삐뚤한 손글씨"다
  // (buildPagePrompt의 hand-lettered 지시와 같은 목소리여야 한다). Gaegu는 구글폰트
  // HANDWRITING 분류의 한글 손글씨체로 그 결에 맞고, OFL이라 배포에 걸림이 없다.
  // 자산은 레포에 동봉한다(외부 CDN 미의존 = 결정론). woff2 284KB, 라이선스 전문 동봉.
  //
  // ⚠ Gaegu는 KS X 1001 계열이라 한글 음절 11,172자를 다 담지 않는다(실측 2,593 코드포인트).
  //   별이 문장 풀 113편·4,971자에는 누락이 0이지만, **미래 문장은 보장할 수 없다.**
  //   빠진 글자는 두부(.notdef)로 조용히 그려진다 — 그게 이 프로젝트가 반복해 당한 침묵 실패다.
  //   그래서 커버리지 표를 함께 싣고 **그리기 전에 검사**한다.
  var ASSEMBLY_FONT = { family: 'Gaegu', url: '/fonts/Gaegu-Regular.woff2', coverage: '/fonts/Gaegu-coverage.json' };
  var fontCoverage = null;   // [[start,end],...]

  function loadAssemblyFont() {
    if (!ASSEMBLY_FONT) return Promise.resolve(null);
    var ff = new FontFace(ASSEMBLY_FONT.family, 'url(' + ASSEMBLY_FONT.url + ')');
    return ff.load().then(function (f) {
      document.fonts.add(f);
      return document.fonts.ready;
    }).then(function () {
      return fetch(ASSEMBLY_FONT.coverage).then(function (r) { return r.json(); })
        .then(function (j) { fontCoverage = j.ranges; return ASSEMBLY_FONT.family; })
        // 커버리지 표가 없으면 검사를 못 한다 → 폰트를 쓰지 않는다.
        // 검사 없이 그리면 두부를 못 잡는다. 못 잡을 바엔 안 그린다.
        .catch(function () { return null; });
    }).catch(function () { return null; });
  }

  /** 이 폰트로 그릴 수 없는 글자들. 빈 배열이면 안전하다. */
  function uncoveredChars(text) {
    if (!fontCoverage) return [];
    var out = [];
    for (var i = 0; i < text.length; i++) {
      var c = text.codePointAt(i);
      if (c === 32 || c === 10) continue;
      var ok = false;
      for (var j = 0; j < fontCoverage.length; j++) {
        if (c >= fontCoverage[j][0] && c <= fontCoverage[j][1]) { ok = true; break; }
      }
      if (!ok && out.indexOf(text[i]) < 0) out.push(text[i]);
    }
    return out;
  }

  /** 캡션 박스 폭에 맞춰 줄바꿈. 한국어는 어절 단위로 끊는다. */
  function wrapLines(cx, text, maxW) {
    var words = String(text).split(/\s+/).filter(Boolean);
    var lines = [], cur = '';
    words.forEach(function (w) {
      var t = cur ? cur + ' ' + w : w;
      if (cx.measureText(t).width <= maxW || !cur) cur = t;
      else { lines.push(cur); cur = w; }
    });
    if (cur) lines.push(cur);
    return lines;
  }

  /** 이미지를 박스 안에 비율 유지로 앉힌다 (contain). 잘리지 않는다. */
  function containRect(iw, ih, box) {
    var s = Math.min(box.w / iw, box.h / ih);
    var w = iw * s, h = ih * s;
    return { x: box.x + (box.w - w) / 2, y: box.y + (box.h - h) / 2, w: w, h: h };
  }

  /**
   * plan + 컷 이미지들 → 한 장. 같은 입력이면 같은 결과다(DPR 고정, 랜덤 없음).
   * images: { index → HTMLImageElement }
   */
  function assemblePage(plan, images, fontFamily, texts) {
    var warn = [];
    var cv = document.createElement('canvas');
    cv.width = plan.canvas.width; cv.height = plan.canvas.height;   // DPR 1 고정
    var cx = cv.getContext('2d');
    cx.imageSmoothingQuality = 'high';
    cx.fillStyle = '#FAF7F2';                       // 종이 — 섬 사이 여백이 실제로 끊겨 보이게
    cx.fillRect(0, 0, cv.width, cv.height);

    // 읽기 순서대로. zIndex가 큰 컷(넘침)이 나중에 그려져 위로 온다.
    var order = plan.panels.slice().sort(function (a, b) {
      return (a.zIndex - b.zIndex) || (plan.readingOrder.indexOf(a.index) - plan.readingOrder.indexOf(b.index));
    });
    order.forEach(function (p) {
      var img = images[p.index];
      if (!img) { warn.push(p.index + '컷 이미지 없음 — 자리를 비운다'); return; }
      var box = p.islandSafeBox;
      var r = containRect(img.naturalWidth, img.naturalHeight, box);
      cx.drawImage(img, r.x, r.y, r.w, r.h);
    });

    // ── 조판 — 폰트가 없으면 그리지 않는다. 시스템 폰트로 때우지 않는다.
    var captions = plan.panels.filter(function (p) { return p.captionBox; });
    if (captions.length && !fontFamily) {
      warn.push('캡션 ' + captions.length + '개를 그리지 않았다 — 조판 폰트가 적재되지 않았다. '
        + '시스템 폰트로 대체하면 기기마다 결과가 달라져 계약이 깨진다(홈즈 QC).');
      return { canvas: cv, warnings: warn };
    }
    captions.forEach(function (p) {
      var box = p.captionBox;
      var text = (texts && texts[p.index]) || '';
      if (!text) return;
      // QC — 이 폰트로 못 그리는 글자가 있으면 **그리지 않는다.** 두부로 나가는 것보다 낫다.
      var bad = uncoveredChars(text);
      if (bad.length) {
        warn.push(p.index + '컷 캡션을 그리지 않았다 — Gaegu에 없는 글자: ' + bad.join(' ')
          + ' (두부로 나가느니 비운다. 문장을 고치거나 폰트를 바꿔야 한다)');
        return;
      }
      var size = 44;
      cx.fillStyle = '#111111';
      cx.textAlign = 'center';
      cx.textBaseline = 'top';
      var lines, lh;
      // QC — 줄바꿈 후 captionBox 폭·높이를 넘지 않아야 한다. 넘으면 한 단계 줄여 다시 잰다.
      for (;;) {
        cx.font = size + 'px "' + fontFamily + '"';
        lines = wrapLines(cx, text, box.w);
        lh = Math.round(size * 1.45);
        if (lines.length * lh <= box.h || size <= 24) break;
        size -= 2;
      }
      if (lines.length * lh > box.h) {
        warn.push(p.index + '컷 캡션이 캡션 칸을 넘는다 (' + lines.length + '줄) — 문장이 길다');
      }
      var y = box.y + Math.max(0, (box.h - lines.length * lh) / 2);
      lines.forEach(function (ln, i) { cx.fillText(ln, box.x + box.w / 2, y + i * lh); });
    });
    return { canvas: cv, warnings: warn };
  }

  function downloadBlob(blob, name) {
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }

  function downloadWhole(key, title) {
    banner('통짜 내려받는 중…');
    fetch(fileUrl(key)).then(function (r) { return r.blob(); }).then(function (b) {
      downloadBlob(b, safeName(title) + '_page.png');
      banner('통짜 저장됨');
    }).catch(function (e) { banner('다운로드 실패: ' + e, 'err'); });
  }

  // store-only ZIP — PNG은 이미 압축돼 있어 무압축으로 묶어도 손해가 없다. 의존성 0.
  function crc32(u8) {
    var t = crc32.t;
    if (!t) {
      t = crc32.t = new Uint32Array(256);
      for (var i = 0; i < 256; i++) {
        var c = i;
        for (var k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
        t[i] = c >>> 0;
      }
    }
    var crc = 0xFFFFFFFF;
    for (var j = 0; j < u8.length; j++) crc = t[(crc ^ u8[j]) & 0xFF] ^ (crc >>> 8);
    return (crc ^ 0xFFFFFFFF) >>> 0;
  }
  function zipStore(files) {
    var enc = new TextEncoder(), chunks = [], central = [], off = 0;
    function u16(n) { return [n & 255, (n >>> 8) & 255]; }
    function u32(n) { return [n & 255, (n >>> 8) & 255, (n >>> 16) & 255, (n >>> 24) & 255]; }
    files.forEach(function (f) {
      var nm = enc.encode(f.name), crc = crc32(f.data), sz = f.data.length;
      var lh = [].concat([80, 75, 3, 4], u16(20), u16(0), u16(0), u16(0), u16(0),
        u32(crc), u32(sz), u32(sz), u16(nm.length), u16(0));
      chunks.push(new Uint8Array(lh), nm, f.data);
      central.push({ nm: nm, crc: crc, sz: sz, off: off });
      off += lh.length + nm.length + sz;
    });
    var cd = [], cdStart = off;
    central.forEach(function (c) {
      var h = [].concat([80, 75, 1, 2], u16(20), u16(20), u16(0), u16(0), u16(0), u16(0),
        u32(c.crc), u32(c.sz), u32(c.sz), u16(c.nm.length), u16(0), u16(0), u16(0), u16(0), u32(0), u32(c.off));
      cd.push(new Uint8Array(h), c.nm);
      off += h.length + c.nm.length;
    });
    var end = new Uint8Array([].concat([80, 75, 5, 6], u16(0), u16(0),
      u16(files.length), u16(files.length), u32(off - cdStart), u32(cdStart), u16(0)));
    return new Blob(chunks.concat(cd, [end]), { type: 'application/zip' });
  }

  // 칸 경계를 찾아 자른다 — 등분하면 칸 한가운데가 잘린다 (2026-07-25 실사고).
  // 페이지 위쪽 제목·부제 영역 때문에 N등분선이 칸 경계와 어긋났고, 결과가 엉망이었다.
  // 칸 사이·바깥은 종이색이므로, 종이색으로만 채워진 가로줄/세로줄이 곧 경계다.
  function detectPanels(img) {
    var cv = document.createElement('canvas');
    cv.width = img.naturalWidth; cv.height = img.naturalHeight;
    var cx = cv.getContext('2d', { willReadFrequently: true });
    cx.drawImage(img, 0, 0);
    var W = cv.width, H = cv.height;
    var d = cx.getImageData(0, 0, W, H).data;
    // 배경색은 좌상단 모서리에서 읽는다 (종이 여백)
    var br = d[0], bg = d[1], bb = d[2];
    function isBg(i) {
      return Math.abs(d[i] - br) < 26 && Math.abs(d[i + 1] - bg) < 26 && Math.abs(d[i + 2] - bb) < 26;
    }
    // 가로줄 스캔 — 잉크 비율이 낮으면 거터
    var stepX = Math.max(1, Math.floor(W / 400));
    var rowInk = new Float32Array(H);
    for (var y = 0; y < H; y++) {
      var ink = 0, n = 0;
      for (var x = 0; x < W; x += stepX) { n++; if (!isBg((y * W + x) * 4)) ink++; }
      rowInk[y] = ink / Math.max(n, 1);
    }
    function bands(arr, len, minRun) {
      var out = [], s0 = -1;
      for (var i = 0; i < len; i++) {
        if (arr[i] > 0.02) { if (s0 < 0) s0 = i; }
        else if (s0 >= 0) { if (i - s0 >= minRun) out.push([s0, i]); s0 = -1; }
      }
      if (s0 >= 0 && len - s0 >= minRun) out.push([s0, len]);
      return out;
    }
    var rowBands = bands(rowInk, H, Math.floor(H * 0.008));
    if (!rowBands.length) return [];
    // 실측(2026-07-25, 「그늘이 지나간 자리」 6컷)으로 확인된 페이지 구조:
    //   제호 21px · 제목 72px · 부제 27px · [칸 323px · 캡션 27px] x 3행
    // → 두꺼운 띠가 칸 행, 그 **바로 아래 얇은 띠가 그 행의 캡션**이다.
    //   캡션은 칸 테두리 바깥에 있으므로 같이 안 자르면 글이 떨어져 나간다.
    var maxH = 0;
    rowBands.forEach(function (b) { maxH = Math.max(maxH, b[1] - b[0]); });
    var thick = rowBands.filter(function (b) { return (b[1] - b[0]) >= maxH * 0.45; });
    if (!thick.length) return [];
    // 각 칸 행에 뒤따르는 캡션 띠를 붙여 한 덩어리로 만든다
    var units = thick.map(function (tb) {
      var end = tb[1];
      for (var k = 0; k < rowBands.length; k++) {
        var cb2 = rowBands[k];
        if (cb2[0] >= tb[1] && (cb2[0] - tb[1]) < H * 0.03 && (cb2[1] - cb2[0]) < maxH * 0.45) {
          end = cb2[1]; break;
        }
      }
      return [tb[0], end];
    });

    var boxes = [];
    units.forEach(function (rb) {
      var y0 = rb[0], y1 = rb[1], stepY = Math.max(1, Math.floor((y1 - y0) / 200));
      var colInk = new Float32Array(W);
      for (var x2 = 0; x2 < W; x2++) {
        var ink2 = 0, n2 = 0;
        for (var y2 = y0; y2 < y1; y2 += stepY) { n2++; if (!isBg((y2 * W + x2) * 4)) ink2++; }
        colInk[x2] = ink2 / Math.max(n2, 1);
      }
      var colBands = bands(colInk, W, Math.floor(W * 0.05));
      if (!colBands.length) colBands = [[0, W]];
      colBands.forEach(function (cb) { boxes.push({ x: cb[0], y: y0, w: cb[1] - cb[0], h: y1 - y0 }); });
    });
    return boxes;
  }

  function downloadInstatoon(key, title, panelCount, shape) {
    var W = 1080, H = (shape === 'square') ? 1080 : 1350;   // 인스타 기본 두 규격
    banner('칸 경계를 찾는 중…');
    var img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = function () {
      var boxes = detectPanels(img);
      // 정직하게 실패한다 — 못 찾았으면 엉뚱하게 자르느니 알린다 (등분 사고의 교훈)
      if (!boxes.length) { banner('칸 경계를 못 찾았다 — 통짜로 받아서 직접 자르시오', 'err'); return; }
      var wantSlides = igSlidesOf(panelCount);   // 한 장에 한 칸
      if (boxes.length !== wantSlides) {
        banner('경고: 칸 ' + panelCount + '개인데 ' + boxes.length + '개로 감지됨 — 결과를 확인하시오', 'err');
      }
      var pad = Math.round(W * 0.04);
      var jobs = boxes.map(function (b, i) {
        return new Promise(function (resolve) {
          var cv = document.createElement('canvas');
          cv.width = W; cv.height = H;
          var cx = cv.getContext('2d');
          cx.fillStyle = '#F4ECDC'; cx.fillRect(0, 0, W, H);
          var scale = Math.min((W - pad * 2) / b.w, (H - pad * 2) / b.h);
          var dw = b.w * scale, dh = b.h * scale;
          cx.drawImage(img, b.x, b.y, b.w, b.h, (W - dw) / 2, (H - dh) / 2, dw, dh);
          cv.toBlob(function (blob) {
            blob.arrayBuffer().then(function (ab) {
              resolve({ name: safeName(title) + '_' + String(i + 1).padStart(2, '0') + '.png',
                data: new Uint8Array(ab) });
            });
          }, 'image/png');
        });
      });
      Promise.all(jobs).then(function (files) {
        downloadBlob(zipStore(files), safeName(title) + '_instatoon_' + W + 'x' + H + '_' + files.length + 'p.zip');
        banner('인스타툰 ' + files.length + '장 저장됨 (' + W + '×' + H + ', 한 장에 한 칸)');
      }).catch(function (e) { banner('분절 실패: ' + e, 'err'); });
    };
    img.onerror = function () { banner('이미지를 못 읽었다', 'err'); };
    img.src = fileUrl(key) + '&v=' + Date.now();
  }

  function drawComic() {
    var s = state.scenario;
    if (!s) { banner('시나리오가 없다', 'err'); return; }
    // 먼저 서버에 물어본다 — 페이지 모드(제미나이)면 한 방, 아니면 컷별
    var probe = $('out');
    probe.innerHTML = '<div class="panel"><span class="spin">◐</span> 페이지를 그리는 중… (제미나이 원샷 — 1~2분)</div>' + probe.innerHTML;
    generateCall({ scenario: s, panelMode: panelMode(), philosophyRef: philosophyApplied() }).then(function (r) {
      if (r.mode === 'page') {
        var pg = '<div class="panel" style="max-width:760px"><h2>「' + esc(s.title) + '」 <span class="muted">' +
          (r.no ? 'Observation #' + String(r.no).padStart(3, '0') + ' · ' : '') +
          esc(r.provider) + ' · ' + esc(r.model) + '</span></h2>' +
          '<img style="width:100%;display:block;border-radius:4px" src="/api/ops/comic-file?key=' +
          encodeURIComponent(r.key) + '&v=' + Date.now() + '">' +
          (r.warnings && r.warnings.length ? '<div class="warn" style="font-size:11px;margin-top:6px">' + esc(r.warnings.join(' · ')) + '</div>' : '') +
          '<div class="row" style="margin-top:10px">' +
          '<button id="dlWhole">⬇ 통짜 1장</button>' +
          '<button id="dlIgV">⬇ 인스타툰 세로 1080×1350</button>' +
          '<button id="dlIgS">⬇ 인스타툰 정사각 1080×1080</button>' +
          '<button id="redraw" class="primary">🎲 전체 다시 그리기</button></div>' +
          '<div class="muted" style="margin-top:8px">검사 축: 같은 별이 · 머리 단색 면 · 빼콩이 유지 · 컷 수 ' +
          s.panelCount + ' · <b>한글 오탈자</b> (원샷 모드의 검사 항목 — 시나리오 문장과 대조)</div></div>';
        $('out').innerHTML = pg;
        var rb = $('redraw');
        if (rb) rb.onclick = drawComic;
        var dw = $('dlWhole');
        if (dw) dw.onclick = function () { downloadWhole(r.key, s.title); };
        var dv = $('dlIgV');
        if (dv) dv.onclick = function () { downloadInstatoon(r.key, s.title, s.panelCount, 'portrait'); };
        var ds = $('dlIgS');
        if (ds) ds.onclick = function () { downloadInstatoon(r.key, s.title, s.panelCount, 'square'); };
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
    state.panelKeys = {};       // 컷 index → R2 키 (조립·manifest가 쓴다)
    state.layoutPlan = null;    // 서버가 그리기 전에 정한 자리표
    state.pageContext = null;
    // 순차 생성 — 진행이 보이고, 실패해도 다음 컷은 계속
    var chain = Promise.resolve();
    s.panels.forEach(function (p) {
      chain = chain.then(function () {
        return genPanel(p.index).then(function (r) {
          done++;
          if (r && r.made && r.made.length) state.panelKeys[String(p.index)] = r.made[0].key;
          if (r && r.comicId) state.comicId = r.comicId;
          if (r && r.layoutPlan) state.layoutPlan = r.layoutPlan;
          if (r && r.pageContext) state.pageContext = r.pageContext;
          var st = $('stripStatus');
          if (st) st.textContent = done + '/' + s.panelCount + (done === s.panelCount ? ' — 완성. 이상한 컷은 [이 컷 다시]' : '');
        });
      });
    });
    chain.then(function () {
      var st = $('stripStatus');
      if (!st) return;
      // 조립은 컷이 다 나온 뒤에만. 빈 자리가 있는 채로 한 장을 만들면 그 페이지가 거짓말을 한다.
      var have = Object.keys(state.panelKeys).length;
      if (have !== s.panelCount) {
        st.textContent += ' · 조립 불가 (' + have + '/' + s.panelCount + ' — 빠진 컷을 먼저 채운다)';
        return;
      }
      if (!state.layoutPlan) { st.textContent += ' · 조립 불가 (자리표 없음)'; return; }
      var b = document.createElement('button');
      b.className = 'primary'; b.id = 'assemble'; b.style.marginTop = '10px';
      b.textContent = '📄 한 장으로 조립';
      st.parentNode.insertBefore(b, st.nextSibling);
      b.onclick = function () { assembleAndSave(b); };
    });
  }

  /**
   * 컷 이미지들 → 한 장 → R2. 홈즈 조건: 완성 bitmap과 manifest를 함께 저장한다.
   * 조립본은 원샷 페이지와 **같은 키**로 들어가므로 목록·통짜·분절이 그대로 동작한다.
   */
  function assembleAndSave(btn) {
    var s = state.scenario;
    btn.disabled = true; btn.innerHTML = '<span class="spin">◐</span> 조립 중…';
    var keys = state.panelKeys;
    var loads = s.panels.map(function (p) {
      return new Promise(function (res, rej) {
        var im = new Image();
        im.crossOrigin = 'anonymous';
        im.onload = function () { res({ index: p.index, img: im }); };
        im.onerror = function () { rej(new Error(p.index + '컷 이미지를 못 읽었다')); };
        im.src = fileUrl(keys[String(p.index)]) + '&v=' + Date.now();
      });
    });
    Promise.all([loadAssemblyFont()].concat(loads)).then(function (all) {
      var fontFamily = all[0];
      var images = {}, texts = {};
      all.slice(1).forEach(function (x) { images[x.index] = x.img; });
      s.panels.forEach(function (p) { if (p.caption) texts[p.index] = p.caption; });
      var out = assemblePage(state.layoutPlan, images, fontFamily, texts);
      return new Promise(function (res) {
        out.canvas.toBlob(function (blob) { res({ blob: blob, warnings: out.warnings, font: fontFamily }); }, 'image/png');
      });
    }).then(function (r) {
      var fd = new FormData();
      fd.append('page', r.blob, 'page.png');
      fd.append('manifest', JSON.stringify({
        version: 'assembly-v1',
        comicId: state.comicId,
        layoutPlan: state.layoutPlan,
        pageContext: state.pageContext || null,
        panelKeys: state.panelKeys,
        font: r.font,
        warnings: r.warnings,
        assembledAt: Date.now(),
      }));
      return fetch('/api/ops/comic-assemble', { method: 'POST', body: fd })
        .then(function (x) { return x.json(); })
        .then(function (j) { return { j: j, warnings: r.warnings }; });
    }).then(function (o) {
      btn.disabled = false; btn.textContent = '📄 한 장으로 조립';
      if (!o.j.ok) { banner('조립 저장 실패: ' + (o.j.error || '?') + ' ' + (o.j.detail || []).join(' / '), 'err'); return; }
      // 경고는 숨기지 않는다 — 빈 자리·못 그린 캡션·넘친 문장은 사람이 알아야 한다
      banner('조립 저장됨 — ' + o.j.panels + '컷 · ' + Math.round(o.j.bytes / 1024) + 'KB'
        + (o.j.font ? ' · 조판 ' + o.j.font : ' · 캡션 미조판(폰트 없음)')
        + (o.warnings.length ? ' · 경고 ' + o.warnings.length + '건' : ''), o.warnings.length ? 'err' : 'info');
      if (o.warnings.length) o.warnings.forEach(function (w) { console.warn('[assemble]', w); });
    }).catch(function (e) {
      btn.disabled = false; btn.textContent = '📄 한 장으로 조립';
      banner('조립 실패: ' + e, 'err');
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
      saveDraft('v1', r.scenario, { provider: r.provider, model: r.model });
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

  // ── S-04B Dialogue Mode ──────────────────────────────────────
  var dlgState = { cut: 'auto', lastInput: null };
  $('tabTheme').onclick = function () {
    $('tabTheme').className = 'sel'; $('tabDialogue').className = '';
    $('themeForm').style.display = ''; $('dialogueForm').style.display = 'none';
  };
  $('tabDialogue').onclick = function () {
    $('tabDialogue').className = 'sel'; $('tabTheme').className = '';
    $('themeForm').style.display = 'none'; $('dialogueForm').style.display = '';
    renderSpeakerMap();
  };
  Array.prototype.forEach.call(document.querySelectorAll('#dlgCuts button'), function (b) {
    b.onclick = function () {
      dlgState.cut = b.getAttribute('data-dcut');
      Array.prototype.forEach.call(document.querySelectorAll('#dlgCuts button'), function (x) {
        x.className = x === b ? 'sel' : '';
      });
    };
  });
  // 화자 감지(클라이언트 표시용 — 권위 파싱은 서버) : "이름:" 콜론 형식 + 이름 단독 줄
  function detectSpeakers(raw) {
    var names = {};
    raw.split('\\n').forEach(function (line) {
      var m = line.trim().match(/^([^\\s:：]{1,24})\\s*[:：]\\s*.+$/);
      if (m) names[m[1]] = true;
    });
    return Object.keys(names);
  }
  function renderSpeakerMap() {
    var names = detectSpeakers($('dlgRaw').value);
    var creators = castNow();
    var box = $('dlgSpeakers');
    if (!names.length) { box.innerHTML = '화자 형식: "이름: 발화" — 화자가 감지되면 여기서 Creator에 연결한다.'; return; }
    box.innerHTML = '<div style="margin-bottom:2px">화자 이름 연결</div>' + names.map(function (n) {
      var guess = creators.filter(function (c) {
        return c.toLowerCase() === n.toLowerCase() || (n === '삽' && c === 'sap') || (n === '홈즈' && c === 'holmes') || (n === '별이' && c === 'byeoli');
      })[0] || '';
      return '<div class="row" style="margin:2px 0">원문 <b>' + esc(n) + '</b> → <select data-sp="' + esc(n) + '" style="background:#12160f;color:#e7dcc4;border:1px solid #2b352a;border-radius:4px;font:inherit;font-size:11px">' +
        '<option value="">(연결 안 됨)</option>' +
        creators.map(function (c) { return '<option value="' + c + '"' + (c === guess ? ' selected' : '') + '>' + c + '</option>'; }).join('') +
        '</select></div>';
    }).join('');
  }
  $('dlgRaw').onblur = renderSpeakerMap;
  function makeDialogueStory(lineRange) {
    var raw = $('dlgRaw').value;
    if (!raw.trim()) { banner('대화 원문이 비어 있다', 'err'); return; }
    var map = {};
    Array.prototype.forEach.call(document.querySelectorAll('[data-sp]'), function (sel) {
      if (sel.value) map[sel.getAttribute('data-sp')] = sel.value;
    });
    var mode = document.querySelector('input[name=dlgMode]:checked').value;
    var place = document.querySelector('input[name=dlgPlace]:checked').value;
    var input = {
      mode: 'dialogue', rawDialogue: raw, speakerMap: map, creators: castNow(),
      requestedPanelCount: dlgState.cut === 'auto' ? 'auto' : Number(dlgState.cut),
      preservationMode: mode,
      placeId: place === 'none' ? null : (place === 'auto' ? null : place),
      lineRange: lineRange || null,
    };
    dlgState.lastInput = input;
    var go = $('goDlg');
    go.disabled = true;
    go.innerHTML = '<span class="spin">◐</span> 각색 중… (원문에서 사건을 찾는 중)';
    api('/api/ops/comic-dialogue', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify(input),
    }).then(function (r) {
      go.disabled = false; go.textContent = '대화를 웹툰 시나리오로 만들기';
      if (r.mode === 'episodes') {
        var html = '<div class="panel"><h2>긴 대화 — 에피소드 후보 <span class="muted">' + r.totalUtterances + '발화 · 한 편으로 만들지 않는다</span></h2>';
        (r.episodes || []).forEach(function (ep) {
          html += '<div class="cut"><b>' + esc(ep.title) + '</b> <span class="muted">' + ep.startLine + '–' + ep.endLine + '행' +
            (ep.why ? ' · ' + esc(ep.why) : '') + '</span><div style="margin-top:6px"><button data-ep="' + ep.startLine + '-' + ep.endLine + '" class="primary">이 에피소드로</button></div></div>';
        });
        html += '</div>';
        $('out').innerHTML = html;
        Array.prototype.forEach.call(document.querySelectorAll('[data-ep]'), function (b) {
          b.onclick = function () {
            var pr = b.getAttribute('data-ep').split('-');
            makeDialogueStory({ start: Number(pr[0]), end: Number(pr[1]) });
          };
        });
        return;
      }
      if (r.error === 'dialogue_invalid' || r.error === 'scenario_invalid') {
        banner((r.error === 'dialogue_invalid' ? '입력 문제 — ' : '각색 반려 — ') + (r.detail || []).join(' / ')
          + (r.error === 'scenario_invalid' ? ' ⟵ 반려된 각색은 화면에 반영되지 않는다. 아래 시나리오는 이전 초안 그대로다.' : ''), 'err');
        return;
      }
      if (r.error) { banner('실패: ' + r.error, 'err'); return; }
      state.scenario2 = r.scenario2;
      saveDraft('v2', r.scenario2, { provider: r.provider, model: r.model, beats: r.beats });
      renderScenarioV2(r.scenario2, r);
      if (r.warnings && r.warnings.length) banner('각색 완료 · 경고: ' + r.warnings.join(' · '));
      else banner('각색 완료 — 비트와 원문 근거를 컷별로 확인');
    }).catch(function (e) { go.disabled = false; go.textContent = '대화를 웹툰 시나리오로 만들기'; banner('요청 실패: ' + e, 'err'); });
  }
  $('goDlg').onclick = function () { makeDialogueStory(null); };

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
