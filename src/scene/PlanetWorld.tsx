import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { loadWalkerAsset, applyHeightFog, PALETTE, defaultLoader, makeCloudPuff, loadKitModel, loadKitModelWithClips, kitHeight } from '../engine/worldCore';
import { PET_ROSTER, loadPet, type LoadedPet } from '../engine/pets';
import { createClipRig, createWalkerRig, type WalkerRig } from './walkerRig';
import { createPlanetSky } from './planetSky';
import { createPlanetGulls } from './planetGulls';
import { createMoonRabbit } from './moonRabbit';
import { createStarSky } from './starSky';
import { createFootDust } from './footDust';
import { createPlanetVehicles } from './planetVehicles';
import { createComet } from './comet';
import { worldTime, phaseAngle, eventCycle } from './skyClock';
import { makeBubble, updateBubble, type Bubble } from './speech';
import type { PlanetEvent, PlanetEventKind } from './planetEvents';
import { footsteps } from './footsteps';
import { ambience } from '../audio/ambience';
import { planetSound } from '../audio/planetSound';
import type { PlanetSpec, PlanetMemory, PlanetContact, PlanetApi, PlanetProp } from './planetSpec';
import type { MutableRefObject } from 'react';
import { createPropObject } from '../engine/props';
import { loadHandLanternAsset } from '../engine/props';
import { loadHeldDeviceAsset } from './heldDevices';
import { chooseDrive, INITIAL_DRIVES, INITIAL_FATIGUE, PROP_STIMULUS, scorePropAttraction, tickDrives, type Drive } from './byeoliDrive';
import { beginRising, beginStanding, createEncounter, shouldEndEncounter, type ByeoliEncounter } from './byeoliEncounter';

// ---------- BUILD 207: 작은 행성 v7 — 스펙이 세계를 정한다 ----------
// 에디터의 문법 이식: 세계의 모든 다이얼(테마·반지름·굴곡·안개·걸음·감김·요동·
// 교차 고민·달 궤도·태양 방향·기억 목록)이 PlanetSpec 하나에 산다.
// 무거운 것(지형·길)만 재건축하고, 가벼운 것(걸음·달 궤도·기억)은 ref로 실시간 반영.

const PLANET_CENTER = new THREE.Vector3(0, -12, 0);

// BUILD 212: 방사 안개 v2 — 값은 유니폼에 산다. 밴드·농도 다이얼이 재건축 없이 즉답하고,
// 지형과 캐릭터가 같은 유니폼을 공유한다. (구판은 리터럴 굽기 — 캐릭터는 다이얼을 못 들었다.)
// uRF = (bottom, top, strength). mul만 재질별 리터럴(정적).
const RFOG = { v: new THREE.Vector3(11.9, 12.3, 0.8), color: new THREE.Color('#ffffff') };
// BUILD 215: 안개 기준면 — 명목 R이 아니라 '길의 평균 반경'(그녀가 딛는 높이)을 0점으로.
// 지구는 바다가 낮아 길이 R 아래를 지난다 — R 기준이면 수위 0.02에 이미 무릎(실화).
const RFOG_BASE = { r: 12 };
// BUILD 221: 국기 화가 — 주요국은 손으로, 모르는 나라는 이니셜 페넌트로. '대강 귀엽게' (Vase)
// BUILD 238: 여권은 '진짜 나라'만 기록한다 — 이니셜 페넌트(오타·미완성 이름)는 우연이 아니라 실수다.
// drawFlag의 키워드 목록과 같은 진실원에서 판별한다.
const FLAG_KEYS = [
  '한국', '대한민국', 'korea', '일본', 'japan', '중국', 'china', '미국', 'usa', 'america', '미합중국',
  '영국', 'uk', 'britain', 'england', '프랑스', 'france', '이탈리아', 'italy', '아일랜드', 'ireland',
  '벨기에', 'belgium', '멕시코', 'mexico', '독일', 'germany', '러시아', 'russia', '네덜란드', 'netherlands', 'holland',
  '오스트리아', 'austria', '스페인', 'spain', '인도네시아', 'indonesia', '폴란드', 'poland', '태국', 'thailand',
  '인도', 'india', '브라질', 'brazil', '캐나다', 'canada', '호주', 'australia', '튀르키예', '터키', 'turkey',
  '베트남', 'vietnam', '스위스', 'switzerland', '스웨덴', 'sweden', '노르웨이', 'norway', '덴마크', 'denmark',
  '핀란드', 'finland', '그리스', 'greece', '아르헨티나', 'argentina', '이집트', 'egypt',
];
export function flagIsKnownCountry(name: string): boolean {
  const n = (name ?? '').trim().toLowerCase();
  if (!n) return false;
  return FLAG_KEYS.some((k) => n.includes(k.toLowerCase()));
}

function drawFlag(name: string): HTMLCanvasElement {
  const W = 192; const H = 128;
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const g = cv.getContext('2d')!;
  const n = name.trim().toLowerCase();
  const has = (...keys: string[]) => keys.some((k) => n.includes(k));
  const vert = (...cols: string[]) => cols.forEach((c, i) => { g.fillStyle = c; g.fillRect(Math.floor(i * W / cols.length), 0, Math.ceil(W / cols.length) + 1, H); });
  const horz = (...cols: string[]) => cols.forEach((c, i) => { g.fillStyle = c; g.fillRect(0, Math.floor(i * H / cols.length), W, Math.ceil(H / cols.length) + 1); });
  const circle = (c: string, x: number, y: number, r: number) => { g.fillStyle = c; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill(); };
  const star = (c: string, x: number, y: number, r: number, rot = -Math.PI / 2) => {
    g.fillStyle = c; g.beginPath();
    for (let i = 0; i < 10; i += 1) { const a = rot + (i * Math.PI) / 5; const rr = i % 2 ? r * 0.42 : r; if (i) g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); else g.moveTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); }
    g.closePath(); g.fill();
  };
  if (has('한국', '대한민국', 'korea')) {
    g.fillStyle = '#f4f1e8'; g.fillRect(0, 0, W, H);
    const cx = W / 2; const cy = H / 2; const r = 26;
    g.fillStyle = '#c8402f'; g.beginPath(); g.arc(cx, cy, r, Math.PI, 0); g.fill();
    g.fillStyle = '#2a4d8f'; g.beginPath(); g.arc(cx, cy, r, 0, Math.PI); g.fill();
    circle('#c8402f', cx - r / 2, cy, r / 2); circle('#2a4d8f', cx + r / 2, cy, r / 2);
    g.fillStyle = '#2b2b2b';
    const bar = (bx: number, by: number, a: number) => { g.save(); g.translate(bx, by); g.rotate(a); for (let i = -1; i <= 1; i += 1) g.fillRect(-16, i * 8 - 2.5, 32, 5); g.restore(); };
    bar(30, 26, -Math.PI / 5); bar(W - 30, H - 26, -Math.PI / 5); bar(W - 30, 26, Math.PI / 5); bar(30, H - 26, Math.PI / 5);
  } else if (has('일본', 'japan')) { g.fillStyle = '#f4f1e8'; g.fillRect(0, 0, W, H); circle('#c8402f', W / 2, H / 2, 30); }
  else if (has('중국', 'china')) { g.fillStyle = '#c8402f'; g.fillRect(0, 0, W, H); star('#e8c14f', 42, 40, 20); [[80, 20], [94, 38], [94, 60], [80, 76]].forEach(([x, y]) => star('#e8c14f', x, y, 7)); }
  else if (has('미국', 'usa', 'america', '미합중국')) {
    for (let i = 0; i < 13; i += 1) { g.fillStyle = i % 2 ? '#f4f1e8' : '#b8433a'; g.fillRect(0, (i * H) / 13, W, H / 13 + 1); }
    g.fillStyle = '#2a4d8f'; g.fillRect(0, 0, 80, 56);
    for (let ry = 0; ry < 4; ry += 1) for (let rx = 0; rx < 5; rx += 1) circle('#f4f1e8', 10 + rx * 15 + (ry % 2) * 7, 8 + ry * 13, 2.6);
  } else if (has('영국', 'uk', 'britain', 'england')) {
    g.fillStyle = '#2a4d8f'; g.fillRect(0, 0, W, H);
    g.strokeStyle = '#f4f1e8'; g.lineWidth = 22; g.beginPath(); g.moveTo(0, 0); g.lineTo(W, H); g.moveTo(W, 0); g.lineTo(0, H); g.stroke();
    g.strokeStyle = '#f4f1e8'; g.lineWidth = 34; g.beginPath(); g.moveTo(W / 2, 0); g.lineTo(W / 2, H); g.moveTo(0, H / 2); g.lineTo(W, H / 2); g.stroke();
    g.strokeStyle = '#c8402f'; g.lineWidth = 18; g.beginPath(); g.moveTo(W / 2, 0); g.lineTo(W / 2, H); g.moveTo(0, H / 2); g.lineTo(W, H / 2); g.stroke();
  }
  else if (has('프랑스', 'france')) vert('#2a4d8f', '#f4f1e8', '#c8402f');
  else if (has('이탈리아', 'italy')) vert('#4a7c4e', '#f4f1e8', '#c8402f');
  else if (has('아일랜드', 'ireland')) vert('#4a7c4e', '#f4f1e8', '#d98e3f');
  else if (has('벨기에', 'belgium')) vert('#2b2b2b', '#e8c14f', '#c8402f');
  else if (has('멕시코', 'mexico')) { vert('#4a7c4e', '#f4f1e8', '#c8402f'); circle('#8a6f4d', W / 2, H / 2, 12); }
  else if (has('독일', 'germany')) horz('#2b2b2b', '#c8402f', '#e8c14f');
  else if (has('러시아', 'russia')) horz('#f4f1e8', '#2a4d8f', '#c8402f');
  else if (has('네덜란드', 'netherlands', 'holland')) horz('#c8402f', '#f4f1e8', '#2a4d8f');
  else if (has('오스트리아', 'austria')) horz('#c8402f', '#f4f1e8', '#c8402f');
  else if (has('스페인', 'spain')) { g.fillStyle = '#e8c14f'; g.fillRect(0, 0, W, H); g.fillStyle = '#c8402f'; g.fillRect(0, 0, W, H / 4); g.fillRect(0, (3 * H) / 4, W, H / 4); }
  else if (has('인도네시아', 'indonesia')) horz('#c8402f', '#f4f1e8');
  else if (has('폴란드', 'poland')) horz('#f4f1e8', '#c8402f');
  else if (has('태국', 'thailand')) { horz('#c8402f', '#f4f1e8', '#2a4d8f', '#f4f1e8', '#c8402f'); g.fillStyle = '#2a4d8f'; g.fillRect(0, (2 * H) / 5, W, H / 5); }
  else if (has('인도', 'india')) { horz('#d98e3f', '#f4f1e8', '#4a7c4e'); circle('#2a4d8f', W / 2, H / 2, 12); circle('#f4f1e8', W / 2, H / 2, 9); circle('#2a4d8f', W / 2, H / 2, 2.5); }
  else if (has('브라질', 'brazil')) { g.fillStyle = '#4a7c4e'; g.fillRect(0, 0, W, H); g.fillStyle = '#e8c14f'; g.beginPath(); g.moveTo(W / 2, 12); g.lineTo(W - 16, H / 2); g.lineTo(W / 2, H - 12); g.lineTo(16, H / 2); g.closePath(); g.fill(); circle('#2a4d8f', W / 2, H / 2, 20); }
  else if (has('캐나다', 'canada')) { vert('#c8402f', '#f4f1e8', '#c8402f'); g.fillStyle = '#c8402f'; g.beginPath(); g.moveTo(W / 2, 30); g.lineTo(W / 2 + 16, 56); g.lineTo(W / 2 + 26, 50); g.lineTo(W / 2 + 18, 76); g.lineTo(W / 2 + 6, 70); g.lineTo(W / 2 + 6, 92); g.lineTo(W / 2 - 6, 92); g.lineTo(W / 2 - 6, 70); g.lineTo(W / 2 - 18, 76); g.lineTo(W / 2 - 26, 50); g.lineTo(W / 2 - 16, 56); g.closePath(); g.fill(); }
  else if (has('호주', 'australia')) { g.fillStyle = '#2a4d8f'; g.fillRect(0, 0, W, H); star('#f4f1e8', 48, 88, 12); [[140, 24], [160, 44], [138, 66], [118, 46], [150, 92]].forEach(([x, y]) => star('#f4f1e8', x, y, 6)); }
  else if (has('튀르키예', '터키', 'turkey')) { g.fillStyle = '#c8402f'; g.fillRect(0, 0, W, H); circle('#f4f1e8', 74, H / 2, 24); circle('#c8402f', 82, H / 2, 20); star('#f4f1e8', 116, H / 2, 10, 0); }
  else if (has('베트남', 'vietnam')) { g.fillStyle = '#c8402f'; g.fillRect(0, 0, W, H); star('#e8c14f', W / 2, H / 2, 28); }
  else if (has('스위스', 'switzerland')) { g.fillStyle = '#c8402f'; g.fillRect(0, 0, W, H); g.fillStyle = '#f4f1e8'; g.fillRect(W / 2 - 9, H / 2 - 30, 18, 60); g.fillRect(W / 2 - 30, H / 2 - 9, 60, 18); }
  else if (has('스웨덴', 'sweden')) { g.fillStyle = '#2a4d8f'; g.fillRect(0, 0, W, H); g.fillStyle = '#e8c14f'; g.fillRect(58, 0, 20, H); g.fillRect(0, H / 2 - 10, W, 20); }
  else if (has('노르웨이', 'norway')) { g.fillStyle = '#c8402f'; g.fillRect(0, 0, W, H); g.fillStyle = '#f4f1e8'; g.fillRect(54, 0, 28, H); g.fillRect(0, H / 2 - 14, W, 28); g.fillStyle = '#2a4d8f'; g.fillRect(60, 0, 16, H); g.fillRect(0, H / 2 - 8, W, 16); }
  else if (has('덴마크', 'denmark')) { g.fillStyle = '#c8402f'; g.fillRect(0, 0, W, H); g.fillStyle = '#f4f1e8'; g.fillRect(58, 0, 20, H); g.fillRect(0, H / 2 - 10, W, 20); }
  else if (has('핀란드', 'finland')) { g.fillStyle = '#f4f1e8'; g.fillRect(0, 0, W, H); g.fillStyle = '#2a4d8f'; g.fillRect(58, 0, 22, H); g.fillRect(0, H / 2 - 11, W, 22); }
  else if (has('그리스', 'greece')) { for (let i = 0; i < 9; i += 1) { g.fillStyle = i % 2 ? '#f4f1e8' : '#2a4d8f'; g.fillRect(0, (i * H) / 9, W, H / 9 + 1); } g.fillStyle = '#2a4d8f'; g.fillRect(0, 0, 64, 64); g.fillStyle = '#f4f1e8'; g.fillRect(28, 0, 9, 64); g.fillRect(0, 28, 64, 9); }
  else if (has('아르헨티나', 'argentina')) { horz('#8fb8d8', '#f4f1e8', '#8fb8d8'); circle('#e8c14f', W / 2, H / 2, 10); }
  else if (has('이집트', 'egypt')) { horz('#c8402f', '#f4f1e8', '#2b2b2b'); circle('#e8c14f', W / 2, H / 2, 9); }
  else {
    g.fillStyle = '#efe8d8'; g.fillRect(0, 0, W, H);
    g.fillStyle = '#b0543f'; g.beginPath(); g.moveTo(0, 0); g.lineTo(64, 0); g.lineTo(0, 48); g.closePath(); g.fill();
    g.fillStyle = '#3c3529'; g.font = 'bold 56px Georgia, serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText((name.trim()[0] ?? '?').toUpperCase(), W / 2 + 10, H / 2 + 4);
  }
  g.strokeStyle = 'rgba(60,53,41,0.35)'; g.lineWidth = 4; g.strokeRect(0, 0, W, H);
  return cv;
}

