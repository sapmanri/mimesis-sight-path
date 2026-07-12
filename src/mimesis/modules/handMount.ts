import * as THREE from 'three';

export type HandSide = 'right' | 'left' | 'any';

export function findHandBone(root: THREE.Object3D, preferred: HandSide = 'right'): THREE.Object3D | null {
  const patterns = preferred === 'left'
    ? [/LeftHand$/i, /RightHand$/i, /left.*wrist$/i, /right.*wrist$/i, /hand|wrist/i]
    : preferred === 'right'
      ? [/RightHand$/i, /LeftHand$/i, /right.*wrist$/i, /left.*wrist$/i, /hand|wrist/i]
      : [/RightHand$/i, /LeftHand$/i, /hand|wrist/i];

  for (const pattern of patterns) {
    let found: THREE.Object3D | null = null;
    root.traverse((node) => {
      if (!found && (node as THREE.Bone).isBone && pattern.test(node.name)) found = node;
    });
    if (found) return found;
  }
  return null;
}

/**
 * Lantern, camera and phone share this exact mount grammar.
 * Device-specific position/rotation belongs to the child asset, not the hand lookup.
 */
export function createHandMount(root: THREE.Object3D, preferred: HandSide = 'right'): THREE.Group | null {
  const hand = findHandBone(root, preferred);
  if (!hand) return null;

  root.updateMatrixWorld(true);
  const worldScale = new THREE.Vector3();
  hand.getWorldScale(worldScale);

  const mount = new THREE.Group();
  mount.name = `MimesisHandMount:${preferred}`;
  mount.scale.setScalar(1 / Math.max(Math.abs(worldScale.x), 1e-6));
  hand.add(mount);
  return mount;
}
