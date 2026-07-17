# BUILD 425 — Threads Capture(엽서) + Reply 조사·설계

작성: 2026-07-17 밤 · 상태: **조사·설계 보고 — 구현 착수 전 대기** (지시서 "첫 보고 후 대기")
판정 반영(Vase): **월요일 공개 전 = 캡처 우선. 답글은 조회 가능성 조사 + Draft Mode 설계까지.** 자동 답글은 실사용 데이터 축적 후.
추가 요구(Vase): 캡처는 게임 화면이 아니라 **별이가 남긴 엽서(Postcard)** · 좋아요 · 기억해둠 · Collective Observation Genome 확장 경계.

---

## 1. 현재 Threads 이미지·발행 파이프라인 (레포 실측)

`functions/api/autopost.ts` (BUILD 277→355→417→422-OPS-A):

1. 크론(08/18/22 KST) → `POST /api/autopost` (X-Publish-Key)
2. 문장: `byeolli_posts.json` 풀 113개에서 최근 25개 제외 랜덤
3. 이미지: R2 `captures/` 키 역순 상위 40에서 랜덤, **4/5 확률 첨부** — 현재 전부 수동 업로드 36장(`walk/`), **메타데이터 없음**
4. 내부 feed KV prepend → `dispatchToThreads()`: 컨테이너 생성 → 발행(3초×5 재시도) — 토큰은 KV `threads_auth`, 7일 주기 자동 갱신
5. `publish_log` 기록 (422-OPS-A)

**핵심 문제 확인**: ① 걷기 앱에 캡처 생성 코드가 없다(422-OPS §4 확정 — 이미지는 수동 자산) ② **문장과 이미지가 서로 무관하게 랜덤 결합**된다 ③ 이미지는 상단 월드 장면뿐 — 관찰일기 문맥 부재. → A(엽서)가 ②③을 동시에 푼다: 이야기가 이미지 안에 있으면 문장-이미지 정합 문제 자체가 완화된다.

---

## 2. Meta Threads API 조사 결과 (공식 문서, 2026-07-17 확인)

### 2-1. 댓글 조회 — ✅ 가능
- `GET /{media-id}/replies` — 최상위 답글만 · `GET /{media-id}/conversation` — 전체 깊이 (루트 포스트 전용)
- 필드: `id, text, username, timestamp, is_reply, replied_to, root_post, has_replies, hide_status` — **작성자는 `username`으로 식별**(공개 계정 + 본인만 노출)
- 커서 페이지네이션(`before/after`), `reverse` 정렬
- 권한: `threads_basic`(모든 호출 필수) + **`threads_read_replies`**(reply GET 필수)

### 2-2. 답글 작성 — ✅ 가능
- 발행과 동일한 2단계: `POST /me/threads` + **`reply_to_id`** → `threads_publish` (컨테이너 후 **평균 30초 대기 권장** — 현행 3초×5보다 길게 잡아야 함)
- **자기 게시물의 답글 트리에는 루트 소유자 자격으로 답글 가능** (별도 keyword_search/mentions 권한 불필요)
- 숨김/관리: `POST /{reply-id}/manage_reply` — `threads_manage_replies`

### 2-3. 한도·중복 키
- **250 posts / 1,000 replies / 100 deletes per 24h** — `GET /{user-id}/threads_publishing_limit`로 실시간 조회(`reply_quota_usage` 포함). 우리 정책(일 3~5개)은 한도의 0.5% — 여유 충분
- 멱등 키: **reply의 media `id`** — 안정적. `sourceCommentId` 기준 중복 방지 설계 그대로 유효

### 2-4. 웹훅 — 존재하나 v1 부적합
- topics: moderate(`replies`, `delete`) / interaction(`mentions`, `publish`)
- 단 **App Review(Advanced Access) + 비즈니스 인증 필수** → 검수 리스크·기간 불확실
- **판정: v1은 폴링(30~60분)** — Vase 정책 주기와 정확히 일치, 검수 불필요

