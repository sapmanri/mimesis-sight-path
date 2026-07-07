// BUILD 230+ 수사 벤치 2호 — 전 시스템 결합 재현
// PlanetWorld useFrame(795~990행)을 헤드리스로 통짜 이식:
//   지형 구(128×96 변위) + surfaceR 격자 + 배회 + 행성 슬러프(dt·6) + MV 상태기(run/ride)
//   + ponder + liftGroup + clipRig(LittleBoy)
// 측정: 매 프레임 [발뼈 최저 월드 y] − [레이캐스트 실지형 월드 y] = 부양량
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { readFileSync } from 'fs';
import { createClipRig } from './_walkerRig.mjs';

function stripGLB(path) {
  const buf = readFileSync(path);
  const jsonLen = buf.readUInt32LE(12);
  const json = JSON.parse(buf.toString('utf8', 20, 20 + jsonLen));
  delete json.images; delete json.textures; delete json.samplers;
  if (json.materials) json.materials = json.materials.map(() => ({ pbrMetallicRoughness: {} }));
  (json.meshes ?? []).forEach(m => m.primitives.forEach(p => { delete p.material; }));
  const jstr = Buffer.from(JSON.stringify(json).padEnd(Math.ceil(JSON.stringify(json).length / 4) * 4, ' '));
  const rest = buf.subarray(20 + jsonLen);
  const total = 12 + 8 + jstr.length + rest.length;
  const out = Buffer.alloc(total);
  buf.copy(out, 0, 0, 12); out.writeUInt32LE(total, 8);
  out.writeUInt32LE(jstr.length, 12); out.writeUInt32LE(0x4E4F534A, 16); jstr.copy(out, 20);
  rest.copy(out, 20 + jstr.length);
  return out;
}
const loadGLB = (p) => new Promise((res, rej) => {
  const ab = stripGLB(p);
  new GLTFLoader().parse(ab.buffer.slice(ab.byteOffset, ab.byteOffset + ab.byteLength), '', res, rej);
});
function normalize(scene, height) {
  scene.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(scene);
  const s = height / Math.max(box.getSize(new THREE.Vector3()).y, 1e-6);
  scene.scale.setScalar(s);
  scene.updateMatrixWorld(true);
  const box2 = new THREE.Box3().setFromObject(scene);
  const c = box2.getCenter(new THREE.Vector3());
  scene.position.x -= c.x; scene.position.z -= c.z; scene.position.y -= box2.min.y;
  const wrapper = new THREE.Group(); wrapper.add(scene);
  return { wrapper, ns: s };
}

