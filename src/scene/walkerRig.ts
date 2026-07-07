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
  /** BUILD 104: 마법 의자 자산 주입 (클립 리그 전용, 선택) */
  setChairAsset?: (obj: THREE.Group, seatY: number, seatCz?: number) => void;
  /** BUILD 136: 탈것 — 앉은 채(없으면 선 채) 이동한다. 로코모션 배제 */
  setRiding?: (on: boolean) => void;
  /** BUILD 138: 탑승 클립의 엉덩이 높이 — 바닥 양반다리 0.02, 의자 앉기 0.3, 서서 타면 0 */
  rideSeat?: () => number;
  /** BUILD 146: 여분 클립 하나를 즉흥으로 — 재생 길이(초) 반환, 없거나 바쁘면 0 */
  flourish?: () => number;
  /** BUILD 146: 두리번 — 머리 뼈에 요 오프셋 (0이면 정면) */
  setLook?: (y: number) => void;
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
  const sitIdleFloor = mk('Sit_Floor_Idle', false); // BUILD 138: 바닥파/의자파 구분 — 엉덩이 높이가 다르다
  const sitIdle = sitIdleFloor ?? mk('Sitting', false) ?? mk('Sitting Idle', false);
  const rideSeatH = sitIdle ? (sitIdleFloor ? 0.02 : 0.17) : 0; // BUILD 139: 의자파 0.3→0.17 — 방석이 무릎을 파고들었다
  const standUp = mk('Sit_Floor_StandUp');
  // BUILD 146: 여분 클립 — 로코모션/제스처에 안 쓰인 나머지가 이 아이의 개성이다
  const knownNames = new Set([cWalk.name, cRun.name, cIdle.name,
    'PickUp', 'Interact', 'Pickup', 'Sit_Floor_Down', 'Sit_Floor_Idle', 'Sitting', 'Sitting Idle', 'Sit_Floor_StandUp']);
  const extras = animations
    .filter((c) => !knownNames.has(c.name))
    .map((c) => { const a = mixer.clipAction(c); a.setLoop(THREE.LoopOnce, 1); a.clampWhenFinished = true; return a; });
  const headBone0 = null as THREE.Object3D | null; // findBone은 아래에서 정의 — 자리표시
  void headBone0;
  let lookYaw = 0;

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
  const hipsBone = findBone(/Hips$/i, /pelvis/i, /^hips$/i);
  const headBone = findBone(/Head$/i); // BUILD 146: 두리번용
  // 밑창: 발끝 뼈 기준 얇게, 발목 기준이면 두껍게
  const sole = toeL ? 0.012 : 0.035;
  const baseY = root.position.y;
  const baseX = root.position.x; const baseZ = root.position.z; // BUILD 136: 탈것 하차 시 원점 복귀용
  let groundCorr = 0;
  // BUILD 094: '평균'이 아니라 '사이클 최저점'을 땅에 맞춘다 — 평균 정합은 접지 순간 발을 묻는다.
  // rollingMin: 즉시 내려가고, 천천히(0.12u/s) 올라오는 최저점 추적기.
  let rollingMin = Infinity;
  let gestureGrace = 0; // BUILD 098: 제스처 직후 접지 보정을 서두르지 않는다 (일어날 때 튕김 방지)
  // BUILD 100: Mixamo 'Sitting'은 의자 높이다 — 앉는 동안 몸을 천천히 가라앉혀 땅에 앉힌다.
  // 일어날 땐 같은 속도로 떠오른다 — 툭 튀는 대신 스르륵.
  let sitSink = 0;
  // BUILD 101: 발 앵커 (Vase 진단 — 무게중심과 발의 어긋남).
  // 앉는 애니는 발이 앞으로 나가지만 좌표는 몸 중심이라, 일어날 때 그 차이만큼 툭 튄다.
  // 해법: 제스처 동안 '발 중점'을 붙박고, 발이 움직인 만큼 몸을 역보정한다 —
  // 사람은 발이 있던 자리에 앉고, 발이 있던 자리에서 일어난다.
  let feetAnchor: { x: number; z: number } | null = null;
  let feetOffX = 0;
  let feetOffZ = 0;
  // BUILD 104: 마법 의자 — 앉기 전에 샤라락 나타났다가, 일어나면 샤라락 사라진다.
  // 앉기 클립들은 애초에 '의자 높이'로 만들어졌다. 의자를 주는 것이 클립의 설계를 존중하는 길.
  let chairAsset: THREE.Group | null = null;
  let chairFresh = false; // BUILD 190: 등장 프레임엔 스냅, 이후엔 부드럽게 추적
  let chairSeatY = 0.29;
  let chairSeatCz = 0.037; // BUILD 190: 좌면 z중심 — Chair.glb 직파싱 실측값
  let chair: THREE.Group | null = null;
  let chairPhase: 'in' | 'hold' | 'out' | 'none' = 'none';
  let chairT = 0;
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

  type Gesture = 'none' | 'pickup' | 'sitDown' | 'sit' | 'standUp' | 'flourish'; // BUILD 146
  let gesture: Gesture = 'none';
  let riding = false; // BUILD 136: 구름 위
  mixer.addEventListener('finished', (e) => {
    const a = (e as unknown as { action: THREE.AnimationAction }).action;
    if (a === sitDown && gesture === 'sitDown' && sitIdle) { switchTo(sitIdle, 0.25); gesture = 'sit'; }
    else if (a === standUp && gesture === 'standUp') { switchTo(idle, 0.3); gesture = 'none'; gestureGrace = 0.9; rollingMin = Infinity; }
    else if (a === pickup && gesture === 'pickup') { switchTo(idle, 0.4); gesture = 'none'; gestureGrace = 0.9; rollingMin = Infinity; }
    else if (gesture === 'flourish' && extras.includes(a)) { switchTo(idle, 0.35); gesture = 'none'; gestureGrace = 0.6; rollingMin = Infinity; } // BUILD 146
  });

  // 걷기↔뛰기 전환 문턱: 두 고유속도의 기하평균 부근
  const runGate = Math.sqrt(natural.walk * natural.run);

  return {
    inspecting: () => gesture !== 'none',
    phase: () => 0, // 상하 흔들림은 클립 안에 있다 — 홀더 bob은 끈다
    setChairAsset(obj: THREE.Group, seatY: number, seatCz = 0.037) {
      chairAsset = obj;
      chairSeatY = seatY;
      chairSeatCz = seatCz; // BUILD 190: 좌면 z중심 (의자 로컬, 실측)
    },
    // BUILD 136: 탈것 — 앉는 클립(Sit_Floor_Idle)이 있으면 앉아 타고, 없으면 서서 탄다
    setRiding(on: boolean) {
      riding = on;
      gesture = 'none';
      sitSink = 0;
      root.position.set(baseX, baseY, baseZ);
      if (chair && chairPhase !== 'none') { chair.visible = false; chairPhase = 'none'; }
      if (on) switchTo(sitIdle ?? idle, 0.3);
      else { switchTo(idle, 0.3); gestureGrace = 0.9; rollingMin = Infinity; }
    },
    rideSeat: () => rideSeatH, // BUILD 138
    // BUILD 146: 즉흥 — 여분 클립 하나. 걷는 기계에게 주는 자유
    flourish() {
      if (riding || gesture !== 'none' || !extras.length) return 0;
      const a = extras[Math.floor(Math.random() * extras.length)];
      gesture = 'flourish';
      switchTo(a, 0.3);
      return a.getClip().duration;
    },
    setLook(y: number) { lookYaw = y; },
    playInspect(kind = 'pickup') {
      if (riding) return; // BUILD 138: 구름 위에선 도착 제스처를 받지 않는다
      if (gesture !== 'none') return;
      // BUILD 105: 전원 의자 — 의자 높이 클립은 앉고, 바닥 클립은 의자 위에 양반다리로.
      // (의자파가 3/11뿐이라 열 번을 새로고침해도 의자를 못 보는 문제의 해답)
      if (kind === 'sit' && chairAsset && root.parent && sitIdle) {
        if (!chair) {
          chair = chairAsset;
          root.parent.add(chair);
        }
        chair.position.set(0, 0, 0.05); // BUILD 190: 초기값일 뿐 — 아래 힙 추적이 매 프레임 좌면을 엉덩이 밑으로 데려간다
        chairFresh = true;
        chair.rotation.set(0, 0, 0);
        chair.scale.setScalar(0.001);
        chair.visible = true;
        chairPhase = 'in';
        chairT = 0;
      }
      // 발 앵커: 지금 발이 있는 자리 (홀더 로컬)
      // BUILD 102.1: 반드시 '부모 로컬' 좌표로 — 월드 축으로 재고 로컬 축(root.position)에
      // 보정하면, 몸이 회전해 있을 때 좌표계가 어긋나 양의 피드백 → 앉는 순간 떠밀려간다.
      if (footL && footR && root.parent) {
        root.updateMatrixWorld(true);
        footL.getWorldPosition(fw);
        root.parent.worldToLocal(fw);
        const lx = fw.x; const lz = fw.z;
        footR.getWorldPosition(fw);
        root.parent.worldToLocal(fw);
        feetAnchor = { x: (lx + fw.x) / 2, z: (lz + fw.z) / 2 };
      }
      if (kind === 'sit' && sitIdle) {
        if (sitDown) { gesture = 'sitDown'; switchTo(sitDown, 0.35); }
        else { gesture = 'sit'; switchTo(sitIdle, 0.55); } // 전환 클립이 없으면 느린 페이드로
      } else if (pickup) { gesture = 'pickup'; switchTo(pickup, 0.3); }
      else if (sitIdle) { gesture = 'sit'; switchTo(sitIdle, 0.55); } // 들여다보기가 없으면 앉는다
    },
    stopInspect() {
      if (riding) return; // BUILD 138
      if (chair && chairPhase !== 'none' && chairPhase !== 'out') { chairPhase = 'out'; chairT = 0; }
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
      if (riding) { mixer.update(dt); return; } // BUILD 136: 구름 위에선 클립만 흐른다 — 걷기/침하/의자 전부 배제
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
      if (headBone && lookYaw !== 0) headBone.rotation.y += lookYaw; // BUILD 146: 믹서가 쓴 위에 두리번을 얹는다
      // BUILD 179: 178의 워치독 철회 — 리그는 이미 매 프레임 y를 합성한다(root.y = baseY + groundCorr - sitSink)

      // 앉기 침하: 앉는 동안 0.26u 가라앉고, 일어나면 같은 호흡으로 떠오른다
      // 마법 의자 등장/퇴장: 살짝 튀어올랐다 자리잡는 팝 (0.45s), 사라질 땐 빨려들 듯 (0.28s)
      if (chair && chairPhase === 'in') {
        chairT += dt;
        const k = Math.min(1, chairT / 0.45);
        const pop = k < 0.7 ? (k / 0.7) * 1.12 : 1.12 - ((k - 0.7) / 0.3) * 0.12;
        chair.scale.setScalar(Math.max(0.001, pop));
        if (k >= 1) chairPhase = 'hold';
      } else if (chair && chairPhase === 'out') {
        chairT += dt;
        const k = Math.min(1, chairT / 0.28);
        chair.scale.setScalar(Math.max(0.001, 1 - k));
        if (k >= 1) { chair.visible = false; chairPhase = 'none'; }
      }

      // BUILD 103→104: 적응형 침하 — 의자가 있으면 '좌면'에, 없으면 땅(0.14)에 엉덩이를 맞춘다.
      let sinkTarget = 0;
      if ((gesture === 'sit' || gesture === 'sitDown') && hipsBone && root.parent) {
        hipsBone.getWorldPosition(fw);
        root.parent.worldToLocal(fw);
        // BUILD 190: 의자가 엉덩이를 따라간다 — 발 앵커가 몸을 되미는 동안에도 좌면 중심은 늘 힙 밑에.
        // (상수 z 오프셋 3대(0.05→0.18→?)가 전부 실패한 이유: 앉기 클립·발 앵커 보정마다 힙의 최종 위치가 달라서)
        if (chair && (chairPhase === 'in' || chairPhase === 'hold')) {
          const cx = fw.x;
          const cz = fw.z - chairSeatCz;
          if (chairFresh) { chair.position.x = cx; chair.position.z = cz; chairFresh = false; }
          else {
            const kc = Math.min(1, dt * 6);
            chair.position.x += (cx - chair.position.x) * kc;
            chair.position.z += (cz - chair.position.z) * kc;
          }
        }
        const hipsRaw = fw.y + sitSink; // 침하를 걷어낸 원시 힙 높이 (부모 로컬, 지면=0)
        // 발 깊이 상한: 다리가 앞으로 뻗는 자세에서 발이 모래에 10cm 이상 잠기지 않게
        let footMin = 9;
        if (footL && footR) {
          footL.getWorldPosition(fw); root.parent.worldToLocal(fw); footMin = fw.y;
          footR.getWorldPosition(fw); root.parent.worldToLocal(fw); footMin = Math.min(footMin, fw.y);
          footMin += sitSink;
        }
        const onChair = chairPhase === 'in' || chairPhase === 'hold';
        if (onChair) {
          // 좌면에 정렬 — 바닥 클립(raw가 낮음)은 음수 침하 = 들어올려 양반다리로 앉힌다
          sinkTarget = THREE.MathUtils.clamp(hipsRaw - (chairSeatY + 0.04), -0.28, 0.34);
        } else {
          sinkTarget = THREE.MathUtils.clamp(Math.min(hipsRaw - 0.14, footMin + 0.1), 0, 0.34);
        }
      }
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
      // 발 앵커 역보정: 제스처 동안 발 중점이 앵커에서 벗어난 만큼 몸을 되민다
      if (footL && footR && root.parent && feetAnchor && (gesture !== 'none' || gestureGrace > 0)) {
        root.updateMatrixWorld(true);
        footL.getWorldPosition(fw);
        root.parent.worldToLocal(fw);
        const lx = fw.x; const lz = fw.z;
        footR.getWorldPosition(fw);
        root.parent.worldToLocal(fw);
        const curX = (lx + fw.x) / 2 - feetOffX; // 보정분 제외한 원시 발 위치 (부모 로컬)
        const curZ = (lz + fw.z) / 2 - feetOffZ;
        // 발을 못박되, 보정 속도는 0.8u/s로 제한 — 발 떨림이 몸의 점프로 역류하지 않게
        const tx = feetAnchor.x - curX;
        const tz = feetAnchor.z - curZ;
        const step = 0.8 * dt;
        feetOffX += THREE.MathUtils.clamp(tx - feetOffX, -step, step);
        feetOffZ += THREE.MathUtils.clamp(tz - feetOffZ, -step, step);
        // 안전망: 어떤 경우에도 보정이 0.6u를 넘지 않는다
        feetOffX = THREE.MathUtils.clamp(feetOffX, -0.6, 0.6);
        feetOffZ = THREE.MathUtils.clamp(feetOffZ, -0.6, 0.6);
      } else if (feetAnchor) {
        // 제스처가 완전히 끝났다 — 보정을 조용히 거둔다 (걷기 시작하면 더 빨리)
        const k = Math.min(1, dt * (moving ? 4 : 1.2));
        feetOffX *= 1 - k;
        feetOffZ *= 1 - k;
        if (Math.abs(feetOffX) + Math.abs(feetOffZ) < 0.002) { feetAnchor = null; feetOffX = 0; feetOffZ = 0; }
      }
      root.position.x = feetOffX;
      root.position.z = feetOffZ;
      root.position.y = baseY + groundCorr - sitSink;
    },
  };
}