### 2-5. 좋아요(❤️) — ❌ 플랫폼이 막음
- **공식 API에 타인 게시물/답글에 좋아요를 누르는 엔드포인트가 존재하지 않는다** (인사이트로 "받은 좋아요 수"만 조회 가능)
- 대안 판정 요청(§6): (a) "❤️" 한 글자 텍스트 답글로 대체 — 가능하나 답글 1건을 소비하고 별이답음 논점 (b) v1 보류, **기억해둠(내부)만 먼저** — 권고 (b)

### 2-6. 현재 토큰으로 가능한 범위 (실호출 없이 판정)
- 현재 토큰은 BUILD 417 당시 **발행 용도로 대시보드 토큰 생성기에서 발급** — `threads_read_replies`·`threads_manage_replies` 스코프가 포함됐을 근거가 없다 → **미포함으로 간주**
- **Vase가 할 일 (Meta 대시보드, 5분)**:
  1. 앱 Use case에 위 두 권한 추가
  2. 토큰 생성기에서 **threads_basic + threads_content_publish + threads_read_replies + threads_manage_replies** 체크 후 재발급
  3. CF Pages env `THREADS_TOKEN` 교체 → 기존 부트스트랩 로직이 첫 실행 때 KV로 이관(코드 변경 불필요)
  4. (별도) 계정 소개에 AI 기반 존재임을 명시 — 지시서 C의 고지 원칙
  5. (선택·later) 웹훅 원하면 비즈니스 인증 + App Review — v1 불필요

---

## 3. A. 엽서(Postcard) 캡처 설계

### 3-1. 개념
게임 스크린샷이 아니라 **별이가 남긴 엽서** — 한 장 안에 장면과 관찰이 함께 있어 "풍경을 보는 AI"가 그대로 전달된다.

### 3-2. 규격 — 4:5 (1080×1350) 우선 검증
| 후보 | Threads 피드 | 판정 |
|---|---|---|
| **4:5 (1080×1350)** | 세로 노출 최대(IG 계열 표준 크롭 한계) | **우선 — 가로 대비 화면 점유 ~1.9배** |
| 3:4 (1080×1440) | 4:5로 크롭될 위험 | 보류 |
| 1:1 (1080×1080) | 안전하나 밋밋 | 폴백 |
- 하단 일기 본문 32~38px/줄간 1.5 (1080px 폭 기준) — **모바일 실기기에서 읽히는지가 최종 게이트** (지시서 H)

### 3-3. 레이아웃 (앱 톤 그대로 — 새 디자인 금지)
```
┌────────────────┐
│  월드 장면 62%  │ ← 별이+현재 대상 중심 크롭, HUD 제외, 실제 sky/날씨
├────────────────┤ ← 1px var(--line)
│  관찰일기 38%   │ ← 3~6줄, 모노폰트, --panel 배경, 길면 하단 페이드
│  궁금 · 나무 버섯 · 2.7초   │ ← 서명줄(act·대상·지속) + 워드마크
└────────────────┘
```
- 일기 선별: 현재 타깃과 같은 `type/targetId` 로그 우선 → 부족하면 직전 30~60초에서 선별 → "그냥 지나침"류로 채우지 않음 · 같은 문장 반복 금지
- **금지**: Observer Code · Recovery Key · 개인 데이터 · 브라우저 전체 스크린샷

### 3-4. 구현 구조 — 전용 합성기 (화면 캡처 아님)
- `public/byeoli-walk/postcard.js`: 씬 캔버스에서 별이 중심 영역을 크롭해 1080×1350 OffscreenCanvas에 합성 + 일기 텍스트 직접 드로잉 → JPEG blob. **사용자 화면 레이아웃 무변경.**
- 일기 소스: live 모드의 liveEvent 스트림 축적분(Authority 문맥 — 모든 뷰어 공통) — 관찰자 개인 일기는 쓰지 않는다(개인정보 + 문맥 불일치)

