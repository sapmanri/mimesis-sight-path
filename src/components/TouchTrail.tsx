// ---------- BUILD 095: TOUCH TRAIL ----------
// 손가락이 쓸고 간 자리에 금가루가 남는다 — 팅커의 가루와 같은 빛.
// pointer-events: none 캔버스 오버레이. 스크롤/스와이프를 막지 않는다.

import { useEffect, useRef } from 'react';

type P = { x: number; y: number; vx: number; vy: number; life: number; max: number; r: number };

export function TouchTrail() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const resize = () => {
      canvas.width = window.innerWidth * dpr;
      canvas.height = window.innerHeight * dpr;
    };
    resize();
    window.addEventListener('resize', resize);

    const parts: P[] = [];
    let lastX = -1;
    let lastY = -1;

    const spawn = (x: number, y: number, count: number, spread: number) => {
      for (let i = 0; i < count; i += 1) {
        const a = Math.random() * Math.PI * 2;
        const sp = Math.random() * spread;
        parts.push({
          x: x * dpr, y: y * dpr,
          vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 0.12 * dpr,
          life: 0, max: 0.5 + Math.random() * 0.6,
          r: (0.8 + Math.random() * 1.8) * dpr,
        });
      }
      if (parts.length > 260) parts.splice(0, parts.length - 260);
    };

    const onMove = (e: PointerEvent) => {
      if (lastX >= 0) {
        const d = Math.hypot(e.clientX - lastX, e.clientY - lastY);
        // 이동 거리에 비례해 촘촘히 — 빨리 쓸면 가루도 흩날린다
        const n = Math.min(6, Math.max(1, Math.floor(d / 7)));
        for (let i = 0; i < n; i += 1) {
          const t = i / n;
          spawn(lastX + (e.clientX - lastX) * t, lastY + (e.clientY - lastY) * t, 1, 0.5 * dpr);
        }
      }
      lastX = e.clientX;
      lastY = e.clientY;
    };
    const onDown = (e: PointerEvent) => {
      spawn(e.clientX, e.clientY, 8, 1.1 * dpr); // 터치의 순간, 작게 반짝
      lastX = e.clientX;
      lastY = e.clientY;
    };
    const onUp = () => { lastX = -1; lastY = -1; };
    window.addEventListener('pointermove', onMove, { passive: true });
    window.addEventListener('pointerdown', onDown, { passive: true });
    window.addEventListener('pointerup', onUp, { passive: true });
    window.addEventListener('pointercancel', onUp, { passive: true });

    let raf = 0;
    let prev = performance.now();
    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - prev) / 1000);
      prev = now;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.globalCompositeOperation = 'lighter';
      for (let i = parts.length - 1; i >= 0; i -= 1) {
        const q = parts[i];
        q.life += dt;
        if (q.life >= q.max) { parts.splice(i, 1); continue; }
        q.x += q.vx;
        q.y += q.vy;
        q.vy -= 0.006 * dpr; // 가루는 아주 천천히 떠오른다
        const f = 1 - q.life / q.max;
        const alpha = f * f * 0.85;
        const r = q.r * (0.6 + f * 0.6);
        const grad = ctx.createRadialGradient(q.x, q.y, 0, q.x, q.y, r * 3);
        grad.addColorStop(0, `rgba(255, 235, 180, ${alpha})`);
        grad.addColorStop(0.5, `rgba(255, 210, 130, ${alpha * 0.45})`);
        grad.addColorStop(1, 'rgba(255, 200, 110, 0)');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(q.x, q.y, r * 3, 0, Math.PI * 2);
        ctx.fill();
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'fixed', inset: 0, width: '100vw', height: '100vh',
        pointerEvents: 'none', zIndex: 60,
      }}
      aria-hidden="true"
    />
  );
}
