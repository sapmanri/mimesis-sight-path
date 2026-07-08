// BUILD 244: 여기저기 이벤트 — 육지엔 비행기, 바다엔 배.
// 비행기: 땅에서 폽 → 떠서 대기를 가로질러 → 다른 땅에 착륙하며 폽 소멸.
// 배: 해안에서 폽 → 수면을 미끄러져 → 먼 해안에서 폽 소멸.
// 좌표: 둘 다 built.planet의 자식. 출발 dir → 도착 dir 대원(great-circle) 보간.
import * as THREE from 'three';

type Kind = 'plane' | 'ship';
type Phase = 'in' | 'cruise' | 'out';
type Vehicle = {
  kind: Kind;
  group: THREE.Group;
  from: THREE.Vector3;   // 출발 방향(행성 로컬 단위)
  to: THREE.Vector3;     // 도착 방향
  axis: THREE.Vector3;   // 대원 회전축
  ang: number;           // from→to 총 각
  u: number;             // 0..1 진행
  speed: number;         // u/s
  cruiseAlt: number;     // 순항 고도(지표 위 u)
  phase: Phase;
  t: number;
  baseScale: number;
};

const tv = new THREE.Vector3();
const tv2 = new THREE.Vector3();
const tq = new THREE.Quaternion();
const YUP = new THREE.Vector3(0, 1, 0);

// 저폴리 배 (모델 없을 때) — 선체 + 돛
function makeBoat(): THREE.Group {
  const g = new THREE.Group();
  const hullMat = new THREE.MeshStandardMaterial({ color: '#8a5a3c', roughness: 1 });
  const hull = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.06, 0.1), hullMat);
  hull.position.y = 0.03;
  // 뱃머리 삼각
  const bow = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.12, 4), hullMat);
  bow.rotation.z = -Math.PI / 2; bow.rotation.y = Math.PI / 4;
  bow.position.set(0.16, 0.03, 0); bow.scale.set(1, 1, 2);
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.18), new THREE.MeshStandardMaterial({ color: '#5a4432' }));
  mast.position.set(0, 0.13, 0);
  const sailMat = new THREE.MeshStandardMaterial({ color: '#eae4d6', roughness: 1, side: THREE.DoubleSide });
  const sail = new THREE.Mesh(new THREE.PlaneGeometry(0.13, 0.14), sailMat);
  sail.position.set(0.0, 0.14, 0); sail.rotation.y = Math.PI / 2;
  g.add(hull, bow, mast, sail);
  g.scale.setScalar(1.8); // 배 가시성
  return g;
}