// ── 지형: R=12, 합성 굴곡 (relief 인자) — 격자 벤치와 동일 계열
const R = 12;
function makeHeightAt(relief) {
  return (d) => relief * (0.35 * Math.sin(d.x * 5.1) * Math.cos(d.z * 4.3) + 0.25 * Math.sin(d.y * 7.7 + 1.3) + 0.18 * Math.cos((d.x + d.y * 2 + d.z) * 9.1)) * 0.12;
}
function buildPlanet(relief) {
  const heightAt = makeHeightAt(relief);
  const GSW = 128, GSH = 96;
  const rGrid = new Float32Array((GSW + 1) * (GSH + 1));
  const gd = new THREE.Vector3();
  for (let iy = 0; iy <= GSH; iy++) {
    const th2 = (iy / GSH) * Math.PI;
    for (let ix = 0; ix <= GSW; ix++) {
      const ph2 = (ix / GSW) * Math.PI * 2;
      gd.set(-Math.cos(ph2) * Math.sin(th2), Math.cos(th2), Math.sin(ph2) * Math.sin(th2));
      rGrid[iy * (GSW + 1) + ix] = R + heightAt(gd);
    }
  }
  const surfaceR = (d) => {
    const th2 = Math.acos(THREE.MathUtils.clamp(d.y, -1, 1));
    let ph2 = Math.atan2(d.z, -d.x); if (ph2 < 0) ph2 += Math.PI * 2;
    const fx = (ph2 / (Math.PI * 2)) * GSW, fy = (th2 / Math.PI) * GSH;
    const x0 = Math.min(GSW - 1, Math.floor(fx)), y0 = Math.min(GSH - 1, Math.floor(fy));
    const tx = fx - x0, ty = fy - y0;
    const g00 = rGrid[y0 * (GSW + 1) + x0], g10 = rGrid[y0 * (GSW + 1) + x0 + 1];
    const g01 = rGrid[(y0 + 1) * (GSW + 1) + x0], g11 = rGrid[(y0 + 1) * (GSW + 1) + x0 + 1];
    return (g00 * (1 - tx) + g10 * tx) * (1 - ty) + (g01 * (1 - tx) + g11 * tx) * ty;
  };
  const geo = new THREE.SphereGeometry(R, 128, 96);
  const pos = geo.getAttribute('position');
  const vd = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    vd.set(pos.getX(i), pos.getY(i), pos.getZ(i)).normalize();
    const r2 = R + heightAt(vd);
    pos.setXYZ(i, vd.x * r2, vd.y * r2, vd.z * r2);
  }
  geo.computeVertexNormals(); geo.computeBoundingSphere();
  const planet = new THREE.Group();
  const ground = new THREE.Mesh(geo, new THREE.MeshStandardMaterial());
  planet.add(ground);
  // 길 (curve 모드용)
  const N = 560, wraps = 3, wobble = 0.5;
  const pts = [];
  for (let i = 0; i < N; i++) {
    const u = i / N;
    const phi = Math.PI * 2 * wraps * u;
    const theta = Math.PI / 2 + wobble * 0.62 * Math.sin(Math.PI * 2 * 3 * u + 0.7) + wobble * 0.21 * Math.sin(Math.PI * 2 * 7 * u + 2.1);
    const d = new THREE.Vector3(Math.sin(theta) * Math.cos(phi), Math.cos(theta), Math.sin(theta) * Math.sin(phi));
    pts.push(d.multiplyScalar(surfaceR(d) + 0.005));
  }
  const curve = new THREE.CatmullRomCurve3(pts, true, 'centripetal');
  curve.arcLengthDivisions = 1800;
  return { planet, ground, surfaceR, curve, arcLen: curve.getLength() };
}

// ── 결정적 난수 (재현성)
let seed = 42;
const rand = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };

