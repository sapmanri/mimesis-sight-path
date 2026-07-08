// BUILD 236: 행성의 갈매기 — 파도가 부른다 (본토 BUILD 149의 구면 이식).
// 좌표 철학: 무리(flock) 그룹 하나를 해안 접점에 세우고(+Y=지표 법선), 그 안에서는
// 본토의 평지 수식을 원문 그대로 쓴다 — 새 수학을 짓지 않는다 (헌법: 본토가 이미 답을 갖고 있다).
// 해안 탐지: 반경 표본으로 바다/뭍 문턱을 재고, 이웃에 바다와 뭍이 함께 있는 방향만 해안이다.
import * as THREE from 'three';

type Gull = { m: THREE.Object3D; R: number; th: number; om: number; alt: number; bobA: number; bobF: number; ph: number; roll: number };
type Flock = { group: THREE.Group; anchor: THREE.Vector3; gulls: Gull[]; phase: 'in' | 'live' | 'out'; t: number; life: number };

const tv1 = new THREE.Vector3();
const tv2 = new THREE.Vector3();
const tq = new THREE.Quaternion();
const YUP = new THREE.Vector3(0, 1, 0);

export function createPlanetGulls(
  planet: THREE.Group,
  R: number,
  surfaceR: (d: THREE.Vector3) => number,
  proto: THREE.Group,
  onCry: () => void,
) {
  // 바다/뭍 문턱 — 반경 300표본의 낮은 쪽 어깨
  let lo = Infinity, hi = -Infinity;
  for (let i = 0; i < 300; i += 1) {
    tv1.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize();
    const r = surfaceR(tv1);
    lo = Math.min(lo, r); hi = Math.max(hi, r);
  }
  const span = Math.max(1e-4, hi - lo);
  const seaThr = lo + span * 0.18;
  const landThr = lo + span * 0.32;
  const hasCoast = span > 0.06; // 평평한 세계(사막·민달)엔 해안이 없다

  let flock: Flock | null = null;
  let nextTry = 8 + Math.random() * 14;
  let cryIn = 20 + Math.random() * 25;

  const findCoast = (uLocal: THREE.Vector3): THREE.Vector3 | null => {
    for (let k = 0; k < 22; k += 1) {
      // 걷는 아이 앞하늘 고리 20°~60°
      tv2.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).cross(uLocal);
      if (tv2.lengthSq() < 1e-8) continue;
      tv2.normalize();
      tq.setFromAxisAngle(tv2, 0.35 + Math.random() * 0.7);
      const d = uLocal.clone().applyQuaternion(tq).normalize();
      // 이웃 6방향: 바다도 있고 뭍도 있어야 해안이다
      let minR = Infinity, maxR = -Infinity;
      for (let j = 0; j < 6; j += 1) {
        tv2.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).cross(d).normalize();
        tq.setFromAxisAngle(tv2, 0.10 + Math.random() * 0.08);
        tv1.copy(d).applyQuaternion(tq).normalize();
        const r = surfaceR(tv1);
        minR = Math.min(minR, r); maxR = Math.max(maxR, r);
      }
      if (minR < seaThr && maxR > landThr) return d;
    }
    return null;
  };

  return {
    /** dl: 낮의 정도(0~1). uLocal: 걷는 아이 접점(행성 로컬). 반환: 무리까지의 표면 호 거리(u, 없으면 Infinity) */
    update(dt: number, el: number, uLocal: THREE.Vector3, dl: number): number {
      if (!flock) {
        if (hasCoast && dl > 0.45 && el >= nextTry) {
          nextTry = el + 30 + Math.random() * 50;
          const anchor = findCoast(uLocal);
          if (anchor) {
            const group = new THREE.Group();
            group.position.copy(anchor).multiplyScalar(surfaceR(anchor));
            group.quaternion.setFromUnitVectors(YUP, anchor);
            planet.add(group);
            const n = 2 + Math.floor(Math.random() * 3);
            const gulls: Gull[] = [];
            for (let i = 0; i < n; i += 1) {
              const m = proto.clone();
              const dir = Math.random() < 0.5 ? 1 : -1;
              // 본토 BUILD 149 원문 계수 — 행성 크기에 맞춰 반경·고도만 줄였다
              gulls.push({
                m,
                R: 1.1 + Math.random() * 1.6,
                th: Math.random() * Math.PI * 2,
                om: dir * (0.06 + Math.random() * 0.08), // 느린 선회 — 갈매기는 서두르지 않는다
                alt: 1.5 + Math.random() * 1.3,
                bobA: 0.18 + Math.random() * 0.2,
                bobF: 0.07 + Math.random() * 0.08,
                ph: Math.random() * Math.PI * 2,
                roll: 0,
              });
              m.rotation.order = 'YXZ';
              m.scale.setScalar(0.001);
              group.add(m);
            }
            flock = { group, anchor: anchor.clone(), gulls, phase: 'in', t: 0, life: 35 + Math.random() * 25 };
          }
        }
        return Infinity;
      }
      const F = flock;
      F.t += dt;
      let k = 1;
      if (F.phase === 'in') { k = Math.min(1, F.t / 2.0); if (k >= 1) { F.phase = 'live'; F.t = 0; } }
      else if (F.phase === 'live' && (F.t >= F.life || dl < 0.2)) { F.phase = 'out'; F.t = 0; } // 밤이 오면 돌아간다
      else if (F.phase === 'out') {
        k = Math.max(0, 1 - F.t / 2.0);
        if (k <= 0) {
          planet.remove(F.group);
          flock = null;
          return Infinity;
        }
      }
      // 본토 BUILD 149 프레임 원문 (접평면 로컬)
      const tNow = el;
      for (const G of F.gulls) {
        G.th += G.om * dt * 60 * 0.35; // 본토는 wind 증폭이 있었다 — 여기선 잔잔한 기본값
        const cx = Math.sin(tNow * 0.021 + G.ph) * 1.5; // 선회 중심도 아주 느리게 떠돈다
        const cz = Math.cos(tNow * 0.017 + G.ph) * 1.5;
        G.m.position.set(
          cx + Math.cos(G.th) * G.R,
          G.alt + Math.sin(tNow * G.bobF * Math.PI * 2 + G.ph) * G.bobA,
          cz + Math.sin(G.th) * G.R,
        );
        // 진행 방향으로 기수를, 선회 안쪽으로 날개를 (뱅킹) — 원문 그대로
        const yaw = Math.atan2(-Math.sin(G.th) * G.om, Math.cos(G.th) * G.om);
        G.m.rotation.y = yaw;
        const wantRoll = -Math.sign(G.om) * (0.22 + Math.min(0.2, Math.abs(G.om) * 1.5));
        G.roll += (wantRoll - G.roll) * Math.min(1, dt * 2);
        G.m.rotation.z = G.roll + Math.sin(tNow * 0.9 + G.ph) * 0.04;
        G.m.rotation.x = Math.sin(tNow * 0.5 + G.ph) * 0.03;
        G.m.scale.setScalar(Math.max(0.001, k));
      }
      // 끼룩 — 무리가 가까울 때만, 24~55초에 한 번 (본토 리듬)
      const arc = Math.acos(THREE.MathUtils.clamp(F.anchor.dot(uLocal), -1, 1)) * R;
      if (F.phase === 'live' && arc < 10) {
        cryIn -= dt;
        if (cryIn <= 0) { onCry(); cryIn = 24 + Math.random() * 31; }
      }
      return arc;
    },
    dispose() {
      if (flock) { planet.remove(flock.group); flock = null; }
    },
  };
}
