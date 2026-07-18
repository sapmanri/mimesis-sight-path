# BUILD 429 — Genome Seasons (정본)

> **Genome은 문체를 저장하지 않는다. 무엇을 선택해, 어떻게 바라보는지를 저장한다. 문체는 그 결과다.**
>
> 이 문서가 429의 **설계 정본**이다. 429-B 세션 상세 기록은 [BUILD_429B_GENOME_ARCHITECTURE.md](BUILD_429B_GENOME_ARCHITECTURE.md)(부록),
> 프로토타입 코드·실행 결과 원본은 `docs/429b-prototype/`.
> 429는 "별이 문장 엔진"으로 시작해 **MIMESIS 전체 엔진의 첫 구현**이 되었다.

## 0. 최종 구조 (Vase 판정 2026-07-18~19, 확정)

```text
World
→ Request
→ Execution Contract
→ Selection
→ Observation
   ├─ Identity Genome
   └─ Daily Genome
→ Generation
→ Validation
→ Resolution
```

**순서가 핵심.** 초기 설계는 `Genome → 생성 → 조회`였고, 그 결과 A 실행에서 30건 중 18건(60%)이
조회 실패했다. 생성기와 조회기가 서로 다른 조합 공간을 상상했기 때문이다. **Request가 먼저 존재한다** —
런타임은 별이가 무엇을 만났는지 이미 알고 있다.

## 1. Execution Contract — **PASS (확정, 재논의 금지)**

계약이 정의하는 것 셋:

| | 내용 |
|---|---|
| **Request Schema** | 어떤 요청이 들어올 수 있는가 |
| **Resolution Ladder** | 그 요청이 어떤 경로로 해소되는가 |
| **Guarantee** | `pre` = Coverage 보증 / `ondemand` = Resolution·Fallback 보증 |

### 1-1. `pre / ondemand` 이중 모드 (필수 구분)

- **`pre`** — 유한·열거 가능한 요청 공간 → 미리 생성, 런타임은 조회만. **Coverage 100% 필수.** (별이 문장집, 빼콩 Brain)
- **`ondemand`** — 무한·발견형 요청 공간 → 요청마다 생성. **Coverage 대신 Resolution 보증.** (Writing Studio, Question Engine)

이 구분이 없으면 질문 엔진에 별이 문장집의 100% 커버리지 규칙을 억지로 옮기게 된다.

### 1-2. Resolution Ladder (별이)

`exact → target → category → generic-situation → Rule`

특수 플래그(`rare/passed/first/trace`)는 **일반 대상 조회와 섞지 않는다** — 자기 계열
(`exact-special → category-special → generic-special`) 안에서만 내려간다. Rule Brain은 영구 폴백 —
어느 단계가 실패해도 일기는 멈추지 않는다.

### 1-3. 메타 소유권 — Execution Contract가 소유한다

Generation은 **`{key, line, formGroup}`만** 반환한다. 대상·카테고리·mood·플래그·날씨 등 모든 메타는
계약이 이미 갖고 있고 `joinMeta`가 조인한다. 생성기에게 확정된 메타를 다시 쓰게 하면 출력이 부풀고
드리프트가 생긴다 — 1차 실행에서 `key=dandelion`인데 `targetType=nature`가 나왔다. 조인 방식에서는
이 드리프트가 **구조적으로 불가능**하다.

### 1-4. 지표는 분리한다

뭉뚱그린 exact-hit(36.4%)은 폐기. 36.4%의 정체는 **분모에 special·generic 버킷을 섞은 나눗셈**
(96/264)이었다 — 실제 TopTarget Normal Exact는 96/96 = 100%. 숫자를 맞추려 정의를 바꾸지 말고 지표를 분리한다:

- `targetExactRate` — TopTarget Normal Exact (기준 80% 이상)
- `specialResolutionRate`
- `genericResolutionRate`

⚠ **게이트 사고 기록 (2026-07-19)**: 지표 분리 후 `gateReport`가 사라진 `sim.exactRate`를 계속
비교했다 — `undefined < 0.8`은 항상 false라 **exact 게이트가 조용히 꺼진 채**였다. 같은 날 수정.
검증기 자체를 음성 테스트로 검증하라는 수칙의 실사례.

## 2. Selection — 무엇을 볼 것인가 (429 최대 발견)

같은 숲에서 **삽만리는 빛·움직임·거리**를, **헤밍웨이는 사람·행동·결과**를, **건축가는 구조·선·비례**를 고른다.

Genome은 Observation만 만드는 게 아니라 **Selection도 만든다.**

- **Selection = 무엇을 볼 것인가 / Observation = 그걸 어떻게 볼 것인가.** 둘은 다른 층이다.
- Daily는 **순서만 바꿀 수 있고, Identity에 없는 것을 새로 보게 만들지 못한다** (`selectFrom`이 강제).
- 문체는 이 둘 뒤에서 자연스럽게 생긴다. "문체가 다르다"가 아니라 **처음부터 보는 것이 다르다.**

