# BUILD 422-OPS — Observer Console 설계 · 데이터 가용성 조사

작성: 2026-07-17 · 개정: 2026-07-17 (홈즈 QC 반영)
상태: **방향 승인 · QC 5건 반영 완료 → `422-OPS-A` 착수 승인.** 그 외 단계는 각 선행 조건 충족 후.
근거: 실제 레포 코드 · production API 응답 · KV/DO/R2 실측. **추측한 항목은 "미확인"으로 명시.**

> 이 페이지는 **조종석이 아니라 관측소**다. 그리고 단순 운영 도구가 아니라
> **"관찰자들의 관찰자"** — 별이를 본 사람들이 함께 만든 세계를 익명 집계로 되비추는 화면이다.

---

## 0. 요약 — 조사가 뒤집은 것 3가지

| # | 예상 | **실제** | 영향 |
|---|---|---|---|
| 1 | 대형 이벤트 3종이 서버(Authority)에서 발생 | **`WORLD_EVENT_REGISTRY`는 어디서도 import되지 않음.** Authority에 `worldEvent` 필드 없음. 렌더러(`WorldEventStage`)만 존재하고 **트리거 주체가 없음** | "이벤트 3종 상태" 패널은 **현재 보여줄 상태가 존재하지 않음** → §5 참조 |
| 2 | 관찰자 수를 셀 수 있음 | `health.connectedViewers`는 **하드코딩 `0`**. Authority는 GET만 받고 뷰어를 모름(설계 원칙: 관찰자 무지) | "지금 함께 걷는 사람" = **신규 수집 필요** → §6 |
| 3 | 사진은 별이가 찍음 | 걷기 앱에 **업로드 코드 없음**. R2 `captures/`는 옛 맵(theatre/planet) 것 + 2026-07-17 수동 업로드분(`walk/` 36장) | "최근 사진" 패널은 **촬영 시각·존이 없음** → §4 |

**결론:** 콘솔의 절반은 지금 데이터로 만들 수 있고, 절반(관찰자 집계·이벤트 상태·사진 출처)은 **읽기 전용 수집 계층을 먼저 만들어야** 한다. 이 문서는 그 경계를 정의한다.

---

## 1. 왼쪽 라이브 화면 — iframe 가능 여부

**결론: 가능. 차단 요소 없음.**

- `curl -I https://byeoli.sapmanri.com/` → **`X-Frame-Options` 없음, `Content-Security-Policy` 없음** (frame-ancestors 제약 0)
- 같은 오리진 배치 시(`byeoli.sapmanri.com/ops/`) same-origin → iframe 내부 접근 자유
- 다른 서브도메인(`byeoli-ops.sapmanri.com`) → **cross-origin**. iframe 표시는 되지만 `contentWindow` 접근 불가

**권고 구현:** iframe에 `sandbox="allow-scripts allow-same-origin"` + `pointer-events:none` 오버레이로 조작 차단.
- `?mode=live`로 띄우면 **Authority가 보는 그 별이**(모든 뷰어 공통)를 본다 — 운영 관측 목적에 정확히 부합. sandbox 모드는 브라우저마다 다른 별이라 콘솔에 부적합.
- ⚠️ **live 모드는 `WakeLockManager.start()`를 호출**(미들웨어 주입, `_middleware.ts` 240행대). 콘솔 탭이 화면을 계속 켜둘 수 있음 → iframe에 `allow` 없이 두면 Wake Lock 권한 자동 거부됨(iframe 기본값). 의도된 동작이며 콘솔에서는 그게 맞다.

**cross-origin일 때의 좌표 표시 문제:** 현재 존/시간/행동 오버레이는 iframe 내부를 읽지 않고 **콘솔이 직접 `/api/byeoli/state`를 폴링**해 그린다. 따라서 same-origin 불필요.

---

## 2. 현재 사용 가능한 API·데이터

### 2-1. `GET /api/byeoli/state` — **공개, 인증 없음, 콘솔의 주력 소스**
실측 응답(2026-07-17)에서 **바로 쓸 수 있는 것**:

| 경로 | 값 예시 | 콘솔 용도 |
|---|---|---|
| `sequence` | `237208` | Authority 살아있음 |
| `updatedAt` | epoch ms | 갱신 지연 계산 |
| `stale` | `false` | 상태 신선도 |
| `state.byeoli.state` | `acting` / `walking` | **현재 행동** |
| `state.byeoli.actAction` | `rest` `wonder` `observe` `record` | 현재 무엇을 하는지 |
| `state.byeoli.actTarget` | `stairs-a-2` | 현재 관심 대상 |
| `state.byeoli.worldX` | `683.6` | 진행 위치 |
| `state.camera.worldLen` | `12826` | 존 계산 기준 |
| `state.sky.phase` | `night` `dawn` | 시간대 |
| `state.sky.weather` | `clear` | 날씨 |
| `state.telemetry.memories` | **13942** | 별이 누적 기억 |
| `state.telemetry.diary` | **3485** | 별이 누적 일기 |
| `state.telemetry.drives.*` | observe/rest/record/wonder | 욕구 수치 |
| `state.telemetry.fatigue` | `0.035` | 피로 |
| `state.liveEvent.*` | `{kind:'act', action:'wonder', targetId:'clover-a-3', targetType:'clover', text:'☘️ 궁금 · 토끼풀', occurredAt}` | **현재 행동 한 줄 + 대상 타입** |
| `state.props[]` | 68개, `{id,type,variant,x,phase,...}` | 현재 월드 배치 |

