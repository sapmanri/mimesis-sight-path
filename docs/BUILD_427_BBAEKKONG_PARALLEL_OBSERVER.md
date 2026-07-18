# BUILD 427 — Bbaekkong Parallel Observer (첫 보고)

작성: 2026-07-19 · 상태: **조사·설계 보고 — 구현 착수 전 대기** (지시서 "첫 보고 후 대기")
번호: 지시서의 426은 같은 날 사진첩(426)·도크(426-B)·자연 발생(426-C)과 충돌 → **427로 확정** (홈즈 QC 번호 분리 원칙)
범위 계약: **AI·Writing Studio·Genome·Claude·Threads·Observer 저장·Recovery·Ops 전부 금지.** UI + 데이터 구조 + Rule 기반 임시 브레인까지만.

> 이 빌드가 끝나면 Byeoli Walk는 "한 명의 AI가 걷는 앱"이 아니라
> **같은 세계를 두 존재가 서로 다른 시선으로 바라보는 공간**이 된다.

---

## 1. 현재 Diary 구조 분석 (실측)

```
brain.decide() → intent{id, drive, target…}
  → 만남 판정(SEEN/INTEREST/ENCOUNTER_D)
  → diaryFor(intent, item, def, meta)   ← 문장 조립: emoji + def.ko + jtags + D[drive] 문구
  → pushMsg('diary', line)              ← DOM #stream (.msg.diary, column-reverse, 최대 40줄)
  → archive.unshift({line,intent,date,epoch})  ← Life Archive (별이력 날짜)
  → Profile.bumpDiary()                 ← 관찰자 로컬 카운트
행동 줄: pushMsg('act', "🍄 궁금 · 나무 버섯", "2.7초") · 지나침: pushMsg('pass', …)
```

**호환성 주의 2건 (구현 시 하드룰)**
- 엽서 합성기(`pcCollectLines`)와 관측소 관측 버퍼가 `.msg`의 `act|diary|rare` 클래스를 소비한다.
  빼콩 줄에는 **`.ppae` 클래스를 추가하고, 엽서 필터는 `.ppae` 제외**로 고쳐야 한다
  — 안 그러면 별이의 엽서에 빼콩의 문장이 섞인다 (별이가 안 본 것을 봤다고 말하게 됨).
- `Profile.bumpDiary()`는 **별이 전용 유지.** 빼콩 일기는 관찰자 기억/일기 카운트에 섞지 않는다
  (413-A "로컬 누적값" 의미 보존).

## 2. 두 컬럼 UI 시안 — "한 타임라인, 두 목소리"

독립 스크롤 2개가 아니라 **기존 #stream 하나에 시간순으로 섞여 흐르되, 좌/우로 나뉘는 채팅형**:

```
🍄 오늘은 버섯이 궁금했다.                     ← 별이 (좌, 기존 아이보리)
                     🌰 도토리 하나를 주웠다.   ← 빼콩 (우, 옅은 연갈색)
🌳 관찰 · 나무  3.1초
                     🦋 나비를 조금 쫓아갔다.
```

- 별이: 기존 그대로 (좌측 정렬, 색·클래스 무변경 — 회귀 0)
- 빼콩: `.msg.ppae` — `text-align:right; align-self:flex-end;` 폭 별이와 동일(~72%), 색 `#cfc9ae`(옅은 연갈, E항 "차이는 최소")
- 같은 타임라인 공유 = 같은 DOM 흐름이므로 자동 충족. 좌우 균형은 폭 동일로
- **모바일: v1은 빼콩 줄 숨김**(`@media` 한 줄) — 기존 경험 그대로, 전환 UI는 후속 검토 (지시서 A항)

## 3. Diary 인터페이스 설계 (공통 규격, 저장 분리)

```ts
interface DiaryEntry {
  observer: 'byeoli' | 'bbaekkong';
  targetId: string | null;
  targetType: string | null;
  action: string;          // byeoli: observe/rest/record/wonder · bbaekkong: sniff/pickup/chase/watch/ignore/wary
  duration: number | null;
  emotion: string | null;  // 한 단어 (궁금/신남/무심/경계…) — 룰이 산출
  text: string;
  createdAt: number;
}
renderDiary(entry)  // observer에 따라 측·톤만 분기 — 유일한 표시 경계면
```

- **저장 분리**: 별이 `archive[]` 무변경 · 빼콩 `ppaeArchive[]` 신설 + `localStorage 'mimesis.ppae.diary.v1'`(세션 복원용, 최근 60건)
- 빼콩 일기는 **백업 blob·collectiveSnapshot에 절대 싣지 않는다** (G항: Observer 저장 금지)
- 기존 별이 경로는 이번 빌드에서 DiaryEntry로 리팩터링하지 않는다(회귀 방지) — 빼콩만 신규 규격으로 시작하고, 별이 이관은 후속

## 4. Rule 기반 Bbaekkong Brain 설계 (AI 없음)

```
트리거 (a) 자기 만남: 빼콩 x 기준 근접 소품 + 쿨다운 → RULES[type]
트리거 (b) 같은 이벤트 다른 기록: 별이가 act를 시작한 대상에 ~30% 확률로 빼콩의 한 줄
문장 간격: 최소 25~45초 (화면 소음 방지) · MAXMSG 공유
```

**룰 표 (Target Type → Rule → Diary)** — 문장 풀은 별이 풀과 **완전 분리** → "절대 같은 문장 없음"이 구조적으로 보장:

