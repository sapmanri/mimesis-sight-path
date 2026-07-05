import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import type { ObservationScene } from '../data/jeju';
import { buildWorld, createWalkerFigure, loadWalkerAsset, loadKitModel, defaultLoader, PALETTE } from '../engine/worldCore';
import { JEJU_SPEC, type WorldSpec } from '../engine/worldSpec';
import { createClipRig, createWalkerRig, type WalkerRig } from './walkerRig';
import { createTinker, type Tinker } from './tinker';
import { createPropObject, type PlacedProp } from '../engine/props';
import { footsteps } from './footsteps';
import { guardShot, SHOT_RECIPES, type GuardParams } from './cameraGuard';

// BUILD 090: 액자 수호 규칙 값 — 에디터 Camera 패널 노출 예정
const ZERO_VEL = new THREE.Vector3();
const GUARD_PARAMS: GuardParams = {
  safeX: 0.55, safeY: 0.68, maxDist: 13, minDist: 1.9, panRate: 2.4, moveRate: 1.1, leadTime: 0.55,
};

type WorldProps = {
  scenes: ObservationScene[];
  activeIndex: number;
  mode: 'auto' | 'manual';
  /** BUILD 082: 세계 명세. 생략 시 제주 프리셋. */
  spec?: WorldSpec;
  /** BUILD 099: 에디터 자리 찍기 — 지면 클릭 좌표 콜백 */
  onGroundPick?: (p: THREE.Vector3) => void;
  /** BUILD 099: 카드 페이즈 — 도착/출발 신호 */
  onArrive?: (index: number) => void;
  onDepart?: () => void;
  /** BUILD 100: 자유 배치물 (에디터가 놓은 사물들) */
  props?: PlacedProp[];
  /** BUILD 100: 에디터 자유 카메라 — true면 World는 카메라에 손대지 않는다 */
  freeCamera?: boolean;
  /** BUILD 100: 길 탭 — 가장 가까운 기억 지점으로 걷기 */
  onPathTap?: (index: number) => void;
  /** BUILD 106: 에디터 — 기억 사물 클릭 선택 */
  onScenePick?: (index: number) => void;
};

