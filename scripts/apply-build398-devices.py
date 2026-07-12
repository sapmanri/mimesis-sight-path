from pathlib import Path

p = Path('src/scene/PlanetWorld.tsx')
s = p.read_text()

old_refs = """  const heldCameraRef = useRef<THREE.Group | null>(null);
  const heldPhoneRef = useRef<THREE.Group | null>(null);
  const heldDeviceTimer = useRef<number | null>(null);"""
new_refs = """  const heldCameraRef = useRef<THREE.Group | null>(null);
  const heldPhoneRef = useRef<THREE.Group | null>(null);
  const heldDeviceHandRef = useRef<THREE.Object3D | null>(null);
  const heldDeviceRootRef = useRef<THREE.Group | null>(null);
  const heldDeviceTimer = useRef<number | null>(null);"""
if old_refs not in s:
    raise SystemExit('held refs anchor not found')
s = s.replace(old_refs, new_refs, 1)

old_mount = """      // BUILD 392: 사진/글쓰기 동작의 빈손 해결 — 오른손 뼈에 카메라·휴대폰을 미리 달고, 해당 동작 중에만 보인다.
      let deviceHand: THREE.Object3D | null = null;
      group.traverse((n) => { if ((n as THREE.Bone).isBone && /RightHand$/i.test(n.name) && !deviceHand) deviceHand = n; });
      if (!deviceHand) group.traverse((n) => { if ((n as THREE.Bone).isBone && /LeftHand$/i.test(n.name) && !deviceHand) deviceHand = n; });
      if (!deviceHand) group.traverse((n) => { if ((n as THREE.Bone).isBone && /hand/i.test(n.name) && !deviceHand) deviceHand = n; });
      if (deviceHand) {
        const h = deviceHand as THREE.Object3D;
        group.updateMatrixWorld(true);
        const mountDevice = (kind: 'camera' | 'phone') => {
          const wrapper = new THREE.Group();
          // BUILD 395: 손 본의 자식은 이미 본 변환을 상속한다. 월드 스케일 역보정은
          // 작은 로컬 오프셋까지 크게 증폭해 소품이 몸 주위를 공전하게 만들었다.
          wrapper.scale.setScalar(1);
          wrapper.visible = false;
          h.add(wrapper);
          if (kind === 'camera') {
            wrapper.position.set(0, -0.018, -0.01);
            wrapper.rotation.set(Math.PI / 2, 0, Math.PI);
            heldCameraRef.current = wrapper;
          } else {
            wrapper.position.set(0, -0.012, -0.006);
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
new_mount = """      // BUILD 398: 손 본의 자식으로 직접 붙이면 일부 GLB의 본 스케일이 소품을 우주로 날린다.
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
if old_mount not in s:
    raise SystemExit('old device mount block not found')
s = s.replace(old_mount, new_mount, 1)

old_update = """    rigRef.current?.update(dt, MV.mode === 'run' ? 0.9 : 0.5, moving, state.clock.elapsedTime, moving ? SP.walkSpeed * spdMul * dt : 0);
    PLANET_CENTER.copy(built.planet.position);"""
new_update = """    rigRef.current?.update(dt, MV.mode === 'run' ? 0.9 : 0.5, moving, state.clock.elapsedTime, moving ? SP.walkSpeed * spdMul * dt : 0);
    // BUILD 398: 소품 루트는 scene 좌표에서 손의 실제 월드 위치·회전을 추적한다.
    const heldHand = heldDeviceHandRef.current;
    const heldRoot = heldDeviceRootRef.current;
    if (heldHand && heldRoot) {
      heldHand.getWorldPosition(heldRoot.position);
      heldHand.getWorldQuaternion(heldRoot.quaternion);
    }
    PLANET_CENTER.copy(built.planet.position);"""
if old_update not in s:
    raise SystemExit('frame update anchor not found')
s = s.replace(old_update, new_update, 1)

old_cleanup = """      heldDeviceTimer.current = null;
      heldCameraRef.current = null;
      heldPhoneRef.current = null;"""
new_cleanup = """      heldDeviceTimer.current = null;
      if (heldDeviceRootRef.current) scene.remove(heldDeviceRootRef.current);
      heldDeviceRootRef.current = null;
      heldDeviceHandRef.current = null;
      heldCameraRef.current = null;
      heldPhoneRef.current = null;"""
if old_cleanup not in s:
    raise SystemExit('device cleanup anchor not found')
s = s.replace(old_cleanup, new_cleanup, 1)
p.write_text(s)

app = Path('src/App.tsx')
t = app.read_text()
old_label = "const BUILD_LABEL = 'v2.48.0 · BUILD 397 · 모바일 UI 레일 — 여권·기록·에디터를 한 형식으로';"
new_label = "const BUILD_LABEL = 'v2.49.0 · BUILD 398 · 관찰일기 정리 + 손 소품 월드 추적 교정';"
if old_label not in t:
    raise SystemExit('BUILD 397 label not found')
app.write_text(t.replace(old_label, new_label, 1))