## 3. Observation — Identity Genome + Daily Genome

**Identity Genome (9축, 고정)** — 작가·캐릭터·관찰자를 그답게 만드는 축. 365일 안 변한다.

```json
{ "voice":"banmal", "selfPresence":"rare", "observer":"first_person",
  "closure":"open", "emotion":"indirect", "distance":"medium",
  "observationDensity":"medium", "association":"low", "judgement":"low" }
```

**Daily Genome (2축)** — 오늘만 변한다: `tempo`, `focusOrder`.

**Validation이 강제한다**: Daily가 Identity 축을 건드리면 조용한 덮어쓰기가 아니라 **실패**다.
(1차 실행에서 별이 계약이 `speech:"jondaemal"`로 나왔다 — 린트는 통과했지만 별이가 아니었다.
매일 바뀔 값과 정체성 고정값이 한 층에 섞여 있던 탓. 두 층 분리가 그 답이다.)

축 이름은 '어떻게 쓰는가'가 아니라 **'어떻게 보는가'**로 읽는다:
`focusOrder=[light,…]`는 "빛을 먼저 써라"가 아니라 **"빛을 먼저 본다"**. `judgement`는 확신도가 아니라
판단을 얼마나 미루는가. 이 순서가 뒤집히면 다시 문체 엔진으로 돌아간다.

**작가 팩이 성립한다**: `Identity=헤밍웨이 + Daily=오늘 비` = 오늘의 헤밍웨이.
`Identity=삽만리 + Daily=첫눈` = 겨울의 삽만리.

⚠ 미결 명명: `observer`(`first_person`)는 시점 문법으로 읽힐 여지 — 후보 `vantage`/`viewpoint`.

## 4. Generation — 최소 책임

Generation의 책임은 **key에 대응하는 문장을 만드는 것뿐**이다. 출력은 `{key, line, formGroup}`만
(§1-3 메타 소유권). 문형 다양성은 **작가의 게놈이 아니라 생성기의 기본 능력**(MediumGrammar)이다 —
단조로움을 계약 값으로 고치기 시작하면 계약에 다시 문학이 들어온다.

- `formGroup` 8종: `state · change · sense · detail · discovery · action · question · trace`
  — **내부 메타. 앱 일기·엽서·Threads에 절대 노출 금지** (렌더 계약).
- **reusable 계약**: 카테고리 문장(`reusable:true`)은 고유명사뿐 아니라 **고유 관찰어**
  (벤치 다리·홀씨·꽃잎·수염·발자국·줄기)도 금지. 그게 들어가면 애초에 카테고리 전체에 못 쓴다.

### 4-1. Observation Grammar

"`~있다` 20% 이하" 같은 **동사 금지는 실패한다** — 막으면 "남아 있다/놓여 있다/보인다"로 도망갈 뿐이다.
동사가 아니라 **관찰 방식의 분포**를 본다: 존재형·변화형·감각형·질문형·발견형·행동형 —
한 종류 35% 이하, 최소 4종. formGroup(어떻게 쓰는가)과 Observation Grammar(어떻게 보는가)는 다른 층이다.

## 5. Validation 3층 / Resolution

```
JSON 스키마 → 기계 규칙(coverage·reuse·meta정합·diversity·grammar) → critic(별도 호출)
```

- critic은 **수정 금지 — 통과/탈락과 이유만**. critic이 고쳐 쓰게 하면 원문보다 나쁜 문장이 슬쩍 들어온다.
- 대상 정합("이 문장이 현재 관찰을 말하는가")은 기계가 아니라 **critic**이 본다. "홀씨"라는 단어의 유무가 아니다.
- 모든 유효 요청은 Ladder를 타고 반드시 어딘가에 도달한다. 폐기된 문장집은 Rule로 내려간다.

## 6. 실행 결과 기록

### 6-1. A (v2-open) — 실패 원본 (보존: `docs/429b-prototype/results/A-v2open-report.json`)

계약 린트 0 · critic fail 0인데 **30건 중 18건 조회 실패(60%)**. 품질 게이트 전부 통과인데
사용자는 아무것도 못 본다.

실패 원인 (둘 다 구조적):
1. **조회 계약 부재** — Request 공간 없이 생성부터 했다. 생성기와 조회기가 서로 다른 조합 공간을 상상했다.
2. **계약이 에세이였다** — `rules`가 "가까이 가지 않는다"·"나를 숨긴다" 같은 자유 문자열.
   해석이 생성기마다 달라지고, 계약 안에 문학이 들어와 정규화도 검증도 불가능했다.

