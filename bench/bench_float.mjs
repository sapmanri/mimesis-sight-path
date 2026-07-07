// BUILD 230+ 수사 벤치 — 캐릭터 지속 부양(0.7~0.9u) 판가름
// 계층 재현: holder(y=0.012) > liftGroup(y=MV.lift) > wrapper(=rig root) > scene
// 시나리오: A 평지 걷기(대조군) / B spdMul 2.6 / C setRiding 왕복 / D 부모 y 출렁 / E 조합
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

// normalizeModel 재현 (worldCore BUILD 091)
function normalize(scene, height) {
  scene.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(scene);
  const size = box.getSize(new THREE.Vector3());
  const s = height / Math.max(size.y, 1e-6);
  scene.scale.setScalar(s);
  scene.updateMatrixWorld(true);
  const box2 = new THREE.Box3().setFromObject(scene);
  const c = box2.getCenter(new THREE.Vector3());
  scene.position.x -= c.x; scene.position.z -= c.z; scene.position.y -= box2.min.y;
  const wrapper = new THREE.Group();
  wrapper.add(scene);
  return { wrapper, ns: s };
}

const gltf = await loadGLB('public/assets/models/LittleBoy.glb');
const dt = 1 / 60;
const WALK = 0.58; // SP.walkSpeed 기본

function freshRig() {
  // 매 시나리오 새 씬 — 상태 오염 방지 (클론은 스킨 바인딩이 깨져서 재로드)
  return loadGLB('public/assets/models/LittleBoy.glb').then((g) => {
    const { wrapper, ns } = normalize(g.scene, 0.9);
    const holder = new THREE.Group(); holder.position.y = 0.012;
    const lift = new THREE.Group();
    holder.add(lift); lift.add(wrapper);
    holder.updateMatrixWorld(true);
    const rig = createClipRig(wrapper, g.animations, { walk: 1.48 * ns, run: 5.207 * ns });
    const scene3 = new THREE.Scene(); scene3.add(holder);
    return { rig, wrapper, lift, holder, scene3 };
  });
}

function stats(log, from = 0) {
  const seg = log.slice(from);
  const mx = Math.max(...seg); const avg = seg.reduce((a, b) => a + b, 0) / seg.length;
  const tail = seg.slice(-120); // 마지막 2초
  const tailAvg = tail.reduce((a, b) => a + b, 0) / tail.length;
  return { max: mx.toFixed(3), avg: avg.toFixed(3), tail2s: tailAvg.toFixed(3) };
}

// ── A. 대조군: 평지 걷기 20초
{
  const { rig, wrapper, scene3 } = await freshRig();
  const log = [];
  let t = 0;
  for (let i = 0; i < 1200; i++) {
    t += dt;
    rig.update(dt, 0.5, true, t, WALK * dt);
    scene3.updateMatrixWorld(true);
    log.push(wrapper.position.y);
  }
  console.log('A 평지 걷기 20s        root.y', stats(log, 300));
}

// ── B. spdMul 2.6 걷기(탈것 속도로 걷기 클립) 20초
{
  const { rig, wrapper, scene3 } = await freshRig();
  const log = [];
  let t = 0;
  for (let i = 0; i < 1200; i++) {
    t += dt;
    rig.update(dt, 0.9, true, t, WALK * 2.6 * dt);
    scene3.updateMatrixWorld(true);
    log.push(wrapper.position.y);
  }
  console.log('B spdMul 2.6 걷기 20s  root.y', stats(log, 300));
}

// ── C. setRiding 왕복: 걷기 5s → 탑승 8s(lift 1.15 램프) → 하차 → 걷기 20s
{
  const { rig, wrapper, lift, scene3 } = await freshRig();
  const log = []; const phase = [];
  let t = 0; let MVlift = 0;
  const frame = (mode) => {
    t += dt;
    const liftTarget = mode === 'ride' ? 1.15 : 0;
    MVlift += (liftTarget - MVlift) * Math.min(1, dt * 1.7);
    lift.position.y = MVlift;
    const moving = true;
    const mul = mode === 'ride' ? 2.6 : 1;
    rig.update(dt, 0.5, moving, t, WALK * mul * dt);
    scene3.updateMatrixWorld(true);
    log.push(wrapper.position.y); phase.push(mode);
  };
  for (let i = 0; i < 300; i++) frame('walk');
  rig.setRiding(true);
  for (let i = 0; i < 480; i++) frame('ride');
  rig.setRiding(false);
  const dismountAt = log.length;
  for (let i = 0; i < 1200; i++) frame('walk');
  console.log('C 탑승 왕복 후 걷기     root.y', stats(log, dismountAt + 300), ' (하차 직후 5프레임:', log.slice(dismountAt, dismountAt + 5).map(v => v.toFixed(3)).join(' '), ')');
}

