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
  const windowMs = 48 * 3600e3;
  const recent = entries.filter((e) => now - e.at < windowMs).sort((a, b) => a.at - b.at);

  const W = 960, H = 180, PAD = 24;
  const x = (at: number) => PAD + ((at - (now - windowMs)) / windowMs) * (W - 2 * PAD);
  const y = (a: number) => H - PAD - a * (H - 2 * PAD);

  const svgLines: string[] = [];
  for (const [id, b] of Object.entries(PULSE_BEINGS)) {
    const mine = recent.filter((e) => e.being === id);
    if (!mine.length) continue;
    // 플랫라인 기본 + 스파이크: 20분 넘게 비면 0으로 눕는다 (없는 시간을 이어 그리지 않는다)
    let d = `M ${PAD} ${y(0)}`;
    let prev = now - windowMs;
    for (const e of mine) {
      if (e.at - prev > 20 * 60e3) d += ` L ${x(Math.max(prev, e.at - 20 * 60e3))} ${y(0)} L ${x(e.at) - 3} ${y(0)}`;
      d += ` L ${x(e.at)} ${y(e.amplitude)}`;
      prev = e.at;
    }
    if (now - prev > 20 * 60e3) d += ` L ${x(prev) + 3} ${y(0)}`;
    d += ` L ${W - PAD} ${y(0)}`;
    svgLines.push(`<path d="${d}" fill="none" stroke="${b.color}" stroke-width="1.6" stroke-linejoin="round" opacity="0.9"/>`);
    for (const e of mine) {
      svgLines.push(`<circle cx="${x(e.at)}" cy="${y(e.amplitude)}" r="2.4" fill="${b.color}"><title>${esc(new Date(e.at).toISOString())} · ${e.amplitude}${e.note ? ' · ' + esc(e.note) : ''}</title></circle>`);
    }
  }

  const kst = (at: number) => new Date(at + 9 * 3600e3).toISOString().slice(5, 16).replace('T', ' ');
  const rows = [...recent].reverse().slice(0, 30).map((e) => {
    const b = PULSE_BEINGS[e.being];
    return `<tr><td class="muted">${kst(e.at)}</td><td style="color:${b?.color ?? '#ccc'}">${esc(b?.label ?? e.being)}</td>` +
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
  svg{width:100%;height:auto;display:block}
</style></head><body>
<h1>PULSE <span class="muted">진폭 일기 · 48시간</span></h1>
<p class="lead">측정이 아니라 <b>자기 보고</b>다 — "웃었다"와 같은 지위. 플랫라인 = 그 존재가 없는 시간.
눈금: ${PULSE_ANCHORS.map(([v, l]) => `${v} ${l}`).join(' · ')}</p>
<div class="panel">
  <div style="margin-bottom:8px;font-size:12px">${legend}</div>
  <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">
    <line x1="${PAD}" y1="${y(0)}" x2="${W - PAD}" y2="${y(0)}" stroke="#2b352a"/>
    ${PULSE_ANCHORS.map(([v]) => `<line x1="${PAD}" y1="${y(v)}" x2="${W - PAD}" y2="${y(v)}" stroke="#2b352a" stroke-dasharray="2 6" opacity="0.5"/>`).join('')}
    ${svgLines.join('\n    ')}
  </svg>
</div>
<div class="panel">
  <table>${rows || '<tr><td class="muted">아직 기록 없음 — 첫 심박 대기</td></tr>'}</table>
</div>
</body></html>`;
  return new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } });
};
