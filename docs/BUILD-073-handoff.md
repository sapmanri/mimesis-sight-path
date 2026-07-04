# MIMESIS Sight Path — BUILD 073 · WORLD CORE

v0.4.7 (BUILD 072) → v0.5.0 (BUILD 073)
작업: Claude Fable · 검증: headless-gl 실렌더 기반

---

## 무엇이 바뀌었나 (철학 먼저)

BUILD 072가 "안 예뻐지지 않았던" 이유는 오브젝트나 모델이 부족해서가 아니었다.
**빛과 대기와 연속성**이 없었기 때문이다. BUILD 073은 그 세 가지만 고쳤다.

"Less is More. 추가보다 삭제를 우선한다" — 이번 빌드는 씬 시스템 4개를 지우고 1개로 대체했다.

## 핵심 변경 4가지

### 1. Path Generator V3 — 길은 이제 하나다
- 기존: 씬 쌍마다 별도 베지어 조각 + overlap 이어붙이기 → "조각 느낌"의 근본 원인
- 변경: 13개 장면 전체를 관통하는 **단 하나의 CatmullRomCurve3** (centripetal)
- 폭 프로파일: 좁은 둑길(0.62) + 각 장면 지점에서 가우시안으로 부풀어 오르는 "광장"(+1.7)
- 길 시작/끝에 lead-in/lead-out 11~14 유닛 → 화면 안에서 길이 뚝 끊기지 않음
- 절벽 측면: 링 5단 침식 구조, 저주파 청크 노이즈로 유기적 단면. 깊이도 구간마다 변함(4.2±1.6)
- 최하단 링은 안개색으로 45% 블렌드 → 절벽이 허공에 "녹아내림"

### 2. 대기 (이게 제일 큰 차이)
- `THREE.Fog(#4a7285, 12, 58)` + 배경 동일색 → 원거리가 안개 속으로 완전히 melt
- 조명 전면 교체: ambient 1.48 (전부 씻겨나감) → **HemisphereLight 0.55 + 따뜻한 태양광 1.35 + PCFSoft 그림자**
- 태양이 걷는 사람을 따라다녀서 그림자 카메라가 항상 유효 범위를 비춤
- ACESFilmic 톤매핑
- CSS: 필름 그레인(SVG turbulence) + 비네트 오버레이, 셸 배경을 안개색과 통일

### 3. Distant World — 닿을 수 없는 기억
- 원거리 떠 있는 섬 7개 (2개는 소실점 방향 정면에). 재질 자체를 안개색으로 30~35% 블렌드 → 항상 희미함
- 구름 밴드 6장, 별 점 60개 (fog 미적용으로 하늘에 고정)
- 기존 MemoryHorizon의 지구/달/소행성 등 SF 요소 제거 — "시대가 없는 기억 공간" 원칙

### 4. 재질 원칙 — 세계는 단단하다
- BUILD 072는 거의 모든 재질이 반투명 → 유령 같은 인상
- BUILD 073: 지형/오브젝트 전부 **불투명 + roughness 1** + 버텍스 컬러. 투명은 구름뿐
- 원근/깊이감은 투명도가 아니라 안개가 담당한다

## 파일 변경 목록

| 파일 | 상태 | 내용 |
|---|---|---|
| `src/engine/worldCore.ts` | **신규** | 세계 전체 (지형·킷·원경·조명). R3F 무관 순수 three — headless 검증 가능 |
| `src/scene/World.tsx` | 재작성 | worldCore 호출 + 걷기 카메라 리그 + fog/배경. 원본은 `World.legacy.tsx.txt` |
| `src/App.tsx` | 재작성 | Memory* 4개 시스템 제거, StoryCard/ProgressNav 복귀, dwellMs 기반 자동 진행 |
| `src/engine/pathPresets.ts` | 수정 | ObjectKit에 `person-kit`, `cloud-kit` 추가 |
| `src/data/jeju.ts` | 수정 | 장면3(앞사람 뒷모습)→person-kit, 장면5(하얀 구름)→cloud-kit |
| `src/photo-depth-road.css` | 추가 | BUILD 073 블록 (배경 통일·그레인·비네트) |

미사용이 된 파일 (지우지 않음, 홈즈 판단에 맡김):
`MemoryHorizon.tsx`, `MemoryParts.tsx`, `MemoryClusters.tsx`, `MemoryRoadSkin.tsx`, `ParallaxLayers.tsx`

## 검증 방법 (중요)

worldCore가 프레임워크 독립이라 **브라우저 없이 실렌더 검증**이 가능하다:
- headless-gl + Xvfb로 three 씬을 PNG로 렌더
- 시작점 / 중간(돌담) / 인물 장면 3컷 렌더 → 구도·팔레트 정량 확인 완료
- `npm run build` 통과 확인 완료

동봉된 `preview_*.png` 3장이 실제 배포 코드의 렌더 결과다.

## BUILD 074 제안 (다음 사람에게)

1. **FBX/GLB 교체 시스템**: worldCore의 `KITS`가 킷 이름 → Group 팩토리 구조라, GLTFLoader로 불러온 모델을 같은 자리에 끼우면 된다. Bedroom, Lighthouse부터. 단, 반드시 material override(팔레트 강제)를 걸 것 — 무료 모델 원색을 그대로 쓰면 BUILD 072로 돌아간다.
2. **카메라 shot 다양화**: 데이터에 이미 cameraShot(side/wide/overhead)이 있다. 리그에서 장면별로 오프셋만 바꾸면 됨.
3. **폴라로이드 프레임**: 레퍼런스의 떠 있는 사진 카드. 웹매거진 R2 실사진을 텍스처로 얹으면 "기억" 컨셉이 완성된다. 이게 사실 제일 기대되는 부분.
4. Soundscape 재연결 (지금 App에서 빠져 있음).

## 튜닝 손잡이 (감성 조정용)

- 안개 거리: `World.tsx`의 `args={[PALETTE.fog, 12, 58]}` — near를 줄이면 더 몽환적
- 팔레트 전체: `worldCore.ts` 상단 `PALETTE` 한 곳
- 광장 크기: `widthAt`의 `1.7` (플라자 반경)
- 길 굽이: `buildWorld`의 `meander` 계수 (2.6 / 1.4)
- 카메라 높이/거리: `World.tsx`의 `(0, 3.1, 0)` / `-5.0`

---

우리는 게임을 만드는 것이 아니라,
사람이 자신의 기억을 천천히 걸어 들어가는 경험을 만들고 있다.