// BUILD 221: 깃발 제작소 — 작은 장대 + 캔버스 국기 천. 폽의 몸.
function makeFlag(country: string) {
  const g = new THREE.Group();
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.015, 0.56, 6), new THREE.MeshStandardMaterial({ color: '#8a7a5f', roughness: 1 }));
  pole.position.y = 0.28; pole.castShadow = true; g.add(pole);
  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.022, 8, 6), new THREE.MeshStandardMaterial({ color: '#d8b26e', roughness: 0.7 }));
  knob.position.y = 0.585; g.add(knob);
  const tex = new THREE.CanvasTexture(drawFlag(country));
  tex.colorSpace = THREE.SRGBColorSpace;
  const cloth = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.28), new THREE.MeshStandardMaterial({ map: tex, side: THREE.DoubleSide, roughness: 1 }));
  cloth.position.set(0.222, 0.43, 0); cloth.castShadow = true;
  g.add(cloth);
  return g;
}
const backOut = (t: number) => { const c1 = 1.70158; const c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); };

// BUILD 219: 배회자의 바람 — 세 사인의 합, 부드러운 마음의 흔들림
const wanderNoise = (x: number) => Math.sin(x * 1.7) * 0.55 + Math.sin(x * 3.7 + 1.3) * 0.3 + Math.sin(x * 7.1 + 4.2) * 0.15;
function updateRFogBand(fogLevel: number, fogStrength: number) {
  const R0 = RFOG_BASE.r;
  const lv = Math.max(fogLevel, 0.001);
  RFOG.v.set(R0 - lv * 0.25 - 0.02, R0 + lv, fogLevel <= 0.01 ? 0 : fogStrength);
}
// BUILD 214: 낮밤 — 낮 하늘색(테마 안개색)과 밤 하늘색 사이를 태양 고도가 오간다
const DAY_SKY = new THREE.Color('#ffffff');
const NIGHT_SKY = new THREE.Color('#161d26');
const SKY_BLEND = new THREE.Color('#ffffff');
function applyRadialFog(mat: THREE.MeshStandardMaterial, mul = 1) {
  if (mat.userData.rfog) return mat;
  mat.userData.rfog = true;
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uPlanetC = { value: PLANET_CENTER };
    shader.uniforms.uRF = { value: RFOG.v };
    shader.uniforms.uRFc = { value: RFOG.color };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vRFw;')
      .replace('#include <fog_vertex>', '#include <fog_vertex>\nvRFw = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vRFw;\nuniform vec3 uPlanetC;\nuniform vec3 uRF;\nuniform vec3 uRFc;')
      .replace(
        '#include <fog_fragment>',
        `#include <fog_fragment>\nfloat rfd = distance(vRFw, uPlanetC);\ngl_FragColor.rgb = mix(gl_FragColor.rgb, uRFc, clamp((1.0 - smoothstep(uRF.x, uRF.y, rfd)) * uRF.z * ${mul.toFixed(4)}, 0.0, 1.0));`,
      );
  };
  mat.customProgramCacheKey = () => `rfog2|${mul.toFixed(4)}`;
  mat.needsUpdate = true;
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
  earth: { kind: 'maps' as const, color: 'assets/planet/earth_color.jpg', height: 'assets/planet/earth_height.png', amp: 0.12, clouds: 'assets/planet/earth_clouds.png' },
  luna: { kind: 'meshworld' as const, file: 'LunaMesh.glb', color: 'assets/planet/moon_color.jpg', boost: 1.25 },
  moon: { kind: 'maps' as const, color: 'assets/planet/moon_color.jpg', height: 'assets/planet/moon_height.png', amp: 0.3 },
  desert: { kind: 'procedural' as const },
};

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

