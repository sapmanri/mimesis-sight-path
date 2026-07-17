# BUILD 423-EVENTS — World Director (예약 + lazy 런타임)

작성: 2026-07-17 · 판정: **Vase 2026-07-17 "예약 만들어"** (422-OPS §5-2 재판정 요청에 대한 제품 판정)
상태: v1 구현·배포. **홈즈 사후 QC 요청** — 콘솔 read-only 예외 선언과 lazy 런타임 구조에 대해.

## 0. 원칙 — 예약≠발동 (422-OPS §5-2 분리안 그대로)

- **예약(schedule)** = 운영자의 의도 기록. Ops 경계 안(`/api/ops/event-schedule`, Access 뒤), 감사 필수.
- **개시(수행)** = 예약 시각이 지난 뒤 **공개 폴링이 도달한 순간**, 런타임이 조건(시간대·날씨)·쿨다운을
  **재검증한 뒤에만** 무대를 연다. 부적합 → `skipped(reason)` 기록, 세계 불변.
- **Authority DO 무변경.** 별이는 누가 예약했는지 모른다(관찰자 무지 원칙 유지).
- 콘솔 read-only 원칙의 **명시적 예외는 예약 쓰기 1곳뿐** — `validate:ops`가 강제한다.

## 1. 구조 (Authority 밖의 World Director)

```
콘솔(Access 뒤) ── POST /api/ops/event-schedule ──▶ PLANET KV world_event_schedule
시청 화면(전원) ── GET /api/world-event/active ──▶ lazy 런타임(만기 예약 재검증→개시)
                                                    └▶ PLANET KV world_event_active
walk 앱 world-event-sync.js ── 15초 폴링 ──▶ window.__worldEventStage.start(instance)
```

- `functions/api/_world-events.ts` — 순수 로직(만기 처리·조건·쿨다운·결정론 인스턴스). 레지스트리는
  `src/worldEvents/worldEventRegistry.ts`를 **직접 import** (중복 없음).
- 결정론 instanceId(`res-<예약id>`)로 동시 폴링 경합이 같은 인스턴스로 수렴 (startedAt ±수초는 v1 허용).
- 만기 후 15분(유예) 내 아무 화면도 도달하지 않으면 `skipped(expired)` — 늦은 발사는 없다.
- 개시는 한 턴에 1건(무대는 하나). 인스턴스는 `endsAt`까지만 유효.

## 2. 저장 (PLANET KV)

- `world_event_schedule` — 예약 60건 유지(pending 우선 보존).
  `{id, eventId, fireAt(+09:00 고정), fireAtMs, requestedAt, requestedBy(Access 이메일), status, resolvedAt, skipReason, instance}`
- `world_event_active` — 마지막 개시 인스턴스 `{eventId, eventInstanceId, startedAt, endsAt, sequence}`

## 3. 소비 (걷기 앱 — live·sandbox 공통)

- `public/byeoli-walk/world-event-sync.js`: 읽기 전용 폴링(15s), 같은 instanceId 1회, 무대 진행 중이면 양보.
- `index.html`은 최소 훅만 노출: `window.__worldEventStage = {start, isActive}`.
- 이벤트는 세계의 사건이므로 sandbox 관찰자도 같은 인스턴스를 본다 (레지스트리 원문: "delivered identically to every viewer").

## 4. 게이트 (`validate:ops` 확장)

- 콘솔 쓰기 = `postEventSchedule` 1곳(POST, `API.eventSchedule`)만. 그 외 method:/XHR/beacon/form 금지.
- 감사 하드룰: 예약 API에 `cf-access-authenticated-user-email` 기록 강제.
- world-event-sync.js 읽기 전용 강제. 소비 훅·스크립트 태그 실존 확인.
- 로직 테스트 9건(`functions/api/_world-events.test.ts`): 만기/조건/쿨다운/유예/동시만기/상태 불변.

## 5. 알려진 한계 (v1)

- 개시 정밀도는 시청 화면 폴링(15s)에 의존 — 아무도 보고 있지 않으면 개시되지 않는다(유예 15분 후 expired).
  이는 결함이 아니라 선택: **관객 없는 무대는 열지 않는다.** 크론 기반 정시 개시가 필요해지면 후속.
- KV 최종 일관성으로 일부 화면이 짧은 이벤트를 놓칠 수 있다(10~14s 지속). 관찰자 수 규모에서 실용상 무시.
- 쿨다운 기준은 schedule의 fired 기록 — 수동/디버그(sandbox ?event=) 발생은 집계하지 않는다(로컬 전용이므로 무관).
