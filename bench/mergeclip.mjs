// raw JSON 애니메이션 병합 — joint order 보존(gltf-transform 안 씀).
// 소스 GLB의 한 클립을 Kid5b.glb에 뼈 이름 매칭으로 이식한다.
// 사용: node mergeclip.mjs <src.glb> <새클립명> [inputKid.glb] [outputKid.glb]
import fs from 'fs';

const [,, SRC, CLIPNAME, IN='public/assets/models/Kid5b.glb', OUT='public/assets/models/Kid5b.glb'] = process.argv;
if (!SRC || !CLIPNAME) { console.error('사용: node mergeclip.mjs <src.glb> <새클립명> [in] [out]'); process.exit(1); }

function readGLB(path) {
  const buf = fs.readFileSync(path);
  if (buf.toString('ascii',0,4) !== 'glTF') throw new Error('not glTF: '+path);
  const jsonLen = buf.readUInt32LE(12);
  const json = JSON.parse(buf.slice(20, 20+jsonLen).toString('utf8'));
  // bin chunk: [jsonChunkHeader(8)][json][binChunkHeader(8)][bin]
  const binHeaderOff = 20 + jsonLen;
  const binLen = buf.readUInt32LE(binHeaderOff);
  const binOff = binHeaderOff + 8;
  const bin = buf.slice(binOff, binOff + binLen);
  return { json, bin };
}

function writeGLB(path, json, bin) {
  const jsonStr = JSON.stringify(json);
  const jsonBuf = Buffer.from(jsonStr, 'utf8');
  const jsonPad = (4 - (jsonBuf.length % 4)) % 4;
  const jsonPadded = Buffer.concat([jsonBuf, Buffer.alloc(jsonPad, 0x20)]); // space pad
  const binPad = (4 - (bin.length % 4)) % 4;
  const binPadded = Buffer.concat([bin, Buffer.alloc(binPad, 0)]);
  const total = 12 + 8 + jsonPadded.length + 8 + binPadded.length;
  const out = Buffer.alloc(total);
  let o = 0;
  out.write('glTF', o); o += 4;
  out.writeUInt32LE(2, o); o += 4;             // version
  out.writeUInt32LE(total, o); o += 4;         // total length
  out.writeUInt32LE(jsonPadded.length, o); o += 4;
  out.write('JSON', o); o += 4;
  jsonPadded.copy(out, o); o += jsonPadded.length;
  out.writeUInt32LE(binPadded.length, o); o += 4;
  out.write('BIN\0', o); o += 4;
  binPadded.copy(out, o);
  fs.writeFileSync(path, out);
}

const kid = readGLB(IN);
const src = readGLB(SRC);

// Kid5b 노드 이름 → 인덱스
const kidNodeByName = new Map();
kid.json.nodes.forEach((n, i) => { if (n.name) kidNodeByName.set(n.name, i); });

const srcAnim = src.json.animations[0];
if (!srcAnim) throw new Error('소스에 애니메이션 없음');

// 병합에 필요한 소스 accessor를 모아 Kid5b에 append.
// 각 소스 accessor → 새 Kid5b accessor 인덱스로 매핑.
const accMap = new Map(); // srcAccessorIdx -> newKidAccessorIdx
let binParts = [kid.bin];
let binCursor = kid.bin.length; // 새 데이터가 붙는 시작 오프셋 (단일 buffer 가정)

function alignTo4(n){ return (4 - (n % 4)) % 4; }

function appendAccessor(srcAccIdx) {
  if (accMap.has(srcAccIdx)) return accMap.get(srcAccIdx);
  const acc = src.json.accessors[srcAccIdx];
  const bv = src.json.bufferViews[acc.bufferView];
  const byteOffset = (bv.byteOffset||0) + (acc.byteOffset||0);
  // 요소 크기 계산
  const compSize = { 5120:1,5121:1,5122:2,5123:2,5125:4,5126:4 }[acc.componentType];
  const typeCount = { SCALAR:1, VEC2:2, VEC3:3, VEC4:4, MAT4:16 }[acc.type];
  const elemSize = compSize * typeCount;
  const byteLen = acc.count * elemSize;
  const data = src.bin.slice(byteOffset, byteOffset + byteLen);
  // 4바이트 정렬
  const pad = alignTo4(binCursor);
  if (pad) { binParts.push(Buffer.alloc(pad, 0)); binCursor += pad; }
  const newBvOffset = binCursor;
  binParts.push(data); binCursor += data.length;
  // 새 bufferView
  const newBv = { buffer: 0, byteOffset: newBvOffset, byteLength: byteLen };
  const newBvIdx = kid.json.bufferViews.length;
  kid.json.bufferViews.push(newBv);
  // 새 accessor (bufferView 내부이므로 byteOffset 0)
  const newAcc = {
    bufferView: newBvIdx, componentType: acc.componentType,
    count: acc.count, type: acc.type,
  };
  if (acc.min) newAcc.min = acc.min.slice();
  if (acc.max) newAcc.max = acc.max.slice();
  if (acc.normalized) newAcc.normalized = acc.normalized;
  const newAccIdx = kid.json.accessors.length;
  kid.json.accessors.push(newAcc);
  accMap.set(srcAccIdx, newAccIdx);
  return newAccIdx;
}

// 새 애니메이션 조립: 뼈 이름으로 target.node 리매핑, 없는 뼈 채널은 스킵
const newSamplers = [];
const newChannels = [];
const samplerRemap = new Map(); // 원래 sampler idx -> 새 sampler idx (채널이 참조)
let skipped = 0;

srcAnim.channels.forEach((ch) => {
  const srcNodeName = src.json.nodes[ch.target.node].name;
  const kidNodeIdx = kidNodeByName.get(srcNodeName);
  if (kidNodeIdx === undefined) { skipped++; return; } // Kid5b에 없는 뼈 → 스킵
  // 이 채널의 sampler 준비
  let newSampIdx;
  if (samplerRemap.has(ch.sampler)) {
    newSampIdx = samplerRemap.get(ch.sampler);
  } else {
    const s = srcAnim.samplers[ch.sampler];
    const inAcc = appendAccessor(s.input);
    const outAcc = appendAccessor(s.output);
    newSampIdx = newSamplers.length;
    newSamplers.push({ input: inAcc, output: outAcc, interpolation: s.interpolation || 'LINEAR' });
    samplerRemap.set(ch.sampler, newSampIdx);
  }
  newChannels.push({ sampler: newSampIdx, target: { node: kidNodeIdx, path: ch.target.path } });
});

const newAnim = { name: CLIPNAME, samplers: newSamplers, channels: newChannels };
kid.json.animations.push(newAnim);

// buffer byteLength 갱신 (단일 buffer)
const finalBin = Buffer.concat(binParts);
kid.json.buffers[0].byteLength = finalBin.length;

writeGLB(OUT, kid.json, finalBin);

console.log(`✓ 병합 완료: "${CLIPNAME}"`);
console.log(`  채널 ${newChannels.length}개 이식, ${skipped}개 스킵(Kid5b에 없는 뼈)`);
console.log(`  총 클립수: ${kid.json.animations.length}`);
console.log(`  BIN: ${(kid.bin.length/1024/1024).toFixed(2)}MB → ${(finalBin.length/1024/1024).toFixed(2)}MB`);