async function run({ relief, roam, rideEvery, runEvery, label, seconds = 300 }) {
  seed = 42;
  const B = buildPlanet(relief);
  const scene = new THREE.Scene();
  scene.add(B.planet);
  const holder = new THREE.Group(); holder.position.y = 0.012; holder.rotation.y = Math.PI / 2;
  scene.add(holder);
  const liftGroup = new THREE.Group(); holder.add(liftGroup);
  const g = await loadGLB('public/assets/models/LittleBoy.glb');
  const { wrapper, ns } = normalize(g.scene, 0.9);
  liftGroup.add(wrapper);
  holder.updateMatrixWorld(true);
  const rig = createClipRig(wrapper, g.animations, { walk: 1.48 * ns, run: 5.207 * ns });
  // 발뼈
  const bones = [];
  wrapper.traverse((o) => { if (/Toe|Foot/i.test(o.name)) bones.push(o); });

  const SPwalk = 0.58;
  const MV = { mode: 'walk', until: 0, nextRun: -1, nextRide: -1, rideStart: 0, lift: 0 };
  const P = { phase: 'walk', timer: 0, jumpTo: -1, cooldown: 0, memCooldown: 0 };
  const S = { current: 0 };
  const roamR = { d: null, T: null };
  const dt = 1 / 60;
  const tmp = { p: new THREE.Vector3(), T: new THREE.Vector3(), U: new THREE.Vector3(), F: new THREE.Vector3(), Z: new THREE.Vector3(), M: new THREE.Matrix4(), Q: new THREE.Quaternion(), v: new THREE.Vector3() };
  const ray = new THREE.Raycaster();
  const down = new THREE.Vector3(0, -1, 0);
  const fw = new THREE.Vector3();
  let firstFrame = true;
  const floats = []; const marks = [];
  let el = 0;

  for (let f = 0; f < seconds * 60; f++) {
    el += dt;
    P.cooldown = Math.max(0, P.cooldown - dt);
    P.memCooldown = Math.max(0, P.memCooldown - dt);
    let moving = true;
    if (MV.nextRun < 0) { MV.nextRun = el + 14 + rand() * 18; MV.nextRide = el + 35 + rand() * 45; }
    if (MV.mode === 'walk' && P.phase === 'walk') {
      if (rideEvery > 0 && el >= MV.nextRide) {
        MV.mode = 'ride'; MV.rideStart = el; MV.until = el + 12 + rand() * 10;
        rig.setRiding(true);
        marks.push([el, 'ride+']);
      } else if (runEvery > 0 && el >= MV.nextRun) {
        MV.mode = 'run'; MV.until = el + 6 + rand() * 6;
        marks.push([el, 'run+']);
      }
    }
    if (MV.mode === 'run' && el >= MV.until) { MV.mode = 'walk'; MV.nextRun = el + runEvery * (0.7 + rand() * 0.6); }
    const liftTarget = MV.mode === 'ride' && el < MV.until ? 1.15 : 0;
    MV.lift += (liftTarget - MV.lift) * Math.min(1, dt * 1.7);
    if (MV.mode === 'ride' && el >= MV.until && MV.lift < 0.04) {
      MV.mode = 'walk';
      rig.setRiding(false);
      MV.nextRide = el + Math.max(30, rideEvery * (0.75 + rand() * 0.5));
      MV.nextRun = Math.max(MV.nextRun, el + 8);
      marks.push([el, 'ride-']);
    }
    const spdMul = MV.mode === 'ride' ? 2.6 : MV.mode === 'run' ? 2.3 : 1;
    liftGroup.position.y = MV.lift;

    // ponder 페이즈
    if (P.phase !== 'walk') {
      moving = false;
      P.timer -= dt;
      if (P.timer <= 0) {
        if (P.phase === 'ponder' && roam && roamR.d) {
          const turn = (rand() < 0.5 ? -1 : 1) * (0.6 + rand() * 1.8);
          roamR.T.applyQuaternion(tmp.Q.setFromAxisAngle(roamR.d, turn));
        }
        P.phase = 'walk'; P.jumpTo = -1; P.cooldown = 8;
      }
    } else if (roam) {
      if (MV.mode === 'walk' && P.cooldown <= 0 && rand() < dt * 0.07) { P.phase = 'ponder'; P.timer = 1.2 + rand() * 2.2; }
    } else {
      S.current += SPwalk * spdMul * dt;
    }

    const { p, T, U, F: Fw, Z, M, Q, v } = tmp;
    if (roam) {
      if (!roamR.d) {
        roamR.d = B.curve.getPointAt(0, new THREE.Vector3()).normalize();
        const t0 = B.curve.getTangentAt(0, new THREE.Vector3());
        t0.addScaledVector(roamR.d, -t0.dot(roamR.d)).normalize();
        roamR.T = t0;
      }
      if (moving) {
        roamR.T.applyQuaternion(Q.setFromAxisAngle(roamR.d, Math.sin(el * 0.16) * 0.5 * dt));
        const rS = B.surfaceR(roamR.d);
        const th = (SPwalk * spdMul * dt) / Math.max(1, rS);
        v.crossVectors(roamR.d, roamR.T).normalize();
        Q.setFromAxisAngle(v, th);
        roamR.d.applyQuaternion(Q).normalize();
        roamR.T.applyQuaternion(Q);
        roamR.T.addScaledVector(roamR.d, -roamR.T.dot(roamR.d)).normalize();
      }
      p.copy(roamR.d).multiplyScalar(B.surfaceR(roamR.d) + 0.005);
      T.copy(roamR.T);
    } else {
      const t = ((S.current / B.arcLen) % 1 + 1) % 1;
      B.curve.getPointAt(t, p);
      B.curve.getTangentAt(t, T);
    }
    U.copy(p).normalize();
    Fw.copy(T).addScaledVector(U, -T.dot(U)).normalize();
    Z.crossVectors(Fw, U);
    M.makeBasis(Fw, U, Z);
    Q.setFromRotationMatrix(M).conjugate();
    if (firstFrame) {
      firstFrame = false;
      B.planet.quaternion.copy(Q);
      B.planet.position.y = -p.length();
    } else {
      const k = Math.min(1, dt * 6);
      B.planet.quaternion.slerp(Q, k);
      B.planet.position.y += (-p.length() - B.planet.position.y) * k;
    }
    rig.update(dt, MV.mode === 'run' ? 0.9 : 0.5, moving, el, moving ? SPwalk * spdMul * dt : 0);

    // ── 측정 (라이브 렌더 직전 상태와 동일): 발 최저 y − 실지형 y
    scene.updateMatrixWorld(true);
    let footMin = Infinity;
    for (const b of bones) { b.getWorldPosition(fw); footMin = Math.min(footMin, fw.y); }
    ray.set(new THREE.Vector3(0, R * 0.8, 0), down);
    const hit = ray.intersectObject(B.ground, false)[0];
    if (!hit) continue;
    floats.push({ el, fl: footMin - hit.point.y, mode: MV.mode, mv: moving, lift: MV.lift });
  }

  // 통계: 걷는 중(탑승 제외, lift<0.05)의 부양
  const walkFl = floats.filter((x) => x.mode !== 'ride' && x.lift < 0.05 && x.el > 10).map((x) => x.fl);
  const mx = Math.max(...walkFl), avg = walkFl.reduce((a, b) => a + b, 0) / walkFl.length;
  const over3 = walkFl.filter((x) => x > 0.3).length / walkFl.length;
  // 고착 구간 탐지: 60프레임 이동평균이 0.3u를 넘는 마지막 시각
  let stuckFrom = -1;
  const wOnly = floats.filter((x) => x.mode !== 'ride' && x.lift < 0.05);
  for (let i = 60; i < wOnly.length; i++) {
    const m = wOnly.slice(i - 60, i).reduce((a, b) => a + b.fl, 0) / 60;
    if (m > 0.3 && stuckFrom < 0) stuckFrom = wOnly[i].el;
    if (m <= 0.3) stuckFrom = -1;
  }
  console.log(`${label}  걷기중 부양: avg ${avg.toFixed(3)}  max ${mx.toFixed(3)}  >0.3u 비율 ${(over3 * 100).toFixed(1)}%  고착시작 ${stuckFrom < 0 ? '없음' : stuckFrom.toFixed(0) + 's'}`);
  return { avg, mx, over3, stuckFrom, floats, marks };
}

const A = await run({ relief: 0, roam: true, rideEvery: 120, runEvery: 45, label: '매끈+배회+상태기 5분 ' });
const B2 = await run({ relief: 8, roam: true, rideEvery: 120, runEvery: 45, label: '굴곡8+배회+상태기 5분' });
const C = await run({ relief: 8, roam: false, rideEvery: 120, runEvery: 45, label: '굴곡8+길+상태기 5분  ' });
const D = await run({ relief: 8, roam: true, rideEvery: 0, runEvery: 0, label: '굴곡8+배회+상태기OFF ' });
console.log('\n판정: 라이브 증상 = 지속 0.7~0.9u. 위에서 고착이 재현되는 조합이 범인 계열.');