> **핵심**: `telemetry.memories/diary`는 **별이(Authority) 누적**이지 관찰자 집계가 아니다. 혼동 금지.
> **존(zone)**: state에 `zone` 필드 **없음**. `worldX`/`worldLen`으로 콘솔이 계산해야 하며, 계산식은 걷기 앱(416-A 존 로직)과 **동기화 필요** → 불일치 위험. 별도 read-only API로 서버가 존을 내보내는 게 안전(§6).

### 2-2. `GET /api/byeoli/health` — 공개
`{ok, schemaVersion, authorityId, instanceEpoch, sequence, startedAt, lastTickAt, connectedViewers, storageRecovered, archiveMode}`
- `startedAt`으로 **가동 시간** 산출 가능
- ⚠️ **`connectedViewers`는 하드코딩 `0`** (`authority/src/index.ts` 80행) — 절대 표시하면 안 됨(거짓 정보)

### 2-3. `GET /api/autopost` — **PUBLISH_KEY 불필요(GET은 무인증)**
`{ok, poolSize, recentCount, images}` — 문장 풀 크기·최근 인덱스 수만. **발행 이력·시각 없음.**

### 2-4. `GET /api/planet`, `/api/feed` — 봇 피드(내부 스레드)
`PLANET` KV `feed` 키. 실측 항목: `{id:'bot-<ts>', t, text, img, icon, likes, comments}`
- **`t`가 발행 시각** → 오늘 발행 이력·시각·사용 문구·사용 사진을 여기서 복원 가능 ✅
- ⚠️ **Threads API 성공/실패는 저장되지 않음** — 응답으로만 반환되고 버려짐 → §3

### 2-5. `GET /api/upload-capture` — 최근 캡처 URL 목록 (실측 20장 반환)

### 2-6. `POST /api/observer/*` — 관찰자 백업/복구. **집계 API 없음**

---

## 3. Threads 크론 일정과 Skip 조건 — **"Skip"은 존재하지 않는다**

### 실제 크론 (cron-job.org, 2026-07-17 대시보드 확인)
| 항목 | 값 |
|---|---|
| Job | `thread` |
| URL | `https://mimesis-sight-path.pages.dev/api/autopost` (POST + `X-Publish-Key`) |
| 스케줄 | **하루 3회 — 08:00 / 18:00 / 22:00 KST** |
| 최근 실행 | 08:00:27 ✅ / 전일 22:00:37 ✅ / 전일 18:00:35 ✅ |

### 코드가 말하는 실제 동작 (`functions/api/autopost.ts`)
발행 파이프라인은 **조건부 Skip이 없다.** 호출되면 항상 발행을 시도한다:
1. `PUBLISH_KEY` 미설정 → **503** / 헤더 불일치 → **401** (← 유일한 "안 나감" 경로)
2. 최근 인덱스(`bot_recent`, 최근 25개)를 뺀 후보에서 문장 랜덤 선택. 후보 고갈 시 전체 리셋
3. 이미지: R2 `captures/` 200개 나열 → 키 **역순 정렬 상위 40** → 그중 랜덤, **확률 4/5로 첨부**(1/5는 사진 없이 발행)
4. `PLANET` KV `feed`에 prepend (최대 `MAX_POSTS`)
5. `dispatchToThreads()` — 컨테이너 생성 → 발행. 미디어 지연 대비 **3초 간격 5회 재시도**. `?draft=1`이면 컨테이너만 만들고 미발행

**따라서 콘솔의 "왜 안 올라왔는가"는 3가지뿐:**
- (a) 크론이 호출 안 함 → cron-job.org 쪽 (콘솔이 알 수 없음, §6)
- (b) 401/503 → 키 문제 (**현재 어디에도 기록 안 됨**)
- (c) Threads API 실패 → `{attempted, ok, detail}` 반환되지만 **버려짐**

> 🔴 **가장 중요한 갭**: 2026-07-17 실사례 — PUBLISH_KEY 교체 후 "왜 글이 안 올라오지?"를 사람이 KV를 직접 까서 진단했다.
> 콘솔의 존재 이유가 바로 이것인데, **지금 구조로는 콘솔도 답할 수 없다.** → §6 `publish_log` 필수.

### 3-2. `publish_log` 계약 (QC 2 반영 — 422-OPS-A 구현 규격)

**저장 대상 (KV `PLANET:publish_log`, append, 최신 N=90건 유지 ≈ 30일 × 3회)**

| 상황 | 기록 |
|---|---|
| 정상 크론 요청 | **매 실행 1건** |
| `503 key_missing` | **매 실행 1건** |
| `401 key_mismatch` | ❌ 건별 기록 금지 → **10분 슬롯 버킷 카운터만** (`PLANET:publish_401:<slot>`, TTL 24h) |

