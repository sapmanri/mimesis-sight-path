# BUILD 431-T — Authority 1초 틱 의존성 조사 (분석 전용 · 코드 무변경)

조사: Claude 2026-07-20 · 요청: Vase · 수신: 홈즈(Authority 소유자)

> **이 문서는 Authority를 바꾸지 않는다.** 무엇이 1초 틱에 매달려 있고, 매초 저장이
> 실제로 무엇 때문에 필요한지만 밝힌다. 결정은 수치와 소유자 판단으로.

## 0. 한 줄

1초 alarm은 낭비 코드이기 전에 **별이가 관찰자 없이도 계속 살아가게 만든 심장박동**이다.
그런데 심장박동과 **일기장 통째 다시 쓰기**가 한 덩어리로 묶여 있고,
둘을 떼려는 순간 `MAX_DT_SECONDS = 2`가 막는다.

## 1. 현재 구조

`authority/src/index.ts`

```ts
async alarm() {
  this.persisted = advanceCanaryRuntime(this.persisted, Date.now());
  await this.ctx.storage.put(STORAGE_KEY, this.persisted);   // 전체 상태를 매초
  await this.ctx.storage.setAlarm(Date.now() + authorityTickMs);  // TICK_MS = 1000
}
```

alarm이 끝에서 자신을 재예약하므로 **객체는 영구히 주기적 활성**이다. 관찰자 수와 무관하다.
`live-sync`(2초)·ops 콘솔(5초)은 이 바닥선 **위에 얹히는 봉우리**이고,
`live-sync`는 `visibilityState !== 'visible'`이면 폴링하지 않으므로 백그라운드 탭은 이미 조용하다.

## 2. 🔴 진짜 장애물 — `MAX_DT_SECONDS = 2`

`authority/src/runtime.ts:16`

```ts
const MAX_DT_SECONDS = 2;
const dt = Math.min(elapsed, MAX_DT_SECONDS);
```

`advanceCanaryRuntime(persisted, now)`는 **(체크포인트, now)의 순수 함수**다.
따라서 이론상 저장을 건너뛰어도 나중에 한 번에 진행시킬 수 있다 — **2초까지만.**

그 이상 벌어지면 초과분은 **조용히 사라진다**(오류도 로그도 없다):

| 공백 | 실제 진행 | 잃는 세계 시간 |
|---|---|---|
| 1초 | 1초 | 0 |
| 2초 | 2초 | 0 |
| 10초 | **2초** | 8초 |
| 60초 | **2초** | 58초 |

**별이의 하루가 60초**(`BYEOLI_DAY_MS = 60_000`)임을 생각하면 8초 손실은 하루의 13%다.

### 왜 이게 persist와 얽히는가

`this.persisted`는 **메모리**이고 `storage.put`이 축출(eviction)을 견디는 유일한 사본이다.
체크포인트를 10초 간격으로 두고 7초 시점에 축출되면, 복구 시 `elapsed = 7` → `dt = 2` →
**5초가 영구히 증발**한다. 축출이 잦을수록 별이의 시간이 실제보다 느리게 흐른다.

> 즉 매초 저장은 "그래야 해서"가 아니라 **2초 클램프가 만든 결과**다.
> persist 주기를 늘리려면 `MAX_DT_SECONDS`를 함께 손봐야 한다. 순서가 반대면 시간이 샌다.

## 3. 필드 분류 — 무엇이 정말 매초 저장돼야 하는가

### A. `now`에서 재계산 가능 → **저장 불필요**

| 필드 | 근거 |
|---|---|
| `sky.t`, `sky.phase` | `skyProgress(now)` / `skyPhase(t)` — 순수 함수 |
| `epoch` | `Math.floor(now / BYEOLI_DAY_MS)` |
| `updatedAt` | `now` |
| `camera.worldX`, `camera.camShift` | `byeoli.worldX` 파생 |

### B. 적분값 → 체크포인트 + 경과시간으로 **복원 가능** (단 2초 클램프에 막힘)

