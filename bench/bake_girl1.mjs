// 입력: 믹사모 FBX→GLB 변환본(glb/ 폴더, FBX2glTF -b) + Vroid01.glb. npm i three @gltf-transform/core @gltf-transform/functions @gltf-transform/extensions 필요.
// Girl1 베이커 — 본토 worldCore BUILD 210 "rest 방향 정렬 월드 복사"를 오프라인으로.
// 입력: Vroid01.glb(텍스처 임베드 몸) + 믹사모 클립 GLB 9종(mixamorig)
// 출력: /tmp/Girl1.glb (VRoid 골격 로컬 트랙 9클립 내장) + clipSpeeds 실측치
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { readFileSync } from 'fs';

// ── 헤드리스 GLB 로더 (bench 계보)
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
const byName = (root, nm) => root.getObjectByName(nm) ?? root.getObjectByName(nm.replace(/:/g, '')); // three는 콜론을 제거한다
const loadGLB = (p) => new Promise((res, rej) => {
  const ab = stripGLB(p);
  new GLTFLoader().parse(ab.buffer.slice(ab.byteOffset, ab.byteOffset + ab.byteLength), '', res, rej);
});

const MIX2VROID = {
  'mixamorig:Hips': 'J_Bip_C_Hips', 'mixamorig:Spine': 'J_Bip_C_Spine', 'mixamorig:Spine1': 'J_Bip_C_Chest',
  'mixamorig:Spine2': 'J_Bip_C_UpperChest', 'mixamorig:Neck': 'J_Bip_C_Neck', 'mixamorig:Head': 'J_Bip_C_Head',
  'mixamorig:LeftShoulder': 'J_Bip_L_Shoulder', 'mixamorig:LeftArm': 'J_Bip_L_UpperArm', 'mixamorig:LeftForeArm': 'J_Bip_L_LowerArm', 'mixamorig:LeftHand': 'J_Bip_L_Hand',
  'mixamorig:RightShoulder': 'J_Bip_R_Shoulder', 'mixamorig:RightArm': 'J_Bip_R_UpperArm', 'mixamorig:RightForeArm': 'J_Bip_R_LowerArm', 'mixamorig:RightHand': 'J_Bip_R_Hand',
  'mixamorig:LeftUpLeg': 'J_Bip_L_UpperLeg', 'mixamorig:LeftLeg': 'J_Bip_L_LowerLeg', 'mixamorig:LeftFoot': 'J_Bip_L_Foot', 'mixamorig:LeftToeBase': 'J_Bip_L_ToeBase',
  'mixamorig:RightUpLeg': 'J_Bip_R_UpperLeg', 'mixamorig:RightLeg': 'J_Bip_R_LowerLeg', 'mixamorig:RightFoot': 'J_Bip_R_Foot', 'mixamorig:RightToeBase': 'J_Bip_R_ToeBase',
};
const MIXBONES = Object.keys(MIX2VROID);
const CHAIN_CHILD = {
  'mixamorig:Hips': 'mixamorig:Spine', 'mixamorig:Spine': 'mixamorig:Spine1', 'mixamorig:Spine1': 'mixamorig:Spine2',
  'mixamorig:Spine2': 'mixamorig:Neck', 'mixamorig:Neck': 'mixamorig:Head',
  'mixamorig:LeftShoulder': 'mixamorig:LeftArm', 'mixamorig:LeftArm': 'mixamorig:LeftForeArm', 'mixamorig:LeftForeArm': 'mixamorig:LeftHand',
  'mixamorig:RightShoulder': 'mixamorig:RightArm', 'mixamorig:RightArm': 'mixamorig:RightForeArm', 'mixamorig:RightForeArm': 'mixamorig:RightHand',
  'mixamorig:LeftUpLeg': 'mixamorig:LeftLeg', 'mixamorig:LeftLeg': 'mixamorig:LeftFoot', 'mixamorig:LeftFoot': 'mixamorig:LeftToeBase',
  'mixamorig:RightUpLeg': 'mixamorig:RightLeg', 'mixamorig:RightLeg': 'mixamorig:RightFoot', 'mixamorig:RightFoot': 'mixamorig:RightToeBase',
};
const CLIPS = [
  ['Idle', 'Idle'],
  ['Walking', 'Walking'],
  ['Running', 'Running'],
  ['Picking Up', 'PickUp'],
  ['Sitting', 'Sitting'],
  ['Yawn', 'Yawn'],
  ['Samba Dancing', 'Dance_Samba'],
  ['Booty Hip Hop Dance', 'Dance_HipHop'],
  ['Dancing Running Man', 'Dance_RunningMan'],
];

// ── 타깃(VRoid) rest
const tgt = await loadGLB('/home/claude/mimesis-sight-path/public/assets/models/Vroid01.glb');
const T = tgt.scene;
T.updateMatrixWorld(true);
const hipsRestY = (root) => { let y = 0; root.traverse((o) => { if (!y && /Hips$/.test(o.name)) y = Math.abs(o.position.y); }); return y || 1; };
const wpos = (o) => new THREE.Vector3().setFromMatrixPosition(o.matrixWorld);
const V2MIX = Object.fromEntries(Object.entries(MIX2VROID).map(([a, b]) => [b, a]));
const mappedParent = {};
for (const vn of Object.values(MIX2VROID)) {
  let p = T.getObjectByName(vn)?.parent ?? null;
  while (p && !V2MIX[p.name]) p = p.parent;
  mappedParent[vn] = p ? p.name : null;
}
const yFlip = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI);

const baked = []; // { name, duration, times, tracks: {vn: Float32Array quats}, hips: Float32Array }
const speeds = {};

