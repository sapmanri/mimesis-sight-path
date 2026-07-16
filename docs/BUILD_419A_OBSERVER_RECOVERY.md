# BUILD 419-A — 관찰자 프로필·복구 경계 설계

작성: BUILD 419-A 세션 (오픈 스펙 1일차) · 상태: **홈즈 QC 대기 — 확정 전 구현 금지**
전제 조사: Authority = `ByeoliAuthority` Durable Object (단일 별이, alarm tick, 자체 persistence).
`authority/`·`functions/api/byeoli/` 전체에 관찰자 개념 없음 — 인계서 P0-2 조사와 일치.

---

## 0. 경계 원칙 (이 문서의 헌법)

1. **Authority DO는 건드리지 않는다.** 별이는 관찰자를 모른다 — 이건 버그가 아니라
   세계관("별은 카메라를 모른다")이자 아키텍처다. 관찰자 저장을 DO에 섞으면
   별이의 생명주기와 수만 관찰자의 데이터 생명주기가 결합된다.
2. **서버는 프로필 내용을 해석하지 않는다.** 불투명 blob + 최소 메타만.
   서버가 취향 구조를 알기 시작하면 스키마 변경마다 서버 배포가 필요해진다.
3. **복구 권한은 Observer Code에 절대 부여하지 않는다.** 코드는 공개 정체성(카드에
   인쇄됨, 39.6bit), 복구는 별도 비밀 키(≥128bit). — P0-2 확정 구조.

## 1. 상태 구조 — 공용/개인 분리

```
┌─ 공용 (기존, 불변) ──────────────────────────────┐
│ ByeoliAuthority DO      단일 별이 시뮬레이션      │
│ KV PLANET               공용 피드 · 봇 상태       │
│ R2 CAPTURES             별이의 사진               │
└──────────────────────────────────────────────────┘
┌─ 개인 (신규) ────────────────────────────────────┐
│ ObserverRegistry DO (신규 소형 워커 — Authority와  │
│ 완전 별개 배포 단위)                               │
│   관찰자별 소유권·리비전 메타의 단일 결정자:        │
│   { keyHash, revision, serverSavedAt,             │
│     clientSavedAt, clientInstanceId,              │
│     schemaVersion, createdAt }                    │
│   등록·키대조·revision 증가가 DO 직렬화 안에서     │
│   원자적으로 처리됨 (check-then-set 레이스 차단)   │
│                                                   │
│ KV OBSERVERS (신규 네임스페이스)                   │
│   blob:<observerId>:<revision> = 불투명 blob(§2)  │
│   최신 revision은 DO가 앎 — KV는 순수 저장고       │
│   rl:<scope>:<slot> = 시도 카운터 (TTL 10분)       │
└──────────────────────────────────────────────────┘
클라이언트 localStorage (기존 유지, 원본):
  mimesis.byeoli.profile.v1   (관찰자 프로필)
  mimesis.byeoli.habits.v2    (취향 엔진 상태)
  + 신규: mimesis.byeoli.recovery.v1 = { recoveryKey, registeredAt }
```

## 2. 개인 프로필에 저장할 항목 (blob v1)

```json
{
  "profile": <localStorage profile.v1 전체>,
  "habits":  <localStorage habits.v2 전체>
}
```
- 포함: observerId·기억·일기·취향(tastes)·습관 강도·관찰시간·첫만남 — 사용자가
  "잃으면 아픈" 전부.
- **비포함(v1)**: 산책 로그 스트림(archive) — 휘발성 연출이며 용량 대비 가치 낮음.
  확장은 오픈 후 (범위 통제).
- 크기 제한: **64KB** — 문자열 길이가 아닌 **UTF-8 직렬화 바이트**:
  `new TextEncoder().encode(JSON.stringify(blob)).byteLength ≤ 65536`.
  초과 시 `blob_too_large`. 현재 실측 프로필+습관 ≪ 64KB.

