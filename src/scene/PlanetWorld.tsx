import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { loadWalkerAsset, applyHeightFog, PALETTE } from '../engine/worldCore';
import { createClipRig, createWalkerRig, type WalkerRig } from './walkerRig';
import { footsteps } from './footsteps';
import { ambience } from '../audio/ambience';

// ---------- BUILD 196: 작은 행성 v3 — 사막 행성, 붙은 길, 떠도는 시선 ----------
// v2 피드백 반영:
// · 길이 표면에서 떠 있었다 → 리프트를 한 자릿수 mm로 (모래 8 / 철길 16 / 판자 24)
// · 침목이 울타리처럼 서 있었다 → basis가 왼손좌표계(det -1)였다. B×U를 세 번째 축으로.
// · 구체에 텍스처 — 사막 테마 (프로시저럴 DataTexture, BUILD 076 표면 질감 문법).
//   PLANET_THEME 슬롯: 나중에 남극·화산 등 다른 행성이 이 자리에 들어온다.
// · 카메라 자유 로밍 — 본토의 '손에 든 시선'처럼 샷을 옮겨 다닌다.

const R = 8;
const WALK = 0.58;
const PLANET_THEME: 'desert' = 'desert'; // 테마 슬롯 — 'antarctic' | 'volcano' 등이 들어올 자리

function hills(d: THREE.Vector3) {
  return (
    Math.sin(d.x * 5.3 + d.y * 3.7) * 0.45 +
    Math.sin(d.y * 7.1 + d.z * 4.3 + 1.7) * 0.35 +
    Math.sin(d.z * 9.7 + d.x * 6.1 + 4.2) * 0.2
  );
}