// ── D. 부모(lift) y 지형 스파이크 출렁 ±0.3, 걷는 중
{
  const { rig, wrapper, lift, scene3 } = await freshRig();
  const log = [];
  let t = 0;
  for (let i = 0; i < 2400; i++) { // 40초
    t += dt;
    lift.position.y = Math.sin(t * 2.1) * 0.3; // 지연 추적 스파이크 모사
    rig.update(dt, 0.5, true, t, WALK * dt);
    scene3.updateMatrixWorld(true);
    log.push(wrapper.position.y);
  }
  console.log('D 부모 y ±0.3 출렁 40s root.y', stats(log, 300));
}

// ── E. 조합: 스파이크 출렁 + setRiding 왕복 + spdMul
{
  const { rig, wrapper, lift, scene3 } = await freshRig();
  const log = [];
  let t = 0; let MVlift = 0;
  const frame = (mode) => {
    t += dt;
    const liftTarget = mode === 'ride' ? 1.15 : 0;
    MVlift += (liftTarget - MVlift) * Math.min(1, dt * 1.7);
    lift.position.y = MVlift + Math.sin(t * 2.1) * 0.25;
    const mul = mode === 'ride' ? 2.6 : mode === 'run' ? 2.3 : 1;
    rig.update(dt, mode === 'run' ? 0.9 : 0.5, true, t, WALK * mul * dt);
    scene3.updateMatrixWorld(true);
    log.push(wrapper.position.y);
  };
  for (let i = 0; i < 300; i++) frame('walk');
  for (let i = 0; i < 300; i++) frame('run');
  rig.setRiding(true);
  for (let i = 0; i < 480; i++) frame('ride');
  rig.setRiding(false);
  const dm = log.length;
  for (let i = 0; i < 1800; i++) frame('walk');
  console.log('E 조합(출렁+왕복+run)   root.y', stats(log, dm + 300));
}
console.log('\n판정 기준: 정상 root.y ≈ 0 ± 0.05. tail2s가 +0.3↑ 고착이면 그 시나리오가 범인.');

// ── F. 걷기↔멈춤 반복 (ponder/⏸ 모사): 걷5s→멈4s 사이클 6회 후 걷기
{
  const { rig, wrapper, scene3 } = await freshRig();
  const log = [];
  let t = 0;
  const frame = (mv) => { t += dt; rig.update(dt, 0.5, mv, t, mv ? WALK * dt : 0); scene3.updateMatrixWorld(true); log.push(wrapper.position.y); };
  for (let c = 0; c < 6; c++) { for (let i = 0; i < 300; i++) frame(true); for (let i = 0; i < 240; i++) frame(false); }
  for (let i = 0; i < 600; i++) frame(true);
  const seg = log.slice(-120);
  console.log('F 걷↔멈 6회 후 걷기     root.y', stats(log, log.length - 600), ' 걷는 중 최대:', Math.max(...log.slice(600)).toFixed(3));
}

// ── G. 짧은 전환 난타: 1s 걷기 / 0.5s 멈춤 × 40 (페이드 0.32~0.45s와 겹치는 영역)
{
  const { rig, wrapper, scene3 } = await freshRig();
  const log = [];
  let t = 0;
  const frame = (mv) => { t += dt; rig.update(dt, 0.5, mv, t, mv ? WALK * dt : 0); scene3.updateMatrixWorld(true); log.push(wrapper.position.y); };
  for (let c = 0; c < 40; c++) { for (let i = 0; i < 60; i++) frame(true); for (let i = 0; i < 30; i++) frame(false); }
  console.log('G 1s걷/0.5s멈 ×40      root.y', stats(log, 300), ' 전체 최대:', Math.max(...log.slice(300)).toFixed(3));
}

// ── H. 탑승(riding 동결) 중 부모 lift 상승 + 하차 직후 즉시 걷기 — groundCorr 잔존 확인
{
  const { rig, wrapper, lift, scene3 } = await freshRig();
  const log = [];
  let t = 0; let MVlift = 0;
  const frame = (mode) => {
    t += dt;
    MVlift += ((mode === 'ride' ? 1.15 : 0) - MVlift) * Math.min(1, dt * 1.7);
    lift.position.y = MVlift;
    rig.update(dt, 0.5, true, t, WALK * (mode === 'ride' ? 2.6 : 1) * dt);
    scene3.updateMatrixWorld(true);
    log.push(wrapper.position.y + lift.position.y); // 월드 기준 (lift 포함)
  };
  for (let i = 0; i < 300; i++) frame('walk');
  const preRide = log[log.length - 1];
  rig.setRiding(true);
  for (let i = 0; i < 600; i++) frame('ride');
  rig.setRiding(false);
  for (let i = 0; i < 900; i++) frame('walk');
  console.log('H 탑승동결+하차 즉걷     탑승 전:', preRide.toFixed(3), ' 탑승 말미:', log[898].toFixed(3), ' 하차 15s 후:', log[log.length - 1].toFixed(3));
}
