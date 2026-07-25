// byeoli-publish-scheduler — 자동발행 서버측 스케줄러 (홈즈 처방 ②+④, 판정 2026-07-26)
//
// 왜 존재하나: 07-25에 자동발행이 21시간 죽었다. 원인은 01:34 PUBLISH_KEY 회전 후
// **cron-job.org(배포 경계 밖)의 키가 안 맞은 것**이었다. 키가 내 배포 밖에 있으면
// 회전할 때마다 같은 사고가 난다. 이 Worker는 그 소비자를 배포 안으로 들여온다.
//
// 홈즈 판정(B안): "키 자체 제거는 목표가 아니라 수단이었소. 실제 장애 원인은 배포 경계 밖
// 소비자였고, B는 키를 Worker·Pages의 관리되는 시크릿으로 묶어 그 원인을 제거하면서
// 429/431-M 발행 두뇌를 보존하오."
//   → Service Binding으로 키를 없애는 건 불가능하다. Cloudflare의 Service Binding은
//     `Pages Function → Worker` 한 방향뿐이고 `Worker → Pages`는 없다. 발행 두뇌가
//     Pages에 있는 한 HTTP+키다. 대신 그 키가 **배포로 관리되는 시크릿**이 된다.
//
// 계약
//   - Pages는 그대로. 이 Worker는 기존 POST /api/autopost를 호출만 한다.
//   - **의도한 슬롯을 명시한다** (`?scheduledFor=`). Pages가 검증한다 —
//     허용된 08/18/22 KST 슬롯인가 · 미래가 아닌가 · 보충 허용 기간 안인가.
//     현재 시각으로만 부르면 늦은 보충이 과거 슬롯을 채울 수 없다(홈즈).
//   - 중복은 Pages의 슬롯 영수증이 막는다. 이미 발행된 슬롯은 `slot_duplicate`로 되돌아온다.
//     ⚠ 그 영수증은 **원자적 잠금이 아니다.** 동시 호출은 못 막는다. 그래서 크론을 정각이
//       아니라 **+5분**에 둔다 — 외부 크론이 먼저 발행하고 그 영수증을 이 Worker가 보게.
//       외부 크론 해촉(①) 후에도 +5분을 유지한다(정각 경합 상대가 없어도 무해).
//   - publishDueSlot / reconcileMissedSlots를 나눈다. 단 **같은 Worker·같은 배포**다 —
//     쪼개면 독립 감시자 둘과 계약 불일치가 다시 생긴다(홈즈).
//
// 배포:  이 폴더에서 `npx wrangler deploy`
// 시크릿: `npx wrangler secret put PUBLISH_KEY` (Pages 프로젝트와 동일 값)
// 관측:  `npx wrangler tail byeoli-publish-scheduler`

const ENDPOINT = 'https://mimesis-sight-path.pages.dev/api/autopost';
const SLOT_HOURS_KST = [8, 18, 22];        // Pages `SLOT_HOURS_KST`·워치독 `SLOTS`와 같은 값
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const PER_CALL_MS = 60_000;
/** 보충 대상 — 직전 슬롯 하나만. Pages의 보충 허용 기간(13h) 안에서만 유효하다. */
const RECONCILE_BACK = 1;

export default {
  async scheduled(event, env, ctx) {
    ctx.waitUntil(run(env, event.scheduledTime ?? Date.now()));
  },
};

/** KST 슬롯 표기 — Pages `kstIso()`와 같은 형식이어야 한다(문자열이 곧 계약이다). */
function kstIso(utcMs) {
  const k = new Date(utcMs + KST_OFFSET_MS);
  const p = (n) => String(n).padStart(2, '0');
  return `${k.getUTCFullYear()}-${p(k.getUTCMonth() + 1)}-${p(k.getUTCDate())}T${p(k.getUTCHours())}:${p(k.getUTCMinutes())}:00+09:00`;
}

/** now 이전(포함) 슬롯들을 최신순으로. [0]이 지금 채워야 할 슬롯. */
function recentSlots(now, count) {
  const out = [];
  const kst = new Date(now + KST_OFFSET_MS);
  for (let dayBack = 0; dayBack <= 1 && out.length < count + 3; dayBack++) {
    const b = new Date(kst);
    b.setUTCDate(b.getUTCDate() - dayBack);
    for (const h of SLOT_HOURS_KST) {
      const utc = Date.UTC(b.getUTCFullYear(), b.getUTCMonth(), b.getUTCDate(), h, 0, 0) - KST_OFFSET_MS;
      if (utc <= now) out.push(utc);
    }
  }
  return out.sort((a, b) => b - a).slice(0, count);
}

async function callSlot(env, slotUtc) {
  const slot = kstIso(slotUtc);
  const url = `${ENDPOINT}?scheduledFor=${encodeURIComponent(slot)}`;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'X-Publish-Key': env.PUBLISH_KEY },
      signal: AbortSignal.timeout(PER_CALL_MS),
    });
    const body = await res.json().catch(() => null);
    // 침묵이 버그다 — 건너뛴 것도 왜 건너뛰었는지 남긴다.
    return `${slot} ${res.status} ${body?.skipped ?? (body?.ok ? 'published' : body?.error ?? 'unknown')}`;
  } catch (e) {
    return `${slot} fetch_error: ${String((e && e.message) || e).slice(0, 120)}`;
  }
}

/** 지금 채워야 할 슬롯 하나. */
async function publishDueSlot(env, now) {
  const [due] = recentSlots(now, 1);
  if (due === undefined) return 'due: none';
  return `due: ${await callSlot(env, due)}`;
}

/**
 * 누락 보충 — 지난 슬롯을 다시 때린다.
 * 별도의 "누락 목록"을 묻지 않는다: **영수증이 정본이다.** 이미 발행됐으면 Pages가
 * `slot_duplicate`로 돌려보내므로 이 호출은 무해한 no-op이 된다. 비었으면 그때 채워진다.
 */
async function reconcileMissedSlots(env, now) {
  const slots = recentSlots(now, 1 + RECONCILE_BACK).slice(1);
  if (!slots.length) return 'reconcile: none';
  const out = [];
  for (const s of slots) out.push(await callSlot(env, s));
  return `reconcile: ${out.join(' ; ')}`;
}

async function run(env, now) {
  if (!env.PUBLISH_KEY) { console.log('publish-scheduler: PUBLISH_KEY 미설정 — 아무것도 하지 않음'); return; }
  const due = await publishDueSlot(env, now);
  const rec = await reconcileMissedSlots(env, now);
  console.log(`publish-scheduler: ${due} | ${rec}`);
}

// 테스트용 노출 (순수 함수만)
export { kstIso, recentSlots };
