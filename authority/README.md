# BUILD 407-A — Single Byeoli Authority Canary

이 디렉터리는 2D/3D UI와 분리된 Cloudflare Worker + Durable Object다.

## 현재 범위

- 고정 DO 이름 `single-byeoli` 하나만 생성
- `GET /api/byeoli/state`
- `GET /api/byeoli/health`
- SQLite-backed Durable Object storage
- 1초 alarm 기반 canary tick
- 재시작 시 저장 상태 복구
- `sequence` 단조 증가
- `archiveMode: canary`
- `personalityGrowth: false`
- `publicationEligible: false`
- write API 없음

현재 runtime은 Authority 배선과 지속성 검증을 위한 최소 canary다. 아직 기존 2D brain/Habit/Memory 전체를 서버로 옮기지 않았다.

## 로컬 실행

```bash
cd authority
npm install
npm run typecheck
npm run dev
```

확인:

```bash
curl http://localhost:8787/api/byeoli/health
curl http://localhost:8787/api/byeoli/state
```

두 요청은 항상 같은 `authorityId: "single-byeoli"`를 반환해야 한다. 여러 브라우저나 요청에서 viewer별 DO가 만들어지면 실패다.

## 배포

```bash
cd authority
npm run deploy
```

Durable Object는 Vite 정적 Pages 배포와 별도 Worker로 배포한다. 이후 Pages의 `/api/byeoli/*`를 이 Worker에 route하거나, 2D `RemoteStateProvider`가 Worker URL을 사용하도록 연결한다.

### 최초 배포 트리거

`Deploy Byeoli Authority` 워크플로우는 `authority/**` 변경이 `main`에 들어오면 실행된다. 이 문서 변경은 기존 Authority 코드를 수정하지 않고 최초 Worker 배포와 Pages 서비스 바인딩 자동화를 발화하기 위한 안전한 부트스트랩 트리거다.

## Canary 검증

1. `/health`의 `sequence`가 증가하는지 확인
2. 브라우저 세 곳에서 `authorityId`, `instanceEpoch`, `sequence`가 같은지 확인
3. viewer를 모두 닫았다가 다시 접속해도 새 genesis가 생기지 않는지 확인
4. 재배포 후 `storageRecovered: true`와 sequence 연속성 확인
5. POST/PUT 요청이 허용되지 않는지 확인

## 다음 PR

- 기존 Shared Brain/Habit/Time을 Authority runtime으로 이동
- `RemoteStateProvider` polling 연결
- stale/schemaVersion/sequence 역행 처리
- WebSocket은 polling canary가 안정화된 뒤 추가
