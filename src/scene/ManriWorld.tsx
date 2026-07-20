// ---------- 만리서재 (Manri Library) — 걸어 들어가는 방 ----------
// ?manri=1 로 진입하는 격리 월드. 캐논: mimesis-perspective-engine/docs/manri-visual-bible
//   - 단일실 7.2m × 5.4m × 3.1m. 입구=남, 벽난로=서, 큰 창=북, 작은 창=동.
//   - 광원 봉인(Vase 판정 2026-07-20): 벽난로 · 플로어 스탠드 · 북창 잔광 셋뿐.
//     책상 램프는 꺼져 있다 — 책상이 아직 주인을 기다리는 시간이 아니다.
//   - 창밖은 의도적 비확정 — 잔광 그라디언트만 존재한다.
//   - 공간의 맥박: 불 일렁임·스탠드 호흡(±4% 이내)·머그의 김 — 공간은 독립적인
//     물리 시간만 따른다. 사용자에게 반응하지 않는다.
//   - 카메라 문법: 눈높이 150cm, 35mm(수직 FOV≈38°), 걸음 0.7m/s, 문에서 기준 컷 3초 정지.
// 좌표 규약: 이 세계의 유닛은 사람 키=0.9 — 별이(아이)를 1.2m로 보고 1m = 0.75유닛.
//   spatial-layout의 (x=동, y=북) → three (x=mx·U, z=-my·U), 높이 = mz·U.
//
// ※ 별이·빼콩이는 소품이 아니다. 다른 맵(횡스크롤 동네·지역·행성)에 같은 영혼으로
//   소환되는 그 아이 그대로다. 여기서도 랜덤 아이가 아니라 우리 별이(idx 13, Kid5b)와
//   빼콩이(고양이1, cat1)를 부른다. 방은 그 애들이 살아갈 또 하나의 장소일 뿐이다.
export const BYEOL_WALKER_IDX = 13;  // Kid5b.glb = '별2' = 별이 (worldCore WALKER_ROSTER)
export const PPAEKONG_PET_ID = 'cat1'; // Cat_01.glb = 고양이1 = 빼콩이 (engine/pets)

import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { Byeoli, type ByeoliHost } from '../byeoli/Byeoli';
import { PET_ROSTER, loadPet, type LoadedPet } from '../engine/pets';

const U = 0.75;                       // 유닛/미터
const M = (m: number) => m * U;
const RW = M(7.2), RD = M(5.4), RH = M(3.1); // 방 크기 (유닛)
const EYE = M(1.5);                   // 서 있는 눈높이
const WALK = M(0.7);                  // 0.7 m/s — 느린 걸음 (카메라 문법)
// 미터 좌표 → three 좌표 (원점: 남서 모서리, 북쪽 = -z)
const px = (mx: number) => M(mx);
const pz = (my: number) => -M(my);

// ---- 재질 도우미 (materials-and-color.md 팔레트) ----
const mat = (color: string, rough = 1, metal = 0) =>
  new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal });
const WALNUT = '#4a3826', WALNUT_D = '#3a2c1e', OAK = '#6e5638', PLASTER = '#b9ae9e';
const BRASS = '#8a6d3b', IRON = '#2a2622';