// 걷는 시간이 주인공이다.
// 카메라는 걷는 사람의 눈이 아니라, 그를 조용히 따라가는 시선이다.
export function World({ scenes, activeIndex, mode, spec = JEJU_SPEC, onGroundPick, onArrive, onDepart, props, freeCamera, onPathTap, onScenePick }: WorldProps) {
  const world = useMemo(() => buildWorld(scenes, undefined, spec), [scenes, spec]);
  // 워커: 프로시저럴 실루엣으로 시작, Peasant 로드 완료 시 교체
  const walker = useMemo(() => {
    const holder = new THREE.Group();
    holder.add(createWalkerFigure());
    return holder;
  }, []);
  const rigRef = useRef<WalkerRig | null>(null);
  const { gl } = useThree();

  // BUILD 108: 3D 폴라로이드 — 에디터에서 붙인 사진이 길 위에 선다.
  // 흰 액자, 가는 다리, 길을 등지고 살짝 기운 채.
  const photosGroup = useMemo(() => new THREE.Group(), []);
  useEffect(() => {
    photosGroup.clear();
    const texLoader = new THREE.TextureLoader();
    scenes.forEach((sc, i) => {
      const photo = (sc as { photo?: string }).photo;
      if (!photo) return;
      const a = world.anchors[i];
      if (!a) return;
      const holder = new THREE.Group();
      const side = i % 2 === 0 ? -1 : 1; // 기억 사물의 반대편
      holder.position.copy(a.p).add(a.nor.clone().multiplyScalar(side * a.w * 0.52));
      holder.rotation.y = Math.atan2(a.tan.x, a.tan.z) + (side > 0 ? -0.5 : 0.5) + Math.PI;
      holder.rotation.z = 0.03;
      // 액자
      const frame = new THREE.Mesh(
        new THREE.BoxGeometry(0.3, 0.36, 0.012),
        new THREE.MeshStandardMaterial({ color: '#fffdf6', roughness: 0.85 }),
      );
      frame.position.y = 0.62;
      frame.castShadow = true;
      holder.add(frame);
      // 다리 (가는 각목 둘)
      const legMat = new THREE.MeshStandardMaterial({ color: '#8a6a4a', roughness: 0.9 });
      [-0.1, 0.1].forEach((x) => {
        const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.01, 0.46, 5), legMat);
        leg.position.set(x, 0.23, -0.012);
        holder.add(leg);
      });
      // 사진
      texLoader.load(photo, (tex) => {
        tex.colorSpace = THREE.SRGBColorSpace;
        const img = new THREE.Mesh(
          new THREE.PlaneGeometry(0.26, 0.26),
          new THREE.MeshStandardMaterial({ map: tex, roughness: 0.75 }),
        );
        img.position.set(0, 0.035, 0.008);
        frame.add(img);
      });
      photosGroup.add(holder);
    });
  }, [scenes, world, photosGroup]);

  // BUILD 108: 번개 — 비 오는 밤, 세계가 두 번 깜빡인다
  const lightning = useMemo(() => {
    if (spec.weather?.kind !== 'rain' || !spec.weather?.lightning) return null;
    const flash = new THREE.AmbientLight('#dfe9f2', 0);
    return { flash, nextAt: 4 + Math.random() * 8, seq: -1, t: 0 };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spec.weather?.kind, spec.weather?.lightning]);

  // BUILD 107: 빗줄기 — 걷는 사람 주위에서 순환한다
  const rain = useMemo(() => {
    if (spec.weather?.kind !== 'rain') return null;
    const N = Math.round(250 + (spec.weather?.rainAmount ?? 0.6) * 1400);
    const pos = new Float32Array(N * 6);
    const drops = new Float32Array(N * 4); // x,y,z,speed
    for (let i = 0; i < N; i += 1) {
      drops[i * 4] = (Math.random() - 0.5) * 26;
      drops[i * 4 + 1] = Math.random() * 14;
      drops[i * 4 + 2] = (Math.random() - 0.5) * 26;
      drops[i * 4 + 3] = 7 + Math.random() * 4;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.LineBasicMaterial({ color: '#cdd9de', transparent: true, opacity: 0.38 });
    const lines = new THREE.LineSegments(geo, mat);
    lines.frustumCulled = false;
    return { lines, drops, N };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spec.weather?.kind, spec.weather?.rainAmount]);

  // BUILD 100: 배치물 — 문서의 props를 3D로. id+obj+seed가 같으면 재사용 없이 단순 재생성(에디터 디바운스가 폭주를 막는다).
  const propsGroup = useMemo(() => new THREE.Group(), []);
  useEffect(() => {
    let alive = true;
    propsGroup.clear();
    (props ?? []).forEach((pp, i) => {
      const seed = pp.id.split('').reduce((a, c) => a + c.charCodeAt(0), 7) + i * 131;
      createPropObject(pp.obj, seed).then((obj) => {
        if (!alive || !obj) return;
        const holder = new THREE.Group();
        holder.add(obj);
        holder.position.set(pp.position[0], pp.position[1], pp.position[2]);
        holder.rotation.y = pp.rotY;
        holder.rotation.x = pp.rotX;
        holder.scale.setScalar(pp.scale);
        holder.userData.propId = pp.id;
        propsGroup.add(holder);
      });
    });
    return () => { alive = false; };
  }, [props, propsGroup]);

  // ---- BUILD 086: 캐릭터 주권 ----
  // 캐릭터는 카메라에 떠밀려 다니지 않는다. 자기 속도로 걷고, 자기 보폭으로 딛는다.
  // 팅커가 먼저 날아가 기억 앞에서 맴돌면, 사람이 뒤따라 걷고, 카메라는 그를 따라갈 뿐.
  const tinker = useMemo<Tinker>(() => {
    const start = world.curve.getPoint(world.progressToT(activeIndex)).add(new THREE.Vector3(0.4, 1.3, 0));
    return createTinker(start);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [world]);
  const journey = useRef({
    target: activeIndex,       // 지금 향하는 장면
    phase: 'idle' as 'idle' | 'scout' | 'walk', // 팅커 정찰 → 사람 보행 → 머무름
    gait: 'walk' as 'walk' | 'run',
    gaitSwitchAt: -1,          // 이 progress를 지나면 걷기↔뛰기 전환 ("가끔은 걷다가 뛰다가")
  });
  const charProgress = useRef(activeIndex); // 캐릭터의 현재 위치 (장면 단위 진행도)
  const charSpeed = useRef(0);              // 현재 속도 (월드 유닛/초)
  const charYaw = useRef(0);                // BUILD 087: 몸의 방향 — 스냅하지 않고 돌아선다
  // BUILD 099: 사용자 카메라 — 마우스가 잡으면 따르고, 4초 놓아두면 자동으로 되돌아간다
  const userCam = useRef({ blend: 0, az: 0, el: 0.45, dist: 5.5, lastInput: -99, dragging: false });
  const walkerPos = useRef<THREE.Vector3 | null>(null); // BUILD 098: 실제 위치 — 커브는 안내선일 뿐
  const lastTargetChange = useRef(0);       // BUILD 087: 연타 감지 (마우스 휙휙 → 뛴다)
  // BUILD 101: 길 탭은 '정확히 그 지점'으로 — 분수 진행도 타깃. activeIndex 동기화가 덮지 않게 잠근다.
  const tapLock = useRef<number | null>(null);
  const prevWalkerPos = useRef<THREE.Vector3 | null>(null);
  const faceVelocity = useRef(new THREE.Vector3()); // BUILD 090: 가드 리드용 속도 벡터
  const wasMoving = useRef(false);
  // BUILD 088: 관조 카메라의 현재 구도 (여정마다 새로 잡고, 잡은 뒤엔 잠근다)
  const shot = useRef<{ pos: THREE.Vector3; look: THREE.Vector3 } | null>(null);

  useEffect(() => {
    let alive = true;
    loadWalkerAsset(undefined, (spec.walker as { character?: number | 'random' }).character ?? 'random').then(({ group, animations, clipSpeeds }) => {
      if (!alive) return;
      walker.clear();
      walker.add(group);
      // BUILD 091: 보행 클립이 있으면 클립 리그 (미끄러짐 최종 해법: 속도-배속 동기).
      // 없으면 BUILD 085 절차 보행으로 폴백 (스캐빈저 등).
      rigRef.current = (clipSpeeds ? createClipRig(group, animations, clipSpeeds, footsteps.step) : null)
        ?? createWalkerRig(group, animations, spec.walker.timeScale);
      // BUILD 104: 마법 의자 — 앉을 때 샤라락. 좌면은 정규화 높이의 47% 지점.
      loadKitModel('chair', defaultLoader).then((chairObj) => {
        if (!alive) return;
        rigRef.current?.setChairAsset?.(chairObj, 0.64 * 0.47);
      }).catch(() => { /* 의자가 없으면 조용히 땅에 앉는다 */ });
    }).catch(() => { /* 실패 시 프로시저럴 실루엣 유지 */ });
    return () => { alive = false; };
  }, [walker, spec]);

  useEffect(() => {
    gl.shadowMap.enabled = true;
    gl.shadowMap.type = THREE.PCFSoftShadowMap;
    gl.toneMapping = THREE.ACESFilmicToneMapping;
    gl.toneMappingExposure = 1.0;
  }, [gl]);

  const walkPhase = useRef(0);
  const smoothLook = useRef(new THREE.Vector3(0, 0.8, 0));

  // BUILD 099: 드래그 = 궤도 잡기 (워커 중심). 손을 떼고 4초가 지나면 시선은 제자리로.
  useEffect(() => {
    const el = gl.domElement;
    const U = userCam.current;
    let px = 0;
    let py = 0;
    let downX = 0;
    let downY = 0;
    let downT = 0;
    const down = (e: PointerEvent) => {
      if (e.button !== 0 && e.pointerType === 'mouse') return;
      U.dragging = true;
      px = e.clientX;
      py = e.clientY;
      downX = e.clientX;
      downY = e.clientY;
      downT = performance.now();
    };
    const move = (e: PointerEvent) => {
      if (!U.dragging) return;
      const dx = e.clientX - px;
      const dy = e.clientY - py;
      px = e.clientX;
      py = e.clientY;
      if (Math.abs(dx) + Math.abs(dy) < 1) return;
      U.az -= dx * 0.0055;
      U.el = Math.min(1.25, Math.max(0.08, U.el + dy * 0.004));
      U.lastInput = performance.now() / 1000;
    };
    const up = (e: PointerEvent) => {
      const was = U.dragging;
      U.dragging = false;
      // BUILD 100: 탭 = 길 위 그 지점으로 걷기 (짧고, 거의 안 움직인 접촉)
      if (!was || !onPathTapRef.current) return;
      const moved = Math.hypot(e.clientX - downX, e.clientY - downY);
      if (moved > 7 || performance.now() - downT > 350) return;
      const rect = el.getBoundingClientRect();
      const ndc = new THREE.Vector2(
        ((e.clientX - rect.left) / rect.width) * 2 - 1,
        -((e.clientY - rect.top) / rect.height) * 2 + 1,
      );
      const ray = new THREE.Raycaster();
      ray.setFromCamera(ndc, cameraRef.current!);
      const hits = ray.intersectObject(world.group, true);
      if (!hits.length) return;
      const pt = hits[0].point;
      // BUILD 101: 찍은 점을 안내선에 투영 — 정확히 그 지점으로 걷는다
      let bestP = 0;
      let bestD = Infinity;
      const N = scenes.length - 1;
      for (let p = 0; p <= N; p += 0.02) {
        const a = world.curve.getPoint(world.progressToT(p));
        const d = Math.hypot(a.x - pt.x, a.z - pt.z);
        if (d < bestD) { bestD = d; bestP = p; }
      }
      if (bestD < 3.5) {
        tapLock.current = bestP;
        onPathTapRef.current(Math.round(bestP));
      }
    };
    el.addEventListener('pointerdown', down);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    // BUILD 100: 휠 = 확대·축소 (장면 이동은 길 탭/키보드로)
    const wheel = (e: WheelEvent) => {
      U.dist = Math.min(12, Math.max(2.2, U.dist * (1 + Math.sign(e.deltaY) * 0.09)));
      U.lastInput = performance.now() / 1000;
    };
    el.addEventListener('wheel', wheel, { passive: true });
    return () => {
      el.removeEventListener('wheel', wheel);
      el.removeEventListener('pointerdown', down);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
    };
  }, [gl]);

  const cameraRef = useRef<THREE.Camera | null>(null);
  const onPathTapRef = useRef(onPathTap);
  onPathTapRef.current = onPathTap;

  // 사용자 카메라 블렌드 적용: 잡으면 빠르게 1로, 놓으면 1.6초에 걸쳐 0으로
  const applyUserCam = (camera: THREE.Camera, delta: number) => {
    const U = userCam.current;
    const now = performance.now() / 1000;
    const engaged = U.dragging || now - U.lastInput < 4.0;
    U.blend += ((engaged ? 1 : 0) - U.blend) * Math.min(1, delta * (engaged ? 5 : 1.4));
    if (U.blend < 0.01) {
      // 자동 상태 동안엔 현재 구도를 궤도각으로 기억 — 잡는 순간 튀지 않게
      const rel = camera.position.clone().sub(smoothLook.current);
      U.dist = Math.min(11, Math.max(2.2, rel.length()));
      U.az = Math.atan2(rel.x, rel.z);
      U.el = Math.asin(THREE.MathUtils.clamp(rel.y / Math.max(0.001, rel.length()), -1, 1));
      return;
    }
    const focus = walker.position.clone().add(new THREE.Vector3(0, 0.55, 0));
    const manual = focus.clone().add(new THREE.Vector3(
      Math.sin(U.az) * Math.cos(U.el) * U.dist,
      Math.sin(U.el) * U.dist,
      Math.cos(U.az) * Math.cos(U.el) * U.dist,
    ));
    camera.position.lerp(manual, U.blend);
    smoothLook.current.lerp(focus, U.blend);
  };

  useFrame(({ camera, clock }, delta) => {
    cameraRef.current = camera;
    const J = journey.current;
    const curvePosAt = (prog: number) => world.curve.getPoint(world.progressToT(prog));

    // BUILD 088: 첫 구도 — 여정이 시작되기 전에도 시선은 이미 자리를 잡고 있다
    if (!freeCamera && spec.camera.mode === 'held' && !shot.current) {
      const a0 = curvePosAt(charProgress.current);
      const b0 = curvePosAt(Math.min(scenes.length - 1, charProgress.current + 1));
      const mid0 = a0.clone().lerp(b0, 0.55);
      const t0 = world.progressToT(charProgress.current + 0.5);
      const tan0 = world.curve.getTangent(t0).setY(0).normalize();
      const nor0 = new THREE.Vector3(-tan0.z, 0, tan0.x);
      const d0 = spec.camera.baseDist + a0.distanceTo(b0) * spec.camera.fitGain;
      shot.current = {
        pos: mid0.clone().add(nor0.multiplyScalar(d0 * 0.82)).add(tan0.multiplyScalar(-d0 * 0.4)).add(new THREE.Vector3(0, spec.camera.height + 0.7, 0)),
        look: mid0.clone().add(new THREE.Vector3(0, 0.45, 0)),
      };
    }

    // ---- 여정 상태기 ----
    // 목적지가 바뀌면: 팅커가 먼저 날아간다. 사람은 팅커가 자리잡은 뒤에 출발한다.
    // BUILD 101: 탭 잠금이 이 activeIndex를 가리키면 분수 지점이 진짜 목적지다.
    if (tapLock.current !== null && Math.round(tapLock.current) !== activeIndex) tapLock.current = null;
    const wantTarget = tapLock.current ?? activeIndex;
    if (J.target !== wantTarget) {
      J.target = wantTarget;
      const targetPos = curvePosAt(wantTarget).add(new THREE.Vector3(0, 1.1, 0));
      const dist = Math.abs(wantTarget - charProgress.current);
      tinker.flyTo(targetPos, Math.min(1.9, 0.8 + dist * 0.3));
      // BUILD 087: 마우스를 휙휙 넘기면 — 뛴다. 조급함은 몸이 먼저 안다.
      const now = clock.elapsedTime;
      const rapid = now - lastTargetChange.current < 1.6;
      lastTargetChange.current = now;
      if (rapid) {
        J.gait = 'run';
        J.gaitSwitchAt = -999;
        J.phase = 'walk'; // 정찰을 기다리지 않고 바로 출발
      } else if (J.phase !== 'walk') {
        J.phase = 'scout';
      }
      // BUILD 090: 새 여정 = 새 구도. 구도 사전에서 뽑는다 — 옆면, 마중, 부감... 다양함이 핵심.
      // 인물 이탈은 프레임 가드가 매 프레임 막아주므로, 구도는 마음껏 대담해도 된다.
      if (spec.camera.mode === 'held') {
        const a = curvePosAt(charProgress.current);
        const bPos = curvePosAt(wantTarget);
        const mid = a.clone().lerp(bPos, 0.55);
        const segLen = a.distanceTo(bPos);
        const midT = world.progressToT((charProgress.current + wantTarget) / 2);
        const mtan = world.curve.getTangent(midT).setY(0).normalize();
        const mnor = new THREE.Vector3(-mtan.z, 0, mtan.x);
        const travel = Math.sign(wantTarget - charProgress.current) || 1;
        const dist = Math.min(11, Math.max(4.5, spec.camera.baseDist + segLen * spec.camera.fitGain));
        const recipe = SHOT_RECIPES[Math.floor(Math.random() * SHOT_RECIPES.length)];
        const sideSign = Math.random() > 0.5 ? 1 : -1; // 왼쪽 옆면, 오른쪽 옆면도 번갈아
        // 시선은 인물과 여정 중점 사이 — 인물을 품은 채 태어나는 구도
        shot.current = {
          pos: mid.clone()
            .add(mnor.clone().multiplyScalar(sideSign * dist * recipe.nor))
            .add(mtan.clone().multiplyScalar(travel * dist * recipe.tan))
            .add(new THREE.Vector3(0, spec.camera.height * (0.4 + recipe.lift) + segLen * recipe.hBoost, 0)),
          look: a.clone().lerp(mid, 0.4).add(new THREE.Vector3(0, 0.45, 0)),
        };
        // BUILD 090: 사전 정착 — 구도가 화면에 나가기 전에 가드를 미리 돌려
        // 인물이 처음부터 액자 안에 있도록 다듬는다 (첫 프레임 이탈 방지)
        {
          const cam3 = camera as THREE.PerspectiveCamera;
          const chestNow = walker.position.clone().add(new THREE.Vector3(0, 0.5, 0));
          for (let i = 0; i < 40; i += 1) {
            guardShot(shot.current, chestNow, ZERO_VEL, cam3.fov, cam3.aspect, 0.05, GUARD_PARAMS);
          }
        }
      }
    }
    if (J.phase === 'scout' && tinker.state() === 'hover') {
      // 팅커가 자리잡았다 — 이제 사람이 걷는다. 걸을지 뛸지는 그날의 기분.
      const dist = Math.abs(J.target - charProgress.current);
      J.gait = dist > 1.4 || Math.random() < 0.22 ? 'run' : 'walk';
      // 긴 길은 중간에 한 번 걸음을 바꾼다 — 걷다가 뛰다가
      J.gaitSwitchAt = dist > 0.9 && Math.random() < 0.55
        ? charProgress.current + Math.sign(J.target - charProgress.current) * dist * (0.35 + Math.random() * 0.3)
        : -999;
      J.phase = 'walk';
    }
    tinker.update(delta, clock.elapsedTime);

    // ---- 캐릭터: 자기 속도로 걷는다 ----
    const remaining = J.target - charProgress.current;
    let moving = false;
    if (J.phase === 'walk') {
      if (Math.abs(remaining) < 0.004) {
        charProgress.current = J.target;
        charSpeed.current = 0;
        J.phase = 'idle';
      } else {
        moving = true;
        // 걸음 전환 지점 통과 체크
        if (J.gaitSwitchAt > -900 && Math.sign(remaining) * (charProgress.current - J.gaitSwitchAt) > 0) {
          J.gait = J.gait === 'walk' ? 'run' : 'walk';
          J.gaitSwitchAt = -999;
        }
        // 목표 속도 (월드 유닛/초): 걷기 0.85, 뛰기 1.7 — 신장 0.9 캐릭터의 보폭 0.42u × 초당 2보
        // 도착 앞에서는 걸음으로 줄인다
        const t0 = world.progressToT(charProgress.current);
        const p0 = world.curve.getPoint(t0);
        const t1 = world.progressToT(charProgress.current + Math.sign(remaining) * 0.01);
        const dWdP = Math.max(0.05, world.curve.getPoint(t1).distanceTo(p0) / 0.01); // 월드거리/진행도
        const remainingWorld = Math.abs(remaining) * dWdP;
        let targetSpeed = J.gait === 'run' ? spec.walker.runSpeed : spec.walker.walkSpeed;
        if (remainingWorld < 1.1) targetSpeed = Math.min(targetSpeed, spec.walker.walkSpeed); // 도착 전 감속
        charSpeed.current += (targetSpeed - charSpeed.current) * Math.min(1, delta * 2.6);
        // BUILD 098: 진행도는 '접선 방향으로 실제 나아간 만큼'만 오른다
        const tanH = world.curve.getTangent(t0).setY(0).normalize();
        const headAlign = Math.max(0.25, Math.cos(charYaw.current - Math.atan2(tanH.x, tanH.z)) * Math.sign(remaining) || 0.25);
        const stepProg = (charSpeed.current * delta * Math.abs(headAlign)) / dWdP;
        charProgress.current += Math.sign(remaining) * Math.min(Math.abs(remaining), stepProg);
      }
    } else {
      charSpeed.current = 0;
    }

    // ---- BUILD 098: 추적점 팔로워 (Vase의 패스파인더) ----
    // 커브는 '안내선'이다. 몸은 안내선 위 0.42u 앞의 점을 바라보며
    // 자기 방향으로만 전진한다 — 속도와 몸이 늘 같은 곳을 향하므로 스키가 없다.
    // 안내선에서 벗어나면 허용치(0.12u) 밖에서만 스프링으로 당겨온다.
    const t = world.progressToT(charProgress.current);
    const anchor = world.curve.getPoint(t); // 안내선 위의 내 자리
    const t1n = world.progressToT(Math.min(scenes.length - 1, charProgress.current + 0.01));
    const dWdPn = Math.max(0.05, world.curve.getPoint(t1n).distanceTo(anchor) / 0.01);
    const facing = moving ? Math.sign(remaining) || 1 : (Math.abs(charYaw.current) > Math.PI / 2 ? -1 : 1);
    const tangent = world.curve.getTangent(t).setY(0).normalize();

    if (!walkerPos.current) walkerPos.current = anchor.clone();
    const pos = walkerPos.current;

    if (moving) {
      // 추적점: 안내선을 따라 0.42u 앞 (진행 방향으로)
      const lookP = charProgress.current + facing * (0.42 / dWdPn);
      const pursuit = world.curve.getPoint(world.progressToT(
        Math.max(0, Math.min(scenes.length - 1, lookP)),
      ));
      let dYaw = Math.atan2(pursuit.x - pos.x, pursuit.z - pos.z) - charYaw.current;
      while (dYaw > Math.PI) dYaw -= Math.PI * 2;
      while (dYaw < -Math.PI) dYaw += Math.PI * 2;
      // 회전 속도: 기본 3.4 rad/s, 크게 어긋났을수록 빨리 (되돌아설 때)
      const turnRate = 3.4 + Math.abs(dYaw) * 3.2;
      charYaw.current += THREE.MathUtils.clamp(dYaw, -turnRate * delta, turnRate * delta);
      // 몸의 방향으로 전진
      pos.x += Math.sin(charYaw.current) * charSpeed.current * delta;
      pos.z += Math.cos(charYaw.current) * charSpeed.current * delta;
      // 허용치 스프링: 벼랑길이니 너무 멀어지면 안 된다
      const nor = new THREE.Vector3(-tangent.z, 0, tangent.x);
      const off = (pos.x - anchor.x) * nor.x + (pos.z - anchor.z) * nor.z;
      const tol = 0.12;
      if (Math.abs(off) > tol) {
        const pull = (Math.abs(off) - tol) * Math.sign(off) * Math.min(1, delta * 6);
        pos.x -= nor.x * pull;
        pos.z -= nor.z * pull;
      }
    } else {
      // 머무를 때는 안내선의 자리로 조용히 수렴
      pos.lerp(anchor, Math.min(1, delta * 3));
    }
    pos.y = anchor.y; // 지면은 안내선이 정의한다
    const dir = tangent.clone().multiplyScalar(moving ? facing : 1);

    // 이번 프레임 실제 이동 거리 → 보폭 동기 (발이 미끄러지지 않는다)
    const distDelta = prevWalkerPos.current ? pos.distanceTo(prevWalkerPos.current) : 0;
    if (prevWalkerPos.current && delta > 0) {
      faceVelocity.current.copy(pos).sub(prevWalkerPos.current).divideScalar(delta);
    }
    prevWalkerPos.current = pos.clone();

    // ---- 걷는 사람 ----
    const speed01 = Math.min(1, Math.max(0, (charSpeed.current - 0.8) / 0.9));
    const rig = rigRef.current;
    if (rig) {
      rig.update(delta, speed01, moving, clock.elapsedTime, distDelta);
      // 도착: 기억 앞에 웅크려 들여다본다 (머무름이 깊은 장면에서만)
      if (wasMoving.current && !moving) {
        // BUILD 101: 기억 '지점'에 닿았을 때만 카드가 펼쳐지고 몸이 앉는다.
        // 길 중간에 머무는 건 그냥 서서 바라보는 것.
        const nearIdx = Math.round(charProgress.current);
        if (Math.abs(charProgress.current - nearIdx) < 0.22) {
          onArrive?.(nearIdx);
          const scene = scenes[nearIdx];
          const st = scene?.stillness ?? 0;
          if (st >= 1.3) rig.playInspect('sit');
          else if (st >= 0.65) rig.playInspect('pickup');
        }
      }
      if (!wasMoving.current && moving) { rig.stopInspect(); onDepart?.(); }
      const bob = moving && !rig.inspecting() ? Math.abs(Math.sin(rig.phase())) * (0.012 + speed01 * 0.014) : 0;
      walker.position.copy(pos).add(new THREE.Vector3(0, bob, 0));
      walker.rotation.z = 0;
    } else {
      // 폴백 실루엣: 절차적 걸음
      if (moving) walkPhase.current += (distDelta / 0.36) * Math.PI;
      const bob = moving ? Math.abs(Math.sin(walkPhase.current)) * 0.016 : 0;
      const sway = moving ? Math.sin(walkPhase.current) * 0.035 : 0;
      const breathe = Math.sin(clock.elapsedTime * 1.4) * 0.004;
      walker.position.copy(pos).add(new THREE.Vector3(0, bob + breathe, 0));
      walker.rotation.z = sway;
    }
    walker.rotation.y = charYaw.current;
    wasMoving.current = moving;

    // ---- 카메라 ---- (BUILD 100: freeCamera면 에디터가 조종한다 — 손대지 않는다)
    if (!freeCamera && spec.camera.mode === 'held' && shot.current) {
      // BUILD 088: 관조 카메라 — 구도는 잠기고, 사람이 그 속을 걸어간다.
      // BUILD 090: 프레임 가드 — 단, 사람이 액자를 벗어나려 하면 구도가 따라 고쳐진다.
      const chest = walker.position.clone().add(new THREE.Vector3(0, 0.5, 0));
      const vel = faceVelocity.current; // 이번 프레임 계산된 이동 속도 벡터
      const cam3 = camera as THREE.PerspectiveCamera;
      guardShot(shot.current, chest, vel, cam3.fov, cam3.aspect, delta, GUARD_PARAMS);
      const e = clock.elapsedTime;
      const D = spec.camera.drift;
      const desired = shot.current.pos.clone().add(new THREE.Vector3(
        Math.sin(e * 0.23) * D, Math.sin(e * 0.31 + 1.2) * D * 0.6, Math.cos(e * 0.19) * D,
      ));
      const k = 1 - Math.pow(0.002, delta / spec.camera.reframeSec);
      camera.position.lerp(desired, k);
      smoothLook.current.lerp(shot.current.look, k);
      applyUserCam(camera, delta);
      camera.lookAt(smoothLook.current);
    } else {
      // follow 모드 (BUILD 087): 몸이 향한 곳의 등 뒤에서 조용히 따라간다
      const faceDir = new THREE.Vector3(Math.sin(charYaw.current), 0, Math.cos(charYaw.current));
      const desired = pos
        .clone()
        .add(faceDir.clone().multiplyScalar(-3.4))
        .add(new THREE.Vector3(0, 2.0, 0));
      const lookTarget = walker.position
        .clone()
        .add(faceDir.clone().multiplyScalar(0.9))
        .add(new THREE.Vector3(0, 0.8, 0));
      if (!freeCamera) {
        camera.position.lerp(desired, 1 - Math.pow(0.12, delta));
        smoothLook.current.lerp(lookTarget, 1 - Math.pow(0.06, delta));
        applyUserCam(camera, delta);
        camera.lookAt(smoothLook.current);
      }
    }

    // 태양은 걷는 사람을 따라간다 (그림자 카메라가 항상 근처를 비추도록)
    world.sun.position.copy(pos).add(new THREE.Vector3(...spec.light.sunPosition)); // BUILD 108: 해의 자리는 스펙이 정한다
    world.sun.target.position.copy(pos);

    // 빗줄기: 떨어지고, 바닥에 닿으면 하늘로 되돌아간다 (사람을 따라다니는 26u 상자)
    if (rain) {
      const arr = rain.lines.geometry.attributes.position.array as Float32Array;
      const D = rain.drops;
      const windX = Math.sin(clock.elapsedTime * 0.4) * 0.7;
      for (let i = 0; i < rain.N; i += 1) {
        D[i * 4 + 1] -= D[i * 4 + 3] * delta;
        D[i * 4] += windX * delta;
        if (D[i * 4 + 1] < -1.5) {
          D[i * 4] = (Math.random() - 0.5) * 26;
          D[i * 4 + 1] = 12 + Math.random() * 3;
          D[i * 4 + 2] = (Math.random() - 0.5) * 26;
        }
        const x = pos.x + D[i * 4];
        const y = pos.y + D[i * 4 + 1];
        const z = pos.z + D[i * 4 + 2];
        arr[i * 6] = x;
        arr[i * 6 + 1] = y;
        arr[i * 6 + 2] = z;
        arr[i * 6 + 3] = x + windX * 0.02;
        arr[i * 6 + 4] = y + 0.16;
        arr[i * 6 + 5] = z;
      }
      rain.lines.geometry.attributes.position.needsUpdate = true;
    }

    // 번개 시퀀스: 강-약 두 번 번쩍, 6~16초 간격
    if (lightning) {
      const Lg = lightning;
      Lg.t += delta;
      if (Lg.seq < 0 && Lg.t > Lg.nextAt) { Lg.seq = 0; Lg.t = 0; }
      if (Lg.seq >= 0) {
        const seqT = Lg.t;
        let inten = 0;
        if (seqT < 0.09) inten = 3.2 * (1 - seqT / 0.09);
        else if (seqT < 0.19) inten = 0;
        else if (seqT < 0.3) inten = 1.8 * (1 - (seqT - 0.19) / 0.11);
        else { Lg.seq = -1; Lg.t = 0; Lg.nextAt = 6 + Math.random() * 10; }
        Lg.flash.intensity = inten;
      }
    }
  });

  return (
    <>
      <color attach="background" args={[world.fogColor]} />
      <fog attach="fog" args={[world.fogColor, spec.weather?.kind === 'rain' ? 9 : 12, spec.weather?.kind === 'rain' ? 44 : 58]} />
      {rain && <primitive object={rain.lines} />}
      {lightning && <primitive object={lightning.flash} />}
      <primitive
        object={world.group}
        onPointerDown={(onGroundPick || onScenePick) ? (e: { point: THREE.Vector3; object: THREE.Object3D; stopPropagation: () => void }) => {
          e.stopPropagation();
          // 기억 사물을 찍었으면 그 기억을 선택 (자리 찍기 모드가 아닐 때)
          if (onScenePick && !onGroundPick) {
            let n: THREE.Object3D | null = e.object;
            while (n) {
              if (n.userData?.sceneIndex !== undefined) { onScenePick(n.userData.sceneIndex as number); return; }
              n = n.parent;
            }
            return;
          }
          onGroundPick?.(e.point.clone());
        } : undefined}
      />
      <primitive object={propsGroup} />
      <primitive object={photosGroup} />
      <primitive object={walker} />
      <primitive object={tinker.group} />
      <primitive object={tinker.trail} />
    </>
  );
}
