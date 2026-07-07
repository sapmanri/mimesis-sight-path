// BUILD 210 수사 벤치 — VRoid 좀비 팔: per-bone rest 오프셋 보정 월드델타, 곱 순서 격자
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { readFileSync } from 'fs';

// ---- GLB 텍스처 스트립 로더 (헤드리스: 이미지 디코드 불가 → JSON 청크에서 제거) ----
function stripGLB(path) {
  const buf = readFileSync(path);
  const jsonLen = buf.readUInt32LE(12);
  const json = JSON.parse(buf.toString('utf8', 20, 20 + jsonLen));
  delete json.images; delete json.textures; delete json.samplers;
  if (json.materials) json.materials = json.materials.map(() => ({ pbrMetallicRoughness: {} }));
  (json.meshes ?? []).forEach(m => m.primitives.forEach(p => { delete p.material; }));
  const jstr = Buffer.from(JSON.stringify(json).padEnd(Math.ceil(JSON.stringify(json).length / 4) * 4, ' '));
  const binChunkOff = 20 + jsonLen;
  const rest = buf.subarray(binChunkOff); // BIN 청크 (len+type+data)
  const total = 12 + 8 + jstr.length + rest.length;
  const out = Buffer.alloc(total);
  buf.copy(out, 0, 0, 12); out.writeUInt32LE(total, 8);
  out.writeUInt32LE(jstr.length, 12); out.writeUInt32LE(0x4E4F534A, 16); jstr.copy(out, 20);
  rest.copy(out, 20 + jstr.length);
  return out;
}
function loadGLB(path) {
  return new Promise((res, rej) => {
    const ab = stripGLB(path);
    new GLTFLoader().parse(ab.buffer.slice(ab.byteOffset, ab.byteOffset + ab.byteLength), '', res, rej);
  });
}

const MIX2VROID = {
  mixamorigHips: 'J_Bip_C_Hips', mixamorigSpine: 'J_Bip_C_Spine', mixamorigSpine1: 'J_Bip_C_Chest',
  mixamorigSpine2: 'J_Bip_C_UpperChest', mixamorigNeck: 'J_Bip_C_Neck', mixamorigHead: 'J_Bip_C_Head',
  mixamorigLeftShoulder: 'J_Bip_L_Shoulder', mixamorigLeftArm: 'J_Bip_L_UpperArm', mixamorigLeftForeArm: 'J_Bip_L_LowerArm', mixamorigLeftHand: 'J_Bip_L_Hand',
  mixamorigRightShoulder: 'J_Bip_R_Shoulder', mixamorigRightArm: 'J_Bip_R_UpperArm', mixamorigRightForeArm: 'J_Bip_R_LowerArm', mixamorigRightHand: 'J_Bip_R_Hand',
  mixamorigLeftUpLeg: 'J_Bip_L_UpperLeg', mixamorigLeftLeg: 'J_Bip_L_LowerLeg', mixamorigLeftFoot: 'J_Bip_L_Foot', mixamorigLeftToeBase: 'J_Bip_L_ToeBase',
  mixamorigRightUpLeg: 'J_Bip_R_UpperLeg', mixamorigRightLeg: 'J_Bip_R_LowerLeg', mixamorigRightFoot: 'J_Bip_R_Foot', mixamorigRightToeBase: 'J_Bip_R_ToeBase',
};
const MIXBONES = Object.keys(MIX2VROID);

