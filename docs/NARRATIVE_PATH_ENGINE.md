# Narrative Path Engine

MIMESIS Sight Path는 장면을 하나씩 손으로 배치하는 웹사이트가 아니라, 웹매거진의 글과 사진을 바탕으로 `시선이 지나간 이야기길`을 조합하는 엔진이다.

## 핵심 원칙

- 사용자는 자유롭게 탐험하는 것이 아니라, 누군가의 시선이 지나간 길을 다시 걷는다.
- 각 장면은 독립 오브젝트가 아니라 길 위에서 만나는 쉼표다.
- 오브젝트는 현실 사물을 그대로 재현하지 않는다. 기억 속에서 남은 형태와 질감으로 만든다.
- 카메라는 고정된 follow camera가 아니라 Observation Director가 장면마다 시선 위치를 선택한다.
- 머무는 시간은 하드코딩하지 않는다. 장면의 텍스트 길이, 감정, 오브젝트 중요도, 카메라 샷을 기준으로 계산한다.

## 구성요소 카테고리

### 1. Path Segment

이야기의 주무대가 되는 길 조각.

- straight: 거의 직선
- soft-curve: 살짝 굽은 길
- deep-curve: 크게 휘는 길
- bridge: 다리처럼 좁고 길게 이어지는 길
- stair: 낮은 계단
- threshold: 문턱, 입구, 장면 전환부
- open-field: 길이 넓어져 잠시 숨을 쉬는 구간

### 2. Surface State

길의 표면 상태.

- dry-stone
- wet-stone
- mud
- sand
- grass-edge
- snow-thin
- rain-puddle
- moss-aged

### 3. Environment Particle

길 위와 주변부에 흩뿌려지는 작은 요소.

- pebble
- weed
- fallen-leaf
- dust
- mist-dot
- rain-ring
- water-glint
- grass-clump

### 4. Sky / Weather

배경 분위기.

- clear-day
- soft-cloud
- rain-cloud
- drizzle
- moon-night
- sunset-fade
- fog-morning

### 5. Memory Object Kit

반복 재사용할 수 있는 주요 오브젝트 키트.

- door-kit
- suitcase-kit
- book-kit
- cup-kit
- stone-wall-kit
- cd-shelf-kit
- fruit-kit
- airplane-wing-kit
- sea-edge-kit

각 키트는 여러 variation을 가진다.

예: suitcase-kit

- full suitcase
- half-buried suitcase
- handle-only
- wheel-track
- strap-fragment

## 자동 조합 흐름

웹매거진 한 편이 들어오면 아래처럼 변환한다.

1. 원고에서 관찰 포인트를 추출한다.
2. 각 포인트에 scene tag를 부여한다.
3. tag를 바탕으로 path segment, surface, weather, object kit을 선택한다.
4. Observation Director가 카메라 샷과 머무는 시간을 계산한다.
5. Asset Scatter가 길 위에 작은 요소를 흩뿌린다.
6. 최종적으로 하나의 이야기길이 생성된다.

## 머무는 시간 계산 규칙 초안

장면별 dwellMs는 직접 숫자를 입력하지 않는다.

```ts
base = 4200
textWeight = lineCount * 850
importanceWeight = importance * 1200
cameraWeight = shotType === 'wide' ? 1600 : shotType === 'macro' ? 1100 : 700
emotionWeight = stillness * 900

result = clamp(base + textWeight + importanceWeight + cameraWeight + emotionWeight, 5200, 14000)
```

## 다음 구현 순서

1. `scene blueprints` 데이터 구조 만들기
2. path segment preset 정의
3. scatter preset 정의
4. dwell time calculator 구현
5. 기존 `jeju.ts`를 하드코딩 데이터에서 blueprint 기반으로 이전
6. 오브젝트 키트 렌더러 구현
7. 웹매거진 → Sight Path 변환기 설계
