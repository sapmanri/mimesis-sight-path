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
  // BUILD 252: 대형 혜성 — 예고된 큰 사건. 배경 혜성과 별개로, 밤낮 무관·크게.
  // major.until > now면 활성. u는 0→1. from2/to2는 대형 전용 궤도.
  const from2 = new THREE.Vector3();
  const to2 = new THREE.Vector3();
  let majorStart = -1;   // 발동 시각(초, worldTime 기준)
  let majorDur = 8;
  let majorScale = 18;

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

  // 대형 혜성 궤도 세팅 (지정 방위/고도를 중심으로, 화면 정중앙을 가로지른다)
  function setupMajorOrbit(az: number, el: number) {
    // 중심(카메라 정면) 양옆으로 벌려 궤도 양끝을 잡는다 → 화면 한가운데를 지난다
    const spread = Math.PI * 0.42;
    const azA = az - spread, azB = az + spread;
    const elA = el + 0.22, elB = el - 0.12;
    from2.set(Math.cos(azA) * Math.cos(elA), Math.sin(elA), Math.sin(azA) * Math.cos(elA)).multiplyScalar(R);
    to2.set(Math.cos(azB) * Math.cos(elB), Math.sin(elB), Math.sin(azB) * Math.cos(elB)).multiplyScalar(R);
  }

  function renderComet(u: number, a: THREE.Vector3, b: THREE.Vector3, scale: number, WT: number, alpha: number) {
    const glow = Math.sin(Math.min(1, u) * Math.PI);
    pos.copy(a).lerp(b, u);
    core.position.copy(pos);
    core.scale.setScalar(scale * (0.6 + 0.4 * glow));
    core.rotation.x = WT * 0.5; core.rotation.y = WT * 0.7;
    const segs = 22;
    for (let i = 0; i < TAIL; i += 1) {
      const back = (i / TAIL) * (majorDur / segs);
      const pu = Math.max(0, u - back * 4);
      const p = a.clone().lerp(b, pu);
      (tailGeo.getAttribute('position').array as Float32Array).set([p.x, p.y, p.z], i * 3);
      (tailGeo.getAttribute('aAlpha').array as Float32Array)[i] = (1 - i / TAIL);
    }
    (tailGeo.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
    tailMat.opacity = 0.8 * glow * alpha;
  }

  return {
    // 대형 혜성 발동 — durSec 동안, 지정 궤도로 크게. 밤낮 무관.
    triggerMajor(az: number, el: number, durSec = 8, scale = 18) {
      majorStart = worldTime();
      majorDur = durSec;
      majorScale = scale;
      setupMajorOrbit(az, el);
      onPass();
    },
    update(_dt: number, night: number) {
      root.position.copy(camera.position);
      const WT = worldTime();
      // 1) 대형 혜성이 활성이면 그걸 우선 그린다 (밤낮 무관, 크게)
      if (majorStart >= 0) {
        const s = WT - majorStart;
        if (s >= 0 && s <= majorDur) {
          renderComet(s / majorDur, from2, to2, majorScale, WT, 1);
          return;
        }
        majorStart = -1; // 끝나면 해제
        core.scale.setScalar(0.001); tailMat.opacity = 0;
      }
      // 2) 배경 혜성 — 밤에만 실현. 낮이면 숨긴다.
      if (night <= 0.6) {
        if (core.scale.x > 0.01) { core.scale.setScalar(0.001); tailMat.opacity = 0; }
        return;
      }
      const ev = eventCycle(WT, COMET_PERIOD, COMET_SALT);
      const st = ev.active(COMET_DUR);
      if (!st.on) {
        if (core.scale.x > 0.01) { core.scale.setScalar(0.001); tailMat.opacity = 0; trail.length = 0; }
        return;
      }
      if (ev.cycle !== lastCycle) {
        lastCycle = ev.cycle;
        trail.length = 0;
        setupOrbit(ev.rng);
        onPass();
      }
      renderComet(st.u, from, to, coreScale, WT, night);
    },
    dispose() { tailGeo.dispose(); tailMat.dispose(); scene.remove(root); },
  };
}
