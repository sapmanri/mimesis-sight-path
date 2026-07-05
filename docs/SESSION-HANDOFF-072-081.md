# MIMESIS Sight Path — 세션 인계문서 (BUILD 072 → 081)

작성: Claude Fable · 2026-07-05 · 다음 세션의 나(또는 홈즈)에게

---

## 0. 프로젝트 한 줄

"사람이 자신의 기억을 걸어서 읽는 매체." 게임이 아니다. 주인공은 UI도 캐릭터도 카메라도 아닌 **걷는 시간**이다. Less is More — 추가보다 삭제를 우선한다.

- 라이브: https://mimesis-sight-path.pages.dev (Cloudflare Pages, main push 시 자동 배포 1~2분)
- 레포: sapmanri/mimesis-sight-path (public)
- 현재: **v0.9.0 · LIVING WALKER · BUILD 081** (commit e63ab7a)
- 레퍼런스 이미지: "JEJU 2024" 절벽 둑길 일러스트 (안개 위 좁은 길 + 낡은 문/캐리어/뒷모습 인물, 청록 안개, 따뜻한 모래빛)

## 1. 이 세션에서 일어난 일 (빌드별)

| BUILD | 이름 | 핵심 |
|---|---|---|
| 073 | WORLD CORE | 씬 시스템 4개(MemoryHorizon/Parts/Clusters/RoadSkin) 삭제 → `worldCore.ts` 단일 코어. 전 장면을 관통하는 **하나의 CatmullRom 절벽 둑길**, fog+배경 동일색, 따뜻한 태양광+그림자, ACESFilmic |
| 074 | NARROW PATH | 길폭 0.39배(반폭 0.24). **광장 = importance 연동 이벤트** (바다 1.6만 크게 열림). 카메라 근접(높이 2.15, 거리 -3.8) |
| 075 | REAL ASSETS | GLB 파이프라인: fbx2gltf → **applyPalette**(색조 리맵, 명도 보존) → **normalizeModel**(bbox 정규화) → 프록시 폴백. Old_Suitcase, stone11, Snow_Cabin, Lighthouse 투입 |
| 076 | WORN SURFACES | 프로시저럴 DataTexture (길: 모래알+얼룩+자갈점 / 절벽: 침식 스트릭+지층+림 AO). UV는 지오메트리 생성 시 부여 |
| 077 | THE WALKER | 걷는 인물 + 카메라 추적 + 걸음 bob/sway. Rock0/3/7 산란 46곳, 풀잎 다발 140곳 |
| 078-079 | SUNKEN/RISING MIST | 절벽 깊이 2.9→0.85, 링 5→3 (Vase 관찰: "안개가 길 끄트머리까지" = 리소스 절감 + 분위기) |
| 080 | HEIGHT FOG | **높이 안개 셰이더** (onBeforeCompile, 조명 후 y기반 배경 블렌드). 삼각 부유섬 제거, 구름 9장 확대, 등대 9유닛 소실점 배치 |
| 081 | LIVING WALKER | **Peasant Nolant 워커 — 내장 Walk/Idle 클립 재생** (AnimationMixer 크로스페이드, timeScale 0.72). Kawasaki 경비행기가 판자 프록시 대체 (허공 9유닛, 안개 반잠김). CaveWalls 슬랩 절벽면 투입 |

## 2. 아키텍처 (핵심 파일)

