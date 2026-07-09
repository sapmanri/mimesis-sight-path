import * as THREE from 'three';

// BUILD 264: 발밑 효과 — 걸을 때 발에서 살짝. 땅이면 모래먼지(갈), 물이면 안개(흰).
// BUILD 281: per-particle 알파로 재작성 — 각 입자가 제 수명대로 사라진다.
//   (구버전은 머티리얼 전체 opacity를 maxLife에 묶어, 움직이는 동안 계속 emit되면
//    안 죽고, 멈춰야 1초 뒤 꺼지는 버그가 있었다. Vase 진단.)
//   또 지표(surfaceR)에 딱 붙인다 — 발바닥이 아니라 땅에 남는 흔적.

const N = 40; // 입자 수 (개별 소멸이라 조금 넉넉히)

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

export function createFootDust(parent: THREE.Object3D) {
  const tex = softTexture();
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(N * 3);
  const col = new Float32Array(N * 3); // rgb; 우린 알파를 여기 못 넣으니 밝기로 페이드 + size로 소멸
  const alpha = new Float32Array(N); // 셰이더 알파 (커스텀 어트리뷰트)
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setAttribute('aAlpha', new THREE.BufferAttribute(alpha, 1));

  // 커스텀 셰이더 머티리얼 — per-particle 알파로 각자 사라진다.
  const mat = new THREE.ShaderMaterial({
    uniforms: { uTex: { value: tex }, uSize: { value: 0.055 } },
    transparent: true, depthWrite: false, fog: false,
    vertexShader: `
      attribute float aAlpha;
      attribute vec3 color;
      varying float vA; varying vec3 vC;
      uniform float uSize;
      void main(){
        vA = aAlpha; vC = color;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = uSize * 900.0 / max(0.001, -mv.z);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      uniform sampler2D uTex;
      varying float vA; varying vec3 vC;
      void main(){
        vec4 t = texture2D(uTex, gl_PointCoord);
        gl_FragColor = vec4(vC, t.a * vA);
      }`,
  });
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false;
  pts.renderOrder = 3;
  parent.add(pts); // planet에 붙인다 — 밟은 자리가 지형과 함께 돈다

  const lifeMax = new Float32Array(N).fill(0);
  const life = new Float32Array(N).fill(0);
  const vel: THREE.Vector3[] = Array.from({ length: N }, () => new THREE.Vector3());
  const p = Array.from({ length: N }, () => new THREE.Vector3());
  let cursor = 0;
  const tmp = new THREE.Vector3();

  const SAND = new THREE.Color('#c9b48f');
  const MIST = new THREE.Color('#dfe7ee');
  let curCol = SAND.clone();

  const footPrevY = [Infinity, Infinity];
  const footPrevDown = [false, false];

  function emitAt(foot: THREE.Vector3, water: boolean, groundR: number) {
    const i = cursor; cursor = (cursor + 1) % N;
    // 지표에 딱 붙인다 — 발 방향만 빌리고 반경은 지표면(흔적은 땅에 남는다)
    p[i].copy(foot).normalize().multiplyScalar(groundR + 0.001);
    // 거의 안 흩고, 아주 살짝만 옆으로 (위로는 최소 — 땅에 낮게 깔린다)
    const up = tmp.copy(foot).normalize();
    const side = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(0.005);
    vel[i].copy(up).multiplyScalar(water ? 0.012 : 0.016).add(side);
    lifeMax[i] = water ? 0.9 : 0.6; // 1초 안에 사라진다
    life[i] = lifeMax[i];
    col[i * 3] = curCol.r; col[i * 3 + 1] = curCol.g; col[i * 3 + 2] = curCol.b;
  }

  return {
    updateFeet(dt: number, feet: (THREE.Vector3 | null)[], _up: THREE.Vector3, water: boolean, moving: boolean, groundR: number) {
      // 색 전환
      curCol.lerp(water ? MIST : SAND, Math.min(1, dt * 4));
      if (moving) {
        for (let f = 0; f < 2; f += 1) {
          const foot = feet[f];
          if (!foot) continue;
          const y = foot.length();
          const goingDown = y < footPrevY[f] - 0.0005;
          if (footPrevDown[f] && !goingDown) emitAt(foot, water, groundR); // 최저점=딛음
          footPrevDown[f] = goingDown;
          footPrevY[f] = y;
        }
      }
      const posArr = geo.getAttribute('position').array as Float32Array;
      const colArr = geo.getAttribute('color').array as Float32Array;
      const aArr = geo.getAttribute('aAlpha').array as Float32Array;
      for (let i = 0; i < N; i += 1) {
        if (life[i] > 0) {
          life[i] -= dt;
          p[i].addScaledVector(vel[i], dt);
          vel[i].multiplyScalar(0.93);
          const k = Math.max(0, life[i] / lifeMax[i]); // 1→0
          aArr[i] = (water ? 0.24 : 0.34) * k; // 제 수명대로 개별 페이드아웃
        } else {
          aArr[i] = 0; // 죽은 입자는 완전 투명
        }
        posArr[i * 3] = p[i].x; posArr[i * 3 + 1] = p[i].y; posArr[i * 3 + 2] = p[i].z;
        colArr[i * 3] = col[i * 3]; colArr[i * 3 + 1] = col[i * 3 + 1]; colArr[i * 3 + 2] = col[i * 3 + 2];
      }
      (geo.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
      (geo.getAttribute('color') as THREE.BufferAttribute).needsUpdate = true;
      (geo.getAttribute('aAlpha') as THREE.BufferAttribute).needsUpdate = true;
      mat.uniforms.uSize.value = water ? 0.08 : 0.055;
    },
    dispose() { geo.dispose(); mat.dispose(); tex.dispose(); parent.remove(pts); },
  };
}
