import { chromium } from 'playwright';
import { spawn } from 'child_process';
const srv = spawn('npx', ['vite', 'preview', '--port', '4187', '--strictPort'], { cwd: process.cwd(), stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 2500));
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await (await browser.newContext({ viewport: { width: 760, height: 620 } })).newPage();
// 밤 + 큰 토끼 달 + 짧은 시야거리(달이 안개에 먹히는지) + 작은 반지름 + 깃발
await page.addInitScript(() => localStorage.setItem('mimesis.planetDraft.v1', JSON.stringify({
  theme: 'earth', radius: 3, relief: 2, fogLevel: 0.3, fogStrength: 0.8, viewDist: 15,
  roam: true, walkSpeed: 0.58, pet: 'none', clouds: 2, cloudFree: 0.1,
  moon: { size: 0.5, dist: 12, period: 0, tilt: 12, light: 2.2, spin: 1 },
  sun: { az: 40, el: -25, period: 0 },
  props: [{ id: 'kr', obj: 'flag', dir: [0.3, 0.9, 0.2], r: 5, rotY: 0, scale: 1, title: 'Korea' }],
  memories: [],
})));
await page.goto('http://localhost:4187/?planet=1&edit=1', { waitUntil: 'load' });
// 토끼 애니 재생 확인: 달 그룹의 토끼 뼈가 프레임 간 움직이는지
await page.waitForTimeout(11000);
const sample = async () => page.evaluate(() => {
  const g = window.__rabbit;
  if (!g) return null;
  const bones = [];
  g.traverse((o) => { if (o.type === 'Bone') { o.updateWorldMatrix(true, false); const p = o.matrixWorld.elements; bones.push([+p[12].toFixed(4), +p[13].toFixed(4), +p[14].toFixed(4)]); } });
  return bones.slice(0, 5);
});
const t0 = await sample();
await page.screenshot({ path: '/tmp/shots/c238_a.png' });
await page.waitForTimeout(4000);
await page.screenshot({ path: '/tmp/shots/c238_b.png' });
await browser.close(); srv.kill();
console.log('shots done');
