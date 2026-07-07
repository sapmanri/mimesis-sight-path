import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { loadWalkerAsset, applyHeightFog, PALETTE } from '../engine/worldCore';
import { createClipRig, createWalkerRig, type WalkerRig } from './walkerRig';
import { footsteps } from './footsteps';
import { ambience } from '../audio/ambience';

// ---------- BUILD 194: 작은 행성 (LE PETIT MONDE) ----------
// Vase: "지구본 같은 것에 구불한 길이 여러 바퀴 감겨 있고, 가끔 교차하고,
//        캐릭터는 무한히 걷는다. 사람 눈엔 행성 전체가 보이지 않는다."
// 핵심 트릭: 걷는 사람이 행성을 도는 게 아니라, 행성이 발밑에서 구른다.
// 워커는 늘 세계 원점(중력 = +Y)에 서 있으므로 리그·카메라·발소리·안개가
// 평평한 세계의 문법 그대로 작동한다. 행성 전체가 하나의 그룹으로 회전한다.

const R = 8; // 행성 반지름 — 매듭맵 한 변 정도의 몸집
const WRAPS = 5; // 길이 행성을 감는 바퀴 수
const WALK = 0.58; // 기존 세계와 같은 보행 속도

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a += 0x6D2B79F5;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// 언덕: 방향 벡터로 결정되는 결정론적 노이즈 [-1, 1]
function hills(d: THREE.Vector3) {
  return (
    Math.sin(d.x * 5.3 + d.y * 3.7) * 0.45 +
    Math.sin(d.y * 7.1 + d.z * 4.3 + 1.7) * 0.35 +
    Math.sin(d.z * 9.7 + d.x * 6.1 + 4.2) * 0.2
  );
}

