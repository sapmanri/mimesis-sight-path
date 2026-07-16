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
│ KV OBSERVERS (신규 네임스페이스)                   │
│   obs:<observerId> = {                            │
│     keyHash,        // SHA-256(recoveryKey) hex   │
│     blob,           // 불투명 — 아래 §2           │
│     savedAt,        // 클라이언트 저장 시각(ms)    │
│     schemaVersion,  // blob 스키마 (현재 1)        │
│     createdAt, updatedAt                          │
│   }                                               │
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
- 크기 제한: **64KB** (초과 시 `blob_too_large`). 현재 실측 프로필+습관 ≪ 64KB.

## 3. 복구 코드 체계

| | Observer Code (기존) | Recovery Key (신규) |
|---|---|---|
| 형식 | `BYL-XXXX-XXXX` | `BYLR-XXXXXX-XXXXXX-XXXXXX-XXXXXX` |
| 엔트로피 | 39.6bit | **~123bit** (Crockford base32 24자, I/L/O/U 제외) |
| 생성 | 첫 방문 자동 | **"기록 지키기" 명시 동작 시** `crypto.getRandomValues` |
| 노출 | 카드·시트 표시 가능 | **어디에도 표시 금지** — 발급 모달 1회 + 로컬 보관 |
| 서버 | 평문 키(식별자) | **SHA-256 해시만** |
| 재발급 | 불가(정체성) | 불가(v1) — 분실 = 복구 불가, 발급 모달에 명시 |

키 분실 시 재발급을 v1에서 빼는 이유: 재발급은 "본인 확인"이라는 더 어려운 문제를
끌고 들어온다. 베타는 "키를 잃으면 이 별이의 기록도 잃는다"를 정직하게 말한다.

## 4. 인터페이스 (확정 대상)

Pages Functions `functions/api/observer/` — Authority 무관, KV OBSERVERS만 사용.

### POST /api/observer/backup
```json
요청  { "observerId": "BYL-....", "recoveryKey": "BYLR-....",
        "blob": {...}, "savedAt": 1784..., "schemaVersion": 1 }
성공  200 { "ok": true, "savedAt": ..., "prevSavedAt": ...|null }
```
- `obs:<id>` 없음 → **등록**: keyHash 저장 + blob 저장 (선점)
- 있음 → hash 대조: 일치 시 저장(LWW), 불일치 `403 observer_key_mismatch`

### POST /api/observer/restore
```json
요청  { "observerId": "BYL-....", "recoveryKey": "BYLR-...." }
성공  200 { "ok": true, "blob": {...}, "savedAt": ..., "schemaVersion": 1 }
```

### 오류 코드 (전 엔드포인트 공통)
`invalid_payload` 400 · `observer_not_found` 404 · `observer_key_mismatch` 403 ·
`observer_taken` 409 (backup에서 타 키가 선점된 id 등록 시도) ·
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
  → 즉시 첫 backup                    └─ 성공 → 충돌 검사:
  → 이후 자동 백업:                        로컬이 빈 프로필 → 즉시 적용·reload
     · 5분 간격                            로컬에 다른 관찰자 기록 존재
     · visibilitychange(hidden)              → 교체 확인 모달
     · 기록 시트 닫을 때                        (로컬이 서버 등록돼 있으면
                                                떠나기 전 자동 backup 1회)
                                           → localStorage 교체 → reload
```

## 6. 충돌·우선순위 규칙

| 상황 | 규칙 |
|---|---|
| 복구 시 로컬 vs 서버 | **서버 채택** (복구는 명시적 의도). 로컬에 실기록 있으면 교체 확인 모달 필수 |
| 교체될 로컬이 서버 등록됨 | 교체 전 자동 backup 1회 — 어느 쪽도 유실 없음 |
| 교체될 로컬이 미등록 | 모달에 경고: "이 브라우저의 기록은 사라집니다" |
| 두 기기 동시 backup | **last-write-wins**, 응답에 `prevSavedAt` 반환. 병합 없음(v1) |
| 로컬 초기화(리셋) | **로컬만 삭제.** 서버 백업 유지 → 같은 키로 복구 가능 |
| 서버 삭제 | **v1 미제공** — 문의 경로로 수동 처리. 셀프 삭제는 오픈 후 |
| 동일 키 다기기 복구 | 허용 (restore는 읽기 연산). backup은 LWW로 수렴 |
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
| 복구 중 새로고침 | — | localStorage 교체는 **원자적으로 마지막에 1회** — 중간 상태 없음 |
| blob 손상/스키마 상이 | 422 | "기록 형식이 달라 복구할 수 없습니다" + 문의 안내 |
| 백업 실패(자동) | — | 시트에 조용한 배지 "마지막 백업 N분 전 실패" — 산책 방해 금지 |

## 8. 2일차(419-B) 준비물

- [ ] **KV 네임스페이스 `OBSERVERS` 생성 + Pages 바인딩** (대시보드 또는 Cloudflare MCP)
- [ ] 이 문서의 §4 인터페이스에 홈즈 사인오프
- [ ] 아래 §9 결정 2건

## 9. 사인오프 필요 결정 (권고안 표시)

1. **자동 백업 트리거에 '기록 발생 시 debounce 30s' 추가 여부**
   — 권고: v1은 5분+hidden만 (쓰기 비용 통제). 오픈 후 로그 보고 조정.
2. **backup 시 LWW 경고 UI** (서버 savedAt이 더 최신일 때 클라이언트가 덮어쓰기 확인)
   — 권고: v1은 **무경고 LWW** + prevSavedAt 로깅만. 다기기 동시 사용은 베타
   시나리오 밖이고, 경고 모달은 오탐(시계 오차)으로 산책을 끊을 위험이 더 큼.

## 10. 명시적 비범위 (오픈 후)

키 재발급 · 서버 셀프 삭제 · 프로필 병합 · archive 백업 · 계정/이메일 연결 ·
복수 별이 프로필 전환 UI
