// 로스터 전원 부양 스크리닝: 각 워커 ?char=N으로 고정, 지구·굴곡8·배회, 표본 수집
import { chromium } from 'playwright';
import { spawn } from 'child_process';

const draft = JSON.stringify({ theme: 'earth', radius: 12, relief: 8, roam: true, walkSpeed: 0.58, runEvery: 0, rideEvery: 0, pet: 'none', memories: [], props: [] });
const NAMES = ['LittleBoy', 'Kid1', 'Kid3', 'Kid4', 'Kid5', 'Kid6', 'Kid7', 'Kid8', 'Kid9', 'Kid2', 'Hiker', 'Vroid01'];

const srv = spawn('npx', ['vite', 'preview', '--port', '4173', '--strictPort'], { cwd: process.cwd(), stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 2500));
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });

for (let idx = Number(process.env.START ?? 0); idx < NAMES.length; idx++) {
  const ctx = await browser.newContext({ viewport: { width: 720, height: 480 } });
  const page = await ctx.newPage();
  await page.addInitScript((d) => localStorage.setItem('mimesis.planetDraft.v1', d), draft);
  try {
    await page.goto(`http://localhost:4173/?planet=1&char=${idx}`, { waitUntil: 'load' });
    await page.waitForFunction(() => (window.__probeLog?.length ?? 0) > 20, null, { timeout: 45000 });
    await page.waitForTimeout(12000);
    const log = await page.evaluate(() => window.__probeLog);
    const ok = log.filter((x) => x.terrainY != null && x.footMin < 1e9 && x.el > 6);
    const fl = ok.map((x) => x.footMin - x.terrainY);
    const avg = fl.reduce((a, b) => a + b, 0) / fl.length;
    const tail = fl.slice(-Math.min(30, fl.length));
    const tAvg = tail.reduce((a, b) => a + b, 0) / tail.length;
    console.log(`${String(idx).padStart(2)} ${NAMES[idx].padEnd(9)} 표본 ${String(ok.length).padStart(3)}  부양 avg ${avg.toFixed(3)}  말미 ${tAvg.toFixed(3)}  max ${Math.max(...fl).toFixed(3)}`);
  } catch (e) {
    console.log(`${String(idx).padStart(2)} ${NAMES[idx].padEnd(9)} 실패: ${String(e).slice(0, 80)}`);
  }
  await ctx.close();
}
await browser.close();
srv.kill();
