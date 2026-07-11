// BUILD 392: 별이의 손 소품 — 카메라와 휴대폰을 원본 비율로 정규화해 손 뼈에 붙인다.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

export type HeldDeviceKind = 'camera' | 'phone';

function loadGlb(url: string): Promise<THREE.Group> {
  return new Promise((resolve, reject) => {
    new GLTFLoader().load(url, (gltf) => resolve(gltf.scene as THREE.Group), undefined, reject);
  });
}

export async function loadHeldDeviceAsset(kind: HeldDeviceKind): Promise<THREE.Group> {
  const raw = await loadGlb(`/assets/props/${kind}.glb`);
  raw.traverse((node) => {
    const mesh = node as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.frustumCulled = false;
  });

  raw.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(raw);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const longest = Math.max(size.x, size.y, size.z, 1e-6);
  const target = kind === 'camera' ? 0.16 : 0.13;
  raw.position.sub(center);
  raw.scale.setScalar(target / longest);

  const root = new THREE.Group();
  root.add(raw);
  return root;
}
