# BUILD 429-B — MIMESIS Genome Architecture

> **Genome은 문체를 저장하지 않는다. 세상을 바라보는 방식을 저장한다.**
> **문체는 Generation 단계에서 자연스럽게 발생하는 결과일 뿐이다.**
>
> 429-B는 "별이 문장 엔진"으로 시작해 **MIMESIS 전체 엔진의 첫 구현**이 되었다.
> 프로토타입 코드·실행 결과: `docs/429b-prototype/` (레포 밖 scratchpad 소실 방지용 보존)

## 0. 최종 구조 (Vase 판정 2026-07-18~19)

```
World / Input
  ↓
Request                     런타임이 이미 아는 것 (별이가 무엇을 만났는가)
  ↓
Execution Contract          실행 가능한 요청 공간
  ↓
Selection                   무엇을 볼 것인가        ← 429 최대 발견
  ↓
Observation                 그걸 어떻게 볼 것인가
  ├─ Identity Genome        변하지 않는 축 (9)
  └─ Daily Genome           오늘만 변하는 축 (2)
  ↓
Generation                  문장만 만든다
  ↓
Validation
  ↓
Resolution / Fallback
```

**순서가 핵심.** 초기 설계는 `Genome → 생성 → 조회`였고, 그 결과 A 실행에서 **30건 중 18건(60%)이 조회 실패**했다. 생성기와 조회기가 서로 다른 조합 공간을 상상했기 때문이다. Request가 먼저 존재한다.

## 1. Execution Contract — **PASS (확정, 재논의 금지)**

정의하는 것 셋:

| | 내용 |
|---|---|
| **Request Schema** | 어떤 요청이 들어올 수 있는가 |
| **Resolution Ladder** | 그 요청이 어떤 경로로 해소되는가 |
| **Guarantee** | `pre` = Coverage 보증 / `ondemand` = Resolution·Fallback 보증 |

**두 실행 모드 (필수 구분)**
- `pre` — 유한·열거 가능한 요청 공간 → 미리 생성, 런타임은 조회만. **Coverage 100% 필수.** (별이 문장집)
- `ondemand` — 무한·발견형 요청 공간 → 요청마다 생성. **Coverage 대신 Resolution 보증.** (Writing Studio, Question Engine)

이 구분이 없으면 질문 엔진에 별이 문장집의 100% 커버리지 규칙을 억지로 옮기게 된다.

**Resolution Ladder** (별이): `exact → target → category → generic-situation → Rule`
특수 플래그(`rare/passed/first/trace`)는 **일반 대상 조회와 섞지 않는다** — 자기 계열 안에서만 내려간다.

**메타 소유권**: Execution Contract가 모든 메타를 소유한다. Generation은 `{key, line, formGroup}`만 반환하고 나머지는 `joinMeta`가 조인한다. (생성기에게 확정된 메타를 다시 쓰게 하면 출력이 부풀고 드리프트가 생긴다 — 1차 실행에서 `key=dandelion`인데 `targetType=nature`가 나왔다.)

**지표는 분리한다** — 뭉뚱그린 exact-hit(36.4%)은 폐기:
- `targetExactRate` (TopTarget Normal Exact)
- `specialResolutionRate`
- `genericResolutionRate`

숫자를 맞추려 정의를 바꾸면 같은 함정이 반복된다.

## 2. Selection — 무엇을 볼 것인가 (429 최대 발견)

같은 숲에서 **삽만리는 빛·움직임·거리**를, **헤밍웨이는 사람·행동·결과**를, **건축가는 구조·선·비례**를 고른다.

Genome은 Observation만 만드는 게 아니라 **Selection도 만든다.** Selection(무엇을)과 Observation(어떻게)은 다른 층이다.

Daily는 **순서만 바꿀 수 있고, Identity에 없는 것을 새로 보게 만들지 못한다** (`selectFrom`이 강제).

## 3. Observation — Identity + Daily

**Identity Genome (9축, 고정)** — 작가·캐릭터·관찰자를 그답게 만드는 축. 365일 안 변한다.

```json
{ "voice":"banmal", "selfPresence":"rare", "observer":"first_person",
  "closure":"open", "emotion":"indirect", "distance":"medium",
  "observationDensity":"medium", "association":"low", "judgement":"low" }
```

**Daily Genome (2축)** — 오늘만: `tempo`, `focusOrder`.

**Validation이 강제**: Daily가 Identity 축을 건드리면 조용한 덮어쓰기가 아니라 **실패**.

