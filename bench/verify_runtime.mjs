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


const ref = measure(donorG.scene, srcClip, MNAMES);
console.log('[정답지]', JSON.stringify(ref, (k,v)=>typeof v==='number'?+v.toFixed(3):v));
// --- worldCore BUILD 210 블록 복제 (donorRest=donor scene 새 로드, gltf.scene=vroid) ---
const donorRest = (await loadGLB('public/assets/models/Hiker.glb')).scene;
donorRest.updateMatrixWorld(true);
const gltf = vroidG; gltf.scene.updateMatrixWorld(true);
const hipsRestYf = (sceneRoot) => { let y = 0; sceneRoot.traverse((o) => { if (!y && /Hips$/.test(o.name)) y = Math.abs(o.position.y); }); return y || 1; };
const hipScale = hipsRestYf(gltf.scene) / hipsRestYf(donorRest);
// (MIXBONES는 위에서 선언됨)
      // 체인 방향(뼈→주 자식). 말단(Head/Hand/ToeBase)은 부모→뼈로 들어오는 방향.
      const CHAIN_CHILD = {
        mixamorigHips: 'mixamorigSpine', mixamorigSpine: 'mixamorigSpine1', mixamorigSpine1: 'mixamorigSpine2',
        mixamorigSpine2: 'mixamorigNeck', mixamorigNeck: 'mixamorigHead',
        mixamorigLeftShoulder: 'mixamorigLeftArm', mixamorigLeftArm: 'mixamorigLeftForeArm', mixamorigLeftForeArm: 'mixamorigLeftHand',
        mixamorigRightShoulder: 'mixamorigRightArm', mixamorigRightArm: 'mixamorigRightForeArm', mixamorigRightForeArm: 'mixamorigRightHand',
        mixamorigLeftUpLeg: 'mixamorigLeftLeg', mixamorigLeftLeg: 'mixamorigLeftFoot', mixamorigLeftFoot: 'mixamorigLeftToeBase',
        mixamorigRightUpLeg: 'mixamorigRightLeg', mixamorigRightLeg: 'mixamorigRightFoot', mixamorigRightFoot: 'mixamorigRightToeBase',
      };
      const wpos = (o) => new THREE.Vector3().setFromMatrixPosition(o.matrixWorld);
      const restDirOf = (root, isDonor, mn) => {
        const nm = isDonor ? mn : MIX2VROID[mn];
        const o = root.getObjectByName(nm);
        if (!o) return null;
        const cm = CHAIN_CHILD[mn];
        const co = cm ? root.getObjectByName(isDonor ? cm : MIX2VROID[cm]) : null;
        const d = co ? wpos(co).sub(wpos(o)) : wpos(o).sub(wpos(o.parent));
        return d.lengthSq() > 1e-10 ? d.normalize() : null;
      };
      // rest 정렬 A + rest 월드쿼트 (둘 다 애니 전 rest에서)
      const ALIGN = {};
      const restWInv = {};
      for (const mn of MIXBONES) {
        const ds = restDirOf(donorRest, true, mn);
        const dt = restDirOf(gltf.scene, false, mn);
        const o = donorRest.getObjectByName(mn);
        if (!ds || !dt || !o) continue;
        ALIGN[mn] = new THREE.Quaternion().setFromUnitVectors(dt, ds);
        restWInv[mn] = o.getWorldQuaternion(new THREE.Quaternion()).invert();
      }
      // 타깃(VRoid) 최근접 매핑 조상 — 로컬 분해용
      const V2MIX = {};
      for (const [a, b] of Object.entries(MIX2VROID)) V2MIX[b] = a;
      const mappedParent = {};
      for (const vn of Object.values(MIX2VROID)) {
        let p = gltf.scene.getObjectByName(vn)?.parent ?? null;
        while (p && !V2MIX[p.name]) p = p.parent;
        mappedParent[vn] = p ? p.name : null;
      }
      // 기증자 FK 샘플링 (30fps 그리드 — Idle subclip 프레임 규격 유지)
      const fps = 30;
      const N = Math.max(2, Math.round(srcClip.duration * fps));
      const mixer = new THREE.AnimationMixer(donorRest);
      mixer.clipAction(srcClip).play();
      const worldQ = Object.fromEntries(MIXBONES.map((n) => [n, []]));
      const hipPos = [];
      const times = [];
      for (let i = 0; i < N; i += 1) {
        const t = Math.min(i / fps, srcClip.duration * 0.999);
        times.push(t);
        mixer.setTime(t);
        donorRest.updateMatrixWorld(true);
        for (const mn of MIXBONES) {
          const o = donorRest.getObjectByName(mn);
          if (o && restWInv[mn]) worldQ[mn].push(o.getWorldQuaternion(new THREE.Quaternion()));
        }
        const hip = donorRest.getObjectByName('mixamorigHips');
        if (hip) hipPos.push(wpos(hip));
      }
      const yFlip = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI);
      // q_world_tgt(t) = yFlip × worldQ_src(t) × inv(restW_src) × A  (yFlip은 로컬 분해에서 힙에만 남는다)
      const qwAt = (mn, f) => yFlip.clone().multiply(worldQ[mn][f]).multiply(restWInv[mn]).multiply(ALIGN[mn]);
      const tracks = [];
      for (const [mn, vn] of Object.entries(MIX2VROID)) {
        if (!restWInv[mn] || worldQ[mn].length !== N) continue;
        const pvn = mappedParent[vn];
        const pmn = pvn ? V2MIX[pvn] : null;
        const vals = new Float32Array(N * 4);
        for (let f = 0; f < N; f += 1) {
          const qw = qwAt(mn, f);
          const local = pmn && restWInv[pmn] ? qwAt(pmn, f).invert().multiply(qw) : qw;
          local.toArray(vals, f * 4);
        }
        tracks.push(new THREE.QuaternionKeyframeTrack(`${vn}.quaternion`, times.slice(), Array.from(vals)));
      }
      if (hipPos.length === N) {
        const pvals = new Float32Array(N * 3);
        for (let f = 0; f < N; f += 1) {
          pvals[f * 3] = -hipPos[f].x * hipScale; // yFlip = x,z 반전
          pvals[f * 3 + 1] = hipPos[f].y * hipScale;
          pvals[f * 3 + 2] = -hipPos[f].z * hipScale;
        }
        tracks.push(new THREE.VectorKeyframeTrack('J_Bip_C_Hips.position', times.slice(), Array.from(pvals)));
      }
      
const outClip = new THREE.AnimationClip(srcClip.name, srcClip.duration, tracks);
const m = measure(vroidG.scene, outClip, VNAMES);
const pass = m.upright >= 0.9 && m.footAmpAbs >= 0.2 && m.footAmpAbs <= 1.6 && m.handHipH >= -0.1 && m.handHipH <= 0.15 && m.armHang >= 0.7 && m.toeZ0 > 0;
console.log('[런타임 복제]', JSON.stringify(m, (k,v)=>typeof v==='number'?+v.toFixed(3):v), pass ? '★★★ 합격' : '불합격');