export function PlanetWorld() {
  const { scene, camera } = useThree();
  // 헌법 최신 판례(BUILD 191): frame 1이 무안개로 렌더되면 동기 재질이 USE_FOG 없이 영생한다.
  // 행성의 재질은 전부 동기 생성이므로, 렌더 시점에 시야안개를 명령형으로 선주입한다.
  if (!scene.fog) scene.fog = new THREE.Fog(PALETTE.fog, 9, 34);

  const built = useMemo(() => {
    const planet = new THREE.Group();

    // ---------- 1. 실타래 곡선: 구면 다중 감김 + 하모닉 요동 ----------
    // 위도가 정수 하모닉으로 출렁이고 경도가 WRAPS바퀴 돌아 제자리로 — 닫힌 실타래.
    const N = 720;
    const dirs: THREE.Vector3[] = [];
    for (let i = 0; i < N; i += 1) {
      const u = i / N;
      const phi = Math.PI * 2 * WRAPS * u;
      const theta = Math.PI / 2 + 0.62 * Math.sin(Math.PI * 2 * 3 * u + 0.7) + 0.21 * Math.sin(Math.PI * 2 * 7 * u + 2.1);
      dirs.push(new THREE.Vector3(Math.sin(theta) * Math.cos(phi), Math.cos(theta), Math.sin(theta) * Math.sin(phi)));
    }

    // 교차 탐지: 3D로 가깝지만 길로는 먼 두 지점 = 교차. 뒤에 지나는 가닥을 육교로 띄운다.
    // (매듭의 길 문법 — 어떤 굽이에선 위로, 어떤 굽이에선 아래로: 길이 직물처럼 짜인다)
    const elev = new Float32Array(N);
    {
      const kept: number[] = [];
      const base = dirs.map((d) => d.clone().multiplyScalar(R));
      for (let i = 0; i < N; i += 1) {
        for (let j = i + 45; j < N; j += 1) {
          const gap = Math.min(j - i, N - (j - i));
          if (gap < 45) continue;
          if (base[i].distanceToSquared(base[j]) < 0.81) {
            if (!kept.some((k) => Math.min(Math.abs(k - j), N - Math.abs(k - j)) < 16)) kept.push(j);
          }
        }
      }
      for (const j of kept) {
        for (let dk = -26; dk <= 26; dk += 1) {
          const k = (j + dk + N) % N;
          elev[k] = Math.min(1.5, elev[k] + 1.15 * Math.exp(-((dk / 8) ** 2)));
        }
      }
    }
    const pts = dirs.map((d, i) => d.clone().multiplyScalar(R + 0.06 + elev[i]));
    const curve = new THREE.CatmullRomCurve3(pts, true, 'centripetal');
    curve.arcLengthDivisions = 2400;
    const arcLen = curve.getLength();

    // ---------- 2. 행성 본체: 낮은 언덕 + 길목 다림질 ----------
    const geo = new THREE.IcosahedronGeometry(R, 4);
    const pos = geo.getAttribute('position');
    const colors = new Float32Array(pos.count * 3);
    const cHigh = new THREE.Color(PALETTE.cliffHigh);
    const cEdge = new THREE.Color(PALETTE.sandEdge);
    const cTop = new THREE.Color(PALETTE.sandTop);
    const cPlant = new THREE.Color(PALETTE.plant);
    const corridor = dirs.filter((_, i) => i % 3 === 0); // 길목 판정용 성긴 표본
    const vd = new THREE.Vector3();
    const cc = new THREE.Color();
    for (let i = 0; i < pos.count; i += 1) {
      vd.set(pos.getX(i), pos.getY(i), pos.getZ(i)).normalize();
      let best = -1;
      for (const c of corridor) { const dp = vd.dot(c); if (dp > best) best = dp; }
      const ang = Math.acos(Math.min(1, best)); // 길까지의 각거리
      const iron = THREE.MathUtils.smoothstep(ang, 0.07, 0.17); // 길목은 다려서 평평하게
      const h = hills(vd) * 0.18 * iron;
      const r2 = R + h;
      pos.setXYZ(i, vd.x * r2, vd.y * r2, vd.z * r2);
      cc.copy(cEdge).lerp(cHigh, THREE.MathUtils.clamp(h / 0.18 * 0.5 + 0.5, 0, 1));
      if (hills(vd.clone().multiplyScalar(2.3)) > 0.55) cc.lerp(cPlant, 0.3); // 드문 풀빛 얼룩
      cc.lerp(cTop, 1 - iron); // 길목은 모랫빛
      colors[i * 3] = cc.r; colors[i * 3 + 1] = cc.g; colors[i * 3 + 2] = cc.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.computeVertexNormals();
    const ground = new THREE.Mesh(
      geo,
      applyHeightFog(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0, flatShading: true }), 0.5),
    );
    ground.receiveShadow = true;
    planet.add(ground);

    // ---------- 3. 길 리본 ----------
    {
      const RN = 1000;
      const hw = 0.34;
      const rp: number[] = [];
      const rc: number[] = [];
      const ri: number[] = [];
      const T = new THREE.Vector3();
      const U = new THREE.Vector3();
      const B = new THREE.Vector3();
      for (let i = 0; i < RN; i += 1) {
        const t = i / RN;
        const p = curve.getPointAt(t);
        curve.getTangentAt(t, T);
        U.copy(p).normalize();
        B.crossVectors(T, U).normalize();
        const lift = U.clone().multiplyScalar(0.02);
        const L = p.clone().add(B.clone().multiplyScalar(hw)).add(lift);
        const Rv = p.clone().add(B.clone().multiplyScalar(-hw)).add(lift);
        rp.push(L.x, L.y, L.z, Rv.x, Rv.y, Rv.z);
        rc.push(cTop.r, cTop.g, cTop.b, cTop.r, cTop.g, cTop.b);
      }
      for (let i = 0; i < RN; i += 1) {
        const a = i * 2;
        const n = ((i + 1) % RN) * 2;
        ri.push(a, a + 1, n, a + 1, n + 1, n);
      }
      const rg = new THREE.BufferGeometry();
      rg.setAttribute('position', new THREE.Float32BufferAttribute(rp, 3));
      rg.setAttribute('color', new THREE.Float32BufferAttribute(rc, 3));
      rg.setIndex(ri);
      rg.computeVertexNormals();
      const ribbon = new THREE.Mesh(
        rg,
        applyHeightFog(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0, side: THREE.DoubleSide }), 0.4),
      );
      ribbon.receiveShadow = true;
      planet.add(ribbon);
    }

    // ---------- 4. 입주민: 새 식구(돌·풀포기)와 장미 한 송이 ----------
    const surfaceAt = (d: THREE.Vector3) => {
      let best = -1;
      for (const c of corridor) { const dp = d.dot(c); if (dp > best) best = dp; }
      const iron = THREE.MathUtils.smoothstep(Math.acos(Math.min(1, best)), 0.07, 0.17);
      return R + hills(d) * 0.18 * iron;
    };
    const orient = (obj: THREE.Object3D, d: THREE.Vector3) => {
      obj.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d);
    };
    const rnd = mulberry32(20260707);
    const randDir = () => {
      const z = rnd() * 2 - 1;
      const a = rnd() * Math.PI * 2;
      const s = Math.sqrt(1 - z * z);
      return new THREE.Vector3(s * Math.cos(a), z, s * Math.sin(a));
    };
    // 돌 — BUILD 193의 새 식구와 같은 혈통 (단일 디자인)
    {
      const sGeo = new THREE.IcosahedronGeometry(1, 1);
      const pa = sGeo.getAttribute('position');
      const n1 = (x: number) => Math.sin(x * 12.9898) * 0.5;
      for (let i = 0; i < pa.count; i += 1) {
        pa.setXYZ(i, pa.getX(i) * (1 + n1(i * 3.1) * 0.18), pa.getY(i) * (0.72 + n1(i * 5.7) * 0.12), pa.getZ(i) * (1 + n1(i * 7.3) * 0.18));
      }
      sGeo.computeVertexNormals();
      const sA = applyHeightFog(new THREE.MeshStandardMaterial({ color: PALETTE.cliffMid, roughness: 1, flatShading: true }), 0.5);
      const sB = applyHeightFog(new THREE.MeshStandardMaterial({ color: PALETTE.sandEdge, roughness: 1, flatShading: true }), 0.5);
      for (let k = 0; k < 10; k += 1) {
        const d = randDir();
        const r = 0.06 + rnd() * 0.1;
        const m = new THREE.Mesh(sGeo, rnd() > 0.5 ? sA : sB);
        m.scale.set(r * (1 + rnd() * 0.4), r * 0.8, r * (1 + rnd() * 0.4));
        m.position.copy(d).multiplyScalar(surfaceAt(d) + r * 0.2);
        orient(m, d);
        m.castShadow = true;
        m.receiveShadow = true;
        planet.add(m);
      }
    }
    // 풀포기 — plant 톤 순응
    {
      const tGeo = new THREE.ConeGeometry(0.02, 0.19, 3);
      const tA = applyHeightFog(new THREE.MeshStandardMaterial({ color: PALETTE.plant, roughness: 1 }), 0.5);
      const tB = applyHeightFog(new THREE.MeshStandardMaterial({ color: PALETTE.plantDark, roughness: 1 }), 0.5);
      for (let k = 0; k < 22; k += 1) {
        const d = randDir();
        const tuft = new THREE.Group();
        const n = 4 + Math.floor(rnd() * 4);
        for (let b = 0; b < n; b += 1) {
          const m = new THREE.Mesh(tGeo, rnd() > 0.5 ? tA : tB);
          const lean = 0.25 + rnd() * 0.4;
          m.position.set((rnd() - 0.5) * 0.09, 0.085, (rnd() - 0.5) * 0.09);
          m.scale.set(1, 0.8 + rnd() * 0.9, 1);
          m.rotation.set((rnd() - 0.5) * lean, rnd() * Math.PI, (rnd() - 0.5) * lean);
          m.castShadow = true;
          tuft.add(m);
        }
        tuft.position.copy(d).multiplyScalar(surfaceAt(d));
        orient(tuft, d);
        planet.add(tuft);
      }
    }
    // 장미 한 송이 — 이 행성엔 단 하나 (u=0.13, 길가 반 발짝 옆)
    {
      const t = 0.13;
      const p = curve.getPointAt(t);
      const T = curve.getTangentAt(t);
      const U = p.clone().normalize();
      const B = new THREE.Vector3().crossVectors(T, U).normalize();
      const d = p.clone().add(B.multiplyScalar(0.55)).normalize();
      const rose = new THREE.Group();
      const stem = new THREE.Mesh(
        new THREE.CylinderGeometry(0.008, 0.01, 0.15, 5),
        applyHeightFog(new THREE.MeshStandardMaterial({ color: PALETTE.plantDark, roughness: 1 }), 0.5),
      );
      stem.position.y = 0.075;
      const bud = new THREE.Mesh(
        new THREE.IcosahedronGeometry(0.034, 0),
        applyHeightFog(new THREE.MeshStandardMaterial({ color: '#c2564f', roughness: 0.85, flatShading: true }), 0.5),
      );
      bud.position.y = 0.16;
      bud.scale.y = 1.25;
      const leafG = new THREE.ConeGeometry(0.016, 0.05, 3);
      const leafM = applyHeightFog(new THREE.MeshStandardMaterial({ color: PALETTE.plant, roughness: 1 }), 0.5);
      [-0.5, 0.7].forEach((a, i2) => {
        const leaf = new THREE.Mesh(leafG, leafM);
        leaf.position.set(Math.cos(a) * 0.02, 0.06 + i2 * 0.035, Math.sin(a) * 0.02);
        leaf.rotation.z = a;
        rose.add(leaf);
      });
      stem.castShadow = true;
      bud.castShadow = true;
      rose.add(stem, bud);
      rose.position.copy(d).multiplyScalar(surfaceAt(d));
      orient(rose, d);
      planet.add(rose);
    }
    // 낮은 구름 세 점 — 행성과 함께 굴러 지평선 너머에서 온다
    {
      const cM = new THREE.MeshStandardMaterial({ color: PALETTE.white, roughness: 1, transparent: true, opacity: 0.85 });
      cM.fog = true;
      for (let k = 0; k < 3; k += 1) {
        const d = randDir();
        const cloud = new THREE.Group();
        const n = 3 + Math.floor(rnd() * 2);
        for (let b = 0; b < n; b += 1) {
          const m = new THREE.Mesh(new THREE.IcosahedronGeometry(0.34 + rnd() * 0.28, 0), cM);
          m.position.set((rnd() - 0.5) * 0.9, (rnd() - 0.5) * 0.16, (rnd() - 0.5) * 0.5);
          m.scale.y = 0.55;
          cloud.add(m);
        }
        cloud.position.copy(d).multiplyScalar(R + 2.1 + rnd() * 0.8);
        orient(cloud, d);
        planet.add(cloud);
      }
    }

    return { planet, curve, arcLen };
  }, []);

  // ---------- 걷는 사람: 세계 원점에 서고, 행성이 구른다 ----------
  const holder = useMemo(() => {
    const h = new THREE.Group();
    h.position.y = 0.022; // 리본 표면 두께만큼
    h.rotation.y = Math.PI / 2; // 화면 오른쪽으로 걷는다 (모델 정면 = +Z → +X)
    return h;
  }, []);
  const rigRef = useRef<WalkerRig | null>(null);
  useEffect(() => {
    let alive = true;
    void loadWalkerAsset(undefined, 'random').then(({ group, animations, clipSpeeds }) => {
      if (!alive) return;
      holder.add(group);
      rigRef.current = (clipSpeeds ? createClipRig(group, animations, clipSpeeds, footsteps.step) : null)
        ?? createWalkerRig(group, animations, 0.72);
    }).catch(() => { /* 조용한 행성 */ });
    return () => { alive = false; };
  }, [holder]);

  useEffect(() => {
    ambience.apply({ kind: 'clear', wind: 0.22, rainAmount: 0, time: 'day', sea: 0, life: 0.8 });
  }, []);

  // ---------- 매 프레임: 행성을 굴린다 ----------
  const S = useRef(0);
  const firstFrame = useRef(true);
  const tmp = useMemo(() => ({
    p: new THREE.Vector3(), T: new THREE.Vector3(), U: new THREE.Vector3(),
    F: new THREE.Vector3(), Z: new THREE.Vector3(), M: new THREE.Matrix4(), Q: new THREE.Quaternion(),
  }), []);
  useFrame((state, rawDt) => {
    const dt = Math.min(0.05, rawDt); // 헌법 3조: 시간은 덮치지 않는다
    S.current += WALK * dt;
    const t = ((S.current / built.arcLen) % 1 + 1) % 1;
    const { p, T, U, F, Z, M, Q } = tmp;
    built.curve.getPointAt(t, p);
    built.curve.getTangentAt(t, T);
    U.copy(p).normalize();
    F.copy(T).addScaledVector(U, -T.dot(U)).normalize();
    Z.crossVectors(F, U);
    M.makeBasis(F, U, Z);
    Q.setFromRotationMatrix(M).conjugate(); // 접점의 (전방, 위) → (+X, +Y)
    if (firstFrame.current) { // 첫 프레임은 스냅 — 행성이 '떠오르며 등장'하지 않게
      firstFrame.current = false;
      built.planet.quaternion.copy(Q);
      built.planet.position.y = -p.length();
    } else {
      const k = Math.min(1, dt * 8);
      built.planet.quaternion.slerp(Q, k);
      built.planet.position.y += (-p.length() - built.planet.position.y) * k;
    }
    rigRef.current?.update(dt, 0.5, true, state.clock.elapsedTime, WALK * dt);
    // 카메라: 손에 든 시선 — 아주 작은 흔들림만
    const e = state.clock.elapsedTime;
    camera.position.set(Math.sin(e * 0.11) * 0.14, 2.25 + Math.sin(e * 0.07) * 0.06, 5.6);
    camera.lookAt(0, 1.02, 0);
  });

  return (
    <>
      <color attach="background" args={[PALETTE.fog]} />
      <fog attach="fog" args={[PALETTE.fog, 9, 34]} />
      <hemisphereLight args={['#b9d2d8', '#c8a97e', 0.55]} />
      <directionalLight
        color="#ffe7c2"
        intensity={1.35}
        position={[6, 11, 5]}
        castShadow
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
        shadow-camera-left={-12}
        shadow-camera-right={12}
        shadow-camera-top={12}
        shadow-camera-bottom={-12}
      />
      <directionalLight color="#9fc4c9" intensity={0.22} position={[-5, 3, -4]} />
      <primitive object={built.planet} />
      <primitive object={holder} />
    </>
  );
}
