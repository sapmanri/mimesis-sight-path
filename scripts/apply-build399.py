from pathlib import Path

app = Path('src/App.tsx')
s = app.read_text()
old = "const BUILD_LABEL = 'v2.49.0 · BUILD 398 · 관찰일기 정리 + 손 소품 월드 추적 교정';"
new = "const BUILD_LABEL = 'v2.50.0 · BUILD 399 · 별이의 눈 — 먼저 바라보고, 그다음 다가간다';"
if old not in s:
    raise SystemExit('BUILD 398 label not found')
s = s.replace(old, new, 1)
app.write_text(s)

p = Path('src/scene/PlanetWorld.tsx')
s = p.read_text()

old = """  const hipsPRef = useRef<THREE.Object3D | null>(null); // BUILD 231(본토 140): 골반 뼈
  const footPRef = useRef<THREE.Object3D | null>(null); // BUILD 231(본토 142): 발 뼈 (왼발)
  const footRRef = useRef<THREE.Object3D | null>(null); // BUILD 275: 오른발 뼈
"""
new = """  const hipsPRef = useRef<THREE.Object3D | null>(null); // BUILD 231(본토 140): 골반 뼈
  const footPRef = useRef<THREE.Object3D | null>(null); // BUILD 231(본토 142): 발 뼈 (왼발)
  const footRRef = useRef<THREE.Object3D | null>(null); // BUILD 275: 오른발 뼈
  // BUILD 399: 별이의 눈 — 머리/목이 실제 관심 대상을 먼저 따라간다.
  const gazeHeadRef = useRef<THREE.Object3D | null>(null);
  const gazeNeckRef = useRef<THREE.Object3D | null>(null);
  const gazeState = useRef({ mode: 'none' as 'none' | 'prop' | 'pet' | 'sky', until: 0, next: 3, blend: 0 });
"""
if old not in s:
    raise SystemExit('bone refs anchor not found')
s = s.replace(old, new, 1)

old = """      hipsPRef.current = null;
      footPRef.current = null;
      footRRef.current = null;
      group.traverse((n) => {
        if (!hipsPRef.current && /hips$/i.test(n.name)) hipsPRef.current = n;
        if (!footPRef.current && /left.*foot$/i.test(n.name)) footPRef.current = n; // 왼발
        if (!footRRef.current && /right.*foot$/i.test(n.name)) footRRef.current = n; // 오른발
      });
"""
new = """      hipsPRef.current = null;
      footPRef.current = null;
      footRRef.current = null;
      gazeHeadRef.current = null;
      gazeNeckRef.current = null;
      group.traverse((n) => {
        if (!hipsPRef.current && /hips$/i.test(n.name)) hipsPRef.current = n;
        if (!footPRef.current && /left.*foot$/i.test(n.name)) footPRef.current = n; // 왼발
        if (!footRRef.current && /right.*foot$/i.test(n.name)) footRRef.current = n; // 오른발
        if ((n as THREE.Bone).isBone && !gazeHeadRef.current && /head$/i.test(n.name)) gazeHeadRef.current = n;
        if ((n as THREE.Bone).isBone && !gazeNeckRef.current && /neck$/i.test(n.name)) gazeNeckRef.current = n;
      });
"""
if old not in s:
    raise SystemExit('walker traverse anchor not found')
s = s.replace(old, new, 1)