### 3-5. 누가 찍는가 (자동화 경로 비교)
| 경로 | 평가 |
|---|---|
| **(권고) 콘솔 상주 캡처** — byeoli-ops 콘솔 iframe(live)이 "좋은 순간"(act 발생 + 연관 로그 ≥3줄) 감지 시 자동 합성·업로드 + 콘솔 [엽서 찍기] 수동 버튼 | Access 뒤라 업로드 경로 안전 · 인프라 추가 0 · **월요일 전 현실적** · 한계: 콘솔이 열려 있을 때만(423 lazy와 같은 철학) |
| Cloudflare Browser Rendering 크론 | 무인 정시 가능하나 신규 유료 인프라 + 홈즈 협의 필요 → 후속 |
| 공개 클라이언트 업로드 | ❌ 위조 캡처 주입 가능(PUBLISH_KEY를 클라이언트에 못 둠) — 금지 |
- 업로드: 신규 `POST /api/ops/capture` (ops 호스트 + Access 뒤 — 콘솔 쓰기 예외 3호로 선언, 423 예약과 동일 규율) → R2 + 메타 저장

### 3-6. 메타데이터 (KV `capture_meta`, R2 키와 1:1)
`{captureId, capturedAt, zone(v1: worldX% — 서버 존 API 부재), skyPhase, weather, byeoliAction, targetId, targetType, diaryEventIds[], diaryLines[], r2Key}`
- autopost: **메타 있는 엽서 우선 선택** + `publish_log`에 `captureId` 연결 → Ops 콘솔에서 "이 발행 이미지가 어떤 장면이었는지" 역추적 (지시서 요구)

---

## 4. B~F. 댓글·답글 설계 (v1 = Draft Mode까지)

### 4-1. 수집 (425-B)
- 크론 30~60분 → 신규 `GET` 폴러: 최근 발행물(publish_log의 requestId=미디어 id)의 `/replies` 조회 → `reply_log` KV upsert (멱등: reply media id)
- `authorIdHash = SHA-256(username + 서버 salt)` — username 원문은 저장하지 않는다(표시용 마스킹 `u***e`만 파생 저장). 프로필 조회·저장 금지

### 4-2. reply_log 스키마 (지시서 F + 확장 예약 필드)
```json
{
  "replyId": null, "sourcePostId": "...", "sourceCommentId": "...",
  "commentCreatedAt": 0, "detectedAt": 0,
  "authorIdHash": "...", "authorMask": "u***e",
  "category": "question|observation|greeting|spam|sensitive|other",
  "decision": "ignored|drafted|approved|published|failed",
  "reason": "...", "generatedText": null,
  "approvedAt": null, "publishedAt": null,
  "threads": { "errorCode": null, "requestId": null },
  "modelVersion": null, "genomeVersion": null,
  "bookmarked": false,
  "observedTargets": []
}
```
- 저장 금지(하드룰): 토큰 · API 헤더 원문 · IP · 프로필 · Recovery Key · Observer Code
- `bookmarked`/`observedTargets`는 §6·§7의 예약 필드 — v1은 bookmarked만 사용, observedTargets는 **비워둔다**

### 4-3. 답글 정책 (지시서 C 확정치)
일 3~5건 · 댓글 10분 숙성 후 후보 · 게시물당 1~2건 · 같은 계정 24h 1회 · 이모지/ㅋㅋ/스팸 무응답 · 민감 주제(비난·정치·의료·법률·개인정보) 자동 발행 금지 · 애매하면 무응답 · 발행은 즉시 아닌 지연

### 4-4. 생성 파이프라인 (425-C, Draft Mode)
입력(원 게시물 텍스트·이미지 메타·해당 엽서의 관찰일기·댓글·최근 별이 상태·**Byeoli Observation Genome**·최근 답글·금지 목록) → MIMESIS Writing Studio → Claude API → 후보 1~2안 → 안전·중복·문체 검증 → `drafted`로 저장. **어느 단계든 실패 = 무발행.**
- 문체 계약: 짧고 담담 · 이해의 흔적 · 감사 반복 금지 · 인간인 척 금지 · 본 적 없는 것 금지 · 약속 금지 · v1 관계 기억 발화 금지 (지시서 D 예시 그대로 테스트 케이스화)

