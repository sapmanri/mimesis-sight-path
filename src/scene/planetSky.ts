// BUILD 234: 행성의 하늘 — 달처럼 독립된 구름과, 지구 중심으로 떨어지는 비·눈.
// 좌표 철학: 구름은 세계(월드) 틀에 산다. 행성이 dq만큼 구르면 그중 (1-자유)만 끌려간다.
//   자유=1 → 달처럼 하늘에 붙박이 / 자유=0 → 지형처럼 행성에 붙박이 / 기본 0.9 → 거의 그 자리, 아주 느리게 끌림.
// 비·눈은 먹구름 발밑에서 태어나 행성 중심을 향해 떨어지고, 그 방향의 실지형 반경(surfaceR)에 닿으면 다시 태어난다.
import * as THREE from 'three';
import { makeCloudPuff } from '../engine/worldCore';

type Phase = 'in' | 'live' | 'out';
type Precip = {
  kind: 'rain' | 'snow';
  obj: THREE.LineSegments | THREE.Points;
  mat: THREE.LineBasicMaterial | THREE.PointsMaterial;
  dir: Float32Array;   // 입자별 월드 방향 (행성 중심 기준, 단위)
  r: Float32Array;     // 입자별 반경
  spd: Float32Array;   // 입자별 낙하 속도
  sway: Float32Array;  // 눈: 입자별 위상
  n: number;
  baseOpacity: number;
};
type SkyCloud = {
  g: THREE.Group;
  d: THREE.Vector3;      // 월드 방향 (행성 중심 기준)
  altMul: number;        // 고도 = R × altMul
  size: number;
  windAxis: THREE.Vector3;
  windRate: number;
  windUntil: number;
  spin: number;
  kind: 'white' | 'rain' | 'snow';
  phase: Phase;
  t: number;             // 페이즈 시계
  life: number;          // live 지속(초)
  precip: Precip | null;
};
type PropRain = { key: string; topR: number; dirLocal: THREE.Vector3; precip: Precip };

const UP = new THREE.Vector3(0, 1, 0);
const tmpV = new THREE.Vector3();
const tmpV2 = new THREE.Vector3();
const tmpQ = new THREE.Quaternion();
const tmpQ2 = new THREE.Quaternion();
const ID_Q = new THREE.Quaternion();

function makePrecip(kind: 'rain' | 'snow', n: number, baseOpacity: number): Precip {
  const dir = new Float32Array(n * 3);
  const r = new Float32Array(n);
  const spd = new Float32Array(n);
  const sway = new Float32Array(n);
  let obj: THREE.LineSegments | THREE.Points;
  let mat: THREE.LineBasicMaterial | THREE.PointsMaterial;
  if (kind === 'rain') {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 6), 3)); // 선분 2정점
    mat = new THREE.LineBasicMaterial({ color: '#a9bfd0', transparent: true, opacity: 0 });
    obj = new THREE.LineSegments(geo, mat);
  } else {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    mat = new THREE.PointsMaterial({ color: '#f4f7fa', size: 0.05, sizeAttenuation: true, transparent: true, opacity: 0 });
    obj = new THREE.Points(geo, mat);
  }
  obj.frustumCulled = false;
  for (let i = 0; i < n; i += 1) { r[i] = -1; spd[i] = kind === 'rain' ? 6.5 + Math.random() * 3 : 0.85 + Math.random() * 0.55; sway[i] = Math.random() * Math.PI * 2; }
  return { kind, obj, mat, dir, r, spd, sway, n, baseOpacity };
}

// 입자 재탄생 — 구름 발밑 원반에서
function respawn(p: Precip, i: number, cloudDirW: THREE.Vector3, topR: number, spreadAng: number) {
  tmpV.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize();
  tmpV.crossVectors(cloudDirW, tmpV);
  if (tmpV.lengthSq() < 1e-8) tmpV.set(1, 0, 0);
  tmpV.normalize();
  tmpQ.setFromAxisAngle(tmpV, Math.sqrt(Math.random()) * spreadAng);
  tmpV2.copy(cloudDirW).applyQuaternion(tmpQ).normalize();
  p.dir[i * 3] = tmpV2.x; p.dir[i * 3 + 1] = tmpV2.y; p.dir[i * 3 + 2] = tmpV2.z;
  p.r[i] = topR - 0.25 - Math.random() * 0.5;
}