**401 폭주 방지 (필수)**: 공개 엔드포인트라 반복 호출 시 로그·비용 폭증 위험.
같은 10분 슬롯의 401은 카운터만 증가시킨다. **원문 헤더·IP·User-Agent 저장 절대 금지.**

**레코드 스키마**
```json
{
  "runId": "pub_1784281610654",
  "scheduledFor": "2026-07-17T22:00:00+09:00",
  "invokedAt": 1784281610654,
  "result": "success | threads_failed | key_missing",
  "httpStatus": 200,
  "imageKey": "captures/walk/1784280645826.jpg",
  "textIndex": 42,
  "threads": { "attempted": true, "ok": true, "errorCode": null, "requestId": "..." }
}
```

**저장 금지 (하드룰)**: 액세스 토큰 · `PUBLISH_KEY` · Threads 응답 전문 · 응답 헤더 원문 · IP · UA.
→ Threads 결과는 **`errorCode`(Meta 오류 코드) · HTTP 상태 · `requestId` 요약만**. 현재 코드의 `detail` 문자열은 원문 메시지를 담으므로 **그대로 저장 금지**, 코드/상태만 추출.

**`missed` 슬롯 판정 (서버 로그만으로는 크론 미호출을 알 수 없음)**
- 예정 슬롯: **08:00 / 18:00 / 22:00 KST** (하드코딩 상수, cron-job.org와 수동 동기)
- 판정: `예정 시각 + 유예(10분)`이 지났는데 그 슬롯의 run 레코드가 없으면 → **`missed`로 추론 표시**
- 콘솔 문구: `22:00 — 호출 기록 없음 (크론 미실행 추정)` — **추정임을 명시**. 서버가 단정할 수 없음
- 보존: `publish_log` 90건 / `publish_401` 24시간


---

## 4. 사진의 실제 생성 위치·시각·R2 경로

### 실제 구조 (`functions/api/upload-capture.ts`)
- `POST /api/upload-capture` (**PUBLISH_KEY 필요**) `{map, dataUrl}` → R2 키 **`captures/<map>/<ts>.jpg`**
- 공개 URL: `CAPTURES_PUBLIC_BASE` = `https://pub-8ec6440aae5545379fcfdd50a243847a.r2.dev`
- 버킷: `sapmanri-captures` (바인딩 `CAPTURES`)

### 실측 (2026-07-17)
```
walk/1784280631617.jpg … walk/1784280645826.jpg   ← 36장, 오늘 수동 업로드
planet/1783694976658.jpg, theatre/1783685010879.jpg ← 옛 맵, 7/10경
```

### 🔴 확정된 사실
- **걷기 앱에는 캡처 업로드 코드가 없다** (`grep upload-capture public/byeoli-walk/index.html` → 0건)
- 봇이 쓰던 사진은 **옛 동네맵/행성맵 시절 자산**이었고, 2026-07-17에 걷기 캡처 36장을 수동 배치 업로드해 교체함
- 봇 선택이 **키 역순 정렬**이라 `walk/`(w)가 `theatre/`(t)·`planet/`(p)보다 뒤 → 현재 풀 상위 전부 walk

### 콘솔이 보여줄 수 있는 것 / 없는 것
| 요구 | 가능? |
|---|---|
| 썸네일 | ✅ 공개 URL 직접 |
| 촬영 시각 | ⚠️ **키의 `<ts>`는 업로드 시각** — 수동분은 전부 18:10대로 뭉쳐 있어 "촬영 시각"이 아님 |
| 촬영 장소/존 | ❌ **저장되지 않음** (map 세그먼트만) |
| R2 키 | ✅ |
| Threads 사용 여부 | ✅ `feed[].img` URL 대조로 복원 가능 |

→ **자동 캡처 파이프라인**(vault TODO 등록됨)이 들어와야 이 패널이 의미를 갖는다. 그때 `{ts, zone, sky, weather, byeoliAction}` 메타를 함께 저장할 것.

---

## 5. 대형 이벤트 3종 — **트리거가 존재하지 않는다**

### 정의 (`src/worldEvents/worldEventRegistry.ts` — 실측)
| id | label | rarity | cooldown | duration | 조건 |
|---|---|---|---|---|---|
| `godzilla` | 산 뒤를 걷는 거대한 그림자 | legendary | **86400s (24h)** | 12s | time: dusk/night |
| `meteor-shower` | 밤하늘을 긋는 별들 | rare | **43200s (12h)** | 14s | time: night, weather: clear |
| `ufo` | 멈춰 선 낯선 불빛 | rare | **64800s (18h)** | 10s | time: dusk/night |

각 정의에 `camera`(shake/focus/dim), `sound`(cue/volume/repeat), `byeoliReaction`(stopWalking/look/hold), `journalLines` 보유.

