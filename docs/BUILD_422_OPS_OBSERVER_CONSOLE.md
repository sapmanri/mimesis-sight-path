# BUILD 422-OPS — Observer Console 설계 · 데이터 가용성 조사

작성: 2026-07-17 · 상태: **설계 조사 (코드 변경 0). 홈즈 QC 전 구현 금지.**
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

### 6-3. 필요한 read-only API 제안 (전부 신규, **쓰기 없음**)

| API | 소스 | 내용 |
|---|---|---|
| `GET /api/ops/summary` | 여러 소스 취합 | 콘솔 1회 호출용 번들 (별이 상태·오늘 스케줄·집계) |
| `GET /api/ops/publish-log` | 신규 `PLANET:publish_log` | 최근 N회 발행 시각·결과·문구·사진·Threads detail·401 |
| `GET /api/ops/presence` | 신규 `PLANET:presence:<slot>` | 활성/오늘 고유/ live 수 (집계값만) |
| `GET /api/ops/collective` | 신규 `PLANET:agg:<date>` | 모두가 만난 것·집단 취향·전환율 (사전 집계된 값) |

**수집 측(별도 빌드, 최소 침습):**
1. **`publish_log`** — `autopost.ts`가 이미 가진 `{ok, threads:{attempted,ok,detail}, index, img}`를 KV에 append. **인증 실패(401)도 기록.** ← 가장 싸고 효과 큰 한 건
2. **`presence`** — 걷기 앱이 60초마다 `POST /api/ops/heartbeat {anonId(세션 난수), mode}` → KV 슬롯 카운터(TTL 2분). **Observer Code 전송 금지**, IP 저장 금지
3. **`agg`** — 관찰자가 **백업할 때** `backup.ts`가 blob을 해석하지 않는 원칙(419-A §0-2)을 지키면서 집계하려면, **클라이언트가 익명 집계 델타를 별도 전송**하는 방식이 필요 → 설계 필요. 서버가 blob을 열어보는 방식은 **동결 인터페이스 위반**

> ⚠️ **419-A 경계 원칙 §0-2 "서버는 프로필 내용을 해석하지 않는다"** 와 집단 통계 요구가 정면 충돌한다.
> **홈즈 판정 필요:** (a) 별도 익명 통계 엔드포인트 신설(개인 저장소와 분리) vs (b) 집단 통계를 v1에서 제외.
> 본 설계는 **(a)를 권고** — 저장소 분리(`OBSERVERS`=개인 / `PLANET:agg`=익명 집계)로 원칙을 지킬 수 있다.

---

## 7. 운영자 페이지 인증

| 방식 | 평가 |
|---|---|
| **Cloudflare Access (Zero Trust)** | ✅ **권고.** 계정에 Zero Trust 존재 확인됨(대시보드 사이드바). 코드 0줄, 이메일 OTP/구글 로그인, 앱 앞단에서 차단 — 콘솔 HTML·API 모두 보호. Pages 커스텀 도메인에 정책 적용 가능 |
| `PUBLISH_KEY` 쿼리스트링 | ❌ **금지.** `threads-auth.ts`가 이미 이 방식이고 **코드 주석 스스로 "브라우저 히스토리에 남는다"고 경고**. 2026-07-17에 이 키가 스크린샷으로 노출돼 교체한 전례 |
| Basic Auth 미들웨어 | △ 가능하나 자체 구현 = 자체 리스크 |
| 무인증 + 추측 어려운 URL | ❌ 관찰자 집계가 보이는 화면에 부적합 |

**권고:** Cloudflare Access로 `byeoli-ops.sapmanri.com` 전체를 보호. Vase 계정만 허용.

---

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

| 단계 | 내용 | 선행 |
|---|---|---|
| **422-A** | `publish_log` 수집 (`autopost.ts`에 KV append + 401 기록) + `GET /api/ops/publish-log` | — **가장 먼저. 값싸고 즉시 유용** |
| **422-B** | `byeoli-ops.sapmanri.com` 연결 (host 분기, 421-B 패턴) + Cloudflare Access + 콘솔 셸(왼쪽 iframe + 오른쪽 골격) | Vase: CNAME + Access 정책 |
| **422-C** | 별이 상태 패널 (state 폴링) · Authority 패널 · 이벤트 정의/조건 패널(트리거 미구현 명시) | 422-B |
| **422-D** | presence heartbeat(익명) + "지금 함께 걷는 사람" | **홈즈 QC**: 익명 수집 범위 |
| **422-E** | 집단 집계(`PLANET:agg`) + 모두가 만난 것/집단 취향/메타 일기 | **홈즈 QC**: 419-A §0-2 충돌 판정(§6-3) |
| **별도** | 이벤트 서버 트리거(Authority 변경) · 자동 캡처 파이프라인 | 홈즈 영역 / 오픈 후 |

**테스트**
- `validate:ops` 게이트 신설: 콘솔 HTML에 **쓰기 API 호출 0건**, `BYLR-`·Observer Code 미노출, 금지 동작(강제발행/이벤트/이동/수정/삭제/초기화) 문자열 부재
- 음성 테스트: 쓰기 호출을 일부러 삽입 → 게이트가 exit 1 확인
- Access 미인증 접근 → 콘솔·ops API 전부 차단 확인
- 기존 회귀: 걷기 앱·Threads·Authority 무변경 (421-B 16항목 재실행)

---

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

## 13. 홈즈 QC 요청 사항 (구현 전 판정 필요)

1. **§6-3 원칙 충돌** — 집단 통계 vs 419-A §0-2 "서버는 프로필을 해석하지 않는다". 별도 익명 집계 엔드포인트(저장소 분리) 승인 여부
2. **§11 k-익명 임계값** — N<5 숨김이 적절한가
3. **§5 이벤트 트리거 부재** — 콘솔에 "미구현"으로 정직하게 노출 vs 섹션 자체 보류
4. **§10 단계 순서** — 422-A(publish_log) 선행 승인
5. **presence heartbeat** — 익명 수집이 "관찰자 무지" 설계 원칙(Authority)과 충돌하지 않는지. **제안: Authority가 아니라 Pages KV에만 기록**하여 별이는 여전히 관찰자를 모르게 유지