function stepPrecip(
  p: Precip, dt: number, center: THREE.Vector3, invPlanetQ: THREE.Quaternion,
  surfaceR: (d: THREE.Vector3) => number, cloudDirW: THREE.Vector3, topR: number, spreadAng: number, elapsed: number,
) {
  const pos = (p.obj.geometry.getAttribute('position') as THREE.BufferAttribute);
  const arr = pos.array as Float32Array;
  for (let i = 0; i < p.n; i += 1) {
    if (p.r[i] < 0) { respawn(p, i, cloudDirW, topR, spreadAng); continue; }
    p.r[i] -= p.spd[i] * dt;
    tmpV2.set(p.dir[i * 3], p.dir[i * 3 + 1], p.dir[i * 3 + 2]);
    if (p.kind === 'snow') {
      // 흔들리며 내린다 — 방향을 아주 조금씩 옆으로
      tmpV.crossVectors(tmpV2, UP);
      if (tmpV.lengthSq() < 1e-8) tmpV.set(1, 0, 0);
      tmpV.normalize();
      tmpQ.setFromAxisAngle(tmpV, Math.sin(elapsed * 1.7 + p.sway[i]) * 0.05 * dt);
      tmpV2.applyQuaternion(tmpQ).normalize();
      p.dir[i * 3] = tmpV2.x; p.dir[i * 3 + 1] = tmpV2.y; p.dir[i * 3 + 2] = tmpV2.z;
    }
    // 실지형 착지 — 걷는 땅과 같은 격자에서 (헌법 227)
    tmpV.copy(tmpV2).applyQuaternion(invPlanetQ);
    if (p.r[i] <= surfaceR(tmpV) + 0.04) { respawn(p, i, cloudDirW, topR, spreadAng); tmpV2.set(p.dir[i * 3], p.dir[i * 3 + 1], p.dir[i * 3 + 2]); }
    const x = center.x + tmpV2.x * p.r[i];
    const y = center.y + tmpV2.y * p.r[i];
    const z = center.z + tmpV2.z * p.r[i];
    if (p.kind === 'rain') {
      arr[i * 6] = x; arr[i * 6 + 1] = y; arr[i * 6 + 2] = z;
      arr[i * 6 + 3] = x + tmpV2.x * 0.34; arr[i * 6 + 4] = y + tmpV2.y * 0.34; arr[i * 6 + 5] = z + tmpV2.z * 0.34;
    } else {
      arr[i * 3] = x; arr[i * 3 + 1] = y; arr[i * 3 + 2] = z;
    }
  }
  pos.needsUpdate = true;
}

