import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { readFileSync } from 'fs';
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
const loadGLB = (p) => new Promise((res, rej) => { const ab = stripGLB(p); new GLTFLoader().parse(ab.buffer.slice(ab.byteOffset, ab.byteOffset + ab.byteLength), '', res, rej); });

const g = await loadGLB('/tmp/Girl1.glb');
const S = g.scene;
S.updateMatrixWorld(true);
console.log('클립:', g.animations.map((a) => `${a.name}(${a.duration.toFixed(1)}s)`).join(' '));
const B = (n) => S.getObjectByName(n);
const wp = (o) => new THREE.Vector3().setFromMatrixPosition(o.matrixWorld);
const hips = B('J_Bip_C_Hips'), head = B('J_Bip_C_Head'), handL = B('J_Bip_L_Hand'), footL = B('J_Bip_L_ToeBase'), footR = B('J_Bip_R_ToeBase');
const height0 = wp(head).y - Math.min(wp(footL).y, wp(footR).y);
for (const nm of ['Walking', 'Running', 'Idle', 'Sitting']) {
  const clip = g.animations.find((a) => a.name === nm);
  const mixer = new THREE.AnimationMixer(S);
  const act = mixer.clipAction(clip); act.play();
  let upMin = 9, handHipMax = 0, footAmp = 0, hipXZmax = 0, footMinY = 9, footMaxY = -9, hipYavg = 0;
  const Nf = 60;
  for (let i = 0; i < Nf; i += 1) {
    mixer.setTime((i / Nf) * clip.duration * 0.999);
    S.updateMatrixWorld(true);
    const hh = wp(head).y - wp(hips).y;
    upMin = Math.min(upMin, hh / (height0 * 0.45)); // 직립도: 머리-힙 수직거리 정규화
    handHipMax = Math.max(handHipMax, wp(handL).distanceTo(wp(hips)));
    const fl = wp(footL), fr = wp(footR);
    footAmp = Math.max(footAmp, Math.abs(fl.z - fr.z) + Math.abs(fl.x - fr.x));
    footMinY = Math.min(footMinY, fl.y, fr.y); footMaxY = Math.max(footMaxY, fl.y, fr.y);
    const hp = wp(hips);
    hipXZmax = Math.max(hipXZmax, Math.hypot(hp.x, hp.z));
    hipYavg += hp.y / Nf;
  }
  mixer.stopAllAction();
  console.log(`${nm.padEnd(8)} 직립 ${upMin.toFixed(2)}  손-힙max ${handHipMax.toFixed(2)}  발벌림max ${footAmp.toFixed(2)}  발y [${footMinY.toFixed(2)}~${footMaxY.toFixed(2)}]  힙xz드리프트max ${hipXZmax.toFixed(2)}  힙y평균 ${hipYavg.toFixed(2)}`);
}
