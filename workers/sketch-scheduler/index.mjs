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

// ⚠ 구조 교체 2026-08-27: 실사고 08-26 밤 — 혼잡 구간에서 콜 하나가 150초를 다 먹는 게
//   실측됐다(백필 중 #3 콜 150s 타임아웃). 12분 한 창에 그런 콜이 몇 번 겹치면 수학적으로
//   3장을 못 끝낸다. 다섯 번의 패치(07-24·07-31·08-11·08-15·08-16)가 전부 「시간과 싸우는
//   패치」였다 — 사장 판정: 「몇 달을 며칠에 한 번씩 멈추면 그게 무슨 자동화냐」.
//   그래서 창을 쪼갰다: 밤 7창(wrangler.jsonc), 창마다 4콜·9분만 쓰고 깨끗이 물러난다.
//   완주는 어느 한 창의 책임이 아니라 밤 전체의 수렴이다. 이미 done인 날은 첫 콜이
//   done=true로 즉시 종결되므로 추가 창은 공짜에 가깝다(멱등).
const ENDPOINT = 'https://mimesis-sight-path.pages.dev/api/sketch-daily';
const MAX_CALLS = 4;           // 창 하나는 4콜까지만 — 나머지는 다음 창이 이어받는다
const PER_CALL_MS = 150_000;   // 인내 클라이언트 계약 (--max-time 150과 동일)
const TIME_BUDGET_MS = 9 * 60_000;  // 창 하나의 벽시계 — 크론 한도 안에서 여유 있게
const BACKOFF_S = [3, 8, 15, 20];   // 창 안에서는 짧게 — 긴 혼잡은 다음 창이 넘긴다

export function terminalResult(status, body) {
  // ⚠ 실사고 2026-08-11 밤: 접힌 적 없는 전날을 심야 재시도가 400 not_folded로 24번(두 크론
  //   ×12콜) 두드리며 밤을 태웠다. 「과거 하루를 새로 접지 않는다」가 엔드포인트 계약이므로
  //   not_folded는 재시도가 절대 살릴 수 없는 종결이다 — 즉시 멈춘다 (영수증 경로는 탄다).
  if (status === 400 && typeof body?.error === 'string' && body.error.startsWith('not_folded')) return 'not_folded';
  if (!(status >= 200 && status < 300) || !body || body.failed === true) return null;
  if (body.done === true) return 'done';
  // 09-01: 큐에 할 일이 없거나(no_pending) 그 하루의 시도를 다 쓴 것(attempts_exhausted)도
  //   정당한 종결이다 — 남은 콜로 같은 벽을 두드리지 않는다.
  if (body.skipped === 'human_day' || body.skipped === 'no_observations'
      || body.skipped === 'no_pending' || body.skipped === 'attempts_exhausted') return body.skipped;
  return null;
}

/** KST 날짜 문자열 (UTC+9) */
export function kstDateStr(ms) {
  return new Date(ms + 9 * 3_600_000).toISOString().slice(0, 10);
}

/**
 * 트리거 시각 → 임무. 14:xx UTC(23:30 KST)는 본진(date 생략 = 오늘 접기).
 * 그 외 여섯 창(00:00~02:30 KST)은 같은 일기 날짜를 이어 그린다 — ?date=(시각-6h) 명시.
 * (-6h의 KST 날짜 = 그 밤의 일기 날짜. 00:00 KST-6h → 18:00 KST 전날 ✓, 02:30도 ✓)
 */
export function missionFor(scheduledTime) {
  const utcHour = new Date(scheduledTime).getUTCHours();
  if (utcHour === 14) return { kind: 'main', dateParam: '' };
  // ⚙ 09-01 구조 교체: 옛 창들은 **어젯밤 하루만** 재시도했다. 이제 서버가 못 끝낸 하루를
  //   골라 준다(?pending=1, 최대 3일). 밤이 마감이 아니라 큐가 되었다 — 오늘 못 그리면 내일 잇는다.
  return { kind: 'pending', dateParam: '?pending=1' };
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
  // ⚠ 실사고 2026-08-15: 2장에서 멈췄는데 **영수증에 사유가 한 줄도 없었다.** 멈춘 이유는
  //   여기 console.log에만 남고 KV 영수증에는 안 갔다 — 아침에 아무도 왜인지 못 봤다.
  //   서버는 사유를 하드코딩(max_calls_exhausted)해서, 시간예산으로 멈춰도 콜 소진이라 적었다.
  //   그래서 소진 영수증에 **실제 사유와 콜 기록**을 실어 보낸다 (사장 지시 08-16).
  let stopReason = 'max_calls_exhausted';
  let fetchErrors = 0;
  for (let call = 1; call <= MAX_CALLS; call++) {
    if (Date.now() - t0 > TIME_BUDGET_MS) {
      log.push('time_budget_exhausted');
      stopReason = 'time_budget_exhausted';
      break;
    }
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
      fetchErrors += 1;
      log.push(`#${call} fetch_error: ${String(e && e.message || e).slice(0, 120)}`);
      stopReason = 'fetch_errors';                // 더 진행하면 뒤에서 덮어쓴다
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
    // not_folded: 재시도 무익 — 루프만 끊고 terminal=false로 둔다. 아래 영수증 경로가 돌아
    // 전날 reco가 아예 없으면(본진 무실행) 실패 영수증이 경보가 되고, 정직한 건너뜀이
    // 이미 있으면 서버 가드가 지켜준다(sketch-daily 영수증 핸들러 참조).
    if (terminalResultKind === 'not_folded') {
      log.push('not_folded_terminal');
      stopReason = 'not_folded';
      break;
    }
    stopReason = 'max_calls_exhausted';           // 여기까지 왔으면 콜을 정상으로 다 쓰는 중
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
          'content-type': 'application/json',
        },
        // 사유를 몸통에 실어 보낸다 — 헤더는 한글·긴 로그를 못 담는다.
        // 서버가 이 값을 영수증에 적는다(없으면 옛 하드코딩 문구로 떨어진다).
        body: JSON.stringify({
          reason: stopReason,
          fetchErrors,
          elapsedMs: Date.now() - t0,
          detail: log.join(' | ').slice(0, 900),
        }),
        signal: AbortSignal.timeout(PER_CALL_MS),
      });
      const body = await res.json().catch(() => null);
      log.push(`receipt ${res.status} saved=${body?.receipt === 'failed'} reason=${stopReason}`);
    } catch (e) {
      log.push(`receipt_error: ${String(e && e.message || e).slice(0, 120)}`);
    }
  }
  console.log(`sketch-scheduler: ${log.join(' | ')}`);   // wrangler tail / Workers Logs로 관측
}

const backoffMs = (call) => BACKOFF_S[Math.min(call - 1, BACKOFF_S.length - 1)] * 1_000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