```
src/engine/worldCore.ts   ← 세계 전부. R3F 무관 순수 three (헤드리스 검증 가능)
  PALETTE / HEIGHT_FOG    ← 감성 튜닝은 여기 상수부터
  buildWorld(scenes, loadModel?) → { group, curve, anchors, sun, progressToT, ready }
  applyHeightFog(mat)     ← 셰이더 주입. 상수는 sRGB 하드코딩 (아래 §5-1 참고!)
  applyPalette / normalizeModel / MODELS / loadKitModel / loadWalkerAsset
  KITS                    ← 킷 이름 → 프로시저럴 그룹 (모델 로드 실패 시 폴백)
  attachModels()          ← 실물 GLB 비동기 부착 (담/산란/오두막/등대/비행기/워커)
src/scene/World.tsx       ← 카메라 리그 + 워커 배치/애니메이션 + fog/배경
src/App.tsx               ← 씬 진행(activeIndex), BUILD_LABEL, 그레인/비네트 오버레이
src/data/jeju.ts          ← 13장면 (importance가 광장 크기를 결정!)
public/assets/models/     ← 투입된 GLB (11MB): Suitcase, stone11, Snow_Cabin,
                            Lighthouse, Rock0/3/7, RockA-D, CaveA/B, Peasant, Kawasaki
docs/BUILD-073-handoff.md ← 073 시점 문서 (철학/원칙 상세)
docs/asset-registry/      ← 홈즈의 123개 자산 인덱스 JSON/MD
```

## 3. 자산 창고 (중요)

- **GitHub Releases가 실물 창고**: `assets-v1` (87개, 2.0GB) + `assets-v2` (56개, 0.6GB)
- 홈즈 레지스트리(docs/asset-registry/)에 파일별 분류·우선순위 있음
- **이번 세션은 release-assets.githubusercontent.com이 프록시에 막혀** 릴리즈 다운로드 불가 → Vase가 파일을 채팅에 직접 업로드하는 방식으로 진행함. **Vase가 허용목록에 도메인을 추가했으므로 새 세션부터는 직접 다운로드 가능할 것** — 첫 작업으로 `curl -sL <release URL>` 테스트할 것. 실패하면 다시 채팅 업로드 방식.
- 변환 파이프라인: `npm i fbx2gltf` (gltest 폴더) → convert → 팔레트/정규화는 worldCore가 로드 시 자동

## 4. 검증 환경 (이 세션의 무기 — 재구축법)

브라우저 없이 실렌더 검증 가능. 새 컨테이너에서 재구축:
```bash
apt-get update; apt-get install -y libxi-dev libglu1-mesa-dev libglew-dev pkg-config xvfb
mkdir gltest && cd gltest && npm init -y
npm install gl three@0.152.2 pngjs fbx2gltf --nodedir=/usr   # nodejs.org 막혀서 로컬 헤더 필수!
```
- 렌더: `xvfb-run -a node render.cjs <scene.cjs> out.png 900 1200 <progress>`
- render.cjs/sceneJejuTS.cjs는 이 세션 산출물 — 레포에 없음. 필요하면 다시 작성 (구조: worldCore를 esbuild로 CJS 번들 → three@0.152로 렌더. GLTFLoader는 node 심 필요: `globalThis.self`, `URL.createObjectURL` 스텁, `TextureLoader.load` 더미)
- **이미지 뷰어가 자주 placeholder만 반환** → PIL 정량 검증(영역 평균색, 픽셀 카운트)을 병행할 것. 프리뷰는 outputs로 Vase에게 전달해 눈 검증 받는 루프가 실전적.

## 5. 함정 노트 (같은 데서 두 번 넘어지지 말 것)

1. **three 색공간**: `new THREE.Color(hex)`는 **리니어 값**을 반환. 셰이더의 최종 색(sRGB 인코딩 후)과 섞으려면 **hex를 직접 파싱한 sRGB 값**을 써야 함. BUILD 080의 "물잠김 경계선" 범인이 이거였음. onBeforeCompile 커스텀 유니폼도 검증 환경에서 바인딩이 안 됐음 → **상수 하드코딩**으로 해결 (applyHeightFog 참조)
2. **GLSL smoothstep(e0,e1,x)는 e0<e1 필수** — 거꾸로 넣으면 미정의 동작
3. **python 문자열 replace 패치는 반드시 결과 grep으로 검증** — BUILD 080에서 jeju.ts 패치가 조용히 no-op (scale 0.54를 0.52로 잘못 짚음) → "판자"가 살아남았고 Vase가 발견함
4. **fitMaxDim**: 납작한 모델(stone11 등)은 height 기준 정규화 시 거대해짐 → MODELS에 fitMaxDim 플래그
5. **무료 FBX 함정들**: Grass/marblegrass = 텍스처 그려진 납작한 판 (팔레트 파이프라인에서 소멸, 사용 불가) / debris.fbx = 파싱 불가 (debris.obj로 재시도 여지) / Rin.fbx = 스킨드 16MB (웹 부적합) / Airplane.fbx = 747 21MB (부적합)
6. **모델 스킵 이등분법**: sceneJejuTS.cjs에 NO_MODELS / SKIP=<부분문자열> 환경변수 스위치 있음 (레포엔 없음, 재작성 시 유용)