## 3. 복구 코드 체계

| | Observer Code (기존) | Recovery Key (신규) |
|---|---|---|
| 형식 | `BYL-XXXX-XXXX` | `BYLR-XXXXXX-XXXXXX-XXXXXX-XXXXXX` |
| 엔트로피 | 39.6bit | **~123bit** (Crockford base32 24자, I/L/O/U 제외) |
| 생성 | 첫 방문 자동 | **"기록 지키기" 명시 동작 시** `crypto.getRandomValues` |
| 노출 | 카드·시트 표시 가능 | **공유 카드·일반 화면·로그·오류 응답 표시 금지.** 발급·복구 UI에서만 사용자가 명시적으로 볼 수 있음 |
| 서버 | 평문 키(식별자) | **SHA-256 해시만** |
| 재발급 | 불가(정체성) | 불가(v1) — 분실 = 복구 불가, 발급 모달에 명시 |

키 분실 시 재발급을 v1에서 빼는 이유: 재발급은 "본인 확인"이라는 더 어려운 문제를
끌고 들어온다. 베타는 "키를 잃으면 이 별이의 기록도 잃는다"를 정직하게 말한다.

## 4. 인터페이스 (확정 대상)

Pages Functions `functions/api/observer/` → ObserverRegistry DO(메타·판정) + KV(blob).
**시간·순서의 진실은 서버 `revision`이다. 클라이언트 시각은 참고 메타(`clientSavedAt`)로만 저장.**

### POST /api/observer/backup
```json
요청  { "observerId": "BYL-....", "recoveryKey": "BYLR-....",
        "blob": {...}, "schemaVersion": 1,
        "baseRevision": 17,            // 클라이언트가 아는 최신 (신규 등록 시 0)
        "clientSavedAt": 1784...,      // 참고용 — 판정에 사용 금지
        "clientInstanceId": "ci_..." } // 익명 기기 인스턴스 id (충돌 로그용)
성공  200 { "ok": true, "revision": 18, "serverSavedAt": 1784..., "previousRevision": 17 }
충돌  409 { "error": "backup_conflict", "revision": 21 }   // baseRevision ≠ 현재
```
- 처리 순서 계약 (419-B 구현 계약):
  ```
  1. DO: 키·baseRevision 검증  2. DO: nextRevision 예약
  3. KV: blob:<id>:<nextRevision> 저장  4. KV 저장 성공 확인
  5. DO: currentRevision ← nextRevision 커밋  6. 성공 응답
  ```
  **KV blob 저장 성공 후에만 DO의 currentRevision을 커밋한다. 실패 시 기존
  revision을 유지하며, 커밋되지 않은 KV blob은 고아 객체로 간주한다.**
  (blob 없는 revision은 복구 불능 — 고아 blob은 무해하며 추후 정리)
- baseRevision 불일치 = 다른 기기가 그 사이 백업함 → **무조건 덮어쓰기 금지**,
  409 + 현재 revision 반환. 클라이언트 v1 동작은 §6.
- `force: true` + `confirmedRevision`: 기록 시트의 수동 "지금 백업"에서 사용자
  확인을 거친 경우에만 — 명시적 의도의 덮어쓰기. 자동 백업은 force 사용 금지.
  **`confirmedRevision`은 확인 시점에 본 서버 revision이며, force 처리 순간의
  currentRevision과 다르면(확인 모달이 열린 사이 또 갱신됨) 다시 409를 반환한다.**

### POST /api/observer/restore
```json
요청  { "observerId": "BYL-....", "recoveryKey": "BYLR-...." }
성공  200 { "ok": true, "blob": {...}, "revision": 21,
            "serverSavedAt": 1784..., "schemaVersion": 1 }
```
복구 성공 시 클라이언트는 수신한 `revision`을 자신의 `baseRevision`으로 삼는다.

