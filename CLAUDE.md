# MIMESIS Sight Path (Byeol Walk)

사용자가 Byeol을 키우는 서비스. 목표는 Public Beta 오픈.
프로젝트 지식 저장소: Obsidian Vault `~/Documents/Obsidian Vault/01 Projects/Byeol/` — 세션 시작 시 `NEXT.md`를 먼저 읽을 것.

## 역할 경계
- **Claude**: 2D 렌더러 / 샌드박스 / 라이브 어댑터 / 구현·테스트·PR
- **홈즈(ChatGPT)**: Brain / 서버 / Durable Object / API 설계 / QC
- **Gemini**: 계측

## 작업 수칙 (피로 확립된 것 — 예외 없음)
1. **검증은 exit 코드를 직접 확인.** "PASS 문구"나 출력 부재를 통과로 믿지 않는다.
   ⚠ `cmd | tail` 같은 파이프는 종료코드를 뒤 명령 것으로 바꿔치기한다 — 게이트는
   `cmd > log 2>&1; RC=$?` 로 받아 검사할 것 (2026-07-19 실사고: 실패 게이트가 커밋됨).
2. **명령 체인에 `;` 금지** — `&&`만 사용 (실패 시 후속 실행 차단).
3. **파괴적 테스트 전 반드시 커밋** (미커밋 작업 유실 사고 실발생).
4. 검증기 자체를 음성 테스트로 검증한다 (양성 통과만으론 불충분).
5. **작업 전 main 최신화** (`git pull` 후 시작).
6. 토큰·키를 채팅/커밋에 절대 남기지 않는다. push는 SSH.

## 게이트 (머지 전 필수, 전부 exit 0)
```
npm run build
```
= validate:objects (1148:1148) → world-events → strict → card → observer → brand → publish-log → zone → ops → live:structure → vite build.
배포본 검사는 `npm run validate:live:deployed` (게이트 밖).

## 구조 핵심
- **오브젝트 단일 원본**: `src/objects/objectRegistry.ts` — `twoD(id,label,category,emoji,rarity,spawnWeight,drives,jtags,variants,extra)`
- **렌더러**: `public/byeoli-walk/index.html`의 `drawProp()` — 모든 registry id는 전용 `else if(t==='id')` 분기 필수 (1:1, 고아 양방향 금지)
- **CATALOG/VARIANTS/RARE/PLAN 직접 편집 금지** — `functions/byeoli-walk/_middleware.ts`가 registry에서 생성·치환
- ⚠️ 미들웨어는 Cloudflare Pages Function — `npm run build` 산출물에 반영 안 됨. 정적 dist로 테스트하면 CATALOG가 옛 값.
- 렌더 순서: `drawBackground → props → Ppaekong → Byeol → foreground → weather → flash` (props가 캐릭터보다 먼저 → 가림 구조적 불가)
- `index.html`을 옛 standalone 사본으로 덮어쓰지 말 것.

## 하드 룰
- 행성 맵은 의도적으로 비어 있음 — 하드코딩 금지.
- 별이 상호작용은 editor-placed props(`SP.props`) 기반 drive/disposition으로만 — 스크립트 조합 금지.
- **자율 시스템 건드리지 말 것**: Threads 봇(크론 실발행 중) · Authority DO(관찰자 무지 유지가 설계 원칙).
- 범위 확장 금지 — 오픈 차단 기준은 홈즈 작업표 원문 기준.

## 현재 단계 (2026-07-17 기준)
419-A 인터페이스 동결 완료(main `e2f8d00`). 다음 **419-B 복구 구현** — 착수 전 `docs/BUILD_419A_OBSERVER_RECOVERY.md` 정독 필수.
