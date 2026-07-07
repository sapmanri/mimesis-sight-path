import { chromium } from 'playwright';
import { spawn } from 'child_process';
const idx = Number(process.argv[2]);
const draft = JSON.stringify({ theme: 'earth', radius: 12, relief: 8, roam: true, walkSpeed: 0.58, runEvery: 0, rideEvery: 0, pet: 'none', memories: [], props: [] });
const srv = spawn('npx', ['vite', 'preview', '--port', '4173', '--strictPort'], { cwd: process.cwd(), stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 2500));
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await (await browser.newContext({ viewport: { width: 640, height: 420 } })).newPage();
page.on('pageerror', (e) => console.log('PAGE ERR:', e.message.slice(0, 150)));
page.on('console', (m) => { if (m.type() === 'error') console.log('CON ERR:', m.text().slice(0, 150)); });
await page.addInitScript((d) => localStorage.setItem('mimesis.planetDraft.v1', d), draft);
await page.goto(`http://localhost:4173/?planet=1&char=${idx}`, { waitUntil: 'domcontentloaded', timeout: 20000 });
for (let i = 0; i < 12; i++) {
  await page.waitForTimeout(5000);
  const st = await Promise.race([
    page.evaluate(() => ({ n: window.__probeLog?.length ?? 0, w: window.__walkerName ?? null })),
    new Promise((r) => setTimeout(() => r('eval-hang'), 8000)),
  ]);
  console.log(`t=${(i + 1) * 5}s`, JSON.stringify(st));
  if (st && st.n > 60) break;
}
const log = await page.evaluate(() => window.__probeLog ?? []);
const ok = log.filter((x) => x.terrainY != null && x.footMin < 1e9 && x.el > 6);
if (ok.length) {
  const fl = ok.map((x) => x.footMin - x.terrainY);
  console.log(`idx${idx} 표본 ${ok.length} 부양 avg ${(fl.reduce((a, b) => a + b, 0) / fl.length).toFixed(3)} max ${Math.max(...fl).toFixed(3)}`);
} else console.log(`idx${idx} 표본 없음`);
await browser.close(); srv.kill();
