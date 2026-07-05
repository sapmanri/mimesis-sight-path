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
  /** 도착 동작. kind: 'pickup'(들여다보기) | 'sit'(바닥에 앉기) — 지원 안 하면 무시 */
  playInspect: (kind?: 'pickup' | 'sit') => void;
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
        // ---- BUILD 087: 발을 땅에 붙인다 ----
        // 접지(발이 몸 아래를 지나는 순간) 위상에서 발끝의 후방 속도가
        // 몸의 전진 속도와 같아야 발이 미끄러지지 않는다.
        //   발 속도 ≈ amp × legLen × ω,  ω = π × v / stride
        //   → amp = stride / (π × legLen)
        // 보폭은 속도에 따라 줄고 늘어난다 (천천히 걸으면 종종걸음이 아니라 짧은 걸음).
        const v = dt > 0 ? distDelta / dt : 0;
        const stride = Math.min(0.66, Math.max(0.2, 0.2 + v * 0.26));
        phase += (distDelta / stride) * Math.PI;
        const LEG = 0.42; // 신장 0.9 캐릭터의 다리 길이
        const amp = Math.min(0.62, stride / (Math.PI * LEG));
        const s = Math.sin(phase);
        rotX(b.thighL!, -s * amp);
        rotX(b.thighR!, s * amp);
        if (b.defThighL) rotX(b.defThighL, -s * amp);
        if (b.defThighR) rotX(b.defThighR, s * amp);
        // 무릎: 스윙(뒤→앞 복귀) 중에만 접힌다. 접지 다리는 곧게 — 그래야 땅을 민다
        const bend = amp * (1.15 + speed01 * 0.55);
        rotX(b.shinL!, Math.max(0, Math.sin(phase + Math.PI * 0.45)) * bend);
        rotX(b.shinR!, Math.max(0, Math.sin(phase + Math.PI * 1.45)) * bend);
        const armAmp = amp * 0.55;                 // 팔은 다리 반대 위상
        if (b.armL) rotX(b.armL, s * armAmp);
        if (b.armR) rotX(b.armR, -s * armAmp);
        if (b.defArmL) rotX(b.defArmL, s * armAmp);
        if (b.defArmR) rotX(b.defArmR, -s * armAmp);
        if (b.foreL) rotX(b.foreL, 0.18 + Math.max(0, s) * 0.14);
        if (b.foreR) rotX(b.foreR, 0.18 + Math.max(0, -s) * 0.14);
        lean += ((0.04 + speed01 * 0.17) - lean) * Math.min(1, dt * 5);
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


// ---------- BUILD 091: CLIP RIG ----------
// 전문가가 구운 클립을 빌려 입는다 (KayKit 등: Walking_A / Running_A / Idle 명명 규약).
// 미끄러짐의 최종 해법: timeScale = 실제 이동속도 ÷ 클립 고유속도.
// 발이 클립 안에서 정확히 땅을 무는 속도로만 재생된다.
//
// 머무름 동작: PickUp(들여다보기), 깊은 머무름에선 Sit_Floor(앉아서 바라보기).

