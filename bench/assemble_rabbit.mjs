// 토끼 로밍 GLB 조립 (BUILD 239). 입력: rabbit.zip의 클립 FBX들 → FBX2glTF -b → glb/. 각 클립이 몸+골격+텍스처 통짜라 리타겟 불요.
// 토끼 로밍 GLB — 각 클립 FBX가 같은 골격+몸을 담고 있다(리타겟 불요).
// Walk를 베이스로 삼고 Idle/Run/Jump/Eat/Wave 트랙을 이름으로 병합. 루트모션 제거 + 속도 실측.
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { prune } from '@gltf-transform/functions';

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const DIR = '/home/claude/rabbit/glb';
const base = await io.read(`${DIR}/_Walk.glb`);
base.getRoot().listAnimations()[0].setName('Walk');

const CLIPS = [['_Idle', 'Idle'], ['_Run', 'Run'], ['_Jump_01', 'Jump'], ['_Eat', 'Eat'], ['_Wave', 'Wave']];
const nodeByName = {};
base.getRoot().listNodes().forEach((n) => { nodeByName[n.getName()] = n; });
const buffer = base.getRoot().listBuffers()[0];

for (const [file, name] of CLIPS) {
  const d = await io.read(`${DIR}/${file}.glb`);
  const src = d.getRoot().listAnimations()[0];
  if (!src) { console.log('클립 없음:', file); continue; }
  const anim = base.createAnimation(name);
  const inCache = new Map();
  for (const ch of src.listChannels()) {
    const node = nodeByName[ch.getTargetNode()?.getName()];
    if (!node) continue;
    const smp = ch.getSampler();
    const ik = smp.getInput();
    let input = inCache.get(ik);
    if (!input) { input = base.createAccessor().setType('SCALAR').setArray(new Float32Array(ik.getArray())).setBuffer(buffer); inCache.set(ik, input); }
    const OutT = smp.getOutput().getArray().constructor;
    const out = base.createAccessor().setType(smp.getOutput().getType()).setArray(new OutT(smp.getOutput().getArray())).setBuffer(buffer);
    if (smp.getOutput().getNormalized()) out.setNormalized(true);
    const s2 = base.createAnimationSampler().setInput(input).setOutput(out).setInterpolation(smp.getInterpolation());
    const c2 = base.createAnimationChannel().setTargetNode(node).setTargetPath(ch.getTargetPath()).setSampler(s2);
    anim.addSampler(s2).addChannel(c2);
  }
  console.log(`병합 ${name.padEnd(6)} 채널 ${anim.listChannels().length}`);
}

// 루트모션 제거 + 속도 실측 (루트/힙 translation 트랙)
const speeds = {};
for (const anim of base.getRoot().listAnimations()) {
  const rootCh = anim.listChannels().find((c) => c.getTargetPath() === 'translation'
    && /root|hips|pelvis|armature|bip/i.test(c.getTargetNode()?.getName() ?? ''));
  if (!rootCh) { speeds[anim.getName()] = 0; continue; }
  const smp = rootCh.getSampler();
  const t = smp.getInput().getArray();
  const v = Float32Array.from(smp.getOutput().getArray());
  const n = t.length;
  const dx = v[(n - 1) * 3] - v[0];
  const dz = v[(n - 1) * 3 + 2] - v[2];
  const dur = (t[n - 1] - t[0]) || 1;
  speeds[anim.getName()] = Math.hypot(dx, dz) / dur;
  for (let i = 0; i < n; i += 1) { const k = (t[i] - t[0]) / dur; v[i * 3] -= dx * k; v[i * 3 + 2] -= dz * k; }
  const out2 = base.createAccessor().setType('VEC3').setArray(v).setBuffer(buffer);
  smp.setOutput(out2);
}
await prune()(base);
await io.write('/tmp/RabbitRoam.glb', base);
console.log('클립:', base.getRoot().listAnimations().map((a) => a.getName()).join(', '));
console.log('속도(로컬/s):', JSON.stringify(Object.fromEntries(Object.entries(speeds).map(([k, v]) => [k, +v.toFixed(3)]))));
// 몸 크기 (정규화 기준)
const box = base.getRoot().listMeshes()[0].listPrimitives()[0].getAttribute('POSITION');
const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
const arr = box.getArray();
for (let i = 0; i < arr.length; i += 3) for (let j = 0; j < 3; j++) { mn[j] = Math.min(mn[j], arr[i + j]); mx[j] = Math.max(mx[j], arr[i + j]); }
console.log('몸 치수(로컬):', mx.map((v, j) => (v - mn[j]).toFixed(2)).join(' × '));
