// BUILD 240: 밤하늘 — 우주에 달만 있을 순 없다 (Vase). 세 겹의 별 + 은하수 + 별똥별.
// 동화책 시차: 원경은 카메라에 붙박이(무한), 중경은 행성 회전을 아주 조금 따라오고,
// 근경은 크고 밝게 반짝인다. 전부 밤(dl<1)에만 스민다.
import * as THREE from 'three';

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

  // 세 겹 — 카메라 far(기본 2000) 안에 둔다. BUILD 240의 6000 반경은 far plane 밖이라 통째로
  // 잘려 별이 사라졌다(Vase). 시차는 카메라 상쇄(root가 카메라를 따라감)로 이미 0에 가깝다.
  const far = starField(420, 1850, 1.1, '#eaf0ff', 0.9);
  const mid = starField(150, 1650, 1.8, '#dfe8ff', 0.95);
  const near = starField(36, 1450, 3.0, '#ffffff', 1.0);
  root.add(far.pts, mid.pts, near.pts);

  // 은하수 — 옅은 띠
  const milky = starField(260, 1780, 1.0, '#c8d4f0', 0.5, 0.14);
  milky.pts.rotation.z = 0.5;
  milky.pts.rotation.x = 0.3;
  root.add(milky.pts);

  // 별똥별 — 한 줄기 선분
  const shootGeo = new THREE.BufferGeometry();
  shootGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
  const shootMat = new THREE.LineBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0, fog: false });
  const shoot = new THREE.Line(shootGeo, shootMat);
  shoot.frustumCulled = false;
  shoot.renderOrder = -9;
  root.add(shoot);
  let shootT = -1;
  let shootNext = 8 + Math.random() * 20;
  const shootFrom = new THREE.Vector3();
  const shootTo = new THREE.Vector3();

  const tv = new THREE.Vector3();

  return {
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

      // 별똥별 — 밤에만
      if (night > 0.6) {
        if (shootT < 0) {
          shootNext -= dt;
          if (shootNext <= 0) {
            shootT = 0;
            shootNext = 12 + Math.random() * 28;
            onShoot?.();
            // 하늘 위쪽 한 점에서 대각선으로
            const az = Math.random() * Math.PI * 2;
            const el0 = 0.5 + Math.random() * 0.8;
            shootFrom.set(Math.cos(az) * Math.cos(el0), Math.sin(el0), Math.sin(az) * Math.cos(el0)).multiplyScalar(1600);
            tv.set(Math.random() - 0.5, -0.4 - Math.random() * 0.3, Math.random() - 0.5).normalize();
            shootTo.copy(shootFrom).addScaledVector(tv, 320);
          }
        } else {
          shootT += dt;
          const dur = 0.9;
          const k = shootT / dur;
          if (k >= 1) { shootT = -1; shootMat.opacity = 0; }
          else {
            // 꼬리가 그어지며 스러진다
            const head = shootFrom.clone().lerp(shootTo, k);
            const tail = shootFrom.clone().lerp(shootTo, Math.max(0, k - 0.18));
            const arr = shootGeo.getAttribute('position') as THREE.BufferAttribute;
            (arr.array as Float32Array).set([tail.x, tail.y, tail.z, head.x, head.y, head.z]);
            arr.needsUpdate = true;
            shootMat.opacity = Math.sin(k * Math.PI) * night;
          }
        }
      } else if (shootT >= 0) { shootT = -1; shootMat.opacity = 0; }
    },
    dispose() {
      for (const L of [far, mid, near, milky]) { L.pts.geometry.dispose(); L.mat.dispose(); }
      shootGeo.dispose(); shootMat.dispose();
      scene.remove(root);
    },
  };
}