### 오류 코드 (전 엔드포인트 공통)
`invalid_payload` 400 · `observer_not_found` 404 · `observer_key_mismatch` 403 ·
`observer_taken` 409 (타 키가 선점된 id 등록 시도) · `backup_conflict` 409 (baseRevision 불일치) ·
`rate_limited` 429 · `blob_too_large` 413 · `schema_unsupported` 422 ·
`storage_error` 500
- 오류 응답에 **키·해시 전문 절대 미포함** (420-A 연계). observerId는 뒷 4자리 마스킹.

### 레이트리밋
restore·backup 공통: **IP당 10회/10분 + observerId당 10회/10분** (KV 카운터, TTL).
123bit 키 + 이 제한이면 온라인 무차별 대입은 실질 불가능.

## 5. 저장·복구 흐름

```
[발급·백업]                          [복구]
기록 시트 "기록 지키기" 클릭          첫 화면/시트 "기존 별이 이어가기"
  → recoveryKey 생성                  → observerId + recoveryKey 입력
  → 발급 모달 (키 1회 표시,           → POST restore
     복사 버튼, "분실=복구불가")        ├─ 실패 → §6 표의 문구
  → 즉시 첫 backup (발급 예외 트리거)   └─ 성공 → 충돌 검사:
  → 이후 자동 백업 (이 둘만):               로컬이 빈 프로필 → staging 교체·reload
     · 5분 간격                            로컬에 다른 관찰자 기록 존재
     · visibilitychange(hidden)              → 교체 확인 모달
                                             → §6 보호 백업 (성공해야만 진행)
                                           → §5-1 staging 교체 → reload
```

### 5-1. 복구 staging 프로토콜 (다중 localStorage 키의 유사-원자성)

localStorage 키 2개(profile·habits)의 일괄 갱신은 원자적이지 않다 — 중간에 탭이
죽으면 반쪽 상태가 남는다. 복구는 반드시 이 순서를 따른다:

```
1. 수신 blob 전체 검증 (스키마·observerId 일치·필수 필드)
2. mimesis.byeoli.restore.pending ← 전체 payload + revision 저장
3. profile.v1 저장
4. habits.v2 저장
5. 두 키 재검증 (파싱·observerId 대조)
6. recovery.v1 저장 (키·baseRevision)
7. restore.pending 삭제
8. reload
```

앱 부트 시 `restore.pending`이 존재하면: payload는 2단계에서 이미 전체 검증된
것이므로 **전진 완료**(3~7 재실행)한다. 완료 불가능한 손상이면 pending을 버리고
기존 로컬 유지(롤백). 향후 개인 상태를 단일 envelope 키로 합치는 것이 정답이나
419-B 범위에서는 staging으로 충분하다.

## 6. 충돌·우선순위 규칙

| 상황 | 규칙 |
|---|---|
| 복구 시 로컬 vs 서버 | **서버 채택** (복구는 명시적 의도). 로컬에 실기록 있으면 교체 확인 모달 필수 |
| 교체될 로컬이 서버 등록됨 | **보호 백업 성공이 교체의 전제 조건.** 실패 시 교체 중단 → [다시 시도] / [로컬 기록을 JSON 파일로 내려받고 계속] 중 선택. "백업 실패해도 계속"은 금지 |
| 교체될 로컬이 미등록 | 모달에 경고: "이 브라우저의 기록은 사라집니다" |
| 두 기기 동시 backup | 서버 `revision` 기준. baseRevision 불일치 → `409 backup_conflict` — **무조건 덮어쓰기 금지.** v1 클라이언트: 자동 백업 일시 중지 + 조용한 배지("다른 기기의 기록과 충돌") + revision/baseRevision/clientInstanceId 로그. 수동 "지금 백업"에서만 사용자 확인 후 `force` 덮어쓰기 가능. 병합 없음(v1) |
| 로컬 초기화(리셋) | **로컬만 삭제.** 서버 백업 유지 → 같은 키로 복구 가능 |
| 서버 삭제 | **v1 미제공** — 문의 경로로 수동 처리. 셀프 삭제는 오픈 후 |
| 동일 키 다기기 복구 | **허용.** 백업 충돌은 revision으로 감지하며 자동 병합·자동 덮어쓰기는 하지 않는다. 사용자가 확인한 수동 force 백업만 서버 기록을 교체한다 |
| observerId 선점 | 최초 등록 키가 주인. 타 키 등록 시도 = 409 (충돌확률 8.5×10¹¹분의 n — 정책만 명시) |