export function createPlanetVehicles(
  planet: THREE.Group,
  R: number,
  surfaceR: (d: THREE.Vector3) => number,
  planeProto: THREE.Group | null,
  onEvent: (kind: Kind) => void,
) {
  // 바다/뭍 문턱 (갈매기와 같은 방식)
  let lo = Infinity, hi = -Infinity;
  for (let i = 0; i < 400; i += 1) {
    tv.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize();
    const r = surfaceR(tv);
    lo = Math.min(lo, r); hi = Math.max(hi, r);
  }
  const span = Math.max(1e-4, hi - lo);
  const seaThr = lo + span * 0.2;
  const landThr = lo + span * 0.32;
  const hasSea = span > 0.05;

  const isSea = (d: THREE.Vector3) => surfaceR(d) < seaThr;
  const isLand = (d: THREE.Vector3) => surfaceR(d) > landThr;

  const vehicles: Vehicle[] = [];
  let nextPlane = -1;
  let nextShip = -1;
  const seedRnd = (() => { let s = 424242; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; })();

  const randDirWhere = (test: (d: THREE.Vector3) => boolean): THREE.Vector3 | null => {
    for (let k = 0; k < 40; k += 1) {
      const u = seedRnd() * 2 - 1;
      const th = seedRnd() * Math.PI * 2;
      const r = Math.sqrt(1 - u * u);
      tv.set(Math.cos(th) * r, u, Math.sin(th) * r);
      if (test(tv)) return tv.clone();
    }
    return null;
  };

  function spawn(kind: Kind) {
    const test = kind === 'ship' ? isSea : isLand;
    const from = randDirWhere(test);
    if (!from) return;
    // 도착: 같은 종류의 다른 지점, 너무 가깝지 않게
    let to: THREE.Vector3 | null = null;
    for (let k = 0; k < 30; k += 1) {
      const cand = randDirWhere(test);
      if (cand && cand.angleTo(from) > 0.6) { to = cand; break; }
    }
    if (!to) return;
    const axis = new THREE.Vector3().crossVectors(from, to).normalize();
    if (axis.lengthSq() < 1e-8) return;
    const ang = from.angleTo(to);
    let group: THREE.Group;
    if (kind === 'plane' && planeProto) group = planeProto.clone();
    else group = makeBoat();
    const baseScale = group.scale.x || 1; // 정규화된 기본 배율 보존
    group.scale.setScalar(0.001);
    planet.add(group);
    vehicles.push({
      kind, group, from, to, axis, ang, u: 0,
      speed: kind === 'plane' ? 0.05 + seedRnd() * 0.03 : 0.02 + seedRnd() * 0.015,
      cruiseAlt: kind === 'plane' ? R * (0.12 + seedRnd() * 0.06) : 0,
      phase: 'in', t: 0, baseScale,
    });
    onEvent(kind);
  }

  function kill(v: Vehicle) {
    planet.remove(v.group);
    vehicles.splice(vehicles.indexOf(v), 1);
  }

  return {
    update(dt: number, el: number, spec: { planeEvery: number; shipEvery: number }, dl: number) {
      const planeEvery = spec.planeEvery ?? 0;
      const shipEvery = spec.shipEvery ?? 0;
      // 스폰 시계
      if (planeEvery > 0 && planeProto) {
        if (nextPlane < 0) nextPlane = el + 3 + seedRnd() * planeEvery * 0.5;
        if (el >= nextPlane) { if (vehicles.filter((v) => v.kind === 'plane').length < 3) spawn('plane'); nextPlane = el + planeEvery * (0.7 + seedRnd() * 0.6); }
      } else nextPlane = -1;
      if (shipEvery > 0 && hasSea) {
        if (nextShip < 0) nextShip = el + 5 + seedRnd() * shipEvery * 0.5;
        if (el >= nextShip) { if (vehicles.filter((v) => v.kind === 'ship').length < 4) spawn('ship'); nextShip = el + shipEvery * (0.7 + seedRnd() * 0.6); }
      } else nextShip = -1;

      for (let i = vehicles.length - 1; i >= 0; i -= 1) {
        const v = vehicles[i];
        v.t += dt;
        v.u += (v.speed / Math.max(0.3, v.ang)) * dt; // 각 길이에 무관하게 일정 시간
        if (v.u >= 1) { kill(v); continue; }

        // 현재 방향 = from을 axis 둘레로 (u·ang)만큼 회전
        tv.copy(v.from).applyQuaternion(tq.setFromAxisAngle(v.axis, v.ang * v.u)).normalize();
        // 진행 접선 (다음 위치 - 현재)
        tv2.copy(v.from).applyQuaternion(tq.setFromAxisAngle(v.axis, v.ang * Math.min(1, v.u + 0.01))).normalize();
        const tangent = tv2.clone().sub(tv).normalize();

        // 고도 프로파일: 비행기는 이륙(0→cruise)→순항→착륙(cruise→0). 배는 0.
        let alt = 0;
        if (v.kind === 'plane') {
          const climb = THREE.MathUtils.smoothstep(v.u, 0, 0.18);
          const descend = 1 - THREE.MathUtils.smoothstep(v.u, 0.82, 1);
          alt = v.cruiseAlt * Math.min(climb, descend);
        }
        const groundR = surfaceR(tv);
        const r = groundR + 0.01 + alt;
        v.group.position.copy(tv).multiplyScalar(r);

        // 자세: 위(+Y)를 지표 법선 tv에, 정면(-Z)을 진행 tangent에
        const up = tv;
        const fwd = tangent.clone();
        const right = new THREE.Vector3().crossVectors(up, fwd).normalize();
        const fwd2 = new THREE.Vector3().crossVectors(right, up).normalize();
        const m = new THREE.Matrix4().makeBasis(right, up, fwd2.negate());
        v.group.quaternion.setFromRotationMatrix(m);
        if (v.kind === 'ship') { v.group.rotation.z += Math.sin(el * 1.3 + i) * 0.03; } // 물결에 흔들

        // 폽 스케일 (in/out): 나타나고 사라질 때 통—/쇽
        let pop = 1;
        if (v.u < 0.06) pop = v.u / 0.06;
        else if (v.u > 0.94) pop = (1 - v.u) / 0.06;
        v.group.scale.setScalar(Math.max(0.0001, v.baseScale * pop));
      }
    },
    dispose() { for (let i = vehicles.length - 1; i >= 0; i -= 1) kill(vehicles[i]); },
  };
}