# BUILD 398의 월드 추적 장치를 버리고, 이미 안정적으로 달랑거리는 랜턴과 같은 손목 앵커를 쓴다.
old = """      // BUILD 398: 손 본의 자식으로 직접 붙이면 일부 GLB의 본 스케일이 소품을 우주로 날린다.
      // 장면 루트에 두고 매 프레임 손의 월드 변환만 추적한다.
      let deviceHand: THREE.Object3D | null = null;
      const rightHand = /(?:^|[_:])(?:mixamorig)?right(?:_)?hand$|RightHand$/i;
      const leftHand = /(?:^|[_:])(?:mixamorig)?left(?:_)?hand$|LeftHand$/i;
      group.traverse((n) => { if ((n as THREE.Bone).isBone && rightHand.test(n.name) && !deviceHand) deviceHand = n; });
      if (!deviceHand) group.traverse((n) => { if ((n as THREE.Bone).isBone && leftHand.test(n.name) && !deviceHand) deviceHand = n; });
      if (deviceHand) {
        heldDeviceHandRef.current = deviceHand as THREE.Object3D;
        const deviceRoot = new THREE.Group();
        deviceRoot.visible = true;
        scene.add(deviceRoot);
        heldDeviceRootRef.current = deviceRoot;
        const mountDevice = (kind: 'camera' | 'phone') => {
          const wrapper = new THREE.Group();
          wrapper.visible = false;
          deviceRoot.add(wrapper);
          if (kind === 'camera') {
            wrapper.position.set(0.018, -0.025, -0.055);
            wrapper.rotation.set(Math.PI / 2, 0, Math.PI);
            heldCameraRef.current = wrapper;
          } else {
            wrapper.position.set(0.012, -0.018, -0.035);
            wrapper.rotation.set(Math.PI / 2, 0, Math.PI / 2);
            heldPhoneRef.current = wrapper;
          }
          void loadHeldDeviceAsset(kind).then((device) => {
            if (!alive) return;
            wrapper.add(device);
          }).catch(() => { /* 소품이 없으면 동작만 유지 */ });
        };
        mountDevice('camera');
        mountDevice('phone');
      }
"""
new = """      // BUILD 399: 랜턴이 안정적으로 달린 바로 그 오른손/손목 앵커를 카메라와 휴대폰도 공유한다.
      // 본의 월드 스케일만 상쇄하고 위치는 손목 원점에서 잡는다. 별도 scene 추적은 쓰지 않는다.
      let deviceHand: THREE.Object3D | null = null;
      group.traverse((n) => { if ((n as THREE.Bone).isBone && /RightHand$/i.test(n.name) && !deviceHand) deviceHand = n; });
      if (!deviceHand) group.traverse((n) => { if ((n as THREE.Bone).isBone && /LeftHand$/i.test(n.name) && !deviceHand) deviceHand = n; });
      if (deviceHand) {
        const h = deviceHand as THREE.Object3D;
        group.updateMatrixWorld(true);
        const ws = new THREE.Vector3();
        h.getWorldScale(ws);
        const invHandScale = 1 / Math.max(ws.x, 1e-6);
        const mountDevice = (kind: 'camera' | 'phone') => {
          const wrapper = new THREE.Group();
          wrapper.scale.setScalar(invHandScale);
          wrapper.visible = false;
          h.add(wrapper);
          if (kind === 'camera') {
            wrapper.position.set(0, -0.012, -0.008);
            wrapper.rotation.set(Math.PI / 2, 0, Math.PI);
            heldCameraRef.current = wrapper;
          } else {
            wrapper.position.set(0, -0.01, -0.004);
            wrapper.rotation.set(Math.PI / 2, 0, Math.PI / 2);
            heldPhoneRef.current = wrapper;
          }
          void loadHeldDeviceAsset(kind).then((device) => {
            if (!alive) return;
            // 랜턴의 손목 위치를 기준으로 손바닥 안쪽에 올린다.
            device.position.set(kind === 'camera' ? 0.015 : 0.01, kind === 'camera' ? -0.035 : -0.025, kind === 'camera' ? -0.02 : -0.012);
            wrapper.add(device);
          }).catch(() => { /* 소품이 없으면 동작만 유지 */ });
        };
        mountDevice('camera');
        mountDevice('phone');
      }
"""
if old not in s:
    raise SystemExit('held device mount anchor not found')
s = s.replace(old, new, 1)

