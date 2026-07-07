import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { loadWalkerAsset, applyHeightFog, PALETTE } from '../engine/worldCore';
import { createClipRig, createWalkerRig, type WalkerRig } from './walkerRig';
import { footsteps } from './footsteps';
import { ambience } from '../audio/ambience';

// ---------- BUILD 195: 작은 행성 v2 — 맨 행성, 얽힌 길들 ----------
// Vase 재설계: 육교 없음(길은 행성 표면에만 산다 — 교차는 그냥 평면에서 겹친다),
// 돌·풀·장미·구름 등 오브젝트는 나중에(맨 행성), 길은 별개 존재가 아니라
// "구체 위에 그려진 길" — 기존 길 재질의 문법으로: 철길(열차 없이 노반만)·모래길·판자길.
// 핵심 트릭은 v1 그대로: 사람이 아니라 행성이 발밑에서 구른다.

const R = 8;
const WALK = 0.58;

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

function hills(d: THREE.Vector3) {
  return (
    Math.sin(d.x * 5.3 + d.y * 3.7) * 0.45 +
    Math.sin(d.y * 7.1 + d.z * 4.3 + 1.7) * 0.35 +
    Math.sin(d.z * 9.7 + d.x * 6.1 + 4.2) * 0.2
  );
}

// 구면 감김 곡선: 경도 W바퀴 + 위도 하모닉 요동, 축을 기울여 가닥마다 다른 자세로 얽힌다
function winding(wraps: number, h: [number, number, number, number, number, number], tilt: THREE.Quaternion, n = 560) {
  const dirs: THREE.Vector3[] = [];
  for (let i = 0; i < n; i += 1) {
    const u = i / n;
    const phi = Math.PI * 2 * wraps * u;
    const theta = Math.PI / 2 + h[0] * Math.sin(Math.PI * 2 * h[1] * u + h[2]) + h[3] * Math.sin(Math.PI * 2 * h[4] * u + h[5]);
    const d = new THREE.Vector3(Math.sin(theta) * Math.cos(phi), Math.cos(theta), Math.sin(theta) * Math.sin(phi));
    dirs.push(d.applyQuaternion(tilt));
  }
  return dirs;
}

// 길의 뼈대 프레임: 접점 p(표면 위 lift만큼), 진행 T, 위 U(=방사), 가로 B
function frameAt(curve: THREE.CatmullRomCurve3, t: number, out: { p: THREE.Vector3; T: THREE.Vector3; U: THREE.Vector3; B: THREE.Vector3 }) {
  curve.getPointAt(t, out.p);
  curve.getTangentAt(t, out.T);
  out.U.copy(out.p).normalize();
  out.B.crossVectors(out.T, out.U).normalize();
}

