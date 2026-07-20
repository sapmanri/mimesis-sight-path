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

## 7. 홈즈에게 넘기는 질문 두 개

1. `MAX_DT_SECONDS = 2`의 원래 의도는? (긴 정지 후 순간이동 방지로 보이는데, 그렇다면
   "진행은 하되 마주침 판정은 건너뛰기" 같은 분리가 가능한가)
2. `sequence`를 RNG 시드로 쓰는 것을 유지할 것인가? 유지하면 persist 주기 변경이
   세계의 재현성에 영향을 준다 — 시드를 `now` 기반 슬롯으로 옮기면 분리된다.
