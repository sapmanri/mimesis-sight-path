// 실제 앱을 headless Chromium(SwiftShader WebGL)으로 구동해 프로브 로그를 수집
// 사용: node bench/probe_live.mjs [seconds] [draftJSON파일]
import { chromium } from 'playwright';
import { readFileSync } from 'fs';
import { spawn } from 'child_process';

const SECONDS = Number(process.argv[2] ?? 120);
const draftPath = process.argv[3];
const draft = draftPath ? readFileSync(draftPath, 'utf8') : null;

// vite preview 기동
const srv = spawn('npx', ['vite', 'preview', '--port', '4173', '--strictPort'], { cwd: process.cwd(), stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 2500));

const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-gpu-sandbox'] });
const ctx = await browser.newContext({ viewport: { width: 900, height: 640 } });
const page = await ctx.newPage();
page.on('pageerror', (e) => console.log('PAGE ERROR:', e.message.slice(0, 200)));
if (draft) await page.addInitScript((d) => localStorage.setItem('mimesis.planetDraft.v1', d), draft);
await page.goto('http://localhost:4173/?planet=1', { waitUntil: 'load' });

// 프로브가 흐르기 시작할 때까지 대기
await page.waitForFunction(() => (window.__probeLog?.length ?? 0) > 30, null, { timeout: 60000 });
console.log('프로브 흐름 확인 — ' + SECONDS + 's 수집');
await page.waitForTimeout(SECONDS * 1000);

const log = await page.evaluate(() => window.__probeLog);
const walkers = await page.evaluate(() => (window.__walkerName ?? null));
await browser.close();
srv.kill();

// 분석
const ok = log.filter((x) => x.terrainY != null && x.footMin < 1e9);
const walk = ok.filter((x) => x.mode !== 'ride' && x.lift < 0.05 && x.el > 8);
const fl = walk.map((x) => x.footMin - x.terrainY);
const avg = fl.reduce((a, b) => a + b, 0) / fl.length;
const mx = Math.max(...fl), mn = Math.min(...fl);
const over = fl.filter((x) => x > 0.3).length / fl.length;
console.log(`표본 ${ok.length} (걷기 ${walk.length})  부양 avg ${avg.toFixed(3)}  min ${mn.toFixed(3)}  max ${mx.toFixed(3)}  >0.3u ${(over * 100).toFixed(1)}%`);
// 시계열 요약 (5초 창)
let line = '';
for (let t = 8; t < ok[ok.length - 1].el; t += 5) {
  const seg = walk.filter((x) => x.el >= t && x.el < t + 5);
  if (!seg.length) { line += '  ride '; continue; }
  const m = seg.reduce((a, b) => a + b.footMin - b.terrainY, 0) / seg.length;
  line += ' ' + m.toFixed(2);
}
console.log('5s 창 평균 부양:', line);
// 펫 이동 분석: petMode==='idle'인데 위치가 움직이는 프레임 (지면 상대 — 행성 회전 감안해 terrainY 근처 XZ만 비교는 불가하므로 월드 XZ 속도로 1차)
const petFrames = ok.filter((x) => x.pet);
if (petFrames.length > 10) {
  let slideIdle = 0, idleN = 0;
  for (let i = 1; i < petFrames.length; i++) {
    const a = petFrames[i - 1], b = petFrames[i];
    const d = Math.hypot(b.pet[0] - a.pet[0], b.pet[2] - a.pet[2]) / Math.max(1e-3, b.el - a.el);
    if (b.petMode === 'idle' && !b.moving) { idleN++; if (d > 0.15) slideIdle++; }
  }
  console.log(`펫: 걷는이 정지+펫 idle 프레임 ${idleN}개 중 월드속도>0.15u/s ${slideIdle}개 (${idleN ? ((slideIdle / idleN) * 100).toFixed(1) : 0}%)`);
}