export function PlanetWorld() {
  const { scene, camera } = useThree();
  // BUILD 191 판례: frame 1 무안개 컴파일 방지 — 렌더 시점 선주입
  if (!scene.fog) scene.fog = new THREE.Fog(PALETTE.fog, 9, 34);

  const built = useMemo(() => {
    const planet = new THREE.Group();
    const eul = (x: number, y: number, z: number) => new THREE.Quaternion().setFromEuler(new THREE.Euler(x, y, z));

    // ---------- 1. 세 가닥의 길 (전부 표면 위, 육교 없음 — 교차는 평면에서 겹친다) ----------
    const roads = [
      { kind: 'sand' as const, lift: 0.020, dirs: winding(4, [0.62, 3, 0.7, 0.21, 7, 2.1], eul(0, 0, 0)) },
      { kind: 'rail' as const, lift: 0.030, dirs: winding(3, [0.55, 2, 1.9, 0.18, 5, 0.4], eul(0.94, 0.3, 0.42)) },
      { kind: 'plank' as const, lift: 0.040, dirs: winding(2, [0.50, 3, 4.0, 0.15, 6, 1.2], eul(-0.72, 1.9, 0.2)) },
    ].map((r) => {
      const pts = r.dirs.map((d) => d.clone().multiplyScalar(R + r.lift));
      const curve = new THREE.CatmullRomCurve3(pts, true, 'centripetal');
      curve.arcLengthDivisions = 1800;
      return { ...r, curve, len: curve.getLength() };
    });
    const walkerRoad = roads[0]; // 모래길이 걷는 이의 길

    // ---------- 2. 맨 행성: 낮은 언덕 + 길목 다림질 (오브젝트는 나중에 — Vase 재가) ----------
    const corridor: THREE.Vector3[] = [];
    for (const r of roads) for (let i = 0; i < r.dirs.length; i += 3) corridor.push(r.dirs[i]);
    const geo = new THREE.IcosahedronGeometry(R, 4);
    const pos = geo.getAttribute('position');
    const colors = new Float32Array(pos.count * 3);
    const cHigh = new THREE.Color(PALETTE.cliffHigh);
    const cEdge = new THREE.Color(PALETTE.sandEdge);
    const vd = new THREE.Vector3();
    const cc = new THREE.Color();
    for (let i = 0; i < pos.count; i += 1) {
      vd.set(pos.getX(i), pos.getY(i), pos.getZ(i)).normalize();
      let best = -1;
      for (const c of corridor) { const dp = vd.dot(c); if (dp > best) best = dp; }
      const iron = THREE.MathUtils.smoothstep(Math.acos(Math.min(1, best)), 0.06, 0.16); // 길목은 다려서
      const h = hills(vd) * 0.16 * iron;
      const r2 = R + h;
      pos.setXYZ(i, vd.x * r2, vd.y * r2, vd.z * r2);
      cc.copy(cEdge).lerp(cHigh, THREE.MathUtils.clamp((h / 0.16) * 0.5 + 0.5, 0, 1));
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

    // ---------- 3. 길 페인터들 — 기존 길 재질의 문법 ----------
    const F = { p: new THREE.Vector3(), T: new THREE.Vector3(), U: new THREE.Vector3(), B: new THREE.Vector3() };
    const mkRibbon = (curve: THREE.CatmullRomCurve3, hw: number, inner: string, edge: string, extraLift = 0, rn = 760) => {
      // 4정점 링(가장자리·안쪽·안쪽·가장자리) — 안쪽은 길색, 가장자리는 어둡게 (모래길 문법)
      const cIn = new THREE.Color(inner);
      const cEd = new THREE.Color(edge);
      const rp: number[] = [];
      const rc: number[] = [];
      const ri: number[] = [];
      for (let i = 0; i < rn; i += 1) {
        frameAt(curve, i / rn, F);
        const lift = F.U.clone().multiplyScalar(extraLift);
        for (const [off, col] of [[-hw, cEd], [-hw * 0.72, cIn], [hw * 0.72, cIn], [hw, cEd]] as [number, THREE.Color][]) {
          const v = F.p.clone().addScaledVector(F.B, off).add(lift);
          rp.push(v.x, v.y, v.z);
          rc.push(col.r, col.g, col.b);
        }
      }
      for (let i = 0; i < rn; i += 1) {
        const a = i * 4;
        const n2 = ((i + 1) % rn) * 4;
        for (let q = 0; q < 3; q += 1) ri.push(a + q, a + q + 1, n2 + q, a + q + 1, n2 + q + 1, n2 + q);
      }
      const rg = new THREE.BufferGeometry();
      rg.setAttribute('position', new THREE.Float32BufferAttribute(rp, 3));
      rg.setAttribute('color', new THREE.Float32BufferAttribute(rc, 3));
      rg.setIndex(ri);
      rg.computeVertexNormals();
      const mesh = new THREE.Mesh(
        rg,
        applyHeightFog(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0, side: THREE.DoubleSide }), 0.4),
      );
      mesh.receiveShadow = true;
      return mesh;
    };
    const mkCrossties = (curve: THREE.CatmullRomCurve3, len: number, spacing: number, size: [number, number, number], color: string, extraLift: number) => {
      // 침목/판자: 길을 가로지르는 각재 인스턴서 (열차길·판자길 문법)
      const count = Math.floor(len / spacing);
      const mesh = new THREE.InstancedMesh(
        new THREE.BoxGeometry(size[0], size[1], size[2]),
        applyHeightFog(new THREE.MeshStandardMaterial({ color, roughness: 0.9, metalness: 0 }), 0.4),
        count,
      );
      const M = new THREE.Matrix4();
      const basis = new THREE.Matrix4();
      const Q = new THREE.Quaternion();
      const S = new THREE.Vector3(1, 1, 1);
      for (let k = 0; k < count; k += 1) {
        frameAt(curve, k / count, F);
        basis.makeBasis(F.B, F.U, F.T); // 각재의 X=가로, Y=위, Z=진행
        Q.setFromRotationMatrix(basis);
        M.compose(F.p.clone().addScaledVector(F.U, extraLift), Q, S);
        mesh.setMatrixAt(k, M);
      }
      mesh.instanceMatrix.needsUpdate = true;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      return mesh;
    };
    const mkRails = (curve: THREE.CatmullRomCurve3, gauge: number, extraLift: number, rn = 760) => {
      // 두 가닥의 레일 — 가는 연속 리본 (worldCore 열차길의 강철 톤)
      const g2 = new THREE.Group();
      const cR = new THREE.Color('#33302b');
      for (const side of [-1, 1]) {
        const rp: number[] = [];
        const ri: number[] = [];
        const rc: number[] = [];
        for (let i = 0; i < rn; i += 1) {
          frameAt(curve, i / rn, F);
          const lift = F.U.clone().multiplyScalar(extraLift);
          const c2 = F.p.clone().addScaledVector(F.B, side * gauge).add(lift);
          for (const off of [-0.014, 0.014]) {
            const v = c2.clone().addScaledVector(F.B, off);
            rp.push(v.x, v.y, v.z);
            rc.push(cR.r, cR.g, cR.b);
          }
        }
        for (let i = 0; i < rn; i += 1) {
          const a = i * 2;
          const n2 = ((i + 1) % rn) * 2;
          ri.push(a, a + 1, n2, a + 1, n2 + 1, n2);
        }
        const rg = new THREE.BufferGeometry();
        rg.setAttribute('position', new THREE.Float32BufferAttribute(rp, 3));
        rg.setAttribute('color', new THREE.Float32BufferAttribute(rc, 3));
        rg.setIndex(ri);
        rg.computeVertexNormals();
        const mesh = new THREE.Mesh(rg, applyHeightFog(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0.25, side: THREE.DoubleSide }), 0.4));
        g2.add(mesh);
      }
      return g2;
    };

    // 모래길 (걷는 이의 길)
    planet.add(mkRibbon(walkerRoad.curve, 0.34, PALETTE.sandTop, PALETTE.sandEdge));
    // 철길: 자갈 노반 + 침목 + 레일 — 열차는 없다 ("열차 빼고 열차 아래에 있던 열차길")
    {
      const rr = roads[1];
      planet.add(mkRibbon(rr.curve, 0.30, PALETTE.cliffMid, PALETTE.cliffLow));
      planet.add(mkCrossties(rr.curve, rr.len, 0.5, [0.42, 0.022, 0.085], '#4a3f35', 0.014));
      planet.add(mkRails(rr.curve, 0.13, 0.032));
    }
    // 판자길: 흙바탕 + 널판
    {
      const pr = roads[2];
      planet.add(mkRibbon(pr.curve, 0.28, PALETTE.cliffLow, PALETTE.basalt ?? PALETTE.cliffDeep));
      planet.add(mkCrossties(pr.curve, pr.len, 0.34, [0.5, 0.02, 0.24], '#8a6f4d', 0.016));
    }

    return { planet, curve: walkerRoad.curve, arcLen: walkerRoad.len };
  }, []);

  // ---------- 걷는 사람 ----------
  const holder = useMemo(() => {
    const h = new THREE.Group();
    h.position.y = 0.024;
    h.rotation.y = Math.PI / 2;
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
    const dt = Math.min(0.05, rawDt); // 헌법 3조
    S.current += WALK * dt;
    const t = ((S.current / built.arcLen) % 1 + 1) % 1;
    const { p, T, U, F: Fw, Z, M, Q } = tmp;
    built.curve.getPointAt(t, p);
    built.curve.getTangentAt(t, T);
    U.copy(p).normalize();
    Fw.copy(T).addScaledVector(U, -T.dot(U)).normalize();
    Z.crossVectors(Fw, U);
    M.makeBasis(Fw, U, Z);
    Q.setFromRotationMatrix(M).conjugate();
    if (firstFrame.current) {
      firstFrame.current = false;
      built.planet.quaternion.copy(Q);
      built.planet.position.y = -p.length();
    } else {
      const k = Math.min(1, dt * 8);
      built.planet.quaternion.slerp(Q, k);
      built.planet.position.y += (-p.length() - built.planet.position.y) * k;
    }
    rigRef.current?.update(dt, 0.5, true, state.clock.elapsedTime, WALK * dt);
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
