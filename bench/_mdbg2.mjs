import { chromium } from 'playwright';
import { spawn } from 'child_process';
const srv = spawn('npx', ['vite', 'preview', '--port', '4192', '--strictPort'], { cwd: process.cwd(), stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 2500));
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
for (const [vd, md] of [[60, 40], [12, 40]]) {
  const page = await (await browser.newContext()).newPage();
  await page.addInitScript((v, m) => localStorage.setItem('mimesis.planetDraft.v1', JSON.stringify({ theme: 'earth', radius: 8, viewDist: v, roam: false, pet: 'none', clouds: 0, moon: { size: 0.4, dist: m, period: 0, tilt: 12, light: 8, spin: 1 }, sun: { az: 40, el: -20, period: 0 }, memories: [], props: [] })), vd, md);
  await page.goto('http://localhost:4192/?planet=1&edit=1', { waitUntil: 'load' });
  await page.waitForTimeout(8000);
  console.log(`vd${vd}:`, JSON.stringify(await page.evaluate(() => window.__moondbg)));
  await page.close();
}
await browser.close(); srv.kill();
