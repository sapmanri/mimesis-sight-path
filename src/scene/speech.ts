// ---------- BUILD 175: 말풍선 — 무언어(無言語)의 웅얼거림 ----------
// "말은 그냥 웅얼웅얼. 중요한 건 저 말풍선이 이뻐야 한다는 거야. 감성을 해치지 않으면서." — Vase.
// 화면 UI가 아니라 세계 속 스프라이트다: 크림 종이 위에 손으로 흘려 쓴 필기 곡선.
// 영어도 한글도 티벳어도 아닌 — 그저 말의 모양. 가끔은 아이콘 하나 (절제된 세트: ✉ ♪ !).

import * as THREE from 'three';

export type Bubble = {
  sprite: THREE.Sprite;
  target: THREE.Object3D;
  yOff: number;
  t: number;
  dur: number;
};

/** 무언어 한 단어 — 이어진 필기 혹(bump)들. 획마다 높이가 흔들려 손글씨의 호흡이 된다 */
function scribbleWord(g: CanvasRenderingContext2D, x: number, y: number, maxW: number): number {
  const bumps = 2 + Math.floor(Math.random() * 4);
  const w = Math.min(maxW, bumps * (9 + Math.random() * 5));
  g.beginPath();
  g.moveTo(x, y + (Math.random() - 0.5) * 2);
  const step = w / bumps;
  for (let i = 0; i < bumps; i += 1) {
    const cx = x + step * (i + 0.5);
    const cy = y - (5 + Math.random() * 9) * (Math.random() < 0.82 ? 1 : -0.5); // 가끔 아래로 꼬리
    g.quadraticCurveTo(cx, cy, x + step * (i + 1), y + (Math.random() - 0.5) * 2.5);
  }
  g.stroke();
  return w;
}

/** 말풍선 캔버스를 그린다 — icon이 있으면 아이콘, 없으면 웅얼 필기 1~2줄 */
function drawBubble(icon?: string): HTMLCanvasElement {
  const W = 256; const H = 176;
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const g = cv.getContext('2d')!;
  // 종이 — 크림, 아주 둥근 모서리, 얇은 따뜻한 테두리 (편지지의 혈통)
  const bx = 14; const by = 12; const bw = W - 28; const bh = H - 58; const r = 26;
  g.beginPath();
  g.moveTo(bx + r, by);
  g.arcTo(bx + bw, by, bx + bw, by + bh, r);
  g.arcTo(bx + bw, by + bh, bx, by + bh, r);
  g.arcTo(bx, by + bh, bx, by, r);
  g.arcTo(bx, by, bx + bw, by, r);
  g.closePath();
  g.fillStyle = 'rgba(249, 245, 233, 0.95)';
  g.fill();
  g.lineWidth = 2.5;
  g.strokeStyle = 'rgba(120, 105, 80, 0.32)';
  g.stroke();
  // 꼬리 — 점 세 개가 아래로 잦아든다 (만화의 속삭임 문법)
  for (let i = 0; i < 2; i += 1) {
    const rr = 7 - i * 3;
    g.beginPath();
    g.arc(W * 0.42 - i * 12, by + bh + 14 + i * 15, rr, 0, Math.PI * 2);
    g.fillStyle = 'rgba(249, 245, 233, 0.92)';
    g.fill();
    g.strokeStyle = 'rgba(120, 105, 80, 0.26)';
    g.lineWidth = 2;
    g.stroke();
  }
  if (icon) {
    g.font = '52px serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillStyle = 'rgba(90, 82, 69, 0.85)';
    g.fillText(icon, bx + bw / 2, by + bh / 2 + 2);
  } else {
    // 웅얼웅얼 — 1~2줄의 무언어
    g.strokeStyle = 'rgba(90, 82, 69, 0.78)';
    g.lineWidth = 3;
    g.lineCap = 'round';
    g.lineJoin = 'round';
    const lines = Math.random() < 0.45 ? 1 : 2;
    for (let ln = 0; ln < lines; ln += 1) {
      const y = by + bh * (lines === 1 ? 0.56 : 0.42 + ln * 0.3);
      let x = bx + 22 + Math.random() * 10;
      const endX = bx + bw - 24 - Math.random() * 30;
      while (x < endX) {
        x += scribbleWord(g, x, y, endX - x) + 11 + Math.random() * 6;
      }
    }
  }
  return cv;
}

/** 말풍선을 하나 만든다. 수명·팝인·페이드는 update가 관리 */
export function makeBubble(target: THREE.Object3D, yOff: number, icon?: string, dur = 2.4): Bubble {
  const tex = new THREE.CanvasTexture(drawBubble(icon));
  tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.SpriteMaterial({
    map: tex, transparent: true, opacity: 0, depthWrite: false, fog: false,
  });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(0.72, 0.5, 1);
  sprite.renderOrder = 10;
  return { sprite, target, yOff, t: 0, dur };
}

/** true를 반환하면 수명이 다한 것 — 부모가 거둔다 */
export function updateBubble(b: Bubble, delta: number): boolean {
  b.t += delta;
  const wp = b.target.getWorldPosition(new THREE.Vector3());
  b.sprite.position.set(wp.x + 0.16, wp.y + b.yOff + Math.sin(b.t * 2.1) * 0.02, wp.z);
  const inK = Math.min(1, b.t / 0.22);
  const outK = Math.min(1, Math.max(0, (b.dur - b.t) / 0.45));
  const pop = inK < 1 ? 0.7 + 0.3 * (1 - (1 - inK) * (1 - inK)) : 1; // 살짝 튀며 나타난다
  b.sprite.scale.set(0.72 * pop, 0.5 * pop, 1);
  (b.sprite.material as THREE.SpriteMaterial).opacity = Math.min(inK, outK) * 0.96;
  if (b.t >= b.dur) {
    (b.sprite.material as THREE.SpriteMaterial).map?.dispose();
    (b.sprite.material as THREE.SpriteMaterial).dispose();
    return true;
  }
  return false;
}
