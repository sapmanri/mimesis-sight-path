from pathlib import Path
import re

# 1) Animal animation selection: copy the proven region-map rule.
p = Path('src/life/animalLife.ts')
s = p.read_text()
s = s.replace("export type AnimalClips = {\n  idle: THREE.AnimationAction | null;\n  walk: THREE.AnimationAction | null;\n  run: THREE.AnimationAction | null;\n  extras: THREE.AnimationAction[];\n};", "export type AnimalClips = {\n  idle: THREE.AnimationAction | null;\n  walk: THREE.AnimationAction | null;\n  run: THREE.AnimationAction | null;\n  extras: THREE.AnimationAction[];\n  names: string[];\n  canMove: boolean;\n};")
old = '''export function mapAnimalClips(mixer: THREE.AnimationMixer, clips: THREE.AnimationClip[]): AnimalClips {
  const idleClip = findClip(clips, /idle|stand|breath|graze|eat/);
  const walkClip = findClip(clips, /walk|walking|trot/);
  const runClip = findClip(clips, /run|running|gallop|sprint/);
  const used = new Set([idleClip, walkClip, runClip].filter(Boolean));
  return {
    idle: idleClip ? mixer.clipAction(idleClip) : clips[0] ? mixer.clipAction(clips[0]) : null,
    walk: walkClip ? mixer.clipAction(walkClip) : null,
    run: runClip ? mixer.clipAction(runClip) : null,
    extras: clips.filter((clip) => !used.has(clip)).map((clip) => mixer.clipAction(clip)),
  };
}'''
new = '''export function mapAnimalClips(mixer: THREE.AnimationMixer, clips: THREE.AnimationClip[]): AnimalClips {
  // BUILD 404: 지역맵에서 이미 정상 보행한 선택 규칙을 그대로 쓴다.
  // Walking_A를 최우선으로 잡아 cow의 미세 idle/graze 클립이 walk로 오인되는 일을 막는다.
  const walkClip = clips.find((c) => /walking_a$|^walk(ing)?(_loop)?$|\\|walk/i.test(c.name))
    ?? clips.find((c) => /walk|trot/i.test(c.name))
    ?? null;
  const runClip = clips.find((c) => /^run(ning)?(_loop)?$|\\|run|gallop|sprint/i.test(c.name)) ?? null;
  const idleClip = clips.find((c) => /^idle(_[a-z])?$/i.test(c.name))
    ?? clips.find((c) => /idle|stand|breath|graze|eat/i.test(c.name) && !/melee|ranged|combat|block/i.test(c.name))
    ?? null;
  const used = new Set([idleClip, walkClip, runClip].filter(Boolean));
  const idle = idleClip ? mixer.clipAction(idleClip) : clips[0] ? mixer.clipAction(clips[0]) : null;
  const walk = walkClip ? mixer.clipAction(walkClip) : null;
  const run = runClip ? mixer.clipAction(runClip) : null;
  if (idle) { idle.setLoop(THREE.LoopRepeat, Infinity); idle.clampWhenFinished = false; }
  if (walk) { walk.setLoop(THREE.LoopRepeat, Infinity); walk.clampWhenFinished = false; }
  if (run) { run.setLoop(THREE.LoopRepeat, Infinity); run.clampWhenFinished = false; }
  return {
    idle, walk, run,
    extras: clips.filter((clip) => !used.has(clip)).map((clip) => mixer.clipAction(clip)),
    names: clips.map((clip) => clip.name),
    canMove: !!walk,
  };
}'''
if old not in s:
    raise SystemExit('animal clip mapper anchor not found')
s = s.replace(old, new, 1)
old = '''export function playAnimalMode(state: AnimalLifeState, mode: AnimalMode): void {
  if (state.mode === mode && state.current?.isRunning()) return;
  const next = mode === 'run' ? (state.clips?.run ?? state.clips?.walk) : mode === 'walk' ? state.clips?.walk : state.clips?.idle;
  if (!next) return;
  if (state.current && state.current !== next) state.current.fadeOut(0.22);
  next.reset().fadeIn(0.22).play();
  state.current = next;
  state.mode = mode;
}'''
new = '''export function playAnimalMode(state: AnimalLifeState, mode: AnimalMode): void {
  // 보행 클립이 없는 몸은 미끄러지지 않는다. 정지 상태만 허용한다.
  const safeMode: AnimalMode = mode !== 'idle' && !state.clips?.canMove ? 'idle' : mode;
  if (state.mode === safeMode && state.current?.isRunning()) return;
  const next = safeMode === 'run' ? (state.clips?.run ?? state.clips?.walk) : safeMode === 'walk' ? state.clips?.walk : state.clips?.idle;
  if (!next) return;
  if (state.current && state.current !== next) state.current.fadeOut(0.28);
  next.enabled = true;
  next.setEffectiveWeight(1);
  next.setEffectiveTimeScale(safeMode === 'run' ? 1.15 : safeMode === 'walk' ? 1.0 : 0.9);
  next.reset().fadeIn(0.28).play();
  state.current = next;
  state.mode = safeMode;
}'''
if old not in s:
    raise SystemExit('animal mode anchor not found')