for (const [file, outName] of CLIPS) {
  const donor = await loadGLB(`glb/${file}.glb`);
  const D = donor.scene;
  D.updateMatrixWorld(true);
  const clip = donor.animations[0];
  if (!clip) { console.log(`SKIP ${file}: 클립 없음`); continue; }
  // rest 정렬 (rest 상태에서 — 믹서 재생 전)
  const restDirOf = (root, isDonor, mn) => {
    const nm = isDonor ? mn : MIX2VROID[mn];
    const o = byName(root, nm);
    if (!o) return null;
    const cm = CHAIN_CHILD[mn];
    const co = cm ? byName(root, isDonor ? cm : MIX2VROID[cm]) : null;
    const d = co ? wpos(co).sub(wpos(o)) : wpos(o).sub(wpos(o.parent));
    return d.lengthSq() > 1e-10 ? d.normalize() : null;
  };
  const ALIGN = {}, restWInv = {};
  for (const mn of MIXBONES) {
    const ds = restDirOf(D, true, mn);
    const dt = restDirOf(T, false, mn);
    const o = byName(D, mn);
    if (!ds || !dt || !o) continue;
    ALIGN[mn] = new THREE.Quaternion().setFromUnitVectors(dt, ds);
    restWInv[mn] = o.getWorldQuaternion(new THREE.Quaternion()).invert();
  }
  const hipScale = hipsRestY(T) / hipsRestY(D);
  // FK 샘플링 30fps
  const fps = 30;
  const N = Math.max(2, Math.round(clip.duration * fps));
  const mixer = new THREE.AnimationMixer(D);
  mixer.clipAction(clip).play();
  const worldQ = Object.fromEntries(MIXBONES.map((n) => [n, []]));
  const hipPos = [];
  const times = [];
  for (let i = 0; i < N; i += 1) {
    const t = Math.min(i / fps, clip.duration * 0.999);
    times.push(t);
    mixer.setTime(t);
    D.updateMatrixWorld(true);
    for (const mn of MIXBONES) {
      const o = byName(D, mn);
      if (o && restWInv[mn]) worldQ[mn].push(o.getWorldQuaternion(new THREE.Quaternion()));
    }
    const hip = byName(D, 'mixamorig:Hips');
    if (hip) hipPos.push(wpos(hip));
  }
  const qwAt = (mn, f) => yFlip.clone().multiply(worldQ[mn][f]).multiply(restWInv[mn]).multiply(ALIGN[mn]);
  const tracks = {};
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
    tracks[vn] = vals;
  }
  // 힙 위치 (yFlip: x,z 반전) + 루트모션 처리
  let hips = null;
  if (hipPos.length === N) {
    hips = new Float32Array(N * 3);
    for (let f = 0; f < N; f += 1) {
      hips[f * 3] = -hipPos[f].x * hipScale;
      hips[f * 3 + 1] = hipPos[f].y * hipScale;
      hips[f * 3 + 2] = -hipPos[f].z * hipScale;
    }
    // 드리프트 실측 (타깃 단위, 초당)
    const dx = hips[(N - 1) * 3] - hips[0];
    const dz = hips[(N - 1) * 3 + 2] - hips[2];
    const drift = Math.hypot(dx, dz);
    speeds[outName] = drift / clip.duration;
    // 선형 성분 제거 — 제자리 걸음 (본토 외길 어댑터 문법)
    const T2 = (times[N - 1] - times[0]) || 1;
    for (let i = 0; i < N; i += 1) {
      const k = (times[i] - times[0]) / T2;
      hips[i * 3] -= dx * k;
      hips[i * 3 + 2] -= dz * k;
    }
  }
  baked.push({ name: outName, duration: clip.duration, times: new Float32Array(times), tracks, hips });
  console.log(`베이크 ${outName.padEnd(16)} ${clip.duration.toFixed(2)}s ${N}f  드리프트 ${speeds[outName]?.toFixed(3) ?? '-'}u/s`);
}

// ── gltf-transform으로 원본 Vroid01(텍스처 보존)에 트랙 주입
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const doc = await io.read('/home/claude/mimesis-sight-path/public/assets/models/Vroid01.glb');
const root = doc.getRoot();
root.listAnimations().forEach((a) => a.dispose());
const buffer = root.listBuffers()[0];
const nodeByName = {};
root.listNodes().forEach((n) => { nodeByName[n.getName()] = n; });
for (const b of baked) {
  const anim = doc.createAnimation(b.name);
  const input = doc.createAccessor().setType('SCALAR').setArray(b.times).setBuffer(buffer);
  for (const [vn, vals] of Object.entries(b.tracks)) {
    const node = nodeByName[vn];
    if (!node) continue;
    const out = doc.createAccessor().setType('VEC4').setArray(vals).setBuffer(buffer);
    const smp = doc.createAnimationSampler().setInput(input).setOutput(out).setInterpolation('LINEAR');
    const ch = doc.createAnimationChannel().setTargetNode(node).setTargetPath('rotation').setSampler(smp);
    anim.addSampler(smp).addChannel(ch);
  }
  if (b.hips && nodeByName['J_Bip_C_Hips']) {
    const out = doc.createAccessor().setType('VEC3').setArray(b.hips).setBuffer(buffer);
    const smp = doc.createAnimationSampler().setInput(input).setOutput(out).setInterpolation('LINEAR');
    const ch = doc.createAnimationChannel().setTargetNode(nodeByName['J_Bip_C_Hips']).setTargetPath('translation').setSampler(smp);
    anim.addSampler(smp).addChannel(ch);
  }
}
await io.write('/tmp/Girl1.glb', doc);
console.log('\nGirl1.glb 작성 완료. clipSpeeds(타깃 단위/s):', JSON.stringify(speeds, null, 0));