// ---- 계측: 클립을 씬에 물리고 FK로 걷기 지표 실측 ----
const REST_SNAP = new WeakMap();
function snapRest(scene) {
  const snap = [];
  scene.traverse((o) => snap.push([o, o.position.clone(), o.quaternion.clone(), o.scale.clone()]));
  REST_SNAP.set(scene, snap);
}
function restoreRest(scene) {
  const snap = REST_SNAP.get(scene);
  if (snap) for (const [o, p, q, sc] of snap) { o.position.copy(p); o.quaternion.copy(q); o.scale.copy(sc); }
}
function measure(scene, clip, names /* {hips,head,handL,handR,shL,shR,footL,footR,toeL,toeR} */) {
  if (!REST_SNAP.has(scene)) snapRest(scene);
  restoreRest(scene);
  const mixer = new THREE.AnimationMixer(scene);
  mixer.clipAction(clip).play();
  const get = (n) => scene.getObjectByName(n);
  const b = Object.fromEntries(Object.entries(names).map(([k, n]) => [k, get(n)]));
  for (const [k, o] of Object.entries(b)) if (!o) throw new Error(`bone missing: ${k}`);
  scene.updateMatrixWorld(true);
  const wp = (o) => new THREE.Vector3().setFromMatrixPosition(o.matrixWorld);
  const restDist = wp(b.head).sub(wp(b.hips)).length();
  const hipsRestY = wp(b.hips).y;
  const N = 40; const dur = clip.duration;
  let upSum = 0, handSum = 0, latSum = 0, elbSum = 0, hangSum = 0, fzMin = Infinity, fzMax = -Infinity, toeF0 = 0;
  const up = new THREE.Vector3(0, 1, 0);
  for (let i = 0; i < N; i += 1) {
    mixer.setTime((i / N) * dur * 0.999);
    scene.updateMatrixWorld(true);
    const hips = wp(b.hips), head = wp(b.head);
    upSum += head.clone().sub(hips).normalize().dot(up);
    const right = wp(b.shR).sub(wp(b.shL)).setY(0).normalize();
    const fwd = new THREE.Vector3().crossVectors(up, right).normalize();
    const hand = wp(b.handL).add(wp(b.handR)).multiplyScalar(0.5).sub(hips);
    handSum += hand.dot(fwd) / restDist;
    const fz = wp(b.footL).sub(hips).dot(fwd);
    const fz2 = wp(b.footR).sub(hips).dot(fwd);
    fzMin = Math.min(fzMin, fz, fz2); fzMax = Math.max(fzMax, fz, fz2);
    if (i === 0) toeF0 = wp(b.toeL).add(wp(b.toeR)).multiplyScalar(0.5).sub(hips).z;
    // 측면 손 거리(몸 뚫기 감지) + 팔꿈치 굽힘 방향(전완이 뒤/앞 어느 쪽으로 꺾이나)
    latSum += (Math.abs(wp(b.handL).sub(hips).dot(right)) + Math.abs(wp(b.handR).sub(hips).dot(right))) / 2 / restDist;
    elbSum += (wp(b.handL).sub(wp(b.elbL)).dot(fwd) + wp(b.handR).sub(wp(b.elbR)).dot(fwd)) / 2 / restDist;
    // 팔걸이: 상완(어깨→팔꿈치)이 아래를 향하는 정도. 걷기 = 1 근처, T포즈 = 0 근처
    const dn = new THREE.Vector3(0, -1, 0);
    hangSum += (wp(b.elbL).sub(wp(b.shL)).normalize().dot(dn) + wp(b.elbR).sub(wp(b.shR)).normalize().dot(dn)) / 2;
  }
  const hh = (handSum / N) * restDist / hipsRestY; // 손-힙, 힙높이 정규화 (인계서 정답지 규격)
  return { upright: upSum / N, handHipH: hh, footAmpAbs: fzMax - fzMin, handLat: latSum / N, armHang: hangSum / N, elbowFwdH: (elbSum / N) * restDist / hipsRestY, toeZ0: toeF0, restDist, hipsRestY };
}

const VNAMES = { hips: 'J_Bip_C_Hips', head: 'J_Bip_C_Head', handL: 'J_Bip_L_Hand', handR: 'J_Bip_R_Hand', elbL: 'J_Bip_L_LowerArm', elbR: 'J_Bip_R_LowerArm', shL: 'J_Bip_L_UpperArm', shR: 'J_Bip_R_UpperArm', footL: 'J_Bip_L_Foot', footR: 'J_Bip_R_Foot', toeL: 'J_Bip_L_ToeBase', toeR: 'J_Bip_R_ToeBase' };
const MNAMES = { hips: 'mixamorigHips', head: 'mixamorigHead', handL: 'mixamorigLeftHand', handR: 'mixamorigRightHand', elbL: 'mixamorigLeftForeArm', elbR: 'mixamorigRightForeArm', shL: 'mixamorigLeftArm', shR: 'mixamorigRightArm', footL: 'mixamorigLeftFoot', footR: 'mixamorigRightFoot', toeL: 'mixamorigLeftToeBase', toeR: 'mixamorigRightToeBase' };

const donorG = await loadGLB('public/assets/models/Hiker.glb');
const vroidG = await loadGLB('public/assets/models/Vroid01.glb');
const srcClip = donorG.animations.find(a => /mixamo|walk/i.test(a.name)) ?? donorG.animations[0];

// ---- 정답지: 기증자 원본 실측 ----
const ref = measure(donorG.scene, srcClip, MNAMES);
console.log('[정답지 Hiker]', JSON.stringify(ref, (k, v) => typeof v === 'number' ? +v.toFixed(3) : v));