export function createClipRig(
  root: THREE.Object3D,
  animations: THREE.AnimationClip[],
  natural: { walk: number; run: number },
  onStep?: (intensity: number) => void,
): WalkerRig | null {
  // 클립 명명은 팩마다 다르다 — 후보군으로 찾는다 (KayKit / Mixamo 계열)
  const clip = (...names: string[]) => {
    for (const n of names) { const c = animations.find((a) => a.name === n); if (c) return c; }
    return null;
  };
  const cWalk = clip('Walking_A', 'Walking', 'Walk');
  const cRun = clip('Running_A', 'Running', 'Run');
  const cIdle = clip('Idle', 'Idle_A', 'idle');
  if (!cWalk || !cRun || !cIdle) return null;

  const mixer = new THREE.AnimationMixer(root);
  const walk = mixer.clipAction(cWalk);
  const run = mixer.clipAction(cRun);
  const idle = mixer.clipAction(cIdle);
  const mk = (n: string, once = true) => {
    const c = clip(n);
    if (!c) return null;
    const a = mixer.clipAction(c);
    if (once) { a.setLoop(THREE.LoopOnce, 1); a.clampWhenFinished = true; }
    return a;
  };
  const pickup = mk('PickUp') ?? mk('Interact') ?? mk('Pickup');
  const sitDown = mk('Sit_Floor_Down');
  const sitIdle = mk('Sit_Floor_Idle', false) ?? mk('Sitting', false) ?? mk('Sitting Idle', false);
  const standUp = mk('Sit_Floor_StandUp');

  // BUILD 093: 접지 보정 — "허공 보행" 수정.
  // 정지 포즈 기준의 정렬은 클립이 재생되면 어긋난다 (Mixamo 힙 기준선 차이).
  // 발 뼈의 월드 최저점을 실측해 땅에 맞춘다. 밑창 두께는 바인드 포즈에서 한 번 잰다.
  const findBone = (...res: RegExp[]): THREE.Object3D | null => {
    let f: THREE.Object3D | null = null;
    root.traverse((o) => { if (f) return; if (res.some((re) => re.test(o.name))) f = o; });
    return f;
  };
  // 발끝(ToeBase) 뼈가 있으면 그걸 쓴다 — 발바닥에 가장 가깝다. 없으면 발목.
  const toeL = findBone(/LeftToeBase$/i, /LeftToe/i);
  const toeR = findBone(/RightToeBase$/i, /RightToe/i);
  const footL = toeL ?? findBone(/LeftFoot$/i, /^footl$/i, /foot\.l/i);
  const footR = toeR ?? findBone(/RightFoot$/i, /^footr$/i, /foot\.r/i);
  // 밑창: 발끝 뼈 기준 얇게, 발목 기준이면 두껍게
  const sole = toeL ? 0.012 : 0.035;
  const baseY = root.position.y;
  let groundCorr = 0;
  // BUILD 094: '평균'이 아니라 '사이클 최저점'을 땅에 맞춘다 — 평균 정합은 접지 순간 발을 묻는다.
  // rollingMin: 즉시 내려가고, 천천히(0.12u/s) 올라오는 최저점 추적기.
  let rollingMin = Infinity;
  let gestureGrace = 0; // BUILD 098: 제스처 직후 접지 보정을 서두르지 않는다 (일어날 때 튕김 방지)
  // BUILD 100: Mixamo 'Sitting'은 의자 높이다 — 앉는 동안 몸을 천천히 가라앉혀 땅에 앉힌다.
  // 일어날 땐 같은 속도로 떠오른다 — 툭 튀는 대신 스르륵.
  let sitSink = 0;
  // 발자국 감지: 발이 접지 문턱을 뚫고 내려오는 순간
  let contactL = false;
  let contactR = false;
  let lastStepL = -1;
  let lastStepR = -1;
  let stepClock = 0;
  const fw = new THREE.Vector3();
  const pw = new THREE.Vector3();

  let current: THREE.AnimationAction = idle;
  idle.play();
  const FADE = 0.32;
  const switchTo = (a: THREE.AnimationAction, fade = FADE) => {
    if (current === a) return;
    a.reset().fadeIn(fade).play();
    current.fadeOut(fade);
    current = a;
  };

  type Gesture = 'none' | 'pickup' | 'sitDown' | 'sit' | 'standUp';
  let gesture: Gesture = 'none';
  mixer.addEventListener('finished', (e) => {
    const a = (e as unknown as { action: THREE.AnimationAction }).action;
    if (a === sitDown && gesture === 'sitDown' && sitIdle) { switchTo(sitIdle, 0.25); gesture = 'sit'; }
    else if (a === standUp && gesture === 'standUp') { switchTo(idle, 0.3); gesture = 'none'; gestureGrace = 0.9; rollingMin = Infinity; }
    else if (a === pickup && gesture === 'pickup') { switchTo(idle, 0.4); gesture = 'none'; gestureGrace = 0.9; rollingMin = Infinity; }
  });

  // 걷기↔뛰기 전환 문턱: 두 고유속도의 기하평균 부근
  const runGate = Math.sqrt(natural.walk * natural.run);

  return {
    inspecting: () => gesture !== 'none',
    phase: () => 0, // 상하 흔들림은 클립 안에 있다 — 홀더 bob은 끈다
    playInspect(kind = 'pickup') {
      if (gesture !== 'none') return;
      if (kind === 'sit' && sitIdle) {
        if (sitDown) { gesture = 'sitDown'; switchTo(sitDown, 0.35); }
        else { gesture = 'sit'; switchTo(sitIdle, 0.55); } // 전환 클립이 없으면 느린 페이드로
      } else if (pickup) { gesture = 'pickup'; switchTo(pickup, 0.3); }
      else if (sitIdle) { gesture = 'sit'; switchTo(sitIdle, 0.55); } // 들여다보기가 없으면 앉는다
    },
    stopInspect() {
      if (gesture === 'sit' || gesture === 'sitDown') {
        if (standUp) { gesture = 'standUp'; switchTo(standUp, 0.2); }
        else { gesture = 'none'; switchTo(idle, 0.85); gestureGrace = 1.1; rollingMin = Infinity; } // 전환 클립이 없으면 더 느리게 일어난다
      } else if (gesture === 'pickup') {
        gesture = 'none';
        switchTo(idle, 0.25);
        gestureGrace = 0.5;
        rollingMin = Infinity;
      }
    },
    update(dt, _speed01, moving, _elapsed, distDelta) {
      const v = dt > 0 ? distDelta / dt : 0;
      if (gesture === 'none') {
        if (moving && v > 0.02) {
          const target = v > runGate ? run : walk;
          switchTo(target);
          // 미끄러짐의 최종 해법 — 발이 땅을 무는 속도로만 재생한다
          const nat = target === run ? natural.run : natural.walk;
          target.timeScale = THREE.MathUtils.clamp(v / nat, 0.55, 1.9);
        } else {
          switchTo(idle, 0.45);
        }
      } else if (moving && (gesture === 'sit' || gesture === 'pickup')) {
        // 앉거나 들여다보는 중에 출발 명령 — 일어나며 끊는다
        this.stopInspect();
      }
      mixer.update(dt);

      // 앉기 침하: 앉는 동안 0.26u 가라앉고, 일어나면 같은 호흡으로 떠오른다
      const sinkTarget = (gesture === 'sit' || gesture === 'sitDown') ? 0.26 : 0;
      sitSink += (sinkTarget - sitSink) * Math.min(1, dt * 1.8);

      // 접지 보정 + 발자국 (게스처와 유예 중엔 동결 — 앉은 발도, 일어나는 발도 기준이 아니다)
      gestureGrace = Math.max(0, gestureGrace - dt);
      if (footL && footR && gesture === 'none' && gestureGrace <= 0 && root.parent) {
        root.updateMatrixWorld(true);
        footL.getWorldPosition(fw);
        const ly = fw.y;
        footR.getWorldPosition(fw);
        const ry = fw.y;
        root.parent.getWorldPosition(pw);
        const ground = pw.y;
        // 사이클 최저점 추적: 즉시 하강, 완만 상승 — 가장 깊이 딛는 순간이 기준
        const minNow = Math.min(ly, ry);
        rollingMin = Math.min(minNow, (rollingMin === Infinity ? minNow : rollingMin) + 0.12 * dt);
        const err = (rollingMin - sole) - ground;
        groundCorr = THREE.MathUtils.lerp(groundCorr, THREE.MathUtils.clamp(groundCorr - err, -1.8, 0.4), Math.min(1, dt * 8));

        // 발자국: 발이 접지 대역(표면+2.5cm)으로 '진입'하는 순간, 이동 중일 때만
        stepClock += dt;
        if (onStep && moving && v > 0.05) {
          // 히스테리시스: 진입 2.5cm / 이탈 4.5cm — 문턱 채터링 방지. 발별 쿨다운 0.22s.
          const inL = contactL ? ly - sole < ground + 0.045 : ly - sole < ground + 0.025;
          const inR = contactR ? ry - sole < ground + 0.045 : ry - sole < ground + 0.025;
          if (inL && !contactL && stepClock - lastStepL > 0.22) { onStep(Math.min(1, v / 2.0)); lastStepL = stepClock; }
          if (inR && !contactR && stepClock - lastStepR > 0.22) { onStep(Math.min(1, v / 2.0)); lastStepR = stepClock; }
          contactL = inL;
          contactR = inR;
        } else {
          contactL = false;
          contactR = false;
        }
      }
      root.position.y = baseY + groundCorr - sitSink;
    },
  };
}
