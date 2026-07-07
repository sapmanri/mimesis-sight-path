// Girl1 정본 파이프라인 (BUILD 234 — 리타겟 없음). 입력: 믹사모 애니 FBX→GLB(FBX2glTF -b, glb/ 폴더) + Vroid01.glb. 232의 리타겟 베이커는 좀비를 낳아 폐기(BUILD 233 참조).
// Girl1 재건 2호 — 리타겟 없는 길:
// 믹사모 리깅 몸(Walking.glb) + UV 삼각형 대조로 재질 그룹 복원(Vroid01 텍스처 이식) + 클립 9종 병합
import { NodeIO, Document } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { copyToDocument, prune } from '@gltf-transform/functions';

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const base = await io.read('glb/Walking.glb');            // 몸+골격+Walking
const vroid = await io.read('/home/claude/mimesis-sight-path/public/assets/models/Vroid01.glb'); // 텍스처 정답지

// ── 1. Vroid01 재질을 base 문서로 복사 (텍스처 포함)
const vMats = vroid.getRoot().listMaterials();
const matMap = copyToDocument(base, vroid, vMats);        // Map<srcMat, dstMat>

// ── 2. UV 삼각형 → 재질 인덱스 (Vroid01 기준 사전 구축)
const key = (u1, v1, u2, v2, u3, v3) => {
  const q = (x) => Math.round(x * 4096);
  // 정점 순서 무관 정렬
  const pts = [[q(u1), q(v1)], [q(u2), q(v2)], [q(u3), q(v3)]].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  return pts.flat().join(',');
};
const vMeshes = vroid.getRoot().listMeshes();
const dicts = vMeshes.map((m) => {
  const dict = new Map(); const cent = new Map();
  m.listPrimitives().forEach((p) => {
    const uv = p.getAttribute('TEXCOORD_0').getArray();
    const idx = p.getIndices().getArray();
    const mat = p.getMaterial();
    for (let i = 0; i < idx.length; i += 3) {
      const [a, b, c] = [idx[i], idx[i + 1], idx[i + 2]];
      dict.set(key(uv[a * 2], uv[a * 2 + 1], uv[b * 2], uv[b * 2 + 1], uv[c * 2], uv[c * 2 + 1]), mat);
      cent.set(Math.round((uv[a * 2] + uv[b * 2] + uv[c * 2]) / 3 * 2048) + ',' + Math.round((uv[a * 2 + 1] + uv[b * 2 + 1] + uv[c * 2 + 1]) / 3 * 2048), mat);
    }
  });
  return { dict, cent };
});

// ── 3. base의 메시(합본 1프림)를 재질 그룹별 프리미티브로 분할
//     base 메시 순서 ↔ vroid 메시 순서 대응은 정점 수로 판별
const bMeshes = base.getRoot().listMeshes();
const vCounts = vMeshes.map((m) => m.listPrimitives()[0].getAttribute('POSITION').getCount()); // 프리미티브들은 정점 버퍼를 공유한다 — [0]의 수가 곧 메시의 수
let matched = 0, unmatched = 0;
for (const bm of bMeshes) {
  const prim = bm.listPrimitives()[0];
  const n = prim.getAttribute('POSITION').getCount();
  // 가장 가까운 정점 수의 vroid 메시 선택
  let vi = 0, best = 1e9;
  vCounts.forEach((c, i) => { const d = Math.abs(c - n); if (d < best) { best = d; vi = i; } });
  const { dict, cent } = dicts[vi];
  const uv = prim.getAttribute('TEXCOORD_0').getArray();
  const idx = prim.getIndices().getArray();
  const groups = new Map(); // mat(원본) -> 인덱스 배열
  for (let i = 0; i < idx.length; i += 3) {
    const [a, b, c] = [idx[i], idx[i + 1], idx[i + 2]];
    const m = dict.get(key(uv[a * 2], uv[a * 2 + 1], uv[b * 2], uv[b * 2 + 1], uv[c * 2], uv[c * 2 + 1]))
      ?? cent.get(Math.round((uv[a * 2] + uv[b * 2] + uv[c * 2]) / 3 * 2048) + ',' + Math.round((uv[a * 2 + 1] + uv[b * 2 + 1] + uv[c * 2 + 1]) / 3 * 2048));
    if (m) { matched++; } else { unmatched++; }
    const mk = m ?? 'MISS';
    if (!groups.has(mk)) groups.set(mk, []);
    groups.get(mk).push(a, b, c);
  }
  const buffer = base.getRoot().listBuffers()[0];
  const srcMat0 = prim.getMaterial();
  let first = true;
  for (const [m, ids] of groups) {
    const acc = base.createAccessor().setType('SCALAR').setArray(new Uint32Array(ids)).setBuffer(buffer);
    if (first) {
      prim.setIndices(acc);
      prim.setMaterial(m === 'MISS' ? srcMat0 : matMap.get(m));
      first = false;
    } else {
      const p2 = base.createPrimitive()
        .setIndices(acc)
        .setMaterial(m === 'MISS' ? srcMat0 : matMap.get(m))
        .setMode(prim.getMode());
      prim.listSemantics().forEach((s) => p2.setAttribute(s, prim.getAttribute(s)));
      bm.addPrimitive(p2);
    }
  }
}
console.log(`UV 삼각형 매칭: ${matched} 성공 / ${unmatched} 실패 (${(matched / (matched + unmatched) * 100).toFixed(1)}%)`);

