/**
 * MIMESIS Sight Path — Toon Shading Experiment (Build EXP-01)
 *
 * 목적: 워커 1명 + 소품 몇 개에만 셀 셰이딩을 시험 적용해 룩을 확인한다.
 * 철학: "일본 애니"가 아니라 "삽만리 그림책" — 부드러운 계조, 잉크 선 같은 아웃라인.
 *
 * 사용법 (예: 씬 셋업 직후):
 *   import { applyToonShading, addInkOutline, removeToonExperiment } from './toonShadingExperiment';
 *
 *   applyToonShading(walkerModel, { steps: 4, softness: 0.35 });
 *   addInkOutline(walkerModel, { thickness: 0.012, color: 0x2b2118, irregularity: 0.4 });
 *
 *   // 되돌리기 (원본 머티리얼 복원 + 아웃라인 셸 제거):
 *   removeToonExperiment(walkerModel);
 *
 * 주의:
 * - MeshToonMaterial은 PointLight/DirectionalLight에 반응하지만 emissive는 광원이 아님(기존 랜턴 교훈 동일).
 * - GLSL 높이 안개(fog)와 함께 쓰면 안개 색을 팔레트에 맞춰 재튜닝 필요.
 * - SkinnedMesh(워커)도 지원: 아웃라인 셸이 skeleton을 공유하도록 처리함.
 */

import * as THREE from 'three';

// ---------------------------------------------------------------------------
// 1. 계조(gradient map) 생성 — 부드러운 그림책 계조
// ---------------------------------------------------------------------------

/**
 * steps: 계조 단수 (3 = 애니 느낌 강함, 4~5 = 부드러운 그림책 느낌)
 * softness: 0 = 완전 플랫(하드 컷), 1 = 거의 선형(스탠다드에 가까움). 권장 0.3~0.4
 */
export function createToonGradientMap(steps = 3, softness = 0.15): THREE.DataTexture {
  const width = 64;
  const data = new Uint8Array(width * 4);

  for (let i = 0; i < width; i++) {
    const t = i / (width - 1);
    // 단계화된 밝기
    const stepped = Math.floor(t * steps) / (steps - 1);
    const clamped = Math.min(1, Math.max(0, stepped));
    // softness만큼 원래 선형 값과 블렌드 → 컷 경계가 살짝 풀림
    const v = THREE.MathUtils.lerp(clamped, t, softness);
    // 그림자 바닥을 살짝 들어올려 잉크 번짐 같은 따뜻한 어둠 유지
    const lifted = 0.18 + v * 0.82;
    const byte = Math.round(lifted * 255);
    data[i * 4 + 0] = byte;
    data[i * 4 + 1] = byte;
    data[i * 4 + 2] = byte;
    data[i * 4 + 3] = 255;
  }

  const tex = new THREE.DataTexture(data, width, 1, THREE.RGBAFormat);
  tex.minFilter = THREE.NearestFilter; // 계조 컷을 명확하게 (Linear는 hemisphere 조명과 만나면 거의 뭉개진다 — BUILD 183 교훈)
  tex.magFilter = THREE.NearestFilter;
  tex.needsUpdate = true;
  return tex;
}

// ---------------------------------------------------------------------------
// 2. 툰 머티리얼 교체 — 원본 보존하며 스왑
// ---------------------------------------------------------------------------

interface ToonOptions {
  steps?: number;
  softness?: number;
  /** 채도 보정 (1 = 원본, 1.1~1.2 권장: 툰은 채도가 조금 높아야 삶) */
  saturationBoost?: number;
}

const ORIGINAL_MATERIALS = new WeakMap<THREE.Mesh, THREE.Material | THREE.Material[]>();
const OUTLINE_SHELLS = new WeakMap<THREE.Object3D, THREE.Object3D[]>();

export function applyToonShading(root: THREE.Object3D, options: ToonOptions = {}): void {
  const { steps = 3, softness = 0.15, saturationBoost = 1.12 } = options;
  const gradientMap = createToonGradientMap(steps, softness);

  let converted = 0;
  root.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    if (child.userData.__isOutlineShell) return;
    converted++;

    // 원본 백업 (이미 백업돼 있으면 유지)
    if (!ORIGINAL_MATERIALS.has(child)) {
      ORIGINAL_MATERIALS.set(child, child.material);
    }

    const convert = (mat: THREE.Material): THREE.Material => {
      const src = mat as THREE.MeshStandardMaterial;
      const color = (src.color ?? new THREE.Color(0xffffff)).clone();

      // 채도 부스트
      const hsl = { h: 0, s: 0, l: 0 };
      color.getHSL(hsl);
      color.setHSL(hsl.h, Math.min(1, hsl.s * saturationBoost), hsl.l);

      const toon = new THREE.MeshToonMaterial({
        color,
        map: src.map ?? null,
        gradientMap,
        transparent: src.transparent ?? false,
        opacity: src.opacity ?? 1,
        side: src.side ?? THREE.FrontSide,
        alphaTest: src.alphaTest ?? 0,
      });
      toon.name = `${mat.name || 'mat'}__toon`;
      return toon;
    };

    child.material = Array.isArray(child.material)
      ? child.material.map(convert)
      : convert(child.material);
  });
  console.info('[toon] materials converted:', converted);
}

