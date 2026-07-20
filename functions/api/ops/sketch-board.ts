// BUILD 431 — /api/ops/sketch-board (Ops 호스트 전용 · Access 뒤)
//
// 스타일 보드. 판정의 질문은 "이 한 장이 예쁜가"가 아니라
// **"7장을 나란히 놓았을 때 같은 화가처럼 보이는가"**이므로, 낱장 뷰어가 아니라
// 나란히 놓는 화면이어야 한다. 그래서 별도 페이지로 만든다.
//
// candidate(참조 받음)와 control(텍스트만)을 시각적으로 갈라 놓는다 —
// 둘을 같은 줄에서 비교하면 판정이 틀어진다.

import type { TrialRecord } from './sketch-trial.ts';
import { CHARACTER_IDENTITY_CHECKS } from '../_daily-sketch.ts';

interface Env { PLANET: KVNamespace }

const META_KEY = 'sketch_trial_meta';

const JUDGING = [
  '별이 얼굴과 머리 모양 유지', '빼콩이 생김새 유지', '남색 외곽선', '4~6색 제한',
  '모눈종이 배경', '낙서 배치', '장면보다 기억의 강조', '7일 연속 놓았을 때 같은 화가처럼 보이는가',
  'Style Identity — 같은 아이가 그린 것 같은가 (예쁜 그림이 아니라 별이의 그림인가)',
];

const esc = (s: unknown) => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** 같은 프롬프트끼리 묶는다 — 프롬프트가 다르면 스타일 비교가 성립하지 않는다. */
export function groupByPrompt(records: TrialRecord[]): Map<string, TrialRecord[]> {
  const m = new Map<string, TrialRecord[]>();
  for (const r of records) {
    const list = m.get(r.promptHash) ?? [];
    list.push(r);
    m.set(r.promptHash, list);
  }
  return m;
}

function card(r: TrialRecord): string {
  const img = r.r2Key
    ? `<img src="/api/ops/sketch-image?key=${encodeURIComponent(r.r2Key)}" alt="${esc(r.model)}" loading="lazy">`
    : `<div class="noimg">이미지 없음<br><small>${esc(r.providerId)}</small></div>`;
  return `<figure class="${r.role}">
    ${img}
    <figcaption>
      <b>${esc(r.model.split('/').pop())}</b>
      <span class="role">${r.role === 'candidate' ? '후보 · 참조 O' : '대조군 · 텍스트만'}</span>
      <small>seed ${esc(r.seed ?? '—')} · ${esc(new Date(r.createdAt).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' }))} KST</small>
      <small class="params">${esc(JSON.stringify(r.params))}</small>
    </figcaption>
  </figure>`;
}

export const onRequestGet: PagesFunction<Env> = async ({ env }) => {
  const raw = await env.PLANET.get(META_KEY);
  const records: TrialRecord[] = raw ? JSON.parse(raw) : [];
  const groups = [...groupByPrompt(records).entries()];

  const body = groups.length === 0
    ? '<p class="empty">아직 시험 산출물이 없습니다. <code>POST /api/ops/sketch-trial</code> 로 생성하세요.</p>'
    : groups.map(([hash, list]) => {
      const cand = list.filter((r) => r.role === 'candidate');
      const ctrl = list.filter((r) => r.role === 'control');
      const section = (title: string, rows: TrialRecord[]) => rows.length
        ? `<h3>${title} <small>${rows.length}장</small></h3><div class="row">${rows.map(card).join('')}</div>`
        : '';
      return `<section>
        <h2>prompt <code>${esc(hash)}</code> <small>${list.length}장</small></h2>
        ${section('후보 — 참조 이미지 입력', cand)}
        ${section('대조군 — 텍스트 프롬프트만', ctrl)}
      </section>`;
    }).join('');

  const html = `<!doctype html><html lang="ko"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>별이가 기억한 오늘 — 스타일 보드</title>
<style>
  :root{color-scheme:dark}
  body{margin:0;padding:24px;background:#12160f;color:#e7dcc4;
    font:14px/1.6 ui-monospace,SFMono-Regular,Menlo,monospace}
  h1{font-size:18px;margin:0 0 4px} h2{font-size:14px;color:#A7B49A;margin:28px 0 8px;font-weight:600}
  h3{font-size:12px;color:#7d8a76;margin:16px 0 8px;font-weight:600}
  .lead{color:#7d8a76;margin:0 0 20px}
  .row{display:flex;gap:14px;overflow-x:auto;padding-bottom:8px}
  figure{margin:0;flex:0 0 240px;background:#1a1f16;border:1px solid #2b352a;border-radius:6px;overflow:hidden}
  figure.control{opacity:.82;border-style:dashed}
  figure img{display:block;width:100%;height:240px;object-fit:contain;background:#fff}
  .noimg{height:240px;display:grid;place-content:center;text-align:center;color:#5d6a5f}
  figcaption{padding:8px 10px;display:grid;gap:2px}
  figcaption b{font-size:12px}
  .role{font-size:11px;color:#A7B49A}
  figcaption small{font-size:10px;color:#5d6a5f}
  .params{word-break:break-all}
  ul.judge{margin:0;padding-left:18px;color:#7d8a76;font-size:12px}
  ul.cid{list-style:none;padding-left:0;display:flex;flex-wrap:wrap;gap:4px 16px}
  .empty{color:#7d8a76}
  .note{margin-top:32px;padding:12px;border:1px solid #3a2a2a;border-radius:6px;color:#c8a0a0;font-size:12px}
</style></head><body>
<h1>별이가 기억한 오늘 — 스타일 보드</h1>
<p class="lead">판정 질문: <b>이 한 장이 예쁜가</b>가 아니라 <b>같은 아이가 매일 그린 그림처럼 보이는가</b>.</p>
<ul class="judge">${JUDGING.map((j) => `<li>${esc(j)}</li>`).join('')}</ul>
<h2>Character Identity — 후보(참조 O)에만 적용</h2>
<p class="lead">PASS/FAIL 한 덩어리로 보지 않는다. 세부로 쪼개야 <b>왜 같은 아이처럼 안 보이는지</b>를 추적할 수 있다.</p>
<ul class="judge cid">${CHARACTER_IDENTITY_CHECKS.map((c) => `<li>□ ${esc(c)}</li>`).join('')}</ul>
${body}
<p class="note">시험 산출물이다. 게시·크론 연결 금지. 스타일 판정 후에만 provider 승격.</p>
</body></html>`;

  return new Response(html, {
    headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' },
  });
};