// ── 4. 클립 병합 — 같은 mixamorig 골격, 노드 이름으로 채널 재부착 (리타겟 없음)
const CLIPS = [
  ['Idle', 'Idle'], ['Running', 'Running'], ['Picking Up', 'PickUp'], ['Sitting', 'Sitting'],
  ['Yawn', 'Yawn'], ['Samba Dancing', 'Dance_Samba'], ['Booty Hip Hop Dance', 'Dance_HipHop'], ['Dancing Running Man', 'Dance_RunningMan'],
];
base.getRoot().listAnimations()[0].setName('Walking');
const nodeByName = {};
base.getRoot().listNodes().forEach((n) => { nodeByName[n.getName()] = n; });
const buffer = base.getRoot().listBuffers()[0];
for (const [file, name] of CLIPS) {
  const d = await io.read(`glb/${file}.glb`);
  const src = d.getRoot().listAnimations()[0];
  if (!src) { console.log('클립 없음:', file); continue; }
  const anim = base.createAnimation(name);
  const inputCache = new Map();
  for (const ch of src.listChannels()) {
    const tgtName = ch.getTargetNode()?.getName();
    const node = nodeByName[tgtName];
    if (!node) continue;
    const smp = ch.getSampler();
    const inArr = smp.getInput().getArray();
    const outArr = smp.getOutput().getArray();
    const ik = smp.getInput();
    let input = inputCache.get(ik);
    if (!input) { input = base.createAccessor().setType('SCALAR').setArray(new Float32Array(inArr)).setBuffer(buffer); inputCache.set(ik, input); }
    const OutTyped = outArr.constructor;
    const out = base.createAccessor().setType(smp.getOutput().getType()).setArray(new OutTyped(outArr)).setBuffer(buffer);
    if (smp.getOutput().getNormalized()) out.setNormalized(true);
    const s2 = base.createAnimationSampler().setInput(input).setOutput(out).setInterpolation(smp.getInterpolation());
    const c2 = base.createAnimationChannel().setTargetNode(node).setTargetPath(ch.getTargetPath()).setSampler(s2);
    anim.addSampler(s2).addChannel(c2);
  }
  console.log(`병합 ${name.padEnd(16)} 채널 ${anim.listChannels().length}`);
}

// ── 5. 루트모션 처리 + clipSpeeds 실측 (힙 translation 트랙)
const speeds = {};
for (const anim of base.getRoot().listAnimations()) {
  const hipCh = anim.listChannels().find((c) => /Hips/i.test(c.getTargetNode()?.getName() ?? '') && c.getTargetPath() === 'translation');
  if (!hipCh) continue;
  const smp = hipCh.getSampler();
  const t = smp.getInput().getArray();
  const v = Float32Array.from(smp.getOutput().getArray());
  const n = t.length;
  const dx = v[(n - 1) * 3] - v[0];
  const dz = v[(n - 1) * 3 + 2] - v[2];
  const dur = t[n - 1] - t[0] || 1;
  speeds[anim.getName()] = Math.hypot(dx, dz) / dur;
  for (let i = 0; i < n; i += 1) {
    const k = (t[i] - t[0]) / dur;
    v[i * 3] -= dx * k;
    v[i * 3 + 2] -= dz * k;
  }
  const out2 = base.createAccessor().setType('VEC3').setArray(v).setBuffer(base.getRoot().listBuffers()[0]);
  smp.setOutput(out2);
}
await prune()(base); // 안 쓰는 구본 정리
await io.write('/tmp/Girl1B.glb', base);
console.log('완료. clipSpeeds:', JSON.stringify(Object.fromEntries(Object.entries(speeds).map(([k, v2]) => [k, +v2.toFixed(4)]))));
