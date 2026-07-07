import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { loadWalkerAsset, applyHeightFog, PALETTE, defaultLoader } from '../engine/worldCore';
import { createClipRig, createWalkerRig, type WalkerRig } from './walkerRig';
import { footsteps } from './footsteps';
import { ambience } from '../audio/ambience';

// ---------- BUILD 204: 작은 행성 v6 — 고민하는 교차로, 더 큰 별, 손님 행성 ----------
// · R 8→12: 전체가 한눈에 예상되지 않는 크기 (다음 행성은 아예 작게도 — Vase)
// · luna 굴곡 부스트 2.2→1.25: 오르내림이 튀지 않게
// · 교차로: 자기 길이 스스로와 만나는 곳에서 잠깐 멈춰 고민하다, 한쪽을 골라 걷는다
// · 임시 버튼(App): 🪐 행성 순환 / 🚶 캐릭터 교체 — 에디터의 맛보기
// · meshkeep: 자기 재질을 그대로 입는 손님 행성 (Planet3)

const R = 12;
const WALK = 0.58;
const DUNE = 0.14;

const PLANET_CENTER = new THREE.Vector3(0, -R, 0);
const RFOG = { top: R + 0.04, bottom: R - 0.30, strength: 0.8 };
function applyRadialFog(mat: THREE.MeshStandardMaterial, strength = RFOG.strength) {
  if (mat.userData.rfog) return mat;
  mat.userData.rfog = true;
  const hex = parseInt(PALETTE.fog.slice(1), 16);
  const c = { r: ((hex >> 16) & 255) / 255, g: ((hex >> 8) & 255) / 255, b: (hex & 255) / 255 };
  const glsl = (n: number) => n.toFixed(4);
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uPlanetC = { value: PLANET_CENTER };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vRFw;')
      .replace('#include <fog_vertex>', '#include <fog_vertex>\nvRFw = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vRFw;\nuniform vec3 uPlanetC;')
      .replace(
        '#include <fog_fragment>',
        `#include <fog_fragment>\nfloat rfd = distance(vRFw, uPlanetC);\ngl_FragColor.rgb = mix(gl_FragColor.rgb, vec3(${glsl(c.r)}, ${glsl(c.g)}, ${glsl(c.b)}), (1.0 - smoothstep(${glsl(RFOG.bottom)}, ${glsl(RFOG.top)}, rfd)) * ${glsl(strength)});`,
      );
  };
  mat.customProgramCacheKey = () => `rfog|${RFOG.top.toFixed(3)}|${RFOG.bottom.toFixed(3)}|${strength.toFixed(3)}|${PALETTE.fog}`;
  return mat;
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

const THEMES = {
  // BUILD 205: 지구 — 색(Earth.jpg)·높이(Bump.jpg)·구름(Clouds.png), 실사 소스의 maps 테마
  earth: { kind: 'maps' as const, color: 'assets/planet/earth_color.jpg', height: 'assets/planet/earth_height.png', amp: 0.12, clouds: 'assets/planet/earth_clouds.png' },
  luna: { kind: 'meshworld' as const, file: 'LunaMesh.glb', color: 'assets/planet/moon_color.jpg', boost: 1.25 },
  moon: { kind: 'maps' as const, color: 'assets/planet/moon_color.jpg', height: 'assets/planet/moon_height.png', amp: 0.3 },
  desert: { kind: 'procedural' as const },
  // rocky(Planet3)는 이상 입주로 하차 — Vase 재가. 에셋은 창고에 보존.
};
const THEME_ORDER = ['earth', 'luna', 'moon', 'desert'] as const;

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
    return (v - 0.5) * 2;
  };
}