→ *문장 생성 품질과 문장 조회 가능성은 별개의 계약이다.* Execution Contract는 여기서 태어났다.

### 6-2. v3.1 — Execution Contract 검증 PASS (2026-07-19, 현행 게이트로 재측정)

| Contract 지표 | 결과 |
|---|---|
| JSON 잘림 · 메타 드리프트(orphan) | 0 · 0 |
| 존댓말 (Identity 강제) | 0 |
| requiredKeys 충족 | **4슬롯 100%** (70키/슬롯) |
| 런타임 시뮬레이션 1,056건 Rule 폴백 | **0** |
| 특수 플래그(`rare/first/passed/trace`) 폴백 | **0** |
| TopTarget Normal Exact | **384/384 = 100%** |
| specialResolutionRate · genericResolutionRate | 100% · 100% |
| 평가 세트 30건 조회 | **30/30** |

**Execution Contract가 증명하려던 것은 전부 증명됐다.** 단, 콘텐츠 층은 아직 미달이다 (§7):

| 콘텐츠 층 잔존 (480문장 실측) | 결과 |
|---|---|
| 슬롯간 문장 중복 | **16건** (같은 대상×wonder가 슬롯만 바뀌어 재등장하는 패턴이 다수) |
| reusable 고유 관찰어 지목 | 27건 (일부는 린터 과잉 매칭 — "잎사귀/귀퉁이"의 `귀`. 린터 보정 필요) |
| 메타 자기모순 (trace 흔적 부재 등) | 7건 |
| Observation Grammar 과점 | 3슬롯 (감각형 36~37%, night 존재형 41%) |
| critic 사실성 검증 | **미실행** (구현 전) |

## 7. 남은 작업 (순서 고정)

1. **⑥ 슬롯간 의미 중복 제어** — 문장 원문 전체를 넘기지 않되, **이미 본 장면의 의미는 넘긴다**.
   Observation 분포만으로는 부족하다(분포가 같아도 같은 의미 문장이 다시 나온다). 이전 슬롯에서 전달할 것:
   - `usedObservationSignatures` — `{focus, formGroup, scope, core}` (focus + formGroup + target/category + 핵심 변화)
     예: `{"focus":"light","formGroup":"change","scope":"bench","core":"그림자가 등받이까지 이동"}`
   - `usedCorePhrases` — 정규화된 핵심 구문
   - `usedVerbs` — 대상별 핵심 동사
   서명의 `scope`는 계약이 소유한다(§1-3 불변). Generation 출력에는 관찰 서명 성분(`focus`·`core`)이
   추가된다 — 메타를 다시 쓰는 것이 아니라 **관찰 내용의 자기 신고**이므로 §1-3과 충돌하지 않는다.
2. **4슬롯 최종 재생성·검증** — 완료 조건 전부 충족:
   슬롯 내·슬롯 간 완전 중복 0 / 근접 의미 중복 0 / reusable 대상 지목 0 /
   Observation Grammar 균형 통과 / critic 사실성 위반 0 / §6-2 Contract 지표 전부 유지.
3. **B/C/D 비교** — 4슬롯 전체가 아니라 **동일 대표 사건 30개**로 먼저:
   `B: v2.1(부분폐쇄) / C: v3 별이 / D: v3 dry-report`.
   반드시 동일 requiredKeys·DailyContext. 각 사건마다 **선택한 것 → 관찰 방식 → 최종 문장**을 나란히 —
   "문체가 다르다"가 아니라 **처음부터 보는 것이 다르다**를 증명한다.
   (시드 고정 불가 — Opus 4.8은 sampling 파라미터 미수용. 사건·문맥·프롬프트만 동일 고정.)
4. 4축 판정표로 Vase 수동 판정: 실제로 본 것을 말했나 / 문장이 서로 달랐나 / 지나치게 꾸미지 않았나 / 별이의 거리감이 있었나.
5. 이후 429-D(문장집 생성·KV) → 429-E(클라 book 우선) → 429-F(Rule 영구 폴백·회귀).

## 8. 공통 인터페이스 — 아직 추출 금지

`docs/429b-prototype/execution.mjs`는 **후보 정본**이다. 빼콩·Writing Studio·Question Engine을 즉시
결합하지 않는다. 별이에서 먼저 증명한 뒤 **공통 최소 부분만** 추출한다. 지금 추상화하면 별이의 우연을
보편으로 착각한다.

질문 엔진 폴백 최소 계약 (경계만, 정답 아님): 질문 분석 실패 → 원 질문 보존한 일반 Request /
Genome 적용 실패 → 사실성·안전성 기본 답변 계약 / 생성 실패 → 재시도 후 짧고 정직한 실패 응답 /
고위험 질문 → Genome보다 안전·정확성 정책 우선. 폴백은 "삽만리다운 고정 문장"이 아니라
**정체성을 약화시키더라도 질문에 안전하고 실제로 답하는 기본 경로**다.

