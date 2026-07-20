// BUILD 431 — /api/ops/sketch-lab (Ops 호스트 전용 · Access 뒤)
//
// 그림 시험 관리자. 콘솔 스니펫 붙여넣기를 대체한다 (Vase 지시 2026-07-20:
// "콘솔로 하는 건 너무 구려"). 이 페이지가 하는 일은 세 가지뿐이다:
//   1. 하루(기억) 세우기·확인 — 출처가 autopost인지까지 보여준다
//   2. 생성 인자 조절 — 참조 넣고 빼기(역할 배정) · 임시 주제 · seed · 모델
//   3. 생성 → 결과를 그림+판정 축과 함께 보여준다
//
// ⛔ 하드룰 (sketch-trial과 동일):
//   - 자동 게시 금지 · 크론 연결 금지 — 이 페이지는 기존 시험 엔드포인트를 부를 뿐,
//     새 쓰기 경로를 만들지 않는다 (memory / sketch-trial / sketch-reference가 전부)
//   - autopost·publish·threads 어떤 경로와도 연결되지 않는다
//
// 판정 참고(2026-07-20 저녁): 그림체 확정 = **무참조 텍스트-only** (trialId 0df9de92).
// 참조 조건화가 크롭 참조의 물렁함을 출력에 상속시켜 화질을 깎았다. 그래서 이 페이지의
// 참조 기본 상태는 전부 '제외'다 — 참조는 이제 실험 도구지 기본값이 아니다.

