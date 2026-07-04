# Asset Batch — BUILD 068 Memory Parts

이번 묶음은 완성된 건물/방/쉼터를 그대로 배치하는 용도가 아니라, **기억의 부품**으로 분해해서 쓰기 위한 자산이다.

## Registered Assets

| Asset | Original file | Category | Priority | Intended Use | Notes |
|---|---|---|---|---|---|
| Isometric Rooms | `isometric_rooms.fbx` | Architecture / Interior / Memory Room | ★★★★★ | 공중에 잘린 방, 절벽 속 방, 길 아래 방 | MIMESIS 대표 오브젝트 후보. 풍경보다 개인적인 기억을 담당 |
| Cowshed | `cowshed_FBX.rar` | Architecture / Shelter / Rural Memory | ★★★★☆ | 오래된 헛간, 반쯤 무너진 쉼터 | 그대로 배치하지 말고 지붕/기둥/내부 흔적으로 사용 |
| Shelter | `Shelter.fbx` | Architecture / Shelter | ★★★★★ | 쉼의 기억, 길 옆 매몰 쉼터 | 지붕과 기둥 위주로 분해 사용 |
| Wooden Collection | `Collection_wooden_V01.FBX` | Parts / Wood / Structure | ★★★★★ | 길 단면, 부서진 난간, 지층 속 나무 조각 | 완성품보다 부품팩으로서 가치가 높음 |
| Unknown FBX RAR | `FBX (1).rar` | Archive / Unknown | ★★☆☆☆ | 미확인 | 내용 확인 후 재분류 |

## Build Usage

BUILD 068에서는 실제 FBX 로딩 전, 다음 프록시를 추가했다.

- `isometric-room` proxy
- `shelter` proxy
- `cowshed` proxy
- `wood-piece` proxy
- `unknown-pack` proxy

## Design Rule

이 묶음의 핵심 규칙:

> 방은 집보다 더 개인적인 기억이다.

따라서 `isometric_rooms.fbx`는 단순 실내 세트가 아니라, 절벽과 길 아래에 박히는 **기억의 단면**으로 사용한다.

## Future Tasks

- 실제 `isometric_rooms.fbx` 구조 확인
- Room 단위로 분해 가능한지 확인
- desk / chair / wall / floor / bed / lamp가 분리되어 있으면 `MemoryParts`의 핵심 스폰 후보로 승격
- `Collection_wooden_V01.FBX`는 Path Generator v2의 edge debris 후보로 분석