function bakeTrailOntoMap(map: THREE.Texture, curve: THREE.CatmullRomCurve3, R: number): THREE.Texture {
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

const MNT_V = new THREE.Vector3(); // BUILD 231: 탈것 뼈 실측용 스크래치
const FOOT_WP = new THREE.Vector3(); // BUILD 264: 발 월드위치
const FOOT_LOCAL = new THREE.Vector3(); // BUILD 269: 발 planet-로컬 위치
const FOOT_WP2 = new THREE.Vector3(); // BUILD 275: 오른발 월드위치
const FOOT_UP = new THREE.Vector3(); // BUILD 264: 발밑 지표 법선(월드)
const FOOT_WATER = { value: false }; // BUILD 264: 발밑 물 판정
const MOON_SUN = new THREE.Vector3(0, 1, 0); // BUILD 236: 달→태양 방향 (위상 셰이더 공유 참조)
const PET_V = new THREE.Vector3(); // BUILD 231: 펫 위치 환산용 — PT.t2를 쓰면 yawFrom(=PT.t2 별칭)이 덮여 요가 죽는다

export function PlanetWorld({ spec, walkerIdx = -1, paused = false, onMemory, onFlag, onEvent, contactRef, apiRef, onByeoliCapture, onNarration }: { spec: PlanetSpec; walkerIdx?: number; paused?: boolean; onMemory?: (m: PlanetMemory | null) => void; onFlag?: (name: string) => void; onEvent?: (e: PlanetEvent) => void; contactRef?: MutableRefObject<PlanetContact | null>; apiRef?: MutableRefObject<PlanetApi | null>; onByeoliCapture?: (dataUrl: string, reason: 'stage' | 'mood' | 'event') => void; onNarration?: (text: string) => void }) {
  const { scene, camera, gl } = useThree();
  if (!scene.fog) scene.fog = new THREE.Fog(PALETTE.fog, 9, spec.viewDist ?? 41);
  // BUILD 214: 시야 거리 다이얼 — 씬 안개 near/far 즉답 갱신
  useEffect(() => {
    const f = scene.fog as THREE.Fog | null;
    if (f) { f.near = Math.max(4, (spec.viewDist ?? 41) * 0.22); f.far = Math.max(8, spec.viewDist ?? 41); }
  }, [scene, spec.viewDist]);

  // 가벼운 다이얼은 ref로 실시간 반영 (재건축 없이)
  const specRef = useRef(spec);
  specRef.current = spec;
  const onMemRef = useRef(onMemory);
  onMemRef.current = onMemory;
  const onFlagRef = useRef(onFlag);
  onFlagRef.current = onFlag;
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;
  // 별이 자율 촬영 — 별 종속(맵 무관). 상태머신의 자연스러운 순간에 확률로 부른다.
  const onByeoliCaptureRef = useRef(onByeoliCapture);
  onByeoliCaptureRef.current = onByeoliCapture;
  const onNarrationRef = useRef(onNarration);
  onNarrationRef.current = onNarration;
  const narrationGuard = useRef({ text: '', at: 0 });
  const narrate = (text: string, minGap = 900) => {
    const now = performance.now();
    const prev = narrationGuard.current;
    if (prev.text === text && now - prev.at < 12000) return;
    if (now - prev.at < minGap) return;
    narrationGuard.current = { text, at: now };
    onNarrationRef.current?.(text);
  };
  const propNarrationName = (id: string) => {
    const prop = propMap.current.get(id);
    const named = prop?.title?.trim();
    if (named) return named;
    const names: Record<string, string> = { chair: '의자', book: '책', 'rock-small': '작은 돌', 'rock-big': '큰 바위', tree: '나무', lighthouse: '등대' };
    return names[prop?.obj ?? ''] ?? '눈앞의 무언가';
  };
  const byeoliShotAt = useRef(0);
  const heldCameraRef = useRef<THREE.Group | null>(null);
  const heldPhoneRef = useRef<THREE.Group | null>(null);
  const heldDeviceHandRef = useRef<THREE.Object3D | null>(null);
  const heldDeviceRootRef = useRef<THREE.Group | null>(null);
  const heldDeviceTimer = useRef<number | null>(null);
  const showHeldDevice = (kind: 'camera' | 'phone', durationSec: number) => {
    const cameraProp = heldCameraRef.current;
    const phoneProp = heldPhoneRef.current;
    if (cameraProp) cameraProp.visible = kind === 'camera';
    if (phoneProp) phoneProp.visible = kind === 'phone';
    if (heldDeviceTimer.current !== null) window.clearTimeout(heldDeviceTimer.current);
    heldDeviceTimer.current = window.setTimeout(() => {
      if (cameraProp) cameraProp.visible = false;
      if (phoneProp) phoneProp.visible = false;
      heldDeviceTimer.current = null;
    }, Math.max(700, durationSec * 1000 + 250));
  };
  // BUILD 369: 셔터음 — 행성에도(별이 코어와 동일). 짧은 SFX라 HTMLAudio.
  const shutterRef = useRef<HTMLAudioElement | null>(null);
  if (typeof Audio !== 'undefined' && !shutterRef.current) {
    const a = new Audio('/assets/sfx/shutter.mp3');
    a.volume = 0.5; a.preload = 'auto';
    shutterRef.current = a;
  }
  const playShutter = () => {
    const a = shutterRef.current;
    if (!a) return;
    try { a.currentTime = 0; a.play().catch(() => { /* 자동재생 정책 — 조용히 */ }); } catch { /* 무시 */ }
  };
  // BUILD 369: 별이의 촬영 안무 — 행성으로 이식(별이 코어와 동일 철학).
  //   찍기 = 자유(촬영허용 무관, 늘 자세+셔터+캡처). 올리기 = App이 게이트(일부만).
  //   ① SitCamera 1~3회(고민하는 사색가) ② 셔터+캡처는 전체의 78% 지점(한참 본 뒤).
  const byeoliShot = (reason: 'stage' | 'mood' | 'event') => {
    const now = performance.now();
    if (now - byeoliShotAt.current < 8000) return; // 찍기 자체의 연타 방지
    byeoliShotAt.current = now;
    const repeats = 1 + Math.floor(Math.random() * 3); // 1~3회
    const totalSec = rigRef.current?.playAction?.('SitCamera', repeats) ?? 0;
    if (totalSec > 0) {
      showHeldDevice('camera', totalSec);
      narrate('그냥 지나치기에는 아까운 장면이었는지, 별이는 카메라를 들었다.');
    }
    const shutterAt = Math.max(800, totalSec * 1000 * 0.78);
    window.setTimeout(() => {
      playShutter();
      const cb = onByeoliCaptureRef.current;
      try {
        gl.render(scene, camera);
        const dataUrl = gl.domElement.toDataURL('image/jpeg', 0.6);
        if (cb) cb(dataUrl, reason); // 올리기 시도 — 발행 여부는 App이 결정
      } catch { /* 조용히 */ }
    }, shutterAt);
  };
  // BUILD 372: 콤보 토큰 하나 실행 → rig 동작으로 번역, 이 동작이 차지할 시간(초) 반환.
  //   시퀀서가 이 시간을 타이머로 써서 끝나면 다음 토큰으로 넘어간다.
  // BUILD 381: 욕구 → 실제 모션 실행. 각 행동은 { dur, sustained } 반환.
  const OBSERVE_CLIPS = ['LookAround', 'LookAround2', 'LookDown', 'KneelDown', 'Kneel'];
  const WONDER_CLIPS = ['LookAround', 'LookBehind', 'LookShoulder', 'KneelPoint', 'Pointing'];
  const doObserve = (): { dur: number; sustained: boolean } => {
    const rig = rigRef.current; if (!rig) return { dur: 0.6, sustained: false };
    // 관찰: 가끔 뒤적이기(search), 대개 살펴보기
    if (Math.random() < 0.35) { const d = rig.playAction?.('LookingFiles', 1) ?? 0; return { dur: d > 0 ? d + 0.3 : 3.0, sustained: false }; }
    const d = rig.playAction?.(OBSERVE_CLIPS[Math.floor(Math.random() * OBSERVE_CLIPS.length)], 1) ?? 0;
    return { dur: d > 0 ? d + 0.3 : 2.2, sustained: false };
  };
  const doRecord = (): { dur: number; sustained: boolean } => {
    const rig = rigRef.current; if (!rig) return { dur: 0.6, sustained: false };
    const d = rig.playAction?.('Writing', 1) ?? 0;
    if (d > 0) showHeldDevice('phone', d);
    return { dur: d > 0 ? d + 0.3 : 2.5, sustained: false };
  };
  const doWonder = (): { dur: number; sustained: boolean } => {
    const rig = rigRef.current; if (!rig) return { dur: 0.6, sustained: false };
    if (Math.random() < 0.4) { byeoliShot('mood'); return { dur: 3.2 + Math.random() * 0.8, sustained: false }; } // 경탄 → 가끔 사진
    const d = rig.playAction?.(WONDER_CLIPS[Math.floor(Math.random() * WONDER_CLIPS.length)], 1) ?? 0;
    return { dur: d > 0 ? d + 0.3 : 2.0, sustained: false };
  };
  const doRest = (targetId?: string, propObj?: string): { dur: number; sustained: boolean } => {
    const rig = rigRef.current; if (!rig) return { dur: 0.6, sustained: false };
    // BUILD 387: 의자 앉기(rig 의자소환 방식) 완전 폐기 — 여러 번 뺑뺑이. rest는 바닥 앉기만.
    void targetId; void propObj;
    rig.playInspect?.('sitGround'); return { dur: 6 + Math.random() * 3, sustained: true };
  };
  // ★ 별이가 지금 자기 욕구로 행동을 하나 고른다(각본 없음). 소품이 자극한 욕구 + 별이 현재 욕구 중 최강.
  //   고른 행동을 하고 그 욕구를 해소(감소). 다음엔 다른 욕구가 이길 수 있다.
  const chooseAndActByDrive = (T2: ByeoliEncounter): { dur: number; sustained: boolean } => {
    const stim = PROP_STIMULUS[propMap.current.get(T2.id)?.obj ?? '']?.stir ?? {};
    const D = drives.current;
    const F = driveFatigue.current;
    const best = chooseDrive(D, F, stim, T2.restedOnce);
    const place = propNarrationName(T2.id);
    const lines: Record<Drive, string> = {
      observe: `별이는 ${place} 앞에서 작은 부분까지 찬찬히 살펴보고 있다.`,
      record: `별이는 ${place} 앞에서 떠오른 것을 휴대폰에 적고 있다.`,
      rest: `별이는 ${place} 곁에서 잠시 숨을 고르기로 했다.`,
      wonder: `${place}가 자꾸 마음에 걸리는지, 별이는 한동안 시선을 떼지 못한다.`,
    };
    narrate(lines[best]);
    T2.acts += 1;
    F[best] = 1;
    const propObj = propMap.current.get(T2.id)?.obj;
    let r: { dur: number; sustained: boolean };
    switch (best) {
      case 'record': r = doRecord(); D.record = Math.max(0, D.record - 0.6); break;
      case 'rest': r = doRest(T2.id, propObj); D.rest = Math.max(0, D.rest - 0.7); T2.restedOnce = true; break; // 이 만남에서 쉼 완료
      case 'wonder': r = doWonder(); D.wonder = Math.max(0, D.wonder - 0.6); break;
      default: r = doObserve(); D.observe = Math.max(0, D.observe - 0.5); break;
    }
    return r;
  };
  // 다음 행동으로. 욕구가 충분히 풀렸거나 충분히 놀았으면 콤보 종료(떠남).
  const advanceCombo = (T2: ByeoliEncounter) => {
    // 3~6회 사이에서, 남은 욕구가 약하면 떠난다(각본 아니라 만족도로 끝남).
    if (shouldEndEncounter(T2, drives.current)) {
      rigRef.current?.stopInspect?.(); beginStanding(T2); return;
    }
    const r = chooseAndActByDrive(T2);
    T2.step = r.dur; T2.wasSustained = r.sustained;
  };
  const rainInAt = useRef(0);
  const lastKm = useRef(0);
  const lastPhase = useRef('');
  const gullSeen = useRef(false);
  const emit = (kind: PlanetEventKind, data?: PlanetEvent['data']) => {
    onEventRef.current?.({ kind, data, t: performance.now() });
    // BUILD 377: 머리 위 말풍선. 별똥별·달은 너무 자주 발생 → 말풍선 확률을 확 낮춰(도배 방지),
    //   드문 이벤트(나라·갈매기·비행기·배)는 떴을 때 잘 보이게 높게. 아이콘 풀은 원래 다양했다(빈도 쏠림이 문제였음).
    const BUBBLE: Partial<Record<PlanetEventKind, string>> = { flag: '🚩', shooting_star: '🌠', plane: '✈️', ship: '⛵', gull: '🕊', moon_phase: '🌙', ride_start: '☁️' };
    const BUBBLE_CHANCE: Partial<Record<PlanetEventKind, number>> = { shooting_star: 0.06, moon_phase: 0.05 }; // 자주 뜨는 것만 낮게
    const ic = BUBBLE[kind];
    if (ic && Math.random() < (BUBBLE_CHANCE[kind] ?? 0.5)) speak(ic, 0.9 + Math.random() * 0.3);
  };

  // 무거운 다이얼만 재건축을 부른다
  const buildKey = JSON.stringify([spec.theme, spec.radius, spec.relief, spec.wraps, spec.wobble, spec.moon.size, spec.roam ? 1 : 0]);

  // BUILD 212: 안개 다이얼은 유니폼 직행 — 재건축 없는 즉답 (지형·캐릭터 공유)
  useEffect(() => {
    if (RFOG_BASE.r < spec.radius * 0.5 || RFOG_BASE.r > spec.radius * 2) RFOG_BASE.r = spec.radius; // 재건축 전 임시 기준
    updateRFogBand(spec.fogLevel, spec.fogStrength);
    RFOG.color.set(PALETTE.fog);
    DAY_SKY.set(PALETTE.fog);
  }, [spec.radius, spec.fogLevel, spec.fogStrength, spec.theme]);

  type Built = {
    planet: THREE.Group; curve: THREE.CatmullRomCurve3; arcLen: number;
    crossings: { a: number; b: number }[]; R: number;
    moon: THREE.Mesh; moonLight: THREE.PointLight; sun: THREE.Mesh; sky: THREE.Group;
    surfaceR: (d: THREE.Vector3) => number; // BUILD 219: 단위방향 → 지형 반경 (배회의 발판)
  };
  const [built, setBuilt] = useState<Built | null>(null);
  useEffect(() => {
    let alive = true;
    const timer = setTimeout(() => {
      void (async () => {
        const s0 = JSON.parse(buildKey) as [PlanetSpec['theme'], number, number, number, number, number, number];
        const [themeName, R, relief, wraps, wobble, moonSize, roamF] = s0;
        const theme = THEMES[themeName];
        // 안개(211에서 수위 방향 반전, 212에서 유니폼화)는 위의 RFOG 이펙트가 관리한다.
        let heightAt: (d: THREE.Vector3) => number = (d) => hills(d) * 0.14 * relief;
        let map: THREE.Texture | null = null;
        let ready: THREE.Object3D | null = null;

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
          const boost = theme.boost * relief;
          for (let i = 0; i < pa.count; i += 1) {
            dv.set(pa.getX(i) - ctr.x, pa.getY(i) - ctr.y, pa.getZ(i) - ctr.z);
            const r = dv.length();
            const rb = 1 + (r / meanR - 1) * boost;
            dv.divideScalar(r);
            pa.setXYZ(i, dv.x * rb * R, dv.y * rb * R, dv.z * rb * R);
            radii.push({ dir: dv.clone(), off: rb * R - R });
          }
          heightAt = gridFromRadii(radii);
          geo2.computeVertexNormals();
          geo2.computeBoundingSphere();
          geo2.computeBoundingBox();
          const mesh = new THREE.Mesh(geo2, applyRadialFog(new THREE.MeshStandardMaterial({ map, roughness: 1, metalness: 0 }), 0.62));
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
          heightAt = (d) => sample(d) * theme.amp * relief;
        } else {
          map = makeDesertTexture();
        }
        if (!alive) return;

        // BUILD 227: 걷는 땅과 보이는 땅은 같은 격자에서 나와야 한다.
        // 지형 구는 정점 128×96을 heightAt으로 밀어 올리고 그 사이는 직선 보간 —
        // 걷기 높이를 텍스처 직샘플로 재면 굴곡이 클수록 그녀가 '수학의 산' 위에 뜬다(부양 4범).
        // 처방: 같은 정점 격자(three 구면 공식 그대로: x=-cosφ·sinθ)의 반경을 굽고 쌍선형 보간.
        const GSW = 128; const GSH = 96;
        let surfaceRFn: (d: THREE.Vector3) => number;
        if (theme.kind === 'meshworld') {
          surfaceRFn = (d) => R + heightAt(d); // gridFromRadii — 이미 정점 실측 기반
        } else {
          const rGrid = new Float32Array((GSW + 1) * (GSH + 1));
          const gd = new THREE.Vector3();
          for (let iy = 0; iy <= GSH; iy += 1) {
            const th2 = (iy / GSH) * Math.PI;
            for (let ix = 0; ix <= GSW; ix += 1) {
              const ph2 = (ix / GSW) * Math.PI * 2;
              gd.set(-Math.cos(ph2) * Math.sin(th2), Math.cos(th2), Math.sin(ph2) * Math.sin(th2));
              rGrid[iy * (GSW + 1) + ix] = R + heightAt(gd);
            }
          }
          surfaceRFn = (d) => {
            const th2 = Math.acos(THREE.MathUtils.clamp(d.y, -1, 1));
            let ph2 = Math.atan2(d.z, -d.x);
            if (ph2 < 0) ph2 += Math.PI * 2;
            const fx = (ph2 / (Math.PI * 2)) * GSW;
            const fy = (th2 / Math.PI) * GSH;
            const x0 = Math.min(GSW - 1, Math.floor(fx)); const y0 = Math.min(GSH - 1, Math.floor(fy));
            const tx = fx - x0; const ty = fy - y0;
            const g00 = rGrid[y0 * (GSW + 1) + x0]; const g10 = rGrid[y0 * (GSW + 1) + x0 + 1];
            const g01 = rGrid[(y0 + 1) * (GSW + 1) + x0]; const g11 = rGrid[(y0 + 1) * (GSW + 1) + x0 + 1];
            return (g00 * (1 - tx) + g10 * tx) * (1 - ty) + (g01 * (1 - tx) + g11 * tx) * ty;
          };
        }

        const planet = new THREE.Group();
        const N = 560;
        const pts: THREE.Vector3[] = [];
        for (let i = 0; i < N; i += 1) {
          const u = i / N;
          const phi = Math.PI * 2 * wraps * u;
          const theta = Math.PI / 2 + wobble * 0.62 * Math.sin(Math.PI * 2 * 3 * u + 0.7) + wobble * 0.21 * Math.sin(Math.PI * 2 * 7 * u + 2.1);
          const d = new THREE.Vector3(Math.sin(theta) * Math.cos(phi), Math.cos(theta), Math.sin(theta) * Math.sin(phi));
          pts.push(d.multiplyScalar(surfaceRFn(d) + 0.005));
        }
        const curve = new THREE.CatmullRomCurve3(pts, true, 'centripetal');
        curve.arcLengthDivisions = 1800;
        const arcLen = curve.getLength();
        // BUILD 215: 길의 평균 반경 실측 — 안개 수위의 0점
        {
          let acc = 0;
          const NS = 120;
          const pv = new THREE.Vector3();
          for (let i = 0; i < NS; i += 1) acc += curve.getPointAt(i / NS, pv).length();
          RFOG_BASE.r = acc / NS;
          updateRFogBand(specRef.current.fogLevel, specRef.current.fogStrength);
        }

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

        if (map && !roamF) map = bakeTrailOntoMap(map, curve, R); // BUILD 219: 지구본 모드는 길 자국을 남기지 않는다
        if (ready) {
          const mm = (ready as THREE.Mesh).material as THREE.MeshStandardMaterial;
          if (map) { mm.map = map; mm.needsUpdate = true; }
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
          const ground = new THREE.Mesh(geo, applyRadialFog(new THREE.MeshStandardMaterial({ map: map!, roughness: 1, metalness: 0 })));
          ground.receiveShadow = true;
          planet.add(ground);
          // BUILD 213: 구운 구름 껍질(cloudShell) 퇴역 — 자리는 비워둔다. 진짜 움직이는 구름이 올 때까지.
        }

        // 하늘의 식구들 — 스펙과 함께 다시 태어난다
        const sky = new THREE.Group();
        const moonMat = new THREE.MeshStandardMaterial({ color: '#c9c5bd', roughness: 1, metalness: 0, emissive: '#e8e4d8', emissiveIntensity: 0.08 }); // BUILD 218: 밤의 달 얼굴
        moonMat.fog = false;
        // BUILD 236: 달의 위상 — 태양-달 기하에서 저절로. 달이 태양 쪽이면 그믐, 반대면 보름.
        // 어두운 쪽도 6%는 남긴다(지구조) — 스스로 빛나기로 한 달(BUILD 218)의 예의.
        moonMat.onBeforeCompile = (shader) => {
          shader.uniforms.uMoonSun = { value: MOON_SUN };
          shader.vertexShader = shader.vertexShader
            .replace('#include <common>', '#include <common>\nvarying vec3 vMoonN;')
            .replace('#include <defaultnormal_vertex>', '#include <defaultnormal_vertex>\nvMoonN = normalize(mat3(modelMatrix) * objectNormal);');
          shader.fragmentShader = shader.fragmentShader
            .replace('#include <common>', '#include <common>\nvarying vec3 vMoonN;\nuniform vec3 uMoonSun;')
            .replace('#include <fog_fragment>', '#include <fog_fragment>\nfloat mph = smoothstep(-0.06, 0.32, dot(normalize(vMoonN), uMoonSun));\ngl_FragColor.rgb *= mix(0.06, 1.0, mph);');
        };
        moonMat.customProgramCacheKey = () => 'moonphase1';
        new THREE.TextureLoader().load('assets/planet/moon_color.jpg', (t) => {
          t.colorSpace = THREE.SRGBColorSpace;
          moonMat.map = t;
          moonMat.color.set('#ffffff');
          moonMat.needsUpdate = true;
        });
        const moon = new THREE.Mesh(new THREE.SphereGeometry(Math.max(0.2, moonSize * R), 48, 32), moonMat);
        const moonLight = new THREE.PointLight('#cfd8e0', 2.2, 0, 0.6);
        moon.add(moonLight);
        sky.add(moon);
        const sunMat = new THREE.MeshBasicMaterial({ color: '#ffedc8' });
        sunMat.fog = false;
        const sun = new THREE.Mesh(new THREE.SphereGeometry(R * 0.21, 24, 16), sunMat);
        sky.add(sun);

        setBuilt({ planet, curve, arcLen, crossings, R, moon, moonLight, sun, sky, surfaceR: surfaceRFn });
      })();
    }, 300);
    return () => { alive = false; clearTimeout(timer); };
  }, [buildKey]);

  const holder = useMemo(() => {
    const h = new THREE.Group();
    h.position.y = 0.012;
    h.rotation.y = Math.PI / 2;
    return h;
  }, []);
  const starRef = useRef<ReturnType<typeof createStarSky> | null>(null);
  useEffect(() => {
    starRef.current = createStarSky(scene, camera, () => emit('shooting_star'));
    return () => { starRef.current?.dispose(); starRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scene, camera]);
  const footDustRef = useRef<ReturnType<typeof createFootDust> | null>(null);
  useEffect(() => {
    if (!built) return undefined;
    footDustRef.current = createFootDust(built.planet); // BUILD 269: planet에 붙여 지형과 함께 돌게
    return () => { footDustRef.current?.dispose(); footDustRef.current = null; };
  }, [built]);
  const skyRef = useRef<ReturnType<typeof createPlanetSky> | null>(null);
  const lastRainAmt = useRef(-1);
  useEffect(() => {
    skyRef.current = createPlanetSky(scene, (g) => {
      g.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (!mesh.isMesh) return;
        (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).forEach((mm) => applyRadialFog(mm as THREE.MeshStandardMaterial));
      });
    });
    return () => { skyRef.current?.dispose(); skyRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scene]);
  const rabbitAI = useRef<ReturnType<typeof createMoonRabbit> | null>(null);
  const gullsRef = useRef<ReturnType<typeof createPlanetGulls> | null>(null);
  const vehiclesRef = useRef<ReturnType<typeof createPlanetVehicles> | null>(null);
  const cometRef = useRef<ReturnType<typeof createComet> | null>(null);
  const bubbleRoot = useMemo(() => new THREE.Group(), []);
  const bubbles = useRef<Bubble[]>([]);
  const speak = (icon?: string, pitch = 1) => {
    const target = holder; // 걷는 아이 홀더 위에
    if (bubbles.current.length >= 2) return;
    const b = makeBubble(target, 1.15, icon); // icon 없으면 웅얼웅얼 필기체 (본토 BUILD 175)
    bubbles.current.push(b);
    bubbleRoot.add(b.sprite);
    ambience.mumble?.(pitch);
  };
  const dlRef = useRef(1);
  useEffect(() => {
    if (!built) return undefined;
    let alive = true;
    // BUILD 239: 달의 토끼 — 로밍 AI (Vase가 재업로드한 6클립 Walk/Run/Jump/Eat/Wave/Idle).
    void loadKitModelWithClips('rabbitRoam', defaultLoader).then(({ group, animations }) => {
      if (!alive) return;
      const moonR = built.moon.geometry.boundingSphere?.radius ?? 1;
      rabbitAI.current = createMoonRabbit(built.moon, moonR, group, animations);
      // BUILD 258: 달토끼도 랜덤으로 랜턴을 든다 (달의 밤을 밝히며 로밍)
      if (Math.random() < 0.5) {
        let hand: THREE.Object3D | null = null;
        group.traverse((n) => { if ((n as THREE.Bone).isBone && /(RightHand|LeftHand|hand|paw)$/i.test(n.name) && !hand) hand = n; });
        if (hand) {
          const h = hand as THREE.Object3D;
          group.updateMatrixWorld(true);
          const ws = new THREE.Vector3(); h.getWorldScale(ws);
          const wrapper = new THREE.Group();
          wrapper.scale.setScalar(1 / Math.max(ws.x, 1e-6));
          h.add(wrapper);
          rabbitLanternRef.current = wrapper;
          void loadHandLanternAsset().then((lantern) => {
            if (!alive) return;
            lantern.position.y = -0.14;
            wrapper.add(lantern);
          }).catch(() => {});
        }
      }
    }).catch(() => {});
    // BUILD 236: 갈매기 — 해안이 있는 세계에만
    void loadKitModel('seagull', defaultLoader).then((proto) => {
      if (!alive) return;
      proto.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (!mesh.isMesh) return;
        (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).forEach((mm) => applyRadialFog(mm as THREE.MeshStandardMaterial));
      });
      gullsRef.current = createPlanetGulls(built.planet, built.R, built.surfaceR, proto, () => ambience.gullCry());
    }).catch(() => {});
    // BUILD 244: 탈것 — 육지 비행기 + 바다 배 (Vase). 비행기 proto 로드 후 모듈 생성.
    void loadKitModel('comet', defaultLoader).then((cometProto) => {
      if (!alive) return;
      cometRef.current = createComet(scene, camera, cometProto, () => { emit('comet'); speak('✨', 0.8); });
    }).catch(() => {});
    // BUILD 260: 텐트 눈확인용 — 에디터에서만, 캐릭터 앞쪽 지표에 하나 고정 배치 (캠프셋 만들기 전 미감 판정)
    void loadKitModel('planetPlane', defaultLoader).then((planeProto) => {
      if (!alive) return;
      planeProto.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (!mesh.isMesh) return;
        (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).forEach((mm) => applyRadialFog(mm as THREE.MeshStandardMaterial));
      });
      vehiclesRef.current = createPlanetVehicles(built.planet, built.R, built.surfaceR, planeProto, (kind) => emit(kind));
    }).catch(() => {
      // proto 실패해도 배는 저폴리로 — proto 없이 생성
      if (alive) vehiclesRef.current = createPlanetVehicles(built.planet, built.R, built.surfaceR, null, (kind) => emit(kind));
    });
    return () => {
      alive = false;
      rabbitAI.current?.dispose();
      rabbitAI.current = null;
      gullsRef.current?.dispose();
      gullsRef.current = null;
      vehiclesRef.current?.dispose();
      vehiclesRef.current = null;
      cometRef.current?.dispose();
      cometRef.current = null;
      bubbles.current.forEach((b) => bubbleRoot.remove(b.sprite));
      bubbles.current = [];
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [built]);
  const rigRef = useRef<WalkerRig | null>(null);
  useEffect(() => {
    let alive = true;
    rigRef.current = null;
    // BUILD 228: clear()는 펫·탈것까지 쓸어버렸다 — 이전 워커만 표적 제거
    if (walkerGroupRef.current) { liftGroup.remove(walkerGroupRef.current); walkerGroupRef.current = null; }
    if (!liftGroup.parent) holder.add(liftGroup);
    if (!bubbleRoot.parent) scene.add(bubbleRoot);
    void loadWalkerAsset(undefined, walkerIdx < 0 ? 'random' : walkerIdx).then(({ group, animations, clipSpeeds }) => {
      if (!alive) return;
      liftGroup.add(group);
      holder.updateMatrixWorld(true); // BUILD 228/230: 릭의 침하(rollingMin)가 쓰레기 행렬을 기억하지 않게 — 교체 침하 사건
      walkerGroupRef.current = group; // BUILD 224: 탈것 리프트가 이 그룹을 든다
      // BUILD 231: 본토 BUILD 140/142 그대로 — 구름은 골반 뼈를, 자루는 발 뼈를 추적한다
      hipsPRef.current = null;
      footPRef.current = null;
      footRRef.current = null;
      gazeHeadRef.current = null;
      gazeNeckRef.current = null;
      group.traverse((n) => {
        if (!hipsPRef.current && /hips$/i.test(n.name)) hipsPRef.current = n;
        if (!footPRef.current && /left.*foot$/i.test(n.name)) footPRef.current = n; // 왼발
        if (!footRRef.current && /right.*foot$/i.test(n.name)) footRRef.current = n; // 오른발
        if ((n as THREE.Bone).isBone && !gazeHeadRef.current && /head$/i.test(n.name)) gazeHeadRef.current = n;
        if ((n as THREE.Bone).isBone && !gazeNeckRef.current && /neck$/i.test(n.name)) gazeNeckRef.current = n;
      });
      // 왼발 못 찾으면(이름 체계 다름) 아무 foot이나
      if (!footPRef.current) group.traverse((n) => { if (!footPRef.current && /foot$/i.test(n.name)) footPRef.current = n; });
      // BUILD 212: 캐릭터도 안개에 잠긴다 — 본토 hfog를 행성 rfog로 갈아입힘
      group.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (!mesh.isMesh) return;
        (Array.isArray(mesh.material) ? mesh.material : [mesh.material])
          .forEach((mm) => applyRadialFog(mm as THREE.MeshStandardMaterial));
      });
      rigRef.current = (clipSpeeds ? createClipRig(group, animations, clipSpeeds, footsteps.step) : null)
        ?? createWalkerRig(group, animations, 0.72);
      // BUILD 387: 의자 앉기 폐기 — rig에 의자 자산 세팅 안 함. 앉기는 바닥 앉기(sitGround)만.
      //   (의자 소환 방식이 계속 뺑뺑이 유발 → 통째로 걷어냄. 훗날 필요하면 위치정합부터 처음 설계.)
      // BUILD 399: 랜턴이 안정적으로 달린 바로 그 오른손/손목 앵커를 카메라와 휴대폰도 공유한다.
      // 본의 월드 스케일만 상쇄하고 위치는 손목 원점에서 잡는다. 별도 scene 추적은 쓰지 않는다.
      let deviceHand: THREE.Object3D | null = null;
      group.traverse((n) => { if ((n as THREE.Bone).isBone && /RightHand$/i.test(n.name) && !deviceHand) deviceHand = n; });
      if (!deviceHand) group.traverse((n) => { if ((n as THREE.Bone).isBone && /LeftHand$/i.test(n.name) && !deviceHand) deviceHand = n; });
      if (deviceHand) {
        const h = deviceHand as THREE.Object3D;
        group.updateMatrixWorld(true);
        const ws = new THREE.Vector3();
        h.getWorldScale(ws);
        const invHandScale = 1 / Math.max(ws.x, 1e-6);
        const mountDevice = (kind: 'camera' | 'phone') => {
          const wrapper = new THREE.Group();
          wrapper.scale.setScalar(invHandScale);
          wrapper.visible = false;
          h.add(wrapper);
          if (kind === 'camera') {
            wrapper.position.set(0, -0.012, -0.008);
            wrapper.rotation.set(Math.PI / 2, 0, Math.PI);
            heldCameraRef.current = wrapper;
          } else {
            wrapper.position.set(0, -0.01, -0.004);
            wrapper.rotation.set(Math.PI / 2, 0, Math.PI / 2);
            heldPhoneRef.current = wrapper;
          }
          void loadHeldDeviceAsset(kind).then((device) => {
            if (!alive) return;
            // 랜턴의 손목 위치를 기준으로 손바닥 안쪽에 올린다.
            device.position.set(kind === 'camera' ? 0.015 : 0.01, kind === 'camera' ? -0.035 : -0.025, kind === 'camera' ? -0.02 : -0.012);
            wrapper.add(device);
          }).catch(() => { /* 소품이 없으면 동작만 유지 */ });
        };
        mountDevice('camera');
        mountDevice('phone');
      }
      // BUILD 258: 밤 랜턴 — 본토 방식(손 뼈 진자 매달기)을 행성 캐릭터에 이식. 랜덤으로 이 산책자가 든다.
      if (lanternOnRef.current) {
        let hand: THREE.Object3D | null = null;
        group.traverse((n) => { if ((n as THREE.Bone).isBone && /RightHand$/i.test(n.name) && !hand) hand = n; });
        if (!hand) group.traverse((n) => { if ((n as THREE.Bone).isBone && /LeftHand$/i.test(n.name) && !hand) hand = n; });
        if (!hand) group.traverse((n) => { if ((n as THREE.Bone).isBone && /hand/i.test(n.name) && !hand) hand = n; });
        if (hand) {
          const h = hand as THREE.Object3D;
          group.updateMatrixWorld(true);
          const ws = new THREE.Vector3(); h.getWorldScale(ws);
          const wrapper = new THREE.Group();
          wrapper.scale.setScalar(1 / Math.max(ws.x, 1e-6));
          wrapper.visible = false; // 밤에만 켠다 (프레임 루프에서 dl로 제어)
          h.add(wrapper);
          lanternRef.current = wrapper;
          void loadHandLanternAsset().then((lantern) => {
            if (!alive) return;
            lantern.position.y = -0.17;
            wrapper.add(lantern);
          }).catch(() => { /* 랜턴 없으면 조용히 */ });
        }
      }
    }).catch(() => { /* 조용한 행성 */ });
    return () => {
      alive = false;
      if (heldDeviceTimer.current !== null) window.clearTimeout(heldDeviceTimer.current);
      heldDeviceTimer.current = null;
      if (heldDeviceRootRef.current) scene.remove(heldDeviceRootRef.current);
      heldDeviceRootRef.current = null;
      heldDeviceHandRef.current = null;
      heldCameraRef.current = null;
      heldPhoneRef.current = null;
      gazeHeadRef.current = null;
      gazeNeckRef.current = null;
      gazeState.current = { mode: 'none', until: 0, next: 3, blend: 0 };
    };
  }, [holder, walkerIdx]);

  // BUILD 224: 반려 — 그녀 뒤를 종종종 따라오는 작은 식구
  useEffect(() => {
    const def = PET_ROSTER.find((x) => x.id === spec.pet);
    if (!def) { petRef.current = null; return undefined; }
    let alive = true;
    void loadPet(def).then((pet) => {
      if (!alive) return;
      pet.group.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (!mesh.isMesh) return;
        (Array.isArray(mesh.material) ? mesh.material : [mesh.material])
          .forEach((mm) => applyRadialFog(mm as THREE.MeshStandardMaterial));
      });
      holder.add(pet.group);
      petRef.current = { pet, d: new THREE.Vector3(), goal: new THREE.Vector3(), mode: 'idle', timer: 1, running: false, cur: null, t1: new THREE.Vector3(), t2: new THREE.Vector3(), q1: new THREE.Quaternion() };
      pet.idle?.play();
      petRef.current.cur = pet.idle;
    });
    return () => {
      alive = false;
      const cur = petRef.current;
      if (cur) holder.remove(cur.pet.group);
      petRef.current = null;
    };
  }, [holder, spec.pet]);

  useEffect(() => {
    ambience.apply({ kind: 'clear', wind: 0.28, rainAmount: 0, time: 'day', sea: 0, life: 0.5 });
    planetSound.startGrains(); // BUILD 223: 오르골 낟알 — 30초~1분에 한 알
    return () => planetSound.stopGrains();
  }, []);

  // BUILD 216: 표면 소품 v2 — 증분 동기화. 키보드 편집이 초당 수십 번 스펙을 바꿔도
  // 모델 재로드 없이 변환만 갱신한다. 앵커(up=dir) 안에 inner(yaw·tilt·scale)를 태우는 2단 구조.
  const propsKey = JSON.stringify(spec.props ?? []);
  const propsRoot = useRef<THREE.Group | null>(null);
  const propMap = useRef(new Map<string, { anchor: THREE.Group; obj: string; title: string; flag?: { v: number; base: number; dir: [number, number, number] } }>());
  useEffect(() => {
    if (!built) return undefined;
    const g = new THREE.Group();
    g.name = 'placedProps';
    built.planet.add(g);
    propsRoot.current = g;
    propMap.current.clear();
    return () => { built.planet.remove(g); propsRoot.current = null; propMap.current.clear(); };
  }, [built]);
  useEffect(() => {
    const g = propsRoot.current;
    if (!g || !built) return;
    const HOVER: Record<string, number> = { cloud: 2.4, 'cloud-dark': 2.7, windturbine: 1.7, moon: 3.2 };
    const UP = new THREE.Vector3(0, 1, 0);
    const applyXform = (anchor: THREE.Group, pr: PlanetProp) => {
      const dir = new THREE.Vector3(pr.dir[0], pr.dir[1], pr.dir[2]).normalize();
      anchor.quaternion.setFromUnitVectors(UP, dir);
      // BUILD 238: 소품은 '찍을 때의 반지름'(pr.r)이 아니라 '지금 이 방향의 실제 지표'에 앉는다.
      // 반지름 다이얼을 줄이면 지형은 재생성되는데 pr.r은 옛값이라 소품이 공중에 떴다(Vase 목격).
      const groundR = built ? built.surfaceR(dir) : pr.r;
      anchor.position.copy(dir).multiplyScalar(groundR - 0.02 + (HOVER[pr.obj] ?? 0) + (pr.lift ?? 0));
      const inner = anchor.children[0];
      if (inner) {
        inner.rotation.order = 'YXZ';
        inner.rotation.set(pr.tilt ?? 0, pr.rotY, 0);
        if (pr.obj !== 'flag') inner.scale.setScalar(pr.scale); // 깃발 스케일은 폽이 소유한다
      }
    };
    const list = JSON.parse(propsKey) as PlanetProp[];
    const seen = new Set(list.map((x) => x.id));
    for (const [id, rec] of propMap.current) {
      if (!seen.has(id)) { g.remove(rec.anchor); propMap.current.delete(id); }
    }
    const dressUp = (obj: THREE.Object3D) => obj.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.castShadow = true;
      (Array.isArray(mesh.material) ? mesh.material : [mesh.material])
        .forEach((mm) => applyRadialFog(mm as THREE.MeshStandardMaterial));
    });
    for (const pr of list) {
      const rec = propMap.current.get(pr.id);
      const title = pr.title ?? '';
      const sameLook = rec && rec.obj === pr.obj && (pr.obj !== 'flag' || rec.title === title);
      if (rec && sameLook) {
        rec.title = title;
        if (rec.flag) { rec.flag.base = pr.scale; rec.flag.dir = pr.dir; }
        applyXform(rec.anchor, pr);
        continue;
      }
      if (rec) { g.remove(rec.anchor); propMap.current.delete(pr.id); }
      const anchor = new THREE.Group();
      const newRec: { anchor: THREE.Group; obj: string; title: string; flag?: { v: number; base: number; dir: [number, number, number] } } = { anchor, obj: pr.obj, title };
      propMap.current.set(pr.id, newRec);
      g.add(anchor);
      applyXform(anchor, pr);
      if (pr.obj === 'flag') {
        // BUILD 221: 국기 깃발 — 제목이 나라 이름. 땅속에서 폽, 멀어지면 쇽.
        const obj = makeFlag(title);
        dressUp(obj);
        obj.scale.setScalar(0.001);
        anchor.add(obj);
        newRec.flag = { v: 0, base: pr.scale, dir: pr.dir };
        continue;
      }
      let seed = 7;
      for (const ch of pr.id) seed = (seed * 31 + ch.charCodeAt(0)) >>> 0;
      void createPropObject(pr.obj, seed || 7).then((obj) => {
        const cur = propMap.current.get(pr.id);
        if (!obj || !cur || cur.anchor !== anchor) return;
        dressUp(obj);
        anchor.add(obj);
        applyXform(anchor, pr);
      });
    }
  }, [built, propsKey]);

  // BUILD 216: pick — 화면을 찍으면 표면의 dir×r을 돌려준다 (배치·자리 다시 찍기의 눈)
  useEffect(() => {
    if (!apiRef) return undefined;
    apiRef.current = {
      capture: () => {
        try {
          gl.render(scene, camera); // 캡처 직전 한 프레임 강제 (preserveDrawingBuffer 보장)
          return gl.domElement.toDataURL('image/jpeg', 0.6);
        } catch { return null; }
      },
      // BUILD 254: 대형 이벤트 시연 — 카메라가 실제 보는 곳 정중앙에 크게 띄운다.
      // (이전엔 하늘 높이 el로 띄워 카메라가 지면을 볼 때 화면 밖이었다)
      demoComet: () => {
        const dir = new THREE.Vector3();
        camera.getWorldDirection(dir);
        // 카메라 정면 방향 자체를 궤도 중심으로 — 화면 한가운데를 가로지른다
        const az = Math.atan2(dir.z, dir.x);
        const el = Math.asin(THREE.MathUtils.clamp(dir.y, -0.3, 0.6)); // 카메라 실제 고도 따라감
        // eslint-disable-next-line no-console
        console.log('[demo] comet trigger, cometRef=', !!cometRef.current, 'az=', az.toFixed(2), 'el=', el.toFixed(2));
        cometRef.current?.triggerMajor(az, el, 18, 26); // BUILD 257: 속도 절반 (9→18초)
      },
      demoShower: () => {
        // eslint-disable-next-line no-console
        console.log('[demo] shower trigger, starRef=', !!starRef.current);
        starRef.current?.triggerShower(10); // BUILD 257: 시연 10초, 극단적으로 크게
      },
      pick: (cx: number, cy: number) => {
        if (!built) return null;
        const rect = gl.domElement.getBoundingClientRect();
        const nd = new THREE.Vector2(((cx - rect.left) / rect.width) * 2 - 1, -(((cy - rect.top) / rect.height) * 2 - 1));
        const rc = new THREE.Raycaster();
        rc.setFromCamera(nd, camera);
        const targets: THREE.Object3D[] = [];
        built.planet.traverse((o) => {
          const mesh = o as THREE.Mesh;
          if (!mesh.isMesh) return;
          let a: THREE.Object3D | null = o;
          while (a) { if (a.name === 'placedProps') return; a = a.parent; }
          targets.push(o);
        });
        const hits = rc.intersectObjects(targets, false);
        if (!hits.length) return null;
        const local = built.planet.worldToLocal(hits[0].point.clone());
        const r = local.length();
        const d = local.normalize();
        return { dir: [d.x, d.y, d.z] as [number, number, number], r };
      },
    };
    return () => { if (apiRef) apiRef.current = null; };
  }, [apiRef, built, camera, gl]);

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
    // BUILD 226: 시선의 카메라 — 가끔 물러나 지구본 전체를 바라본다. 인간극장의 시선.
    gaze: false, nextGaze: 50 + Math.random() * 60, gz: 0,
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

  const S = useRef(0);
  const firstFrame = useRef(true);
  const ang = useRef(0); // BUILD 246: 달 공전각 — 이제 worldTime()이 매 프레임 결정 (Math.random 제거)
  const spinAng = useRef(0); // BUILD 212: 조석고정 대비 추가 자전 누적각
  const dayAng = useRef(0);  // BUILD 214: 태양 공전각 (낮밤)
  const earState = useRef<'day' | 'night'>('day'); // BUILD 223: 귀의 낮밤 (히스테리시스)
  const pausedRef = useRef(paused);
  pausedRef.current = paused;
  // BUILD 224: 걷다, 뛰다, 날다 — 이동 상태기. 주기는 스펙 슬라이더가 정하고 나머지는 지가 알아서.
  const moveState = useRef({ mode: 'walk' as 'walk' | 'run' | 'ride', until: 0, nextRun: -1, nextRide: -1, rideStart: 0, rideStartS: 0, lift: 0, mount: null as THREE.Group | null, babyMount: null as THREE.Group | null, mountKind: '' });
  const walkerGroupRef = useRef<THREE.Group | null>(null);
  const lanternRef = useRef<THREE.Group | null>(null); // BUILD 258: 캐릭터 손 랜턴 (밤 랜덤)
  const lanternOnRef = useRef<boolean>(Math.random() < 0.5); // 이 산책자가 랜턴을 드는가 (랜덤)
  const rabbitLanternRef = useRef<THREE.Group | null>(null); // 달토끼 랜턴
  const hipsPRef = useRef<THREE.Object3D | null>(null); // BUILD 231(본토 140): 골반 뼈
  const footPRef = useRef<THREE.Object3D | null>(null); // BUILD 231(본토 142): 발 뼈 (왼발)
  const footRRef = useRef<THREE.Object3D | null>(null); // BUILD 275: 오른발 뼈
  // BUILD 399: 별이의 눈 — 머리/목이 실제 관심 대상을 먼저 따라간다.
  const gazeHeadRef = useRef<THREE.Object3D | null>(null);
  const gazeNeckRef = useRef<THREE.Object3D | null>(null);
  const gazeState = useRef({ mode: 'none' as 'none' | 'prop' | 'pet' | 'sky', until: 0, next: 3, blend: 0 });
  // BUILD 230: 부양의 진범 — 리프트가 릭 소유의 루트 y(침하 시스템의 자리)를 매 프레임 덮어썼다.
  // 릭의 침하는 기억 기반이라 밟히면 발이 클립 여유고만큼 영구히 뜬다. 리프트는 별도 부모로 분리.
  const liftGroup = useMemo(() => new THREE.Group(), []);
  const petRef = useRef<{ pet: LoadedPet; d: THREE.Vector3; goal: THREE.Vector3; mode: 'idle' | 'wander' | 'chase' | 'trick'; timer: number; running: boolean; cur: THREE.AnimationAction | null; t1: THREE.Vector3; t2: THREE.Vector3; q1: THREE.Quaternion } | null>(null);
  const dirLightRef = useRef<THREE.DirectionalLight>(null);
  const hemiRef = useRef<THREE.HemisphereLight>(null);
  // BUILD 282: 체류(linger)를 1급 상태로 승격 — 별리는 걷는 게 아니라 이 별을 즐긴다.
  // lingerLeft: 이번 체류에서 앞으로 할 딴짓 개수(다 쓰면 다음 지점으로 짧게 이동)
  // gap: 딴짓과 딴짓 사이 '가만히 있는' 여백 타이머(그냥 서서 별 보는 시간)
  // walkLeft: 이동 구간에 남은 시간(짧게만 걷는다)
  const walk = useRef({ phase: 'walk' as 'walk' | 'ponder' | 'memory' | 'linger', timer: 0, jumpTo: -1, cooldown: 0, memCooldown: 0, lingerLeft: 0, gap: 0, walkLeft: 0 });
  const roamRef = useRef<{ d: THREE.Vector3; T: THREE.Vector3 } | null>(null); // BUILD 219: 배회자의 현재 방향·진행
  useEffect(() => { roamRef.current = null; }, [built, spec.roam]);
  // BUILD 370: 끌림(attraction) — 별이가 규칙표가 아니라 '끌림'으로 움직인다.
  //   ⚠️ 오브젝트는 하드코딩하지 않는다. Vase가 에디터에서 놓은 정식 소품(SP.props)을 감지한다.
  //   그래야 리스트에 뜨고, 옮기고, 지울 수 있다. 별이는 props를 '어포던스 있는 것'으로 읽을 뿐.
  //   문제 시 ATTRACT_ON=false로 즉시 원복.
  const ATTRACT_ON = true;
  // ★ BUILD 381: 성향 기반으로 전환 — 각본(고정 콤보)을 버린다.
  // BUILD 389: 욕구의 값·자극표·점수 계산은 순수 모듈 byeoliDrive.ts가 소유한다.
  const drives = useRef({ ...INITIAL_DRIVES });
  const driveFatigue = useRef({ ...INITIAL_FATIGUE });
  const attractCooldown = useRef(new Map<string, number>());
  // BUILD 381: 성향 목표 — 큐(각본) 없음. 소품 곁에 머물며 별이가 욕구로 행동을 하나씩 스스로 고른다.
  //   acts=이번 만남에서 한 행동 수(적당히 하면 떠남), sustained/rising=지속자세(앉기·기대기) 처리.
  const attractTarget = useRef<ByeoliEncounter | null>(null);
  const tmp = useMemo(() => ({
    p: new THREE.Vector3(), T: new THREE.Vector3(), U: new THREE.Vector3(),
    F: new THREE.Vector3(), Z: new THREE.Vector3(), M: new THREE.Matrix4(), Q: new THREE.Quaternion(),
    v: new THREE.Vector3(), at: new THREE.Vector3(),
  }), []);
  useFrame((state, rawDt) => {
    if (!built) return;
    const dt = Math.min(0.05, rawDt); // 헌법 3조
    const SP = specRef.current;
    const P = walk.current;
    P.cooldown = Math.max(0, P.cooldown - dt);
    P.memCooldown = Math.max(0, P.memCooldown - dt);
    if (attractCooldown.current.size) { // BUILD 370: 소품별 끌림 쿨다운 tick
      for (const [k, val] of attractCooldown.current) {
        const nv = val - dt;
        if (nv <= 0) attractCooldown.current.delete(k); else attractCooldown.current.set(k, nv);
      }
    }
    // BUILD 389: 욕구 증가와 행동 피로 회복은 순수 빠른 뇌 모듈이 계산한다.
    tickDrives(drives.current, driveFatigue.current, dt);
    let moving = true;
    // BUILD 224: 이동 상태기 — 지가 걷다 뛰다 탈것 탔다가 내렸다가
    const MV = moveState.current;
    const el = state.clock.elapsedTime;
    const runEvery = SP.runEvery ?? 45;
    const rideEvery = SP.rideEvery ?? 120;
    // BUILD 282: 체류 슬라이더 — Vase가 에디터에서 조절. 이동시간(짧게)과 체류 길이 배율.
    // BUILD 386: 체류 슬라이더(lingerEvery/lingerLength) 폐기 — 이제 별이 성향(욕구)이 리듬을 만든다.
    //   nextWalkLeft는 linger 후 '조금 걷고 다시 판정'하는 짧은 간격만 제공(강제 아님).
    const lingerLen = 1; // 잔존 참조 호환용 상수(더는 슬라이더 아님)
    const nextWalkLeft = () => 1.5 + Math.random() * 2.0; // linger 후 짧게 걷는 간격
    if (MV.nextRun < 0) { MV.nextRun = el + 14 + Math.random() * 18; MV.nextRide = el + 35 + Math.random() * 45; }
    if (!pausedRef.current && MV.mode === 'walk' && P.phase === 'walk') {
      if (rideEvery > 0 && el >= MV.nextRide && !rigRef.current?.setRiding) {
        MV.nextRide = el + 40; // 이 아이는 앉을 줄 모른다 — 본토도 절차 릭은 태우지 않았다 (공중 걷기 사건)
      } else if (rideEvery > 0 && el >= MV.nextRide) {
        MV.mode = 'ride';
        MV.rideStart = el;
        MV.rideStartS = S.current;
        MV.until = el + 12 + Math.random() * 10;
        rigRef.current?.setRiding?.(true);
        MV.mountKind = Math.random() < 0.35 ? 'broom' : 'cloud';
        emit('ride_start', { kind: MV.mountKind });
        if (MV.mountKind === 'cloud') {
          const c = makeCloudPuff(() => Math.random(), 0.13); // 본토 정답 (BUILD 137)
          c.traverse((o) => { const mesh = o as THREE.Mesh; if (mesh.isMesh) (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).forEach((mm) => applyRadialFog(mm as THREE.MeshStandardMaterial)); });
          holder.add(c);
          MV.mount = c;
          if (petRef.current) {
            // BUILD 225: 본토 판례(BUILD 141) — 펫에겐 아기구름을 내어준다
            const bc = makeCloudPuff(() => Math.random(), 0.075); // 본토 아기 구름 정답
            bc.traverse((o) => { const mesh = o as THREE.Mesh; if (mesh.isMesh) (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).forEach((mm) => applyRadialFog(mm as THREE.MeshStandardMaterial)); });
            holder.add(bc);
            MV.babyMount = bc;
          }
        } else {
          void loadKitModel('broom', defaultLoader).then((g2) => {
            if (moveState.current.mode !== 'ride' || moveState.current.mount) { return; }
            g2.traverse((o) => { const mesh = o as THREE.Mesh; if (mesh.isMesh) (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).forEach((mm) => applyRadialFog(mm as THREE.MeshStandardMaterial)); });
            // 본토 BUILD 145: 장축은 원래 +Z(자루 앞) — 비틀지 않는다. 코만 살짝 들고 자루 중심 정렬.
            g2.rotation.x = -0.09;
            g2.updateMatrixWorld(true);
            const bb = new THREE.Box3().setFromObject(g2);
            const bcm = bb.getCenter(new THREE.Vector3());
            g2.position.x -= bcm.x; g2.position.z -= bcm.z; g2.position.y -= bcm.y;
            const wrap = new THREE.Group();
            wrap.add(g2);
            holder.add(wrap);
            moveState.current.mount = wrap;
          });
        }
      } else if (runEvery > 0 && el >= MV.nextRun) {
        MV.mode = 'run';
        MV.until = el + 6 + Math.random() * 6;
      }
    }
    if (MV.mode === 'run' && el >= MV.until) {
      MV.mode = 'walk';
      MV.nextRun = el + runEvery * (0.7 + Math.random() * 0.6);
    }
    // BUILD 227: 투명 빗자루 보험 — 마운트가 2초 내 안 오면 구름으로 갈아탄다
    if (MV.mode === 'ride' && !MV.mount && el > MV.rideStart + 2) {
      const c = makeCloudPuff(() => Math.random(), 0.13); // 본토 정답 (BUILD 137)
      c.traverse((o) => { const mesh = o as THREE.Mesh; if (mesh.isMesh) (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).forEach((mm) => applyRadialFog(mm as THREE.MeshStandardMaterial)); });
      holder.add(c);
      MV.mount = c;
      MV.mountKind = 'cloud';
    }
    const liftTarget = MV.mode === 'ride' && el < MV.until ? 1.15 : 0;
    MV.lift += (liftTarget - MV.lift) * Math.min(1, dt * 1.7);
    if (MV.mode === 'ride' && el >= MV.until && MV.lift < 0.04) {
      const meters = Math.round(Math.abs(S.current - (MV.rideStartS ?? S.current)) * 10);
      emit('ride_end', { kind: MV.mountKind, meters });
      MV.mode = 'walk';
      rigRef.current?.setRiding?.(false);
      if (MV.mount) { holder.remove(MV.mount); MV.mount = null; }
      if (MV.babyMount) { holder.remove(MV.babyMount); MV.babyMount = null; }
      MV.nextRide = el + Math.max(30, rideEvery * (0.75 + Math.random() * 0.5));
      MV.nextRun = Math.max(MV.nextRun, el + 8);
    }
    const spdMul = MV.mode === 'ride' ? 2.6 : MV.mode === 'run' ? 2.3 : 1;
    liftGroup.position.y = MV.lift; // BUILD 230: 릭의 땅은 릭이 소유한다
    // BUILD 231: 탈것 높이는 본토 원문 그대로 — 상수 추정 대신 뼈 실측 (본토 140/142/147)
    const seatH = rigRef.current?.rideSeat?.() ?? 0;
    let mountY = MV.lift + seatH - (MV.mountKind === 'broom' ? 0.05 : 0.07); // 본토 최후 폴백
    if (seatH > 0 && hipsPRef.current) {
      hipsPRef.current.getWorldPosition(MNT_V);
      holder.worldToLocal(MNT_V);
      mountY = MNT_V.y - (MV.mountKind === 'broom' ? 0.10 : 0.17); // 앉는 아이: 골반 바로 아래 (본토 147/140)
    } else if (seatH === 0 && footPRef.current) {
      footPRef.current.getWorldPosition(MNT_V);
      holder.worldToLocal(MNT_V);
      mountY = MNT_V.y - (MV.mountKind === 'broom' ? 0.1 : 0.095); // 서는 아이: 발 뼈 실측 (본토 142)
    }
    if (MV.mount) {
      MV.mount.position.set(Math.sin(el * 0.53 + 1) * 0.02, mountY + Math.sin(el * 1.3) * 0.012, Math.cos(el * 0.61) * 0.02);
      if (MV.mountKind === 'cloud') MV.mount.rotation.y += dt * 0.12;
      else { MV.mount.rotation.z = Math.sin(el * 1.1) * 0.05; MV.mount.rotation.x = Math.sin(el * 0.8 + 1) * 0.04; } // 파도를 타듯 (본토 BUILD 144)
    }
    if (MV.babyMount) {
      // BUILD 231: 아기구름은 본토 원문 — 몸 기준(-0.02) 스프링 추적(lerp dt·2.5), 좌석 기준이 아니다
      MNT_V.set(0.42 + Math.sin(el * 0.4) * 0.06, MV.lift - 0.02 + Math.sin(el * 1.1 + 3) * 0.035, 0);
      MV.babyMount.position.lerp(MNT_V, Math.min(1, dt * 2.5));
      MV.babyMount.rotation.y += dt * 0.2;
    }
    if (pausedRef.current) moving = false;
    if (pausedRef.current) {
      // BUILD 224: 정지 — 시간이 멈춘 지구본. 찍기의 평화.
    } else if (P.phase === 'linger') {
      // BUILD 282: 체류 — 한 자리에 머물며 딴짓과 '가만히'를 번갈아 한다. 이게 별리의 기본 상태.
      moving = false;
      P.timer -= dt;
      P.gap -= dt;
      // 여백(가만히 서서 별 보는 시간)이 끝나면 다음 딴짓을 꺼낸다
      if (P.gap <= 0 && P.lingerLeft > 0) {
        const dur = rigRef.current?.flourish?.() ?? 0;
        // BUILD 284: 딴짓할 때 가끔 머리 위로 웅얼웅얼(무언어 말풍선). 본토 speak 재사용.
        //   대부분은 아이콘 없는 웅얼거림, 아주 가끔 절제된 아이콘(♪ 콧노래 · ~ 느긋 · ! 발견).
        if (Math.random() < 0.4) {
          const r = Math.random();
          // BUILD 374: 아이콘 풀 확대 — 같은 것만 반복되던 문제. 대부분은 무언(undefined), 나머지를 다양하게.
          const ICONS = ['♪', '♫', '~', '!', '?', '…', '★', '☀', '☁', '❀', '✎', '♥'];
          const icon = r < 0.7 ? undefined : ICONS[Math.floor(Math.random() * ICONS.length)];
          speak(icon, 0.85 + Math.random() * 0.35);
        }
        P.lingerLeft -= 1;
        // 딴짓 하나 + 그 뒤 '가만히' 여백. 관조가 삼바보다 별리답다. lingerLength가 크면 여백도 길어진다.
        P.gap = (dur > 0 ? dur : 1.4) + (1.4 + Math.random() * 2.8) * lingerLen;
      }
      // 딴짓을 다 썼고 마지막 여백도 지나면 → 다음 볼거리로 '짧게' 이동
      if (P.lingerLeft <= 0 && P.gap <= 0) {
        if (SP.roam && roamRef.current) {
          // 새 방향으로 마음이 기운다 — 다음 지점을 향해 한 번 크게 튼다
          const turn = (Math.random() < 0.5 ? -1 : 1) * (0.5 + Math.random() * 2.2);
          roamRef.current.T.applyQuaternion(tmp.Q.setFromAxisAngle(roamRef.current.d, turn));
        }
        P.phase = 'walk';
        P.walkLeft = nextWalkLeft(); // 다음 지점까지만 — 짧게 걷는다 (lingerEvery로 조절)
        P.jumpTo = -1;
        P.cooldown = 0.4;
      }
    } else if (P.phase !== 'walk') {
      moving = false;
      P.timer -= dt;
      if (P.timer <= 0) {
        if (P.phase === 'memory') { onMemRef.current?.(null); P.memCooldown = 6; }
        if (P.phase === 'ponder' && SP.roam && roamRef.current) {
          // 멈춰 섰다 일어나면 마음이 바뀐다 — 크게 한 번 튼다
          const turn = (Math.random() < 0.5 ? -1 : 1) * (0.6 + Math.random() * 1.8);
          roamRef.current.T.applyQuaternion(tmp.Q.setFromAxisAngle(roamRef.current.d, turn));
        }
        if (P.phase === 'ponder' && P.jumpTo >= 0) S.current = P.jumpTo;
        // BUILD 282: 기억/사색을 마치면 잠깐만 걷다 다시 체류로 — roam은 강제 도보(8초)를 걸지 않는다.
        P.phase = 'walk';
        P.jumpTo = -1;
        P.cooldown = SP.roam ? 0.4 : 8;
        if (SP.roam) P.walkLeft = nextWalkLeft();
      }
    } else if (SP.roam) {
      // BUILD 386: 소품 없을 때의 딴짓도 별이 선택 — 타이머 강제(lingerEvery) 폐기.
      //   걷다가 관찰 욕구가 충분히 차오르면 스스로 멈춰 주변을 본다(소품 없어도 하늘·땅·풍경 관찰).
      //   관찰하면 욕구 해소 → 다시 걷다 또 차오르면 멈춤. 욕구가 리듬을 만든다. 소품에 끌렸으면 성향 뇌가 전담.
      if (MV.mode === 'walk' && P.phase === 'walk' && P.cooldown <= 0 && !attractTarget.current) {
        const D = drives.current;
        // 관찰 욕구가 높을수록 멈출 확률↑(비선형). 걷는 동안 조금씩 판정.
        if (D.observe > 0.55 && Math.random() < D.observe * D.observe * dt * 0.6) {
          P.phase = 'linger';
          P.lingerLeft = 1 + (D.observe > 0.8 ? 1 : 0); // 욕구 크면 한 번 더
          P.gap = 0.4 + Math.random() * 0.8;
          P.timer = 0; P.jumpTo = -1;
          D.observe = Math.max(0, D.observe - 0.45); // 관찰 욕구 해소
          if (Math.random() < 0.25) byeoliShot('mood');
        }
      }
    } else {
      S.current += SP.walkSpeed * spdMul * dt;
      const sm = ((S.current % built.arcLen) + built.arcLen) % built.arcLen;
      // 기억이 먼저 — 그 자리에 서서 문장을 읽는다
      if (P.memCooldown <= 0) {
        for (const m of SP.memories) {
          if (Math.abs(sm - m.t * built.arcLen) < 0.1) {
            P.phase = 'memory';
            P.timer = Math.max(1, m.stay);
            onMemRef.current?.(m);
            break;
          }
        }
      }
      if (P.phase === 'walk' && P.cooldown <= 0) {
        for (const c2 of built.crossings) {
          const nearA = Math.abs(sm - c2.a) < 0.1;
          const nearB = Math.abs(sm - c2.b) < 0.1;
          if (!nearA && !nearB) continue;
          P.phase = 'ponder';
          P.timer = 1.1 + Math.random() * 1.1;
          P.jumpTo = Math.random() < SP.ponderChance ? (nearA ? c2.b + (sm - c2.a) : c2.a + (sm - c2.b)) : -1;
          break;
        }
      }
    }
    const { p, T, U, F: Fw, Z, M, Q, v } = tmp;
    if (SP.roam) {
      // BUILD 219: 자유 배회 — 접점 d와 진행 T를 구면 위에서 직접 민다. 곡선은 출발점만 빌려준다.
      if (!roamRef.current) {
        const d0 = built.curve.getPointAt(0, new THREE.Vector3()).normalize();
        const t0 = built.curve.getTangentAt(0, new THREE.Vector3());
        t0.addScaledVector(d0, -t0.dot(d0)).normalize();
        roamRef.current = { d: d0, T: t0 };
      }
      const RM = roamRef.current;
      // BUILD 374: 끌림 — Vase가 에디터에서 놓은 소품(SP.props) 중 어포던스 있는 것에 다가가 '장면(콤보)'을 편다.
      //   구조: [탐색·접근]은 걷는 중에만, [콤보 진행]은 도착 후 phase와 무관하게 매 프레임.
      //   ★ 이전 버그: 도착 시 phase를 linger로 바꿔 끌림 블록(walk 전용)에 다시 못 들어와 콤보가 멈췄다.
      //     → 이제 도착해도 phase는 walk 유지, comboActive 플래그로 이동만 멈춘다. 콤보 진행은 아래 별도 블록.
      const T2 = attractTarget.current;
      // [A] 탐색·접근 — 아직 목표에 도착 전이고, 걷는 중일 때만.
      if (ATTRACT_ON && MV.mode === 'walk' && !(T2 && T2.arrived) && (SP.props?.length ?? 0) > 0) {
        if (!T2) {
          // 목표 없음 → 반경 내 후보 점수화 → 가중 랜덤 하나(변덕·사색).
          const cands: { d: THREE.Vector3; id: string; radius: number; score: number }[] = [];
          for (const pr of SP.props) {
            const stim = PROP_STIMULUS[pr.obj];
            if (!stim) continue;
            if ((attractCooldown.current.get(pr.id) ?? 0) > 0) continue;
            const pd = new THREE.Vector3(pr.dir[0], pr.dir[1], pr.dir[2]).normalize();
            const ang = Math.acos(THREE.MathUtils.clamp(RM.d.dot(pd), -1, 1));
            if (ang > stim.radius) continue;
            // 거리 감쇠 — atten이 클수록 가까이서만 끌린다(심즈식 방송 세기).
            const nearness = Math.pow(1 - ang / stim.radius, stim.atten);
            const score = scorePropAttraction(nearness, drives.current, driveFatigue.current, stim.stir);
            cands.push({ d: pd, id: pr.id, radius: stim.radius, score });
          }
          if (cands.length && P.phase === 'walk') {
            const total = cands.reduce((s, c) => s + c.score, 0);
            let r = Math.random() * total; let pick = cands[0];
            for (const c of cands) { r -= c.score; if (r <= 0) { pick = c; break; } }
            attractTarget.current = createEncounter(pick.d, pick.id, pick.radius);
            narrate(`별이는 ${propNarrationName(pick.id)} 쪽으로 천천히 발걸음을 옮겼다.`);
          }
        } else {
          const stillValid = SP.props.some((pr) => pr.id === T2.id);
          if (!stillValid) { attractTarget.current = null; } // 에디터에서 삭제됨 → 놓는다
          else {
            const ang = Math.acos(THREE.MathUtils.clamp(RM.d.dot(T2.d), -1, 1));
            const targetProp = SP.props.find((pr) => pr.id === T2.id);
            const arrivalAngleByObject: Record<string, number> = {
              book: 0.034,
              'rock-small': 0.034,
              chair: 0.042,
              tree: 0.055,
              'rock-big': 0.06,
              lighthouse: 0.085,
            };
            const arrivalAngle = arrivalAngleByObject[targetProp?.obj ?? ''] ?? 0.05;
            if (ang < arrivalAngle) {
              // BUILD 395: 책·작은 물건은 손 닿을 만큼 가까이, 큰 구조물은 적당한 감상 거리를 둔다.
              // 도착 — 소품을 바라보게 몸을 돌린다(등지고 딴 데 보는 것 방지). 그다음 욕구로 행동 선택.
              // 별이 위치 d에서 소품 d로 향하는 접선 방향으로 T를 정렬.
              const face = tmp.at.copy(T2.d).addScaledVector(RM.d, -T2.d.dot(RM.d));
              if (face.lengthSq() > 1e-6) { RM.T.copy(face.normalize()); }
              T2.arrived = true;
              const r = chooseAndActByDrive(T2); T2.step = r.dur; T2.wasSustained = r.sustained;
            } else if (moving) {
              // 접근 — 진행방향 T를 목표로 슬며시 튼다.
              const toTarget = tmp.at.copy(T2.d).addScaledVector(RM.d, -T2.d.dot(RM.d)).normalize();
              const pull = (1 - ang / T2.radius) * 2.2 * dt;
              RM.T.lerp(toTarget, THREE.MathUtils.clamp(pull, 0, 0.5)).normalize();
              RM.T.addScaledVector(RM.d, -RM.T.dot(RM.d)).normalize();
            }
          }
        }
      }
      // [B] 콤보 진행 — 도착한 목표가 있으면 phase 무관하게 매 프레임. 이동 정지.
      //   ★ BUILD 378: '앉았다 바로 일어남' 해결. 지속자세(앉기·기대기)는 step 시간만큼 확실히 머무른 뒤,
      //     일어서기(rising) 단계를 따로 거쳐 다음 토큰과 겹치지 않게 한다. 매 토큰 stopInspect 남발 제거.
      if (ATTRACT_ON && T2 && T2.arrived) {
        moving = false; // 콤보 도는 동안 별이는 제자리(장면을 편다)
        T2.step -= dt;
        if (T2.standing) {
          // 콤보 전체 종료 대기 — 마지막 일어서기 완료 후 걷기.
          if (T2.step <= 0) {
            attractCooldown.current.set(T2.id, 25); // 방금 논 소품 25초 억제(반복 방지)
            narrate(`별이는 ${propNarrationName(T2.id)} 곁에 충분히 머문 뒤, 다시 길을 나섰다.`);
            attractTarget.current = null;
          }
        } else if (T2.rising) {
          // 일어서는 중 — 이 시간이 끝나야 다음 토큰. (앉기→다음 사이 겹침 방지)
          if (T2.step <= 0) {
            T2.rising = false;
            advanceCombo(T2); // 다음 토큰으로
          }
        } else if (T2.step <= 0) {
          // 현재 동작의 체류 시간이 끝났다. 지속자세(앉기·기대기)였으면 일어서기 단계를 거친다.
          if (T2.wasSustained) {
            rigRef.current?.stopInspect?.(); // 일어서기 시작
            beginRising(T2); // 일어서는 데 걸리는 시간(그동안 다음 토큰 안 함)
          } else {
            advanceCombo(T2); // 순간동작(관찰·적기 등)은 바로 다음
          }
        }
      }
      if (moving) {
        // 마음의 바람 — 진행방향이 천천히 흔들린다
        RM.T.applyQuaternion(Q.setFromAxisAngle(RM.d, wanderNoise(state.clock.elapsedTime * 0.16) * 0.5 * dt));
        const rS = built.surfaceR(RM.d);
        const th = (SP.walkSpeed * spdMul * dt) / Math.max(1, rS);
        v.crossVectors(RM.d, RM.T).normalize();
        Q.setFromAxisAngle(v, th);
        RM.d.applyQuaternion(Q).normalize();
        RM.T.applyQuaternion(Q);
        RM.T.addScaledVector(RM.d, -RM.T.dot(RM.d)).normalize();
      }
      p.copy(RM.d).multiplyScalar(built.surfaceR(RM.d) + 0.005);
      T.copy(RM.T);
    } else {
      const t = ((S.current / built.arcLen) % 1 + 1) % 1;
      built.curve.getPointAt(t, p);
      built.curve.getTangentAt(t, T);
    }
    // BUILD 220: 우연의 이벤트 — 이야기가 적힌 소품 곁을 지나면 폽. 배회든 길이든.
    if (P.phase === 'walk' && MV.mode === 'walk' && !pausedRef.current && P.memCooldown <= 0 && (SP.props?.length ?? 0) > 0) {
      v.copy(p).normalize();
      for (const pr of SP.props) {
        if (!pr.title && !pr.text) continue;
        const cosA = Math.min(1, Math.max(-1, v.x * pr.dir[0] + v.y * pr.dir[1] + v.z * pr.dir[2]));
        if (Math.acos(cosA) * p.length() < 1.15) {
          P.phase = 'memory';
          P.timer = 4;
          onMemRef.current?.({ title: pr.title ?? '…', text: pr.text ?? '', t: 0, stay: 4 });
          break;
        }
      }
    }
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
    rigRef.current?.update(dt, MV.mode === 'run' ? 0.9 : 0.5, moving, state.clock.elapsedTime, moving ? SP.walkSpeed * spdMul * dt : 0);
    // BUILD 399: 별이의 눈. 접근 목표는 걷기 전부터 보고, 목표가 없을 때는 가끔 반려동물이나 하늘을 본다.
    {
      const gazeBone = gazeHeadRef.current ?? gazeNeckRef.current;
      const GS = gazeState.current;
      let gazeTarget: THREE.Vector3 | null = null;
      const encounter = attractTarget.current;
      if (encounter) {
        const rec = propMap.current.get(encounter.id);
        if (rec) {
          gazeTarget = new THREE.Vector3();
          rec.anchor.getWorldPosition(gazeTarget);
          GS.mode = 'prop';
          GS.until = el + 0.4;
        }
      } else {
        if (el >= GS.next && el >= GS.until) {
          const canSeePet = !!petRef.current;
          GS.mode = canSeePet && Math.random() < 0.48 ? 'pet' : 'sky';
          GS.until = el + 2.2 + Math.random() * 3.2;
          GS.next = GS.until + 5 + Math.random() * 9;
          if (GS.mode === 'sky') narrate('별이는 문득 하늘을 올려다보았다.', 2500);
        }
        if (el < GS.until && GS.mode === 'pet' && petRef.current) {
          gazeTarget = new THREE.Vector3();
          petRef.current.pet.group.getWorldPosition(gazeTarget);
          gazeTarget.y += 0.12;
        } else if (el < GS.until && GS.mode === 'sky' && gazeBone) {
          gazeTarget = new THREE.Vector3();
          gazeBone.getWorldPosition(gazeTarget);
          gazeTarget.add(new THREE.Vector3(0.25, 3.2, -0.8));
        } else if (el >= GS.until) {
          GS.mode = 'none';
        }
      }
      if (gazeBone && walkerGroupRef.current && gazeTarget) {
        const headWorld = new THREE.Vector3();
        gazeBone.getWorldPosition(headWorld);
        const localDir = gazeTarget.sub(headWorld);
        const groupQ = new THREE.Quaternion();
        walkerGroupRef.current.getWorldQuaternion(groupQ);
        localDir.applyQuaternion(groupQ.invert()).normalize();
        const yaw = THREE.MathUtils.clamp(Math.atan2(localDir.x, localDir.z), -0.65, 0.65);
        const pitch = THREE.MathUtils.clamp(-Math.atan2(localDir.y, Math.hypot(localDir.x, localDir.z)), -0.34, 0.30);
        GS.blend += (1 - GS.blend) * Math.min(1, dt * 4.5);
        const qYaw = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw * 0.42 * GS.blend);
        const qPitch = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), pitch * 0.36 * GS.blend);
        gazeBone.quaternion.multiply(qYaw).multiply(qPitch);
      } else {
        GS.blend += (0 - GS.blend) * Math.min(1, dt * 3.5);
      }
    }
    // BUILD 398의 월드 추적은 폐기. 손 소품은 랜턴과 같은 손목 본의 자식으로 움직인다.
    const heldHand = heldDeviceHandRef.current;
    const heldRoot = heldDeviceRootRef.current;
    if (heldHand && heldRoot) {
      heldHand.getWorldPosition(heldRoot.position);
      heldHand.getWorldQuaternion(heldRoot.quaternion);
    }
    PLANET_CENTER.copy(built.planet.position);
    // BUILD 234: 하늘 — 자유 구름과 방사형 비·눈
    if (skyRef.current) {
      const propRainList: { key: string; dirLocal: THREE.Vector3; topR: number }[] = [];
      for (const pr2 of SP.props ?? []) {
        if (pr2.obj !== 'cloud-dark') continue;
        propRainList.push({ key: pr2.id, dirLocal: new THREE.Vector3(pr2.dir[0], pr2.dir[1], pr2.dir[2]), topR: pr2.r + (pr2.lift ?? 0) + 2.45 });
      }
      const rainNear = skyRef.current.update(dt, el, built.planet, built.R, built.surfaceR,
        { clouds: SP.clouds ?? 0, cloudFree: SP.cloudFree ?? 0.1, cloudOpacity: SP.cloudOpacity ?? 1, rainEvery: SP.rainEvery ?? 0, snowEvery: SP.snowEvery ?? 0 }, propRainList);
      // 빗소리 히스테리시스 — 문턱을 넘을 때만 apply (본토 소리 문법)
      const amt = rainNear > 0.55 ? 0.7 : rainNear > 0.22 ? 0.35 : 0;
      if (amt !== lastRainAmt.current) {
        if (amt > 0 && lastRainAmt.current <= 0) { emit('rain_in'); rainInAt.current = el; }
        if (amt <= 0 && lastRainAmt.current > 0) emit('rain_out', { seconds: Math.round(el - rainInAt.current) });
        lastRainAmt.current = amt; ambience.apply({ rainAmount: amt });
      }
    }
    // BUILD 236: 갈매기 — 걷는 아이 앞하늘 해안에서
    {
      const gullArc = gullsRef.current?.update(dt, el, U, dlRef.current) ?? Infinity;
      if (gullArc < 6 && !gullSeen.current) { gullSeen.current = true; emit('gull'); }
      if (gullArc > 12) gullSeen.current = false;
    }
    vehiclesRef.current?.update(dt, el, { planeEvery: SP.planeEvery ?? 0, shipEvery: SP.shipEvery ?? 0 }, dlRef.current, U);
    // BUILD 245: 혜성 (밤에 드물게) + 말풍선 갱신
    if (cometRef.current) cometRef.current.update(dt, 1 - THREE.MathUtils.smoothstep(dlRef.current, 0.15, 0.55));
    if (bubbles.current.length) {
      for (let i = bubbles.current.length - 1; i >= 0; i -= 1) {
        // BUILD 284: updateBubble은 '수명이 다하면 true'(부모가 수거). 살아있는 동안(false)은 갱신만.
        //   이전 코드가 극성이 뒤집혀(!) 태어나자마자 지워버렸다 — 본토 World.tsx 1689줄이 정답.
        if (updateBubble(bubbles.current[i], dt)) { bubbleRoot.remove(bubbles.current[i].sprite); bubbles.current.splice(i, 1); }
      }
    }
    if (contactRef) contactRef.current = { dir: [U.x, U.y, U.z], r: p.length(), tan: [Fw.x, Fw.y, Fw.z] };
    // BUILD 224: 반려의 걸음 — 그녀 뒤 0.6u를 목표로 부드럽게 따라온다 (행성 좌표로 계산, 월드로 환산)
    const PT = petRef.current;
    if (PT && MV.lift > 0.08) {
      // BUILD 225: 탈것 위에선 함께 탄다 — 빗자루면 뒤 솔방석, 구름이면 아기구름 위
      if (MV.mountKind === 'broom' && MV.mount) PT.t1.set(0, MV.mount.position.y + 0.08, -0.36);
      else if (MV.babyMount) PT.t1.set(MV.babyMount.position.x, MV.babyMount.position.y + 0.045, MV.babyMount.position.z);
      else PT.t1.set(0.42, MV.lift - 0.1, 0);
      PT.pet.group.position.lerp(PT.t1, Math.min(1, dt * 3.2));
      PT.pet.group.up.set(0, 1, 0);
      PT.pet.group.rotation.set(0, 0, 0);
      const wantR = PT.pet.sit ?? PT.pet.idle;
      if (wantR && wantR !== PT.cur) { PT.cur?.fadeOut(0.25); wantR.reset().fadeIn(0.25).play(); PT.cur = wantR; }
      PT.pet.mixer.update(dt);
    } else if (PT) {
      // BUILD 230: 본토 펫 AI(BUILD 141/144/154/157) 구면 이식 — 얘는 자유가 있는 애다.
      // 어슬렁(50%)·곁으로(28%)·재롱·멍때림, 리드줄 1.8u 추격, 7u 순간이동 보험,
      // 속도 0.5/1.35, 뛰기 히스테리시스(1.3 시작 → 0.6까지 유지), 목표 도달 0.1u.
      const r0 = p.length();
      if (PT.d.lengthSq() < 0.5) {
        PT.t1.crossVectors(U, T).normalize();
        PT.d.copy(U).applyQuaternion(PT.q1.setFromAxisAngle(PT.t1, 0.5 / r0)).normalize();
        PT.goal.copy(PT.d);
      }
      const arcTo = (a: THREE.Vector3, b: THREE.Vector3) => Math.acos(THREE.MathUtils.clamp(a.dot(b), -1, 1)) * r0;
      const dW = arcTo(PT.d, U);
      // 순간이동 보험 (본토 BUILD 157): 리드줄 너머로 날아갔으면 곁으로
      if (dW > 7) {
        PT.t1.crossVectors(U, T).normalize();
        PT.d.copy(U).applyQuaternion(PT.q1.setFromAxisAngle(PT.t1, 0.5 / r0)).normalize();
        PT.mode = 'idle'; PT.goal.copy(PT.d); PT.timer = 0.8;
      }
      PT.timer -= dt;
      // 리드줄에 물려도 하던 동작은 끝낸다 (본토 BUILD 144)
      if (dW > 1.8 && PT.mode !== 'chase' && PT.mode !== 'trick') { PT.mode = 'chase'; PT.goal.copy(U); PT.timer = 1.2; }
      if (PT.timer <= 0) {
        PT.timer = 2 + Math.random() * 3;
        const rr0 = Math.random();
        if (dW > 1.4) { PT.mode = 'chase'; PT.goal.copy(U); PT.timer = 1.2; }
        else if (rr0 < 0.5) { // 어슬렁 — 걷는 사람 근처 아무 데나 (0.35~1.2u)
          PT.mode = 'wander';
          const a2 = Math.random() * Math.PI * 2;
          const rr = 0.35 + Math.random() * 0.85;
          PT.t1.crossVectors(U, T).normalize();          // 옆 축
          PT.t2.crossVectors(T, PT.t1).normalize();      // 보조 축 (≈U 아님, 접선 기저용)
          const ax = PT.t2.copy(PT.t1).multiplyScalar(Math.cos(a2)).addScaledVector(T, Math.sin(a2)).normalize();
          PT.goal.copy(U).applyQuaternion(PT.q1.setFromAxisAngle(ax, rr / r0)).normalize();
        } else if (rr0 < 0.78) { // 곁으로 — 뒤 0.45u
          PT.t1.crossVectors(U, T).normalize();
          PT.goal.copy(U).applyQuaternion(PT.q1.setFromAxisAngle(PT.t1, 0.45 / r0)).normalize();
          PT.mode = 'chase';
        } else if (PT.pet.tricks.length) { // 재롱 한 번
          PT.mode = 'trick';
          const t0a = PT.pet.tricks[Math.floor(Math.random() * PT.pet.tricks.length)];
          t0a.reset().fadeIn(0.3).play();
          PT.cur?.fadeOut(0.3);
          PT.cur = t0a;
          PT.timer = (t0a.getClip().duration ?? 1.5) + 0.35;
        } else { PT.mode = 'idle'; }
      }
      const petPlay = (a: THREE.AnimationAction | null) => {
        if (!a || PT.cur === a) return;
        a.reset().fadeIn(0.35).play();
        PT.cur?.fadeOut(0.35);
        PT.cur = a;
      };
      let yawFrom: THREE.Vector3 | null = null;
      if (PT.mode !== 'trick') {
        const gd = arcTo(PT.d, PT.goal);
        if (gd > 0.1) {
          // 뛰기 히스테리시스 (본토 BUILD 144)
          PT.running = PT.mode === 'chase' && (PT.running ? dW > 0.6 : dW > 1.3);
          const spd = PT.running ? 1.35 : 0.5;
          const step = Math.min(gd, spd * dt) / r0;
          PT.t1.crossVectors(PT.d, PT.goal).normalize();
          if (PT.t1.lengthSq() > 0.5) {
            PT.t2.copy(PT.d); // 이동 전 방향 (요 계산용)
            PT.d.applyQuaternion(PT.q1.setFromAxisAngle(PT.t1, step)).normalize();
            yawFrom = PT.t2;
          }
          petPlay(PT.running ? (PT.pet.run ?? PT.pet.walk) : (PT.pet.walk ?? PT.pet.idle));
        } else {
          petPlay(PT.pet.idle);
        }
      }
      const wp = PET_V.copy(PT.d).multiplyScalar(built.surfaceR(PT.d) + 0.005); // BUILD 231: 전용 스크래치 — yawFrom 별칭 보호
      built.planet.localToWorld(wp);
      holder.worldToLocal(wp); // BUILD 231: 펫의 부모는 holder(y축 90° 회전) — 월드 좌표를 그대로 넣으면 90° 돌아간 자리에서 미끄러진다
      PT.pet.group.position.copy(wp);
      PT.pet.group.up.set(0, 1, 0);
      if (yawFrom) {
        // 요: 지면 상대 이동 방향 = 로컬 이동 델타를 행성 회전으로 월드에 사상 (본토 스무딩 dt*7)
        PT.t1.copy(PT.d).sub(yawFrom).applyQuaternion(built.planet.quaternion);
        PT.t1.applyQuaternion(holder.getWorldQuaternion(PT.q1).invert()); // BUILD 231: holder 로컬로 — 요도 좌표계를 따라야 한다
        if (PT.t1.lengthSq() > 1e-10) {
          const wantYaw = Math.atan2(PT.t1.x, PT.t1.z);
          let dy2 = wantYaw - PT.pet.group.rotation.y;
          while (dy2 > Math.PI) dy2 -= Math.PI * 2;
          while (dy2 < -Math.PI) dy2 += Math.PI * 2;
          PT.pet.group.rotation.y += dy2 * Math.min(1, dt * 7);
        }
      }
      if (PT.cur && PT.cur !== PT.pet.idle && PT.mode !== 'trick') PT.cur.timeScale = 1;
      PT.pet.mixer.update(dt);
    }

    // BUILD 246: 하늘 시계 — 누적(+=dt)을 절대시각(worldTime)으로 대체.
    // 접속 시점과 무관하게 모두가 같은 순간 같은 하늘을 본다. (세계 동기, 카메라만 각자)
    const WT = worldTime();
    // 하늘: 달의 공전(스펙 실시간) + 태양 자리
    ang.current = phaseAngle(WT, Math.max(10, SP.moon.period));
    const inc = (SP.moon.tilt * Math.PI) / 180;
    built.moon.position.set(
      Math.cos(ang.current) * SP.moon.dist,
      PLANET_CENTER.y + Math.sin(ang.current) * Math.sin(inc) * SP.moon.dist,
      Math.sin(ang.current) * Math.cos(inc) * SP.moon.dist,
    );
    built.moon.lookAt(0, PLANET_CENTER.y, 0);
    // BUILD 212: 달 자전 다이얼 — lookAt이 만드는 조석고정(=1) 위에 (spin−1)×공전각속도를 얹는다.
    // 1=늘 같은 얼굴(현재), 0=관성 정지처럼 보임, 음수=역자전.
    spinAng.current = phaseAngle(WT, Math.max(10, SP.moon.period)) * (((SP.moon.spin ?? 1)) - 1);
    built.moon.rotateY(spinAng.current);
    MOON_SUN.copy(built.sun.position).sub(built.moon.position).normalize(); // BUILD 236: 위상은 기하가 정한다
    if (rabbitAI.current) rabbitAI.current.update(dt);
    built.moonLight.intensity = SP.moon.light;
    // BUILD 214: 태양 공전 — 행성을 공전시킬 수 없으니 태양을 돌린다 (Vase).
    // 고도 대원 궤도: θ = 고도 + 누적 공전각. 지평선 아래로 지면 밤이 온다.
    const per = SP.sun.period ?? 0;
    dayAng.current = per > 0 ? phaseAngle(WT, Math.max(20, per)) : 0;
    const az = (SP.sun.az * Math.PI) / 180;
    const th = (SP.sun.el * Math.PI) / 180 + dayAng.current;
    v.set(Math.cos(th) * Math.cos(az), Math.sin(th), Math.cos(th) * Math.sin(az));
    built.sun.position.copy(v).multiplyScalar(built.R * 6.5);
    const dl = THREE.MathUtils.smoothstep(Math.sin(th), -0.12, 0.3); // 낮의 정도 (해가 지평선 아래로 조금 내려가야 완전한 밤)
    dlRef.current = dl;
    if (starRef.current) starRef.current.update(dt, el, dl);
    // BUILD 223: 세계가 잠드는 소리 — 밤이 오면 새가 그치고 풀벌레가 운다, 바람은 한 톤 낮게
    if (earState.current === 'day' && dl < 0.25) { earState.current = 'night'; emit('nightfall'); ambience.apply({ time: 'night', wind: 0.2, life: 0.6 }); }
    else if (earState.current === 'night' && dl > 0.5) { earState.current = 'day'; emit('daybreak'); ambience.apply({ time: 'day', wind: 0.28, life: 0.5 }); }
    // BUILD 264/275: 발밑 효과 — 양발이 딛는 그 자리에 남는다(planet 로컬).
    if (footDustRef.current) {
      let footL: THREE.Vector3 | null = null;
      let footR: THREE.Vector3 | null = null;
      if (moving && MV.mode !== 'ride') {
        if (footPRef.current) {
          footPRef.current.getWorldPosition(FOOT_WP);
          FOOT_LOCAL.copy(FOOT_WP); built.planet.worldToLocal(FOOT_LOCAL);
          footL = FOOT_LOCAL.clone();
        }
        if (footRRef.current) {
          footRRef.current.getWorldPosition(FOOT_WP);
          FOOT_WP2.copy(FOOT_WP); built.planet.worldToLocal(FOOT_WP2);
          footR = FOOT_WP2.clone();
        }
        // up·물판정은 왼발 기준
        const ref = footL ?? footR;
        if (ref) {
          FOOT_UP.copy(ref).normalize();
          FOOT_WATER.value = built.surfaceR(FOOT_UP) < built.R - 0.008;
        }
      } else {
        FOOT_UP.set(0, 1, 0); FOOT_WATER.value = false;
      }
      const groundR = built.surfaceR(FOOT_UP);
      footDustRef.current.updateFeet(dt, [footL, footR], FOOT_UP, FOOT_WATER.value, moving && MV.mode !== 'ride', groundR);
    }
    // BUILD 258: 밤이면 손 랜턴을 켠다 + 중력 정렬(뼈가 어떻게 돌아도 등불은 아래를 안다)
    if (lanternRef.current) {
      const isNight = dl < 0.35;
      lanternRef.current.visible = isNight;
      if (isNight && lanternRef.current.parent) {
        const q = new THREE.Quaternion();
        lanternRef.current.parent.getWorldQuaternion(q);
        lanternRef.current.quaternion.copy(q.invert());
      }
    }
    if (rabbitLanternRef.current) {
      const isNight = dl < 0.35;
      rabbitLanternRef.current.visible = isNight;
      if (isNight && rabbitLanternRef.current.parent) {
        const q = new THREE.Quaternion();
        rabbitLanternRef.current.parent.getWorldQuaternion(q);
        rabbitLanternRef.current.quaternion.copy(q.invert());
      }
    }
    // BUILD 241: 걸음 이정표 — 1km마다 (S는 걸음거리, ×10을 m로 친다 → 100u=1km)
    {
      const km = Math.floor((S.current * 10) / 1000);
      if (km > lastKm.current) { lastKm.current = km; emit('distance', { km }); }
    }
    // BUILD 241: 달 위상 전이 — MOON_SUN·법선으로 그믐/상현/보름/하현 구간
    {
      const dot = MOON_SUN.dot(built.moon.position.clone().sub(PLANET_CENTER).normalize());
      const ph = dot < -0.5 ? 'full' : dot > 0.5 ? 'new' : (spinAng.current % (Math.PI * 2)) < Math.PI ? 'waxing' : 'waning';
      if (ph !== lastPhase.current) { lastPhase.current = ph; if (Math.random() < 0.3) emit('moon_phase', { phase: ph }); } // BUILD 377: 위상 전이가 잦아 기록 도배 → 30%만 기록
    }
    if (dirLightRef.current) {
      dirLightRef.current.position.copy(v).multiplyScalar(20);
      dirLightRef.current.intensity = 1.35 * (0.05 + 0.95 * dl);
    }
    if (hemiRef.current) hemiRef.current.intensity = 0.55 * (0.32 + 0.68 * dl);
    SKY_BLEND.copy(NIGHT_SKY).lerp(DAY_SKY, dl);
    // BUILD 218: 밤이 깊을수록 달이 차오른다 — 과학은 태양 반사라지만 우리 달은 스스로 빛나기로 했다 (Vase)
    const moonMat2 = built.moon.material as THREE.MeshStandardMaterial;
    if (moonMat2.emissive) moonMat2.emissiveIntensity = 0.08 + 0.62 * (1 - dl);
    // BUILD 238: 달도 시야 거리에 걸린다 (Vase) — 걷는 아이에서 달까지가 시야 밖이면 하늘로 스민다.
    // 안개 면역이라 저절로 사라지지 않으니, 거리로 직접 투명·발광을 죽인다.
    {
      const vdM = Math.max(6, SP.viewDist ?? 41);
      const moonDist = built.moon.position.distanceTo(p); // 걷는 아이(접점 p) 기준
      const vis = 1 - THREE.MathUtils.smoothstep(moonDist, vdM * 0.9, vdM * 1.35);
      moonMat2.transparent = vis < 0.999;
      moonMat2.opacity = vis;
      moonMat2.emissiveIntensity *= vis;
      built.moon.visible = vis > 0.01;
      built.moonLight.intensity = SP.moon.light * vis; // 사라진 달은 빛도 거둔다
    }
    if (scene.background instanceof THREE.Color) scene.background.copy(SKY_BLEND);
    if (scene.fog) {
      // BUILD 221: 시야 거리 — 이펙트 타이밍에 맡기지 않고 매 프레임 직접 민다 (결정론)
      const fg = scene.fog as THREE.Fog;
      fg.color.copy(SKY_BLEND);
      // BUILD 226: 시선이 물러날 땐 안개도 물러난다 — 지구본이 안개공이 되지 않게
      const gz = cam.current.gz;
      const vd = Math.max(6, SP.viewDist ?? 41);
      const vdFar = Math.max(vd, built.R * 8);
      fg.near = Math.max(2.5, vd * 0.22) * (1 - gz) + vdFar * 0.35 * gz;
      fg.far = vd * (1 - gz) + vdFar * gz;
    }
    RFOG.color.copy(SKY_BLEND);
    // BUILD 221: 깃발 폽 — 가까우면 땅에서 통, 멀어지면 쇽 (히스테리시스 1.6/2.2u)
    if (propMap.current.size) {
      v.copy(p).normalize();
      const rl = p.length();
      for (const rec of propMap.current.values()) {
        const fl = rec.flag;
        if (!fl) continue;
        const cosA = Math.min(1, Math.max(-1, v.x * fl.dir[0] + v.y * fl.dir[1] + v.z * fl.dir[2]));
        const arc = Math.acos(cosA) * rl;
        const target = fl.v > 0.5 ? (arc < 2.2 ? 1 : 0) : (arc < 1.6 ? 1 : 0);
        // BUILD 222: 폽의 순간 — 속삭임 한 줄. "아, 저기가 그리스구나."
        if (target === 1 && fl.v <= 0.001) { if (rec.title && flagIsKnownCountry(rec.title)) { onFlagRef.current?.(rec.title); emit('flag', { country: rec.title }); } planetSound.pop(true); } // BUILD 223: 통— / BUILD 238: 진짜 나라만 여권에
        if (target === 0 && fl.v >= 0.999) planetSound.pop(false); // 쇽
        fl.v = Math.min(1, Math.max(0, fl.v + (target > fl.v ? 1 : -1) * dt * 3.4));
        const e = target === 1 ? backOut(fl.v) : fl.v * fl.v;
        const inner = rec.anchor.children[0];
        if (inner) inner.scale.setScalar(Math.max(0.001, fl.base * e));
      }
    }

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
        if (!C.gaze && e >= C.nextGaze) {
          // BUILD 226: 이번 컷은 물러난 시선 — 세계가 손바닥 위 물건으로 보이는 앵글
          C.gaze = true;
          C.hold = 9 + Math.random() * 5;
          C.nextGaze = e + 70 + Math.random() * 80;
        } else {
          C.gaze = false;
          let next = Math.floor(Math.random() * SHOTS.length);
          if (next === C.shot) next = (next + 1) % SHOTS.length;
          C.shot = next;
          C.hold = 9 + Math.random() * 6;
        }
      }
      C.gz += ((C.gaze ? 1 : 0) - C.gz) * Math.min(1, dt * 0.55);
      const kc = Math.min(1, dt * 0.65);
      if (C.gaze) {
        const az2 = e * 0.025; // 아주 느리게 도는 관측 자리
        const D = built.R * 2.9;
        v.set(Math.cos(az2) * 0.82, 0.52, Math.sin(az2) * 0.82).normalize().multiplyScalar(D);
        v.y += PLANET_CENTER.y + built.R * 0.15;
        C.pos.lerp(v, Math.min(1, dt * 0.45)); // 물러날 땐 더 천천히
        v.set(0, PLANET_CENTER.y + built.R * 0.1, 0);
        C.look.lerp(v, kc);
      } else {
        const tgt = SHOTS[C.shot];
        C.pos.lerp(tgt.p, kc);
        C.look.lerp(tgt.look, kc);
      }
      camera.position.set(
        C.pos.x + Math.sin(e * 0.11) * 0.14,
        C.pos.y + Math.sin(e * 0.07) * 0.06,
        C.pos.z + Math.cos(e * 0.09) * 0.1,
      );
      camera.lookAt(C.look.x, C.look.y, C.look.z);
    }
  });

  const sunAz = (spec.sun.az * Math.PI) / 180;
  const sunEl = (spec.sun.el * Math.PI) / 180;
  const sunDir: [number, number, number] = [
    Math.cos(sunEl) * Math.cos(sunAz) * 20,
    Math.sin(sunEl) * 20,
    Math.cos(sunEl) * Math.sin(sunAz) * 20,
  ];

  return (
    <>
      <color attach="background" args={[PALETTE.fog]} />
      <fog attach="fog" args={[PALETTE.fog, Math.max(4, (spec.viewDist ?? 41) * 0.22), Math.max(8, spec.viewDist ?? 41)]} />
      <hemisphereLight ref={hemiRef} args={['#b9d2d8', '#c8a97e', 0.55]} />
      <directionalLight
        ref={dirLightRef}
        color="#ffe7c2"
        intensity={1.35}
        position={sunDir}
        castShadow
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
        shadow-camera-left={-14}
        shadow-camera-right={14}
        shadow-camera-top={14}
        shadow-camera-bottom={-14}
      />
      <directionalLight color="#9fc4c9" intensity={0.22} position={[-5, 3, -4]} />
      {built && <primitive object={built.planet} />}
      {built && <primitive object={built.sky} />}
      <primitive object={holder} />
    </>
  );
}
