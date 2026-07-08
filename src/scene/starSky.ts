// BUILD 240: 밤하늘 — 우주에 달만 있을 순 없다 (Vase). 세 겹의 별 + 은하수 + 별똥별.
// 동화책 시차: 원경은 카메라에 붙박이(무한), 중경은 행성 회전을 아주 조금 따라오고,
// 근경은 크고 밝게 반짝인다. 전부 밤(dl<1)에만 스민다.
import * as THREE from 'three';
import { worldTime, eventCycle } from './skyClock';

const SHOOT_PERIOD = 7;   // 약 7초 주기대 (밤에 자주)
const SHOOT_DUR = 1.15;
const SHOOT_SALT = 33;

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

      // 별똥별 — 밤에만. BUILD 246: 하늘 시계로 결정론화(모두 같은 순간 같은 궤도).
      // BUILD 252: 유성우 중엔 주기를 확 줄여 쏟아진다 (밤낮 무관).
      const WTnow = worldTime();
      const showering = showerUntil > WTnow;
      if (night > 0.6 || showering) {
        const period = showering ? 1.4 : SHOOT_PERIOD;
        const salt = showering ? SHOOT_SALT + 1 : SHOOT_SALT; // 유성우는 다른 궤도 계열
        const ev = eventCycle(WTnow, period, salt);
        const st = ev.active(SHOOT_DUR);
        if (st.on) {
          // 이 사이클을 처음 보면 궤도 세팅 + onShoot 1회
          if (ev.cycle !== shootCycle) {
            shootCycle = ev.cycle;
            onShoot?.();
            const az = ev.rng() * Math.PI * 2;
            const el0 = 0.35 + ev.rng() * 0.85;
            shootFrom.set(Math.cos(az) * Math.cos(el0), Math.sin(el0), Math.sin(az) * Math.cos(el0)).multiplyScalar(1600);
            tv.set(ev.rng() - 0.5, -0.5 - ev.rng() * 0.3, ev.rng() - 0.5).normalize();
            shootTo.copy(shootFrom).addScaledVector(tv, 520);
          }
          const k = st.u;
          const head = shootFrom.clone().lerp(shootTo, k);
          // 꼬리를 SEG개 글로우 점으로 (머리에서 뒤로 이어지는 빛의 자취)
          const arr = shootGeo.getAttribute('position') as THREE.BufferAttribute;
          const tailSpan = 0.34; // 궤적의 34%가 꼬리
          for (let i = 0; i < SEG; i += 1) {
            const f = i / SEG;
            const pk = Math.max(0, k - f * tailSpan);
            const p = shootFrom.clone().lerp(shootTo, pk);
            (arr.array as Float32Array).set([p.x, p.y, p.z], i * 3);
          }
          arr.needsUpdate = true;
          const harr = headGeo.getAttribute('position') as THREE.BufferAttribute;
          (harr.array as Float32Array).set([head.x, head.y, head.z]);
          harr.needsUpdate = true;
          // 유성우 땐 밤이 아니어도(낮) 보이도록 최소 밝기 보장
          const vis = Math.max(night, showering ? 0.95 : 0);
          const glow = Math.sin(k * Math.PI) * vis;
          shootMat.opacity = 0.75 * glow;
          headMat.opacity = glow;
        } else {
          shootMat.opacity = 0; headMat.opacity = 0;
        }
      } else if (shootMat.opacity > 0) { shootMat.opacity = 0; headMat.opacity = 0; }
    },
    dispose() {
      for (const L of [far, mid, near, milky]) { L.pts.geometry.dispose(); L.mat.dispose(); }
      shootGeo.dispose(); shootMat.dispose(); headGeo.dispose(); headMat.dispose(); shootGlow.dispose();
      scene.remove(root);
    },
  };
}
