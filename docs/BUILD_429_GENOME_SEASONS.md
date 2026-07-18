# BUILD 429 — Genome Seasons (오늘의 문체)

> Vase 판정 2026-07-18: **B안(순간 호출) 탈락 — "별이는 걷는 AI이지 API를 호출하는 AI가 아니다."**
> 채택은 **C′ (Genome Seasons)**. 429의 목표는 "Claude를 붙인다"가 아니라
> **"오늘 별이는 어떤 말투로 세상을 바라보는가"를 만드는 것.** 문장은 그다음에 따라온다.

## 1. 핵심 구조 — 문장 생성이 아니라 문체 생성

```
Observation Genome (라이브 별이의 오늘)
        ↓
Writing Studio (프롬프트 계약)
        ↓
오늘의 문체 (리듬·톤 — 하루 동안 일정)
        ↓
문장집 생성 (그 문체로 대상·상황별 수백 문장, 하루 1~2회)
        ↓
KV 저장 (시간대별 분할: morning / afternoon / sunset / night)
        ↓
클라이언트 사용 (걷는 중엔 선택만 — API 호출 없음)
```

- 별이가 걷다가 Claude를 부르는 일은 **구조적으로 없다.** 클라이언트가 하는 네트워크 행위는
  문장집 JSON 캐시 로드뿐.
- 계절 축: 여름 Genome → 여름 문체, 겨울 → 겨울 문체, 비 오는 날 → 비의 문체.
  문장집은 `season × weather × slot` 문맥에서 생성된다.
- 하루 안에서 말투가 일정한 것이 요체 — 문체를 먼저 뽑고, 그 문체로 전 대상을 쓴다.

## 2. §0-2 판정 (Vase, 2026-07-18)

충돌 없음. Genome에 올라가는 것은 **라이브 별이 상태뿐**:
날씨 · 맵 · 시간 · 관찰량 · 사진량 · 오늘 대상 분포.
**개인 관찰자 로그는 절대 서버로 올라가지 않는다** — 419-A §0-2는 그대로 산다.

## 3. 단계 (판정 순서 그대로)

| 단계 | 내용 | 상태 |
|---|---|---|
| **429-A** | **Genome Interface — 완료.** `ByeoliWriter.write(context) → DiaryEntry` 경계 승격 + `_genome.ts` 계약 + `validate:writer` 회귀 게이트 | 배포됨 |
| 429-B | Writing Studio Prompt — 문체 추출 → 문장집 생성 2단 프롬프트 계약 (425-D 문체 계약 상속) | |
| **429-C** | **엽서 수집 탈-DOM** — `pcCollectLines`를 archive/DiaryEntry 기반으로 전환 (Vase 판정: 문장집 적용 **전에** 한다) | |
| 429-D | 시간대별 문장집 생성 + KV 캐시 — `book:<YYYY-MM-DD>:<slot>` 4분할 | |
| 429-E | 클라이언트 교체 — `ByeoliWriter.write` 내부만 문장집 우선, 실패 시 Rule | |
| 429-F | Rule Brain **영구 폴백** + 회귀 검증 | |

## 3-A. 429-A 확정 계약 (Vase 보정 반영, 배포됨)

- **DiaryEntry**: `{observer:'byeoli', eventId, line, targetId, targetType, action, date, epoch, source:'rule'|'book', bookId, bookSlot, intent}` — `intent`는 **기존 호환용으로만** 보존하고 새 기능은 `eventId`·명시 필드를 읽는다.
- **슬롯 단일 결정**: `resolveDiarySlot(skyPhase)` 한 곳. 기준은 **별이 세계시간(sky.phase)** — 화면의 하늘과 문장이 모순되면 안 되므로 KST가 아니다. 날짜 경계는 archive와 같은 `byeoliDayEpoch`. ⚠ 429-D의 서버 문장집은 KST 날짜 키이므로 **세계시간↔KST 매핑을 그때 문서에 고정**할 것.
- **recent**: 최근 8개의 `{line, targetType, source}`만. 개인 상태가 문장 계층으로 새지 않는다.
- **trace 정규화**: `{type:'warm'|'moved'|null, ageMs}` — 생성 주체(`by`)는 넘기지 않는다(430 계약과 동일).
- **동기 계약**: `write()`는 동기. 429-D 이후에도 클라는 KV에서 내려온 캐시를 읽으므로 동기 유지.
- **폴백**: `null`·예외·Promise·빈 문장·공백·`observer` 불일치·`source` 불량·길이 초과(>120) → 전부 즉시 Rule.
- **경계 바깥 불변**: `pushMsg`·`Profile.bumpDiary`·`tally`·`archive`·`maybeDiary` 조건/확률·900ms 타이밍 전부 그대로.
- QA 훅 `window.__writer.fail(true)` — 실기기에서 폴백 경로를 직접 검증.

## 4. 계약 (429-A에서 고정)

- 소스: `functions/api/_genome.ts` (타입 + `validateSentenceBook` — 게이트 편입, 음성 테스트 포함)
- `DailyGenome`: date(KST) · season · weatherMix · map · observeCount · photoCount · targetDist · events
- `SentenceBook`: contractVersion · date · slot(morning/afternoon/sunset/night) · style(오늘의 문체 기록 — 감사용) · sentences(대상/상황 키 → 문장 배열)
- 클라 경계면: `ByeolVoice.compose(intent,item,def,meta)` 하나 — 427 빼콩 F항과 동일 규율
  (안쪽을 교체해도 UI·archive·pushMsg 불변). 현재 구현 = Rule(기존 조립 로직 이동, 동작 불변).

## 5. 하드룰

1. 걷는 중 생성 API 호출 금지 (B안 탈락 사유의 구조화)
2. Rule Brain은 영구 폴백 — 어느 단계 실패든 일기는 멈추지 않는다 (425-D와 같은 계약)
3. 개인 관찰자 데이터 서버 전송 금지 (§2)
4. 문장집·Genome에 관찰자 식별 정보 없음 — 라이브 별이 단일 주어
5. 자율 시스템(Threads 크론·Authority DO) 무개입 — Genome 수집은 읽기 전용

## 6. 홈즈 안건

- Genome 소스 확정: Authority DO 읽기 전용 스냅샷 vs publish_log·capture_meta 조합
- KV 네임스페이스 배치 (기존 재사용 vs 신설)
- 문장집 생성 시점: 크론 vs lazy(첫 요청 시) — autopost lazy 패턴 참고