s = s.replace(old, new, 1)
p.write_text(s)

# 2) Planet movement: do not translate a model without a walk clip; expose clip diagnostics.
p = Path('src/scene/PlanetWorld.tsx')
s = p.read_text()
old = '''           animal.mixer = new THREE.AnimationMixer(loaded.group);
           animal.clips = mapAnimalClips(animal.mixer, loaded.animations);
           cur.animal = animal;
           playAnimalMode(animal, 'idle');'''
new = '''           animal.mixer = new THREE.AnimationMixer(loaded.group);
           animal.clips = mapAnimalClips(animal.mixer, loaded.animations);
           loaded.group.userData.animalAnimationClips = animal.clips.names;
           loaded.group.userData.animalCanMove = animal.clips.canMove;
           cur.animal = animal;
           playAnimalMode(animal, 'idle');'''
if old not in s:
    raise SystemExit('planet animal setup anchor not found')
s = s.replace(old, new, 1)
old = '''       const cfg = animalTemperament(A.kind);
       const byeoliDir = roamRef.current?.d ?? p.clone().normalize();'''
new = '''       const cfg = animalTemperament(A.kind);
       // BUILD 404: 걷는 클립이 없는 동물은 마네킹 미끄럼 금지.
       if (!A.clips?.canMove) { playAnimalMode(A, 'idle'); continue; }
       const byeoliDir = roamRef.current?.d ?? p.clone().normalize();'''
if old not in s:
    raise SystemExit('planet animal movement anchor not found')
s = s.replace(old, new, 1)

# 3) Hand mount: one exact lantern-derived bone/mount path for all held props.
old_start = s.index("      // BUILD 399: 랜턴이 안정적으로 달린 바로 그 오른손/손목 앵커를 카메라와 휴대폰도 공유한다.")
old_end = s.index("    }).catch(() => { /* 조용한 행성 */ });", old_start)
block = '''      // BUILD 404: 랜턴에서 검증된 손목 마운트를 카메라·휴대폰과 완전히 공용화한다.
      const findHandBone = (): THREE.Object3D | null => {
        let found: THREE.Object3D | null = null;
        const tests = [/RightHand$/i, /RightWrist$/i, /LeftHand$/i, /LeftWrist$/i, /hand|wrist/i];
        for (const test of tests) {
          group.traverse((n) => { if (!found && (n as THREE.Bone).isBone && test.test(n.name)) found = n; });
          if (found) break;
        }
        return found;
      };
      const hand = findHandBone();
      if (hand) {
        const h = hand as THREE.Object3D;
        group.updateMatrixWorld(true);
        const ws = new THREE.Vector3(); h.getWorldScale(ws);
        const makeHandMount = () => {
          const mount = new THREE.Group();
          mount.scale.setScalar(1 / Math.max(ws.x, 1e-6));
          mount.visible = false;
          h.add(mount);
          return mount;
        };
        const cameraMount = makeHandMount();
        cameraMount.position.set(0, 0, 0);
        cameraMount.rotation.set(0, 0, 0);
        heldCameraRef.current = cameraMount;
        void loadHeldDeviceAsset('camera').then((device) => {
          if (!alive) return;
          // 랜턴처럼 손목 원점 아래로 내리고, 그립이 손바닥에 오도록 자산만 회전한다.
          device.position.set(0.012, -0.105, -0.018);
          device.rotation.set(Math.PI / 2, 0, Math.PI);
          cameraMount.add(device);
        }).catch(() => {});

        const phoneMount = makeHandMount();
        phoneMount.position.set(0, 0, 0);
        phoneMount.rotation.set(0, 0, 0);
        heldPhoneRef.current = phoneMount;
        void loadHeldDeviceAsset('phone').then((device) => {
          if (!alive) return;
          device.position.set(0.008, -0.092, -0.012);
          device.rotation.set(Math.PI / 2, 0.08, Math.PI / 2);
          phoneMount.add(device);
        }).catch(() => {});

        if (lanternOnRef.current) {
          const lanternMount = makeHandMount();
          lanternRef.current = lanternMount;
          void loadHandLanternAsset().then((lantern) => {
            if (!alive) return;
            lantern.position.set(0, -0.17, 0);
            lanternMount.add(lantern);
          }).catch(() => {});
        }
      }
'''
s = s[:old_start] + block + s[old_end:]
p.write_text(s)

# 4) BUILD label.
p = Path('src/App.tsx')
s = p.read_text()
s, n = re.subn(r"const BUILD_LABEL\s*=\s*'[^']*';", "const BUILD_LABEL = 'v2.55.0 · BUILD 404 · Living Motion — 발을 딛고 걷기 시작했습니다';", s, count=1)
if n != 1:
    raise SystemExit('BUILD label anchor not found')
p.write_text(s)