---

## 9. 이력 — 429 단계와 배포된 계약

> Vase 판정 2026-07-18: **B안(순간 호출) 탈락 — "별이는 걷는 AI이지 API를 호출하는 AI가 아니다."**
> 채택은 **C′ (Genome Seasons)**. 걷는 중 생성 API 호출은 구조적으로 없다 — 클라이언트의 네트워크 행위는
> 문장집 JSON 캐시 로드뿐. 문장집은 `season × weather × slot` 문맥에서 생성된다.

| 단계 | 내용 | 상태 |
|---|---|---|
| **429-A** | **Genome Interface — 완료.** `ByeoliWriter.write(context) → DiaryEntry` 경계 승격 + `_genome.ts` 계약 + `validate:writer` | 배포됨 |
| **429-B** | **아키텍처 확정 — 이 문서.** Execution Contract·Selection·Identity/Daily Genome | 정본 확정 |
| **429-C** | **엽서 수집 탈-DOM — 완료.** archive = 기억 원본 승격 + `selectDiaryEntriesForCapture` + `validate:postcard` | 배포됨 |
| 429-D | 시간대별 문장집 생성 + KV 캐시 — `book:<YYYY-MM-DD>:<slot>` 4분할 | ⑥·B/C/D 이후 |
| 429-E | 클라이언트 교체 — `ByeoliWriter.write` 내부만 문장집 우선, 실패 시 Rule | |
| 429-F | Rule Brain **영구 폴백** + 회귀 검증 | |

### 9-A. 429-A 확정 계약 (배포됨)

- **DiaryEntry**: `{observer:'byeoli', eventId, line, targetId, targetType, action, date, epoch, source:'rule'|'book', bookId, bookSlot, intent}` — `intent`는 기존 호환용으로만.
- **슬롯 단일 결정**: `resolveDiarySlot(skyPhase)` 한 곳. 기준은 별이 세계시간(sky.phase) — KST가 아니다.
  ⚠ 429-D 서버 문장집은 KST 날짜 키 — 세계시간↔KST 매핑을 429-D 문서에 고정할 것.
- **recent**: 최근 8개의 `{line, targetType, source}`만. **trace 정규화**: `{type:'warm'|'moved'|null, ageMs}` — `by` 금지.
- **동기 계약**: `write()`는 동기. **폴백**: null·예외·Promise·빈 문장·observer 불일치·source 불량·길이 초과(>120) → 즉시 Rule.
- 경계 바깥 불변: `pushMsg`·`Profile.bumpDiary`·`tally`·`archive`·`maybeDiary` 조건/확률·900ms 타이밍.
- QA 훅 `window.__writer.fail(true)`.

### 9-C. 429-C 확정 계약 (배포됨)

**archive = 별이의 기억 원본(Source of Truth)** — 엽서·Threads·Writing Studio·OPS·통계가 전부 여기서 읽는다.

- DiaryEntry 최종 스키마: `observer · kind(diary|act|rare|world|return) · eventId · action · targetType · targetName · targetLabel · duration · mood(observe|wonder|rest|photo) · createdAt · date · epoch · line · source · bookId · bookSlot · intent`
- **immutable**: `Object.freeze`, 추가만, 상한 365(별이력 1년). 문장을 나중에 바꾸지 않는다 — 기억이므로.
- `selectDiaryEntriesForCapture({entries,capturedAt,eventId,targetType,limit})` — 순수 함수. 우선순위 같은 eventId → 최근 → 같은 targetType, 창 5분, 빼콩 제외, limit 6.
- capture_meta v2 (`diaryVersion:'2'`) — `diaryLines` 유지로 하위 호환.
- DOM 제거: `pcCollectLines`·`pcOwnText` 삭제 — `validate:postcard`가 게이트로 금지.

## 10. 하드룰

1. 걷는 중 생성 API 호출 금지 (B안 탈락 사유의 구조화)
2. Rule Brain은 영구 폴백 — 어느 단계 실패든 일기는 멈추지 않는다
3. 개인 관찰자 데이터 서버 전송 금지 — Genome에 올라가는 것은 라이브 별이 상태뿐 (날씨·맵·시간·관찰량·사진량·대상 분포)
4. 문장집·Genome에 관찰자 식별 정보 없음 — 라이브 별이 단일 주어
5. 자율 시스템(Threads 크론·Authority DO) 무개입 — Genome 수집은 읽기 전용

## 11. 홈즈 안건

- Genome 소스 확정: Authority DO 읽기 전용 스냅샷 vs publish_log·capture_meta 조합
- KV 네임스페이스 배치 (기존 재사용 vs 신설)
- 문장집 생성 시점: 크론 vs lazy(첫 요청 시) — autopost lazy 패턴 참고
