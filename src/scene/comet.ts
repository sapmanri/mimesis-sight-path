// BUILD 245: 헬리 혜성 (Vase) — 힐링으로 틀어놨다가 사람들이 급 쳐다볼 순간.
// 밤에 드물게, 큰 머리 + 긴 빛 꼬리로 하늘을 천천히 가로지른다. 지나갈 때 "와우" 말풍선.
// BUILD 246: 하늘 시계 — 로컬 타이머/Math.random 제거. 절대 UTC로 "몇 번째 혜성이 언제·어느 궤도로"를
// 결정론 계산 → 접속한 전원이 같은 순간 같은 혜성을 본다.
import * as THREE from 'three';
import { worldTime, eventCycle } from './skyClock';

const COMET_PERIOD = 90;  // 약 90초 주기대(밤에만 실현)
const COMET_DUR = 6.5;    // 6.5초에 걸쳐 가로지른다
const COMET_SALT = 71;    // 다른 이벤트와 궤도 분리

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
  let lastCycle = -1;      // 어떤 사이클을 이미 onPass 알렸는지 (중복 방지)
  let coreScale = 1;

  // 특정 사이클의 궤도를 결정론적으로 세팅 (모두 동일)
  function setupOrbit(rng: () => number) {
    const az = rng() * Math.PI * 2;
    const el0 = 0.45 + rng() * 0.5;
    from.set(Math.cos(az) * Math.cos(el0), Math.sin(el0), Math.sin(az) * Math.cos(el0)).multiplyScalar(R);
    const az2 = az + Math.PI * (0.6 + rng() * 0.5);
    const el1 = 0.3 + rng() * 0.4;
    to.set(Math.cos(az2) * Math.cos(el1), Math.sin(el1), Math.sin(az2) * Math.cos(el1)).multiplyScalar(R);
    coreScale = 5 + rng() * 4; // 별똥별보다 훨씬 큰 핵
  }

  return {
    update(_dt: number, night: number) {
      root.position.copy(camera.position);
      // 밤에만 실현. 낮이면 숨긴다.
      if (night <= 0.6) {
        if (core.scale.x > 0.01) { core.scale.setScalar(0.001); tailMat.opacity = 0; }
        return;
      }
      const WT = worldTime();
      const ev = eventCycle(WT, COMET_PERIOD, COMET_SALT);
      const st = ev.active(COMET_DUR);
      if (!st.on) {
        if (core.scale.x > 0.01) { core.scale.setScalar(0.001); tailMat.opacity = 0; trail.length = 0; }
        return;
      }
      // 이 사이클을 처음 보는 순간 → 궤도 세팅 + 말풍선 1회
      if (ev.cycle !== lastCycle) {
        lastCycle = ev.cycle;
        trail.length = 0;
        setupOrbit(ev.rng);
        onPass();
      }
      const u = st.u;
      const glow = Math.sin(Math.min(1, u) * Math.PI); // 등장·퇴장 페이드
      pos.copy(from).lerp(to, u);
      core.position.copy(pos);
      core.scale.setScalar(coreScale * (0.6 + 0.4 * glow));
      core.rotation.x = WT * 0.5; core.rotation.y = WT * 0.7; // 자전도 절대시각 기반(동기)
      // 꼬리: 지나온 자취를 기록 (u로부터 역산 — 프레임레이트 무관)
      const segs = 22;
      for (let i = 0; i < TAIL; i += 1) {
        const back = (i / TAIL) * (COMET_DUR / segs); // u 기준 뒤로 조금씩
        const pu = Math.max(0, u - back * 4);
        const p = from.clone().lerp(to, pu);
        const arr = tailGeo.getAttribute('position') as THREE.BufferAttribute;
        (arr.array as Float32Array).set([p.x, p.y, p.z], i * 3);
        const aa = tailGeo.getAttribute('aAlpha') as THREE.BufferAttribute;
        (aa.array as Float32Array)[i] = (1 - i / TAIL);
      }
      (tailGeo.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
      tailMat.opacity = 0.7 * glow * night;
    },
    dispose() { tailGeo.dispose(); tailMat.dispose(); scene.remove(root); },
  };
}