const HTML = `<!doctype html><html lang="ko"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>별이 그림 실험실 — sketch lab</title>
<style>
  :root{color-scheme:dark}
  body{margin:0;padding:24px;background:#12160f;color:#e7dcc4;
    font:14px/1.6 ui-monospace,SFMono-Regular,Menlo,monospace}
  h1{font-size:18px;margin:0 0 4px} h2{font-size:13px;color:#A7B49A;margin:0 0 10px;font-weight:600}
  .lead{color:#7d8a76;margin:0 0 18px;font-size:12px}
  .cols{display:grid;grid-template-columns:380px 1fr;gap:20px;align-items:start}
  @media (max-width:900px){.cols{grid-template-columns:1fr}}
  .panel{background:#1a1f16;border:1px solid #2b352a;border-radius:6px;padding:14px;margin-bottom:14px}
  label{display:block;font-size:11px;color:#7d8a76;margin:8px 0 2px}
  input[type=text],input[type=number],input[type=date],select,textarea{
    width:100%;box-sizing:border-box;background:#12160f;color:#e7dcc4;border:1px solid #2b352a;
    border-radius:4px;padding:6px 8px;font:inherit;font-size:12px}
  textarea{min-height:64px;resize:vertical}
  button{background:#2b352a;color:#e7dcc4;border:1px solid #3d4a3b;border-radius:4px;
    padding:6px 12px;font:inherit;font-size:12px;cursor:pointer}
  button:hover{background:#3d4a3b}
  button.primary{background:#4a5d3a;border-color:#5d7548;font-weight:600}
  button.danger{border-color:#5d3a3a;color:#c8a0a0}
  button:disabled{opacity:.4;cursor:default}
  .row{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
  .muted{color:#7d8a76;font-size:11px}
  .ok{color:#A7B49A} .warn{color:#c8a878} .bad{color:#c8a0a0}
  .refgrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(96px,1fr));gap:8px;margin-top:8px}
  .refcard{border:1px solid #2b352a;border-radius:4px;overflow:hidden;background:#12160f}
  .refcard img{display:block;width:100%;height:80px;object-fit:contain;background:#fff}
  .refcard .nm{font-size:10px;padding:2px 4px;word-break:break-all;color:#7d8a76}
  .refcard select{border:0;border-top:1px solid #2b352a;border-radius:0;font-size:11px}
  .refcard .del{width:100%;border:0;border-top:1px solid #2b352a;border-radius:0;font-size:10px;padding:3px}
  .chips{display:flex;gap:6px;flex-wrap:wrap;margin-top:6px}
  .chip{background:#2b352a;border-radius:12px;padding:2px 10px;font-size:12px;cursor:pointer}
  .chip:hover{background:#5d3a3a}
  .day{font-size:12px;line-height:1.7}
  .day b{color:#A7B49A}
  .results figure{margin:0 0 14px;background:#1a1f16;border:1px solid #2b352a;border-radius:6px;overflow:hidden}
  .results img{display:block;width:100%;max-width:560px;background:#fff}
  .results figcaption{padding:8px 10px;font-size:11px;color:#7d8a76;display:grid;gap:2px}
  details{margin-top:8px;font-size:12px} summary{cursor:pointer;color:#A7B49A}
  pre{white-space:pre-wrap;background:#12160f;border:1px solid #2b352a;border-radius:4px;
    padding:10px;font-size:11px;color:#c9beA6;max-height:300px;overflow:auto}
  ul.judge{margin:8px 0 0;padding-left:18px;color:#7d8a76;font-size:11px}
  .banner{padding:8px 12px;border-radius:4px;font-size:12px;margin-bottom:10px;display:none}
  .banner.show{display:block}
  .banner.err{background:#2a1a1a;border:1px solid #5d3a3a;color:#c8a0a0}
  .banner.info{background:#1a231a;border:1px solid #3d4a3b;color:#A7B49A}
  .spin{display:inline-block;animation:sp 1s linear infinite}
  @keyframes sp{to{transform:rotate(360deg)}}
  a{color:#A7B49A}
</style></head><body>
<h1>별이 그림 실험실</h1>
<p class="lead">확정 그림체(2026-07-20) = <b>무참조 텍스트-only</b>. 참조는 기본 '제외' — 실험할 때만 역할을 준다.
· <a href="/api/ops/sketch-board">스타일 보드 →</a></p>
<div id="banner" class="banner"></div>
<div class="cols">
<div>

  <div class="panel">
    <h2>① 하루 (기억)</h2>
    <div class="row">
      <input type="date" id="date" style="flex:1">
      <button id="loadDay">불러오기</button>
      <button id="buildDay">하루 세우기</button>
    </div>
    <div id="dayInfo" class="day muted" style="margin-top:8px">—</div>
    <label style="margin-top:10px"><input type="radio" name="memmode" value="stored" checked> 저장된 하루로 그린다 (useMemory)</label>
    <label><input type="radio" name="memmode" value="temp"> 임시 장면으로 그린다 (실험용 — 기억에 안 남음)</label>
    <div id="tempBox" style="display:none">
      <label>임시 관찰 줄 (줄바꿈 구분)</label>
      <textarea id="tempLines" placeholder="전봇대 아래 들쥐&#10;창에 부딪는 새"></textarea>
      <label>가장 크게 그릴 것</label>
      <input type="text" id="tempTarget" placeholder="전봇대">
      <label>밀도</label>
      <select id="tempDensity"><option value="quiet">quiet — 조용한 하루</option>
        <option value="normal" selected>normal — 보통</option><option value="full">full — 사건 있던 날</option></select>
    </div>
  </div>

  <div class="panel">
    <h2>② 참조 그림 <span class="muted">(역할을 줘야만 들어간다 · 순서: 캐릭터 → 스타일 · 총 4장)</span></h2>
    <div id="refs" class="refgrid"><span class="muted">불러오는 중…</span></div>
    <div style="margin-top:10px">
      <label>파일 (고르면 이름이 자동으로 채워진다)</label>
      <input type="file" id="refFile" accept="image/png,image/jpeg,image/webp">
      <label>이름 (소문자 슬러그 — 자동 제안을 고쳐도 됨)</label>
      <div class="row">
        <input type="text" id="refName" placeholder="byeoli_v2" style="flex:1;min-width:140px">
        <button id="refUpload">업로드</button>
      </div>
    </div>
  </div>

  <div class="panel">
    <h2>③ 주제 못박기 <span class="muted">(subjects — 수를 아라비아 숫자로)</span></h2>
    <div class="row">
      <input type="text" id="subjInput" placeholder="예: utility pole (이름만 — 숫자는 자동)" style="flex:1">
      <button id="subjAdd">추가</button>
      <button id="subjFromDay" title="하루의 targetLabel로 채움">하루에서</button>
    </div>
    <div id="subjChips" class="chips"></div>
    <div class="muted" style="margin-top:4px">칩을 누르면 빠진다. <b>별이·빼콩이 수는 서버가 항상 못박는다</b>(9차) — 여긴 소품·대상만. 숫자를 붙여도 이중이 안 되게 서버가 걸러준다. <b>한글로 넣어도 된다</b> — 서버가 영어로 번역해 넘기고, 번역이 안 되면 빼고 알려준다(모델은 한글을 그림으로 취급). 한글 낙서 이벤트를 일부러 넣고 싶으면 ④의 장면 영문 지정에 한글을 직접 쓰면 그대로 나간다.</div>
  </div>

  <div class="panel">
    <h2>④ 생성 인자</h2>
    <label>모델</label><select id="model"></select>
    <div class="row">
      <div style="flex:1"><label>seed</label><input type="number" id="seed" value="431001"></div>
      <div><label>&nbsp;</label><button id="seedRand" title="새 seed">🎲</button></div>
      <div style="flex:1"><label>장수 (1–6)</label><input type="number" id="count" value="1" min="1" max="6"></div>
      <div style="flex:1"><label>steps (1–20)</label><input type="number" id="steps" value="4" min="1" max="20" title="불량률 다이얼 — 기본 4, 올리면 생성이 느려지는 대신 기형이 줄 수 있다"></div>
    </div>
    <details><summary>장면 영문 직접 지정 (선택)</summary>
      <label>sceneEn — 비우면 서버가 관찰을 번역한다</label>
      <textarea id="sceneEn" placeholder="a girl looking up at a utility pole, a rat below"></textarea>
    </details>
    <div style="margin-top:12px">
      <button id="go" class="primary" style="width:100%;padding:10px">생성</button>
    </div>
  </div>

</div>
<div class="results" id="results">
  <div class="panel">
    <h2>판정 축 (예쁘냐가 아니라)</h2>
    <ul class="judge">
      <li>실제 autopost가 사용한 순간에서 왔는가 — ①의 출처가 전부 autopost인가</li>
      <li>사람이 안 넣은 targetLabel·diaryLines가 프롬프트에 반영됐는가</li>
      <li>그림의 중심 대상이 가장 크게 그릴 것과 맞는가</li>
      <li>기록이 얇으면 실제로 quiet하게 나오는가</li>
      <li>다른 날짜·다른 사건이 섞이지 않았는가</li>
      <li>같은 seed 재실행이 이유 없이 그림을 쌓지 않는가 (같은 키 덮어씀)</li>
    </ul>
  </div>
  <div id="out"></div>
</div>
</div>
<script>
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var state = { refs: [], roles: {}, subjects: [], day: null, srcOf: {} };
  try { state.roles = JSON.parse(localStorage.getItem('lab_roles') || '{}'); } catch (e) {}
  try { state.subjects = JSON.parse(localStorage.getItem('lab_subjects') || '[]'); } catch (e) {}

  function banner(msg, kind) {
    var b = $('banner');
    b.textContent = msg;
    b.className = 'banner show ' + (kind || 'info');
    if (!msg) b.className = 'banner';
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
  function kstToday() {
    return new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
  }

  // ── ① 하루 ──
  function renderDay() {
    var d = state.day;
    if (!d) { $('dayInfo').textContent = '—'; return; }
    if (d.error || d.captureCount === undefined) {
      $('dayInfo').innerHTML = '<span class="bad">하루 조회 실패: ' + esc(d.error || '응답 형식 이상') + '</span>';
      return;
    }
    var ev = d.stored ? d.stored.event : (d.preview ? d.preview.event : null);
    var src = d.stored ? d.stored : d.preview;
    if (!ev) {
      $('dayInfo').innerHTML = '<span class="warn">' + esc(d.note) + '</span> · 관찰 ' + d.captureCount + '건';
      return;
    }
    var ids = (src.sourceCaptureIds || []).map(function (id) {
      var s = state.srcOf[id] || '(창 밖)';
      var cls = s === 'autopost' ? 'ok' : 'warn';
      return esc(id) + ' ← <span class="' + cls + '">' + esc(s) + '</span>';
    }).join('<br>');
    var allAuto = (src.sourceCaptureIds || []).length &&
      (src.sourceCaptureIds || []).every(function (id) { return state.srcOf[id] === 'autopost'; });
    $('dayInfo').innerHTML =
      '<b>' + (d.stored ? '저장됨' : '미리보기 (POST 전)') + '</b> · 관찰 ' + d.captureCount + '건 · density ' + esc(src.density) +
      '<br>사건: ' + esc(src.memoryEventId || '—') +
      '<br>가장 크게: <b>' + esc(ev.targetLabel || '—') + '</b>' +
      '<br>' + (ev.lines || []).map(function (l) { return '· ' + esc(l); }).join('<br>') +
      '<br>출처: <br>' + (ids || '—') +
      '<br>' + (allAuto
        ? '<span class="ok">✅ 전부 autopost — 사람이 지어내지 않은 하루</span>'
        : '<span class="warn">⚠ autopost 아닌 출처 포함 — 정식 1호 조건 미충족</span>');
  }
  function loadDay() {
    var date = $('date').value;
    Promise.all([api('/api/ops/memory?date=' + date), api('/api/ops/capture')])
      .then(function (rs) {
        state.day = rs[0];
        state.srcOf = {};
        (rs[1].captures || []).forEach(function (c) {
          state.srcOf[c.captureId] = c.source || 'ops-capture(구형)';
        });
        renderDay();
      });
  }
  $('loadDay').onclick = loadDay;
  $('buildDay').onclick = function () {
    api('/api/ops/memory', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ date: $('date').value }),
    }).then(function (r) {
      if (r.error) { banner('하루 세우기 실패: ' + (r.detail || r.error), 'err'); return; }
      banner('하루 저장됨: ' + r.date);
      loadDay();
    });
  };
  Array.prototype.forEach.call(document.querySelectorAll('input[name=memmode]'), function (el) {
    el.onchange = function () {
      $('tempBox').style.display = el.value === 'temp' && el.checked ? 'block' : 'none';
    };
  });

  // ── ② 참조 ──
  function saveRoles() { localStorage.setItem('lab_roles', JSON.stringify(state.roles)); }
  function renderRefs() {
    var box = $('refs');
    if (!state.refs.length) { box.innerHTML = '<span class="muted">등록된 참조 없음</span>'; return; }
    box.innerHTML = '';
    state.refs.forEach(function (r) {
      var card = document.createElement('div');
      card.className = 'refcard';
      var role = state.roles[r.key] || 'off';
      card.innerHTML =
        '<img src="' + esc(r.preview) + '" loading="lazy">' +
        '<div class="nm">' + esc(r.key.split('/').pop()) + ' · ' + Math.round(r.size / 1024) + 'KB</div>' +
        '<select><option value="off">제외</option><option value="char">캐릭터</option>' +
        '<option value="style">스타일</option></select>' +
        '<button class="del danger">삭제</button>';
      var sel = card.querySelector('select');
      sel.value = role;
      sel.onchange = function () { state.roles[r.key] = sel.value; saveRoles(); };
      card.querySelector('.del').onclick = function () {
        if (!confirm(r.key + ' 를 R2에서 지운다. 되돌릴 수 없다.')) return;
        fetch('/api/ops/sketch-reference?key=' + encodeURIComponent(r.key), { method: 'DELETE' })
          .then(function (res) { return res.json(); })
          .then(function (res) {
            if (res.error) { banner('삭제 실패: ' + res.error, 'err'); return; }
            delete state.roles[r.key]; saveRoles(); loadRefs();
          });
      };
      box.appendChild(card);
    });
  }
  function loadRefs() {
    api('/api/ops/sketch-reference').then(function (r) {
      state.refs = r.references || [];
      renderRefs();
    });
  }
  // 파일명 → 슬러그 자동 제안 (byeoli v2.png → byeoli_v2). 이름 칸이 안 보여 빈 채로
  // 눌리던 실사용 사고(2026-07-20 밤)의 재발 방지 — 타이핑 없이도 이름이 선다.
  $('refFile').onchange = function () {
    var f = $('refFile').files[0];
    if (!f || $('refName').value.trim()) return;
    var slug = f.name.replace(/\.[^.]+$/, '').toLowerCase()
      .replace(/[^a-z0-9_-]+/g, '_').replace(/^[^a-z]+/, '').slice(0, 32);
    $('refName').value = slug;
  };
  $('refUpload').onclick = function () {
    var f = $('refFile').files[0];
    var name = $('refName').value.trim();
    var btn = $('refUpload');
    if (!f || !name) { banner('이름과 파일 둘 다 필요', 'err'); return; }
    if (!/^[a-z][a-z0-9_-]{0,31}$/.test(name)) {
      banner('이름은 소문자로 시작하는 슬러그만 (예: byeoli_v2)', 'err'); return;
    }
    if (!f.type || ['image/png', 'image/jpeg', 'image/webp'].indexOf(f.type) < 0) {
      banner('png/jpeg/webp만 가능 (이 파일: ' + (f.type || '타입 없음') + ')', 'err'); return;
    }
    if (f.size > 8 * 1024 * 1024) { banner('8MB 이하만 (' + Math.round(f.size / 1048576) + 'MB)', 'err'); return; }
    btn.disabled = true; btn.textContent = '업로드 중…';
    fetch('/api/ops/sketch-reference?name=' + encodeURIComponent(name), {
      method: 'POST', headers: { 'content-type': f.type }, body: f,
    }).then(function (res) {
      return res.json().catch(function () { return { error: 'HTTP ' + res.status + ' (JSON 아님 — Access 만료면 새로고침)' }; });
    }).then(function (res) {
      btn.disabled = false; btn.textContent = '업로드';
      if (res.error) { banner('업로드 실패: ' + res.error, 'err'); return; }
      banner('업로드됨: ' + res.key + ' (' + Math.round(res.size / 1024) + 'KB)');
      $('refName').value = ''; $('refFile').value = '';
      loadRefs();
    }).catch(function (e) {
      btn.disabled = false; btn.textContent = '업로드';
      banner('업로드 요청 자체가 실패: ' + e + ' — 네트워크 또는 Access 세션 확인', 'err');
    });
  };

  // ── ③ 주제 ──
  function saveSubjects() { localStorage.setItem('lab_subjects', JSON.stringify(state.subjects)); }
  function renderSubjects() {
    var box = $('subjChips');
    box.innerHTML = '';
    state.subjects.forEach(function (s, i) {
      var c = document.createElement('span');
      c.className = 'chip';
      c.textContent = s + ' ×';
      c.onclick = function () { state.subjects.splice(i, 1); saveSubjects(); renderSubjects(); };
      box.appendChild(c);
    });
  }
  $('subjAdd').onclick = function () {
    var v = $('subjInput').value.trim();
    if (!v) return;
    state.subjects.push(v); saveSubjects(); renderSubjects();
    $('subjInput').value = '';
  };
  $('subjInput').onkeydown = function (e) { if (e.key === 'Enter') $('subjAdd').onclick(); };
  $('subjFromDay').onclick = function () {
    var src = state.day && (state.day.stored || state.day.preview);
    if (!src || !src.event || !src.event.targetLabel) { banner('하루를 먼저 불러와야 한다', 'err'); return; }
    state.subjects.push(src.event.targetLabel);   // 숫자는 서버가 붙인다
    saveSubjects(); renderSubjects();
  };

  // ── ④ 생성 ──
  $('seedRand').onclick = function () {
    $('seed').value = String(Math.floor(Math.random() * 900000) + 100000);
  };
  function chosenRefs(role) {
    return state.refs.filter(function (r) { return state.roles[r.key] === role; })
      .map(function (r) { return r.key; });
  }
  $('go').onclick = function () {
    var mode = document.querySelector('input[name=memmode]:checked').value;
    var body = {
      confirm: 'trial',
      models: [$('model').value],
      count: Math.max(1, Math.min(6, Number($('count').value) || 1)),
      seed: Number($('seed').value),
      steps: Math.max(1, Math.min(20, Number($('steps').value) || 4)),
      referenceKeys: chosenRefs('char'),
      styleKeys: chosenRefs('style'),
      subjects: state.subjects.slice(),
    };
    var sceneEn = $('sceneEn').value.trim();
    if (sceneEn) body.sceneEn = sceneEn;
    if (mode === 'stored') {
      if (!state.day || !state.day.stored) { banner('저장된 하루가 없다 — 먼저 [하루 세우기]', 'err'); return; }
      body.useMemory = $('date').value;
    } else {
      var lines = $('tempLines').value.split('\\n').map(function (l) { return l.trim(); }).filter(Boolean);
      if (!lines.length) { banner('임시 장면 줄이 비어 있다', 'err'); return; }
      body.memory = {
        date: kstToday(), momentAt: Date.now(),
        targetLabel: $('tempTarget').value.trim() || null, targetType: null,
        lines: lines, density: $('tempDensity').value,
        diaryText: null, selectedPhoto: null, sketchDiary: null,
      };
    }
    var go = $('go');
    go.disabled = true;
    go.innerHTML = '<span class="spin">◐</span> 생성 중… (수십 초 걸린다)';
    api('/api/ops/sketch-trial', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }).then(function (r) {
      go.disabled = false; go.textContent = '생성';
      renderResult(r, body);
    }).catch(function (e) {
      go.disabled = false; go.textContent = '생성';
      banner('요청 실패: ' + e, 'err');
    });
  };
  function renderResult(r, body) {
    var out = $('out');
    if (r.error) { banner('생성 실패: ' + r.error, 'err'); return; }
    banner('생성 ' + r.generated + '장 · memorySource ' + r.memorySource +
      (r.errors && r.errors.length ? ' · 오류 ' + r.errors.length + '건' : ''));
    var html = '<div class="panel"><h2>결과 — ' + esc(r.trialId) + '</h2>' +
      '<div class="muted">memorySource <b class="' +
      (String(r.memorySource).indexOf('stored:') === 0 ? 'ok' : 'warn') + '">' + esc(r.memorySource) +
      '</b> · promptHash ' + esc(r.promptHash) +
      ' · 참조 캐릭터 ' + body.referenceKeys.length + '장 / 스타일 ' + body.styleKeys.length + '장</div>';
    if (r.errors && r.errors.length) {
      html += '<div class="bad" style="font-size:12px;margin-top:6px">' +
        r.errors.map(esc).join('<br>') + '</div>';
    }
    (r.records || []).forEach(function (rec) {
      html += '<figure>' +
        (rec.r2Key
          ? '<img src="/api/ops/sketch-image?key=' + encodeURIComponent(rec.r2Key) + '">'
          : '<div class="muted" style="padding:20px">이미지 없음</div>') +
        '<figcaption><b>' + esc(rec.model.split('/').pop()) + '</b>' +
        '<span>seed ' + esc(rec.seed) + ' · ' + esc(rec.role) +
        ' · 참조 적용 ' + (rec.referenceApplied ? 'O' : 'X') + '</span>' +
        '<span>' + esc(rec.r2Key || '') + '</span></figcaption></figure>';
    });
    html += '<details><summary>프롬프트 (한국어 검토용)</summary><pre>' + esc(r.promptKo) + '</pre></details>' +
      '<details><summary>프롬프트 (모델에 나간 영어)</summary><pre>' + esc(r.prompt) + '</pre></details></div>';
    out.innerHTML = html + out.innerHTML;   // 최신이 위 — 비교는 스타일 보드에서
  }

  // ── 초기화 ──
  $('date').value = kstToday();
  api('/api/ops/sketch-trial').then(function (r) {
    var sel = $('model');
    var models = Object.keys(r.candidates || {}).map(function (k) { return r.candidates[k]; });
    sel.innerHTML = models.map(function (c) {
      return '<option value="' + esc(c.model) + '"' + (c.supportsReference ? '' : ' data-noref') + '>' +
        esc(c.model.split('/').pop()) + (c.supportsReference ? ' (참조 가능)' : ' (텍스트만)') + '</option>';
    }).join('');
    // 기본 = 확정 그림체의 모델(flux-2-dev). schnell이 첫 항목이라 기본이 되던 혼선 실발생 (2026-07-20 밤).
    var confirmed = models.filter(function (c) { return c.model.indexOf('flux-2-dev') >= 0; })[0];
    if (confirmed) sel.value = confirmed.model;
    if (!r.aiBinding) banner('⚠ AI 바인딩 없음 — 생성이 실패한다', 'err');
  });
  renderSubjects();
  loadRefs();
  loadDay();
})();
</script>
</body></html>`;

export const onRequestGet: PagesFunction = async () =>
  new Response(HTML, {
    headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' },
  });