// ---- 기증자 FK 샘플링: 매핑 24본의 rest 월드쿼트 + t별 월드쿼트 ----
const dscene = donorG.scene;
dscene.updateMatrixWorld(true);
const restW = {}; // 월드 rest
for (const n of MIXBONES) { const o = dscene.getObjectByName(n); if (o) restW[n] = o.getWorldQuaternion(new THREE.Quaternion()); }
const N = 40; const dur = srcClip.duration;
const mixer = new THREE.AnimationMixer(dscene);
mixer.clipAction(srcClip).play();
const worldT = MIXBONES.map(() => []); // [boneIdx][frame] Quaternion
const hipPosT = [];
const times = [];
for (let i = 0; i < N; i += 1) {
  const t = (i / N) * dur * 0.999; times.push(t);
  mixer.setTime(t); dscene.updateMatrixWorld(true);
  MIXBONES.forEach((n, bi) => { const o = dscene.getObjectByName(n); if (o) worldT[bi].push(o.getWorldQuaternion(new THREE.Quaternion())); });
  const hip = dscene.getObjectByName('mixamorigHips');
  hipPosT.push(new THREE.Vector3().setFromMatrixPosition(hip.matrixWorld));
}

// ---- VRoid 계보: 매핑 타깃 뼈의 최근접 매핑 조상 ----
const vscene = vroidG.scene; vscene.updateMatrixWorld(true);
const V2MIX = Object.fromEntries(Object.entries(MIX2VROID).map(([a, b]) => [b, a]));
const parentOf = {}; // vroid name -> nearest mapped ancestor vroid name (or null for hips)
for (const vn of Object.values(MIX2VROID)) {
  let p = vscene.getObjectByName(vn)?.parent;
  while (p && !V2MIX[p.name]) p = p.parent;
  parentOf[vn] = p ? p.name : null;
}

// VRoid 힙 rest / 기증자 힙 rest 스케일
const vHipY = Math.abs(vscene.getObjectByName('J_Bip_C_Hips').position.y);
const dHipObj = dscene.getObjectByName('mixamorigHips');
// 기증자 힙 rest는 클립 밖 기준 — 로컬 rest y를 월드 스케일 포함해 측정: rest 상태 재현이 번거로우니 힙 position 트랙 t0 값 기준으로 스케일
const hipTrack = srcClip.tracks.find(tr => tr.name === 'mixamorigHips.position');
const dHipRestY = 3.189; // 인계서 실측값
const hipScale = vHipY / dHipRestY;

const yFlip = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI);

// ---- 뼈 방향 정렬표: A_bone = (타깃 rest 월드 방향 → 기증자 rest 월드 방향) 회전 ----
const CHAIN_CHILD = {
  mixamorigHips: 'mixamorigSpine', mixamorigSpine: 'mixamorigSpine1', mixamorigSpine1: 'mixamorigSpine2',
  mixamorigSpine2: 'mixamorigNeck', mixamorigNeck: 'mixamorigHead',
  mixamorigLeftShoulder: 'mixamorigLeftArm', mixamorigLeftArm: 'mixamorigLeftForeArm', mixamorigLeftForeArm: 'mixamorigLeftHand',
  mixamorigRightShoulder: 'mixamorigRightArm', mixamorigRightArm: 'mixamorigRightForeArm', mixamorigRightForeArm: 'mixamorigRightHand',
  mixamorigLeftUpLeg: 'mixamorigLeftLeg', mixamorigLeftLeg: 'mixamorigLeftFoot', mixamorigLeftFoot: 'mixamorigLeftToeBase',
  mixamorigRightUpLeg: 'mixamorigRightLeg', mixamorigRightLeg: 'mixamorigRightFoot', mixamorigRightFoot: 'mixamorigRightToeBase',
};
function restDirs(scene, isDonor) {
  const wp = (o) => new THREE.Vector3().setFromMatrixPosition(o.matrixWorld);
  const name = (mn) => isDonor ? mn : MIX2VROID[mn];
  const out = {};
  for (const mn of MIXBONES) {
    const o = scene.getObjectByName(name(mn));
    const cm = CHAIN_CHILD[mn];
    let d;
    if (cm) d = wp(scene.getObjectByName(name(cm))).sub(wp(o));
    else d = wp(o).sub(wp(o.parent)); // 말단(Head/Hand/ToeBase): 들어오는 방향
    out[mn] = d.normalize();
  }
  return out;
}
const srcDirs = restDirs(dscene, true);
const tgtDirs = restDirs(vscene, false);
const ALIGN = {};
for (const mn of MIXBONES) ALIGN[mn] = new THREE.Quaternion().setFromUnitVectors(tgtDirs[mn], srcDirs[mn]);
// 계층 정렬: 부모 A를 상속하고 방향만 최소 회전으로 보정 — 체인 비틀림 일관성
const MIX_PARENT = {};
{
  const inv = Object.fromEntries(Object.entries(CHAIN_CHILD).map(([p, c]) => [c, p]));
  // 체인 밖 연결: Shoulder/UpLeg의 부모, Head/Hand/ToeBase는 inv로 잡힘
  MIX_PARENT.mixamorigLeftShoulder = 'mixamorigSpine2'; MIX_PARENT.mixamorigRightShoulder = 'mixamorigSpine2';
  MIX_PARENT.mixamorigLeftUpLeg = 'mixamorigHips'; MIX_PARENT.mixamorigRightUpLeg = 'mixamorigHips';
  for (const [c, p] of Object.entries(inv)) if (!MIX_PARENT[c]) MIX_PARENT[c] = p;
}
const HALIGN = {};
{
  const order = [...MIXBONES].sort((a, b) => (a === 'mixamorigHips' ? -1 : b === 'mixamorigHips' ? 1 : 0));
  const done = new Set();
  const solve = (mn) => {
    if (done.has(mn)) return;
    const p = MIX_PARENT[mn];
    if (p && !done.has(p)) solve(p);
    if (!p) HALIGN[mn] = new THREE.Quaternion().setFromUnitVectors(tgtDirs[mn], srcDirs[mn]);
    else {
      const pre = tgtDirs[mn].clone().applyQuaternion(HALIGN[p]).normalize();
      HALIGN[mn] = new THREE.Quaternion().setFromUnitVectors(pre, srcDirs[mn]).multiply(HALIGN[p]);
    }
    done.add(mn);
  };
  for (const mn of order) solve(mn);
}