### 🔴 결정적 발견
```
grep -rn "WORLD_EVENT_REGISTRY|selectWorldEvent" (registry 자신 제외) → 0건
grep -rn "worldEvent" authority/src/ → 0건
Authority toEnvelope() 필드에 worldEvent 없음
live-sync.js는 sequence만 읽고 worldEvent를 소비하지 않음
```
- 레지스트리 주석 자체가 명시: *"This file defines/selects/validates events; it does **not** stage them."*
- 걷기 앱에는 `WorldEventStage`(렌더러)와 `WE_META`(중복 상수)가 있으나, **`ActiveWorldEvent`를 넣어주는 주체가 없다**
- **어디에도 "마지막 발생 시각"이 저장되지 않는다** → 쿨다운·다음 가능 시점 계산 불가

### 결론
지시서의 "대형 이벤트 3종 상태(마지막 발생/조건 충족률/쿨다운/다음 가능 시점)"는 **현재 데이터로 구현 불가.**
콘솔 v1에서는 다음만 정직하게 표시:
- 정의(라벨·rarity·쿨다운·조건) — 정적 레지스트리에서
- **현재 조건 충족 여부** — `state.sky.phase/weather`로 계산 가능 ✅ (예: "meteor-shower: 조건 충족(night·clear) · 단 트리거 미구현")
- **"마지막 발생: 기록 없음 — 서버 트리거 미구현"** 을 그대로 노출

> 이건 콘솔의 첫 성과가 될 수 있다. **"이벤트가 왜 안 뜨지?"의 답이 "발동 주체가 없다"** 임을 화면이 말해준다.
> 서버 트리거 구현은 **Authority 변경**이므로 홈즈 영역 + 본 지시서의 "기존 Authority 동작 변경 금지"에 걸린다 → 별도 빌드로 분리.

### 5-2. 🔴 이벤트 예약 요구 — 판정 충돌, 재판정 필요

**Vase 요구 (2026-07-17):** *"대형 이벤트들은 콘솔에서 다음 발행일을 직접 지정할 수 있게 해줘. 그래야 이벤트 활용이 된다."*

정당한 제품 요구다. 이벤트가 **쿨다운과 조건에만 맡겨져 있으면 운영이 불가능**하다 —
"오늘 밤 운석우를 띄우자" 같은 의도적 연출이 서비스의 무기인데 지금은 그럴 수단이 없다.

**그러나 두 가지 벽이 있다:**

1. **홈즈 QC 판정과 충돌** — *"콘솔이 이벤트를 발동시키는 구조는 절대 금지"*, 콘솔 v1은 read-only.
2. **지금은 물리적으로 불가능** — **발동시킬 런타임 자체가 없다**(§5). 발사 장치가 없는데 발사 시각을 예약할 수 없다.

**설계 제안 (재판정 요청):**
> **"예약(schedule)"과 "발동(trigger)"은 다른 행위다.**
> - 발동 = 지금 즉시 세계를 바꿈 → **콘솔에서 영구 금지** (홈즈 판정 유지)
> - 예약 = *"2026-07-20 22:00에 운석우 후보로 올림"* 이라는 **의도 기록**. 실제 발동은 런타임이 조건(시간대·날씨·쿨다운)을 재확인한 뒤 수행
>
> 즉 예약은 **"조종"이 아니라 "제안"** 이다. 런타임이 거부할 수 있어야 한다.

**따라서 순서를 이렇게 고정한다:**
- **`BUILD 423-EVENTS — World Event Runtime`을 설계할 때 예약을 1급 입력으로 포함**한다.
  (나중에 얹으면 트리거 설계를 다시 뜯어야 함 — 지금 알게 된 게 다행)
- 예약 저장소: `EVENTS:schedule` (Ops 경계 안, Access 뒤)
- 예약 쓰기 API는 **콘솔 read-only 원칙의 명시적 예외**로 선언하고, **감사 로그 필수**
  (누가·언제·무엇을 예약했는지. 단일 운영자라도 기록)
- 런타임이 예약을 **재검증 후 수행**: 조건 불충족 시 `skipped(reason)`으로 기록하고 발동 안 함
- **콘솔 v1(422-OPS-C)에는 예약 UI를 넣지 않는다** — 런타임 부재로 동작 불가. 423-EVENTS와 함께 등장

**423-EVENTS 설계 시 결정할 것:** Authority에 넣을지 별도 World Director를 둘지.
→ 관찰자 무지 원칙(별이는 관찰자를 모른다)과 마찬가지로, **별이는 "누가 이벤트를 예약했는지" 몰라야** 한다.

---

## 6. 현재 얻을 수 없는 정보 + 필요한 read-only API

### 6-1. 지금 없는 것 (전부 **신규 수집 필요**)
| 항목 | 현재 | 필요 |
|---|---|---|
| 접속 중 관찰자 수 | ❌ `connectedViewers` 하드코딩 0 | heartbeat 수집 |
| 오늘 고유 관찰자 | ❌ | 익명 일일 카운터 |
| live 모드 수 | ❌ | heartbeat에 mode 포함 |
| 평균 관찰 시간 | ⚠️ 개별 blob의 `totalObservedMs`만 (백업한 사람만) | 집계 저장소 |
| 첫 방문/재방문 | ⚠️ blob `createdAt`/`firstSeenAt` (백업자만) | 집계 |
| Threads 발행 성공/실패 | ❌ 응답 버려짐 | `publish_log` |
| 크론 호출 여부 | ❌ | `publish_log`(401도 기록) |
| 이벤트 발생 이력 | ❌ 트리거 자체가 없음 | §5 |
| 사진 촬영 시각/존 | ❌ | 자동 캡처 파이프라인 |