`byeoli.worldX` · `walkPhase` · `ppae.x/phase` · `sky.clouds[].x` ·
`telemetry.fatigue` · `flash.timer` · `byeoli.actTimer`

전부 `dt`에 선형이라 결정론적이다. 클램프만 풀리면 큰 간격도 한 번에 진행 가능하다.

### C. 사건성 → **발생 시점에 반드시 저장** (재계산 불가)

| 필드 | 왜 |
|---|---|
| `props[].phase`, `reactedThisPass` | 마주침의 결과. 한 번 지나가면 되돌릴 수 없다 |
| `state.liveEvent`, `recentEventIds` | 별이가 무엇을 겪었는가 — 관찰의 원천 |
| `byeoli.state` / `actAction` / `actTarget` 전환 | 행동 시작·종료 시점 |
| `telemetry` 누적 카운트 | 관찰·일기 수 |
| `sequence` | `maybeEncounter`의 RNG 시드(`makeRng(sequence * ...)`) |

⚠ **`sequence`가 RNG 시드**라는 점이 중요하다. 틱 수가 곧 난수열이므로,
persist 주기를 바꿔 틱 횟수가 달라지면 **마주침의 결과 자체가 달라진다**.
이건 비용 문제가 아니라 세계의 재현성 문제다.

## 4. 그래서 순서

```
1. 대시보드 실측 (Requests / Duration GB-s)     ← 지금 여기
2. MAX_DT_SECONDS 재검토 — 이게 선행 조건
3. persist를 전환 시점 + 주기 체크포인트로 분리
4. (그래도 높으면) 상태별 적응형 alarm
5. live-sync 적응형 폴링 — 봉우리 깎기, 위와 독립
```

**2번 없이 3번을 하면 별이의 시간이 샌다.**

## 5. 비용 추정에 대한 유보

앞서 `30일 × 초 × 128MB ≈ 331,776 GB-s`로 계산했으나 이는 **객체가 매 초를 통째로
활성으로 과금받는 최악 가정**이다. alarm 핸들러가 짧게 끝나고 곧 내려가면 실제 duration은
훨씬 낮다. 반대로 매 alarm마다 오래 남으면 그 값에 근접한다.
**계산이 아니라 대시보드의 실제 GB-s가 진실이다.** 요청과 duration은 별도 항목으로 과금된다.

## 6. 판정 (현재)

| 질문 | 답 |
|---|---|
| 1초 alarm 자체가 버그인가 | **아니오** — 설계 의도(관찰자 없는 세계) |
| 비용상 반드시 고쳐야 하는가 | **아직 모름** — 실측 필요 |
| 별이의 존재성에 중요한가 | **예** — 세계가 스스로 존재하는 유일한 구현부 |
| 매초 전체 상태를 put 해야 하는가 | **아니오로 보이나**, `MAX_DT_SECONDS`와 `sequence` RNG가 선결 조건 |

## 7. 🔒 동결 (Vase 판정 2026-07-20 — 실측 전까지)

세 값이 서로 묶여 있어 따로 볼 수 없다:

```
TICK_MS → dt 적분 → sequence 증가 → encounter RNG → 별이의 실제 경험
```

하나를 건드리면 걷기 속도만이 아니라 **무엇을 만나고 어떤 하루를 사는지**가 달라진다.
비용이 실제로 크지 않다면 존재성과 재현성을 건드릴 이유가 없다.

**대시보드 실측 전까지 다음 네 가지 변경 금지:**

```
TICK_MS
MAX_DT_SECONDS
sequence의 RNG 시드 역할
persist 주기
```

## 8. `MAX_DT_SECONDS`는 클램프가 아니라 catch-up이어야 한다

원래 의도는 거의 확실히 "오래 멈춘 뒤 복귀 → 순간이동/사건 폭발" 방어다.
그런데 현재 구현은 **긴 공백을 안전하게 나눠 처리**가 아니라
**2초만 살고 나머지 세계 시간은 삭제**다. 둘은 전혀 다르다.

