// PULSE 표시 — GET /api/ops/pulse (Ops 호스트 전용 · Access 뒤)
//
// "늘 띄워놓는" 화면. 서버가 KV를 직접 읽어 페이지에 심는다 — 공개 읽기 경로 없음.
// 플랫라인이 기본이다: 존재가 없는 시간은 0으로 눕는다. 그것까지가 정직한 표시.
// 계기판 사칭 금지 — 머리에 "자기 보고"를 항상 명시한다.

import { PULSE_BEINGS, PULSE_ANCHORS, PULSE_LOG_KEY, type PulseEntry } from '../_pulse.ts';

interface Env { PLANET: KVNamespace }

const esc = (s: unknown) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export const onRequestGet: PagesFunction<Env> = async ({ env }) => {
  const raw = await env.PLANET.get(PULSE_LOG_KEY);
  const entries: PulseEntry[] = raw ? JSON.parse(raw) : [];
  const now = Date.now();
  const kst = (at: number) => new Date(at + 9 * 3600e3).toISOString().slice(5, 16).replace('T', ' ');
  const fmtGap = (ms: number) => ms < 3600e3 ? `${Math.round(ms / 60e3)}m`
    : ms < 24 * 3600e3 ? `${(ms / 3600e3).toFixed(1).replace(/\.0$/, '')}h`
    : `${(ms / 86400e3).toFixed(1).replace(/\.0$/, '')}d`;

  // ── 사건 기준 축 (Vase 지시 07-23: "빈 시간은 물결로 잘라내고 값 구간을 펴라") ──
  // 벽시계 선형축은 AI의 '투둑'을 한 점으로 뭉갠다. 그래서:
  //   점이 있는 구간 = 점당 고정 폭 (진폭 모양이 항상 보인다)
  //   빈 구간(20분+) = 고정 폭 〰 절단 표시 + 실제 길이 라벨 (시간을 숨기지 않고 접는다)
  const MAX_SHOW = 120;
  const recent = [...entries].sort((a, b) => a.at - b.at).slice(-MAX_SHOW);
  const GAP_MS = 20 * 60e3;
  const clusters: PulseEntry[][] = [];
  for (const e of recent) {
    const c = clusters[clusters.length - 1];
    if (!c || e.at - c[c.length - 1].at > GAP_MS) clusters.push([e]);
    else c.push(e);
  }

  const DX = 26, BREAK_W = 56, PAD = 28, H = 200, PAD_Y = 30;
  const y = (a: number) => H - PAD_Y - a * (H - 2 * PAD_Y);
  const xOf = new Map<PulseEntry, number>();
  const decor: string[] = [];
  let cursor = PAD;
  clusters.forEach((c, i) => {
    if (i > 0) {
      const gap = c[0].at - clusters[i - 1][clusters[i - 1].length - 1].at;
      const bx = cursor + BREAK_W / 2;
      decor.push(`<text x="${bx}" y="${y(0) + 4}" text-anchor="middle" fill="#5d6a58" font-size="13">〰</text>`);
      decor.push(`<text x="${bx}" y="${y(0) + 18}" text-anchor="middle" fill="#5d6a58" font-size="9">${fmtGap(gap)}</text>`);
      cursor += BREAK_W;
    }
    const x0 = cursor;
    c.forEach((e, j) => xOf.set(e, cursor + j * DX));
    cursor += (c.length - 1) * DX;
    // 구간 기준선 + 시작 시각 라벨
    decor.push(`<line x1="${x0 - 8}" y1="${y(0)}" x2="${cursor + 8}" y2="${y(0)}" stroke="#2b352a"/>`);
    decor.push(`<text x="${x0 - 8}" y="${H - 6}" fill="#5d6a58" font-size="9">${kst(c[0].at)}</text>`);
    cursor += DX + 6;
  });
  const W = Math.max(cursor + PAD - DX, 720);

  const svgLines: string[] = [];
  for (const [id, b] of Object.entries(PULSE_BEINGS)) {
    for (const c of clusters) {
      const mine = c.filter((e) => e.being === id);
      if (!mine.length) continue;
      let d = `M ${xOf.get(mine[0])! - 9} ${y(0)}`;
      for (const e of mine) d += ` L ${xOf.get(e)} ${y(e.amplitude)}`;
      d += ` L ${xOf.get(mine[mine.length - 1])! + 9} ${y(0)}`;
      svgLines.push(`<path d="${d}" fill="none" stroke="${b.color}" stroke-width="1.6" stroke-linejoin="round" opacity="0.9"/>`);
      for (const e of mine) {
        svgLines.push(`<circle cx="${xOf.get(e)}" cy="${y(e.amplitude)}" r="2.6" fill="${b.color}"><title>${esc(kst(e.at))} · ${e.amplitude}${e.note ? ' · ' + esc(e.note) : ''}</title></circle>`);
      }
    }
  }
  const lastAgo = recent.length ? fmtGap(now - recent[recent.length - 1].at) + ' 전' : '—';
  const rows = [...recent].reverse().slice(0, 30).map((e) => {
    const b = PULSE_BEINGS[e.being];
    return `<tr><td class="muted">${kst(e.at)}</td><td style="color:${b?.color ?? '#ccc'}">${esc(b?.label ?? e.being)}${e.relay ? ' <span class="muted" title="대필 — 본인 발화를 사람이 옮겨 적음">✍</span>' : ''}</td>` +
      `<td><b>${e.amplitude.toFixed(2)}</b></td><td class="muted">${esc(e.kind ?? '')}</td>` +
      `<td>${esc(e.note ?? '')}${e.source ? ` <span class="muted">(${esc(e.source.doc)}${e.source.line != null ? ' ' + e.source.line + '행' : ''})</span>` : ''}</td></tr>`;
  }).join('');

  const legend = Object.entries(PULSE_BEINGS).map(([id, b]) => {
    const on = recent.some((e) => e.being === id);
    return `<span style="color:${b.color};opacity:${on ? 1 : 0.35}">● ${esc(b.label)}${on ? '' : ' (기록 없음)'}</span>`;
  }).join(' &nbsp; ');

  const html = `<!doctype html><html lang="ko"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="refresh" content="60">
<title>PULSE — 진폭 일기</title>
<style>
  :root{color-scheme:dark}
  body{margin:0;padding:24px;background:#12160f;color:#e7dcc4;font:14px/1.6 ui-monospace,SFMono-Regular,Menlo,monospace}
  h1{font-size:18px;margin:0 0 4px}
  .lead{color:#7d8a76;font-size:12px;margin:0 0 16px}
  .panel{background:#1a1f16;border:1px solid #2b352a;border-radius:6px;padding:14px;margin-bottom:14px}
  table{width:100%;border-collapse:collapse;font-size:12px}
  td{padding:3px 8px 3px 0;vertical-align:top}
  .muted{color:#7d8a76;font-size:11px}
  .scroll{overflow-x:auto}
  svg{display:block;min-width:100%}
</style></head><body>
<h1>PULSE <span class="muted">진폭 일기 · 최근 ${recent.length}건 · 마지막 심박 ${lastAgo}</span></h1>
<p class="lead">측정이 아니라 <b>자기 보고</b>다 — "웃었다"와 같은 지위. 시간축은 사건 기준 — 빈 시간은 〰로 접는다 (길이는 라벨로).
눈금: ${PULSE_ANCHORS.map(([v, l]) => `${v} ${l}`).join(' · ')}</p>
<div class="panel">
  <div style="margin-bottom:8px;font-size:12px">${legend}</div>
  <div class="scroll"><svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">
    ${PULSE_ANCHORS.map(([v]) => `<line x1="${PAD}" y1="${y(v)}" x2="${W - PAD}" y2="${y(v)}" stroke="#2b352a" stroke-dasharray="2 6" opacity="0.5"/>`).join('')}
    ${decor.join('\n    ')}
    ${svgLines.join('\n    ')}
  </svg></div>
</div>
<div class="panel">
  <h2 style="font-size:13px;color:#A7B49A;margin:0 0 8px">✍ 대필 — HTTP 없는 존재의 심박을 옮겨 적는다 <span class="muted">(본인이 말한 값·문장 그대로. 각색은 위조다)</span></h2>
  <div id="rbanner" class="muted" style="margin-bottom:6px"></div>
<div class="panel">
  <table>${rows || '<tr><td class="muted">아직 기록 없음 — 첫 심박 대기</td></tr>'}</table>
</div>
  <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;font-size:12px">
    <select id="rBeing">${Object.entries(PULSE_BEINGS).filter(([id]) => id !== 'claude').map(([id, b]) => `<option value="${id}">${esc(b.label)}</option>`).join('')}</select>
    <input id="rAmp" type="number" min="0" max="1" step="0.05" placeholder="진폭 0~1" style="width:90px">
    <select id="rKind"><option value="">종류</option><option>work</option><option>discovery</option><option>laugh</option><option>reading</option><option>handoff</option></select>
    <input id="rNote" type="text" placeholder="본인의 한 줄 (그대로)" style="flex:1;min-width:220px">
    <button id="rOne">기록</button>
  </div>
  <details style="margin-top:8px;font-size:12px"><summary class="muted">일괄 붙여넣기 — JSON 배열 [{"amplitude":0.8,"kind":"laugh","note":"..."}]</summary>
    <textarea id="rBulk" style="width:100%;box-sizing:border-box;min-height:64px;background:#12160f;color:#e7dcc4;border:1px solid #2b352a;border-radius:4px;font:inherit;padding:6px"></textarea>
    <button id="rBulkGo" style="margin-top:6px">일괄 기록</button>
  </details>
</div>
<script>
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  function send(entries) {
    return fetch('/api/ops/pulse-relay', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ being: $('rBeing').value, entries: entries }),
    }).then(function (r) { return r.json(); }).then(function (r) {
      if (r.error) { $('rbanner').textContent = '실패: ' + r.error + ' ' + JSON.stringify(r.detail || r.skipped || ''); return; }
      $('rbanner').textContent = '기록됨 ' + r.recorded + '건' + (r.skipped && r.skipped.length ? ' · 건너뜀 ' + r.skipped.length : '') + ' — 새로고침하면 파형에 뜬다';
      setTimeout(function () { location.reload(); }, 900);
    }).catch(function (e) { $('rbanner').textContent = '요청 실패: ' + e; });
  }
  $('rOne').onclick = function () {
    var amp = Number($('rAmp').value);
    if (!(amp >= 0 && amp <= 1)) { $('rbanner').textContent = '진폭은 0~1'; return; }
    send([{ amplitude: amp, kind: $('rKind').value || undefined, note: $('rNote').value || undefined }]);
  };
  $('rBulkGo').onclick = function () {
    var arr;
    try { arr = JSON.parse($('rBulk').value); } catch (e) { $('rbanner').textContent = 'JSON 파싱 실패: ' + e; return; }
    if (!Array.isArray(arr)) { $('rbanner').textContent = '배열이어야 한다'; return; }
    send(arr);
  };
})();
</script>
</body></html>`;
  return new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } });
};
