# Asset Batch — BUILD 072 Memory Clusters

이번 묶음은 개별 오브젝트가 아니라 **길가의 기억 묶음**으로 쓰기 위한 자산이다.

## Street / Signal Assets

| Asset | Original file | Category | Priority | Cluster Use |
|---|---|---|---|---|
| Sign | `Sign.fbx` | Street / Sign | ★★★★☆ | Forgotten Street |
| Traffic Light | `trafficlightfbx.rar` | Street / Signal | ★★★★☆ | Stopped Road |
| Payphone | `payphone_fbx.zip` | Street / Phone | ★★★★★ | Forgotten Street |
| Road Blocker 1 | `RoadBlocker1.fbx` | Street / Barrier | ★★★★☆ | Stopped Road |
| Road Blocker 2 | `RoadBlocker2.fbx` | Street / Barrier | ★★★★☆ | Stopped Road |
| Pipe A 01 | `pipe_a_01.fbx` | Industrial / Pipe | ★★★★☆ | Lost Vehicle / Street Trace |
| Pipe AA 01 | `pipe_a_a_01.fbx` | Industrial / Pipe | ★★★★☆ | Lost Vehicle / Street Trace |
| Signal Stop | `Signal_Stop_fbx.rar` | Street / Signal | ★★★★☆ | Stopped Road |
| Lamp Pillar | `Lamp_PillarFBX.rar` | Street / Light | ★★★★★ | Forgotten Street |
| Sign Collection | `PK01_1_FBX_SignTra_Collect_LOT_01_v1.0.0.zip` | Street / Sign Pack | ★★★★★ | Multi-cluster sign source |
| Radiation Warning Sign | `Radiation_Warning_Sign.rar` | Warning / Sign | ★★★☆☆ | Stopped Road / Strange Signal |

## Vehicle / Strange Assets

| Asset | Original file | Category | Priority | Cluster Use |
|---|---|---|---|---|
| Car Mesh | `carMesh.fbx` | Vehicle | ★★★★☆ | Lost Vehicle |
| M3A1 Scout Car | `M3A1_scout_car_FBX.rar` | Vehicle | ★★☆☆☆ | Archive / use carefully |
| Gunned Car | `GunnedCar.fbx` | Vehicle | ★★☆☆☆ | Archive / use carefully |
| Classic Car 2 | `classic_car_2.fbx` | Vehicle | ★★★★☆ | Lost Vehicle |
| Low Poly Cars | `LowPolyCars.fbx` | Vehicle Pack | ★★★★★ | Lost Vehicle |
| Cabina | `cabina.fbx` | Booth / Cabin | ★★★★☆ | Lost Vehicle / Forgotten Street |
| TARDIS | `TARDIS.fbx` | Strange Object | ★★★☆☆ | Strange Signal |
| Low Poly UFO | `Low_poly_ufo_FBX.zip` | Strange Object | ★★★★☆ | Strange Signal |
| Unknown FBX Pack | `fbx (2).zip` | Archive | ★★☆☆☆ | Content check needed |

## Build Usage

BUILD 072 introduces:

- `src/engine/memoryClusters.ts`
- `src/scene/MemoryClusters.tsx`

Initial cluster types:

1. `forgotten-street`
2. `stopped-road`
3. `strange-signal`
4. `lost-vehicle`

Only the first three are active in BUILD 072.

## Rule

> Do not spawn random objects. Spawn random memories.

Street assets should not sit in the center of the walking path. They belong to the side, the lower edge, the far distance, or a partially buried memory layer.