| type(레지스트리) | action | emotion | 문장 예 |
|---|---|---|---|
| flower·flowerbed·lavender류 | sniff | 궁금 | "향기를 맡아봤다. 코가 간지럽다." |
| acorn·도토리·열매류 | pickup | 신남 | "도토리 하나를 주웠다." / "도토리는 없었다." |
| butterfly·나비류 | chase | 신남 | "조금 쫓아가다 말았다." |
| bug·벌레류 | watch | 궁금 | "한참 구경했다. 만지진 않았다." |
| 먹을 것(쌀자루·장독대 등 food류) | interest | 관심 | "냄새가 났다. 못 먹는 거였다." |
| bench·의자류 | ignore | 무심 | "그냥 지나쳤다." |
| scarecrow·사람 형상류 | wary | 경계 | "조금 떨어져서 봤다." |
| (룰 없음) | watch | 무심 | category 폴백 문장 풀 |

- 매핑 원본은 `OBJECT_REGISTRY`의 id/category — 하드코딩 목록이 아니라 카테고리 폴백을 두어 소품이 늘어도 안 깨진다
- 같은 대상 반복 회피: 대상별 최근 문장 인덱스 기억(별이 bot_recent 패턴)

## 5. 향후 AI 교체 지점 (F항)

경계면은 단 하나: **`PpaeBrain.observe(context) → DiaryEntry | null`**

```
지금:  context → RuleEngine(표) ──────────────→ DiaryEntry → renderDiary + ppaeArchive
향후:  context → Observation Genome → Writing Studio → Claude → DiaryEntry (같은 반환형)
```
UI·저장·렌더는 한 줄도 바뀌지 않는 것이 설계 목표. context에는 처음부터
`{targetType, targetId, byeoliAction(있으면), sky, worldX, recentEntries}`를 담아 AI가 쓸 재료를 미리 규격화해 둔다.

---

## 6. 이동 독립성에 대한 의견 (Vase 질문)

**방향은 전적으로 찬성이에요.** 이유는 Vase가 말한 그대로 — 따라다니는 존재는 구조적으로 "두 번째 별이"가 되고, 일기도 별이의 메아리가 돼요. 자기 길을 걸어야 같은 화면에서 별이는 나무를 보고 빼콩은 그 밑 도토리를 줍고, 나중에 AI가 들어갔을 때 관찰 게놈도 다르게 자라요.

**단, 물리 제약이 하나 있어요**: 카메라가 별이에 고정돼 있어서(360px 뷰), 완전 독립 이동이면 빼콩은 대부분의 시간을 **화면 밖 존재**로 살게 돼요 — 그럼 D항의 "좌우가 동시에 살아있는 화면"이 깨져요.

**제안 — "느슨한 궤도(loose orbit)":**
1. **의사결정은 완전 독립** — 빼콩이 화면 안 소품 중 자기 룰에 맞는 목표를 스스로 고르고, 별이가 뭘 하든 신경 안 씀 (현재 follow 모드 비중 축소)
2. **물리적으로는 별이 기준 ±200px 탄력 밴드** (현행 150px 확장) — 세계는 같이 이동하되 시선은 따로
3. **가끔 화면 밖으로 사라지는 것 허용** — 낮은 확률로 밴드를 벗어나 수십 초 부재 후 복귀. 부재가 일기가 됨: *"어디 갔다 왔는지 발이 젖어 있다."* — 독립성의 서사적 증거
4. 현재 ppae 코드가 이미 roam/follow/idle/dash 변덕 구조라, **pickTarget을 '소품 지향'으로 바꾸는 것**이 핵심 변경이고 나머지는 자연 진화예요

이렇게 하면 "자기 길을 걷는 존재"(Vase 의도)와 "두 시선이 한 화면에"(지시서 D)가 양립해요. 이 항목을 427 범위에 포함할지 판정해 주세요 — 포함해도 규모는 작아요(브레인과 같은 파일).

---

## 7. 판정 (Vase 2026-07-19) — 전부 승인, 조건 8 반영해 구현

1. 설계 승인 · 2. **BUILD 427 확정** · 3. 느슨한 궤도 포함 승인
- **±200px는 강제 경계가 아니라 성향**: `dist>orbitSoft(120)`부터 거리 비례 확률(dt 스케일)로만 복귀 성향 증가. 순간이동·하드 컷 없음
- 화면 밖 이탈 허용 + **최대 부재 45초**(`awayMaxMs`) · 복귀는 별도 행동 로그(`action:'return'`, duration=부재초)
- **근거 있는 일기만**: "발이 젖어 있다"는 ①부재 중 실제 `sky.weather==='rain'` 관측(awayWet) ②부재 시간 ③복귀 이벤트 세 근거가 모두 있을 때만
- 모바일: **CSS 표시만 숨김**(`.msg.ppae{display:none}`) — 데이터 생성·저장은 계속
- **공유 eventId**: 병렬 기록은 별이 `intent.id`를 eventId로 보유(별이 archive는 이미 intent를 저장하므로 별이 쪽 무변경으로 연결 성립)
- `PPAE_CONFIG.parallelObservationRate = 0.3` — 설정값 분리
- **Bbaekkong / internal key: `ppae`** — 코드 전역 약칭. `ppaeDiary`·`PpaeBrain`·`.msg.ppae` 모두 빼콩의 것
- 별이 일기·엽서·관찰자 카운트·백업 blob 무변경 — 빼콩 줄은 `.msg.ppae` 클래스라 엽서 수집기(`act|diary|rare` 필터)에 구조적으로 안 잡힘

구현 완료 항목: 두 시선 타임라인(우측 연갈) · ppaeDiary(localStorage 별도 키) · Rule Brain(7룰+폴백, 대상별 문장 회전) · 소품 지향 roam · 성향 복귀 · 외출/복귀 로그 · 병렬 관찰 · QA 훅 `window.__ppae`