### 4-5. 승인 UI — 설계 QC 질문 (지시서 G)
| 안 | 평가 |
|---|---|
| 콘솔 내 "Threads 대화" 섹션 + 승인/거절 | 423 예약과 동일 규율(쓰기 예외 목록에 추가, validate:ops 강제) — 화면 하나로 문맥(원 게시물·엽서·일기) 즉시 대조 가능 |
| 별도 Reply Review 페이지 | 경계는 더 또렷하나 화면 분산 + Access 앱 추가 관리 |
- **권고: 콘솔 내 섹션** — 단 "콘솔 쓰기 예외는 예약·캡처·답글승인 3종뿐"을 validate:ops가 목록으로 고정. **홈즈 QC 요청 사항.**
- Phase 1: 승인한 것만 발행, 최소 20~30건 수동 검토 후 Phase 2 논의. **Public Beta 전에는 Phase 1만** (Vase 판정) — 자동 발행 경로 부재를 게이트가 검증.

---

## 5. 기억해둠(⭐) — v1 포함 권고
- 별이가 좋은 댓글을 **혼자 기억**한다: 후보 생성 시 Claude가 `bookmark` 신호 판정(공유·관찰형 댓글) → `bookmarked:true` — **발행 없음, 외부 노출 없음, 저위험**
- Ops 콘솔: "오늘 별이가 기억한 댓글 N개" + 목록(마스킹된 작성자)
- ❤️는 §2-5대로 플랫폼 불가 — 대체안 판정 대기

## 6. 향후 확장 — Collective Observation Genome (Vase, 설계 경계만)
> 댓글은 단순 SNS 반응이 아니라 **집단 관찰 데이터의 일부**가 될 수 있도록 경계를 설계한다.
> v1에서는 저장하지 않지만, 향후 확장 가능한 메타데이터 구조를 함께 검토한다.
- 방향: `Byeoli Genome + Observer Genome → Collective Genome → Planet Mood` — 사람들이 자주 말하는 대상(비·벤치·두꺼비·노을)이 별이의 세계 분위기에 **천천히** 스며든다. 별이는 휘둘리는 게 아니라 함께 변한다.
- 예약된 경계: `observedTargets[]`(댓글 언급 대상 type — v1 미수집) · genomeVersion · 422-OPS-E collective 계약(k-익명·revision 멱등)과 같은 규율로만 집계 · **개별 댓글→즉시 반영 금지**(조작 방어) · 홈즈와 별도 설계 빌드로

## 7. 개인정보·안전 경계 종합
- username 원문 미저장(해시+마스크) · 프로필 미조회 · 토큰/헤더/IP 금지 · 민감 카테고리 자동 발행 차단 · AI 고지는 계정 소개/운영정책(기계적 반복 고지 없음 — Vase 할 일 §2-6)
- 캡처: 개인 관찰자 데이터 미포함(라이브 문맥만) · HUD/키 노출 금지 게이트

## 8. 빌드 단계와 월요일 전 최소 범위
| 빌드 | 내용 | 시점 |
|---|---|---|
| **425-A Postcard** | 합성기 + 콘솔 상주/수동 캡처 + capture_meta + autopost 엽서 우선 + publish_log 연결 | **월요일 전 목표** |
| **425-B Reply Ingest** | 토큰 재발급(Vase) 후 폴러 + reply_log + 콘솔 읽기 전용 "Threads 대화" | 월요일 전 = **설계·조사까지(본 문서)**, 구현은 토큰 후 |
| 425-C Draft Mode | 후보 생성 + 승인 발행 (Phase 1) | 홈즈 QC 후 |
| 425-D 기억해둠 (+❤️ 대체 판정) | bookmarked + 콘솔 표시 | 425-C와 함께 |
| 425-E Phase 2 제한 자동화 | 20~30건 검토 데이터 후 | Public Beta 이후 |

### 검증(지시서 H) 요지
캡처: 장면+일기 동시 가시 · 모바일 가독 실기기 확인 · 이미지-일기 연관 · HUD/키/개인정보 0 · 장단 로그 레이아웃 · R2 메타 추적 · autopost 회귀 없음
답글: sourceCommentId 멱등 · 상한/쿨다운 · 스팸 무응답 · 민감 차단 · 생성 실패=무발행 · 승인 전 발행 불가 · 문맥 불일치 차단 — 각각 게이트(validate:ops 확장 + 신규 테스트)로 고정

---

**다음 행동 대기 중** — ① 본 설계 승인 여부 ② §2-5 ❤️ 대체 판정 ③ §4-5 승인 UI 위치 판정 ④ Vase 토큰 재발급(§2-6). 승인되면 425-A(엽서)부터 착수.
