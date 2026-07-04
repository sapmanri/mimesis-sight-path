# MIMESIS Asset Warehouse

MIMESIS Sight Path의 오브젝트 자산 창고다.

이 문서는 지금 당장 장면에 넣기 위한 목록이 아니라, 나중에 MIMESIS 세계를 만들 때 다시 꺼내 쓰기 위한 인덱스다.

핵심 원칙:
- 길이 예뻐지기 전까지는 장면에 오브젝트를 과하게 넣지 않는다.
- 업로드된 FBX / ZIP / RAR / 7Z 자산은 버리지 않고 이 문서에 먼저 등록한다.
- 실제 장면 투입은 길, 카메라, 배경 레이어가 안정된 뒤 한다.
- 오브젝트는 장식이 아니라 기억을 걷게 하는 장치로 사용한다.

## 폴더 구조 제안

```txt
public/assets/warehouse/
  01_path/
    bridge/
    cliff/
    stone/
    wall/
  02_nature/
    grass/
    rock/
    wood/
    cactus/
    cloud/
    rain/
  03_architecture/
    house/
    cottage/
    ruin/
    sunda_house/
    haunted_house/
    pillar/
  04_props/
    suitcase/
    sign/
    fire_hydrant/
    bookshelf/
    clock/
    item_pack/
    debris/
  05_vehicles/
    boat/
    truck/
  06_characters/
    scavenger/
  07_fx/
    cloud/
    rain/
    light/
  99_archive/
```

## 품질 등급 기준

| 등급 | 의미 |
|---|---|
| ★★★★★ | 메인 월드에 바로 사용할 가치가 높음 |
| ★★★★☆ | 약간의 스케일/머티리얼 정리 후 사용 |
| ★★★☆☆ | 배경용 또는 특정 장면용 |
| ★★☆☆☆ | 부품으로 분해하거나 보관 |
| ★☆☆☆☆ | 일단 보관 |

## 현재 등록 자산

### 01 Path / Road / Terrain Edge

| Asset | Original file | Use | Priority | Notes |
|---|---|---|---|---|
| Bridge | `FBX_Bridge(1).rar` | 섬과 섬 사이 연결, 기억 전환 구간 | ★★★★★ | 길 완성 후 가장 먼저 테스트할 후보 |
| Cliff Low | `cliff_low(1).fbx` | floating island 단면, 원거리 절벽 | ★★★★★ | 현재 길 단면 개선에 직접 활용 가능 |
| Stone 11 | `stone11(1).fbx` | 길 가장자리 돌, 이음새 숨김 | ★★★★☆ | 반복 배치용 |
| Wall A | `xfpzgroiyups-wall(2).zip` | 폐허, 길 경계, 기억의 벽 | ★★★★☆ | 배경/중경 후보 |
| Wall B | `m57gfu447abk-Wall(2).rar` | 폐허, 길 경계, 기억의 벽 | ★★★★☆ | Wall A와 비교 필요 |
| Brick | `pxfpf20su7ls-Brick(2).rar` | 길 가장자리, 오래된 구조물 | ★★★☆☆ | 조각/부품용 |
| Blocks | `Blocks(1).FBX` | 지형 보강, 길 옆 부품 | ★★★☆☆ | low poly 질감 확인 필요 |
| Block Low | `block_low_FBX(1).rar` | 지형 보강, 폐허 조각 | ★★★☆☆ | 배경용 |

### 02 Nature

| Asset | Original file | Use | Priority | Notes |
|---|---|---|---|---|
| Cloud Polygon | `Cloud_Polygon_Blender_1.fbx` | 하늘, 원거리 레이어, 팅커벨 전 단계 분위기 | ★★★★★ | 현재 안개 제거 후 깨끗한 하늘용 후보 |
| Marble Grass | `oz3cxs1hq03k-marblegrass(2).zip` | 길 가장자리 풀, 이음새 숨김 | ★★★★★ | Feather Blend와 잘 맞음 |
| Grass FBX | `sb43aqq8sjk0-Grass_fbx(1).zip` | 길 주변 잔디 | ★★★★★ | 길 완성 후 우선 테스트 |
| Rock | `naawkhr5zw1s-Rock(1).7z` | 길 가장자리, 섬 단면 | ★★★★★ | 반복 배치용 |
| Rock Pack | `85-rocks(1).zip` | 다양한 바위 세트 | ★★★★★ | 랜덤 배치 후보 |
| Rock1 TyroSmith | `1elmla01hh-Rock1_BYTyroSmith(1).zip` | 포인트 바위 | ★★★★☆ | 스케일 확인 필요 |
| Wood | `6s3hqe2d6rr4-Wood(1).zip` | 나무 조각, 다리 주변, 폐허 | ★★★★☆ | 기억 오브젝트 후보 |
| Cactus Lowpoly | `Cactus_lowpoly(1).fbx` | 건조한 섬/특정 기억 장면 | ★★★☆☆ | 현재 제주 길에는 보류 |
| Rain FX | `6dlly90x3j-rain(2).zip` | 비 오는 기억, 전환 효과 | ★★★★☆ | 나중에 카드/장면별 날씨에 사용 |

### 03 Architecture

