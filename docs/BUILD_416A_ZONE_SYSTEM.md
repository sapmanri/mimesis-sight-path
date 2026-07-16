# BUILD 416-A — 거리 존 배경 시스템

작성: BUILD 416-A 세션 (홈즈 문제 제기 → Vase 승인)
관련 코드: `public/byeoli-walk/index.html` (BG_* / drawBackground / snapshotByeoliState)

---

## 문제 (홈즈 진단, 코드로 확인됨)

414-A 조합 엔진의 캐시 키는 `seed | 계절 | 시간 | 날씨`다. 조합이 바뀌는 순간은
시간대·날씨 전환뿐이고, **걸어온 거리는 조합에 관여하지 않는다.**
1,117,440 조합은 "가능한 우주의 수"일 뿐, 한 산책이 보는 것은 그중 한 조합의
무한 반복이다. 서로소 루프는 반복의 정렬만 어긋나게 할 뿐 내용물은 같다.

## 설계

### 1. 존 축 추가 (엔진 교체 아님)

누적 거리에서 존을 파생해 조합 축에 추가한다. 조합 키:

```
seed | 계절 | 시간 | 날씨 | 레이어별 (zone, cycle)
```

| 존 | 구간 | 성격 |
|---|---|---|
| village (마을) | 0–500m | 집·담장·꽃밭 |
| paddy (논길) | 500–1500m | 논·개방감(빈 능선)·풀섶 |
| forest (숲) | 1500–2500m | 깊은 숲·낙엽·겹능선 |
| hills (언덕) | 2500–3500m | 바위 봉우리·억새·성긴 나무 |

- **환산: 1m = 16px** (`BG_M2PX`). 걸음 62px/s 기준 마을 ~2.1분,
  이후 존 각 ~4.3분, 한 여정(3500m) ~15분. 30분 산책 = 두 여정.
- **누적 거리** `D = (loopCount × worldLen + worldX) / BG_M2PX`.
  랩 리셋과 무관하게 단조 증가.
- **순환 + 사이클 재조합**: 3500m마다 마을로 돌아오되 `cycle` 번호가 조합
  해시에 들어가므로 **두 번째 마을은 첫 마을과 다른 조합**이 뽑힌다.
  결정론 유지 — 같은 seed면 같은 여정.

### 2. 존은 "eligible 풀 안에서만" 좁힌다

`BG_ZONE_PREF[zone][layer]` = 선호 후보 id 목록.
선택 순서: eligibility(계절·시간·날씨) 통과 풀 → 존 선호로 교집합 →
**교집합이 비면 존만 포기하고 eligible 풀 사용.**

즉 존 필터는 구조적으로 eligibility를 위반할 수 없다. 완화 순서:
`존 → 날씨 → 계절` (시간은 절대 완화하지 않음 — 414-A 규칙 유지).

sky 레이어는 존 무관 — 하늘은 시간과 날씨의 것.

### 3. 계단식 전환 (staggered)

존 경계에서 8레이어가 동시에 바뀌면 화면이 한 번에 갈린다. 대신
**먼 레이어부터 차례로** 넘어간다:

```
farMountains +0m → nearMountains +15m → distantForest +30m → midTrees +45m
→ field +60m → roadside +75m → foreground +90m
```

레이어별 유효 거리 = `D − stagger(layer)`. 경계를 지나면 먼 산이 먼저
바뀌고 발밑 풀이 마지막(90m 뒤, ~23초 후)에 바뀐다 — 걸어서 동네를
벗어나는 실제 감각. 알파 블렌딩 없음, 정수 fillRect 규약 그대로,
전환 비용 0 (캐시 키 변경 시 재선정뿐).

### 4. state 계약 변경 — loopCount

`snapshotByeoliState().camera`에 `loopCount` 추가.
렌더러는 `(camera.loopCount|0)`로 읽는다 — **필드가 없는 (구)원격
스냅샷은 0으로 폴백**해 랩 내 거리만으로 동작한다 (하위호환).

⚠ **BUILD 407 (Authority 서버) 계약에 반영 필요**: 서버 스냅샷의
camera 슬라이스에 `loopCount`가 포함되어야 원격 렌더에서도 존이 진행된다.
→ 홈즈 복귀 후 전달 항목.

### 5. 검증

`npm run validate:zone` (`scripts/validate-zone-system.mjs`), build 게이트 편입:

1. BG_ZONE_PREF의 모든 id가 BG_PACK에 실존 (고아 참조 0)
2. 4계절 × 4시간 × 5날씨 × 4존 × 7레이어 전수: 선택 결과가 eligibility
   위반 0 · 빈 풀 0
3. 존 구간이 빈틈·겹침 없이 연속이고 사이클 길이와 일치
4. stagger 오프셋이 far→near 순 강증가
5. 사이클 재조합 실효성: 동일 (seed, ctx, zone)에서 cycle 0과 1의
   조합이 최소 1개 레이어 이상 다를 것

## 비변경 사항 (하드 룰 준수)

- 414-A 엔진·후보 팩·루프 서로소 설계 유지 (축 추가만)
- 배경은 취향 집계 대상 아님 — 유지
- 기존 날씨/시간 로직 읽기 전용 — 유지
- props/Object Registry 완전 별개 — 유지
