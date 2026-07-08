// BUILD 239: 달의 토끼 — 로밍 AI. 달 표면(구)을 배회한다.
// 클립: Idle·Walk·Run·Jump·Eat·Wave (제자리 애니 = in-place). 이동은 코드가 구면에서 직접 민다.
// 좌표: 토끼는 달(built.moon)의 자식. 달 로컬 방향 d 위에 얹히고, moon이 회전해도 표면에 붙어 있다.
import * as THREE from 'three';

type State = 'idle' | 'walk' | 'run' | 'eat' | 'jump' | 'wave';
const YUP = new THREE.Vector3(0, 1, 0);

export function createMoonRabbit(
  moon: THREE.Object3D,
  moonR: number,
  group: THREE.Group,
  animations: THREE.AnimationClip[],
) {
  // 토끼를 달 로컬 크기에 맞춘다: 달 반경의 ~14% 높이 (우화적으로 또렷하게)
  const bodyH = 0.22; // assemble에서 잰 로컬 높이
  const targetH = moonR * 0.14;
  group.scale.setScalar(targetH / bodyH);
  // BUILD 242: 달의 토끼는 지면 안개에서 자유롭다 — keepLook이 박은 heightFog가
  // 달 높이(월드 y 큼)에서 토끼를 뿌옇게 뭉갰다(Vase 목격). 셰이더를 걷어내고 안개 면제.
  group.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).forEach((m) => {
      const std = m as THREE.MeshStandardMaterial;
      std.onBeforeCompile = () => {};
      std.fog = false;
      std.userData.hfog = false;
      std.customProgramCacheKey = () => 'moonRabbit-nofog';
      std.needsUpdate = true;
    });
  });
  moon.add(group);

  const mixer = new THREE.AnimationMixer(group);
  const actions: Record<string, THREE.AnimationAction> = {};
  for (const c of animations) {
    const key = c.name.toLowerCase();
    actions[key] = mixer.clipAction(c);
  }
  // 이름 매핑 (병합 시 부여한 이름)
  const A = (n: string) => actions[n.toLowerCase()] ?? null;
  let cur: THREE.AnimationAction | null = null;
  const play = (name: string, fade = 0.25) => {
    const next = A(name);
    if (!next || next === cur) return;
    next.reset().fadeIn(fade).play();
    if (cur) cur.fadeOut(fade);
    cur = next;
  };

  // 달 로컬 구면 좌표: d(현재 위치 방향), T(진행 방향, d에 수직)
  const d = new THREE.Vector3(0, 0, 1);       // 지구 보는 면 근처에서 시작
  const T = new THREE.Vector3(1, 0, 0);
  T.addScaledVector(d, -T.dot(d)).normalize();
  const surfR = moonR + 0.001;

  let state: State = 'idle';
  let timer = 1.2;
  let turnGoal = 0;   // 남은 회전량(rad)
  const speeds: Record<State, number> = { idle: 0, walk: 0.16, run: 0.42, eat: 0, jump: 0.1, wave: 0 };
  play('Idle', 0);

  const tq = new THREE.Quaternion();
  const tv = new THREE.Vector3();
  const seedRnd = (() => { let s = 20260708; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; })();

  const pickNext = () => {
    const r = seedRnd();
    // 어슬렁50 / 뛰기12 / 먹기18 / 손흔들기8 / 폴짝12
    if (r < 0.50) { state = 'walk'; timer = 2.5 + seedRnd() * 3.5; }
    else if (r < 0.62) { state = 'run'; timer = 1.5 + seedRnd() * 2; }
    else if (r < 0.80) { state = 'eat'; timer = 2.5 + seedRnd() * 3; }
    else if (r < 0.88) { state = 'wave'; timer = 2 + seedRnd() * 1.5; }
    else { state = 'jump'; timer = 1.5 + seedRnd() * 1.5; }
    // 이동 상태면 새 방향으로 살짝 튼다
    if (state === 'walk' || state === 'run') turnGoal = (seedRnd() < 0.5 ? -1 : 1) * (0.3 + seedRnd() * 2.2);
    else turnGoal = 0;
    const clipName = state === 'walk' ? 'Walk' : state === 'run' ? 'Run' : state === 'eat' ? 'Eat' : state === 'wave' ? 'Wave' : state === 'jump' ? 'Jump' : 'Idle';
    play(clipName);
  };

  return {
    update(dt: number) {
      mixer.update(dt);
      timer -= dt;
      if (timer <= 0) {
        // 이동 뒤엔 잠깐 쉰다(Idle) — 그 다음 새 행동
        if ((state === 'walk' || state === 'run') && seedRnd() < 0.6) { state = 'idle'; timer = 0.8 + seedRnd() * 1.8; play('Idle'); }
        else pickNext();
      }
      // 회전 소화
      if (turnGoal !== 0) {
        const step = Math.sign(turnGoal) * Math.min(Math.abs(turnGoal), dt * 1.2);
        T.applyQuaternion(tq.setFromAxisAngle(d, step));
        turnGoal -= step;
      }
      // 전진 (구면에서 d를 T 방향으로 굴린다)
      const sp = speeds[state];
      if (sp > 0) {
        const th = (sp * dt) / surfR;
        tv.crossVectors(d, T).normalize();          // 회전축
        tq.setFromAxisAngle(tv, th);
        d.applyQuaternion(tq).normalize();
        T.applyQuaternion(tq);
        T.addScaledVector(d, -T.dot(d)).normalize();
      }
      // 배치: 달 로컬 표면에 얹고, 위(+Y)를 바깥 법선 d에, 정면(-Z)을 진행 T에 맞춘다
      group.position.copy(d).multiplyScalar(surfR);
      const zAxis = tv.copy(T).negate();            // 모델 정면이 -Z라 가정
      const mUp = d;
      const mRight = new THREE.Vector3().crossVectors(mUp, zAxis).normalize();
      const zOrtho = new THREE.Vector3().crossVectors(mRight, mUp).normalize();
      const m = new THREE.Matrix4().makeBasis(mRight, mUp, zOrtho);
      group.quaternion.setFromRotationMatrix(m);
    },
    dispose() { moon.remove(group); mixer.stopAllAction(); },
  };
}
