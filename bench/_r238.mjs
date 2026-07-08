import { chromium } from 'playwright';
import { spawn } from 'child_process';
const srv = spawn('npx', ['vite', 'preview', '--port', '4188', '--strictPort'], { cwd: process.cwd(), stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 2500));
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await (await browser.newContext({ viewport: { width: 720, height: 600 } })).newPage();
await page.addInitScript(() => localStorage.setItem('mimesis.planetDraft.v1', JSON.stringify({
  theme: 'earth', radius: 3, relief: 2, fogLevel: 0.1, fogStrength: 0.3, viewDist: 60,
  roam: true, pet: 'none', clouds: 1,
  moon: { size: 0.6, dist: 10, period: 40, tilt: 12, light: 8, spin: 1 },
  sun: { az: 40, el: -20, period: 0 },
  props: [{ id: 'f1', obj: 'flag', dir: [0.2,0.95,0.1], r: 5, rotY: 0, scale: 1, title: 'Korea' },
          { id: 'f2', obj: 'windturbine', dir: [0.5,0.8,0.3], r: 5, rotY: 0, scale: 1 }],
  memories: [],
})));
await page.goto('http://localhost:4188/?planet=1&edit=1', { waitUntil: 'load' });
await page.waitForTimeout(11000);
const rab = await page.evaluate(() => {
  const g = window.__rabbit;
  if (!g) return 'no-probe';
  const b = [];
  g.traverse((o) => { if (o.type === 'Bone') { o.updateWorldMatrix(true,false); const e=o.matrixWorld.elements; b.push([+e[12].toFixed(4),+e[13].toFixed(4),+e[14].toFixed(4)]); } });
  return b.slice(0,6);
});
await new Promise(r=>setTimeout(r,2500));
const rab2 = await page.evaluate(() => {
  const g = window.__rabbit; if (!g) return 'no-probe';
  const b=[]; g.traverse((o)=>{ if(o.type==='Bone'){o.updateWorldMatrix(true,false);const e=o.matrixWorld.elements;b.push([+e[12].toFixed(4),+e[13].toFixed(4),+e[14].toFixed(4)]);}});
  return b.slice(0,6);
});
let moved = 0;
if (Array.isArray(rab) && Array.isArray(rab2)) for (let i=0;i<rab.length;i++) for (let j=0;j<3;j++) moved += Math.abs(rab[i][j]-rab2[i][j]);
console.log('토끼 뼈 수:', Array.isArray(rab)?rab.length:rab, '| 2.5s 이동합:', moved.toFixed(4), moved > 0.001 ? '✓ 애니 재생중' : '✗ 정지');
await page.screenshot({ path: '/tmp/shots/r238.png' });
await browser.close(); srv.kill();
