// BUILD 245: 헬리 혜성 (Vase) — 힐링으로 틀어놨다가 사람들이 급 쳐다볼 순간.
// 밤에 드물게, 큰 머리 + 긴 빛 꼬리로 하늘을 천천히 가로지른다. 지나갈 때 "와우" 말풍선.
import * as THREE from 'three';

export function createComet(scene: THREE.Scene, camera: THREE.Camera, proto: THREE.Group, onPass: () => void) {
  const root = new THREE.Group();
  scene.add(root);

  // 혜성 핵 (모델)
  const core = proto.clone();
  core.scale.setScalar(0.001);
  root.add(core);

  // 빛 꼬리 — 점 스프라이트 여러 개로 그라데이션
  const TAIL = 40;
  const tailGeo = new THREE.BufferGeometry();
  tailGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(TAIL * 3), 3));
  const tailAlpha = new Float32Array(TAIL);
  tailGeo.setAttribute('aAlpha', new THREE.BufferAttribute(tailAlpha, 1));
  const tailMat = new THREE.PointsMaterial({ color: '#dCE8ff', size: 14, sizeAttenuation: false, transparent: true, opacity: 0, depthWrite: false, fog: false });
  const tail = new THREE.Points(tailGeo, tailMat);
  tail.frustumCulled = false;
  tail.renderOrder = -8;
  root.add(tail);

  const R = 1500; // 별 껍질 안쪽
  const from = new THREE.Vector3();
  const to = new THREE.Vector3();
  const pos = new THREE.Vector3();
  const trail: THREE.Vector3[] = [];
  let active = false;
  let u = 0;
  let nextIn = 20 + Math.random() * 40; // 첫 등장 20~60초
  let coreScale = 1;

  function launch() {
    active = true;
    u = 0;
    trail.length = 0;
    // 하늘 한쪽 위 → 반대쪽으로 완만한 대각
    const az = Math.random() * Math.PI * 2;
    const el0 = 0.45 + Math.random() * 0.5;
    from.set(Math.cos(az) * Math.cos(el0), Math.sin(el0), Math.sin(az) * Math.cos(el0)).multiplyScalar(R);
    const az2 = az + Math.PI * (0.6 + Math.random() * 0.5);
    const el1 = 0.3 + Math.random() * 0.4;
    to.set(Math.cos(az2) * Math.cos(el1), Math.sin(el1), Math.sin(az2) * Math.cos(el1)).multiplyScalar(R);
    coreScale = 5 + Math.random() * 4; // 별똥별보다 훨씬 큰 핵
    onPass();
  }

  return {
    update(dt: number, night: number) {
      root.position.copy(camera.position);
      if (!active) {
        if (night > 0.6) {
          nextIn -= dt;
          if (nextIn <= 0) { launch(); nextIn = 45 + Math.random() * 90; } // 45~135초에 한 번
        }
        return;
      }
      u += dt / 6.5; // 6.5초에 걸쳐 천천히 가로지른다 (별똥별보다 느긋 = 쳐다볼 시간)
      if (u >= 1) { active = false; core.scale.setScalar(0.001); tailMat.opacity = 0; return; }
      const glow = Math.sin(Math.min(1, u) * Math.PI); // 등장·퇴장 페이드
      pos.copy(from).lerp(to, u);
      core.position.copy(pos);
      core.scale.setScalar(coreScale * (0.6 + 0.4 * glow));
      core.rotation.x += dt * 0.5; core.rotation.y += dt * 0.7;
      // 꼬리: 지나온 자취를 기록
      trail.unshift(pos.clone());
      if (trail.length > TAIL) trail.pop();
      const arr = tailGeo.getAttribute('position') as THREE.BufferAttribute;
      const aa = tailGeo.getAttribute('aAlpha') as THREE.BufferAttribute;
      for (let i = 0; i < TAIL; i += 1) {
        const p = trail[i] ?? pos;
        (arr.array as Float32Array).set([p.x, p.y, p.z], i * 3);
        (aa.array as Float32Array)[i] = (1 - i / TAIL);
      }
      arr.needsUpdate = true;
      tailMat.opacity = 0.7 * glow * night;
    },
    dispose() { tailGeo.dispose(); tailMat.dispose(); scene.remove(root); },
  };
}
