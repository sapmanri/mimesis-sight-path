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
const load = (p) => new Promise((res, rej) => { const ab = stripGLB(p); new GLTFLoader().parse(ab.buffer.slice(ab.byteOffset, ab.byteOffset + ab.byteLength), '', res, rej); });
const dir = (s, a, b) => {
  const A = s.getObjectByName(a), B = s.getObjectByName(b);
  const pa = new THREE.Vector3().setFromMatrixPosition(A.matrixWorld);
  const pb = new THREE.Vector3().setFromMatrixPosition(B.matrixWorld);
  return pb.sub(pa).normalize().toArray().map(v => +v.toFixed(3));
};
const d = await load('public/assets/models/Hiker.glb');
d.scene.updateMatrixWorld(true);
console.log('Hiker rest 좌상완(어깨→팔꿈치):', dir(d.scene, 'mixamorigLeftArm', 'mixamorigLeftForeArm'));
console.log('Hiker rest 우상완:', dir(d.scene, 'mixamorigRightArm', 'mixamorigRightForeArm'));
console.log('Hiker rest 좌대퇴(힙→무릎):', dir(d.scene, 'mixamorigLeftUpLeg', 'mixamorigLeftLeg'));
const v = await load('public/assets/models/Vroid01.glb');
v.scene.updateMatrixWorld(true);
console.log('VRoid rest 좌상완:', dir(v.scene, 'J_Bip_L_UpperArm', 'J_Bip_L_LowerArm'));
console.log('VRoid rest 우상완:', dir(v.scene, 'J_Bip_R_UpperArm', 'J_Bip_R_LowerArm'));
console.log('VRoid rest 좌대퇴:', dir(v.scene, 'J_Bip_L_UpperLeg', 'J_Bip_L_LowerLeg'));