### 6-2. 관찰자 집계 — **현재 가능성의 실측**
`OBSERVERS` KV 실측: **키 8개, 전부 `blob:<id>:<rev>`.** 관찰자 **2명**(테스트 포함)뿐 — 즉 **"기록 지키기"를 한 사람만 서버에 존재**한다.

실제 blob 하나(`BYL-GVK3-S7VX:5`)의 내용:
```
profile: {version, observerId, createdAt, memoryCount:255, diaryCount:191,
          tastes:{169종}, firstSeenAt, lastSeenAt, totalObservedMs:2551563, passCount:196}
tastes 항목: {type:'lavender', acts:{observe:1,rest:1,record:0,wonder:0}, total:2, firstAt, lastAt}
habits: present
```

**→ "모두가 만난 것들 / 집단 취향 / 집단 기억"에 필요한 데이터가 blob 안에 이미 다 있다.**
`tastes[type].acts.{observe,rest,record,wonder}`가 **노출/관찰/기억/촬영 구분**의 실제 근거다 (지시서 §3 요구와 일치).

**그러나 치명적 편향** — 이 집계는 **백업한 관찰자만** 포함한다. 대부분의 사용자는 localStorage에만 있고 서버는 그들을 모른다.
> 콘솔은 이 숫자를 **"전체 관찰자"로 표시하면 안 된다.** 반드시 **"기록을 지킨 관찰자 N명 기준"**으로 라벨링할 것.

**또한 blob 순회 집계는 하면 안 된다:**
- KV list는 최종 일관성 + 관찰자 수만큼 GET → 비용·지연 폭발
- 운영자가 개인 blob을 읽는 셈 → 개인정보 원칙(§8) 위배

### 6-3. Presence — **"사용자"가 아니라 "활성 세션"** (QC 4 반영)

**API 이름 분리 (필수)**: 사용자 앱이 보내는 heartbeat는 운영자 API가 아니라 **공개 텔레메트리 수집 API**다.
```
POST /api/telemetry/presence   ← 공개(걷기 앱이 호출). Ops 경계 밖
GET  /api/ops/presence         ← Ops 호스트 전용(Access 뒤). 집계값만 반환
```

**🔴 숫자의 의미를 정직하게 제한한다.** 세션 난수로는 "사람 수"가 나오지 않는다:
탭 2개 = 2로 집계 · 새로고침 = 새 세션 · 요청 위조 가능 · 봇이 부풀릴 수 있음.

| ❌ 금지 표기 | ✅ v1 표기 |
|---|---|
| "현재 관찰자 12명" | **"현재 함께 열린 세션 12개"** |
| "오늘 고유 사용자 43명" | **"오늘 감지된 브라우저 세션 43개"** |

**수집 계약**
- heartbeat 간격 **60초**, 활성 만료 **120~150초**
- **브라우저별 안정 ID 검토** (탭별 아님) — 단 개인 식별로 넘어가지 않는 선
- **IP 원문 저장 금지 · User-Agent 원문 저장 금지**
- 요청 빈도 제한, 비정상적으로 많은 heartbeat 배제
- **개인정보 안내에 익명 접속 집계 명시** (오픈 전 필수)
- Observer Code 전송 금지
- **Authority에 기록하지 않고 Pages KV에만** → 별이는 여전히 관찰자를 모른다 (설계 원칙 유지)

### 6-4. Collective — revision 기반 멱등 집계 (QC 5 반영)

**판정: 별도 익명 통계 저장소 신설 승인. `OBSERVERS` blob은 계속 불투명 유지 → 419-A §0-2 원칙 살아있음.**

```
OBSERVERS   = 개인 복구 저장소 · 서버가 내용 해석하지 않음
COLLECTIVE  = 집단 통계 전용 · 개인 원문 없음 · 최소 수치만
```

**🔴 blob 직접 순회 금지.** 대신 백업 요청에 blob과 **별도로** `collectiveSnapshot`을 실어 보낸다:
```json
{
  "observerId": "BYL-...", "recoveryKey": "BYLR-...", "baseRevision": 17,
  "blob": { "...": "opaque" },
  "collectiveSnapshot": {
    "schemaVersion": 1,
    "sourceRevision": 17,
    "totals": { "diary": 191, "memories": 255, "photos": 22, "observedMs": 2551563 },
    "targets": { "crow": { "observed": 12, "remembered": 3, "photographed": 1 } },
    "tastes": { "rainy_objects": { "strengthBucket": 3 } }
  }
}
```

