from pathlib import Path

app = Path('src/App.tsx')
s = app.read_text()
s = s.replace("const BUILD_LABEL = 'v2.52.0 · BUILD 401 · Interaction Library — 오브젝트가 행동 씨앗을 건넨다';", "const BUILD_LABEL = 'v2.53.0 · BUILD 402 · Animal Life — 동물들이 자기 발로 세계를 걷기 시작했다';")
app.write_text(s)

p = Path('src/engine/props.ts')
s = p.read_text()
s = s.replace("export const ANIMATED_PROPS = new Set(['rogue', 'scavenger', 'cow']);", "export const ANIMATED_PROPS = new Set(['rogue', 'scavenger', 'cow', 'dog', 'duck', 'chicky', 'horse', 'piggy', 'bear', 'deer', 'boar', 'wolf', 'rabbit']);")
s = s.replace("    if (objId === 'cow') return await loadKitModelWithClips('cow', loadModel); // BUILD 110\n    return null;", "    if (['cow', 'dog', 'duck', 'chicky', 'horse', 'piggy', 'bear', 'deer', 'boar', 'wolf', 'rabbit'].includes(objId)) return await loadKitModelWithClips(objId, loadModel); // BUILD 402\n    return null;")
p.write_text(s)

p = Path('src/scene/PlanetWorld.tsx')
s = p.read_text()
s = s.replace("import { createPropObject } from '../engine/props';", "import { createPropObject, createPropAnimated } from '../engine/props';\nimport { ROAMING_ANIMALS, animalTemperament, chooseAnimalGoal, makeAnimalState, mapAnimalClips, playAnimalMode, type AnimalLifeState } from '../life/animalLife';")

old = "const propMap = useRef(new Map<string, { anchor: THREE.Group; obj: string; title: string; flag?: { v: number; base: number; dir: [number, number, number] } }>());"
new = "const propMap = useRef(new Map<string, { anchor: THREE.Group; obj: string; title: string; flag?: { v: number; base: number; dir: [number, number, number] }; animal?: AnimalLifeState }>());"
if old not in s: raise SystemExit('propMap declaration not found')
s = s.replace(old, new, 1)

old = "const newRec: { anchor: THREE.Group; obj: string; title: string; flag?: { v: number; base: number; dir: [number, number, number] } } = { anchor, obj: pr.obj, title };"
new = "const newRec: { anchor: THREE.Group; obj: string; title: string; flag?: { v: number; base: number; dir: [number, number, number] }; animal?: AnimalLifeState } = { anchor, obj: pr.obj, title };"
if old not in s: raise SystemExit('newRec declaration not found')
s = s.replace(old, new, 1)

old = """      void createPropObject(pr.obj, seed || 7).then((obj) => {
        const cur = propMap.current.get(pr.id);
        if (!obj || !cur || cur.anchor !== anchor) return;
        dressUp(obj);
        anchor.add(obj);
        applyXform(anchor, pr);
      });
"""
new = """      const mountStatic = () => void createPropObject(pr.obj, seed || 7).then((obj) => {
        const cur = propMap.current.get(pr.id);
        if (!obj || !cur || cur.anchor !== anchor) return;
        dressUp(obj);
        anchor.add(obj);
        applyXform(anchor, pr);
      });
      if (ROAMING_ANIMALS.has(pr.obj)) {
        void createPropAnimated(pr.obj).then((loaded) => {
          const cur = propMap.current.get(pr.id);
          if (!cur || cur.anchor !== anchor) return;
          if (!loaded) { mountStatic(); return; }
          dressUp(loaded.group);
          anchor.add(loaded.group);
          const animal = makeAnimalState(pr.obj, new THREE.Vector3(...pr.dir), seed || 7);
          animal.mixer = new THREE.AnimationMixer(loaded.group);
          animal.clips = mapAnimalClips(animal.mixer, loaded.animations);
          cur.animal = animal;
          playAnimalMode(animal, 'idle');
          applyXform(anchor, pr);
        }).catch(mountStatic);
      } else mountStatic();
"""
if old not in s: raise SystemExit('prop load block not found')
s = s.replace(old, new, 1)

