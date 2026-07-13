# BUILD 407-A2 — 기존 `세상에 발행` 방송과 Single Byeoli Authority 연결

## 기존 방송 시스템

`src/App.tsx`의 `publishLive()`가 `PUT /api/planet`으로 현재 행성 스펙을 발행한다.
Cloudflare Pages Function은 `PLANET` KV의 `live` 키에 저장하고, 공개 방문자는 같은 origin의 `GET /api/planet`을 읽는다.

```text
행성 에디터
  → 세상에 발행
  → PUT /api/planet
  → PLANET KV / live
  → 공개 3D 방문자 GET /api/planet
```

이 통로는 그대로 유지한다.

## Single Byeoli 추가 구조

기존 공개 origin 아래에 살아 있는 별이 상태를 추가한다.

```text
/api/planet          발행된 세계 스펙
/api/byeoli/state    지금 이 순간의 단 하나인 별이
/api/byeoli/health   Authority 단일성·복구 상태
```

3D, 2D, 모든 방문자는 같은 `authorityId`, `instanceEpoch`, `sequence`를 읽는다.
소비자는 별도의 workers.dev 주소를 알 필요가 없다.

## 이번 브랜치

- Pages Function `/api/byeoli/state`
- Pages Function `/api/byeoli/health`
- Pages `BYEOLI_AUTHORITY` service binding을 통한 read-only proxy
- `AuthorityPollingClient`
  - schema 검사
  - sequence 역행·중복 snapshot 무시
  - lifecycle epoch 변경 시 full snapshot 교체
  - 연결 실패 시 마지막 snapshot 유지 및 stale 판정
  - 로컬 Brain/Memory/Habit/world update 실행 없음

## Cloudflare 바인딩

Pages 프로젝트 `mimesis-sight-path`에 Service binding 추가:

```text
Variable name: BYEOLI_AUTHORITY
Service: mimesis-byeoli-authority
Environment: Production + Preview
```

## 다음 단계

1. 2D `RemoteStateProvider`를 `AuthorityPollingClient`에 연결
2. 3D `PlanetWorld`에 read-only authoritative runtime adapter 연결
3. 공개 방문자에서는 local `brain.decide`, Memory/Habit write, autonomous update 금지
4. `?edit=1`, `?draft=1`은 기존 sandbox 유지
5. 2D/3D/브라우저 3개에서 authorityId와 sequence 동일성 검증

> 세상은 둘이어도 별이는 하나다.
