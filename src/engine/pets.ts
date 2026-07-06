// ---------- BUILD 141: 펫 — 곁을 알아서 노는 동반자 ----------
// "캐릭터 주변을 항상 따라다니는데 어느 정도는 좀 자유를 줬으면 해.
//  너무 멀어지지 않게만 알아서 놀게." — Vase.
// 펫은 워커처럼 제 텍스처를 입고 온다 (팔레트를 통과하지 않는 유이한 존재들).

import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

export type PetDef = { id: string; label: string; file: string; prefix: string; height: number };

export const PET_ROSTER: PetDef[] = [
  { id: 'cat1', label: '🐈 고양이 1', file: 'Cat_01.glb', prefix: 'Cat', height: 0.26 },
  { id: 'cat2', label: '🐈 고양이 2', file: 'Cat_02.glb', prefix: 'Cat', height: 0.26 },
  { id: 'cat3', label: '🐈 고양이 3', file: 'Cat_03.glb', prefix: 'Cat', height: 0.26 },
  { id: 'cat4', label: '🐈 고양이 4', file: 'Cat_04.glb', prefix: 'Cat', height: 0.26 },
  { id: 'pom', label: '🐶 포메라니안', file: 'Pomeranian_01.glb', prefix: 'Pomeranian', height: 0.24 },
  { id: 'puppy', label: '🐶 포메 아기', file: 'Pomeranian_Puppy_01.glb', prefix: 'PomeranianPuppy', height: 0.17 },
  { id: 'dachshund', label: '🐶 닥스훈트', file: 'Dachshund_01.glb', prefix: 'Dachshund', height: 0.22 },
  { id: 'labrador', label: '🐶 래브라도', file: 'Labrador_01.glb', prefix: 'Labrador', height: 0.34 },
];

export type LoadedPet = {
  group: THREE.Group;
  mixer: THREE.AnimationMixer;
  idle: THREE.AnimationAction | null;
  walk: THREE.AnimationAction | null;
  run: THREE.AnimationAction | null;
  sit: THREE.AnimationAction | null;
  /** 재롱: Stretch/Flip/Bark/GivePaw/AskToPlay 중 있는 것들 */
  tricks: THREE.AnimationAction[];
};

const petLoader = new GLTFLoader();

export async function loadPet(def: PetDef): Promise<LoadedPet> {
  const gltf = await petLoader.loadAsync('/assets/pets/' + def.file);
  const group = new THREE.Group();
  const model = gltf.scene;
  // 정규화: 키를 def.height로, 발을 땅에
  const box = new THREE.Box3().setFromObject(model);
  const size = box.getSize(new THREE.Vector3());
  const sc = def.height / Math.max(1e-6, size.y);
  model.scale.setScalar(sc);
  box.setFromObject(model);
  model.position.y -= box.min.y;
  const c = box.getCenter(new THREE.Vector3());
  model.position.x -= c.x; model.position.z -= c.z;
  model.traverse((n) => {
    const mesh = n as THREE.Mesh;
    if (mesh.isMesh) { mesh.castShadow = true; mesh.frustumCulled = false; }
  });
  group.add(model);

  const mixer = new THREE.AnimationMixer(model);
  const find = (suffix: string) => {
    const clip = gltf.animations.find((a) => a.name.toLowerCase().endsWith(suffix.toLowerCase()));
    return clip ? mixer.clipAction(clip) : null;
  };
  const tricks = ['_Stretch', '_Flip', '_Bark', '_GivePaw', '_AskToPlay']
    .map(find)
    .filter((a): a is THREE.AnimationAction => !!a);
  tricks.forEach((a) => { a.setLoop(THREE.LoopOnce, 1); a.clampWhenFinished = true; }); // BUILD 144: 끝 포즈 유지 — 바인드 포즈로 튕기지 않게
  return {
    group,
    mixer,
    idle: find('_Idle'),
    walk: find('_Walk'),
    run: find('_Run'),
    sit: find('_Sit'),
    tricks,
  };
}
