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
//
// ⚠ 실사고 2026-07-31 밤: Workers AI가 「AiError 3043」을 간헐로 연발하는 나쁜 구간에서
//   8콜이 160초 만에 전멸했다 (콜 사이 3초 고정 — 혼잡을 넘길 시간이 없었다).
//   넷을 고쳤다: ① 콜 사이 점증 백오프 ② 상한 12콜 + 벽시계 예산 ③ 심야 재시도 크론
//   (00:40·01:40 KST — 전날 완주를 다시 시도, 자가 회복) ④ 재시도는 ?date=전날 명시.
//   ⚠ 심야 크론이 date 없이 부르면 「새 하루를 접어버린다」 — date 명시가 안전핀이다.
//
// 검증 경로: 결과는 KV reco에 남는다(GET /api/pulse?reco=날짜) — 침묵이 버그다.

const ENDPOINT = 'https://mimesis-sight-path.pages.dev/api/sketch-daily';
const MAX_CALLS = 12;          // 3장 + 나쁜 구간 여유
const PER_CALL_MS = 150_000;   // 인내 클라이언트 계약 (--max-time 150과 동일)
const TIME_BUDGET_MS = 12 * 60_000; // scheduled 핸들러 벽시계 한도 안에서 멈춘다
const BACKOFF_S = [3, 8, 15, 30, 45, 60, 90, 120]; // 콜 사이 대기 — 혼잡 구간을 넘긴다

export function terminalResult(status, body) {
  if (!(status >= 200 && status < 300) || !body || body.failed === true) return null;
  if (body.done === true) return 'done';
  if (body.skipped === 'human_day' || body.skipped === 'no_observations') return body.skipped;
  return null;
}

/** KST 날짜 문자열 (UTC+9) */
export function kstDateStr(ms) {
  return new Date(ms + 9 * 3_600_000).toISOString().slice(0, 10);
}

/**
 * 트리거 시각 → 임무. 14:xx UTC(23:30 KST)는 오늘 본진(date 생략 = 오늘 접기).
 * 그 외(심야 재시도 크론)는 **전날** 완주 재시도 — ?date=전날을 명시한다.
 * (시각-6h의 KST 날짜 = 심야 기준 「전날」. 00:40 KST-6h → 18:40 KST 전날 ✓)
 */
export function missionFor(scheduledTime) {
  const utcHour = new Date(scheduledTime).getUTCHours();
  if (utcHour === 14) return { kind: 'main', dateParam: '' };
  return { kind: 'retry', dateParam: `?date=${kstDateStr(scheduledTime - 6 * 3_600_000)}` };
}

export default {
  async scheduled(event, env, ctx) {
    ctx.waitUntil(run(env, event.scheduledTime));
  },
};

async function run(env, scheduledTime) {
  const mission = missionFor(scheduledTime ?? Date.now());
  const url = ENDPOINT + mission.dateParam;
  const log = [`mission=${mission.kind}${mission.dateParam}`];
  const t0 = Date.now();
  let terminal = false;
  for (let call = 1; call <= MAX_CALLS; call++) {
    if (Date.now() - t0 > TIME_BUDGET_MS) { log.push('time_budget_exhausted'); break; }
    let body = null, status = 0;
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'X-Publish-Key': env.PUBLISH_KEY },
        signal: AbortSignal.timeout(PER_CALL_MS),
      });
      status = res.status;
      body = await res.json().catch(() => null);
    } catch (e) {
      log.push(`#${call} fetch_error: ${String(e && e.message || e).slice(0, 120)}`);
      await sleep(backoffMs(call));
      continue;                                   // 일시 오류는 다음 콜이 이어받는다 (멱등)
    }
    log.push(`#${call} ${status} done=${body?.done} total=${body?.totalImages} skipped=${body?.skipped ?? '-'} failed=${body?.failed ?? false}`);
    const terminalResultKind = terminalResult(status, body);
    if (terminalResultKind === 'done') {
      terminal = true;
      break;                                      // 3장 완주
    }
    // 증명된 사람 접기와 관찰 없음만 정당한 종료다. ownership_unknown은 사고/수동 확인 대상.
    if (terminalResultKind === 'human_day' || terminalResultKind === 'no_observations') {
      terminal = true;
      break;
    }
    // 5xx·비JSON·failed·ownership_unknown·partial은 상한까지 재시도한다.
    await sleep(backoffMs(call));
  }
  // 본진이 실패해도 심야 재시도 두 번이 남아 있다. 셋 다 소진하면 영수증이 최종 상태다.
  if (!terminal) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'X-Publish-Key': env.PUBLISH_KEY,
          'X-Scheduler-Receipt': 'failed',
        },
        signal: AbortSignal.timeout(PER_CALL_MS),
      });
      const body = await res.json().catch(() => null);
      log.push(`receipt ${res.status} saved=${body?.receipt === 'failed'}`);
    } catch (e) {
      log.push(`receipt_error: ${String(e && e.message || e).slice(0, 120)}`);
    }
  }
  console.log(`sketch-scheduler: ${log.join(' | ')}`);   // wrangler tail / Workers Logs로 관측
}

const backoffMs = (call) => BACKOFF_S[Math.min(call - 1, BACKOFF_S.length - 1)] * 1_000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
