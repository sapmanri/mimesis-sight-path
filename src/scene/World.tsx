import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import type { ObservationScene } from '../data/jeju';
import { buildWorld, createWalkerFigure, loadWalkerAsset, loadKitModel, defaultLoader, makeCloudPuff, PALETTE, enforceFog } from '../engine/worldCore';
import { PET_ROSTER, loadPet, type LoadedPet } from '../engine/pets';
import { JEJU_SPEC, type WorldSpec } from '../engine/worldSpec';
import { createClipRig, createWalkerRig, type WalkerRig } from './walkerRig';
import { createTinker, type Tinker } from './tinker';
import { createPropObject, createPropAnimated, ANIMATED_PROPS, loadHandLanternAsset, type PlacedProp } from '../engine/props';
import { footsteps } from './footsteps';
import { ambience } from '../audio/ambience';
import { createSkyDrift, dayLightAt } from '../engine/skyDrift';
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
  /** BUILD 150: 무한 산책 — 목적지 없이 계속 걷는다. 순환 길에선 감아 돌고, 열린 길에선 왕복한다 */
  stroll?: boolean;
  /** BUILD 169: 우편 카드 — 우체통 앞에 멈추면 글·사진이 배달된다 (null = 카드 닫기) */
  onMail?: (item: { text?: string; photo?: string } | null) => void;
  onDepart?: () => void;
  /** BUILD 100: 자유 배치물 (에디터가 놓은 사물들) */
  props?: PlacedProp[];
  /** BUILD 100: 에디터 자유 카메라 — true면 World는 카메라에 손대지 않는다 */
  freeCamera?: boolean;
  /** BUILD 136: 구름 탑승 중 (뷰어 ☁️ 버튼) */
  riding?: boolean;
  /** BUILD 113: 실제 월드 커브 앵커 노출 — 에디터 카메라가 기억 곁으로 날아가기 위해 */
  onAnchors?: (pts: [number, number, number][]) => void;
  /** BUILD 100: 길 탭 — 가장 가까운 기억 지점으로 걷기 */
  onPathTap?: (index: number) => void;
  /** BUILD 106: 에디터 — 기억 사물 클릭 선택 */
  onScenePick?: (index: number) => void;
};

