import * as THREE from 'three';

export type HandSide = 'right' | 'left' | 'any';
export type HandPropKind = 'lantern' | 'camera' | 'phone';

export type HandPropPose = {
  mountPosition: [number, number, number];
  mountRotation: [number, number, number];
  assetPosition: [number, number, number];
  assetRotation: [number, number, number];
};

/**
 * 랜턴의 검증된 손목 원점을 기준으로 한 소품별 로컬 자세.
 * 손뼈 탐색과 스케일 상쇄는 모두 같고, 차이는 이 자세값뿐이다.
 */
export const HAND_PROP_POSES: Record<HandPropKind, HandPropPose> = {
  lantern: {
    mountPosition: [0, 0, 0],
    mountRotation: [0, 0, 0],
    assetPosition: [0, -0.17, 0],
    assetRotation: [0, 0, 0],
  },
  camera: {
    mountPosition: [0, 0, 0],
    mountRotation: [Math.PI / 2, -0.08, Math.PI],
    assetPosition: [0.012, -0.035, -0.018],
    assetRotation: [0, 0, 0],
  },
  phone: {
    mountPosition: [0, 0, 0],
    mountRotation: [Math.PI / 2, 0.12, Math.PI / 2],
    assetPosition: [0.008, -0.029, -0.010],
    assetRotation: [0, 0, 0],
  },
};

export function findHandBone(root: THREE.Object3D, preferred: HandSide = 'right'): THREE.Object3D | null {
  const patterns = preferred === 'left'
    ? [/LeftHand$/i, /RightHand$/i, /left.*wrist$/i, /right.*wrist$/i, /left.*hand/i, /right.*hand/i, /hand|wrist/i]
    : preferred === 'right'
      ? [/RightHand$/i, /LeftHand$/i, /right.*wrist$/i, /left.*wrist$/i, /right.*hand/i, /left.*hand/i, /hand|wrist/i]
      : [/RightHand$/i, /LeftHand$/i, /right.*wrist$/i, /left.*wrist$/i, /hand|wrist/i];

  for (const pattern of patterns) {
    let found: THREE.Object3D | null = null;
    root.traverse((node) => {
      if (!found && (node as THREE.Bone).isBone && pattern.test(node.name)) found = node;
    });
    if (found) return found;
  }
  return null;
}

/** Lantern, camera and phone share this exact mount grammar. */
export function createHandMount(root: THREE.Object3D, preferred: HandSide = 'right', kind?: HandPropKind): THREE.Group | null {
  const hand = findHandBone(root, preferred);
  if (!hand) return null;

  root.updateMatrixWorld(true);
  const worldScale = new THREE.Vector3();
  hand.getWorldScale(worldScale);

  const mount = new THREE.Group();
  mount.name = `MimesisHandMount:${kind ?? preferred}`;
  mount.scale.set(
    1 / Math.max(Math.abs(worldScale.x), 1e-6),
    1 / Math.max(Math.abs(worldScale.y), 1e-6),
    1 / Math.max(Math.abs(worldScale.z), 1e-6),
  );

  if (kind) {
    const pose = HAND_PROP_POSES[kind];
    mount.position.set(...pose.mountPosition);
    mount.rotation.set(...pose.mountRotation);
  }

  hand.add(mount);
  return mount;
}

export function attachHandProp(
  root: THREE.Object3D,
  asset: THREE.Object3D,
  kind: HandPropKind,
  preferred: HandSide = 'right',
): THREE.Group | null {
  const mount = createHandMount(root, preferred, kind);
  if (!mount) return null;
  const pose = HAND_PROP_POSES[kind];
  asset.position.set(...pose.assetPosition);
  asset.rotation.set(...pose.assetRotation);
  mount.add(asset);
  return mount;
}
