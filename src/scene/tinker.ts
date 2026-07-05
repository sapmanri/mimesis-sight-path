// ---------- BUILD 086: TINKER ----------
// 금빛 안내자. 레퍼런스의 팅커벨.
//
// 역할: 다음 기억 포인트로 먼저 날아가 그 앞에서 맴돈다.
// 사람은 그 빛을 보고 터벅터벅 걸어간다. 카메라는 사람을 따라간다.
// — 빛이 앞서고, 사람이 걷고, 시선이 뒤따른다.
//
// 구현: 코어 스프라이트(가산 블렌딩 방사형 글로우) + 잔광 꼬리(Points 링버퍼).
// 텍스처는 CanvasTexture 대신 DataTexture로 절차 생성 (헤드리스 렌더 호환).

import * as THREE from 'three';

const TRAIL_N = 56;

function makeGlowTexture(size = 64): THREE.DataTexture {
  const data = new Uint8Array(size * size * 4);
  const c = (size - 1) / 2;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const r = Math.hypot(x - c, y - c) / c;
      const v = Math.max(0, 1 - r);
      const a = Math.pow(v, 2.2);
      const i = (y * size + x) * 4;
      data[i] = 255;
      data[i + 1] = 235;
      data[i + 2] = 190;
      data[i + 3] = Math.round(a * 255);
    }
  }
  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  tex.needsUpdate = true;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export type Tinker = {
  group: THREE.Group;
  /** 목표 지점으로 날아간다 (도착하면 그 자리에서 맴돎) */
  flyTo: (target: THREE.Vector3, duration: number) => void;
  /** 'fly' | 'hover' */
  state: () => 'fly' | 'hover';
  update: (dt: number, elapsed: number) => void;
  position: () => THREE.Vector3;
  /** 꼬리는 월드 좌표 — scene에 직접 add */
  trail: THREE.Points;
};

export function createTinker(start: THREE.Vector3): Tinker {
  const group = new THREE.Group();
  const glow = makeGlowTexture();

  // 코어: 겹 글로우 (작고 밝은 심 + 넓고 옅은 무리)
  const core = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glow, color: '#fff3d6', transparent: true, opacity: 0.95,
    blending: THREE.AdditiveBlending, depthWrite: false,
  }));
  core.scale.setScalar(0.16);
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glow, color: '#ffd98a', transparent: true, opacity: 0.4,
    blending: THREE.AdditiveBlending, depthWrite: false,
  }));
  halo.scale.setScalar(0.44);
  group.add(halo, core);

  // 꼬리: 최근 위치들을 금빛 점으로 (버텍스 컬러 감쇠 = 가산 블렌딩에서 페이드)
  const positions = new Float32Array(TRAIL_N * 3);
  const colors = new Float32Array(TRAIL_N * 3);
  const trailGeo = new THREE.BufferGeometry();
  trailGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  trailGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const trail = new THREE.Points(trailGeo, new THREE.PointsMaterial({
    map: glow, size: 0.085, vertexColors: true, transparent: true,
    blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true,
  }));
  trail.frustumCulled = false;

  const history: THREE.Vector3[] = [];
  const pos = start.clone();
  const anchor = start.clone();

  let mode: 'fly' | 'hover' = 'hover';
  let from = start.clone();
  let to = start.clone();
  let flyT = 0;
  let flyDur = 1;
  let trailClock = 0;

  const flutter = (e: number, k: number) => new THREE.Vector3(
    Math.sin(e * 2.3 + 1.7) * 0.16 * k,
    Math.sin(e * 3.4) * 0.1 * k + Math.sin(e * 7.1) * 0.03,
    Math.cos(e * 1.9 + 0.6) * 0.16 * k,
  );

  return {
    group,
    position: () => pos.clone(),
    state: () => mode,
    flyTo(target, duration) {
      from = pos.clone();
      to = target.clone();
      flyDur = Math.max(0.4, duration);
      flyT = 0;
      mode = 'fly';
    },
    update(dt, elapsed) {
      if (mode === 'fly') {
        flyT = Math.min(1, flyT + dt / flyDur);
        const e = flyT < 0.5 ? 2 * flyT * flyT : 1 - Math.pow(-2 * flyT + 2, 2) / 2; // easeInOut
        // 위로 부푼 곡선 + 옆으로 살랑이는 궤적 — 직선으로 날지 않는다
        const lift = Math.sin(e * Math.PI) * (0.7 + from.distanceTo(to) * 0.06);
        pos.lerpVectors(from, to, e);
        pos.y += lift;
        pos.add(flutter(elapsed, 0.55));
        if (flyT >= 1) { mode = 'hover'; anchor.copy(to); }
      } else {
        pos.copy(anchor).add(flutter(elapsed, 1));
      }
      group.position.copy(pos);

      // 심장 박동처럼 맥동
      const pulse = 1 + Math.sin(elapsed * 6.2) * 0.12;
      core.scale.setScalar(0.16 * pulse);
      halo.scale.setScalar(0.44 * (1 + Math.sin(elapsed * 3.1) * 0.1));

      // 꼬리 갱신 (~50Hz 기록)
      trailClock += dt;
      if (trailClock > 0.018) {
        trailClock = 0;
        history.unshift(pos.clone().add(new THREE.Vector3(
          (Math.random() - 0.5) * 0.03, (Math.random() - 0.5) * 0.03, (Math.random() - 0.5) * 0.03,
        )));
        if (history.length > TRAIL_N) history.pop();
        for (let i = 0; i < TRAIL_N; i += 1) {
          const h = history[Math.min(i, history.length - 1)] ?? pos;
          positions[i * 3] = h.x; positions[i * 3 + 1] = h.y; positions[i * 3 + 2] = h.z;
          const f = Math.pow(1 - i / TRAIL_N, 1.8) * (mode === 'fly' ? 1 : 0.45);
          colors[i * 3] = f; colors[i * 3 + 1] = f * 0.82; colors[i * 3 + 2] = f * 0.45;
        }
        trailGeo.attributes.position.needsUpdate = true;
        trailGeo.attributes.color.needsUpdate = true;
      }
    },
    trail,
  };
}
