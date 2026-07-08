import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { weld, dedup, prune, join } from '@gltf-transform/functions';
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const d = await io.read('/tmp/avion.glb');
await d.transform(dedup(), weld(), join(), prune());
// 회색조 단일 재질로 (keepLook tint가 칠한다)
await io.write('/home/claude/mimesis-sight-path/public/assets/models/Airplane.glb', d);
const r = d.getRoot();
console.log('최적화 후 메시:', r.listMeshes().length, '정점:', r.listMeshes().reduce((s,m)=>s+m.listPrimitives().reduce((t,p)=>t+p.getAttribute('POSITION').getCount(),0),0));