// ---- 후보 굽기: variant 'L' = worldQ(t)×inv(rest), 'R' = inv(rest)×worldQ(t) / hipFlip on/off ----
function bake(variant, hipFlip) {
  // delta[bone][frame] 월드델타 → 타깃 월드로 간주 (타깃 rest 월드 = identity)
  const delta = MIXBONES.map((n, bi) => worldT[bi].map(q => {
    if (variant === 'L') return q.clone().multiply(restW[n].clone().invert());
    if (variant === 'R') return restW[n].clone().invert().multiply(q);
    // 'W': 절대 월드 방향 복사 — worldQ_src(t) × inv(restW_src) × A_bone
    if (variant === 'W') return q.clone().multiply(restW[n].clone().invert()).multiply(ALIGN[n]);
    // 'H': 계층 정렬판
    return q.clone().multiply(restW[n].clone().invert()).multiply(HALIGN[n]);
  }));
  const idx = Object.fromEntries(MIXBONES.map((n, i) => [n, i]));
  const tracks = [];
  for (const [mn, vn] of Object.entries(MIX2VROID)) {
    const bi = idx[mn];
    const pvn = parentOf[vn];
    const vals = new Float32Array(N * 4);
    for (let f = 0; f < N; f += 1) {
      let qw = delta[bi][f].clone();
      if (hipFlip) qw = yFlip.clone().multiply(qw); // 전 뼈 월드에 yFlip 공통 적용 (로컬 분해에서 힙에만 남음)
      let local;
      if (!pvn) local = qw;
      else {
        let pw = delta[idx[V2MIX[pvn]]][f].clone();
        if (hipFlip) pw = yFlip.clone().multiply(pw);
        local = pw.invert().multiply(qw);
      }
      local.toArray(vals, f * 4);
    }
    tracks.push(new THREE.QuaternionKeyframeTrack(`${vn}.quaternion`, times.slice(), Array.from(vals)));
  }
  // 힙 위치: 기증자 힙 월드 위치 실측 × 스케일 (yFlip이면 x,z 반전)
  const pvals = new Float32Array(N * 3);
  for (let f = 0; f < N; f += 1) {
    const p = hipPosT[f];
    const sx = hipFlip ? -1 : 1;
    pvals[f * 3] = p.x * hipScale * sx;
    pvals[f * 3 + 1] = p.y * hipScale;
    pvals[f * 3 + 2] = p.z * hipScale * sx;
  }
  tracks.push(new THREE.VectorKeyframeTrack('J_Bip_C_Hips.position', times.slice(), Array.from(pvals)));
  return new THREE.AnimationClip(`ret_${variant}_${hipFlip ? 'flip' : 'noflip'}`, dur, tracks);
}

for (const variant of ['W', 'H']) {
  for (const hipFlip of [false, true]) {
    const clip = bake(variant, hipFlip);
    const m = measure(vscene, clip, VNAMES);
    const clipName = clip.name;
    const pass = m.upright >= 0.9 && m.footAmpAbs >= 0.2 && m.footAmpAbs <= 1.6 && m.handHipH >= -0.1 && m.handHipH <= 0.15 && m.armHang >= 0.7 && (clipName.includes('flip') ? m.toeZ0 > 0 : true);
    console.log(`[${clip.name}]`, JSON.stringify(m, (k, v) => typeof v === 'number' ? +v.toFixed(3) : v), pass ? '★★★ 합격' : '불합격');
  }
}