축 이름은 '어떻게 쓰는가'가 아니라 **'어떻게 보는가'**로 읽는다:
- `focusOrder=[light,…]` → "빛을 먼저 써라"가 아니라 **"빛을 먼저 본다"**
- `judgement` → 확신도가 아니라 **판단을 얼마나 미루는가**
- `observationDensity` → 글의 양이 아니라 **얼마나 많이 관찰하는가**
- `selfPresence` → 관찰 속에 관찰자가 얼마나 드러나는가
- `closure` → 관찰을 결론으로 닫는가, 남겨두는가
- `association` → 대상을 다른 기억·사물과 연결해 보는 정도

⚠ `observer`(`first_person`)는 시점 문법으로 읽힐 여지 — 후보: `vantage`/`viewpoint`.

**작가 팩이 성립한다**: `Identity=헤밍웨이 + Daily=오늘 비` = 오늘의 헤밍웨이. `Identity=삽만리 + Daily=첫눈` = 겨울의 삽만리.

## 4. Generation — MediumGrammar (모든 작가 공통)

문형 다양성은 **작가의 게놈이 아니라 생성기의 기본 능력**이다. 단조로움을 계약 값으로 고치기 시작하면 계약에 다시 문학이 들어온다.

`formGroup` 8종(**내부 메타 — 앱·엽서·Threads에 절대 노출 금지**):
`state · change · sense · detail · discovery · action · question · trace`

**Observation Grammar** — `~있다 20% 이하` 같은 동사 금지는 실패한다. 막으면 "남아 있다/놓여 있다/보인다"로 도망갈 뿐. 동사가 아니라 **관찰 방식**의 분포를 본다: 존재형·변화형·감각형·질문형·발견형·행동형, 한 종류 35% 이하·최소 4종.

**reusable 계약**: `reusable:true` 문장은 고유명사뿐 아니라 **고유 관찰어**(벤치 다리·홀씨·꽃잎·수염·발자국·줄기)도 금지. 그게 들어가면 애초에 카테고리 전체에 못 쓴다.

**대상 정합**("이 문장이 현재 관찰을 말하는가")은 기계가 아니라 **critic**이 본다. "홀씨"라는 단어가 있느냐가 아니다.

## 5. 검증 3층

`JSON 스키마 → 기계 규칙 → critic(별도 호출, 수정 금지·통과/탈락과 이유만)`

critic이 고쳐 쓰게 하면 원문보다 나쁜 문장이 슬쩍 들어온다.

## 6. 실행 결과

**A (v2-open) — 실패 원본, 보존**
계약 린트 0·critic fail 0인데 **30건 중 18건 조회 실패(60%)**. 품질 게이트 전부 통과인데 사용자는 아무것도 못 본다. → *문장 생성 품질과 문장 조회 가능성은 별개의 계약이다.*

**v3.1 — Execution Contract 검증 PASS**

| 조건 | 결과 |
|---|---|
| JSON 잘림 | 0 |
| 메타 드리프트(orphan) | 0 |
| 존댓말 | 0 (Identity 강제 작동) |
| requiredKeys | **4슬롯 100%** |
| 런타임 1056건 Rule 폴백 | **0** |
| 특수 플래그 폴백 | **0** |
| TopTarget Normal Exact | **384/384 = 100%** |
| 평가 30건 조회 | **30/30** |
| Observation Grammar | **위반 0** |

## 7. 남은 것

- **슬롯간 중복 16건** — 문장이 아니라 **사용한 Observation을 넘겨** 해결 (토큰 절약 + 의미 중복 포착)
- B/C/D 비교 실험 (동일 requiredKeys·DailyContext) — v3.1 통과 후 진행 승인 상태
- 4축 판정표: 실제로 본 것을 말했나 / 문장이 서로 달랐나 / 지나치게 꾸미지 않았나 / 별이의 거리감이 있었나

## 8. 공통 인터페이스 — 아직 추출 금지

`execution.mjs`는 **후보 정본**. 빼콩·Writing Studio·Question Engine을 즉시 결합하지 않는다. 별이에서 먼저 증명한 뒤 **공통 최소 부분만** 추출한다. 지금 추상화하면 별이의 우연을 보편으로 착각한다.

**질문 엔진 폴백 최소 계약** (경계만, 정답 아님):
- 질문 분석 실패 → 원 질문을 보존한 일반 Request
- Genome 적용 실패 → 사실성·안전성을 지키는 기본 답변 계약
- 생성 실패 → 재시도 후 짧고 정직한 실패 응답
- 고위험 질문 → Genome보다 안전·정확성 정책 우선

원칙: 폴백은 "삽만리다운 고정 문장"이 아니라, **정체성을 약화시키더라도 질문에 안전하고 실제로 답하는 기본 경로**다.
