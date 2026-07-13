# BUILD 407-A2 — 기존 `세상에 발행` 방송과 Single Byeoli Authority 연결

## 기존 방송 시스템 정본

`세상에 발행` 버튼은 `src/App.tsx`의 `publishLive()`다.

```text
Planet editor draft
  └─ PUT /api/planet + X-Publish-Key
       └─ Cloudflare Pages Function
            └─ PLANET KV / key: live
                 └─ public visitor GET /api/planet
```

이 경로는 **행성 스펙을 세상에 발행하는 기존 공개 통로**이며 유지한다.
R2 캡처 보관과는 별개의 기능이다.

## BUILD 407가 추가하는 것

기존 `/api/planet`을 대체하지 않는다. 같은 공개 origin 아래에 살아 있는 별이 상태를 추가한다.

```text
Vase: 세상에 발행
  └─ /api/planet              행성·소품·환경 스펙

Single Byeoli Authority
  └─ /api/byeoli/state        지금 이 순간의 단 하나인 별이
  └─ /api/byeoli/health       authority 단일성/복구 확인

Public viewers
  ├─ 3D Planet renderer
  └─ 2D Byeoli Walk renderer
       모두 같은 authorityId / instanceEpoch / sequence를 읽음
```

소비자에게 별도 `workers.dev` 주소를 공개하지 않는다. 기존 공개 사이트와 같은 origin을 쓴다.

```text
https://mimesis-sight-path.pages.dev/api/planet
https://mimesis-sight-path.pages.dev/api/byeoli/state
https://mimesis-sight-path.pages.dev/api/byeoli/health
```

## 이번 브랜치 구현

- Pages Function `/api/byeoli/state`
- Pages Function `/api/byeoli/health`
- Pages의 `BYEOLI_AUTHORITY` service binding을 통해 Authority Worker로 read-only proxy
- `AuthorityPollingClient`
  - schema 검사
  - sequence 역행/중복 무시
  - lifecycle epoch 변경 시 full snapshot 교체
  - disconnect 시 마지막 snapshot 유지 및 stale 판정
  - 로컬 Brain/Memory/Habit/world update 없음

## Cloudflare 연결 이름

Pages 프로젝트 `mimesis-sight-path`에 Service binding을 하나 추가한다.

```text
Variable name: BYEOLI_AUTHORITY
Service: mimesis-byeoli-authority
Environment: Production + Preview
```

이 연결 뒤부터 소비자는 기존 Pages 주소만 사용한다.

## 다음 코드 단계

1. 2D `RemoteStateProvider`가 `AuthorityPollingClient`를 사용하도록 연결
2. 3D `PlanetWorld`에 read-only authoritative pose/runtime adapter 추가
3. 공개 뷰에서는 local `brain.decide`, Memory/Habit write, autonomous world update 금지
4. 에디터(`?edit=1`, `?draft=1`)는 기존 sandbox 유지
5. 브라우저 3개 + 2D/3D 동시 접속에서 authorityId/sequence 동일성 검증

## 불변 원칙

- `/api/planet`: 세계를 발행하는 통로
- `/api/byeoli/state`: 그 세계 안에서 살아가는 별이 하나의 현재
- 3D와 2D는 서로 다른 별이를 만들지 않는다.
- 소비자 수만큼 별이를 복제하지 않는다.
- 세상은 둘이어도 별이는 하나다.
