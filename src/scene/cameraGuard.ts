// ---------- BUILD 090: FRAME GUARD ----------
// 핵심 원칙 (Vase): "카메라 구도는 다양하게. 단, 캐릭터가 액자를 벗어나지 않게."
//
// 구도(shot)는 자유다 — 옆면도, 정면도, 부감도 좋다.
// 이 모듈은 매 프레임 인물을 카메라 공간에 투영해 감시하고,
// 인물이 안전 영역을 벗어나려 하면 구도를 '조금씩' 고쳐 잡는다:
//   1) 연성 위반 (액자 가장자리 접근) → 시선(look)을 인물 쪽으로 팬
//   2) 경성 위반 (프레임 밖/카메라 뒤/너무 멀거나 가까움) → 자리(pos)째 호위 이동
//
// 순수 함수 — World가 매 프레임 호출하고, 노드에서 수치 검증도 한다.

import * as THREE from 'three';

export type Shot = { pos: THREE.Vector3; look: THREE.Vector3 };

export type GuardParams = {
  safeX: number;     // NDC 가로 안전 한계 (0~1)
  safeY: number;     // NDC 세로 안전 한계
  maxDist: number;   // 인물과의 최대 거리 (이보다 멀면 다가간다)
  minDist: number;   // 최소 거리 (이보다 가까우면 물러난다)
  panRate: number;   // 연성 팬 속도 배율
  moveRate: number;  // 경성 호위 이동 속도 배율
  leadTime: number;  // BUILD 090: 예측 리드(초) — 인물의 '지금'이 아니라 '곧'을 액자에 담는다
};

const tmpCam = new THREE.PerspectiveCamera();
const ndc = new THREE.Vector3();
const viewDir = new THREE.Vector3();

/**
 * shot을 제자리에서 수정한다. 반환: 이번 프레임의 위반 정도 (0 = 안전).
 * @param subject 인물의 초점 (가슴 높이 권장)
 */
const leadPoint = new THREE.Vector3();

export function guardShot(
  shot: Shot,
  subjectNow: THREE.Vector3,
  subjectVel: THREE.Vector3,
  fov: number,
  aspect: number,
  dt: number,
  P: GuardParams,
): number {
  // 예측 리드: 반응만으로는 뛰는 사람을 못 지킨다. 스무딩 지연만큼 미래를 지킨다.
  const subject = leadPoint.copy(subjectNow).addScaledVector(subjectVel, P.leadTime);
  // shot 기준 가상 카메라로 투영 (실제 카메라는 shot을 따라오는 중일 뿐이므로
  // 구도의 '의도'인 shot 자체를 감시해야 한다)
  tmpCam.fov = fov;
  tmpCam.aspect = aspect;
  tmpCam.near = 0.1;
  tmpCam.far = 300;
  tmpCam.position.copy(shot.pos);
  tmpCam.lookAt(shot.look);
  tmpCam.updateProjectionMatrix();
  tmpCam.updateMatrixWorld(true);

  ndc.copy(subject).project(tmpCam);
  const dist = shot.pos.distanceTo(subject);
  const behind = ndc.z > 1 || ndc.z < -1;

  // ---- 위반 측정 ----
  const vx = Math.max(0, Math.abs(ndc.x) - P.safeX);
  const vy = Math.max(0, Math.abs(ndc.y) - P.safeY);
  const soft = behind ? 1 : Math.max(vx, vy);
  const tooFar = Math.max(0, dist - P.maxDist);
  const tooClose = Math.max(0, P.minDist - dist);
  const hard = behind || Math.abs(ndc.x) > 0.92 || Math.abs(ndc.y) > 0.92 || tooFar > 0 || tooClose > 0;

  // ---- 1) 연성: 시선을 인물 쪽으로 팬 ----
  // 근접 부스트: 인물이 가까울수록 스쳐 지나가는 각속도가 커지므로 팬도 빨라야 한다
  if (soft > 0) {
    const proximity = 1 + 3.5 / Math.max(1, dist);
    const k = Math.min(1, dt * P.panRate * (0.6 + soft * 4) * proximity);
    shot.look.lerp(subject, k);
  }

  // ---- 2) 경성: 자리째 호위 — 현재 보는 방향은 유지한 채 거리만 바로잡는다 ----
  if (hard) {
    viewDir.copy(shot.look).sub(shot.pos).normalize();
    const goodDist = THREE.MathUtils.clamp(dist, P.minDist + 0.8, P.maxDist - 1.5);
    const trackPos = subject.clone().sub(viewDir.multiplyScalar(goodDist));
    // 호위 중에도 눈높이는 지키되, 인물보다 아래로 내려가진 않는다
    trackPos.y = Math.max(trackPos.y, subject.y + 0.6);
    const k = Math.min(1, dt * P.moveRate * (behind || tooClose > 0 ? 2.4 : 1));
    shot.pos.lerp(trackPos, k);
    shot.look.lerp(subject, Math.min(1, dt * P.panRate * 1.6));
  }

  return hard ? 1 : soft;
}

/** BUILD 090: 구도 사전 — 여정마다 하나를 뽑는다. 다양함이 핵심. */
export type ShotRecipe = {
  id: string;
  nor: number;    // 법선 방향 계수 (옆)
  tan: number;    // 접선 방향 계수 (앞뒤, travel 부호 곱)
  hBoost: number; // 높이 가산 배율 (segLen 비례)
  lift: number;   // 기본 높이 가산
};

export const SHOT_RECIPES: ShotRecipe[] = [
  { id: 'three-quarter-back', nor: 0.82, tan: -0.4, hBoost: 0.1, lift: 0.7 },  // 088의 기본 구도
  { id: 'side', nor: 1.05, tan: 0.0, hBoost: 0.06, lift: 0.45 },               // Vase가 좋아한 옆면
  { id: 'three-quarter-front', nor: 0.7, tan: 0.55, hBoost: 0.08, lift: 0.55 },// 마중 나온 시선
  { id: 'back-high', nor: 0.3, tan: -0.85, hBoost: 0.16, lift: 1.3 },          // 등 뒤 부감
  { id: 'low-side', nor: 0.95, tan: -0.15, hBoost: 0.03, lift: 0.15 },         // 낮게 스치는 옆면
];