anchor = """    rigRef.current?.update(dt, MV.mode === 'run' ? 0.9 : 0.5, moving, state.clock.elapsedTime, moving ? SP.walkSpeed * spdMul * dt : 0);
"""
insert = anchor + """    // BUILD 402: 배치된 동물들의 자유 로밍. 각자의 집 반경 안에서 쉬고, 걷고, 뛰며 별이에 반응한다.
    for (const rec of propMap.current.values()) {
      const A = rec.animal;
      if (!A || !built) continue;
      A.mixer?.update(dt);
      A.timer -= dt;
      const cfg = animalTemperament(A.kind);
      const byeoliDir = roamRef.current?.d ?? p.clone().normalize();
      const distToByeoli = Math.acos(THREE.MathUtils.clamp(A.dir.dot(byeoliDir), -1, 1));
      if (cfg.approachDistance > 0 && distToByeoli < cfg.approachDistance) {
        A.goal.copy(byeoliDir);
      } else if (cfg.fleeDistance > 0 && distToByeoli < cfg.fleeDistance) {
        const away = A.dir.clone().sub(byeoliDir).add(A.dir).normalize();
        A.goal.copy(away);
      } else if (A.timer <= 0 && A.dir.angleTo(A.goal) < 0.012) {
        chooseAnimalGoal(A);
        playAnimalMode(A, 'idle');
      }
      const angGoal = A.dir.angleTo(A.goal);
      if (A.timer <= 0 && angGoal > 0.008) {
        const urgent = distToByeoli < cfg.fleeDistance || (cfg.approachDistance > 0 && distToByeoli < cfg.approachDistance);
        playAnimalMode(A, urgent ? 'run' : 'walk');
        const speed = urgent ? cfg.runSpeed : cfg.speed;
        const axis = new THREE.Vector3().crossVectors(A.dir, A.goal);
        if (axis.lengthSq() > 1e-8) {
          axis.normalize();
          A.dir.applyAxisAngle(axis, Math.min(angGoal, speed * dt)).normalize();
          const tangent = new THREE.Vector3().crossVectors(axis, A.dir).normalize();
          A.tangent.lerp(tangent, Math.min(1, dt * 5)).normalize();
        }
      } else if (A.timer > 0) {
        playAnimalMode(A, 'idle');
      }
      const rr = built.surfaceR(A.dir) - 0.02;
      rec.anchor.position.copy(A.dir).multiplyScalar(rr);
      rec.anchor.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), A.dir);
      const inner = rec.anchor.children[0];
      if (inner) {
        const forward = A.tangent.clone();
        const localForward = forward.applyQuaternion(rec.anchor.quaternion.clone().invert());
        inner.rotation.y = Math.atan2(localForward.x, localForward.z);
      }
    }
"""
if anchor not in s: raise SystemExit('frame anchor not found')
s = s.replace(anchor, insert, 1)

old = """          if (kind === 'camera') {
            wrapper.position.set(0, -0.012, -0.008);
            wrapper.rotation.set(Math.PI / 2, 0, Math.PI);
            heldCameraRef.current = wrapper;
          } else {
            wrapper.position.set(0, -0.01, -0.004);
            wrapper.rotation.set(Math.PI / 2, 0, Math.PI / 2);
            heldPhoneRef.current = wrapper;
          }
"""
new = """          if (kind === 'camera') {
            // BUILD 402: 손바닥 중심에 카메라 그립이 오도록 손목 기준 재보정.
            wrapper.position.set(0.004, -0.018, -0.012);
            wrapper.rotation.set(Math.PI / 2, -0.08, Math.PI);
            heldCameraRef.current = wrapper;
          } else {
            // 화면이 얼굴 쪽을 향하고 손가락 안쪽에 놓이도록 세로 그립 보정.
            wrapper.position.set(0.003, -0.015, -0.006);
            wrapper.rotation.set(Math.PI / 2, 0.12, Math.PI / 2);
            heldPhoneRef.current = wrapper;
          }
"""
if old not in s: raise SystemExit('device wrapper block not found')
s = s.replace(old, new, 1)

old = "device.position.set(kind === 'camera' ? 0.015 : 0.01, kind === 'camera' ? -0.035 : -0.025, kind === 'camera' ? -0.02 : -0.012);"
new = "device.position.set(kind === 'camera' ? 0.008 : 0.004, kind === 'camera' ? -0.024 : -0.018, kind === 'camera' ? -0.012 : -0.006);"
if old not in s: raise SystemExit('device asset offset not found')
s = s.replace(old, new, 1)

p.write_text(s)