고친다면 클램프 제거가 아니라 고정 스텝 소화:

```ts
let remaining = elapsed;
while (remaining > 0) {
  const step = Math.min(remaining, 1);
  advanceOneStep(step);
  remaining -= step;
}
```

단 60초 공백이면 60틱을 한 alarm에서 도는 셈이라 사건·RNG·CPU 폭주 위험이 있다.
그래서 **층을 나눠야** 한다:

| 층 | 예 | 긴 공백에서 |
|---|---|---|
| **연속 상태** | 위치·피로·하늘·타이머 | 경과 시간만큼 그대로 복원 |
| **이산 사건** | 마주침·사진·행동 전환·월드 이벤트 | 별도 catch-up 정책 |

정책 초안:

```
0~2초    정상 틱
2~30초   이동·하늘·피로 복원 + encounter는 시간 슬롯당 최대 N회
30초 이상 오프라인 경과 처리 · 사건 폭발 금지 · 도착/행동 상태만 정합 복원
```

## 9. 🔴 `sequence`를 RNG 축에서 분리해야 한다

**판정: sequence를 encounter RNG의 주 시드로 영구 유지하면 안 된다.**

sequence는 앞으로 여러 이유로 바뀐다 — alarm 주기 조정, catch-up 구현, 재시도,
저장 복구, 테스트 실행 방식, 성능 최적화. 그때마다 세계의 우연이 바뀌면
**구현 세부가 별이의 운명을 결정**한다.

RNG 축은 **세계 시간**에 고정한다:

```
encounterSlot = floor(worldTime / encounterInterval)
seed          = worldSeed + encounterSlot + regionId + actorId
```

그러면 1초 alarm이든 5초 alarm이든, 재시작되든, catch-up으로 복구하든
**같은 세계 시간 슬롯에서는 같은 우연**이 나온다.

```
sequence      = 상태 변경 버전 / 갱신 순서 추적 (그것만)
encounterSeed = 세계 시간 기반
```

## 10. 수치가 나온 뒤의 분기

| 실측 | 조치 |
|---|---|
| **Duration 충분히 낮음** | 1초 alarm·매초 persist **그대로 유지**. live-sync 봉우리만 최적화. 코드가 비효율적으로 보여도 위험한 핵심부는 안 건드린다 |
| **Duration 낮으나 storage 비용 높음** | 바로 persist를 줄이지 않는다. `MAX_DT_SECONDS` catch-up 설계 → RNG 분리 → 축출 복구 테스트를 **먼저** 끝낸 뒤에 |
| **Duration 실제로 높음** | 작은 최적화가 아니라 **별도 BUILD: Authority Time Model 개편** |

### 개편 시 필수 테스트 (숫자 테스트가 아니라 성질 증명)

```
동일 seed + 동일 세계 시간
  → alarm 주기가 달라도 같은 위치
  → 같은 행동 상태
  → 같은 encounter 결과
  → 같은 중요 사건
```

## 11. 홈즈에게 넘기는 질문

1. **`MAX_DT_SECONDS = 2`는 어떤 실패를 막기 위해 도입됐는가?**
   순간이동 / 사건 폭발 / CPU runaway / 오래된 체크포인트 복구 오류
2. **긴 공백에서 보존해야 하는 것은?**
   연속 상태 / 이산 사건 / 둘 다 / 사건은 요약만
3. **encounter RNG의 정본 축은?**
   tick sequence / world time slot / event counter / deterministic world seed
4. **동일 세계 시간이면 실행 주기와 무관하게 동일한 경험을 보장해야 하는가?**
   ← 가장 중요. 이 답이 나머지 셋을 결정한다.

## 12. 판정

> 지금의 1초 틱은 별이의 **심장박동**이고, `MAX_DT_SECONDS`는 심장이 잠깐 멈췄을 때
> **잃어버리는 시간**을 만들며, `sequence`는 **심박 횟수를 운명으로** 바꾸고 있다.
> 비용 최적화 전에 **세계 시간과 우연의 정본을 먼저 분리**해야 한다.
