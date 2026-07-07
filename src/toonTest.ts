/**
 * BUILD 187: 셀 셰이딩 격리 실험대 — /toon-test.html
 * 본 씬과 같은 조명 문법(hemisphere + sun + fill) 아래 워커 한 명을 화면 가득 세운다.
 *
 * URL 파라미터:
 *   ?kid=1..8   캐릭터 선택 (기본 1)
 *   ?toon=0     툰 끄기 (기본: 켜짐 — 실험대니까)
 *   ?steps=3    계조 단수
 *   ?ink=0.006  아웃라인 화면 비례 두께 (0 = 끄기)
 *   ?hemi=0.4   hemisphere 조명 강도 배율 — 계조가 뭉개지는 정도 실험용
 */
import * as THREE from 'three';
import { loadWalkerAsset } from './engine/worldCore';
import { applyToonShading, addInkOutline } from './scene/toonShadingExperiment';

const q = new URLSearchParams(location.search);
const num = (k: string, d: number) => { const v = parseFloat(q.get(k) ?? ''); return Number.isFinite(v) ? v : d; };

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color('#4c6577');

const camera = new THREE.PerspectiveCamera(38, window.innerWidth / window.innerHeight, 0.01, 50);
camera.position.set(0.55, 0.62, 1.35);
camera.lookAt(0, 0.42, 0);

// 본 씬과 같은 문법의 조명 (worldCore 기본 비율 근사)
const hemi = new THREE.HemisphereLight('#cfe3ee', '#8a7f6d', 0.9 * num('hemi', 1));
scene.add(hemi);
const sun = new THREE.DirectionalLight('#fff2dd', 1.25);
sun.position.set(2.2, 3.4, 1.6);
scene.add(sun);
const fill = new THREE.DirectionalLight('#dce8f0', 0.35);
fill.position.set(-2.0, 1.2, -1.4);
scene.add(fill);

// 바닥 원판 — 그림자 감각용
const ground = new THREE.Mesh(
  new THREE.CircleGeometry(1.2, 48).rotateX(-Math.PI / 2),
  new THREE.MeshStandardMaterial({ color: '#b9ad93', roughness: 1 }),
);
scene.add(ground);

const label = document.getElementById('label')!;
const kid = Math.max(0, Math.min(8, Math.round(num('kid', 1))));
const toonOn = q.get('toon') !== '0';
const ink = num('ink', 0.006);

let mixer: THREE.AnimationMixer | null = null;

loadWalkerAsset(undefined, kid).then(({ group, animations }) => {
  scene.add(group);
  if (animations.length) {
    mixer = new THREE.AnimationMixer(group);
    const idle = animations.find((a) => /idle/i.test(a.name)) ?? animations[0];
    mixer.clipAction(idle).play();
  }
  if (toonOn) {
    applyToonShading(group, { steps: Math.round(num('steps', 3)), softness: num('soft', 0.15) });
    if (ink > 0) addInkOutline(group, { thickness: ink, color: 0x2b2118, irregularity: num('irr', 0.4) });
    const dbg = q.get('debug');
    if (dbg) {
      group.traverse((o) => {
        if (!o.userData.__isOutlineShell) return;
        const m = (o as THREE.Mesh).material as THREE.MeshBasicMaterial;
        m.color.set('#ff00ff');
        if (dbg === '1') { m.side = THREE.FrontSide; m.depthTest = false; (o as THREE.Mesh).renderOrder = 999; }
        if (dbg === '2') { m.side = THREE.BackSide; m.depthTest = false; (o as THREE.Mesh).renderOrder = 999; }
        if (dbg === '3') { m.side = THREE.BackSide; /* depthTest 기본, renderOrder 기본(-1) 유지 */ }
        if (dbg === '4') { m.side = THREE.BackSide; (o as THREE.Mesh).renderOrder = 999; } // 깊이 ON, 마지막에 그림
        if (dbg === '5') { m.side = THREE.BackSide; m.depthTest = false; } // 깊이 OFF, 먼저 그림(-1)
      });
    }
  }
  (window as unknown as { __r: THREE.WebGLRenderer }).__r = renderer;
  label.textContent = `TOON TEST · kid=${kid} · toon=${toonOn ? 'on' : 'off'} · steps=${Math.round(num('steps', 3))} · ink=${ink}`;
});

const clock = new THREE.Clock();
renderer.setAnimationLoop(() => {
  mixer?.update(clock.getDelta());
  renderer.render(scene, camera);
});

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
