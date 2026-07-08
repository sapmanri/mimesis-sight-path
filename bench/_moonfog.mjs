import { chromium } from 'playwright';
import { spawn } from 'child_process';
const srv = spawn('npx', ['vite', 'preview', '--port', '4189', '--strictPort'], { cwd: process.cwd(), stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 2500));
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const mk = async (name, viewDist, fogLevel) => {
  const page = await (await browser.newContext({ viewport: { width: 700, height: 560 } })).newPage();
  await page.addInitScript((vd, fl) => localStorage.setItem('mimesis.planetDraft.v1', JSON.stringify({
    theme: 'earth', radius: 8, relief: 1, fogLevel: fl, fogStrength: 0.8, viewDist: vd,
    roam: false, pet: 'none', clouds: 0,
    moon: { size: 0.4, dist: 30, period: 0, tilt: 12, light: 8, spin: 1 },
    sun: { az: 40, el: -20, period: 0 }, memories: [], props: [],
  })), viewDist, fogLevel);
  await page.goto('http://localhost:4189/?planet=1&edit=1', { waitUntil: 'load' });
  await page.waitForTimeout(9000);
  // 달 픽셀(밝은 흰 원) 수
  const bright = await page.evaluate(() => {
    // 화면 상단(하늘)에서 밝은 픽셀 개수를 canvas로
    const cv = document.querySelector('canvas');
    return cv ? [cv.width, cv.height] : null;
  });
  await page.screenshot({ path: `/tmp/shots/mf_${name}.png` });
  await page.close();
};
await mk('vd15', 15, 0.3);   // 짧은 시야
await mk('vd120', 120, 0.05); // 긴 시야
await browser.close(); srv.kill(); console.log('done');