**서버 계약**
- 개인 blob을 **열지 않음**
- 동일 인증(recoveryKey)으로 **snapshot의 소유권만** 확인
- **`sourceRevision`이 이전보다 클 때만 반영**
- 이전 snapshot과 **차이(delta)만 집계**
- **재전송은 멱등** → 새로고침·백업 재시도로 까마귀가 계속 늘지 않음
- 개인 snapshot은 **HMAC 기반 내부 키**로 저장
- **운영 UI에 개인 snapshot 조회 API를 제공하지 않음**

**k-익명 (QC 5 — N<5 숨김만으로는 불충분)**
- 집단 참여자 **5명 미만 → 집단 섹션 전체 숨김**
- **각 대상·취향별 기여 관찰자 5명 미만 → 해당 항목 숨김** (참여자 20명이어도 특정 취향이 1명뿐이면 개인이 드러남)
- 희귀 취향도 운영 콘솔에서 **개인 추적 불가**
- 정확한 소수값 대신 **"5명 미만"** 표기
- **원문 관찰일기·문장 조각은 Public Beta 범위에서 수집·노출 금지** ← 아래

**🔴 일기 원문 판정 (v1 고정)**
> 서버 백업은 사용자에게 **"복구를 위한 저장"** 으로 설명되어 있다.
> 운영자가 원문을 읽는 것은 **전혀 다른 동의 문제**다.
> **v1: 일기 원문은 집계하지도, 운영자에게 보여주지도 않는다.**
> 메타 일기는 숫자·대상 집계만으로 충분히 만들 수 있다.

### 6-5. ⚠️ `acts.*` 의미 — **검증 전까지 내부 명칭 그대로**

문서 초안은 `acts.{observe,rest,record,wonder}` → `노출/관찰/기억/촬영`으로 거의 확정처럼 연결했으나,
**`record`가 사진 촬영인지·기억 저장인지·단순 행동 이름인지 생산 코드로 확정되지 않았다.**
사진 업로드 파이프라인이 아예 없다는 §4 조사 결과와도 긴장이 있다.

| ❌ 검증 전 금지 | ✅ 허용 |
|---|---|
| "사진 촬영 128회" | **"record 행동 128회"** |

→ **422-OPS-E 착수 전, 각 필드 의미를 걷기 앱 `Profile.recordAction()` 호출 지점까지 추적해 확정할 것.**

### 6-6. 필요한 read-only API (전부 Ops 호스트 전용, 쓰기 없음)

| API | 소스 | 내용 |
|---|---|---|
| `GET /api/ops/publish-log` | `PLANET:publish_log` + `publish_401` | 발행 이력·결과·missed 슬롯 |
| `GET /api/ops/summary` | 취합 | 콘솔 1회 호출 번들 |
| `GET /api/ops/presence` | `PLANET:presence:<slot>` | **활성 세션 수** (집계값만) |
| `GET /api/ops/collective` | `COLLECTIVE:agg:<date>` | 집단 집계 (k≥5 적용 후) |

---

## 7. 운영자 페이지 인증

### 7-1. 인증 수단
| 방식 | 평가 |
|---|---|
| **Cloudflare Access (Zero Trust)** | ✅ **권고.** 계정에 Zero Trust 존재 확인됨. 코드 0줄, 앱 앞단 차단 — 콘솔 HTML·API 모두 보호 |
| `PUBLISH_KEY` 쿼리스트링 | ❌ **금지.** `threads-auth.ts` 주석이 스스로 "브라우저 히스토리에 남는다"고 경고. 2026-07-17 스크린샷 노출로 교체한 전례 |
| Basic Auth 미들웨어 | △ 자체 구현 = 자체 리스크 |
| 무인증 + 추측 어려운 URL | ❌ 관찰자 집계 화면에 부적합 |

### 7-2. 🔴 Ops API도 같은 경계 안 (QC 3 반영 — 필수)

> **콘솔 HTML만 Access로 막고 데이터 API가 공개 도메인의 `/api/ops/*`에 열려 있으면,
> 관리 화면만 잠겼을 뿐 데이터는 공개된다.** 아래를 하드룰로 고정한다.

```
byeoli-ops.sapmanri.com/          ← Ops 콘솔 HTML
byeoli-ops.sapmanri.com/api/*     ← Ops API
                                     둘 다 같은 Access Application 아래
```

**미들웨어 계약**
- Host가 `byeoli-ops.sapmanri.com`일 때**만** Ops HTML·Ops API 제공
- **다른 Host에서 `/api/ops/*` 요청 → 404** (존재 자체를 숨김)
- **Access 검증 전 데이터 반환 금지**
- **CORS를 public 앱에 열지 않음** (Ops 응답에 `Access-Control-Allow-Origin: *` 금지)
- 공개 텔레메트리 수집(`/api/telemetry/*`)은 이 경계 **밖** — 별개 §6-3

## 8. 서브도메인 vs `/ops/`