old = """    rigRef.current?.update(dt, MV.mode === 'run' ? 0.9 : 0.5, moving, state.clock.elapsedTime, moving ? SP.walkSpeed * spdMul * dt : 0);
    // BUILD 398: 소품 루트는 scene 좌표에서 손의 실제 월드 위치·회전을 추적한다.
"""
new = """    rigRef.current?.update(dt, MV.mode === 'run' ? 0.9 : 0.5, moving, state.clock.elapsedTime, moving ? SP.walkSpeed * spdMul * dt : 0);
    // BUILD 399: 별이의 눈. 접근 목표는 걷기 전부터 보고, 목표가 없을 때는 가끔 반려동물이나 하늘을 본다.
    {
      const gazeBone = gazeHeadRef.current ?? gazeNeckRef.current;
      const GS = gazeState.current;
      let gazeTarget: THREE.Vector3 | null = null;
      const encounter = attractTarget.current;
      if (encounter) {
        const rec = propMap.current.get(encounter.id);
        if (rec) {
          gazeTarget = new THREE.Vector3();
          rec.anchor.getWorldPosition(gazeTarget);
          GS.mode = 'prop';
          GS.until = el + 0.4;
        }
      } else {
        if (el >= GS.next && el >= GS.until) {
          const canSeePet = !!petRef.current;
          GS.mode = canSeePet && Math.random() < 0.48 ? 'pet' : 'sky';
          GS.until = el + 2.2 + Math.random() * 3.2;
          GS.next = GS.until + 5 + Math.random() * 9;
          if (GS.mode === 'sky') narrate('별이는 문득 하늘을 올려다보았다.', 2500);
        }
        if (el < GS.until && GS.mode === 'pet' && petRef.current) {
          gazeTarget = new THREE.Vector3();
          petRef.current.pet.group.getWorldPosition(gazeTarget);
          gazeTarget.y += 0.12;
        } else if (el < GS.until && GS.mode === 'sky' && gazeBone) {
          gazeTarget = new THREE.Vector3();
          gazeBone.getWorldPosition(gazeTarget);
          gazeTarget.add(new THREE.Vector3(0.25, 3.2, -0.8));
        } else if (el >= GS.until) {
          GS.mode = 'none';
        }
      }
      if (gazeBone && walkerGroupRef.current && gazeTarget) {
        const headWorld = new THREE.Vector3();
        gazeBone.getWorldPosition(headWorld);
        const localDir = gazeTarget.sub(headWorld);
        const groupQ = new THREE.Quaternion();
        walkerGroupRef.current.getWorldQuaternion(groupQ);
        localDir.applyQuaternion(groupQ.invert()).normalize();
        const yaw = THREE.MathUtils.clamp(Math.atan2(localDir.x, localDir.z), -0.65, 0.65);
        const pitch = THREE.MathUtils.clamp(-Math.atan2(localDir.y, Math.hypot(localDir.x, localDir.z)), -0.34, 0.30);
        GS.blend += (1 - GS.blend) * Math.min(1, dt * 4.5);
        const qYaw = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw * 0.42 * GS.blend);
        const qPitch = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), pitch * 0.36 * GS.blend);
        gazeBone.quaternion.multiply(qYaw).multiply(qPitch);
      } else {
        GS.blend += (0 - GS.blend) * Math.min(1, dt * 3.5);
      }
    }
    // BUILD 398의 월드 추적은 폐기. 손 소품은 랜턴과 같은 손목 본의 자식으로 움직인다.
"""
if old not in s:
    raise SystemExit('rig update anchor not found')
s = s.replace(old, new, 1)

old = """      heldDeviceHandRef.current = null;
      heldCameraRef.current = null;
      heldPhoneRef.current = null;
"""
new = """      heldDeviceHandRef.current = null;
      heldCameraRef.current = null;
      heldPhoneRef.current = null;
      gazeHeadRef.current = null;
      gazeNeckRef.current = null;
      gazeState.current = { mode: 'none', until: 0, next: 3, blend: 0 };
"""
if old not in s:
    raise SystemExit('cleanup anchor not found')
s = s.replace(old, new, 1)

p.write_text(s)