// ---------------------------------------------------------------------------
// 3. 잉크 아웃라인 — inverted hull + 굵기 불균일(만년필 선 느낌)
// ---------------------------------------------------------------------------

interface OutlineOptions {
  /** 화면 비례 두께 (NDC). 0.006 ≈ 세로 800px에서 약 2.4px 선. 거리·모델 스케일과 무관 */
  thickness?: number;
  /** 순검정(0x000000) 대신 잉크 브라운 권장 */
  color?: number;
  /** 0 = 균일한 선, 1 = 매우 불균일. 만년필 느낌은 0.3~0.5 */
  irregularity?: number;
}

export function addInkOutline(root: THREE.Object3D, options: OutlineOptions = {}): void {
  const { thickness = 0.006, color = 0x2b2118, irregularity = 0.4 } = options;
  const shells: THREE.Object3D[] = OUTLINE_SHELLS.get(root) ?? [];

  root.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    if (child.userData.__isOutlineShell) return;

    const outlineMat = new THREE.MeshBasicMaterial({
      color,
      side: THREE.BackSide, // 뒤집힌 셸 → 실루엣만 보임
    });
    // BUILD 184의 진범: enforceFog(applyHeightFog)는 onBeforeCompile을 '대입'으로 덮어쓴다.
    // hfog 멱등 플래그를 미리 세워 이 재질을 건드리지 못하게 잠근다 — 두께 셰이더 사수.
    outlineMat.userData.hfog = true;

    // 클립 공간에서 화면 비례 두께로 민다 — 모델/뼈 스케일 무관 (BUILD 185 괴물 사건의 해법).
    // 만년필처럼 거리와 상관없이 선 굵기가 일정하다. vn.xy를 정규화하지 않아
    // 카메라를 정면으로 보는 면(실루엣 내부)은 자연히 밀리지 않는다.
    outlineMat.onBeforeCompile = (shader) => {
      shader.uniforms.uNdc = { value: thickness };
      shader.uniforms.uIrregularity = { value: irregularity };

      shader.vertexShader = shader.vertexShader
        .replace(
          '#include <common>',
          `#include <common>
           uniform float uNdc;
           uniform float uIrregularity;
           float inkNoise(vec3 p) {
             return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453);
           }`
        )
        .replace(
          '#include <project_vertex>',
          `#include <project_vertex>
           vec3 vn = normalMatrix * normalize(normal);
           float n = inkNoise(floor(normalize(position) * 40.0)) - 0.5;
           gl_Position.xy += vn.xy * uNdc * (1.0 + n * uIrregularity) * gl_Position.w;`
        );
    };

    let shell: THREE.Mesh;
    if (child instanceof THREE.SkinnedMesh) {
      const s = new THREE.SkinnedMesh(child.geometry, outlineMat);
      s.bind(child.skeleton, child.bindMatrix);
      shell = s;
    } else {
      shell = new THREE.Mesh(child.geometry, outlineMat);
    }

    shell.userData.__isOutlineShell = true;
    shell.renderOrder = (child.renderOrder ?? 0) - 1;
    shell.frustumCulled = child.frustumCulled;
    child.add(shell); // 부모-자식으로 붙여 트랜스폼/애니메이션 자동 추종
    shells.push(shell);
  });

  OUTLINE_SHELLS.set(root, shells);
  console.info('[toon] outline shells added:', shells.length);
}

// ---------------------------------------------------------------------------
// 4. 실험 되돌리기
// ---------------------------------------------------------------------------

export function removeToonExperiment(root: THREE.Object3D): void {
  // 아웃라인 셸 제거
  const shells = OUTLINE_SHELLS.get(root);
  if (shells) {
    for (const shell of shells) {
      shell.parent?.remove(shell);
      if (shell instanceof THREE.Mesh) {
        (Array.isArray(shell.material) ? shell.material : [shell.material]).forEach((m) =>
          m.dispose()
        );
      }
    }
    OUTLINE_SHELLS.delete(root);
  }

  // 원본 머티리얼 복원
  root.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    const original = ORIGINAL_MATERIALS.get(child);
    if (original) {
      const current = child.material;
      (Array.isArray(current) ? current : [current]).forEach((m) => m.dispose());
      child.material = original;
      ORIGINAL_MATERIALS.delete(child);
    }
  });
}