export function createPlanetSky(scene: THREE.Scene, dress: (root: THREE.Object3D) => void) {
  const root = new THREE.Group();
  scene.add(root);
  const clouds: SkyCloud[] = [];
  const propRains = new Map<string, PropRain>();
  const prevQ = new THREE.Quaternion();
  let prevQInit = false;
  let nextRain = -1;
  let nextSnow = -1;
  let seedI = 20260708;
  const rnd = () => { seedI = (seedI * 1664525 + 1013904223) >>> 0; return seedI / 4294967296; };

  function spawnCloud(kind: SkyCloud['kind'], R: number): SkyCloud {
    const size = kind === 'white' ? 0.45 + rnd() * 0.5 : 0.7 + rnd() * 0.6;
    const g = makeCloudPuff(rnd, size, kind === 'white' ? '#e9eef0' : '#59626e');
    dress(g);
    g.scale.setScalar(0.001);
    root.add(g);
    // 절반은 보이는 하늘(월드 +Y 근처)에서 태어난다 — 나머지는 지구 어딘가에
    const d = new THREE.Vector3();
    if (rnd() < 0.55) {
      // 보이는 하늘 — 단, 천정(카메라 머리 위)은 피한다: 15°~55° 고리에서 태어난다
      const th = 0.26 + rnd() * 0.7;
      const az = rnd() * Math.PI * 2;
      d.set(Math.sin(th) * Math.cos(az), Math.cos(th), Math.sin(th) * Math.sin(az));
    } else d.set(rnd() - 0.5, rnd() - 0.5, rnd() - 0.5).normalize();
    const c: SkyCloud = {
      g, d,
      altMul: 0.17 + rnd() * 0.16,
      size,
      windAxis: new THREE.Vector3(rnd() - 0.5, rnd() - 0.5, rnd() - 0.5).cross(d).normalize(),
      windRate: (0.004 + rnd() * 0.009) * (rnd() < 0.5 ? -1 : 1),
      windUntil: 0,
      spin: (rnd() - 0.5) * 0.08,
      kind,
      phase: 'in',
      t: 0,
      life: kind === 'white' ? Infinity : 22 + rnd() * 28,
      precip: null,
    };
    if (kind === 'rain') c.precip = makePrecip('rain', 110, 0.42);
    if (kind === 'snow') c.precip = makePrecip('snow', 150, 0.9);
    if (c.precip) root.add(c.precip.obj);
    clouds.push(c);
    return c;
  }
  function killCloud(c: SkyCloud) {
    root.remove(c.g);
    if (c.precip) { root.remove(c.precip.obj); c.precip.obj.geometry.dispose(); c.precip.mat.dispose(); }
    clouds.splice(clouds.indexOf(c), 1);
  }

  return {
    update(
      dt: number, el: number,
      planet: THREE.Group, R: number, surfaceR: (d: THREE.Vector3) => number,
      spec: { clouds: number; cloudFree: number; rainEvery: number; snowEvery: number },
      props: { key: string; dirLocal: THREE.Vector3; topR: number }[],
    ): number {
      const center = planet.position;
      // ── 행성의 끌림: dq의 (1-자유)만 구름에 전한다
      if (!prevQInit) { prevQ.copy(planet.quaternion); prevQInit = true; }
      tmpQ.copy(planet.quaternion).multiply(tmpQ2.copy(prevQ).invert()); // dq (월드)
      prevQ.copy(planet.quaternion);
      const drag = THREE.MathUtils.clamp(1 - (spec.cloudFree ?? 0.9), 0, 1);
      const dq = tmpQ2.copy(ID_Q).slerp(tmpQ, drag);

      // ── 흰 구름 정원 관리
      const want = Math.max(0, Math.round(spec.clouds ?? 0));
      const whites = clouds.filter((c) => c.kind === 'white');
      for (let i = whites.length; i < want; i += 1) spawnCloud('white', R);
      for (let i = whites.length - 1; i >= want; i -= 1) if (whites[i].phase !== 'out') { whites[i].phase = 'out'; whites[i].t = 0; }

      // ── 먹구름 스폰 시계 (본토 상태기 문법)
      const rainEvery = spec.rainEvery ?? 0;
      const snowEvery = spec.snowEvery ?? 0;
      const darks = clouds.filter((c) => c.kind !== 'white').length;
      if (rainEvery > 0) {
        if (nextRain < 0) nextRain = el + 4 + rnd() * rainEvery * 0.5;
        if (el >= nextRain) { if (darks < 4) spawnCloud('rain', R); nextRain = el + rainEvery * (0.7 + rnd() * 0.6); }
      } else nextRain = -1;
      if (snowEvery > 0) {
        if (nextSnow < 0) nextSnow = el + 7 + rnd() * snowEvery * 0.5;
        if (el >= nextSnow) { if (darks < 4) spawnCloud('snow', R); nextSnow = el + snowEvery * (0.7 + rnd() * 0.6); }
      } else nextSnow = -1;

      // ── 구름 갱신
      const invPQ = tmpQ.copy(planet.quaternion).invert(); // 주의: tmpQ 재사용 — 이후 setFromAxisAngle 전까지 유효
      const invPlanetQ = new THREE.Quaternion().copy(invPQ);
      let rainNear = 0;
      for (let i = clouds.length - 1; i >= 0; i -= 1) {
        const c = clouds[i];
        c.t += dt;
        // 끌림 + 바람
        c.d.applyQuaternion(dq).normalize();
        if (el >= c.windUntil) {
          c.windUntil = el + 18 + rnd() * 22;
          c.windAxis.set(rnd() - 0.5, rnd() - 0.5, rnd() - 0.5).cross(c.d);
          if (c.windAxis.lengthSq() < 1e-8) c.windAxis.set(0, 1, 0);
          c.windAxis.normalize();
        }
        c.d.applyQuaternion(tmpQ2.setFromAxisAngle(c.windAxis, c.windRate * dt)).normalize();
        const cloudR = R * (1 + c.altMul);
        c.g.position.set(center.x + c.d.x * cloudR, center.y + c.d.y * cloudR, center.z + c.d.z * cloudR);
        c.g.rotation.y += c.spin * dt;
        // 페이즈
        let k = 1;
        if (c.phase === 'in') { k = Math.min(1, c.t / 2.2); if (k >= 1) { c.phase = 'live'; c.t = 0; } }
        else if (c.phase === 'live' && c.t >= c.life) { c.phase = 'out'; c.t = 0; }
        else if (c.phase === 'out') {
          k = Math.max(0, 1 - c.t / 2.6);
          if (k <= 0) { killCloud(c); continue; }
        }
        const pop = c.phase === 'in' ? k * (1 + 0.14 * Math.sin(k * Math.PI)) : k; // 폽(backOut의 사촌)
        c.g.scale.setScalar(Math.max(0.001, pop));
        // 강수
        if (c.precip) {
          c.precip.mat.opacity = c.precip.baseOpacity * k;
          const spread = (c.size * 0.95) / cloudR;
          stepPrecip(c.precip, dt, center, invPlanetQ, surfaceR, c.d, cloudR - c.size * 0.25, spread, el);
          if (c.kind === 'rain' && c.phase !== 'out') {
            // 걷는 아이(월드 +Y 접점)와의 표면 호 거리 → 빗소리 근접도
            const arc = Math.acos(THREE.MathUtils.clamp(c.d.y, -1, 1)) * R;
            rainNear = Math.max(rainNear, THREE.MathUtils.clamp(1 - arc / 9, 0, 1) * k);
          }
        }
      }

      // ── 소품 먹구름 이슬비 (배치된 cloud-dark는 늘 제 자리에 비를 데리고 있다)
      const seen = new Set<string>();
      for (const pr of props) {
        seen.add(pr.key);
        let e = propRains.get(pr.key);
        if (!e) {
          e = { key: pr.key, topR: pr.topR, dirLocal: pr.dirLocal.clone(), precip: makePrecip('rain', 70, 0.34) };
          root.add(e.precip.obj);
          propRains.set(pr.key, e);
        }
        e.topR = pr.topR;
        e.dirLocal.copy(pr.dirLocal);
        e.precip.mat.opacity = e.precip.baseOpacity;
        tmpV.copy(e.dirLocal).applyQuaternion(planet.quaternion).normalize(); // 소품은 행성에 붙박이 — 월드로 환산
        const spread = 0.55 / e.topR;
        stepPrecip(e.precip, dt, center, invPlanetQ, surfaceR, tmpV, e.topR, spread, el);
        const arc = Math.acos(THREE.MathUtils.clamp(tmpV.y, -1, 1)) * R;
        rainNear = Math.max(rainNear, THREE.MathUtils.clamp(1 - arc / 9, 0, 1) * 0.8);
      }
      for (const [key, e] of propRains) {
        if (!seen.has(key)) { root.remove(e.precip.obj); e.precip.obj.geometry.dispose(); e.precip.mat.dispose(); propRains.delete(key); }
      }
      return rainNear;
    },
    dispose() {
      for (let i = clouds.length - 1; i >= 0; i -= 1) killCloud(clouds[i]);
      for (const [, e] of propRains) { root.remove(e.precip.obj); e.precip.obj.geometry.dispose(); e.precip.mat.dispose(); }
      propRains.clear();
      scene.remove(root);
    },
  };
}