// 걷는 시간이 주인공이다.
// 카메라는 걷는 사람의 눈이 아니라, 그를 조용히 따라가는 시선이다.
export function World({ scenes, activeIndex, mode, spec = JEJU_SPEC, onGroundPick, onArrive, onDepart, props, freeCamera, riding, onPathTap, onScenePick, onAnchors, stroll, onMail }: WorldProps) {
  const world = useMemo(() => buildWorld(scenes, undefined, spec), [scenes, spec]);
  useEffect(() => {
    onAnchors?.(world.anchors.map((a) => [a.p.x, a.p.y, a.p.z]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [world]);
  // 워커: 프로시저럴 실루엣으로 시작, Peasant 로드 완료 시 교체
  const walker = useMemo(() => {
    const holder = new THREE.Group();
    holder.add(createWalkerFigure());
    return holder;
  }, []);
  const rigRef = useRef<WalkerRig | null>(null);
  const { gl, scene: r3fScene } = useThree();
  // BUILD 151·152: 흐르는 하늘 — spec은 악보, sky는 연주
  const sky = useRef(createSkyDrift());
  useEffect(() => { sky.current.init(spec); }, [spec]);
  const skyOn = !!(spec.weather?.flow?.time || spec.weather?.flow?.weather);
  const ambSync = useRef(0);
  const fogNow = useMemo(() => new THREE.Color(), []);

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

  // BUILD 148: 공기의 소리 — spec이 바뀌면 소리도 2~3초에 걸쳐 스며 바뀐다
  useEffect(() => {
    ambience.apply({
      kind: spec.weather?.kind ?? 'clear',
      wind: spec.weather?.wind ?? 0,
      rainAmount: spec.weather?.rainAmount ?? 0.6,
      time: spec.weather?.time ?? 'day',
      sea: spec.ambience?.sea ?? 0,
      life: spec.ambience?.life ?? 1,
    });
  }, [spec.weather, spec.ambience]);

  // BUILD 108: 번개 — 비 오는 밤, 세계가 두 번 깜빡인다
  const lightning = useMemo(() => {
    const flowW = !!spec.weather?.flow?.weather && spec.weather?.kind !== 'snow'; // BUILD 151: 유랑하는 날씨는 언젠가 번개를 데려온다
    if (!flowW && (spec.weather?.kind !== 'rain' || !spec.weather?.lightning)) return null;
    const flash = new THREE.AmbientLight('#dfe9f2', 0);
    return { flash, nextAt: 4 + Math.random() * 8, seq: -1, t: 0 };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spec.weather?.kind, spec.weather?.lightning, spec.weather?.flow?.weather]);

  // BUILD 107: 빗줄기 — 걷는 사람 주위에서 순환한다
  const rain = useMemo(() => {
    const flowW = !!spec.weather?.flow?.weather && spec.weather?.kind !== 'snow'; // BUILD 151: 눈의 세계엔 비 대신 눈이 유랑한다
    if (spec.weather?.kind !== 'rain' && !flowW) return null;
    const N = Math.round(250 + Math.max(spec.weather?.rainAmount ?? 0.6, flowW ? 0.85 : 0) * 1400);
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
  }, [spec.weather?.kind, spec.weather?.rainAmount, spec.weather?.flow?.weather]);

  // BUILD 120: 눈발 — 비의 문법을 물려받되, 서두르지 않는다. 떨어지며 좌우로 흔들린다.
  const snow = useMemo(() => {
    if (spec.weather?.kind !== 'snow') return null;
    const N = Math.round(300 + (spec.weather?.rainAmount ?? 0.6) * 1300);
    const pos = new Float32Array(N * 3);
    const flakes = new Float32Array(N * 5); // x,y,z,speed,swayPhase
    for (let i = 0; i < N; i += 1) {
      flakes[i * 5] = (Math.random() - 0.5) * 26;
      flakes[i * 5 + 1] = Math.random() * 14;
      flakes[i * 5 + 2] = (Math.random() - 0.5) * 26;
      flakes[i * 5 + 3] = 0.55 + Math.random() * 0.6; // 비(7~11)의 1/10 — 눈은 천천히 온다
      flakes[i * 5 + 4] = Math.random() * Math.PI * 2;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.PointsMaterial({
      color: '#eef2f5', size: 0.055, sizeAttenuation: true,
      transparent: true, opacity: 0.85, depthWrite: false,
    });
    const points = new THREE.Points(geo, mat);
    points.frustumCulled = false;
    return { points, flakes, N };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spec.weather?.kind, spec.weather?.rainAmount]);

  // BUILD 100: 배치물 — 문서의 props를 3D로. id+obj+seed가 같으면 재사용 없이 단순 재생성(에디터 디바운스가 폭주를 막는다).
  // BUILD 109: 로밍 — 애니메이션 있는 배치물은 길을 따라 제멋대로 왔다갔다 한다.
  const propsGroup = useMemo(() => new THREE.Group(), []);
  type Roamer = {
    holder: THREE.Group;
    mixer: THREE.AnimationMixer;
    walkAction: THREE.AnimationAction | null;
    idleAction: THREE.AnimationAction | null;
    prog: number;
    target: number;
    pauseT: number;
    yaw: number;
    lateral: number;
    pinned: boolean; // BUILD 111: roam 꺼짐 — 제자리에서 숨만 쉰다
  };
  const roamers = useRef<Roamer[]>([]);
  // BUILD 136: 스스로 움직이는 배치물 (풍력발전기 등) — 회전 노드와 부유 흔들림
  const ambients = useRef<{ holder: THREE.Group; spin: THREE.Object3D | null; base: [number, number, number]; seed: number }[]>([]);
  useEffect(() => {
    let alive = true;
    propsGroup.clear();
    roamers.current = [];
    ambients.current = [];
    (props ?? []).forEach((pp, i) => {
      const seed = pp.id.split('').reduce((a, c) => a + c.charCodeAt(0), 7) + i * 131;
      const wantAnimated = ANIMATED_PROPS.has(pp.obj);
      if (wantAnimated) {
        // BUILD 111: 살아있는 것은 멈춰도 살아있다 — roam이 꺼져도 제자리 Idle로 숨 쉰다.
        const pinned = !pp.roam;
        createPropAnimated(pp.obj).then((res) => {
          if (!alive || !res) return;
          const holder = new THREE.Group();
          holder.add(res.group);
          holder.scale.setScalar(pp.scale);
          holder.userData.propId = pp.id;
          if (pinned) {
            holder.position.set(pp.position[0], pp.position[1], pp.position[2]);
            holder.rotation.y = pp.rotY;
          }
          // 시작 진행도: 배치 지점을 커브에 투영
          let bestP = 0;
          let bestD = Infinity;
          for (let q = 0; q <= scenes.length - 1; q += 0.05) {
            const a = world.curve.getPoint(world.progressToT(q));
            const d = Math.hypot(a.x - pp.position[0], a.z - pp.position[2]);
            if (d < bestD) { bestD = d; bestP = q; }
          }
          const mixer = new THREE.AnimationMixer(res.group);
          const walkClip = res.animations.find((c) => /walking_a$|^walk(ing)?(_loop)?$|\|walk/i.test(c.name))
            ?? res.animations.find((c) => /walk/i.test(c.name)) ?? res.animations[0] ?? null;
          const idleClip = res.animations.find((c) => /^idle(_[a-z])?$/i.test(c.name))
            ?? res.animations.find((c) => /idle/i.test(c.name) && !/melee|ranged|combat|block/i.test(c.name))
            ?? null;
          const roamer: Roamer = {
            holder,
            mixer,
            walkAction: walkClip ? mixer.clipAction(walkClip) : null,
            idleAction: idleClip ? mixer.clipAction(idleClip) : null,
            prog: bestP,
            target: bestP,
            pauseT: 1 + Math.random() * 2,
            yaw: 0,
            lateral: (seed % 2 === 0 ? 1 : -1) * (0.1 + (seed % 7) * 0.02),
            pinned,
          };
          roamer.idleAction?.play();
          propsGroup.add(holder);
          roamers.current.push(roamer);
        });
        return;
      }
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
        if (obj.userData.spinNode || obj.userData.floaty) { // BUILD 136
          ambients.current.push({ holder, spin: (obj.userData.spinNode as THREE.Object3D) ?? null, base: [pp.position[0], pp.position[1], pp.position[2]], seed: seed % 100 });
        }
      });
    });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props, propsGroup, world]);

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
  const strollDir = useRef(1); // BUILD 150: 열린 길 산책의 방향 — 끝에 닿으면 돌아선다
  const strollGait = useRef({ next: 12 + Math.random() * 20, left: 0 }); // BUILD 161: 질주 본능 — 산책 중 가끔 이유 없이 뛴다
  const lastWant = useRef<number | null>(null); // 목적지 변경 감지 (루프에선 target이 want와 다른 수로 감긴다)
  const charSpeed = useRef(0);              // 현재 속도 (월드 유닛/초)
  const charYaw = useRef(0);                // BUILD 087: 몸의 방향 — 스냅하지 않고 돌아선다
  // BUILD 099: 사용자 카메라 — 마우스가 잡으면 따르고, 4초 놓아두면 자동으로 되돌아간다
  const userCam = useRef({ blend: 0, az: 0, el: 0.45, dist: 5.5, lastInput: -99, dragging: false });
  const walkerPos = useRef<THREE.Vector3 | null>(null); // BUILD 098: 실제 위치 — 커브는 안내선일 뿐
  const lanternRef = useRef<THREE.Group | null>(null); // BUILD 117: 진자 등불 래퍼
  const prevNight = useRef(false); // BUILD 170: 밤의 문턱 감지
  // ---- BUILD 136: 구름 탈것 ----
  const ridingRef = useRef(false);
  // BUILD 146: 걷는 기계 탈출 — 문득 멈춰 두리번, 여분 클립 한 번, 그러고선 뛰어서 따라잡는다
  const moment = useRef({ next: 6 + Math.random() * 8, left: 0, kind: 'look' as 'look' | 'clip', phase: 0 });
  const hipsRef = useRef<THREE.Object3D | null>(null); // BUILD 140: 골반 뼈 — 구름이 이 뼈를 추적한다
  const footRef = useRef<THREE.Object3D | null>(null); // BUILD 142: 발 뼈 — 서서 타는 아이의 기준
  const hipsV = useMemo(() => new THREE.Vector3(), []);
  // BUILD 137: 엄마 구름 — 엉덩이에 걸치는 작은 구름 (돌멩이에 걸터앉듯, 다리는 밖으로 달랑)
  const cloudMount = useMemo(() => {
    const g = new THREE.Group();
    let sd = 4242; const rnd = () => { sd = (sd * 16807) % 2147483647; return (sd - 1) / 2147483646; };
    g.add(makeCloudPuff(rnd, 0.13));
    g.visible = false;
    return g;
  }, []);
  // 아기 구름 — 옆에서 몽실몽실 따라다니는 꼬마
  const babyCloud = useMemo(() => {
    const g = new THREE.Group();
    let sd = 7777; const rnd = () => { sd = (sd * 16807) % 2147483647; return (sd - 1) / 2147483646; };
    g.add(makeCloudPuff(rnd, 0.075));
    g.visible = false;
    return g;
  }, []);
  // BUILD 141: 빗자루 탈것 — 구름과 같은 문법, 다른 몸
  const broomMount = useMemo(() => { const g = new THREE.Group(); g.visible = false; return g; }, []);
  useEffect(() => {
    if ((spec.walker.mount?.kind ?? 'cloud') !== 'broom' || broomMount.children.length) return;
    let alive = true;
    loadKitModel('broom', defaultLoader).then((obj) => {
      if (!alive) return;
      // BUILD 145: 회전 핵 철거 — GLB 노드의 구워진 Rx(-90)를 원본에서 제거했다. 지오메트리 원좌표: 장축 +Z(자루 앞), 솔 -Z(뒤)
      obj.rotation.x = -0.09; // 코를 살짝 든다 — 나는 자세
      obj.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(obj);
      const c = box.getCenter(new THREE.Vector3());
      obj.position.x -= c.x; obj.position.z -= c.z; obj.position.y -= c.y; // 자루 중심으로
      broomMount.add(obj);
    }).catch(() => {});
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spec.walker.mount?.kind]);
  // BUILD 141: 펫 — 곁을 알아서 노는 동반자
  const petRoot = useMemo(() => new THREE.Group(), []);
  const pet = useRef<(LoadedPet & { cur: THREE.AnimationAction | null; mode: string; goal: THREE.Vector3; timer: number }) | null>(null);
  useEffect(() => {
    const kind = spec.walker.pet?.enabled ? (spec.walker.pet?.kind ?? 'cat1') : null;
    petRoot.clear();
    pet.current = null;
    if (!kind) return;
    const def = PET_ROSTER.find((d) => d.id === kind) ?? PET_ROSTER[0];
    let alive = true;
    loadPet(def).then((lp) => {
      if (!alive) return;
      pet.current = { ...lp, cur: null, mode: 'wander', goal: new THREE.Vector3(), timer: 0.5 };
      if (walkerPos.current) lp.group.position.copy(walkerPos.current).add(new THREE.Vector3(0.4, 0, 0.3));
      petRoot.add(lp.group);
    }).catch(() => {});
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spec.walker.pet?.enabled, spec.walker.pet?.kind]);
  /** 펫 클립 전환 — 0.25초 페이드 */
  const petPlay = (a: THREE.AnimationAction | null) => {
    const P = pet.current;
    if (!P || !a || P.cur === a) return;
    a.reset().fadeIn(0.35).play(); // BUILD 144: 부드럽게
    P.cur?.fadeOut(0.35);
    P.cur = a;
  };
  // BUILD 152: 하루의 빛 — world가 지은 조명들을 실측해 손잡이를 잡는다 (상수가 아니라 실측 — 늘 그랬듯)
  const lightRig = useMemo(() => {
    const par = world.sun.parent;
    let hemi: THREE.HemisphereLight | undefined;
    let fill: THREE.DirectionalLight | undefined;
    par?.children.forEach((c) => {
      if ((c as THREE.HemisphereLight).isHemisphereLight) hemi = c as THREE.HemisphereLight;
      else if ((c as THREE.DirectionalLight).isDirectionalLight && c !== world.sun) fill = c as THREE.DirectionalLight;
    });
    const dayFog = world.fogColor.clone();
    return {
      hemi, fill,
      baseSunInt: world.sun.intensity, baseHemiInt: hemi?.intensity ?? 1, baseFillInt: fill?.intensity ?? 1,
      dayFog,
      dawnFog: dayFog.clone().lerp(new THREE.Color('#b58a92'), 0.34),  // 장밋빛 새벽
      duskFog: dayFog.clone().lerp(new THREE.Color('#c8794a'), 0.42),  // 금빛 노을
      nightFog: dayFog.clone().lerp(new THREE.Color('#0d1420'), 0.75), // BUILD 115의 밤과 같은 수식
    };
  }, [world]);

  // BUILD 149: 갈매기 — 파도가 부른다. sea>0 + 낮 + 맑음/흐림일 때만 하늘에 뜬다
  const gullRoot = useMemo(() => new THREE.Group(), []);
  const gulls = useRef<{ m: THREE.Object3D; R: number; th: number; om: number; alt: number; bobA: number; bobF: number; ph: number; roll: number }[]>([]);
  const gullCryIn = useRef(20 + Math.random() * 25);
  const gullsActive = (spec.weather?.time ?? 'day') === 'day'
    && (spec.weather?.kind ?? 'clear') !== 'rain' && spec.weather?.kind !== 'snow'
    && (spec.ambience?.sea ?? 0) > 0 && (spec.ambience?.life ?? 1) > 0;
  useEffect(() => {
    gullRoot.clear();
    gulls.current = [];
    if (!gullsActive) return;
    let dead = false;
    const sea = spec.ambience?.sea ?? 0;
    const n = 2 + Math.round(sea * 3); // 파도가 높을수록 갈매기가 늘어난다 (0.55 → 4마리)
    void loadKitModel('seagull', defaultLoader).then((proto) => {
      if (dead) return;
      const mid = world.curve.getPoint(0.5);
      for (let i = 0; i < n; i += 1) {
        const m = proto.clone();
        const dir = Math.random() < 0.5 ? 1 : -1;
        gulls.current.push({
          m,
          R: 5 + Math.random() * 8,
          th: Math.random() * Math.PI * 2,
          om: dir * (0.06 + Math.random() * 0.08), // 느린 선회 — 갈매기는 서두르지 않는다
          alt: 4.5 + Math.random() * 3,
          bobA: 0.25 + Math.random() * 0.3,
          bobF: 0.07 + Math.random() * 0.08,
          ph: Math.random() * Math.PI * 2,
          roll: 0,
        });
        m.position.set(mid.x, 6, mid.z);
        m.rotation.order = 'YXZ';
        gullRoot.add(m);
      }
    });
    return () => { dead = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gullsActive, spec.ambience?.sea, world, gullRoot]);

  // BUILD 169: 우체통 속의 시 — 《잠깐 멈춰.》가 이 길 위에 산다.
  // 우체통은 이정표다: 스트리밍되지 않고 제자리를 지킨다. 지나는 사람에게 다음 글을 배달한다.
  const mailRoot = useMemo(() => new THREE.Group(), []);
  const mailSpots = useRef<{ grp: THREE.Group; cool: number }[]>([]);
  const mailDeck = useRef<{ text?: string; photo?: string }[]>([]);
  const mailIdx = useRef(0);
  const mailRest = useRef<null | { until: number; at: THREE.Vector3 }>(null);
  useEffect(() => {
    const M = spec.mail;
    mailRoot.clear();
    mailSpots.current = [];
    mailDeck.current = [];
    mailIdx.current = 0;
    const n = M?.count ?? 0;
    if (!n) return;
    let dead = false;
    // 덱: 직접 입력 또는 URL 피드 — 문자열 배열/{text,photo}/{items} 모두 수용
    const normalize = (raw: unknown): { text?: string; photo?: string }[] => {
      const arr = Array.isArray(raw) ? raw : (raw as { items?: unknown[] })?.items;
      if (!Array.isArray(arr)) return [];
      return arr.map((it) => typeof it === 'string' ? { text: it } : {
        text: (it as { text?: string }).text,
        photo: (it as { photo?: string; image?: string; photoUrl?: string }).photo
          ?? (it as { image?: string }).image ?? (it as { photoUrl?: string }).photoUrl,
      }).filter((it) => it.text || it.photo);
    };
    if (M?.source === 'url' && M.url) {
      void fetch(M.url).then((r) => r.json()).then((j) => {
        if (!dead) { mailDeck.current = normalize(j); }
      }).catch(() => { /* 배달 사고 — 우체통은 서 있되 편지는 없다 */ });
    } else {
      mailDeck.current = normalize(M?.items ?? []);
    }
    // 우체통 배치: 순환로엔 고르게, 열린 길엔 안쪽으로
    for (let i = 0; i < n; i += 1) {
      const prog = spec.path?.loop
        ? ((i + 0.5) / n) * scenes.length + (Math.random() - 0.5) * 0.6
        : 0.8 + ((i + 0.5) / n) * (scenes.length - 2);
      const t = world.progressToT(prog);
      const p = world.curve.getPoint(t);
      const tan = world.curve.getTangent(t).setY(0).normalize();
      const nor = new THREE.Vector3(-tan.z, 0, tan.x);
      const side = i % 2 === 0 ? 1 : -1;
      const grp = new THREE.Group();
      grp.position.copy(p).addScaledVector(nor, side * 0.62);
      grp.rotation.y = Math.atan2(-nor.x * side, -nor.z * side); // 길 쪽을 바라본다
      mailRoot.add(grp);
      mailSpots.current.push({ grp, cool: 0 });
      void loadKitModel(i % 2 === 0 ? 'mailbox' : 'postboxred', defaultLoader)
        .then((obj) => { if (!dead) { enforceFog(obj); grp.add(obj); } }).catch(() => {});
    }
    return () => { dead = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [world, spec.mail?.count, spec.mail?.source, spec.mail?.url, spec.mail?.items]);

  // BUILD 173: 새벽의 수탉 — 흐르는 시간의 새벽 창이 열리면, 가장 가까운 안개 속에서 태어난다.
  // 주변을 쪼며 돌아다니다가, 사람이 다가오면 홰를 치고 운다. 아침이 깊어지면 안개가 도로 데려간다.
  const rooster = useRef<null | {
    grp: THREE.Group; mixer: THREE.AnimationMixer;
    shout: THREE.AnimationAction | null; claw: THREE.AnimationAction | null;
    home: THREE.Vector3; goal: THREE.Vector3; goalIn: number; crowCool: number;
  }>(null);
  const roosterLoading = useRef(false);
  const spawnRooster = (prog: number) => {
    if (roosterLoading.current || rooster.current) return;
    roosterLoading.current = true;
    void Promise.all([
      defaultLoader('Rooster.glb'), defaultLoader('RoosterShout.glb'), defaultLoader('RoosterClaw.glb'),
    ]).then(([body, shoutD, clawD]) => {
      roosterLoading.current = false;
      const g = body.scene;
      // 정규화: 닭 크기 0.32, 발을 땅에 — 실측
      const box = new THREE.Box3().setFromObject(g);
      const size = box.getSize(new THREE.Vector3());
      g.scale.setScalar(0.32 / Math.max(1e-6, size.y));
      box.setFromObject(g);
      g.position.y -= box.min.y;
      const c = box.getCenter(new THREE.Vector3());
      g.position.x -= c.x; g.position.z -= c.z;
      const holder = new THREE.Group();
      holder.add(g);
      enforceFog(holder); // 자기 깃털은 입되(텍스처 보존), 안개는 예외 없이
      const mixer = new THREE.AnimationMixer(g);
      const mk = (clip?: THREE.AnimationClip) => {
        if (!clip) return null;
        const a = mixer.clipAction(clip);
        a.setLoop(THREE.LoopOnce, 1); a.clampWhenFinished = true;
        return a;
      };
      const shout = mk(shoutD.animations[0]);
      const claw = mk(clawD.animations[0]);
      const t = world.progressToT(prog);
      const p = world.curve.getPoint(t);
      const tan = world.curve.getTangent(t).setY(0).normalize();
      const nor = new THREE.Vector3(-tan.z, 0, tan.x);
      holder.position.copy(p).addScaledVector(nor, (Math.random() < 0.5 ? 1 : -1) * (0.45 + Math.random() * 0.4));
      waysideRoot.add(holder);
      rooster.current = {
        grp: holder, mixer, shout, claw,
        home: holder.position.clone(), goal: holder.position.clone(), goalIn: 1, crowCool: 0,
      };
    }).catch(() => { roosterLoading.current = false; });
  };

  // BUILD 168: 길가의 우연 — 안개는 무대 전환막이다.
  // 뒤 안개로 사라진 것은 철거되고, 앞 안개 너머에서 새 것이 태어난다 (Vase의 유비식 스트리밍).
  // 그리고 끝없는 하이킹의 심장 — 캠프파이어. 닿으면 앉아 쉬었다 간다.
  const waysideRoot = useMemo(() => new THREE.Group(), []);
  type WaySpot = {
    grp: THREE.Group; prog: number; kind: 'campfire' | 'prop';
    flames?: { m: THREE.Mesh; ph: number; s0: number }[];
    light?: THREE.PointLight; rested?: boolean;
    // BUILD 172: 선객 — 먼저 와서 불을 쬐던 사람
    guest?: { group: THREE.Group; mixer: THREE.AnimationMixer; anims: THREE.AnimationClip[]; natWalk: number; leaveIn: number | null };
  };
  // 먼저 떠난 이들 — 스폿과 무관하게 제 갈 길을 간다
  const departures = useRef<{ group: THREE.Group; mixer: THREE.AnimationMixer; prog: number; dir: 1 | -1; speed: number; walked: number }[]>([]);
  const waySpots = useRef<WaySpot[]>([]);
  const wayIn = useRef(6);
  const wayCount = useRef(0);
  const campRest = useRef<null | { until: number; fire: THREE.Vector3 }>(null);
  const fireSync = useRef(0);
  const campfireProto = useRef<Promise<THREE.Group> | null>(null);
  const WAY_POOL = ['stone11', 'rock3', 'suitcase', 'lamp', 'snowman', 'phonebooth'] as const; // BUILD 173: 정적 동물 퇴출 — 박제처럼 서 있는 야생은 야생이 아니다 (Vase)
  const loadCampfire = () => {
    if (!campfireProto.current) {
      campfireProto.current = defaultLoader('CampfireSet.glb').then((gltf) => {
        const root = gltf.scene;
        // 정규화: 화덕 높이 0.5, 바닥 접지
        const box = new THREE.Box3().setFromObject(root);
        const size = box.getSize(new THREE.Vector3());
        const sc = 0.5 / Math.max(1e-6, size.y);
        root.scale.setScalar(sc);
        box.setFromObject(root);
        root.position.y -= box.min.y;
        const c = box.getCenter(new THREE.Vector3());
        root.position.x -= c.x; root.position.z -= c.z;
        return root;
      });
    }
    return campfireProto.current;
  };
  const spawnWayspot = (prog: number, kind: WaySpot['kind']) => {
    const t = world.progressToT(prog);
    const p = world.curve.getPoint(t);
    const tan = world.curve.getTangent(t).setY(0).normalize();
    const nor = new THREE.Vector3(-tan.z, 0, tan.x);
    const side = Math.random() < 0.5 ? 1 : -1;
    const grp = new THREE.Group();
    grp.position.copy(p).addScaledVector(nor, side * (kind === 'campfire' ? 0.78 : 0.6 + Math.random() * 0.45));
    // (동물이면 아래 로드 시점에 조금 더 물러선다 — 야생의 거리)
    grp.rotation.y = Math.random() * Math.PI * 2;
    waysideRoot.add(grp);
    const spot: WaySpot = { grp, prog, kind };
    waySpots.current.push(spot);
    if (kind === 'campfire') {
      void loadCampfire().then((proto) => {
        const set = proto.clone(true);
        const flames: WaySpot['flames'] = [];
        set.traverse((n) => {
          const mesh = n as THREE.Mesh;
          if (!mesh.isMesh) return;
          mesh.castShadow = true;
          const isFlame = /flame/i.test(n.name) || /flame/i.test(n.parent?.name ?? '');
          mesh.material = (mesh.material as THREE.Material).clone();
          if (isFlame) {
            // 불꽃: 팔레트를 태워버린다 — 발광 재질 + 아래서 제가 흔든다
            const fm = mesh.material as THREE.MeshStandardMaterial;
            fm.color?.set('#ff9a45');
            fm.emissive = new THREE.Color('#ff7a2e');
            fm.emissiveIntensity = 1.6;
            fm.transparent = true; fm.opacity = 0.92;
            fm.fog = false; // 불은 안개 속에서도 불이다
            mesh.castShadow = false;
            flames.push({ m: mesh, ph: Math.random() * 6.28, s0: mesh.scale.y });
          } else {
            const sm = mesh.material as THREE.MeshStandardMaterial;
            if (sm.color) sm.color.set(/meat/i.test(n.name) ? '#a3563e' : '#6e5a44');
            sm.roughness = 1; sm.metalness = 0;
          }
        });
        // 발광 ≠ 광원 — 빛은 따로 데려온다 (BUILD 117의 교훈)
        const light = new THREE.PointLight('#ff9a4e', 1.1, 5.2, 1.6);
        light.position.set(0, 0.35, 0);
        set.add(light);
        enforceFog(set); // 불꽃은 fog:false·발광이라 알아서 예외
        spot.flames = flames;
        spot.light = light;
        grp.add(set);
        // BUILD 172: 65%의 확률로, 누군가 먼저 와 있다
        if (Math.random() < 0.65) {
          void loadWalkerAsset(defaultLoader, 'random').then(({ group: g2, animations, clipSpeeds }) => {
            const mixer = new THREE.AnimationMixer(g2);
            const findC = (...names: string[]) => animations.find((a) => names.includes(a.name)) ?? null;
            const sit = findC('Sit_Floor_Idle', 'Sitting', 'Sitting Idle');
            const idle = findC('Idle', 'Idle_A', 'idle');
            const pose = sit ?? idle ?? animations[0];
            if (pose) mixer.clipAction(pose).play(); // 앉을 줄 아는 아이는 앉고, 아니면 서서 불을 본다
            const a = Math.random() * Math.PI * 2;
            g2.position.set(Math.cos(a) * 0.55, 0, Math.sin(a) * 0.55);
            g2.rotation.y = Math.atan2(-g2.position.x, -g2.position.z); // 불을 바라본다
            enforceFog(g2);
            grp.add(g2);
            spot.guest = {
              group: g2, mixer, anims: animations,
              natWalk: clipSpeeds?.walk || 0.85,
              leaveIn: Math.random() < 0.45 ? 10 + Math.random() * 25 : null, // 45%는 먼저 간다 (카운트다운 — 프레임의 시계를 빌리지 않는다)
            };
          }).catch(() => {});
        }
      });
    } else {
      const key = WAY_POOL[Math.floor(Math.random() * WAY_POOL.length)];
      void loadKitModel(key, defaultLoader).then((obj) => { enforceFog(obj); grp.add(obj); }).catch(() => {});
    }
  };

  // BUILD 167: 밤하늘 — 별은 안개를 모른다 (fog:false가 옳은 유일한 존재).
  // 흐르는 시간에선 nightK를 따라 떠오르고, 구름이 짙으면 가려진다.
  const starsObj = useMemo(() => {
    const N = 750;
    const pos = new Float32Array(N * 3);
    const R = 82;
    for (let i = 0; i < N; i += 1) {
      // 상반구 돔 — 지평선 근처는 성기게, 머리 위는 빽빽하게
      const u = Math.random(); const v = Math.random();
      const theta = u * Math.PI * 2;
      const phi = Math.acos(1 - v * 0.92); // 0(천정)~살짝 위 지평선
      pos[i * 3] = R * Math.sin(phi) * Math.cos(theta);
      pos[i * 3 + 1] = R * Math.cos(phi) + 2;
      pos[i * 3 + 2] = R * Math.sin(phi) * Math.sin(theta);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.PointsMaterial({
      color: '#e8edf6', size: 0.14, sizeAttenuation: true,
      transparent: true, opacity: 0, depthWrite: false, fog: false,
    });
    const pts = new THREE.Points(geo, mat);
    pts.frustumCulled = false;
    pts.renderOrder = -1;
    return { pts, mat };
  }, []);
  const shooting = useRef<null | { mesh: THREE.Mesh; t: number; dur: number; from: THREE.Vector3; to: THREE.Vector3 }>(null);
  const shootIn = useRef(30 + Math.random() * 60);
  const shootMat = useMemo(() => new THREE.MeshBasicMaterial({
    color: '#fdf6e3', transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
  }), []);

  // BUILD 166: 스치는 사람 — 무한길은 외로운 길이다. 가끔 반대편에서 누군가 걸어온다.
  // 스칠 때 서로 고개만 살짝 — 각자의 하루가 있으므로 멈추지 않는다 (인간극장의 문법).
  const passerRoot = useMemo(() => new THREE.Group(), []);
  const passer = useRef<null | {
    group: THREE.Group; mixer: THREE.AnimationMixer; prog: number; dir: 1 | -1;
    head: THREE.Object3D | null; headYaw: number; speed: number;
  }>(null);
  const passerIn = useRef(30 + Math.random() * 45); // BUILD 170: 첫 만남은 반 분~1분쯤 뒤
  const passerLoading = useRef(false);
  const spawnPasser = (walkDir: 1 | -1, spawnProg: number) => {
    if (passerLoading.current || passer.current) return;
    passerLoading.current = true;
    void loadWalkerAsset(defaultLoader, 'random').then(({ group, animations, clipSpeeds }) => {
      passerLoading.current = false;
      const mixer = new THREE.AnimationMixer(group);
      const cWalk = animations.find((a) => ['Walking_A', 'Walking', 'Walk'].includes(a.name)) ?? animations[0];
      if (cWalk) {
        const act = mixer.clipAction(cWalk);
        const nat = clipSpeeds?.walk || 0.85;
        act.timeScale = THREE.MathUtils.clamp(0.8 / nat, 0.55, 1.9); // 발이 땅을 무는 속도
        act.play();
      }
      let head: THREE.Object3D | null = null;
      group.traverse((o) => { if (!head && /head$/i.test(o.name)) head = o; });
      enforceFog(group);
      passerRoot.add(group);
      passer.current = { group, mixer, prog: spawnProg, dir: (walkDir * -1) as 1 | -1, head, headYaw: 0, speed: 0.78 + Math.random() * 0.14 };
    }).catch(() => { passerLoading.current = false; });
  };

  const poofRoot = useMemo(() => new THREE.Group(), []);
  const poofs = useRef<{ grp: THREE.Group; t: number }[]>([]);
  const spawnPoof = (at: THREE.Vector3) => {
    const grp = new THREE.Group();
    for (let i = 0; i < 9; i += 1) {
      const m = new THREE.Mesh(new THREE.SphereGeometry(0.07, 6, 5), new THREE.MeshBasicMaterial({ color: '#e9edef', transparent: true, opacity: 0.95, depthWrite: false }));
      const a = (i / 9) * Math.PI * 2;
      m.position.set(Math.cos(a) * 0.08, (Math.random() - 0.3) * 0.1, Math.sin(a) * 0.08);
      m.userData.dir = new THREE.Vector3(Math.cos(a) * 0.7, 0.35 + Math.random() * 0.5, Math.sin(a) * 0.7);
      grp.add(m);
    }
    grp.position.copy(at).add(new THREE.Vector3(0, 0.35, 0));
    poofRoot.add(grp);
    poofs.current.push({ grp, t: 0 });
  };
  useEffect(() => {
    const on = !!riding;
    if (ridingRef.current === on) return;
    ridingRef.current = on;
    rigRef.current?.setRiding?.(on);
    const kindNow = spec.walker.mount?.kind ?? 'cloud'; // BUILD 141
    cloudMount.visible = on && kindNow === 'cloud';
    broomMount.visible = on && kindNow === 'broom';
    babyCloud.visible = on && kindNow === 'cloud';
    if (on && walkerPos.current) babyCloud.position.copy(walkerPos.current).add(new THREE.Vector3(0.4, 0.4, 0));
    if (walkerPos.current) spawnPoof(walkerPos.current); // 연기 펑 — 전환의 어색함을 가린다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [riding]);
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
      // BUILD 136: 새로 온 아이도 구름 위라면 바로 앉는다
      rigRef.current = (clipSpeeds ? createClipRig(group, animations, clipSpeeds, footsteps.step) : null)
        ?? createWalkerRig(group, animations, spec.walker.timeScale);
      if (ridingRef.current) rigRef.current?.setRiding?.(true);
      hipsRef.current = null; // BUILD 140: 새 아이의 골반을 찾는다
      footRef.current = null; // BUILD 142: 발도
      group.traverse((n) => {
        if (!hipsRef.current && /hips$/i.test(n.name)) hipsRef.current = n;
        if (!footRef.current && /(left)?foot$/i.test(n.name)) footRef.current = n;
      });
      // BUILD 116→117: 등불 — 손 뼈에 진자로 매달린다. 뼈가 어떻게 돌아도 등불은 중력을 안다.
      if ((spec.walker as { lantern?: boolean }).lantern || spec.weather?.flow?.time) { // BUILD 170: 흐르는 밤을 위해 미리 준비해 둔다
        let hand: THREE.Object3D | null = null;
        group.traverse((n) => {
          if (!(n as THREE.Bone).isBone) return;
          if (/RightHand$/i.test(n.name)) hand = hand ?? n;
        });
        if (!hand) group.traverse((n) => { if ((n as THREE.Bone).isBone && /LeftHand$/i.test(n.name)) hand = hand ?? n; });
        if (!hand) group.traverse((n) => { if ((n as THREE.Bone).isBone && /hand/i.test(n.name)) hand = hand ?? n; });
        if (hand) {
          const h = hand as THREE.Object3D;
          group.updateMatrixWorld(true);
          const ws = new THREE.Vector3();
          h.getWorldScale(ws);
          const wrapper = new THREE.Group();
          wrapper.scale.setScalar(1 / Math.max(ws.x, 1e-6)); // 뼈 누적 스케일 상쇄 — 월드 기준 실측 크기
          wrapper.visible = !!(spec.walker as { lantern?: boolean }).lantern; // 명시적 등불 세계만 상시 점등
          h.add(wrapper);
          lanternRef.current = wrapper;
          loadHandLanternAsset().then((lantern) => {
            if (!alive) return;
            lantern.position.y = -0.17; // 고리 꼭대기가 손바닥에 걸리도록
            wrapper.add(lantern);
          });
        }
      }
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
    // BUILD 157: 델타 클램핑 — 탭을 떠났다 오면 delta가 '몇 분'이 되어 모든 적분이 폭발한다.
    // 긴 공백을 짧은 한 걸음으로 자른다. 세계는 잠들었다 깬 것이지, 5분치 물리를 몰아서 살지 않는다.
    delta = Math.min(delta, 0.05);
    cameraRef.current = camera;
    // ---- BUILD 151·152: 하늘이 흐른다 ----
    const SKY = sky.current;
    if (skyOn) SKY.tick(delta);
    const windNow = skyOn && SKY.flowWeather() ? SKY.state.wind : (spec.weather?.wind ?? 0);
    if (skyOn) {
      // 소리는 1.5초마다 하늘을 따라잡는다 (setTargetAtTime이 나머지를 스민다)
      ambSync.current -= delta;
      if (ambSync.current <= 0) {
        ambSync.current = 1.5;
        ambience.apply({
          kind: SKY.state.kind, wind: windNow,
          rainAmount: Math.max(0.15, SKY.state.rainMix),
          time: SKY.state.time,
          sea: spec.ambience?.sea ?? 0, life: spec.ambience?.life ?? 1,
        });
      }
      // 갈매기는 하늘을 읽는다 — 밤이 오면, 비가 오면 내려앉는다
      gullRoot.visible = SKY.state.time === 'day' && SKY.state.kind !== 'rain' && SKY.state.kind !== 'snow';
      // BUILD 170: 밤의 등불 — 어떤 밤엔 들고, 어떤 밤엔 달빛만 믿는다 (60%의 마음)
      if (SKY.flowTime() && !(spec.walker as { lantern?: boolean }).lantern && lanternRef.current) {
        const isNight = SKY.state.time === 'night';
        if (isNight !== prevNight.current) {
          prevNight.current = isNight;
          lanternRef.current.visible = isNight && Math.random() < 0.6;
        }
      }
      // BUILD 152: 하루의 빛 — 해의 높이가 그림자를 끌고 다닌다
      if (SKY.flowTime()) {
        const DL = dayLightAt(SKY.state.dayT);
        const sun = world.sun;
        const tp = sun.target.position;
        sun.position.set(tp.x + DL.dir[0] * 34, tp.y + DL.dir[1] * 34, tp.z + DL.dir[2] * 34);
        sun.color.set(DL.sunColor);
        const cloudDim = SKY.flowWeather() ? (1 - SKY.state.cloud * 0.45) : 1;
        sun.intensity = lightRig.baseSunInt * DL.sunIntensityK * cloudDim;
        if (lightRig.hemi) lightRig.hemi.intensity = lightRig.baseHemiInt * DL.hemiK * (0.75 + cloudDim * 0.25);
        if (lightRig.fill) lightRig.fill.intensity = lightRig.baseFillInt * DL.fillK;
        // 안개와 하늘이 함께 물든다 — 새벽 장밋빛, 노을 금빛, 밤의 검푸름
        fogNow.copy(lightRig.dayFog);
        if (DL.dawnK > 0) fogNow.lerp(lightRig.dawnFog, DL.dawnK);
        if (DL.duskK > 0) fogNow.lerp(lightRig.duskFog, DL.duskK);
        if (DL.nightK > 0) fogNow.lerp(lightRig.nightFog, DL.nightK);
        const fg = r3fScene.fog as THREE.Fog | null;
        if (fg) fg.color.copy(fogNow);
        if (r3fScene.background instanceof THREE.Color) r3fScene.background.copy(fogNow);
      }
    }
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
    const loopPath = !!spec.path?.loop;
    if (stroll) {
      // BUILD 150: 무한 산책 — 목적지는 늘 두 걸음 반 앞. 도착이 없으니 멈춤도 없다
      J.phase = 'walk';
      // BUILD 161: 질주 본능 — 목적지가 없으면 뛸 계기도 없다. 그래서 가끔, 이유 없이 뛴다 (개가 그러듯이)
      const SG = strollGait.current;
      if (SG.left > 0) {
        SG.left -= delta;
        J.gait = 'run';
        if (SG.left <= 0) { J.gait = 'walk'; SG.next = 18 + Math.random() * 32; }
      } else {
        SG.next -= delta;
        if (SG.next <= 0) SG.left = 3.5 + Math.random() * 5;
      }
      J.gaitSwitchAt = -999; // 진행점 토글러는 산책에선 쉰다
      if (loopPath) {
        if (charProgress.current > scenes.length * 3) { // 숫자 위생 — 무한히 걸어도 넘치지 않게
          charProgress.current -= scenes.length;
          J.target -= scenes.length;
          // BUILD 170: 함께 걷는 것들의 진행도도 같이 감는다 — 안 그러면 한 바퀴 앞에 좌초된다
          if (passer.current) passer.current.prog -= scenes.length;
          for (const spt of waySpots.current) spt.prog -= scenes.length;
        }
        J.target = charProgress.current + 2.5;
      } else {
        if (strollDir.current > 0 && charProgress.current >= scenes.length - 1 - 0.03) strollDir.current = -1;
        else if (strollDir.current < 0 && charProgress.current <= 0.03) strollDir.current = 1;
        J.target = charProgress.current + strollDir.current * 2.5;
      }
    }
    if (tapLock.current !== null && Math.round(tapLock.current) !== activeIndex) tapLock.current = null;
    const wantTarget = tapLock.current ?? activeIndex;
    if (!stroll && lastWant.current !== wantTarget) {
      lastWant.current = wantTarget;
      // 순환 길에선 늘 앞으로 감아 도는 쪽을 택한다 (마지막 기억 → 첫 기억도 계속 전진)
      J.target = loopPath
        ? charProgress.current + ((((wantTarget - charProgress.current) % scenes.length) + scenes.length) % scenes.length)
        : wantTarget;
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
        if (ridingRef.current) targetSpeed = spec.walker.runSpeed; // BUILD 136: 구름은 뛰는 속도로 흐른다
        // BUILD 146: 순간의 자유 — 멈춰서 딴짓. 목적지는 멀어지고, 끝나면 gait가 알아서 뛰게 한다
        const M = moment.current;
        if (M.left > 0) {
          M.left -= delta;
          targetSpeed = 0;
          if (M.kind === 'look') { M.phase += delta; rigRef.current?.setLook?.(Math.sin(M.phase * 1.5) * 0.55); }
          if (M.left <= 0) rigRef.current?.setLook?.(0);
        } else if (!ridingRef.current && !(rigRef.current?.inspecting?.() ?? false)) {
          M.next -= delta;
          if (M.next <= 0) {
            M.next = 9 + Math.random() * 11;
            const d = rigRef.current?.flourish?.() ?? 0;
            if (d > 0.2) { M.kind = 'clip'; M.left = Math.min(d, 4) + 0.35; } // 여분 클립이 있으면 그것
            else { M.kind = 'look'; M.left = 1.3 + Math.random() * 1.3; M.phase = 0; } // 없으면 두리번
          }
        }
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
    const t1n = world.progressToT(loopPath ? charProgress.current + 0.01 : Math.min(scenes.length - 1, charProgress.current + 0.01));
    const dWdPn = Math.max(0.05, world.curve.getPoint(t1n).distanceTo(anchor) / 0.01);
    const facing = moving ? Math.sign(remaining) || 1 : (Math.abs(charYaw.current) > Math.PI / 2 ? -1 : 1);
    const tangent = world.curve.getTangent(t).setY(0).normalize();

    if (!walkerPos.current) walkerPos.current = anchor.clone();
    const pos = walkerPos.current;

    if (moving) {
      // 추적점: 안내선을 따라 0.42u 앞 (진행 방향으로)
      const lookP = charProgress.current + facing * (0.42 / dWdPn);
      const pursuit = world.curve.getPoint(world.progressToT(
        loopPath ? lookP : Math.max(0, Math.min(scenes.length - 1, lookP)),
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
    if (ridingRef.current) { // BUILD 136: 길 위 어느 높이를 둥둥 — BUILD 144: 바람이 흔든다
      const tt = clock.elapsedTime;
      const wAmp = 1 + windNow * 1.9; // 바람 0 = 편안~, 100% = 출렁출렁
      pos.y = anchor.y + 0.55
        + (Math.sin(tt * 0.9) * 0.05 + Math.sin(tt * 1.7 + 2) * 0.035 + Math.sin(tt * 0.37) * 0.045) * wAmp;
    }
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
        const rawIdx = Math.round(charProgress.current);
        if (Math.abs(charProgress.current - rawIdx) < 0.22) {
          const nearIdx = ((rawIdx % scenes.length) + scenes.length) % scenes.length; // BUILD 150: 순환 길에선 감아서 읽는다
          onArrive?.(nearIdx);
          const scene = scenes[nearIdx];
          const st = scene?.stillness ?? 0;
          if (!ridingRef.current) { // BUILD 138: 구름 위에선 내려서 들여다보지 않는다 — 흘러가며 볼 뿐
            if (st >= 1.3) rig.playInspect('sit');
            else if (st >= 0.65) rig.playInspect('pickup');
          }
        }
      }
      if (!wasMoving.current && moving) { if (!ridingRef.current) rig.stopInspect(); onDepart?.(); }
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
    if (ridingRef.current) walker.rotation.z = Math.sin(clock.elapsedTime * 1.1) * 0.035 * (1 + windNow * 1.9); // BUILD 144: 몸도 함께 흔들린다
    // BUILD 137: 엄마 구름은 엉덩이 밑을, 아기 구름은 옆을 — 몽실몽실
    if (cloudMount.visible) {
      const tt = clock.elapsedTime;
      // BUILD 140: 상수 추정 대신 골반 뼈 실측 — 캐릭터마다 앉는 높이가 제각각이었다 (파란 후드 사건)
      const seatH = rigRef.current?.rideSeat?.() ?? 0;
      let cloudY = walker.position.y + seatH - 0.07; // 최후 폴백
      if (seatH > 0 && hipsRef.current) {
        hipsRef.current.getWorldPosition(hipsV);
        cloudY = hipsV.y - 0.17; // 앉는 아이: 골반 바로 아래
      } else if (seatH === 0 && footRef.current) {
        footRef.current.getWorldPosition(hipsV);
        cloudY = hipsV.y - 0.095; // BUILD 142: 서는 아이는 발 뼈 실측 — 발이 살짝 묻히는 높이
      }
      const wA2 = 1 + (spec.weather?.wind ?? 0) * 1.9; // BUILD 144
      cloudMount.position.set(
        walker.position.x + Math.sin(tt * 0.53 + 1) * 0.02 * wA2,
        cloudY + Math.sin(tt * 1.3) * 0.012 * wA2,
        walker.position.z + Math.cos(tt * 0.61) * 0.02 * wA2,
      );
      cloudMount.rotation.y += delta * 0.12;
    }
    // BUILD 141: 빗자루 — 골반 아래, 진행 방향으로 자루를 눕힌다
    if (broomMount.visible) {
      const seatB = rigRef.current?.rideSeat?.() ?? 0;
      let by = walker.position.y + seatB - 0.05;
      if (seatB > 0 && hipsRef.current) { hipsRef.current.getWorldPosition(hipsV); by = hipsV.y - 0.10; } // BUILD 147: 살짝 위로 — 엉덩이가 자루에 닿게
      else if (seatB === 0 && footRef.current) { footRef.current.getWorldPosition(hipsV); by = hipsV.y - 0.1; } // BUILD 142: 서서 타면 발밑에 자루
      broomMount.position.set(walker.position.x, by, walker.position.z);
      broomMount.rotation.y = charYaw.current;
      const wA = 1 + (spec.weather?.wind ?? 0) * 1.9; // BUILD 144
      broomMount.rotation.z = Math.sin(clock.elapsedTime * 1.1) * 0.05 * wA;   // 롤
      broomMount.rotation.x = Math.sin(clock.elapsedTime * 0.8 + 1) * 0.04 * wA; // 피치 — 파도를 타듯
    }
    if (cloudMount.visible || broomMount.visible) {
      const tt = clock.elapsedTime;
      // 아기: 오른쪽 옆 0.42u를 스프링으로 따라온다 — 늦게 출발하고 부드럽게 도착
      const side = new THREE.Vector3(Math.cos(charYaw.current), 0, -Math.sin(charYaw.current));
      const target = walker.position.clone()
        .addScaledVector(side, 0.42 + Math.sin(tt * 0.4) * 0.06)
        .add(new THREE.Vector3(0, -0.02 + Math.sin(tt * 1.1 + 3) * 0.035, 0));
      babyCloud.position.lerp(target, Math.min(1, delta * 2.5));
      babyCloud.rotation.y += delta * 0.2;
    }
    // BUILD 141: 펫 — 지상에선 알아서 놀고, 탈것 위에선 함께 탄다
    {
      const P = pet.current;
      if (P) {
        P.mixer.update(delta);
        const wp = walkerPos.current;
        if (ridingRef.current) {
          const kindR = spec.walker.mount?.kind ?? 'cloud';
          if (kindR === 'broom') {
            const fx = Math.sin(charYaw.current); const fz = Math.cos(charYaw.current);
            P.group.position.set(walker.position.x - fx * 0.36, broomMount.position.y + 0.08, walker.position.z - fz * 0.36); // BUILD 145: 커진 솔방석 위로
          } else {
            P.group.position.set(babyCloud.position.x, babyCloud.position.y + 0.045, babyCloud.position.z);
          }
          P.group.rotation.y = charYaw.current;
          petPlay(P.sit ?? P.idle);
        } else if (wp) {
          P.timer -= delta;
          const dx0 = wp.x - P.group.position.x; const dz0 = wp.z - P.group.position.z;
          const dW = Math.hypot(dx0, dz0);
          // BUILD 157: 순간이동 보험 — 어떤 이유로든 리드줄 너머(7u)로 날아갔으면, 연기 펑과 함께 곁으로.
          // 쫓아오는 데 5분 걸리는 개보다, 마법처럼 나타나는 개가 낫다
          if (dW > 7) {
            spawnPoof(P.group.position.clone().add(new THREE.Vector3(0, 0.15, 0)));
            P.group.position.set(wp.x - Math.sin(charYaw.current) * 0.5, wp.y, wp.z - Math.cos(charYaw.current) * 0.5);
            spawnPoof(P.group.position.clone().add(new THREE.Vector3(0, 0.15, 0)));
            P.mode = 'idle'; P.goal.set(P.group.position.x, 0, P.group.position.z); P.timer = 0.8;
          }
          // BUILD 144: 리드줄에 물려도 하던 동작은 끝낸다 — 재롱 중 급발진(타타탁)의 진범이었다
          if (dW > 1.8 && P.mode !== 'chase' && P.mode !== 'trick') { P.mode = 'chase'; P.goal.set(wp.x, 0, wp.z); P.timer = 1.2; }
          if (P.timer <= 0) {
            P.timer = 2 + Math.random() * 3;
            const r = Math.random();
            if (dW > 1.4) { // 동작이 끝났는데 멀다 — 이제 리드줄이 끌린다
              P.mode = 'chase'; P.goal.set(wp.x, 0, wp.z); P.timer = 1.2;
            } else if (r < 0.5) { // 어슬렁 — 걷는 사람 근처 아무 데나
              P.mode = 'wander';
              const a = Math.random() * Math.PI * 2; const rr = 0.35 + Math.random() * 0.85;
              P.goal.set(wp.x + Math.cos(a) * rr, 0, wp.z + Math.sin(a) * rr);
            } else if (r < 0.78) { // 곁으로
              P.mode = 'chase'; P.goal.set(wp.x - Math.sin(charYaw.current) * 0.45, 0, wp.z - Math.cos(charYaw.current) * 0.45);
            } else if (P.tricks.length) { // 재롱 한 번
              P.mode = 'trick';
              const t0 = P.tricks[Math.floor(Math.random() * P.tricks.length)];
              t0.reset().fadeIn(0.3).play();
              P.cur?.fadeOut(0.3);
              P.cur = t0;
              P.timer = (t0.getClip().duration ?? 1.5) + 0.35; // 끝 포즈에서 숨 고르고 넘어간다
            } else { P.mode = 'idle'; }
          }
          if (P.mode !== 'trick') {
            const gx = P.goal.x - P.group.position.x; const gz = P.goal.z - P.group.position.z;
            const gd = Math.hypot(gx, gz);
            if (gd > 0.1) {
              // BUILD 144: 히스테리시스 — 한번 뛰기 시작하면 충분히 가까워질 때까지 뛴다 (문턱 파닥임 방지)
              const wasRun = (P as unknown as { running?: boolean }).running ?? false;
              const running = P.mode === 'chase' && (wasRun ? dW > 0.6 : dW > 1.3);
              (P as unknown as { running?: boolean }).running = running;
              const spd = running ? 1.35 : 0.5;
              P.group.position.x += (gx / gd) * spd * delta;
              P.group.position.z += (gz / gd) * spd * delta;
              const wantYaw = Math.atan2(gx, gz);
              let dy = wantYaw - P.group.rotation.y;
              while (dy > Math.PI) dy -= Math.PI * 2;
              while (dy < -Math.PI) dy += Math.PI * 2;
              P.group.rotation.y += dy * Math.min(1, delta * 7);
              petPlay(running ? (P.run ?? P.walk) : (P.walk ?? P.idle));
            } else {
              petPlay(P.idle);
            }
          }
          // BUILD 154: 침하 수술 — 발밑은 '펫의 자리'에서 실측한다 (워커의 y를 빌리면 경사에서 가라앉는다)
          // 워커 진행도 주변을 훑어 펫과 XZ로 가장 가까운 안내선 지점의 높이를 취한다
          let bestY = wp.y; let bestD = Infinity;
          for (let k = -6; k <= 2; k += 1) {
            const pr = charProgress.current + (k * 0.45) / dWdPn; // 뒤로 2.7u, 앞으로 0.9u
            const cp = world.curve.getPoint(world.progressToT(loopPath ? pr : Math.max(0, Math.min(scenes.length - 1, pr))));
            const dd = (cp.x - P.group.position.x) ** 2 + (cp.z - P.group.position.z) ** 2;
            if (dd < bestD) { bestD = dd; bestY = cp.y; }
          }
          P.group.position.y += (bestY - P.group.position.y) * Math.min(1, delta * 10); // 스냅 대신 스밈
        }
      }
    }
    // BUILD 141: 바람 — 하늘 구름이 흐른다. 센 날은 빠르게
    {
      const wind = windNow;
      if (wind > 0 && world.clouds?.length) {
        for (const c of world.clouds) {
          c.position.x += (0.25 + 0.75 * (c.userData.drift ?? 0.5)) * wind * delta * 1.6;
          if (c.position.x > 70) c.position.x = -70;
        }
      }
    }
    // BUILD 167: 밤하늘 — 밤의 깊이만큼 별이 떠오르고, 구름이 짙으면 가려진다
    {
      const flowT = skyOn && SKY.flowTime();
      const nightK = flowT
        ? dayLightAt(SKY.state.dayT).nightK
        : ((spec.weather?.time ?? 'day') === 'night' ? 1 : 0);
      const cloudHide = skyOn && SKY.flowWeather() ? SKY.state.cloud : (spec.weather?.cloudAmount ?? 0.35);
      const want = nightK * (1 - cloudHide * 0.85) * (spec.weather?.kind === 'rain' ? 0 : 1);
      starsObj.mat.opacity += (want * 0.9 - starsObj.mat.opacity) * Math.min(1, delta * 1.5);
      // 별똥별 — 깊은 밤에만, 40~120초에 하나
      const SH = shooting.current;
      if (!SH && starsObj.mat.opacity > 0.35) {
        shootIn.current -= delta;
        if (shootIn.current <= 0) {
          const a = Math.random() * Math.PI * 2;
          const from = new THREE.Vector3(Math.cos(a) * 46, 26 + Math.random() * 16, Math.sin(a) * 46);
          const to = from.clone().add(new THREE.Vector3((Math.random() - 0.5) * 46, -(9 + Math.random() * 12), (Math.random() - 0.5) * 46));
          const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.045, 2.1), shootMat);
          mesh.lookAt(to.clone().sub(from).add(mesh.position));
          passerRoot.add(mesh); // 루트 재활용 — 하늘 소품도 한 지붕
          shooting.current = { mesh, t: 0, dur: 0.75 + Math.random() * 0.5, from, to };
        }
      } else if (SH) {
        SH.t += delta;
        const k = Math.min(1, SH.t / SH.dur);
        SH.mesh.position.lerpVectors(SH.from, SH.to, k);
        SH.mesh.lookAt(SH.to);
        shootMat.opacity = Math.sin(k * Math.PI) * 0.85 * starsObj.mat.opacity;
        if (k >= 1) {
          passerRoot.remove(SH.mesh);
          shooting.current = null;
          shootIn.current = 40 + Math.random() * 80;
        }
      }
    }
    // BUILD 169: 우체통 — 어느 모드에서든, 지나면 편지가 온다
    if (mailSpots.current.length && !ridingRef.current) {
      const tt3 = clock.elapsedTime;
      const MR = mailRest.current;
      if (MR) {
        if (tt3 < MR.until) {
          J.target = charProgress.current; // 배달의 시간 — 발이 멈춘다
          const dxM = MR.at.x - (walkerPos.current?.x ?? 0);
          const dzM = MR.at.z - (walkerPos.current?.z ?? 0);
          let dyawM = Math.atan2(dxM, dzM) - charYaw.current;
          while (dyawM > Math.PI) dyawM -= Math.PI * 2;
          while (dyawM < -Math.PI) dyawM += Math.PI * 2;
          charYaw.current += dyawM * Math.min(1, delta * 1.8);
        } else {
          mailRest.current = null;
          onMail?.(null);
          rigRef.current?.stopInspect();
          if (!stroll) lastWant.current = null; // BUILD 171: 배달 후에도 여정은 계속된다
        }
      } else if (!campRest.current && walkerPos.current) {
        for (const ms of mailSpots.current) {
          if (tt3 < ms.cool) continue;
          if (ms.grp.position.distanceTo(walkerPos.current) < 1.05) {
            ms.cool = tt3 + 90; // 같은 우체통은 한참 뒤에나 다시
            const deck = mailDeck.current;
            const item = deck.length ? deck[mailIdx.current % deck.length] : null;
            mailIdx.current += 1;
            const readLen = item?.text ? Math.min(11, 5 + item.text.length * 0.05) : 5;
            mailRest.current = { until: tt3 + readLen, at: ms.grp.position.clone() };
            if (item) onMail?.(item);
            rigRef.current?.playInspect('pickup'); // 들여다본다 — 편지의 동작
            break;
          }
        }
      }
    }
    // BUILD 171: 길가의 우연 승격 — 순환로에선 모드 불문 (사람만 승격시키고 세간살이를 두고 왔었다)
    if (stroll || loopPath) {
      const walkerDir2 = (loopPath ? 1 : strollDir.current) as 1 | -1;
      // 생성: 앞 안개 너머(22u)에, 동시 2~3곳 유지
      wayIn.current -= delta;
      if (waySpots.current.length < 3 && wayIn.current <= 0) {
        wayIn.current = 7 + Math.random() * 12;
        const prog = charProgress.current + walkerDir2 * ((21 + Math.random() * 6) / dWdPn);
        if (loopPath || (prog > 0.5 && prog < scenes.length - 1.5)) {
          wayCount.current += 1;
          spawnWayspot(prog, wayCount.current % 3 === 0 ? 'campfire' : 'prop'); // 세 번에 한 번은 모닥불
        }
      }
      // 철거: 뒤 안개 너머(16u)로 사라진 것들
      for (let i = waySpots.current.length - 1; i >= 0; i -= 1) {
        const spt = waySpots.current[i];
        const behind = (spt.prog - charProgress.current) * walkerDir2;
        if (behind < -(16 / dWdPn)) {
          waysideRoot.remove(spt.grp);
          waySpots.current.splice(i, 1);
        }
      }
      // BUILD 173: 새벽의 수탉
      {
        const R = rooster.current;
        const dawn = skyOn && SKY.flowTime() && SKY.state.dayT > 0.205 && SKY.state.dayT < 0.36;
        if (!R && dawn && !roosterLoading.current) {
          spawnRooster(charProgress.current + walkerDir2 * (13 / dWdPn)); // 가장 가까운 안개 속
        } else if (R) {
          R.mixer.update(delta);
          const dW2 = walkerPos.current ? R.grp.position.distanceTo(walkerPos.current) : 99;
          // 로밍 — 집 주변 1.1u를 쪼며 다닌다
          R.goalIn -= delta;
          const gx = R.goal.x - R.grp.position.x; const gz = R.goal.z - R.grp.position.z;
          const gd = Math.hypot(gx, gz);
          if (gd > 0.06) {
            R.grp.position.x += (gx / gd) * 0.22 * delta;
            R.grp.position.z += (gz / gd) * 0.22 * delta;
            R.grp.rotation.y = Math.atan2(gx, gz);
            R.grp.position.y += (Math.abs(Math.sin(clock.elapsedTime * 9)) * 0.012 - (R.grp.position.y - R.home.y)) * 0.5; // 종종걸음
          } else if (R.goalIn <= 0) {
            R.goalIn = 2.5 + Math.random() * 3;
            const a = Math.random() * Math.PI * 2;
            R.goal.set(R.home.x + Math.cos(a) * (0.3 + Math.random() * 0.8), R.home.y, R.home.z + Math.sin(a) * (0.3 + Math.random() * 0.8));
            if (R.claw && Math.random() < 0.6) { R.claw.reset().fadeIn(0.2).play(); } // 땅을 쫀다
          }
          // 사람이 오면 — 홰를 치고 운다 ㅋㅋ
          if (dW2 < 2.7 && clock.elapsedTime > R.crowCool) {
            R.crowCool = clock.elapsedTime + 22 + Math.random() * 15;
            if (walkerPos.current) R.grp.rotation.y = Math.atan2(walkerPos.current.x - R.grp.position.x, walkerPos.current.z - R.grp.position.z);
            R.claw?.fadeOut(0.15);
            R.shout?.reset().fadeIn(0.15).play();
            ambience.roosterCrow(Math.max(0.25, 1 - dW2 / 6));
          }
          // 아침이 깊어지면 — 안개가 데려간다 (사람이 안 볼 때)
          const over = !skyOn || !SKY.flowTime() || SKY.state.dayT > 0.38 || SKY.state.dayT < 0.19;
          if (over && dW2 > 11) {
            waysideRoot.remove(R.grp);
            rooster.current = null;
          }
        }
      }
      // BUILD 172: 선객 — 불을 쬐다가, 어떤 이는 먼저 일어난다
      for (const spt of waySpots.current) {
        const G = spt.guest;
        if (!G) continue;
        G.mixer.update(delta);
        if (G.leaveIn !== null) G.leaveIn -= delta;
        if (G.leaveIn !== null && G.leaveIn <= 0) {
          // 일어나 제 갈 길로 — 스폿의 손을 놓고 길의 사람이 된다
          spt.guest = undefined;
          const dirL = (Math.random() < 0.5 ? 1 : -1) as 1 | -1;
          const mixer2 = new THREE.AnimationMixer(G.group);
          const walkC = G.anims.find((a) => ['Walking_A', 'Walking', 'Walk'].includes(a.name)) ?? G.anims[0];
          if (walkC) {
            const act = mixer2.clipAction(walkC);
            act.timeScale = THREE.MathUtils.clamp(0.8 / G.natWalk, 0.55, 1.9);
            act.play();
          }
          const wp2 = G.group.getWorldPosition(new THREE.Vector3());
          waysideRoot.add(G.group); // 세계 좌표 유지한 채 재입양
          G.group.position.copy(wp2);
          departures.current.push({ group: G.group, mixer: mixer2, prog: spt.prog, dir: dirL, speed: 0.75 + Math.random() * 0.15, walked: 0 });
        }
      }
      for (let i = departures.current.length - 1; i >= 0; i -= 1) {
        const D = departures.current[i];
        const tD = world.progressToT(D.prog);
        const pD = world.curve.getPoint(tD);
        const t1D = world.progressToT(D.prog + D.dir * 0.01);
        const dWdPD = Math.max(0.05, world.curve.getPoint(t1D).distanceTo(pD) / 0.01);
        D.prog += (D.dir * D.speed * delta) / dWdPD;
        D.walked += D.speed * delta;
        const ptD = world.curve.getPoint(world.progressToT(D.prog));
        const tanD = world.curve.getTangent(world.progressToT(D.prog)).setY(0).normalize();
        D.group.position.lerp(ptD, Math.min(1, delta * 3)); // 불가에서 길로 스며 합류
        D.group.position.y = ptD.y;
        D.group.rotation.y = Math.atan2(tanD.x * D.dir, tanD.z * D.dir);
        D.mixer.update(delta);
        if (D.walked > 17) { waysideRoot.remove(D.group); departures.current.splice(i, 1); } // 안개가 데려간다
      }
      // 불꽃 일렁임 + 모닥불 쉼 + 타닥 소리
      const tt2 = clock.elapsedTime;
      let nearestFire = Infinity;
      for (const spt of waySpots.current) {
        if (spt.kind !== 'campfire') continue;
        if (spt.flames) for (const F of spt.flames) {
          F.m.scale.y = F.s0 * (1 + Math.sin(tt2 * 11 + F.ph) * 0.1 + Math.sin(tt2 * 23 + F.ph * 2) * 0.06);
          (F.m.material as THREE.MeshStandardMaterial).emissiveIntensity = 1.5 + Math.sin(tt2 * 17 + F.ph) * 0.35;
        }
        if (spt.light) spt.light.intensity = 1.05 + Math.sin(tt2 * 13.7) * 0.18 + Math.sin(tt2 * 5.3 + 1) * 0.12;
        if (walkerPos.current) {
          const d = spt.grp.position.distanceTo(walkerPos.current);
          nearestFire = Math.min(nearestFire, d);
          // 닿으면 쉬어간다 — 앉는 아이는 앉고, 하이커는 서서 불을 본다
          if (!campRest.current && !spt.rested && d < 1.15) {
            spt.rested = true;
            campRest.current = { until: tt2 + 9 + Math.random() * 8, fire: spt.grp.position.clone() };
            if (!ridingRef.current) rigRef.current?.playInspect('sit');
          }
        }
      }
      fireSync.current -= delta;
      if (fireSync.current <= 0) {
        fireSync.current = 0.5;
        ambience.setFire(nearestFire === Infinity ? 0 : Math.max(0, 1 - nearestFire / 6));
      }
      // 쉼의 시간 — 목적지를 제자리에 묶고, 몸을 불 쪽으로 천천히 돌린다
      const CR = campRest.current;
      if (CR) {
        if (tt2 < CR.until) {
          J.target = charProgress.current;
          const dxF = CR.fire.x - (walkerPos.current?.x ?? 0);
          const dzF = CR.fire.z - (walkerPos.current?.z ?? 0);
          let dyaw = Math.atan2(dxF, dzF) - charYaw.current;
          while (dyaw > Math.PI) dyaw -= Math.PI * 2;
          while (dyaw < -Math.PI) dyaw += Math.PI * 2;
          charYaw.current += dyaw * Math.min(1, delta * 1.6);
        } else {
          campRest.current = null;
          rigRef.current?.stopInspect();
          if (!stroll) lastWant.current = null; // BUILD 171: 자동 모드 — 멈췄던 여정을 다시 편성한다 (안 하면 영영 선다)
        }
      }
    } else {
      if (waySpots.current.length) {
        waySpots.current.forEach((spt) => waysideRoot.remove(spt.grp));
        waySpots.current = [];
        ambience.setFire(0);
      }
      if (departures.current.length) {
        departures.current.forEach((D) => waysideRoot.remove(D.group));
        departures.current = [];
      }
      if (campRest.current) { campRest.current = null; rigRef.current?.stopInspect(); }
    }
    // BUILD 170: 스치는 사람 승격 — 순환로에선 모드 불문 등장 (무한류 세계의 시민)
    if (stroll || loopPath) {
      const PS = passer.current;
      const walkerDir = (loopPath ? 1 : strollDir.current) as 1 | -1;
      if (!PS) {
        passerIn.current -= delta;
        if (passerIn.current <= 0) {
          // 안개 너머에서 나타난다 — 시야 밖 18u 앞
          const spawnProg = charProgress.current + walkerDir * (18 / dWdPn);
          if (loopPath || (spawnProg > 0.5 && spawnProg < scenes.length - 1.5)) spawnPasser(walkerDir, spawnProg);
          else passerIn.current = 20; // 열린 길 끝자락이면 조금 뒤에 다시
        }
      } else {
        // 반대 방향으로 제 갈 길을 간다
        const t0p = world.progressToT(PS.prog);
        const p0p = world.curve.getPoint(t0p);
        const t1p = world.progressToT(PS.prog + PS.dir * 0.01);
        const dWdPp = Math.max(0.05, world.curve.getPoint(t1p).distanceTo(p0p) / 0.01);
        PS.prog += (PS.dir * PS.speed * delta) / dWdPp;
        const pt = world.curve.getPoint(world.progressToT(PS.prog));
        const tanP = world.curve.getTangent(world.progressToT(PS.prog)).setY(0).normalize();
        PS.group.position.copy(pt);
        PS.group.rotation.y = Math.atan2(tanP.x * PS.dir, tanP.z * PS.dir);
        PS.mixer.update(delta);
        // 스칠 때 고개만 살짝 — 지나면 다시 앞을 본다
        if (PS.head && walkerPos.current) {
          const d = PS.group.position.distanceTo(walkerPos.current);
          const want = d < 3.2 ? THREE.MathUtils.clamp(
            (() => { const dx = walkerPos.current.x - PS.group.position.x; const dz = walkerPos.current.z - PS.group.position.z;
              let a = Math.atan2(dx, dz) - PS.group.rotation.y;
              while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; })(),
            -0.6, 0.6) : 0;
          PS.headYaw += (want - PS.headYaw) * Math.min(1, delta * 4);
          PS.head.rotation.y += PS.headYaw;
        }
        // 뒤로 14u 멀어지면 안개 속으로 사라진다
        const behind = (PS.prog - charProgress.current) * walkerDir;
        const gone = behind < -(14 / dWdPn);
        const offEnds = !loopPath && (PS.prog < 0.1 || PS.prog > scenes.length - 1.1);
        if (gone || offEnds) {
          passerRoot.remove(PS.group);
          passer.current = null;
          passerIn.current = 45 + Math.random() * 65; // BUILD 171: 다음 인연은 1~2분 안쪽 — 길이 덜 외롭게
        }
      }
    } else if (passer.current) { // 순환도 산책도 아니면 인연을 접는다
      passerRoot.remove(passer.current.group);
      passer.current = null;
    }
    // BUILD 149: 갈매기 비행 — 이중 원(선회원 자체가 드리프트)이라 같은 궤적이 없다
    if (gulls.current.length && gullRoot.visible) {
      const wind = windNow;
      const mid = world.curve.getPoint(0.5);
      const tNow = clock.elapsedTime;
      for (const G of gulls.current) {
        G.th += G.om * (1 + wind * 1.2) * delta; // 바람이 선회를 민다
        const cx = mid.x + Math.sin(tNow * 0.021 + G.ph) * 4; // 선회 중심도 아주 느리게 떠돈다
        const cz = mid.z + Math.cos(tNow * 0.017 + G.ph) * 4;
        G.m.position.set(
          cx + Math.cos(G.th) * G.R,
          G.alt + Math.sin(tNow * G.bobF * Math.PI * 2 + G.ph) * G.bobA,
          cz + Math.sin(G.th) * G.R,
        );
        // 진행 방향으로 기수를, 선회 안쪽으로 날개를 기울인다 (뱅킹)
        const yaw = Math.atan2(-Math.sin(G.th) * G.om, Math.cos(G.th) * G.om);
        G.m.rotation.y = yaw;
        const wantRoll = -Math.sign(G.om) * (0.22 + Math.min(0.2, Math.abs(G.om) * 1.5)) ;
        G.roll += (wantRoll - G.roll) * Math.min(1, delta * 2);
        G.m.rotation.z = G.roll + Math.sin(tNow * 0.9 + G.ph) * 0.04; // 바람결에 미세하게 흔들린다
        G.m.rotation.x = Math.sin(tNow * 0.5 + G.ph) * 0.03;
      }
      // 끼룩 — 24~55초에 한 번, 멀리서
      gullCryIn.current -= delta;
      if (gullCryIn.current <= 0) {
        ambience.gullCry();
        gullCryIn.current = 24 + Math.random() * 31;
      }
    }
    // 연기 펑 — 0.6초 살고 사라진다
    for (let i = poofs.current.length - 1; i >= 0; i -= 1) {
      const pf = poofs.current[i];
      pf.t += delta;
      const k = pf.t / 0.6;
      pf.grp.children.forEach((m0) => {
        const m = m0 as THREE.Mesh;
        m.position.addScaledVector(m.userData.dir as THREE.Vector3, delta);
        m.scale.setScalar(0.9 + k * 2.4);
        (m.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 0.95 * (1 - k));
      });
      if (k >= 1) { poofRoot.remove(pf.grp); poofs.current.splice(i, 1); }
    }
    // BUILD 136: 살아 숨쉬는 배치물 — 풍차는 돌고, 떠 있는 것은 흔들린다
    for (const am of ambients.current) {
      if (am.spin) am.spin.rotation.z += delta * 1.15;
      const tt2 = clock.elapsedTime;
      am.holder.position.set(
        am.base[0] + Math.sin(tt2 * 0.31 + am.seed) * 0.06,
        am.base[1] + Math.sin(tt2 * 0.45 + am.seed * 1.7) * 0.14,
        am.base[2] + Math.cos(tt2 * 0.27 + am.seed) * 0.06,
      );
    }
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
      const rainMixNow = skyOn && SKY.flowWeather()
        ? (SKY.state.form === 'rain' ? SKY.state.rainMix : 0)
        : (spec.weather?.kind === 'rain' ? 1 : 0);
      rain.lines.visible = rainMixNow > 0.02;
      rain.lines.geometry.setDrawRange(0, Math.floor(rain.N * rainMixNow) * 2);
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

    // 눈발: 천천히 내리고, 바람에 흔들리고, 바닥에 닿으면 다시 하늘로 (사람을 따라다니는 26u 상자)
    if (snow) {
      const snowMixNow = skyOn && SKY.flowWeather() ? SKY.state.rainMix : 1;
      snow.points.visible = snowMixNow > 0.02;
      snow.points.geometry.setDrawRange(0, Math.floor(snow.N * snowMixNow));
      const arr = snow.points.geometry.attributes.position.array as Float32Array;
      const F = snow.flakes;
      const t = clock.elapsedTime;
      for (let i = 0; i < snow.N; i += 1) {
        F[i * 5 + 1] -= F[i * 5 + 3] * delta;
        F[i * 5] += Math.sin(t * 0.7 + F[i * 5 + 4]) * 0.32 * delta;
        F[i * 5 + 2] += Math.cos(t * 0.55 + F[i * 5 + 4] * 1.3) * 0.22 * delta;
        if (F[i * 5 + 1] < -1.5) {
          F[i * 5] = (Math.random() - 0.5) * 26;
          F[i * 5 + 1] = 12 + Math.random() * 3;
          F[i * 5 + 2] = (Math.random() - 0.5) * 26;
        }
        arr[i * 3] = pos.x + F[i * 5];
        arr[i * 3 + 1] = pos.y + F[i * 5 + 1];
        arr[i * 3 + 2] = pos.z + F[i * 5 + 2];
      }
      snow.points.geometry.attributes.position.needsUpdate = true;
    }

    // BUILD 117: 등불 진자 — 뼈의 회전을 상쇄해 늘 곧게 매달린다
    if (lanternRef.current && lanternRef.current.parent) {
      const q = new THREE.Quaternion();
      lanternRef.current.parent.getWorldQuaternion(q);
      lanternRef.current.quaternion.copy(q.invert());
    }

    // 로밍: 걷다가, 멈춰 서서 두리번, 다시 걷는다 — 제멋대로, 그러나 길을 따라
    for (const R of roamers.current) {
      if (R.pinned) { R.mixer.update(delta); continue; } // BUILD 111: 제자리 숨쉬기
      const N = scenes.length - 1;
      if (R.pauseT > 0) {
        R.pauseT -= delta;
        if (R.pauseT <= 0) {
          R.target = Math.max(0, Math.min(N, R.prog + (Math.random() > 0.5 ? 1 : -1) * (0.6 + Math.random() * 1.8)));
          if (R.walkAction) { R.walkAction.reset().fadeIn(0.3).play(); R.idleAction?.fadeOut(0.3); }
        }
      } else {
        const dir = Math.sign(R.target - R.prog) || 1;
        const t0 = world.progressToT(R.prog);
        const a0 = world.curve.getPoint(t0);
        const t1 = world.progressToT(Math.min(N, R.prog + 0.01));
        const dWdP2 = Math.max(0.05, world.curve.getPoint(t1).distanceTo(a0) / 0.01);
        R.prog += dir * (0.5 * delta) / dWdP2;
        if ((dir > 0 && R.prog >= R.target) || (dir < 0 && R.prog <= R.target)) {
          R.prog = R.target;
          R.pauseT = 2 + Math.random() * 5;
          if (R.idleAction) { R.idleAction.reset().fadeIn(0.3).play(); R.walkAction?.fadeOut(0.3); }
          else R.walkAction?.fadeOut(0.3);
        }
        const tanR = world.curve.getTangent(world.progressToT(R.prog)).setY(0).normalize();
        const wantYaw = Math.atan2(tanR.x * dir, tanR.z * dir);
        let dY = wantYaw - R.yaw;
        while (dY > Math.PI) dY -= Math.PI * 2;
        while (dY < -Math.PI) dY += Math.PI * 2;
        R.yaw += dY * Math.min(1, delta * 6);
      }
      const pt = world.curve.getPoint(world.progressToT(R.prog));
      const tanP = world.curve.getTangent(world.progressToT(R.prog)).setY(0).normalize();
      const norP = new THREE.Vector3(-tanP.z, 0, tanP.x);
      R.holder.position.copy(pt).add(norP.multiplyScalar(R.lateral));
      R.holder.rotation.y = R.yaw;
      R.mixer.update(delta);
    }

    // 번개 시퀀스: 강-약 두 번 번쩍, 6~16초 간격
    if (lightning) {
      const Lg = lightning;
      Lg.t += delta;
      if (Lg.seq < 0 && Lg.t > Lg.nextAt) {
        const allowed = skyOn && SKY.flowWeather() ? SKY.state.lightningOn : true; // BUILD 151: 번개는 폭우의 것
        if (allowed) { Lg.seq = 0; Lg.t = 0; ambience.thunder(); } // BUILD 148: 빛이 먼저, 우르릉은 1~3초 뒤 — 거리감
        else { Lg.t = 0; Lg.nextAt = 4 + Math.random() * 8; }
      }
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
      <fog attach="fog" args={[world.fogColor,
        spec.atmosphere?.viewFogNear ?? (spec.weather?.kind === 'rain' ? 9 : spec.weather?.kind === 'snow' ? 10 : 12),
        spec.atmosphere?.viewFogFar ?? (spec.weather?.kind === 'rain' ? 44 : spec.weather?.kind === 'snow' ? 50 : 58)]} /> {/* BUILD 131: 시야는 스펙이 정한다 — 비워두면 날씨가 정한다 */}
      {rain && <primitive object={rain.lines} />}
      {snow && <primitive object={snow.points} />}
      <primitive object={cloudMount} />
      <primitive object={babyCloud} />
      <primitive object={broomMount} />
      <primitive object={petRoot} />
      <primitive object={gullRoot} />
      <primitive object={passerRoot} />
      <primitive object={waysideRoot} />
      <primitive object={mailRoot} />
      <primitive object={starsObj.pts} />
      <primitive object={poofRoot} />
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
