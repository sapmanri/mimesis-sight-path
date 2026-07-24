// byeoli-sketch-scheduler — BUILD 431 서버측 크론 (홈즈 설계 2026-07-25, Vase 승인 "신설 승인")
//
// 왜 존재하나: cron-job.org는 클라이언트 30초 캡이라 flux-2-dev(장당 30~60초)를 절대
// 완주 못 시켰다 — 매일 밤 하루만 접고 살해당해 교착 잔해를 남겼다(07-24 실사고).
// 이 Worker는 서버 스케줄러다: 클라이언트 타임아웃이 없고, 응답을 끝까지 기다린다.
//
// 계약 (홈즈 설계 그대로):
//   - Pages는 그대로 — 이 Worker는 기존 POST /api/sketch-daily를 호출만 한다.
//   - 1콜 = 1장 유지. done:true까지 순차 호출 (상한 MAX_CALLS).
//   - 멱등: 엔드포인트 자체가 날짜·장번호로 누적하므로 재시도 중복 없음.
//   - 23:30 KST(14:30 UTC) 트리거. 사람·앱 개입 없이 접기~3장 완주.
//
// 검증 경로: 결과는 KV reco에 남는다(GET /api/pulse?reco=날짜) — 침묵이 버그다.

const ENDPOINT = 'https://mimesis-sight-path.pages.dev/api/sketch-daily';
const MAX_CALLS = 8;           // 3장 + 실패 여유 (밤 완주기와 같은 상한)
const PER_CALL_MS = 150_000;   // 인내 클라이언트 계약 (--max-time 150과 동일)
const BETWEEN_MS = 3_000;

export default {
  async scheduled(event, env, ctx) {
    ctx.waitUntil(run(env));
  },
};

async function run(env) {
  const log = [];
  for (let call = 1; call <= MAX_CALLS; call++) {
    let body = null, status = 0;
    try {
      const res = await fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'X-Publish-Key': env.PUBLISH_KEY },
        signal: AbortSignal.timeout(PER_CALL_MS),
      });
      status = res.status;
      body = await res.json().catch(() => null);
    } catch (e) {
      log.push(`#${call} fetch_error: ${String(e && e.message || e).slice(0, 120)}`);
      await sleep(BETWEEN_MS);
      continue;                                   // 일시 오류는 다음 콜이 이어받는다 (멱등)
    }
    log.push(`#${call} ${status} done=${body?.done} total=${body?.totalImages} skipped=${body?.skipped ?? '-'}`);
    if (body?.done === true) break;               // 3장 완주
    if (body?.skipped) break;                     // no_observations 등 — 정당한 종료 (빈 기억을 지어내지 않는다)
    await sleep(BETWEEN_MS);
  }
  console.log(`sketch-scheduler: ${log.join(' | ')}`);   // wrangler tail로 관측 가능
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