## 6. 미해결 이슈 (다음 세션 최우선)

**★ RockSet06 담 미스터리**: RockA-D로 담을 다시 쌓으면 화면에 거대한 백색 덩어리(약 29,000px, 중성백 237,238,236)가 나타남. 이등분 결과: 담만 제외하면 사라짐(16,524→1,343). 그런데 **RockA 단독 프로브는 정상** (0.22 크기, 색 196,190,178). 개별은 정상인데 담 조립 시 괴물 발생 — 미검증 가설: (a) 내가 쓴 clone 시믹 객체(`{clone: ...} as Group`)와 원본 코드의 상호작용, (b) RockB/C/D 중 하나에 백색 배경판 메시 포함(A만 프로브함!), (c) Math.random 클론 시점 문제. **RockB/C/D 각각 단독 프로브부터 시작할 것.** 현재는 stone11 담으로 롤백된 상태 (git log에서 롤백 diff 확인 가능).

## 7. 다음 작업 큐 (우선순위)

1. RockSet 담 미스터리 해결 → RockSet 담 재투입 (§6)
2. **폴라로이드 프레임 + 웹매거진 실사진** — 길가에 떠 있는 사진 카드에 R2의 실제 제주 사진 텍스처. "기억" 컨셉의 완성이자 제일 기대되는 작업. R2 이미지 URL은 carousel-generator 프로젝트의 cache/index.json 참조
3. 장면별 cameraShot(side/wide/overhead) 활용 — 데이터에 이미 있음, 리그에서 오프셋만 분기
4. Soundscape 재연결 (src/audio/Soundscape.tsx 존재, App에서 빠져 있음)
5. StoryCard/ProgressNav 라이브 확인 — 컴포넌트는 연결돼 있으나 Vase 스크린샷들에서 안 보였음. 모바일 뷰포트/z-index 확인 필요
6. 등대 가시성 재확인 (BUILD 080에서 9유닛/-42 배치 — Vase 최종 확인 안 받음)

## 8. 운영 메모

- 배포 확인: `api.github.com/repos/sapmanri/mimesis-sight-path/commits/main/check-runs` → "Cloudflare Pages | completed | success"
- **GitHub 토큰**: 이 세션에서 사용된 토큰이 대화에 노출돼 있음. **Vase에게 revoke + 재발급 요청할 것** (여러 번 권고했으나 미확인). 새 토큰은 repo scope면 충분 (workflow scope 없으면 .github/workflows 푸시 불가 — Actions 우회는 막혀 있음)
- 커밋 컨벤션: "BUILD NNN: 이름 — 시적 한 줄" + 변경 bullet. BUILD_LABEL(App.tsx)도 매번 갱신
- Vase 피드백 루프가 이 프로젝트의 실질 QA — 프리뷰 PNG를 outputs로 전달하고 라이브 확인 받는 리듬 유지
- 홈즈(ChatGPT)는 총감독 Vase의 아키텍처/QC 파트너. 인수인계서 스타일 참고: 철학 먼저, 숫자는 근거와 함께

---

걷는 시간이 주인공이다.
길은 그 시간을 감싸는 정도로 좁고 조용해야 한다.