| 기준 | `byeoli-ops.sapmanri.com` | `byeoli.sapmanri.com/ops/` |
|---|---|---|
| 인증 경계 | ✅ 호스트 단위로 Access 적용, 서비스와 완전 분리 | ⚠️ 경로 단위 정책 — 실수 시 공개 |
| 노출 | ✅ 공개 도메인에 운영 경로가 안 보임 | ❌ 존재가 드러남 |
| DNS | ⚠️ **Bluehost에 CNAME 1줄 추가 필요** (Vase 수작업, 421-B에서 검증된 절차) | ✅ 불필요 |
| 미들웨어 | 현 `_middleware.ts`에 host 분기 1개 추가 (421-B 패턴 재사용) | 경로 분기 |
| iframe | cross-origin (표시 OK, 내부 접근 불가 — **필요 없음** §1) | same-origin |
| 배포 | 같은 Pages 프로젝트 — 추가 비용 0 | 동일 |

**권고: `byeoli-ops.sapmanri.com`** (Vase 의견과 일치). cross-origin 단점은 콘솔이 state API를 직접 폴링하므로 실질 영향 없음.

---

## 9. UI 와이어프레임

```
┌────────────────────────────┬──────────────────────────────────────────┐
│ LIVE (38%, sticky)         │ OBSERVER CONSOLE (62%, scroll)           │
│ ┌────────────────────────┐ │ ─────────────────────────────────────    │
│ │  iframe: byeoli/?mode= │ │ 오늘 별이는 84번 관찰했고, 사진 3장을    │
│ │  live  (pointer-events │ │ 남겼으며, Threads에는 아직…             │
│ │  :none 오버레이)       │ │ 지금 12명이 함께 걷고 있습니다.          │
│ └────────────────────────┘ │ ─────────────────────────────────────    │
│ night · clear · 논길       │ ▸ 현재 상태                              │
│ 지금: ☘️ 궁금 · 토끼풀      │   행동 wonder / 대상 토끼풀 / 존 논길    │
│ seq 237208 · 2초 전        │   관찰 .46 쉼 .36 사진 .39 궁금 .48      │
│                            │   피로 0.03                              │
│  [라이브 화면 열기]        │ ▸ 오늘 일정 · Threads                    │
│                            │   08:00 ✅ · 18:00 ✅ · 22:00 예정        │
│                            │   ⚠️ 왜 안 올라왔나 → publish_log 필요   │
│                            │ ▸ 오늘 사진                              │
│                            │   [썸네일][썸네일] · 출처 메타 없음      │
│                            │ ▸ 모두가 만난 것들   [지금|오늘|주|전체] │
│                            │   🐦 까마귀 128 · 🍄 버섯 42 …            │
│                            │   (기록을 지킨 관찰자 N명 기준)          │
│                            │ ▸ 집단 기억 — 본 것 vs 기억한 것         │
│                            │ ▸ 집단 취향 — 오늘 떠오른 취향           │
│                            │ ▸ 대형 이벤트 3종                        │
│                            │   meteor-shower 조건충족 · 트리거 미구현 │
│                            │ ▸ Authority / Observer                   │
│                            │ ▸ 오늘의 관찰자 메타 일기                │
│                            │ ▸ 오류 · Skip 이유                       │
└────────────────────────────┴──────────────────────────────────────────┘
모바일: 라이브 화면 상단 고정 → 콘솔 세로 스크롤
```

**디자인 규칙 (기존 걷기 앱 톤 계승 — 새 디자인 시스템 금지)**
- 팔레트 재사용: `--sage:#A7B49A` `--panel:#12160f` `--line:#2b352a` `--dim:#5d6a5f`, 배경 `#12171c`
- 카드 금지 → 섹션 제목 + `1px solid #232a31` 구분선
- 폰트: 본문 system-ui / 수치 `ui-monospace` (걷기 앱 HUD와 동일)
- **수치보다 상태·이유 먼저**: "Threads 0회"가 아니라 "22:00 예정 — 아직 시각 전"
- 데스크톱 우선. 좌 38% / 우 62%

---

## 10. 구현 단계와 테스트 계획

> ⚠️ **빌드 번호 분리 (QC 1)**: Dual Agent 계열 `BUILD 422-A/B/C`와 **절대 섞지 않는다.**
> 운영 콘솔은 `422-OPS-*` 계열로 고정한다.

| 단계 | 내용 | 선행 |
|---|---|---|
| **422-OPS-A** | **Publish Audit Log** — `publish_log` 수집 + `missed` 슬롯 판정 + `GET /api/ops/publish-log` | ✅ **착수 승인** |
| **422-OPS-B** | **Console Shell + Access** — `byeoli-ops.sapmanri.com` + Cloudflare Access + read-only 셸 | Vase: CNAME + Access 정책 |
| **422-OPS-C** | **Byeoli Status** — 별이 상태·사진 풀·Threads·이벤트 "미구현 상태" 표시 | 422-OPS-B |
| **422-OPS-D** | **Presence** — 익명 활성 세션 | QC: 수집 범위 |
| **422-OPS-E** | **Collective Observatory** — revision 기반 snapshot 멱등 집계 | QC: §6-4 계약 |
| *별도* | `BUILD 423-EVENTS — World Event Runtime` (트리거·쿨다운·이력·**예약**) | §5-2 |
| *별도* | 자동 캡처 파이프라인 (오픈 후) | §4 |