// 사막 텍스처: 위도를 따라 굽이치는 모래 능선 + 잔모래 얼룩 (결정론적)
function makeDesertTexture() {
  const w = 1024;
  const hgt = 512;
  const data = new Uint8Array(w * hgt * 4);
  const c1 = [219, 197, 156]; // 모래 밝은 등
  const c2 = [182, 152, 108]; // 능선 그늘
  const c3 = [236, 222, 186]; // 볕 받는 마루
  const frac = (x: number) => x - Math.floor(x);
  for (let y = 0; y < hgt; y += 1) {
    const v = y / hgt;
    for (let x = 0; x < w; x += 1) {
      const u = x / w;
      const dune =
        Math.sin(u * Math.PI * 40 + Math.sin(v * Math.PI * 6) * 2.5 + Math.sin(u * Math.PI * 9 + v * Math.PI * 13) * 1.2) * 0.7 +
        Math.sin(u * Math.PI * 96 + v * Math.PI * 31 + 1.3) * 0.3;
      const t = THREE.MathUtils.clamp(0.5 + dune * 0.5, 0, 1);
      const speck = (frac(Math.sin(x * 12.9898 + y * 78.233) * 43758.5453) - 0.5) * 14;
      const hi = THREE.MathUtils.smoothstep(t, 0.78, 0.97);
      const i = (y * w + x) * 4;
      for (let ch = 0; ch < 3; ch += 1) {
        const base = c2[ch] + (c1[ch] - c2[ch]) * t;
        data[i + ch] = THREE.MathUtils.clamp(base + (c3[ch] - base) * hi + speck, 0, 255);
      }
      data[i + 3] = 255;
    }
  }
  const tex = new THREE.DataTexture(data, w, hgt, THREE.RGBAFormat);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(3, 2);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

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

    // ---------- 1. 세 가닥의 길 — 전부 표면 위, mm 단위 리프트 (붙어 산다) ----------
    const roads = [
      { kind: 'sand' as const, lift: 0.008, dirs: winding(4, [0.62, 3, 0.7, 0.21, 7, 2.1], eul(0, 0, 0)) },
      { kind: 'rail' as const, lift: 0.016, dirs: winding(3, [0.55, 2, 1.9, 0.18, 5, 0.4], eul(0.94, 0.3, 0.42)) },
      { kind: 'plank' as const, lift: 0.024, dirs: winding(2, [0.50, 3, 4.0, 0.15, 6, 1.2], eul(-0.72, 1.9, 0.2)) },
    ].map((r) => {
      const pts = r.dirs.map((d) => d.clone().multiplyScalar(R + r.lift));
      const curve = new THREE.CatmullRomCurve3(pts, true, 'centripetal');
      curve.arcLengthDivisions = 1800;
      return { ...r, curve, len: curve.getLength() };
    });
    const walkerRoad = roads[0];

    // ---------- 2. 사막 행성: 매끈한 사구 + 길목 다림질 + 테마 텍스처 ----------
    const corridor: THREE.Vector3[] = [];
    for (const r of roads) for (let i = 0; i < r.dirs.length; i += 3) corridor.push(r.dirs[i]);
    const geo = new THREE.SphereGeometry(R, 96, 64); // UV가 있는 구 — 텍스처가 앉는다
    const pos = geo.getAttribute('position');
    const vd = new THREE.Vector3();
    for (let i = 0; i < pos.count; i += 1) {
      vd.set(pos.getX(i), pos.getY(i), pos.getZ(i)).normalize();
      let best = -1;
      for (const c of corridor) { const dp = vd.dot(c); if (dp > best) best = dp; }
      const iron = THREE.MathUtils.smoothstep(Math.acos(Math.min(1, best)), 0.06, 0.16);
      const r2 = R + hills(vd) * 0.14 * iron; // 길목은 평평하게, 먼 곳은 사구가 굽이친다
      pos.setXYZ(i, vd.x * r2, vd.y * r2, vd.z * r2);
    }
    geo.computeVertexNormals();
    const themeTex = PLANET_THEME === 'desert' ? makeDesertTexture() : makeDesertTexture();
    const ground = new THREE.Mesh(
      geo,
      applyHeightFog(new THREE.MeshStandardMaterial({ map: themeTex, roughness: 1, metalness: 0 }), 0.5),
    );
    ground.receiveShadow = true;
    planet.add(ground);

    // ---------- 3. 길 페인터들 ----------
    const F = { p: new THREE.Vector3(), T: new THREE.Vector3(), U: new THREE.Vector3(), B: new THREE.Vector3() };
    const mkRibbon = (curve: THREE.CatmullRomCurve3, hw: number, inner: string, edge: string, rn = 760) => {
      const cIn = new THREE.Color(inner);
      const cEd = new THREE.Color(edge);
      const rp: number[] = [];
      const rc: number[] = [];
      const ri: number[] = [];
      for (let i = 0; i < rn; i += 1) {
        frameAt(curve, i / rn, F);
        for (const [off, col] of [[-hw, cEd], [-hw * 0.72, cIn], [hw * 0.72, cIn], [hw, cEd]] as [number, THREE.Color][]) {
          const v = F.p.clone().addScaledVector(F.B, off);
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
      const Z = new THREE.Vector3();
      for (let k = 0; k < count; k += 1) {
        frameAt(curve, k / count, F);
        Z.crossVectors(F.B, F.U); // BUILD 196: 오른손 좌표계 — det -1 반사 행렬이 침목을 세워버렸다
        basis.makeBasis(F.B, F.U, Z);
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

    planet.add(mkRibbon(walkerRoad.curve, 0.34, PALETTE.sandTop, PALETTE.sandEdge));
    {
      const rr = roads[1];
      planet.add(mkRibbon(rr.curve, 0.30, PALETTE.cliffMid, PALETTE.cliffLow));
      planet.add(mkCrossties(rr.curve, rr.len, 0.5, [0.42, 0.02, 0.085], '#4a3f35', 0.012));
      planet.add(mkRails(rr.curve, 0.13, 0.022));
    }
    {
      const pr = roads[2];
      planet.add(mkRibbon(pr.curve, 0.28, PALETTE.cliffLow, PALETTE.basalt));
      planet.add(mkCrossties(pr.curve, pr.len, 0.34, [0.5, 0.018, 0.24], '#8a6f4d', 0.012));
    }

    return { planet, curve: walkerRoad.curve, arcLen: walkerRoad.len };
  }, []);

  // ---------- 걷는 사람 ----------
  const holder = useMemo(() => {
    const h = new THREE.Group();
    h.position.y = 0.012;
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
    ambience.apply({ kind: 'clear', wind: 0.28, rainAmount: 0, time: 'day', sea: 0, life: 0.5 });
  }, []);

  // ---------- 떠도는 시선: 샷을 옮겨 다니는 카메라 (본토 '손에 든 시선'의 문법) ----------
  const SHOTS = useMemo(() => [
    { p: new THREE.Vector3(0, 2.25, 5.6), look: new THREE.Vector3(0, 1.02, 0) },   // 옆
    { p: new THREE.Vector3(3.4, 1.9, 4.3), look: new THREE.Vector3(0, 0.95, 0) },  // 사선 앞
    { p: new THREE.Vector3(1.3, 0.85, 3.1), look: new THREE.Vector3(0, 0.85, 0.3) }, // 낮게, 가까이 — 곡률이 느껴진다
    { p: new THREE.Vector3(-2.8, 3.6, 5.2), look: new THREE.Vector3(0.4, 0.7, 0) }, // 높게 뒤에서 — 행성이 보인다
    { p: new THREE.Vector3(-3.8, 1.6, 3.6), look: new THREE.Vector3(0, 1.0, 0) },  // 반대 사선
  ], []);
  const cam = useRef({ shot: 0, hold: 11, pos: new THREE.Vector3(0, 2.25, 5.6), look: new THREE.Vector3(0, 1.02, 0) });

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

    // 시선 로밍: 9~15초 머물다 다음 자리로 미끄러진다 + 늘 잔잔한 손떨림
    const C = cam.current;
    C.hold -= dt;
    if (C.hold <= 0) {
      let next = Math.floor(Math.random() * SHOTS.length);
      if (next === C.shot) next = (next + 1) % SHOTS.length;
      C.shot = next;
      C.hold = 9 + Math.random() * 6;
    }
    const tgt = SHOTS[C.shot];
    const kc = Math.min(1, dt * 0.65); // 느린 미끄러짐
    C.pos.lerp(tgt.p, kc);
    C.look.lerp(tgt.look, kc);
    const e = state.clock.elapsedTime;
    camera.position.set(
      C.pos.x + Math.sin(e * 0.11) * 0.14,
      C.pos.y + Math.sin(e * 0.07) * 0.06,
      C.pos.z + Math.cos(e * 0.09) * 0.1,
    );
    camera.lookAt(C.look.x, C.look.y, C.look.z);
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