## 7. 실패 상황 표 (UI 문구까지 확정)

| 상황 | 서버 응답 | 사용자 문구 |
|---|---|---|
| 잘못된 형식 코드/키 | (전송 전 클라 검증) | "코드 형식이 맞지 않습니다" |
| 미등록 관찰자 | 404 | "등록된 기록을 찾지 못했습니다. '기록 지키기'를 했던 코드인지 확인해 주세요" |
| 키 불일치 | 403 | "복구 코드가 일치하지 않습니다" (남은 시도 수 미표시 — 열거 방지) |
| 반복 실패 | 429 | "시도가 너무 많았습니다. 10분 뒤에 다시" |
| 네트워크 실패 | — | "연결하지 못했습니다" + [다시 시도] (지수 백오프 3회) |
| 서버 5xx | 500 | "지금은 복구할 수 없습니다. 잠시 뒤에 다시" |
| 복구 중 새로고침/탭 종료 | — | §5-1 staging — 부트 시 `restore.pending` 발견하면 전진 완료 또는 롤백. 반쪽 상태 불가 |
| 백업 충돌 (타 기기) | 409 backup_conflict | 조용한 배지 "다른 기기의 기록과 충돌" — 자동 백업 중지, 수동 백업에서 확인 후 덮어쓰기 |
| 보호 백업 실패 | — | **교체 중단.** "지금 기록을 지키지 못해 복구를 멈췄습니다" + [다시 시도] [파일로 저장하고 계속] |
| blob 손상/스키마 상이 | 422 | "기록 형식이 달라 복구할 수 없습니다" + 문의 안내 |
| 백업 실패(자동) | — | 시트에 조용한 배지 "마지막 백업 N분 전 실패" — 산책 방해 금지 |

## 8. 2일차(419-B) 준비물

- [ ] **ObserverRegistry DO** — 신규 소형 워커 `mimesis-observer-registry` (Authority 워커와
      별개 배포 단위, 클래스 1개). Pages에 서비스 바인딩 `OBSERVER_REGISTRY`.
      워커 배포는 홈즈 영역과 접점 — 스캐폴드는 Claude, 배포·바인딩은 합의 후.
- [ ] **KV 네임스페이스 `OBSERVERS` 생성 + Pages 바인딩** (지금 생성해도 무방 — 홈즈 확인)
- [x] §4 인터페이스 홈즈 QC 반영 (이 개정)
- [x] §9 결정 2건 판정 반영

## 9. 사인오프 결정 (홈즈 판정 확정)

1. **자동 백업 트리거**: v1은 **5분 주기 + visibilitychange(hidden)** 두 개만.
   예외: **Recovery Key 발급 직후 첫 백업은 즉시 실행.** 기록 발생 debounce·
   기록 시트 닫기 트리거는 제외.
2. **충돌 처리**: 사용자 경고 모달 없음(산책 보호) — 단 **충돌 감지는 구현**:
   서버 revision 판정 · baseRevision · 익명 clientInstanceId · 충돌 로그.
   "무경고이므로 무조건 덮어쓰기"는 금지 (§6). 덮어쓰기는 수동+확인 경로만.

## 10. 명시적 비범위 (오픈 후)

키 재발급 · 서버 셀프 삭제 · 프로필 병합 · archive 백업 · 계정/이메일 연결 ·
복수 별이 프로필 전환 UI
