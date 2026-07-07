// 펫·탈것 검증: (1) 걷는 동안 펫 위치·방향 스크린샷 (2) 탑승 장면 스크린샷
// (3) 펫 미끄러짐 실측 — petMode==='idle'이고 걷는이 정지일 때 holder-로컬 위치 변화율
import { chromium } from 'playwright';
import { spawn } from 'child_process';
import { mkdirSync } from 'fs';

mkdirSync('/tmp/shots', { recursive: true });
const draft = JSON.stringify({ theme: 'earth', radius: 5, relief: 2, fogLevel: 0.07, fogStrength: 0.56, walkSpeed: 0.58, wraps: 6, wobble: 1.05, ponderChance: 0.5, roam: true, runEvery: 5, rideEvery: 20, pet: 'cat1', viewDist: 47, memories: [], props: [] });

const srv = spawn('npx', ['vite', 'preview', '--port', '4173', '--strictPort'], { cwd: process.cwd(), stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 2500));
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await (await browser.newContext({ viewport: { width: 800, height: 560 } })).newPage();
await page.addInitScript((d) => localStorage.setItem('mimesis.planetDraft.v1', d), draft);
await page.goto('http://localhost:4173/?planet=1&edit=1&char=0', { waitUntil: 'load' });
await page.waitForFunction(() => (window.__probeLog?.length ?? 0) > 10, null, { timeout: 60000 });

// 걷는 장면 3장 (5초 간격)
for (let i = 0; i < 3; i++) {
  await page.waitForTimeout(5000);
  await page.screenshot({ path: `/tmp/shots/walk_${i}.png` });
}
// 탑승 대기 (rideEvery 18 → 35+rand·45s 첫 탑승… 초기식은 el+35+rand*45라 첫 탑승은 35~80s)
let riding = false;
for (let w = 0; w < 22 && !riding; w++) {
  await page.waitForTimeout(4000);
  riding = await page.evaluate(() => { const L = window.__probeLog; return L[L.length - 1]?.lift > 0.6; });
}
if (riding) {
  await page.screenshot({ path: '/tmp/shots/ride_0.png' });
  await page.waitForTimeout(4000);
  await page.screenshot({ path: '/tmp/shots/ride_1.png' });
} else console.log('탑승 미발생(시간 초과)');

// 미끄러짐 실측
const log = await page.evaluate(() => window.__probeLog);
const pets = log.filter((x) => x.pet && x.lift < 0.05);
let idleN = 0, slideN = 0, walkAnimMove = 0, moveN = 0;
for (let i = 1; i < pets.length; i++) {
  const a = pets[i - 1], b = pets[i];
  const dt2 = Math.max(1e-3, b.el - a.el);
  const v = Math.hypot(b.pet[0] - a.pet[0], b.pet[1] - a.pet[1], b.pet[2] - a.pet[2]) / dt2;
  if (!b.moving) { // 걷는이 정지 = 행성 정지 → holder-로컬 속도 ≈ 지면상대 속도
    idleN++;
    if (b.petMode === 'idle' && v > 0.12) slideN++;
  }
  if (v > 0.12) { moveN++; if (b.petMode !== 'idle') walkAnimMove++; }
}
console.log(`걷는이 정지 프레임 ${idleN} 중 펫 idle인데 이동(>0.12u/s) ${slideN} — 미끄러짐 ${idleN ? ((slideN / idleN) * 100).toFixed(1) : '?'}%`);
console.log(`펫 이동 프레임 ${moveN} 중 걷기/추격 모드 비율 ${moveN ? ((walkAnimMove / moveN) * 100).toFixed(1) : '?'}%`);
await browser.close();
srv.kill();
