// ---------- BUILD 085: WALKER RIG ----------
// 스캐빈저 캐릭터의 절차 보행.
//
// 업로드된 FBX의 내장 클립(rig|scavenger anim, 13.3s)은 보행 사이클이 아니라
// "걷다가 → 웅크려 앉아 → 뒤져보고 → 일어나는" 한 편의 비네트다.
// 걷기 구간(1~3s)은 루프 이음새 포즈 차이가 50°+라 반복 재생이 불가능하다.
//
// 그래서 보행은 뼈를 직접 구동하는 절차 애니메이션으로 만들고 (이음새 없음,
// 속도 연동: 느리면 걷고 빠르면 뛴다), 원본 클립의 백미인 '웅크려 살펴보기'
// (프레임 180~318)는 기억 앞에 도착했을 때의 동작으로 살렸다.
// — 기억 앞에 웅크려 들여다보는 사람.
//
// 축 실측 (probe): 허벅지 전방 스윙 = -X · 무릎 접힘 = +X · 팔 전방 스윙 = +X

import * as THREE from 'three';

const AXIS_X = new THREE.Vector3(1, 0, 0);

export type WalkerRig = {
  /**
   * dt초 진행. speed01: 0(걷기)~1(전력 질주), moving: 이동 중 여부,
   * distDelta: 이번 프레임 실제 이동 거리(월드 유닛) — 보폭은 여기서 나온다.
   * BUILD 086: 발이 땅을 밀어야 몸이 간다. 위상은 시간이 아니라 거리로 굴린다.
   */
  update: (dt: number, speed01: number, moving: boolean, elapsed: number, distDelta: number) => void;
  /** 도착: 웅크려 살펴보기 (한 번 재생 후 자동 복귀) */
  playInspect: () => void;
  stopInspect: () => void;
  inspecting: () => boolean;
  /** 현재 걸음 위상 (bob 동기화용) */
  phase: () => number;
};

export function createWalkerRig(root: THREE.Object3D, animations: THREE.AnimationClip[], inspectTimeScale = 0.72): WalkerRig | null {
  const get = (n: string): THREE.Object3D | null => {
    let f: THREE.Object3D | null = null;
    root.traverse((o) => { if (o.name === n && !f) f = o; });
    return f;
  };
  const b = {
    thighL: get('ORG-thighL'), thighR: get('ORG-thighR'),
    // DEF-thigh.01 / DEF-upper_arm.01은 루트에 물려 있어 ORG를 안 따라온다 — 같이 돌린다
    defThighL: get('DEF-thigh01L'), defThighR: get('DEF-thigh01R'),
    shinL: get('ORG-shinL'), shinR: get('ORG-shinR'),
    armL: get('ORG-upper_armL'), armR: get('ORG-upper_armR'),
    defArmL: get('DEF-upper_arm01L'), defArmR: get('DEF-upper_arm01R'),
    foreL: get('ORG-forearmL'), foreR: get('ORG-forearmR'),
    spine: get('ORG-spine'),
  };
  if (!b.thighL || !b.thighR || !b.shinL || !b.shinR) return null;

  const base = new Map<THREE.Object3D, THREE.Quaternion>();
  Object.values(b).forEach((o) => { if (o) base.set(o, o.quaternion.clone()); });
  const limbBones = [b.thighL, b.thighR, b.defThighL, b.defThighR, b.shinL, b.shinR, b.armL, b.armR, b.defArmL, b.defArmR, b.foreL, b.foreR].filter(Boolean) as THREE.Object3D[];

  // 도착 동작: 원본 클립의 웅크려 살펴보기
  const mixer = new THREE.AnimationMixer(root);
  let inspect: THREE.AnimationAction | null = null;
  if (animations[0]) {
    const clip = THREE.AnimationUtils.subclip(animations[0], 'inspect', 180, 318, 24);
    inspect = mixer.clipAction(clip);
    inspect.setLoop(THREE.LoopOnce, 1);
    inspect.clampWhenFinished = false;
    inspect.timeScale = inspectTimeScale; // 천천히, 서두르지 않고 들여다본다
  }
  let inspecting = false;
  const restoreBase = () => base.forEach((bq, o) => o.quaternion.copy(bq));
  mixer.addEventListener('finished', () => { inspecting = false; restoreBase(); });

  const q = new THREE.Quaternion();
  const rotX = (o: THREE.Object3D, angle: number) => {
    o.quaternion.copy(base.get(o)!).multiply(q.setFromAxisAngle(AXIS_X, angle));
  };

  let phase = 0;
  let lean = 0;

  return {
    inspecting: () => inspecting,
    phase: () => phase,
    playInspect() {
      if (!inspect || inspecting) return;
      restoreBase();
      inspecting = true;
      inspect.reset().fadeIn(0.4).play();
    },
    stopInspect() {
      if (inspecting && inspect) { inspect.fadeOut(0.3); inspecting = false; }
    },
    update(dt, speed01, moving, elapsed, distDelta) {
      mixer.update(dt);
      if (inspecting) return; // 클립이 뼈를 소유

      if (moving) {
        // 보폭: 걸을 때 ~0.42u, 뛸 때 ~0.72u (신장 0.9 캐릭터, 초당 2보 기준).
        // 한 사이클 = 두 걸음 → 위상 += 거리/보폭 × π
        const stride = 0.42 + speed01 * 0.3;
        phase += (distDelta / stride) * Math.PI;
        const s = Math.sin(phase);
        const amp = 0.4 + speed01 * 0.34;          // 다리 스윙
        rotX(b.thighL!, -s * amp);
        rotX(b.thighR!, s * amp);
        if (b.defThighL) rotX(b.defThighL, -s * amp);
        if (b.defThighR) rotX(b.defThighR, s * amp);
        const bend = 0.5 + speed01 * 0.5;          // 무릎 접힘 (뒤로 갈 때)
        rotX(b.shinL!, Math.max(0, Math.sin(phase + Math.PI * 0.4)) * bend);
        rotX(b.shinR!, Math.max(0, Math.sin(phase + Math.PI * 1.4)) * bend);
        const armAmp = 0.2 + speed01 * 0.3;        // 팔은 다리 반대 위상
        if (b.armL) rotX(b.armL, s * armAmp);
        if (b.armR) rotX(b.armR, -s * armAmp);
        if (b.defArmL) rotX(b.defArmL, s * armAmp);
        if (b.defArmR) rotX(b.defArmR, -s * armAmp);
        if (b.foreL) rotX(b.foreL, 0.2 + Math.max(0, s) * 0.15);
        if (b.foreR) rotX(b.foreR, 0.2 + Math.max(0, -s) * 0.15);
        lean += ((0.05 + speed01 * 0.18) - lean) * Math.min(1, dt * 5);
        if (b.spine) rotX(b.spine, lean);
      } else {
        // 정지: 팔다리는 기본 자세로 서서히, 숨은 조용히
        lean += (0.02 - lean) * Math.min(1, dt * 3);
        const k = Math.min(1, dt * 6);
        limbBones.forEach((o) => o.quaternion.slerp(base.get(o)!, k));
        if (b.spine) rotX(b.spine, lean + Math.sin(elapsed * 1.3) * 0.018);
      }
    },
  };
}