function box(w: number, h: number, d: number, m: THREE.Material, x = 0, y = 0, z = 0, ry = 0) {
  const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
  b.position.set(x, y, z); b.rotation.y = ry;
  return b;
}
function cyl(rt: number, rb: number, h: number, m: THREE.Material, x = 0, y = 0, z = 0, seg = 14) {
  const c = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), m);
  c.position.set(x, y, z);
  return c;
}
function canvasTex(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d')!; draw(g);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// ---- 책들: 선반 한 칸을 채우는 무딘 색 책등 (채도 낮은 팔레트만 — 원색 금지) ----
const BOOK_COLORS = ['#5a4632', '#3f4a52', '#6b4038', '#4a5a44', '#75634a', '#54452e', '#3c3a4e', '#68503c'];
function bookRow(width: number, shelfY: number, z: number, group: THREE.Group, rnd: () => number) {
  let x = -width / 2;
  while (x < width / 2 - 0.02) {
    const bw = 0.018 + rnd() * 0.02;
    const bh = 0.13 + rnd() * 0.07;
    const lean = rnd() < 0.06 ? (rnd() - 0.5) * 0.35 : 0;
    const m = mat(BOOK_COLORS[Math.floor(rnd() * BOOK_COLORS.length)]);
    const b = box(bw, bh, 0.11, m, x + bw / 2, shelfY + bh / 2, z);
    b.rotation.z = lean;
    group.add(b);
    x += bw + 0.004 + (rnd() < 0.08 ? 0.05 : 0); // 가끔 빈틈 — 살던 흔적
  }
}

// ---- 책장 유닛 (호두나무): 프레임 + 선반 + 책 ----
function shelfUnit(w: number, h: number, rnd: () => number) {
  const g = new THREE.Group();
  const side = mat(WALNUT_D);
  const depth = 0.24;
  g.add(box(w, 0.03, depth, side, 0, h - 0.015, 0));
  g.add(box(0.03, h, depth, side, -w / 2 + 0.015, h / 2, 0));
  g.add(box(0.03, h, depth, side, w / 2 - 0.015, h / 2, 0));
  g.add(box(w, 0.025, depth, mat('#241b10'), 0, 0.012, 0)); // 굽
  const shelves = Math.max(2, Math.floor(h / 0.28));
  for (let i = 1; i <= shelves; i += 1) {
    const y = (h / (shelves + 0.2)) * i;
    g.add(box(w - 0.05, 0.022, depth, side, 0, y, 0));
    if (i < shelves) bookRow(w - 0.1, y + 0.012, 0, g, rnd);
  }
  bookRow(w - 0.1, 0.036, 0, g, rnd); // 맨 아래 칸
  return g;
}

// ---- 방 전체 지오메트리 ----
function buildRoom(): { root: THREE.Group; fireLight: THREE.PointLight; lampLight: THREE.PointLight; lampShade: THREE.Mesh; firePlanes: THREE.Mesh[]; steam: THREE.Mesh; pendulum: THREE.Group } {
  const root = new THREE.Group();
  let seed = 7;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };

  // 바닥 — 오크 플랭크 (캔버스 텍스처)
  const floorTex = canvasTex(512, 512, (g) => {
    g.fillStyle = '#6e5638'; g.fillRect(0, 0, 512, 512);
    for (let i = 0; i < 10; i += 1) {
      g.fillStyle = i % 2 ? '#67502f' : '#73593a'; g.fillRect(i * 52, 0, 50, 512);
      g.fillStyle = 'rgba(20,12,6,0.55)'; g.fillRect(i * 52 + 50, 0, 3, 512);
      for (let j = 0; j < 4; j += 1) { g.fillRect(i * 52, ((i * 131 + j * 173) % 480) + 16, 50, 2); }
    }
    g.fillStyle = 'rgba(30,20,10,0.18)';
    for (let i = 0; i < 700; i += 1) g.fillRect(Math.random() * 512, Math.random() * 512, 2, 1);
  });
  floorTex.wrapS = floorTex.wrapT = THREE.RepeatWrapping; floorTex.repeat.set(2, 2);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(RW, RD),
    new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.95 }));
  floor.rotation.x = -Math.PI / 2; floor.position.set(RW / 2, 0, -RD / 2);
  root.add(floor);

  // 벽 4면 (석회 회벽) + 천장
  const wallM = mat(PLASTER, 0.98);
  const mkWall = (w: number, x: number, z: number, ry: number) => {
    const m0 = wallM.clone();
    const wall = new THREE.Mesh(new THREE.PlaneGeometry(w, RH), m0);
    wall.position.set(x, RH / 2, z); wall.rotation.y = ry;
    return wall;
  };
  root.add(mkWall(RW, RW / 2, -RD, 0));            // 북
  root.add(mkWall(RW, RW / 2, 0, Math.PI));        // 남
  root.add(mkWall(RD, 0, -RD / 2, Math.PI / 2));   // 서
  root.add(mkWall(RD, RW, -RD / 2, -Math.PI / 2)); // 동
  const ceil = new THREE.Mesh(new THREE.PlaneGeometry(RW, RD), mat('#a89d8d', 1));
  ceil.rotation.x = Math.PI / 2; ceil.position.set(RW / 2, RH, -RD / 2);
  root.add(ceil);

  // 노출 들보 3개 — 동서 방향 (⑤ 판정: 보류, 동서 유지)
  for (const my of [1.35, 2.7, 4.05]) {
    root.add(box(RW, M(0.18), M(0.24), mat(WALNUT_D), RW / 2, RH - M(0.09), pz(my)));
  }

  // ── 남벽: 입구 문 + 양쪽 책장 + 진자 시계 ──
  const doorW = M(1.1), doorH = M(2.05);
  const door = new THREE.Group();
  door.add(box(doorW, doorH, 0.05, mat('#573f28'), 0, doorH / 2, 0));
  door.add(box(doorW - 0.1, doorH * 0.42, 0.02, mat('#4a3522'), 0, doorH * 0.66, -0.02));
  door.add(box(doorW - 0.1, doorH * 0.34, 0.02, mat('#4a3522'), 0, doorH * 0.25, -0.02));
  door.add(cyl(0.016, 0.016, 0.05, mat(BRASS, 0.5, 0.6), doorW / 2 - 0.09, doorH * 0.5, -0.03));
  door.position.set(px(3.6), 0, -0.03); door.rotation.y = Math.PI;
  root.add(door);
  const southShelfH = M(2.9);
  const s1 = shelfUnit(px(2.9), southShelfH, rnd); s1.position.set(px(1.5), 0, -0.13); s1.rotation.y = Math.PI; root.add(s1);
  const s2 = shelfUnit(px(2.9), southShelfH, rnd); s2.position.set(px(5.7), 0, -0.13); s2.rotation.y = Math.PI; root.add(s2);
  // 진자 시계 — 물리 시간의 상징 (문 위)
  const pendulum = new THREE.Group();
  const clock = new THREE.Group();
  clock.add(box(M(0.3), M(0.75), 0.09, mat('#3c2d1c'), 0, 0, 0));
  const face = new THREE.Mesh(new THREE.CircleGeometry(M(0.11), 24),
    new THREE.MeshStandardMaterial({ color: '#d8d2c4', roughness: 0.9 }));
  face.position.set(0, M(0.22), -0.05); face.rotation.y = Math.PI; clock.add(face);
  const rod = new THREE.Group();
  rod.add(cyl(0.006, 0.006, M(0.4), mat(BRASS, 0.5, 0.7), 0, -M(0.2), 0));
  const bob = new THREE.Mesh(new THREE.CircleGeometry(M(0.05), 20), mat(BRASS, 0.4, 0.8));
  bob.position.set(0, -M(0.4), -0.001); bob.rotation.y = Math.PI; rod.add(bob);
  rod.position.set(0, M(0.08), -0.055);
  pendulum.add(rod); clock.add(pendulum);
  clock.position.set(px(3.6), M(2.55), -0.11); clock.rotation.y = Math.PI;
  root.add(clock);

  // ── 동벽: 책장 + 황동 레일 + 오크 사다리 + 작은 창 (비를 보는 창) ──
  const e1 = shelfUnit(M(3.2), M(2.9), rnd); e1.position.set(RW - 0.13, 0, pz(1.8)); e1.rotation.y = -Math.PI / 2; root.add(e1);
  root.add(box(M(3.4), 0.02, 0.02, mat(BRASS, 0.4, 0.7), RW - 0.3, M(2.95), pz(1.8), Math.PI / 2)); // 레일
  const ladder = new THREE.Group(); // ① 판정: an oak ladder resting on the brass rail
  const lm = mat(OAK);
  for (const s of [-1, 1]) ladder.add(box(0.035, M(2.9), 0.05, lm, s * M(0.21), M(1.45), 0));
  for (let i = 0; i < 7; i += 1) ladder.add(box(M(0.4), 0.03, 0.03, lm, 0, M(0.3 + i * 0.38), 0));
  ladder.position.set(RW - 0.22, 0, pz(2.6));
  ladder.rotation.y = -Math.PI / 2; ladder.rotation.x = -0.12;
  root.add(ladder);
  // 동창 (70×140, 깊은 창턱) — 창밖은 비확정: 북창보다 한 톤 꺼진 잔광 그라디언트만
  const eDuskTex = canvasTex(64, 128, (g) => {
    const gr = g.createLinearGradient(0, 0, 0, 128);
    gr.addColorStop(0, '#49556c'); gr.addColorStop(0.55, '#39445a'); gr.addColorStop(1, '#252d3c');
    g.fillStyle = gr; g.fillRect(0, 0, 64, 128);
    g.fillStyle = 'rgba(150,165,190,0.08)';
    g.beginPath(); g.ellipse(22, 40, 14, 30, 0, 0, Math.PI * 2); g.fill();
  });
  const eFrame = new THREE.Group();
  const eGlass = new THREE.Mesh(new THREE.PlaneGeometry(M(0.62), M(1.32)),
    new THREE.MeshBasicMaterial({ map: eDuskTex }));
  eFrame.add(eGlass);
  const eSashM = mat('#241c14');
  eFrame.add(box(0.05, M(1.42), 0.08, eSashM, 0, 0, 0.01, Math.PI / 2));
  eFrame.add(box(0.05, M(1.42), 0.08, eSashM, 0, 0, 0.01));
  // ↑ 십자 창살 두 개(가로/세로) + 테두리
  eFrame.add(box(M(0.72), 0.05, 0.09, eSashM, 0, M(0.68), 0));
  eFrame.add(box(M(0.72), 0.05, 0.09, eSashM, 0, -M(0.68), 0));
  eFrame.add(box(0.05, M(1.4), 0.09, eSashM, -M(0.34), 0, 0));
  eFrame.add(box(0.05, M(1.4), 0.09, eSashM, M(0.34), 0, 0));
  eFrame.add(box(M(0.8), 0.04, M(0.3), mat('#3a3226'), 0, -M(0.72), -M(0.1))); // 깊은 창턱 (30cm)
  eFrame.position.set(RW - 0.04, M(1.55), pz(4.7)); eFrame.rotation.y = -Math.PI / 2;
  root.add(eFrame);
  // 창턱의 아이비 — 어두운 초록 덩어리
  const ivy = new THREE.Group();
  for (let i = 0; i < 7; i += 1) {
    ivy.add(box(0.05 + rnd() * 0.05, 0.03, 0.05 + rnd() * 0.04, mat('#3a4a36'),
      (rnd() - 0.5) * 0.22, 0.02 + rnd() * 0.05, (rnd() - 0.5) * 0.16));
  }
  ivy.add(cyl(0.045, 0.055, 0.09, mat('#6b4a35'), 0, -0.045, 0));
  ivy.position.set(RW - 0.16, M(0.88), pz(4.7));
  root.add(ivy);

  // ── 북벽: 큰 세로창 (90×180, 잔광) + 책상 + 타자기 + 꺼진 녹색 갓 램프 + 의자 ──
  // 창밖은 의도적으로 비확정 — 그라디언트만 존재한다 (④ 판정)
  const duskTex = canvasTex(128, 256, (g) => {
    const gr = g.createLinearGradient(0, 0, 0, 256);
    gr.addColorStop(0, '#67758f'); gr.addColorStop(0.5, '#4e5c76'); gr.addColorStop(1, '#303a4e');
    g.fillStyle = gr; g.fillRect(0, 0, 128, 256);
    g.fillStyle = 'rgba(160,175,200,0.10)';
    g.beginPath(); g.ellipse(40, 70, 26, 52, 0, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.ellipse(92, 150, 20, 40, 0, 0, Math.PI * 2); g.fill();
  });
  const win = new THREE.Group();
  const dusk = new THREE.Mesh(new THREE.PlaneGeometry(M(0.9), M(1.8)),
    new THREE.MeshBasicMaterial({ map: duskTex }));
  dusk.position.set(0, 0, 0.01);
  win.add(dusk);
  const sashM = mat('#241c14');
  win.add(box(M(0.98), 0.05, 0.1, sashM, 0, M(0.92), 0));
  win.add(box(M(0.98), 0.05, 0.1, sashM, 0, -M(0.92), 0));
  win.add(box(0.05, M(1.9), 0.1, sashM, -M(0.47), 0, 0));
  win.add(box(0.05, M(1.9), 0.1, sashM, M(0.47), 0, 0));
  win.add(box(0.03, M(1.8), 0.06, sashM, 0, 0, 0));
  win.add(box(M(0.9), 0.03, 0.06, sashM, 0, M(0.3), 0));
  win.add(box(M(0.9), 0.03, 0.06, sashM, 0, -M(0.3), 0));
  win.add(box(M(1.04), 0.04, M(0.16), mat('#3a3226'), 0, -M(0.95), -0.03)); // 창턱
  win.position.set(px(3.4), M(1.75), -RD + 0.02);
  root.add(win);
  // 책상 (1.5×0.6, 상판 0.75) — 북창 아래
  const desk = new THREE.Group();
  desk.add(box(M(1.5), 0.035, M(0.6), mat(OAK, 0.85), 0, M(0.75), 0));
  desk.add(box(M(1.44), M(0.09), M(0.54), mat('#5c4730'), 0, M(0.68), 0));
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    desk.add(box(0.045, M(0.66), 0.045, mat(WALNUT_D), sx * M(0.68), M(0.33), sz * M(0.24)));
  }
  desk.position.set(px(3.4), 0, pz(5.0));
  root.add(desk);
  // 타자기 (매트 블랙) + 반쯤 타이핑된 종이 — 글자는 읽히지 않는다
  const tw = new THREE.Group();
  tw.add(box(M(0.34), M(0.1), M(0.3), mat('#191512', 0.7), 0, M(0.05), 0));
  tw.add(box(M(0.3), M(0.07), M(0.12), mat('#211c16', 0.7), 0, M(0.13), -M(0.05)));
  for (let i = 0; i < 4; i += 1) {
    tw.add(box(M(0.24 - i * 0.015), 0.008, 0.012, mat('#0f0c0a', 0.5), 0, M(0.045 + i * 0.02), M(0.08 + i * 0.012)));
  }
  const paper = new THREE.Mesh(new THREE.PlaneGeometry(M(0.2), M(0.24)),
    new THREE.MeshStandardMaterial({ color: '#cdc6b4', roughness: 1, side: THREE.DoubleSide }));
  paper.position.set(0, M(0.24), -M(0.06)); paper.rotation.x = -0.22;
  tw.add(paper);
  tw.position.set(px(3.25), M(0.755), pz(5.05));
  root.add(tw);
  // 녹색 유리 갓 황동 램프 — 꺼져 있다 (③ 판정: 광원 봉인)
  const dlamp = new THREE.Group();
  dlamp.add(cyl(0.05, 0.07, 0.02, mat(BRASS, 0.5, 0.6), 0, 0.01, 0));
  dlamp.add(cyl(0.008, 0.008, M(0.3), mat(BRASS, 0.5, 0.6), 0, M(0.16), 0));
  const shade = new THREE.Mesh(new THREE.CylinderGeometry(M(0.1), M(0.13), M(0.09), 16, 1, true, 0, Math.PI),
    new THREE.MeshStandardMaterial({ color: '#16341f', roughness: 0.5, side: THREE.DoubleSide }));
  shade.position.set(0, M(0.32), 0); shade.rotation.y = Math.PI / 2;
  dlamp.add(shade);
  dlamp.position.set(px(3.95), M(0.755), pz(5.0));
  root.add(dlamp);
  // 책상 의자 — 북향으로 밀어 넣힘
  const chair = new THREE.Group();
  chair.add(box(M(0.42), 0.03, M(0.4), mat(WALNUT), 0, M(0.45), 0));
  chair.add(box(M(0.42), M(0.5), 0.03, mat(WALNUT), 0, M(0.72), -M(0.19)));
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    chair.add(box(0.03, M(0.45), 0.03, mat(WALNUT_D), sx * M(0.18), M(0.22), sz * M(0.17)));
  }
  chair.position.set(px(3.4), 0, pz(4.55)); chair.rotation.y = Math.PI;
  root.add(chair);

  // ── 서벽: 벽난로 + 낮게 타는 불 + 장작 바구니 + 흔들의자 + 원형 테이블 + 머그 ──
  const fp = new THREE.Group();
  const stone = mat('#7e786c', 0.95);
  fp.add(box(M(1.4), M(1.2), M(0.35), stone, 0, M(0.6), 0));
  fp.add(box(M(1.6), M(0.12), M(0.45), mat('#8a8378'), 0, M(1.26), 0)); // 맨틀
  fp.add(box(M(1.4), M(1.9), M(0.16), stone, 0, M(2.15), M(0.06)));    // 굴뚝 가슴벽
  const opening = box(M(0.8), M(0.7), M(0.3), mat('#0a0806'), 0, M(0.42), M(0.05));
  fp.add(opening);
  fp.position.set(0.02, 0, pz(2.7)); fp.rotation.y = Math.PI / 2;
  root.add(fp);
  // 불 — 교차 빌보드 2장 (발광) + 잉걸 바닥
  const fireTex = canvasTex(64, 64, (g) => {
    const gr = g.createRadialGradient(32, 44, 4, 32, 40, 30);
    gr.addColorStop(0, 'rgba(255,190,110,0.95)');
    gr.addColorStop(0.4, 'rgba(235,120,45,0.75)');
    gr.addColorStop(1, 'rgba(120,40,10,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  });
  const firePlanes: THREE.Mesh[] = [];
  const fireGroup = new THREE.Group();
  for (const ry of [0, Math.PI / 2]) {
    const f = new THREE.Mesh(new THREE.PlaneGeometry(M(0.5), M(0.4)),
      new THREE.MeshBasicMaterial({ map: fireTex, transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }));
    f.rotation.y = ry; f.position.y = M(0.22);
    fireGroup.add(f); firePlanes.push(f);
  }
  const ember = new THREE.Mesh(new THREE.CircleGeometry(M(0.26), 16),
    new THREE.MeshBasicMaterial({ color: '#c96a24', transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending }));
  ember.rotation.x = -Math.PI / 2; ember.position.y = 0.012;
  fireGroup.add(ember);
  for (let i = 0; i < 3; i += 1) {
    const log = cyl(M(0.045), M(0.045), M(0.5), mat('#33241a'), 0, M(0.06 + i * 0.055), 0, 8);
    log.rotation.z = Math.PI / 2; log.rotation.y = (i - 1) * 0.5;
    fireGroup.add(log);
  }
  fireGroup.position.set(M(0.28), 0, pz(2.7));
  root.add(fireGroup);
  const fireLight = new THREE.PointLight('#ff8a35', 2.8, M(8.5), 1.8);
  fireLight.position.set(M(0.5), M(0.7), pz(2.7));
  root.add(fireLight);
  // 장작 바구니 (① 판정: a willow basket holding a few split logs beside the fireplace)
  const basket = new THREE.Group();
  const bw = new THREE.Mesh(new THREE.CylinderGeometry(M(0.22), M(0.17), M(0.26), 12, 1, true),
    new THREE.MeshStandardMaterial({ color: '#7a5c38', roughness: 1, side: THREE.DoubleSide }));
  bw.position.y = M(0.13); basket.add(bw);
  for (let i = 0; i < 4; i += 1) {
    const lg = cyl(M(0.04), M(0.04), M(0.34), mat('#4a382a'), 0, M(0.24), 0, 7);
    lg.rotation.z = 1.2 + rnd() * 0.4; lg.rotation.y = rnd() * Math.PI;
    lg.position.set((rnd() - 0.5) * 0.08, M(0.22 + rnd() * 0.05), (rnd() - 0.5) * 0.08);
    basket.add(lg);
  }
  basket.position.set(px(0.3), 0, pz(1.9));
  root.add(basket);
  // 흔들의자 (1.3, 2.9) — 벽난로를 향해 25° 남동쪽으로
  const rock = new THREE.Group();
  const rw = mat(WALNUT);
  rock.add(box(M(0.5), 0.03, M(0.42), rw, 0, M(0.42), 0));
  for (let i = 0; i < 5; i += 1) rock.add(box(0.028, M(0.55), 0.02, rw, -M(0.2) + i * M(0.1), M(0.72), -M(0.2)));
  rock.add(box(M(0.5), 0.035, 0.03, rw, 0, M(1.0), -M(0.2)));
  for (const s of [-1, 1]) {
    rock.add(box(0.03, 0.03, M(0.46), rw, s * M(0.24), M(0.62), 0));           // 팔걸이
    rock.add(box(0.03, M(0.32), 0.03, rw, s * M(0.24), M(0.28), M(0.18)));
    rock.add(box(0.03, M(0.36), 0.03, rw, s * M(0.24), M(0.26), -M(0.16)));
    const rocker = box(0.026, 0.03, M(0.62), mat(WALNUT_D), s * M(0.24), M(0.035), 0);
    rocker.rotation.x = 0.06;
    rock.add(rocker);
  }
  rock.add(box(M(0.44), 0.05, M(0.36), mat('#8a6534', 0.95), 0, M(0.455), 0)); // 오커 리넨 쿠션
  rock.position.set(px(1.3), 0, pz(2.9));
  rock.rotation.y = Math.PI / 2 - 0.44; // 벽난로 쪽(서향에서 남동 25° 틀어짐)
  root.add(rock);
  // 원형 테이블 + 이 빠진 법랑 머그 + 김 (흔적 규칙: 흔적은 이것 하나)
  const table = new THREE.Group();
  table.add(cyl(M(0.225), M(0.225), 0.025, mat(WALNUT), 0, M(0.5), 0, 20));
  table.add(cyl(0.02, 0.02, M(0.48), mat(WALNUT_D), 0, M(0.25), 0));
  table.add(cyl(M(0.14), M(0.16), 0.02, mat(WALNUT_D), 0, 0.01, 0, 16));
  table.position.set(px(1.05), 0, pz(2.2));
  root.add(table);
  const mug = new THREE.Group();
  mug.add(new THREE.Mesh(new THREE.CylinderGeometry(M(0.045), M(0.04), M(0.1), 14, 1, true),
    new THREE.MeshStandardMaterial({ color: '#e6e2d8', roughness: 0.6, side: THREE.DoubleSide })));
  mug.position.set(px(1.05) + M(0.06), M(0.5) + M(0.05) + 0.02, pz(2.2));
  root.add(mug);
  const steamTex = canvasTex(32, 96, (g) => {
    g.strokeStyle = 'rgba(230,230,225,0.5)'; g.lineWidth = 3; g.beginPath();
    g.moveTo(16, 92);
    g.bezierCurveTo(24, 70, 6, 52, 15, 30);
    g.bezierCurveTo(20, 18, 12, 10, 16, 2);
    g.stroke();
  });
  const steam = new THREE.Mesh(new THREE.PlaneGeometry(M(0.09), M(0.3)),
    new THREE.MeshBasicMaterial({ map: steamTex, transparent: true, opacity: 0.4, depthWrite: false }));
  steam.position.set(px(1.05) + M(0.06), M(0.72), pz(2.2));
  root.add(steam);

  // ── 북동 구석: 모스그린 큰 의자 + 담요 + 푸른 책 + 스탠드 + 책 더미 ──
  const arm = new THREE.Group();
  const moss = mat('#44553f', 0.98);
  arm.add(box(M(0.8), M(0.28), M(0.75), moss, 0, M(0.2), 0));
  arm.add(box(M(0.66), M(0.13), M(0.6), mat('#4d5f47', 0.98), 0, M(0.38), M(0.04)));
  arm.add(box(M(0.8), M(0.75), M(0.2), moss, 0, M(0.55), -M(0.3)));
  for (const s of [-1, 1]) {
    arm.add(box(M(0.16), M(0.42), M(0.7), moss, s * M(0.34), M(0.42), 0));
    arm.add(box(M(0.14), M(0.3), M(0.18), moss, s * M(0.33), M(0.78), -M(0.28))); // 윙
  }
  // 오트밀 담요 — 등받이 왼쪽에 걸쳐짐
  const blanket = box(M(0.3), M(0.5), 0.025, mat('#cfc3a8', 1), -M(0.16), M(0.72), -M(0.18));
  blanket.rotation.x = -0.28;
  arm.add(blanket);
  // 팔걸이 위 푸른 클로스 장정 책
  arm.add(box(M(0.19), 0.025, M(0.13), mat('#2e4058', 0.85), M(0.34), M(0.645), M(0.05), 0.2));
  arm.position.set(px(6.3), 0, pz(4.6));
  arm.rotation.y = Math.PI + 0.65; // 방 중심(남서쪽)을 향함
  root.add(arm);
  // 플로어 스탠드 — 리넨 갓, 방에서 가장 밝은 것 (호흡 ±3%)
  const lampG = new THREE.Group();
  lampG.add(cyl(M(0.14), M(0.16), 0.02, mat(IRON), 0, 0.01, 0, 16));
  lampG.add(cyl(0.012, 0.012, M(1.35), mat(IRON), 0, M(0.68), 0));
  const lampShade = new THREE.Mesh(new THREE.CylinderGeometry(M(0.13), M(0.19), M(0.26), 18, 1, true),
    new THREE.MeshStandardMaterial({
      color: '#f2dab2', roughness: 1, side: THREE.DoubleSide,
      emissive: '#ffca86', emissiveIntensity: 0.85,
    }));
  lampShade.position.y = M(1.47);
  lampG.add(lampShade);
  lampG.position.set(px(6.7), 0, pz(5.0));
  root.add(lampG);
  const lampLight = new THREE.PointLight('#ffb572', 1.25, M(4.8), 2);
  lampLight.position.set(px(6.7), M(1.45), pz(5.0));
  root.add(lampLight);
  // 책 더미 3무더기 (무릎 높이 이하)
  for (const [sx, sy, n] of [[5.75, 4.05, 6], [5.95, 4.3, 8], [6.15, 4.0, 5]] as const) {
    let y = 0;
    for (let i = 0; i < n; i += 1) {
      const th = M(0.035 + rnd() * 0.02);
      const b = box(M(0.24 + rnd() * 0.06), th, M(0.18 + rnd() * 0.05),
        mat(BOOK_COLORS[Math.floor(rnd() * BOOK_COLORS.length)]),
        px(sx) + (rnd() - 0.5) * 0.03, y + th / 2, pz(sy) + (rnd() - 0.5) * 0.03, rnd() * 0.5);
      root.add(b); y += th;
    }
  }

  // ── 중앙 러그 (2.8×2.0, 빛바랜 꼭두서니) ──
  const rugTex = canvasTex(256, 192, (g) => {
    g.fillStyle = '#6e3a30'; g.fillRect(0, 0, 256, 192);
    g.strokeStyle = '#7d4a3c'; g.lineWidth = 6; g.strokeRect(14, 14, 228, 164);
    g.strokeStyle = '#5e3128'; g.lineWidth = 2; g.strokeRect(26, 26, 204, 140);
    g.fillStyle = 'rgba(40,20,14,0.25)';
    for (let i = 0; i < 300; i += 1) g.fillRect(Math.random() * 256, Math.random() * 192, 3, 2);
  });
  const rug = new THREE.Mesh(new THREE.PlaneGeometry(M(2.8), M(2.0)),
    new THREE.MeshStandardMaterial({ map: rugTex, roughness: 1 }));
  rug.rotation.x = -Math.PI / 2; rug.position.set(px(3.6), 0.008, pz(2.7));
  root.add(rug);

  // 창의 잔광이 방으로 스미는 아주 약한 차가운 빛 (세 번째 웅덩이)
  const duskLight = new THREE.PointLight('#5c6a82', 0.75, M(5.0), 2);
  duskLight.position.set(px(3.4), M(1.7), pz(4.9));
  root.add(duskLight);

  // 반사광 — 불과 스탠드가 방 전체에 남기는 미약한 되비침 (가짜 GI, 광원이 아니라 부양)
  const bounce = new THREE.PointLight('#6a5238', 0.5, M(11), 1.6);
  bounce.position.set(px(3.6), M(2.2), pz(2.7));
  root.add(bounce);

  return { root, fireLight, lampLight, lampShade, firePlanes, steam, pendulum };
}

// ---- 별이의 산책 그래프 (미터 좌표 웨이포인트 — 가구를 피해 열린 바닥만) ----
const WAYPOINTS_M: [number, number][] = [
  [3.0, 1.3],   // 0 문 앞 (문에서 반 걸음 비켜서)
  [3.6, 2.7],   // 1 러그 중앙
  [2.2, 2.7],   // 2 러그 서쪽 — 벽난로 앞
  [4.9, 2.6],   // 3 러그 동쪽
  [3.3, 4.2],   // 4 책상 앞
  [5.5, 3.9],   // 5 큰 의자 앞
  [5.6, 1.6],   // 6 남동 책장 앞
  [1.8, 1.4],   // 7 남서 책장 앞
];
const WP_EDGES: [number, number][] = [
  [0, 1], [1, 2], [1, 3], [1, 4], [3, 5], [3, 6], [0, 6], [0, 7], [2, 7], [4, 5],
];

// ---- 만리서재 씬 본체 ----
function ManriScene({ walkerIdx }: { walkerIdx: number }) {
  const { camera, gl, scene } = useThree();
  const built = useMemo(buildRoom, []);
  const stage = useMemo(() => new THREE.Group(), []);
  const byeoliAnchor = useMemo(() => new THREE.Group(), []);
  // 별이 개인 키라이트 — 방을 밝히지 않고 주인공만 읽히게 한다(촬영용 키, 공간 반응 아님).
  //   ⚠ 판정 사안: 캐논의 "어두운 중간지대"와 걷는 주인공의 가독성이 충돌 — 이 램프는 절충.
  const byeoliKey = useMemo(() => {
    const l = new THREE.PointLight('#f2d8b0', 0.85, M(2.4), 2.2);
    l.position.set(0, M(1.4), M(0.5));
    return l;
  }, []);

  // 씬 조립 + 배경/톤
  useEffect(() => {
    scene.background = new THREE.Color('#141210');
    gl.toneMapping = THREE.ACESFilmicToneMapping;
    gl.toneMappingExposure = 1.05;
    stage.add(built.root);
    byeoliAnchor.add(byeoliKey); // 키라이트는 별이 앵커에 붙어 함께 이동
    stage.add(byeoliAnchor);
    scene.add(stage);
    return () => { scene.remove(stage); };
  }, [scene, gl, stage, built, byeoliAnchor]);

  // ── 관객 카메라: 문에서 기준 컷 3초 정지 → 이후 걷기 (0.7m/s, 눈높이 150cm) ──
  const holdRef = useRef(3.0);
  const keys = useRef<Record<string, boolean>>({});
  // &at= 검증·안내용 딥링크: fire/desk/armchair/center (기본: 문 앞 기준 컷)
  const spawn = useMemo<{ p: [number, number]; yaw: number; pitch: number }>(() => {
    const at = new URLSearchParams(window.location.search).get('at');
    const table: Record<string, { p: [number, number]; yaw: number; pitch: number }> = {
      fire:     { p: [3.2, 2.3], yaw: Math.PI / 2 - 0.28, pitch: -0.1 }, // 벽난로·흔들의자를 본다
      desk:     { p: [3.4, 3.3], yaw: 0, pitch: 0 },                      // 책상을 본다
      armchair: { p: [4.35, 2.75], yaw: -0.85, pitch: -0.14 },           // 큰 의자·스탠드를 본다
      center:   { p: [3.6, 2.2], yaw: 0, pitch: 0 },
    };
    return (at && table[at]) || { p: [3.6, 0.45], yaw: 0, pitch: 0 };
  }, []);
  const yawRef = useRef(spawn.yaw);  // 0 = 북쪽(-z)을 본다
  const pitchRef = useRef(spawn.pitch);
  const posRef = useRef(new THREE.Vector3(px(spawn.p[0]), EYE, pz(spawn.p[1])));
  const dragRef = useRef<{ on: boolean; x: number; y: number }>({ on: false, x: 0, y: 0 });
  useEffect(() => {
    const el = gl.domElement;
    const down = (e: PointerEvent) => { dragRef.current = { on: true, x: e.clientX, y: e.clientY }; };
    const up = () => { dragRef.current.on = false; };
    const move = (e: PointerEvent) => {
      const d = dragRef.current;
      if (!d.on) return;
      yawRef.current -= (e.clientX - d.x) * 0.0032;
      pitchRef.current = Math.max(-0.9, Math.min(0.9, pitchRef.current - (e.clientY - d.y) * 0.0028));
      d.x = e.clientX; d.y = e.clientY;
    };
    const kd = (e: KeyboardEvent) => { keys.current[e.key.toLowerCase()] = true; };
    const ku = (e: KeyboardEvent) => { keys.current[e.key.toLowerCase()] = false; };
    el.addEventListener('pointerdown', down);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointermove', move);
    window.addEventListener('keydown', kd);
    window.addEventListener('keyup', ku);
    return () => {
      el.removeEventListener('pointerdown', down);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('keydown', kd);
      window.removeEventListener('keyup', ku);
    };
  }, [gl]);

  // 가구 충돌 상자 (미터, [x0,y0,x1,y1]) — 방은 실재한다: 통과하지 않는다
  const solids = useMemo<[number, number, number, number][]>(() => [
    [2.55, 4.6, 4.25, 5.4],   // 책상+의자
    [-0.2, 1.9, 0.75, 3.5],   // 벽난로+바구니
    [0.75, 2.35, 1.85, 3.45], // 흔들의자
    [0.7, 1.85, 1.45, 2.55],  // 원형 테이블
    [5.55, 3.9, 7.2, 5.4],    // 큰 의자+스탠드
    [5.55, 3.7, 6.45, 4.55],  // 책 더미
    [-0.2, -0.5, 7.4, 0.45],  // 남벽 책장 라인
    [6.75, -0.5, 7.4, 3.6],   // 동벽 책장 라인
  ], []);

  // ── 별이: 웨이포인트 산책 ──
  const wpRef = useRef({ cur: 1, next: 3, t: 0 });
  const byeoliPos = useRef(new THREE.Vector2(3.6, 2.7)); // 미터
  const byeoliYaw = useRef(0);
  const BYEOL_SPEED = 0.62; // m/s — 별이는 사용자보다 반 박자 느긋하게

  const host = useMemo<ByeoliHost>(() => ({
    parent: () => byeoliAnchor,
    feetY: () => 0,
    walkerIdx,
    stripHeightFog: () => true,   // 방 안 — 안개 없음
    tint: () => null,             // 원색 — 방의 빛이 별이를 물들인다
    stageChance: () => 0,         // 서재에서는 무대 없음 — 걷고, 머물고, 바라본다
    stageIds: () => [],
    lingerEvery: () => 2.2,       // 자주 멈춰서
    lingerLength: () => 2.8,      //   한참 바라본다 (서가 앞의 시간)
    walkStride: (dt) => M(BYEOL_SPEED) * dt,
    faceYaw: ({ cur }) => byeoliYaw.current ?? cur,
    onMove: (info) => {
      if (!info.moving) return;
      const w = wpRef.current;
      const from = WAYPOINTS_M[w.cur], to = WAYPOINTS_M[w.next];
      const dx = to[0] - from[0], dy = to[1] - from[1];
      const len = Math.hypot(dx, dy);
      w.t += (BYEOL_SPEED * info.dt) / Math.max(0.001, len);
      if (w.t >= 1) {
        const nbrs = WP_EDGES.flatMap(([a, b]) => (a === w.next ? [b] : b === w.next ? [a] : []))
          .filter((n) => n !== w.cur);
        const pick = nbrs.length ? nbrs[Math.floor(Math.random() * nbrs.length)] : w.cur;
        wpRef.current = { cur: w.next, next: pick, t: 0 };
      } else {
        byeoliPos.current.set(from[0] + dx * w.t, from[1] + dy * w.t);
        // 진행 방향을 보고 걷는다 (three z = -북)
        byeoliYaw.current = Math.atan2(-(dx), dy);
      }
    },
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [byeoliAnchor, walkerIdx]);

  // ── 빼콩이: 별이를 따라다니는 포메라니안 ──
  const petRef = useRef<LoadedPet | null>(null);
  const petPos = useRef(new THREE.Vector2(3.2, 1.2));
  useEffect(() => {
    let alive = true;
    const def = PET_ROSTER.find((p) => p.id === PPAEKONG_PET_ID) ?? PET_ROSTER[0];
    void loadPet(def).then((pet) => {
      if (!alive) { return; }
      pet.group.position.set(px(petPos.current.x), 0, pz(petPos.current.y));
      stage.add(pet.group);
      petRef.current = pet;
      pet.idle?.play();
    }).catch(() => { /* 조용한 방 */ });
    return () => {
      alive = false;
      if (petRef.current) { stage.remove(petRef.current.group); petRef.current = null; }
    };
  }, [stage]);

  // ── 매 프레임: 카메라 · 별이 앵커 · 빼콩이 · 공간의 맥박 ──
  useFrame((s, rawDt) => {
    const dt = Math.min(0.05, rawDt);
    const t = s.clock.elapsedTime;

    // 카메라 (기준 컷 3초 정지 후 해제)
    if (holdRef.current > 0) holdRef.current -= dt;
    else {
      const k = keys.current;
      const fwd = (k.w || k.arrowup ? 1 : 0) - (k.s || k.arrowdown ? 1 : 0);
      const strafe = (k.d || k.arrowright ? 1 : 0) - (k.a || k.arrowleft ? 1 : 0);
      if (fwd || strafe) {
        const yaw = yawRef.current;
        const dirX = Math.sin(yaw) * -1 * fwd + Math.cos(yaw) * strafe;
        const dirZ = Math.cos(yaw) * -1 * fwd - Math.sin(yaw) * strafe;
        const L = Math.hypot(dirX, dirZ) || 1;
        let nx = posRef.current.x + (dirX / L) * WALK * dt;
        let nz = posRef.current.z + (dirZ / L) * WALK * dt;
        // 벽 여유
        nx = Math.max(M(0.35), Math.min(RW - M(0.35), nx));
        nz = Math.max(-RD + M(0.35), Math.min(-M(0.35), nz));
        // 가구 통과 금지 — 원 vs AABB 밀어내기
        const mxp = nx / U, myp = -nz / U, R = 0.28;
        for (const [x0, y0, x1, y1] of solids) {
          const cx2 = Math.max(x0, Math.min(x1, mxp));
          const cy2 = Math.max(y0, Math.min(y1, myp));
          const ddx = mxp - cx2, ddy = myp - cy2;
          const d2 = ddx * ddx + ddy * ddy;
          if (d2 < R * R) {
            const d = Math.sqrt(d2) || 0.001;
            nx = px(cx2 + (ddx / d) * R);
            nz = pz(cy2 + (ddy / d) * R);
          }
        }
        posRef.current.set(nx, EYE, nz);
      }
    }
    camera.position.copy(posRef.current);
    const cy = Math.cos(pitchRef.current);
    camera.lookAt(
      posRef.current.x - Math.sin(yawRef.current) * cy,
      posRef.current.y + Math.sin(pitchRef.current),
      posRef.current.z - Math.cos(yawRef.current) * cy,
    );

    // 별이 앵커 이동 (호스트 onMove가 갱신한 미터 좌표를 적용)
    byeoliAnchor.position.set(px(byeoliPos.current.x), 0, pz(byeoliPos.current.y));

    // 빼콩이 — 별이 뒤를 총총 따라온다
    const pet = petRef.current;
    if (pet) {
      pet.mixer.update(dt);
      const target = byeoliPos.current;
      const dx = target.x - petPos.current.x, dy = target.y - petPos.current.y;
      const dist = Math.hypot(dx, dy);
      const moving = dist > 0.55;
      if (moving) {
        const sp = Math.min(1.05, 0.5 + dist * 0.5); // 멀수록 총총
        petPos.current.x += (dx / dist) * sp * dt;
        petPos.current.y += (dy / dist) * sp * dt;
        pet.group.rotation.y = Math.atan2(dx, dy);
        if (pet.walk && !pet.walk.isRunning()) { pet.idle?.stop(); pet.sit?.stop(); pet.walk.reset().play(); }
      } else if (pet.walk?.isRunning()) {
        pet.walk.stop();
        (Math.random() < 0.3 ? pet.sit : pet.idle)?.reset().play();
      }
      pet.group.position.set(px(petPos.current.x), 0, pz(petPos.current.y));
    }

    // ── 공간의 맥박 (합계 ±4% 이내 — 빛이 사건을 만들지 않는다) ──
    const flick = 1 + Math.sin(t * 7.3) * 0.02 + Math.sin(t * 13.7 + 1.7) * 0.015;
    built.fireLight.intensity = 2.2 * flick;
    built.firePlanes.forEach((f, i) => {
      f.scale.y = 1 + Math.sin(t * 9.1 + i * 2.1) * 0.06;
      f.scale.x = 1 + Math.sin(t * 6.7 + i * 1.3) * 0.04;
    });
    const breathe = 1 + Math.sin((t / 9.1) * Math.PI * 2) * 0.03; // 스탠드의 호흡 ±3%
    built.lampLight.intensity = 1.7 * breathe;
    (built.lampShade.material as THREE.MeshStandardMaterial).emissiveIntensity = 1.15 * breathe;
    // 머그의 김 — 마지막 한 가닥
    built.steam.position.y = M(0.72) + ((t * 0.05) % M(0.16));
    (built.steam.material as THREE.MeshBasicMaterial).opacity =
      0.4 * (1 - ((t * 0.05) % M(0.16)) / M(0.16));
    built.steam.rotation.y = Math.atan2(camera.position.x - built.steam.position.x, camera.position.z - built.steam.position.z);
    // 진자 — 물리 시간의 소리 없는 왕복
    built.pendulum.rotation.z = Math.sin(t * Math.PI) * 0.18;
  });

  return (
    <>
      {/* 광원 봉인: 아래는 광원이 아니라 어둠이 완전한 검정으로 무너지지 않게 하는 최소 부양 */}
      <ambientLight intensity={0.26} color="#4a4238" />
      <hemisphereLight intensity={0.16} color="#57606e" groundColor="#3a2f22" />
      {/* ⭐ 별이 — 서재에도 별이를 소환한다. 별이는 자기 삶을 산다 (관찰자 원칙). */}
      <Byeoli host={host} />
    </>
  );
}

// ---- 엔트리: App이 ?manri=1 에서 이 컴포넌트만 렌더한다 ----
export function ManriWorld({ walkerIdx }: { walkerIdx: number }) {
  return (
    <Canvas
      className="world-canvas"
      camera={{ position: [px(3.6), EYE, pz(0.45)], fov: 38, near: 0.05, far: 60 }}
      dpr={[1, 2]}
      gl={{ preserveDrawingBuffer: true, antialias: true }}
    >
      <ManriScene walkerIdx={walkerIdx} />
    </Canvas>
  );
}
