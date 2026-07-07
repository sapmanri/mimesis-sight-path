import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { loadWalkerAsset, applyHeightFog, PALETTE } from '../engine/worldCore';
import { createClipRig, createWalkerRig, type WalkerRig } from './walkerRig';
import { footsteps } from './footsteps';
import { ambience } from '../audio/ambience';

// ---------- BUILD 197: 작은 행성 v4 — 보이지 않는 길 ----------
// Vase: "길 자체를 없애줘. 길 아래 패스는 남아 있고, 그냥 지면을 걸어다니는 걸로.
//        나중에 그 패스를 기준으로 텍스처를 입혀보자."
// · 길 시각물(리본·침목·레일·널판) 전부 철거 — 패스는 보이지 않는 안내선으로만 산다
// · 패스가 지형(사구)의 높낮이를 그대로 따라간다 — 걷는 이는 맨 모래 위를 걷는다
// · 카메라: 드래그로 직접 돌리고(휠 줌), 9초 놓아두면 자동 로밍으로 스르르 복귀

const R = 8;
const WALK = 0.58;
const DUNE = 0.14; // 사막 테마의 사구 진폭

// ---------- BUILD 198: 테마 시스템 — 색맵은 구체에, 높이맵은 지형과 패스에 ----------
// "별이라는 게 맨들맨들하지만은 않잖아" — 높이맵이 지형 정점을 밀고, 패스가 그 굴곡을
// 그대로 따라간다. 걷는 이는 실제 크레이터 능선을 오르내린다.
const THEMES = {
  desert: { kind: 'procedural' as const },
  moon: { kind: 'maps' as const, color: 'assets/planet/moon_color.jpg', height: 'assets/planet/moon_height.png', amp: 0.3 },
};
const PLANET_THEME: keyof typeof THEMES = 'moon';

// 높이맵 샘플러 — SphereGeometry의 UV 규약과 정확히 같은 dir→(u,v) 사상 (색과 굴곡이 어긋나지 않게)
async function loadHeightSampler(url: string) {
  const img = await new Promise<HTMLImageElement>((res, rej) => {
    const im = new Image();
    im.onload = () => res(im);
    im.onerror = rej;
    im.src = url;
  });
  const c = document.createElement('canvas');
  c.width = img.width;
  c.height = img.height;
  const ctx = c.getContext('2d')!;
  ctx.drawImage(img, 0, 0);
  const px = ctx.getImageData(0, 0, c.width, c.height).data;
  const w = c.width;
  const h = c.height;
  return (dir: THREE.Vector3) => {
    // three SphereGeometry: x=-cosφ·sinθ, z=sinφ·sinθ, y=cosθ / uv=(φ/2π, 1-θ/π)
    const theta = Math.acos(THREE.MathUtils.clamp(dir.y, -1, 1));
    let u = Math.atan2(dir.z, -dir.x) / (Math.PI * 2);
    if (u < 0) u += 1;
    const fx = u * (w - 1);
    const fy = (theta / Math.PI) * (h - 1);
    const x0 = Math.floor(fx);
    const y0 = Math.floor(fy);
    const x1 = (x0 + 1) % w;
    const y1 = Math.min(h - 1, y0 + 1);
    const tx = fx - x0;
    const ty = fy - y0;
    const g = (x: number, y: number) => px[(y * w + x) * 4] / 255;
    const v = g(x0, y0) * (1 - tx) * (1 - ty) + g(x1, y0) * tx * (1 - ty) + g(x0, y1) * (1 - tx) * ty + g(x1, y1) * tx * ty;
    return (v - 0.5) * 2; // [-1, 1]
  };
}

function hills(d: THREE.Vector3) {
  return (
    Math.sin(d.x * 5.3 + d.y * 3.7) * 0.45 +
    Math.sin(d.y * 7.1 + d.z * 4.3 + 1.7) * 0.35 +
    Math.sin(d.z * 9.7 + d.x * 6.1 + 4.2) * 0.2
  );
}

