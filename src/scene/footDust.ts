import * as THREE from 'three';

// BUILD 264: 발밑 효과 — 걸을 때 발에서 살짝. 땅이면 모래먼지(갈), 물이면 안개(흰).
// 발에만, 아주 살짝. 걷기와 바닥의 어색함을 메운다.

const N = 26; // 입자 수 (적게 — '살짝')

function softTexture(): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = c.height = 48;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(24, 24, 0, 24, 24, 24);
  grad.addColorStop(0, 'rgba(255,255,255,0.9)');
  grad.addColorStop(0.5, 'rgba(255,255,255,0.35)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad; g.fillRect(0, 0, 48, 48);
  const tex = new THREE.CanvasTexture(c); tex.needsUpdate = true; return tex;
}

export function createFootDust(scene: THREE.Scene) {
  const tex = softTexture();
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(N * 3);
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const mat = new THREE.PointsMaterial({
    map: tex, size: 0.05, sizeAttenuation: true, transparent: true,
    opacity: 0, depthWrite: false, fog: false, color: '#c9b48f',
  });
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false;
  pts.renderOrder = 3;
  scene.add(pts);

  // 입자 상태: 각자 수명·속도. up 방향으로 살짝 떠오르며 사라진다.
  const life = new Float32Array(N).fill(0);
  const vel: THREE.Vector3[] = Array.from({ length: N }, () => new THREE.Vector3());
  const p = Array.from({ length: N }, () => new THREE.Vector3());
  let cursor = 0;
  const tmp = new THREE.Vector3();

  // 색 목표 (땅=모래, 물=안개) — 부드럽게 전환
  const SAND = new THREE.Color('#c9b48f');
  const MIST = new THREE.Color('#dfe7ee');

  return {
    // foot: 발 월드위치, up: 지표 법선(월드), water: 물이면 true, moving: 걷는 중
    update(dt: number, foot: THREE.Vector3 | null, up: THREE.Vector3, water: boolean, moving: boolean) {
      // 걷는 중이고 발이 있으면 방출 (땅=자주, 물=드물게 옅게)
      if (foot && moving) {
        const rate = water ? 0.35 : 0.6; // 물은 덜 자주
        if (Math.random() < rate) {
          const i = cursor; cursor = (cursor + 1) % N;
          p[i].copy(foot);
          // 살짝 옆으로 흩고, up으로 떠오름
          const side = tmp.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(0.02);
          vel[i].copy(up).multiplyScalar(water ? 0.06 : 0.09).add(side);
          life[i] = water ? 1.1 : 0.7; // 물 안개는 더 오래 옅게
        }
      }
      // 색 전환
      mat.color.lerp(water ? MIST : SAND, Math.min(1, dt * 4));
      // 입자 갱신
      let maxLife = 0;
      for (let i = 0; i < N; i += 1) {
        if (life[i] > 0) {
          life[i] -= dt;
          p[i].addScaledVector(vel[i], dt);
          vel[i].multiplyScalar(0.94); // 감속
        }
        (geo.getAttribute('position').array as Float32Array).set([p[i].x, p[i].y, p[i].z], i * 3);
        maxLife = Math.max(maxLife, life[i]);
      }
      (geo.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
      // 전체 투명도 — 살짝만 (물 안개는 더 옅게)
      const targetOp = maxLife > 0 ? (water ? 0.18 : 0.3) : 0;
      mat.opacity += (targetOp - mat.opacity) * Math.min(1, dt * 6);
      mat.size = water ? 0.08 : 0.05; // 안개는 조금 크게 퍼지게
    },
    dispose() { geo.dispose(); mat.dispose(); tex.dispose(); scene.remove(pts); },
  };
}
