// BUILD 240: 밤하늘 — 우주에 달만 있을 순 없다 (Vase). 세 겹의 별 + 은하수 + 별똥별.
// 동화책 시차: 원경은 카메라에 붙박이(무한), 중경은 행성 회전을 아주 조금 따라오고,
// 근경은 크고 밝게 반짝인다. 전부 밤(dl<1)에만 스민다.
import * as THREE from 'three';
import { worldTime, eventCycle } from './skyClock';

const SHOOT_PERIOD = 7;   // 약 7초 주기대 (밤에 자주)
const SHOOT_DUR = 2.3; // BUILD 256: 속도 절반 (1.15→2.3) — 너무 빨라 안 보이던 것
const SHOOT_SALT = 33;

// BUILD 257: 유성우 각 유성 궤도용 결정론 난수
function rngOfMeteor(seed: number) {
  let a = seed >>> 0;
  return () => { a += 0x6d2b79f5; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

type Layer = { pts: THREE.Points; mat: THREE.PointsMaterial; baseOpacity: number; drift: number };

function starField(n: number, radius: number, size: number, color: string, opacity: number, spreadY = 1): Layer {
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(n * 3);
  const sizes = new Float32Array(n);
  for (let i = 0; i < n; i += 1) {
    // 구면 균등 분포 (하늘 전체) — 지평선 아래도 포함하나 안개가 가린다
    const u = Math.random() * 2 - 1;
    const th = Math.random() * Math.PI * 2;
    const r = Math.sqrt(1 - u * u);
    pos[i * 3] = Math.cos(th) * r * radius;
    pos[i * 3 + 1] = u * radius * spreadY;
    pos[i * 3 + 2] = Math.sin(th) * r * radius;
    sizes[i] = size * (0.5 + Math.random());
  }
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
  const mat = new THREE.PointsMaterial({ color, size, sizeAttenuation: false, transparent: true, opacity: 0, depthWrite: false, fog: false });
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false;
  pts.renderOrder = -10;
  return { pts, mat, baseOpacity: opacity, drift: 0 };
}

export function createStarSky(scene: THREE.Scene, camera: THREE.Camera, onShoot?: () => void) {
  const root = new THREE.Group();
  root.renderOrder = -10;
  scene.add(root);

  // 세 겹 — 카메라 far(기본 2000) 안에 둔다. 개수 늘리고 크기 키워 '총총'하게 (Vase: 눈꼽만 보임).
  const far = starField(1100, 1850, 2.2, '#eaf0ff', 0.95);
  const mid = starField(420, 1650, 3.2, '#dfe8ff', 1.0);
  const near = starField(90, 1450, 5.0, '#ffffff', 1.0);
  root.add(far.pts, mid.pts, near.pts);

  // 은하수 — 옅은 띠
  const milky = starField(600, 1780, 1.8, '#c8d4f0', 0.55, 0.14);
  milky.pts.rotation.z = 0.5;
  milky.pts.rotation.x = 0.3;
  root.add(milky.pts);

  // BUILD 255: 별똥별 머리 글로우 텍스처 — 각진 점을 둥근 빛으로 (선은 WebGL이 linewidth 무시해 안 보였다)
  function glowTexture(): THREE.Texture {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d')!;
    const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.3, 'rgba(240,246,255,0.85)');
    grad.addColorStop(0.6, 'rgba(200,220,255,0.35)');
    grad.addColorStop(1, 'rgba(200,220,255,0)');
    g.fillStyle = grad; g.fillRect(0, 0, 64, 64);
    const tex = new THREE.CanvasTexture(c); tex.needsUpdate = true; return tex;
  }
  const shootGlow = glowTexture();

  // 별똥별 — 밝은 꼬리 (여러 점의 글로우 궤적으로. 선은 두께가 안 먹어 점으로 그린다)
  const SEG = 14; // 꼬리를 이루는 점 개수
  const shootGeo = new THREE.BufferGeometry();
  shootGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(SEG * 3), 3));
  const shootMat = new THREE.PointsMaterial({ map: shootGlow, color: '#eaf2ff', size: 26, sizeAttenuation: true, transparent: true, opacity: 0, depthWrite: false, fog: false, blending: THREE.AdditiveBlending });
  const shoot = new THREE.Points(shootGeo, shootMat);
  shoot.frustumCulled = false;
  shoot.renderOrder = -9;
  root.add(shoot);
  // 머리의 밝은 점 — 큰 글로우
  const headGeo = new THREE.BufferGeometry();
  headGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(3), 3));
  const headMat = new THREE.PointsMaterial({ map: shootGlow, color: '#ffffff', size: 55, sizeAttenuation: true, transparent: true, opacity: 0, depthWrite: false, fog: false, blending: THREE.AdditiveBlending });
  const shootHead = new THREE.Points(headGeo, headMat);
  shootHead.frustumCulled = false;
  shootHead.renderOrder = -8;
  root.add(shootHead);
  let shootCycle = -1; // 어떤 사이클의 궤도를 세팅했는지
  const shootFrom = new THREE.Vector3();
  const shootTo = new THREE.Vector3();
  // BUILD 252: 유성우 — 예고된 큰 사건. 이 기간엔 별똥별 주기를 확 줄여 쏟아지게.
  let showerUntil = -1; // worldTime 기준 종료 시각(초). >now면 유성우 중.
  // BUILD 257: 유성우 전용 — 여러 개가 동시에 떨어진다 (단일 별똥별로는 '쏟아짐'이 안 된다).
  // 극단적으로 크게 시작 (Vase: 있나 없나부터 판단되게). 각 유성은 결정론 시차.
  const SHOWER_N = 8;          // 동시에 흐르는 유성 개수
  const SHOWER_SEG = 10;       // 각 유성 꼬리 점 수
  const SHOWER_LIFE = 3.0;     // 각 유성 하나의 수명(초) — 느긋하게
  const showerMeteors: { geo: THREE.BufferGeometry; pts: THREE.Points; mat: THREE.PointsMaterial; head: THREE.Points; headMat: THREE.PointsMaterial; headGeo: THREE.BufferGeometry; from: THREE.Vector3; to: THREE.Vector3 }[] = [];
  for (let i = 0; i < SHOWER_N; i += 1) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(SHOWER_SEG * 3), 3));
    const mat = new THREE.PointsMaterial({ map: shootGlow, color: '#eaf2ff', size: 70, sizeAttenuation: true, transparent: true, opacity: 0, depthWrite: false, fog: false, blending: THREE.AdditiveBlending });
    const pts = new THREE.Points(geo, mat); pts.frustumCulled = false; pts.renderOrder = -9;
    const hgeo = new THREE.BufferGeometry();
    hgeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(3), 3));
    const hmat = new THREE.PointsMaterial({ map: shootGlow, color: '#ffffff', size: 160, sizeAttenuation: true, transparent: true, opacity: 0, depthWrite: false, fog: false, blending: THREE.AdditiveBlending });
    const head = new THREE.Points(hgeo, hmat); head.frustumCulled = false; head.renderOrder = -8;
    root.add(pts, head);
    showerMeteors.push({ geo, pts, mat, head, headMat: hmat, headGeo: hgeo, from: new THREE.Vector3(), to: new THREE.Vector3() });
  }

  const tv = new THREE.Vector3();

  return {
    // BUILD 252: 유성우 발동 — durSec 동안 별똥별이 쏟아진다 (밤낮 무관).
    triggerShower(durSec = 1200) { showerUntil = worldTime() + durSec; },
    update(dt: number, el: number, dl: number) {
      // 별은 카메라를 따라다닌다(무한 배경) — 위치만, 회전은 각 레이어가 소유
      root.position.copy(camera.position);
      const night = 1 - THREE.MathUtils.smoothstep(dl, 0.15, 0.55); // 밤일수록 1
      far.mat.opacity = far.baseOpacity * night;
      mid.mat.opacity = mid.baseOpacity * night;
      near.mat.opacity = near.baseOpacity * night;
      milky.mat.opacity = milky.baseOpacity * night;

      // 시차 깊이는 이제 반경 차이가 만든다(원경이 더 멀어 더 안 움직인다). 회전 추종은 없앤다 —
      // 무한 배경은 행성도 카메라도 따르지 않고 그냥 박혀 있다.
      // 근경 별 반짝임 (느린 깜빡)
      near.mat.opacity *= 0.75 + 0.25 * Math.sin(el * 1.3);

      // BUILD 257: 유성우 — 여러 개가 동시에 쏟아진다 (전용 파티클). 밤낮 무관, 극단적으로 크게.
      const WTnow = worldTime();
      const showering = showerUntil > WTnow;
      if (showering) {
        // 각 유성은 자기 위상으로 SHOWER_LIFE 주기를 반복. 시차를 둬 계속 쏟아지는 느낌.
        for (let m = 0; m < SHOWER_N; m += 1) {
          const M = showerMeteors[m];
          const phase = (WTnow / SHOWER_LIFE + m / SHOWER_N) % 1; // 0→1 반복
          const cycleId = Math.floor(WTnow / SHOWER_LIFE + m / SHOWER_N);
          // 이 주기의 궤도 (결정론 — 모두 동일)
          const r = rngOfMeteor(cycleId * 131 + m * 977);
          const az = r() * Math.PI * 2;
          const el0 = 0.45 + r() * 0.75;
          M.from.set(Math.cos(az) * Math.cos(el0), Math.sin(el0), Math.sin(az) * Math.cos(el0)).multiplyScalar(1600);
          const dvx = r() - 0.5, dvz = r() - 0.5;
          M.to.copy(M.from).add(new THREE.Vector3(dvx * 500, -400 - r() * 300, dvz * 500));
          const k = phase;
          const head = M.from.clone().lerp(M.to, k);
          const arr = M.geo.getAttribute('position') as THREE.BufferAttribute;
          for (let i = 0; i < SHOWER_SEG; i += 1) {
            const f = i / SHOWER_SEG;
            const pk = Math.max(0, k - f * 0.4);
            const p = M.from.clone().lerp(M.to, pk);
            (arr.array as Float32Array).set([p.x, p.y, p.z], i * 3);
          }
          arr.needsUpdate = true;
          (M.headGeo.getAttribute('position').array as Float32Array).set([head.x, head.y, head.z]);
          (M.headGeo.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
          const glow = Math.sin(k * Math.PI); // 등장·소멸 페이드
          M.mat.opacity = 0.8 * glow;
          M.headMat.opacity = glow;
        }
      } else {
        // 유성우 끝 — 전용 파티클 숨김
        for (const M of showerMeteors) { if (M.mat.opacity > 0) { M.mat.opacity = 0; M.headMat.opacity = 0; } }
      }

      // 배경 별똥별 — 밤에만, 드문드문 하나씩 (BUILD 246 결정론)
      if (night > 0.6) {
        const ev = eventCycle(WTnow, SHOOT_PERIOD, SHOOT_SALT);
        const st = ev.active(SHOOT_DUR);
        if (st.on) {
          if (ev.cycle !== shootCycle) {
            shootCycle = ev.cycle;
            if (Math.random() < 0.25) onShoot?.(); // BUILD 377: 별똥별 연출은 매번, 기록은 25%만(기록 도배 방지)
            const az = ev.rng() * Math.PI * 2;
            const el0 = 0.35 + ev.rng() * 0.85;
            shootFrom.set(Math.cos(az) * Math.cos(el0), Math.sin(el0), Math.sin(az) * Math.cos(el0)).multiplyScalar(1600);
            tv.set(ev.rng() - 0.5, -0.5 - ev.rng() * 0.3, ev.rng() - 0.5).normalize();
            shootTo.copy(shootFrom).addScaledVector(tv, 520);
          }
          const k = st.u;
          const head = shootFrom.clone().lerp(shootTo, k);
          const arr = shootGeo.getAttribute('position') as THREE.BufferAttribute;
          for (let i = 0; i < SEG; i += 1) {
            const f = i / SEG;
            const pk = Math.max(0, k - f * 0.34);
            const p = shootFrom.clone().lerp(shootTo, pk);
            (arr.array as Float32Array).set([p.x, p.y, p.z], i * 3);
          }
          arr.needsUpdate = true;
          (headGeo.getAttribute('position').array as Float32Array).set([head.x, head.y, head.z]);
          (headGeo.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
          const glow = Math.sin(k * Math.PI) * night;
          shootMat.opacity = 0.75 * glow;
          headMat.opacity = glow;
        } else { shootMat.opacity = 0; headMat.opacity = 0; }
      } else if (shootMat.opacity > 0) { shootMat.opacity = 0; headMat.opacity = 0; }
    },
    dispose() {
      for (const L of [far, mid, near, milky]) { L.pts.geometry.dispose(); L.mat.dispose(); }
      shootGeo.dispose(); shootMat.dispose(); headGeo.dispose(); headMat.dispose(); shootGlow.dispose();
      for (const M of showerMeteors) { M.geo.dispose(); M.mat.dispose(); M.headGeo.dispose(); M.headMat.dispose(); }
      scene.remove(root);
    },
  };
}