function makeDesertTexture() {
  const w = 1024;
  const hgt = 512;
  const data = new Uint8Array(w * hgt * 4);
  const c1 = [219, 197, 156];
  const c2 = [182, 152, 108];
  const c3 = [236, 222, 186];
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

export function PlanetWorld() {
  const { scene, camera, gl } = useThree();
  // BUILD 191 판례: frame 1 무안개 컴파일 방지 — 렌더 시점 선주입
  if (!scene.fog) scene.fog = new THREE.Fog(PALETTE.fog, 9, 34);

  type Built = { planet: THREE.Group; curve: THREE.CatmullRomCurve3; arcLen: number };
  const [built, setBuilt] = useState<Built | null>(null);
  useEffect(() => {
    let alive = true;
    void (async () => {
      // ---------- 0. 테마 준비: 색맵 + 높이 함수 ----------
      const theme = THEMES[PLANET_THEME];
      let heightAt: (d: THREE.Vector3) => number = (d) => hills(d) * DUNE;
      let map: THREE.Texture;
      if (theme.kind === 'maps') {
        const loader = new THREE.TextureLoader();
        map = await loader.loadAsync(theme.color);
        map.colorSpace = THREE.SRGBColorSpace;
        map.wrapS = THREE.RepeatWrapping;
        map.anisotropy = 4;
        const sample = await loadHeightSampler(theme.height);
        heightAt = (d) => sample(d) * theme.amp;
      } else {
        map = makeDesertTexture();
      }
      if (!alive) return;

      const planet = new THREE.Group();

      // ---------- 1. 보이지 않는 길: 지형의 높낮이(크레이터·사구)를 그대로 따른다 ----------
      const N = 560;
      const pts: THREE.Vector3[] = [];
      for (let i = 0; i < N; i += 1) {
        const u = i / N;
        const phi = Math.PI * 2 * 4 * u;
        const theta = Math.PI / 2 + 0.62 * Math.sin(Math.PI * 2 * 3 * u + 0.7) + 0.21 * Math.sin(Math.PI * 2 * 7 * u + 2.1);
        const d = new THREE.Vector3(Math.sin(theta) * Math.cos(phi), Math.cos(theta), Math.sin(theta) * Math.sin(phi));
        pts.push(d.multiplyScalar(R + heightAt(d) + 0.005)); // 지면 그 자체가 길이다
      }
      const curve = new THREE.CatmullRomCurve3(pts, true, 'centripetal');
      curve.arcLengthDivisions = 1800;
      const arcLen = curve.getLength();

      // ---------- 2. 행성 본체 — 높이맵이 정점을 민다 ----------
      const geo = new THREE.SphereGeometry(R, 128, 96);
      const pos = geo.getAttribute('position');
      const vd = new THREE.Vector3();
      for (let i = 0; i < pos.count; i += 1) {
        vd.set(pos.getX(i), pos.getY(i), pos.getZ(i)).normalize();
        const r2 = R + heightAt(vd);
        pos.setXYZ(i, vd.x * r2, vd.y * r2, vd.z * r2);
      }
      geo.computeVertexNormals();
      const ground = new THREE.Mesh(
        geo,
        applyHeightFog(new THREE.MeshStandardMaterial({ map, roughness: 1, metalness: 0 }), 0.5),
      );
      ground.receiveShadow = true;
      planet.add(ground);

      setBuilt({ planet, curve, arcLen });
    })();
    return () => { alive = false; };
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

  // ---------- 시선: 드래그로 돌리고, 놓아두면 스스로 떠돈다 ----------
  const SHOTS = useMemo(() => [
    { p: new THREE.Vector3(0, 2.25, 5.6), look: new THREE.Vector3(0, 1.02, 0) },
    { p: new THREE.Vector3(3.4, 1.9, 4.3), look: new THREE.Vector3(0, 0.95, 0) },
    { p: new THREE.Vector3(1.3, 0.85, 3.1), look: new THREE.Vector3(0, 0.85, 0.3) },
    { p: new THREE.Vector3(-2.8, 3.6, 5.2), look: new THREE.Vector3(0.4, 0.7, 0) },
    { p: new THREE.Vector3(-3.8, 1.6, 3.6), look: new THREE.Vector3(0, 1.0, 0) },
  ], []);
  const cam = useRef({
    shot: 0, hold: 11,
    pos: new THREE.Vector3(0, 2.25, 5.6), look: new THREE.Vector3(0, 1.02, 0),
    manualUntil: 0, // 이 시각까지는 사람의 손이 시선의 주인
    sph: new THREE.Spherical(), dragging: false, lastX: 0, lastY: 0,
  });
  useEffect(() => {
    const el = gl.domElement;
    const C = cam.current;
    const grab = () => {
      // 손이 닿는 순간, 현재 카메라 자리를 구면 좌표로 이어받는다
      C.sph.setFromVector3(new THREE.Vector3().subVectors(camera.position, C.look));
      C.manualUntil = performance.now() + 9000;
    };
    const down = (e: PointerEvent) => { C.dragging = true; C.lastX = e.clientX; C.lastY = e.clientY; grab(); };
    const move = (e: PointerEvent) => {
      if (!C.dragging) return;
      const dx = (e.clientX - C.lastX) / el.clientWidth;
      const dy = (e.clientY - C.lastY) / el.clientHeight;
      C.lastX = e.clientX; C.lastY = e.clientY;
      C.sph.theta -= dx * Math.PI * 1.6;
      C.sph.phi = THREE.MathUtils.clamp(C.sph.phi - dy * Math.PI * 1.1, 0.15, Math.PI * 0.62);
      C.manualUntil = performance.now() + 9000;
    };
    const up = () => { C.dragging = false; };
    const wheel = (e: WheelEvent) => {
      grab();
      C.sph.radius = THREE.MathUtils.clamp(C.sph.radius * (1 + Math.sign(e.deltaY) * 0.08), 2.4, 10);
      e.preventDefault();
    };
    el.addEventListener('pointerdown', down);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    el.addEventListener('wheel', wheel, { passive: false });
    return () => {
      el.removeEventListener('pointerdown', down);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      el.removeEventListener('wheel', wheel);
    };
  }, [gl, camera]);

  const S = useRef(0);
  const firstFrame = useRef(true);
  const tmp = useMemo(() => ({
    p: new THREE.Vector3(), T: new THREE.Vector3(), U: new THREE.Vector3(),
    F: new THREE.Vector3(), Z: new THREE.Vector3(), M: new THREE.Matrix4(), Q: new THREE.Quaternion(),
    v: new THREE.Vector3(),
  }), []);
  useFrame((state, rawDt) => {
    if (!built) return; // 테마가 아직 오는 중
    const dt = Math.min(0.05, rawDt); // 헌법 3조
    S.current += WALK * dt;
    const t = ((S.current / built.arcLen) % 1 + 1) % 1;
    const { p, T, U, F: Fw, Z, M, Q, v } = tmp;
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

    const C = cam.current;
    const manual = performance.now() < C.manualUntil;
    const e = state.clock.elapsedTime;
    if (manual) {
      // 사람의 손 — 구면 좌표 그대로
      v.setFromSpherical(C.sph).add(C.look);
      camera.position.lerp(v, Math.min(1, dt * 10));
      camera.lookAt(C.look.x, C.look.y, C.look.z);
      C.pos.copy(camera.position); // 놓는 순간 여기서부터 스르르 떠난다
    } else {
      C.hold -= dt;
      if (C.hold <= 0) {
        let next = Math.floor(Math.random() * SHOTS.length);
        if (next === C.shot) next = (next + 1) % SHOTS.length;
        C.shot = next;
        C.hold = 9 + Math.random() * 6;
      }
      const tgt = SHOTS[C.shot];
      const kc = Math.min(1, dt * 0.65);
      C.pos.lerp(tgt.p, kc);
      C.look.lerp(tgt.look, kc);
      camera.position.set(
        C.pos.x + Math.sin(e * 0.11) * 0.14,
        C.pos.y + Math.sin(e * 0.07) * 0.06,
        C.pos.z + Math.cos(e * 0.09) * 0.1,
      );
      camera.lookAt(C.look.x, C.look.y, C.look.z);
    }
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
      {built && <primitive object={built.planet} />}
      <primitive object={holder} />
    </>
  );
}