// 정점 무리 → 등장방형 반경 그리드 (빈 칸은 이웃 평균으로)
function gridFromRadii(entries: { dir: THREE.Vector3; off: number }[]) {
  const GW = 128;
  const GH = 64;
  const acc = new Float64Array(GW * GH);
  const cnt = new Uint32Array(GW * GH);
  for (const e of entries) {
    const th = Math.acos(THREE.MathUtils.clamp(e.dir.y, -1, 1));
    let u = Math.atan2(e.dir.z, -e.dir.x) / (Math.PI * 2);
    if (u < 0) u += 1;
    const gi = Math.min(GH - 1, Math.floor((th / Math.PI) * GH)) * GW + Math.min(GW - 1, Math.floor(u * GW));
    acc[gi] += e.off;
    cnt[gi] += 1;
  }
  const grid = new Float32Array(GW * GH);
  for (let i = 0; i < grid.length; i += 1) grid[i] = cnt[i] ? acc[i] / cnt[i] : NaN;
  for (let pass = 0; pass < 5; pass += 1) {
    for (let y = 0; y < GH; y += 1) for (let x = 0; x < GW; x += 1) {
      const i = y * GW + x;
      if (!Number.isNaN(grid[i])) continue;
      let s2 = 0; let n2 = 0;
      for (const [ddx, ddy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const j = Math.min(GH - 1, Math.max(0, y + ddy)) * GW + ((x + ddx + GW) % GW);
        if (!Number.isNaN(grid[j])) { s2 += grid[j]; n2 += 1; }
      }
      if (n2) grid[i] = s2 / n2;
    }
  }
  return (d: THREE.Vector3) => {
    const th = Math.acos(THREE.MathUtils.clamp(d.y, -1, 1));
    let u = Math.atan2(d.z, -d.x) / (Math.PI * 2);
    if (u < 0) u += 1;
    const gx = Math.min(GW - 1, Math.floor(u * GW));
    const gy = Math.min(GH - 1, Math.floor((th / Math.PI) * GH));
    const v = grid[gy * GW + gx];
    return Number.isNaN(v) ? 0 : v;
  };
}

function bakeTrailOntoMap(map: THREE.Texture, curve: THREE.CatmullRomCurve3): THREE.Texture {
  const img = map.image as HTMLImageElement | { data: Uint8ClampedArray; width: number; height: number };
  const W2 = img.width;
  const H2 = img.height;
  const cnv = document.createElement('canvas');
  cnv.width = W2;
  cnv.height = H2;
  const ctx = cnv.getContext('2d')!;
  if (img instanceof HTMLImageElement) {
    ctx.drawImage(img, 0, 0);
  } else {
    const id = ctx.createImageData(W2, H2);
    id.data.set(img.data);
    ctx.putImageData(id, 0, 0);
  }
  const steps = 2600;
  const p = new THREE.Vector3();
  const baseR = ((0.17 / R) / (Math.PI * 2)) * W2;
  const passes = [
    { rr: 1.8, a: 0.028 },
    { rr: 1.0, a: 0.048 },
    { rr: 0.45, a: 0.055 },
  ];
  for (let i = 0; i < steps; i += 1) {
    curve.getPointAt(i / steps, p);
    p.normalize();
    const th = Math.acos(THREE.MathUtils.clamp(p.y, -1, 1));
    let u = Math.atan2(p.z, -p.x) / (Math.PI * 2);
    if (u < 0) u += 1;
    const x = u * W2;
    const y = (th / Math.PI) * H2;
    const stretch = 1 / Math.max(0.25, Math.sin(th));
    for (const ps of passes) {
      ctx.fillStyle = `rgba(76, 72, 66, ${ps.a})`;
      const draw = (cx: number) => {
        ctx.beginPath();
        ctx.ellipse(cx, y, baseR * ps.rr * stretch, baseR * ps.rr, 0, 0, Math.PI * 2);
        ctx.fill();
      };
      draw(x);
      const margin = baseR * 2.2 * stretch;
      if (x < margin) draw(x + W2);
      if (x > W2 - margin) draw(x - W2);
    }
  }
  const tex = new THREE.CanvasTexture(cnv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.anisotropy = 4;
  tex.flipY = true;
  return tex;
}

export function PlanetWorld({ themeIdx = 0, walkerIdx = -1 }: { themeIdx?: number; walkerIdx?: number }) {
  const { scene, camera, gl } = useThree();
  if (!scene.fog) scene.fog = new THREE.Fog(PALETTE.fog, 9, 40);

  const baseTheme = useMemo(() => {
    const q = new URLSearchParams(window.location.search).get('theme');
    const i = THEME_ORDER.indexOf((q ?? '') as (typeof THEME_ORDER)[number]);
    return i >= 0 ? i : 0;
  }, []);
  const active = THEME_ORDER[(baseTheme + themeIdx) % THEME_ORDER.length];

  type Built = { planet: THREE.Group; curve: THREE.CatmullRomCurve3; arcLen: number; crossings: { a: number; b: number }[] };
  const [built, setBuilt] = useState<Built | null>(null);
  useEffect(() => {
    let alive = true;
    void (async () => {
      const theme = THEMES[active];
      let heightAt: (d: THREE.Vector3) => number = (d) => hills(d) * DUNE;
      let map: THREE.Texture | null = null;
      let ready: THREE.Object3D | null = null; // meshworld/meshkeep가 준비한 지형
      let cloudsTex: THREE.Texture | null = null; // BUILD 205: 지구의 구름 껍질

      if (theme.kind === 'meshworld') {
        const [gltf, colorTex] = await Promise.all([
          defaultLoader(theme.file),
          new THREE.TextureLoader().loadAsync(theme.color),
        ]);
        colorTex.colorSpace = THREE.SRGBColorSpace;
        colorTex.wrapS = THREE.RepeatWrapping;
        colorTex.anisotropy = 4;
        map = colorTex;
        let src: THREE.Mesh | null = null;
        gltf.scene.updateMatrixWorld(true);
        gltf.scene.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh && !src) src = m; });
        const srcMesh = src as unknown as THREE.Mesh;
        const geo2 = (srcMesh.geometry as THREE.BufferGeometry).clone();
        geo2.applyMatrix4(srcMesh.matrixWorld);
        const pa = geo2.getAttribute('position');
        const ctr = new THREE.Vector3();
        for (let i = 0; i < pa.count; i += 1) ctr.add(new THREE.Vector3(pa.getX(i), pa.getY(i), pa.getZ(i)));
        ctr.divideScalar(pa.count);
        let meanR = 0;
        for (let i = 0; i < pa.count; i += 1) meanR += Math.hypot(pa.getX(i) - ctr.x, pa.getY(i) - ctr.y, pa.getZ(i) - ctr.z);
        meanR /= pa.count;
        const dv = new THREE.Vector3();
        const radii: { dir: THREE.Vector3; off: number }[] = [];
        for (let i = 0; i < pa.count; i += 1) {
          dv.set(pa.getX(i) - ctr.x, pa.getY(i) - ctr.y, pa.getZ(i) - ctr.z);
          const r = dv.length();
          const rb = 1 + (r / meanR - 1) * theme.boost;
          dv.divideScalar(r);
          pa.setXYZ(i, dv.x * rb * R, dv.y * rb * R, dv.z * rb * R);
          radii.push({ dir: dv.clone(), off: rb * R - R });
        }
        heightAt = gridFromRadii(radii);
        geo2.computeVertexNormals();
        geo2.computeBoundingSphere();
        geo2.computeBoundingBox();
        const mesh = new THREE.Mesh(geo2, applyRadialFog(new THREE.MeshStandardMaterial({ map, roughness: 1, metalness: 0 })));
        mesh.frustumCulled = false;
        mesh.receiveShadow = true;
        ready = mesh;
      } else if (theme.kind === 'maps') {
        const loader = new THREE.TextureLoader();
        map = await loader.loadAsync(theme.color);
        map.colorSpace = THREE.SRGBColorSpace;
        map.wrapS = THREE.RepeatWrapping;
        map.anisotropy = 4;
        const sample = await loadHeightSampler(theme.height);
        heightAt = (d) => sample(d) * theme.amp;
        if ('clouds' in theme && theme.clouds) {
          cloudsTex = await loader.loadAsync(theme.clouds);
          cloudsTex.colorSpace = THREE.SRGBColorSpace;
          cloudsTex.wrapS = THREE.RepeatWrapping;
        }
      } else {
        map = makeDesertTexture();
      }
      if (!alive) return;

      const planet = new THREE.Group();

      // ---------- 보이지 않는 길: 지형의 높낮이를 그대로 따른다 ----------
      const N = 560;
      const pts: THREE.Vector3[] = [];
      for (let i = 0; i < N; i += 1) {
        const u = i / N;
        const phi = Math.PI * 2 * 4 * u;
        const theta = Math.PI / 2 + 0.62 * Math.sin(Math.PI * 2 * 3 * u + 0.7) + 0.21 * Math.sin(Math.PI * 2 * 7 * u + 2.1);
        const d = new THREE.Vector3(Math.sin(theta) * Math.cos(phi), Math.cos(theta), Math.sin(theta) * Math.sin(phi));
        pts.push(d.multiplyScalar(R + heightAt(d) + 0.005));
      }
      const curve = new THREE.CatmullRomCurve3(pts, true, 'centripetal');
      curve.arcLengthDivisions = 1800;
      const arcLen = curve.getLength();

      // ---------- 교차로 사전: 3D로 가깝고 길로는 먼 두 지점 (호길이 좌표 쌍) ----------
      const crossings: { a: number; b: number }[] = [];
      {
        const M2 = 700;
        const cps = Array.from({ length: M2 }, (_, i) => curve.getPointAt(i / M2));
        for (let i = 0; i < M2; i += 1) {
          for (let j = i + 30; j < M2; j += 1) {
            const gap = Math.min(j - i, M2 - (j - i));
            if (gap < 30) continue;
            if (cps[i].distanceToSquared(cps[j]) < 0.16) {
              const a = (i / M2) * arcLen;
              const b = (j / M2) * arcLen;
              if (!crossings.some((c2) => Math.abs(c2.a - a) < 1.5 || Math.abs(c2.b - b) < 1.5)) crossings.push({ a, b });
            }
          }
        }
      }

      if (map) {
        map = bakeTrailOntoMap(map, curve);
      }
      if (ready) {
        if (theme.kind === 'meshworld' && map) {
          const mm = (ready as THREE.Mesh).material as THREE.MeshStandardMaterial;
          mm.map = map;
          mm.needsUpdate = true;
        }
        planet.add(ready);
      } else {
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
          applyRadialFog(new THREE.MeshStandardMaterial({ map: map!, roughness: 1, metalness: 0 })),
        );
        ground.receiveShadow = true;
        planet.add(ground);
        if (cloudsTex) { // BUILD 205: 천천히 흐르는 구름 껍질 — 지구가 지구다워진다
          const shell = new THREE.Mesh(
            new THREE.SphereGeometry(R * 1.018, 64, 48),
            new THREE.MeshStandardMaterial({ map: cloudsTex, transparent: true, opacity: 0.9, depthWrite: false, roughness: 1 }),
          );
          shell.name = 'cloudShell';
          planet.add(shell);
        }
      }

      setBuilt({ planet, curve, arcLen, crossings });
    })();
    return () => { alive = false; };
  }, [active]);

  // ---------- 걷는 사람 (walkerIdx 바뀌면 교체) ----------
  const holder = useMemo(() => {
    const h = new THREE.Group();
    h.position.y = 0.012;
    h.rotation.y = Math.PI / 2;
    return h;
  }, []);
  const rigRef = useRef<WalkerRig | null>(null);
  useEffect(() => {
    let alive = true;
    rigRef.current = null;
    holder.clear();
    void loadWalkerAsset(undefined, walkerIdx < 0 ? 'random' : walkerIdx).then(({ group, animations, clipSpeeds }) => {
      if (!alive) return;
      group.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.isMesh && (m.material as THREE.MeshStandardMaterial)?.isMeshStandardMaterial) {
          applyRadialFog(m.material as THREE.MeshStandardMaterial, 0.7);
        }
      });
      holder.add(group);
      rigRef.current = (clipSpeeds ? createClipRig(group, animations, clipSpeeds, footsteps.step) : null)
        ?? createWalkerRig(group, animations, 0.72);
    }).catch(() => { /* 조용한 행성 */ });
    return () => { alive = false; };
  }, [holder, walkerIdx]);

  useEffect(() => {
    ambience.apply({ kind: 'clear', wind: 0.28, rainAmount: 0, time: 'day', sea: 0, life: 0.5 });
  }, []);

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
    manualUntil: 0,
    sph: new THREE.Spherical(), dragging: false, lastX: 0, lastY: 0,
  });
  useEffect(() => {
    const el = gl.domElement;
    const C = cam.current;
    const grab = () => {
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
      C.sph.radius = THREE.MathUtils.clamp(C.sph.radius * (1 + Math.sign(e.deltaY) * 0.08), 2.4, 12);
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

  // ---------- BUILD 205: 하늘의 식구들 — 실비율 달(0.273R), 태양, 달 반사광 ----------
  // 달/지구 반지름비 0.2727은 실측 천문값. 달은 행성 중심을 34u 반경·15° 기울기로 돌고,
  // 조석 고정(늘 같은 면), 태양(디렉셔널)을 받아 궤도 위치 따라 '위상'이 실제로 변한다.
  // 천체는 안개를 모른다(fog:false — 별의 헌법). 달 반사광은 은은한 PointLight로 동행.
  const celestial = useMemo(() => {
    const group = new THREE.Group();
    const moonMat = new THREE.MeshStandardMaterial({ color: '#c9c5bd', roughness: 1, metalness: 0 });
    moonMat.fog = false;
    new THREE.TextureLoader().load('assets/planet/moon_color.jpg', (t) => {
      t.colorSpace = THREE.SRGBColorSpace;
      moonMat.map = t;
      moonMat.color.set('#ffffff');
      moonMat.needsUpdate = true;
    });
    const moon = new THREE.Mesh(new THREE.SphereGeometry(R * 0.273, 48, 32), moonMat);
    const moonLight = new THREE.PointLight('#cfd8e0', 2.2, 0, 0.6); // 달빛의 되비침
    moon.add(moonLight);
    group.add(moon);
    const sunMat = new THREE.MeshBasicMaterial({ color: '#ffedc8' });
    sunMat.fog = false;
    const sun = new THREE.Mesh(new THREE.SphereGeometry(2.6, 24, 16), sunMat);
    sun.position.set(6, 11, 5).normalize().multiplyScalar(78); // 디렉셔널 광원과 같은 방향 — 빛의 근원이 보인다
    group.add(sun);
    return { group, moon, ang: Math.random() * Math.PI * 2 };
  }, []);
  const S = useRef(0);
  const firstFrame = useRef(true);
  // BUILD 204: 교차로의 고민 — 닿으면 잠깐 서서(idle) 생각하다, 한쪽을 골라 걷는다
  const ponder = useRef({ phase: 'walk' as 'walk' | 'ponder', timer: 0, jumpTo: -1, cooldown: 0 });
  const tmp = useMemo(() => ({
    p: new THREE.Vector3(), T: new THREE.Vector3(), U: new THREE.Vector3(),
    F: new THREE.Vector3(), Z: new THREE.Vector3(), M: new THREE.Matrix4(), Q: new THREE.Quaternion(),
    v: new THREE.Vector3(),
  }), []);
  useFrame((state, rawDt) => {
    if (!built) return;
    const dt = Math.min(0.05, rawDt); // 헌법 3조
    const P = ponder.current;
    P.cooldown = Math.max(0, P.cooldown - dt);
    let moving = true;
    if (P.phase === 'ponder') {
      moving = false;
      P.timer -= dt;
      if (P.timer <= 0) {
        if (P.jumpTo >= 0) S.current = P.jumpTo;
        P.phase = 'walk';
        P.jumpTo = -1;
        P.cooldown = 8;
      }
    } else {
      S.current += WALK * dt;
      if (P.cooldown <= 0) {
        const sm = ((S.current % built.arcLen) + built.arcLen) % built.arcLen;
        for (const c2 of built.crossings) {
          const nearA = Math.abs(sm - c2.a) < 0.1;
          const nearB = Math.abs(sm - c2.b) < 0.1;
          if (!nearA && !nearB) continue;
          P.phase = 'ponder';
          P.timer = 1.1 + Math.random() * 1.1; // 고민하는 척
          P.jumpTo = Math.random() < 0.5 ? -1 : (nearA ? c2.b + (sm - c2.a) : c2.a + (sm - c2.b)); // 반반: 가던 길 or 저 길
          break;
        }
      }
    }
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
      const k = Math.min(1, dt * 6);
      built.planet.quaternion.slerp(Q, k);
      built.planet.position.y += (-p.length() - built.planet.position.y) * k;
    }
    rigRef.current?.update(dt, 0.5, moving, state.clock.elapsedTime, moving ? WALK * dt : 0);
    PLANET_CENTER.copy(built.planet.position);
    // 달의 공전 — 지평선 너머로 뜨고 진다
    celestial.ang += dt * ((Math.PI * 2) / 150);
    const inc = 0.26; // 15° 기울기
    celestial.moon.position.set(
      Math.cos(celestial.ang) * 34,
      PLANET_CENTER.y + Math.sin(celestial.ang) * Math.sin(inc) * 34,
      Math.sin(celestial.ang) * Math.cos(inc) * 34,
    );
    celestial.moon.lookAt(0, PLANET_CENTER.y, 0); // 조석 고정 — 늘 같은 얼굴
    built.planet.getObjectByName('cloudShell')?.rotateY(dt * 0.004); // 구름은 저 혼자 흐른다

    const C = cam.current;
    const manual = performance.now() < C.manualUntil;
    const e = state.clock.elapsedTime;
    if (manual) {
      v.setFromSpherical(C.sph).add(C.look);
      camera.position.lerp(v, Math.min(1, dt * 10));
      camera.lookAt(C.look.x, C.look.y, C.look.z);
      C.pos.copy(camera.position);
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
      <fog attach="fog" args={[PALETTE.fog, 9, 40]} />
      <hemisphereLight args={['#b9d2d8', '#c8a97e', 0.55]} />
      <directionalLight
        color="#ffe7c2"
        intensity={1.35}
        position={[6, 11, 5]}
        castShadow
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
        shadow-camera-left={-14}
        shadow-camera-right={14}
        shadow-camera-top={14}
        shadow-camera-bottom={-14}
      />
      <directionalLight color="#9fc4c9" intensity={0.22} position={[-5, 3, -4]} />
      <primitive object={built ? built.planet : new THREE.Group()} />
      <primitive object={celestial.group} />
      <primitive object={holder} />
    </>
  );
}