**테스트**
- `validate:ops` 게이트 신설: 콘솔 HTML에 **쓰기 API 호출 0건**, `BYLR-`·Observer Code 미노출, 금지 동작(강제발행/이벤트/이동/수정/삭제/초기화) 문자열 부재
- 음성 테스트: 쓰기 호출을 일부러 삽입 → 게이트 exit 1 확인
- Access 미인증 접근 → 콘솔·ops API **전부** 차단 확인 (§7-2)
- 다른 Host에서 `/api/ops/*` → **404** 확인
- 기존 회귀: 걷기 앱·Threads·Authority 무변경 (421-B 16항목 재실행)

## 11. 읽기 전용 · 개인정보 원칙 (구현 시 하드룰)

**허용:** 새로고침 · 로그 펼치기 · 사진 크게 보기 · Threads 게시 열기 · 원본 API 응답 보기
**금지:** 강제 발행 · 강제 이벤트 · 별이 이동 · 상태 수정 · 기억 삭제 · Observer 초기화 · **모든 쓰기 API**

**개인정보:**
- Observer Code **화면·로그 비표시**, Recovery Key **접근 경로 자체 없음**
- IP 원문 저장 금지 (presence는 세션 난수 anonId만, TTL 만료)
- 개인 blob 열람 UI **만들지 않음**. 운영자도 개인 기록에 접근 불가
- **최소 집계 수 (k-익명)**: 관찰자가 현재 **2명**뿐 — 집단 통계가 곧 개인 정보다.
  → **N < 5면 집계 섹션을 숨기고 "아직 충분한 관찰자가 없습니다"로 표시** (재식별 방지)
- 개인(`OBSERVERS`)과 집계(`PLANET:agg`) **저장소 분리**
- 익명 문장 조각 노출은 **Public Beta 범위 제외** — 동의·보존·삭제 정책 확정 후

---

## 12. 첫 화면 10초 합격 기준 — 현재 달성 가능성

| 질문 | v1 가능? |
|---|---|
| 지금 별이는 무엇을 하는가 | ✅ `liveEvent.text` + `actAction`/`actTarget` |
| 몇 명이 함께 보는가 | ❌ → 422-D |
| 오늘 무엇이 가장 많이 관찰되었나 | ❌ → 422-E |
| 오늘 무엇이 가장 많이 기억되었나 | ❌ → 422-E (`tastes.acts.record`가 근거) |
| 오늘 어떤 취향이 생겼나 | ❌ → 422-E |
| **Threads가 왜 발행/Skip됐나** | ⚠️ 시각·문구·사진은 `feed`에서 ✅ / **성공·실패·401 이유는 ❌ → 422-A** |
| 대형 이벤트 상태 | ⚠️ 정의·현재 조건 충족 ✅ / 발생 이력·쿨다운 ❌ (트리거 부재) |

**→ 422-A(publish_log) 하나만으로 합격 기준의 가장 아픈 항목이 해결된다. 여기서 시작할 것.**

---

## 13. 홈즈 QC 판정 반영 결과 (2026-07-17)

**판정: 방향 승인 · 구현 순서와 집계 계약 수정 후 착수.** 5건 전부 반영 완료.

| # | 판정 | 반영 |
|---|---|---|
| 1 | 빌드 번호 충돌 (Dual Agent `422-A`와 겹침) | ✅ §10 — `422-OPS-A~E`로 분리 고정 |
| 2 | `publish_log` 승인, **401 폭주 방지** | ✅ §3-2 — 401은 10분 슬롯 카운터만, 민감정보 저장 금지, 보존기간 명시, `missed` 추론 |
| 3 | Ops API도 Access 경계 안 | ✅ §7-2 — Ops 호스트 전용, 타 호스트 404, CORS 미개방 |
| 4 | presence는 "사용자"가 아닌 **활성 세션** | ✅ §6-3 — `/api/telemetry/presence` 분리, 표기 제한, 수집 계약 |
| 5 | 집단 통계 별도 저장소 승인, **blob 순회 금지** | ✅ §6-4 — revision 기반 snapshot 멱등 집계, 항목별 k≥5, 일기 원문 v1 제외 |

**추가 반영**
- §6-5 — `acts.*` 의미 미검증 → 검증 전까지 "record 행동" 내부 명칭 그대로 사용
- §5 — 대형 이벤트는 콘솔에 "미구현 상태"만 표시. 트리거는 `BUILD 423-EVENTS`로 분리
- §5-2 — **이벤트 예약 요구(Vase) 기록.** 예약≠발동 분리 제안 + 423-EVENTS 1급 입력으로 포함. **재판정 요청**

**착수 승인 상태**
- ✅ **`422-OPS-A` 착수 가능** (지금 바로 구현 가능한 유일한 단계)
- ⏸ `422-OPS-B` — Vase의 CNAME + Access 정책 선행
- ⏸ `422-OPS-C/D/E` — 각 선행 조건
- ⏸ `423-EVENTS` — 별도 설계, 예약 포함 재판정 후
