// /api/ops/music-lab — 음악 랩 (Ops 호스트 전용 · Access 뒤)
//
// 그림 랩(sketch-lab)·코믹 랩과 같은 자리다. **관측소 콘솔이 아니다.**
// ⚠ 관측소(public/ops/index.html)는 쓰기 표면이 4곳으로 잠겨 있다(validate-ops.mjs).
//   그건 「늘리지 마라」가 아니라 「쓰기는 전부 번호를 붙여 선언하라」는 규율이고,
//   랩 페이지는 그 계약 밖에서 자기 쓰기를 갖는다. 음악도 여기 붙인다.
//
// 화면이 하는 일은 셋뿐이고, **셋을 절대 한 버튼에 묶지 않는다.**
//   조사   Claude 2회 · 5분 남짓 — 돈이 든다
//   재생목록  조사는 다시 안 한다 · YouTube 100유닛 — 한도를 쓴다
//   발행   스레드에 실제로 나간다 — 되돌릴 수 없다
// 성질이 다른 셋을 한 버튼에 묶으면 「조사만 해보려다 발행되는」 사고가 난다.

import { readNight, type NightEnv } from '../_music-night.ts';
import { kstDate } from '../_memory-event.ts';

const esc = (s: unknown) => String(s ?? '').replace(/[&<>"]/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string));

export const onRequestGet: PagesFunction<NightEnv> = async ({ request, env }) => {
  const url = new URL(request.url);
  const date = url.searchParams.get('date') ?? kstDate(Date.now());
  const n = await readNight(env, date).catch(() => null);

  const head = (n?.threadText ?? '').split('\n\n')[0] ?? '';
  const line = (n?.threadText ?? '').split('\n\n').slice(1).filter((x) => !/^https?:/.test(x)).join('\n\n');

  const html = `<!doctype html><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>음악 랩 · ${esc(date)}</title>
<style>
 :root{--bg:#12140f;--panel:#171a13;--line:#2a2f24;--sep:#232719;--text:#e7e2d4;
       --dim:#8d907f;--sage:#8fa07a;--warn:#c2683f}
 *{box-sizing:border-box}
 body{margin:0;background:var(--bg);color:var(--text);
      font:15px/1.7 -apple-system,BlinkMacSystemFont,'Apple SD Gothic Neo','Malgun Gothic',sans-serif}
 .wrap{max-width:760px;margin:0 auto;padding:26px 20px 80px}
 h1{font-size:19px;font-weight:500;margin:0 0 3px}
 .sub{color:var(--dim);font-size:12px}
 .card{background:var(--panel);border:1px solid var(--line);border-radius:3px;padding:16px 18px;margin-top:16px}
 .head{font-size:17px;color:#e7dcc4;margin-bottom:8px}
 .line{color:var(--text);line-height:1.9;white-space:pre-wrap}
 .meta{color:var(--dim);font-size:12px;font-family:ui-monospace,Menlo,monospace;margin-top:10px}
 .tracks{margin-top:12px;border-top:1px solid var(--sep);padding-top:10px}
 .tracks a{display:block;color:var(--sage);font-size:13px;text-decoration:none;padding:3px 0}
 .tracks a:hover{text-decoration:underline}
 .warnbox{border-left:2px solid var(--warn);padding-left:11px;color:var(--warn);font-size:12.5px;margin-top:10px}
 .row{display:flex;gap:9px;flex-wrap:wrap;margin-top:16px;align-items:center}
 button{background:var(--panel);border:1px solid var(--sage);color:var(--sage);
        font:13px system-ui;padding:8px 15px;border-radius:3px;cursor:pointer}
 button:hover:not(:disabled){background:#1a2016}
 button:disabled{opacity:.38;cursor:not-allowed}
 button.danger{border-color:var(--warn);color:var(--warn)}
 button.danger:hover:not(:disabled){background:#2a1a12}
 #say{color:var(--dim);font-size:12.5px}
 .fine{color:var(--dim);font-size:12px;line-height:1.8;margin-top:18px;
       border-left:1px solid var(--line);padding-left:12px}
 .empty{color:var(--dim)}
 input[type=date]{background:var(--panel);border:1px solid var(--line);color:var(--text);
   font:13px ui-monospace,Menlo,monospace;padding:6px 9px;border-radius:3px}
</style>
<div class="wrap">
  <h1>음악 랩</h1>
  <div class="sub">별이가 그날 본 것으로 곡을 찾는다 — 조사 → 재생목록 → 스레드</div>

  <div class="row"><input type="date" id="d" value="${esc(date)}">
    <button id="load">그날 보기</button></div>

  <div class="card">
    ${n?.threadText
      ? `<div class="head">${esc(head)}</div><div class="line">${esc(line)}</div>`
      : `<div class="empty">아직 조사한 밤이 없다. 아래 <b>조사</b>를 누르면 5분쯤 걸린다.</div>`}
    <div class="meta">${esc(date)} · 곡 ${n?.onShelf?.length ?? 0}개 ·
      ${n?.playlistUrl ? '재생목록 있음' : '재생목록 없음'}${n?.rest ? ` · 쉬는 날(${esc(n.rest)})` : ''}${
      n && n.step !== 'done' ? ` · ${esc(n.step)}에서 멈춤` : ''}</div>
    ${n?.onShelf?.length ? `<div class="tracks">${n.onShelf.map((t) =>
      `<a href="${esc(t.url)}" target="_blank" rel="noopener">${esc(t.artist)} — ${esc(t.title)}</a>`).join('')}
      ${n.playlistUrl ? `<a href="${esc(n.playlistUrl)}" target="_blank" rel="noopener">▶ 재생목록</a>` : ''}</div>` : ''}
    ${n?.notes?.length ? `<div class="warnbox">밤이 남긴 주의 — ${n.notes.map(esc).join(' · ')}</div>` : ''}
  </div>

  <div class="row">
    <button id="night">조사 <span class="sub">Claude 2회 · 5분</span></button>
    <button id="pl" ${n?.playlistUrl || !n?.onShelf?.length ? 'disabled' : ''}>재생목록 만들기 <span class="sub">100유닛</span></button>
    <button id="pub" class="danger" ${n?.step === 'done' && n?.threadText ? '' : 'disabled'}>발행</button>
    <span id="say"></span>
  </div>

  <div class="fine">
    셋을 따로 둔 이유 — <b>조사는 돈이 들고</b>, 재생목록은 <b>한도를 쓰고</b>,
    발행은 <b>되돌릴 수 없다.</b> 한 버튼에 묶으면 「조사만 해보려다 발행되는」 사고가 난다.<br>
    발행하면 위 카드의 문장이 <b>그대로</b> 나간다. 재생목록 주소는 맨 끝에 붙는다.
  </div>
</div>
<script>
var D=function(){return document.getElementById('d').value};
var say=function(m,bad){var e=document.getElementById('say');e.textContent=m||'';
  e.style.color=bad?'#c2683f':'';};
var lock=function(on){['night','pl','pub','load'].forEach(function(i){
  document.getElementById(i).disabled=on;});};
document.getElementById('load').onclick=function(){location.search='?date='+D();};

/* ⚠ 실패 사유를 삼키지 않는다 — 단계가 많아 사유 없이는 못 고친다 */
function post(path,label,ask){
  if(!confirm(ask)) return;
  lock(true); say(label+' 중…');
  fetch(path,{method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({date:D(),confirm:true})})
   .then(function(r){return r.json();})
   .then(function(j){
     if(j.ok){ say(label+' 됐다 — 새로 고칩니다'); setTimeout(function(){location.reload();},900); }
     else { say(label+' 실패: '+(j.blocked||j.error||'?'),true); lock(false); }
   })
   .catch(function(e){ say(label+' 실패: '+e.message,true); lock(false); });
}
document.getElementById('night').onclick=function(){
  if(!confirm('오늘의 곡을 조사한다.\\n\\nClaude 2회 · 5분 남짓 걸린다. 재생목록은 만들지 않는다.')) return;
  lock(true); say('조사 중… 5분쯤 걸린다. 창을 닫지 마세요');
  fetch('/api/ops/music-night?run=1&dry=1&date='+D(),{cache:'no-store'})
   .then(function(r){return r.json();})
   .then(function(j){
     if(j.step==='done'){ say('조사 끝 — 새로 고칩니다'); setTimeout(function(){location.reload();},900); }
     else { say((j.step||'?')+'에서 멈췄다: '+(j.error||j.rest||''),true); lock(false); }
   })
   .catch(function(e){ say('조사 실패: '+e.message,true); lock(false); });
};
document.getElementById('pl').onclick=function(){
  post('/api/ops/music-playlist','재생목록','재생목록을 만든다.\\n\\n조사는 다시 하지 않는다. YouTube 100유닛.');
};
document.getElementById('pub').onclick=function(){
  post('/api/ops/music-publish','발행','⚠ 스레드에 실제로 올라간다. 되돌릴 수 없다.\\n\\n카드에 보이는 문장이 그대로 나갑니다.');
};
</script>`;
  return new Response(html, {
    headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' },
  });
};