| Asset | Original file | Use | Priority | Notes |
|---|---|---|---|---|
| House | `house_fbx.zip` | 섬 위의 집, 기억의 목적지 | ★★★★★ | 핵심 오브젝트 후보 |
| Simple House | `gu7u77vio0zk-simple_house(1).zip` | 작은 집, 원거리 마을 | ★★★★★ | low poly라 잘 맞을 가능성 높음 |
| Cottage | `53-cottage_fbx(1).zip` | 따뜻한 기억의 집 | ★★★★★ | MIMESIS 톤과 잘 맞음 |
| Home Sunda | `41-home_sunda(1).zip` | 이국적 기억 공간 | ★★★★☆ | 특정 챕터용 |
| Haunted Sundanese Traditional House | `50-haunted-sundanese-traditional-house(1).zip` | 상실/밤/폐허 장면 | ★★★★☆ | 밝은 길 단계에서는 보류 |
| Ruin02 | `Ruin02_fbx(1).rar` | 폐허, 기억의 잔해 | ★★★★★ | 길 옆 중경 오브젝트 후보 |
| Pillar Model | `wrzuj36kxa80-Pillar_Model(1).zip` | 기억의 문, 폐허, 입구 | ★★★★☆ | 게이트 연출 가능 |
| AIO Bookshelf | `idv52g8s4zr4-AIO_BookShelf(2).7z` | 실내 기억, 책/아카이브 공간 | ★★★★☆ | Sight Path보다는 MIMESIS OS/Archive에 적합 |

### 04 Props

| Asset | Original file | Use | Priority | Notes |
|---|---|---|---|---|
| Old Suitcase | `Old_Suitcase.fbx` | 여행, 기억, 시작 지점 | ★★★★★ | 감정 소품으로 매우 좋음 |
| Suitcase2 | `Suitcase2.fbx` | Old Suitcase 변형/대체 | ★★★★★ | 두 개 비교 후 선택 |
| Road Sign | `RoadSign(1).fbx` | 길 안내, 선택지, 기억 표지 | ★★★★☆ | Sight Path에 잘 맞음 |
| West Sign | `WestSignFBX(1).rar` | 방향성, 길의 농담 | ★★★☆☆ | 특정 장면용 |
| Traffic Signal | `Traffic_signal_FBX(1).rar` | 도시 기억, 멈춤/대기 상징 | ★★★☆☆ | 현재 자연 길에는 보류 |
| Traffic Cone | `Traffic_cone_FBX(1).rar` | 공사 중인 기억, 임시 경계 | ★★★☆☆ | 장면용 |
| Fire Hydrant | `firehydrant(1).FBX` | 도시 소품, 스케일 기준 | ★★★☆☆ | 특정 챕터용 |
| Clock Constraints | `3ok8cthawqio-Clock_Constraints_for_Animations(2).zip` | 시간, 기억, 멈춤 상징 | ★★★★★ | MIMESIS 핵심 상징과 잘 맞음 |
| Parts For Sale | `PartsForSale(1).fbx` | 시장/상점/분해된 기억 | ★★★☆☆ | 소품 묶음 가능 |
| Pack of Items | `Pack_of_items(1).fbx` | 장면 디테일, 생활감 | ★★★★☆ | 추후 분해해서 사용 |
| Item01 | `e9cb403o4yrk-item01(1).zip` | 소품/바닥 디테일 | ★★★☆☆ | 내용 확인 필요 |
| Debris | `g3yul469purk-debris(1).rar` | 폐허, 길 이음새, 지면 디테일 | ★★★★★ | 지금 길 개선에도 활용 가능 |
| n19_e41 | `n19_e41_fbx(1).rar` | 미확인 | ★★☆☆☆ | 내용 확인 후 재분류 |

### 05 Vehicles

| Asset | Original file | Use | Priority | Notes |
|---|---|---|---|---|
| Wooden Rowboat | `Wooden_Rowboat.fbx` | 섬 연결, 물 위 기억, 정박지 | ★★★★★ | 매우 좋은 감정 오브젝트 |
| Oil Truck | `oil-truck_fbx(1).rar` | 도시/산업 기억 | ★★☆☆☆ | 현재 세계관에는 보류, 특정 장면용 |

### 06 Characters

| Asset | Original file | Use | Priority | Notes |
|---|---|---|---|---|
| Scavenger | `Scavenger.fbx` | 임시 인간 캐릭터, 나중의 walker 후보 | ★★★★☆ | 현재는 숨김. 길 완성 후 테스트 |

### 07 Structures / Energy / FX

| Asset | Original file | Use | Priority | Notes |
|---|---|---|---|---|
| Eolic / Wind Turbine | `97-eolic-fbx(2).rar` | 원거리 랜드마크, 바람의 기억 | ★★★★☆ | 하늘/먼 산 레이어 안정 후 사용 |

## 우선 투입 후보

길이 안정된 뒤 먼저 테스트할 자산:
1. Grass FBX / Marble Grass
2. Rock Pack / Cliff Low
3. Old Suitcase / Suitcase2
4. Bridge
5. Cloud Polygon
6. Wooden Rowboat
7. Cottage / Simple House

## 보류 후보

지금 당장 넣으면 길의 집중도를 흐릴 수 있는 자산:
- Scavenger
- Traffic Signal
- Oil Truck
- Haunted House
- Fire Hydrant
- Traffic Cone

## 다음 할 일

- 실제 바이너리 파일은 `public/assets/warehouse/` 하위로 정리한다.
- 각 자산마다 나중에 썸네일을 만든다.
- `asset-browser` 페이지를 만들어 검색/태그/등급으로 찾을 수 있게 한다.
- GLB 변환 파이프라인을 별도로 만든다.
