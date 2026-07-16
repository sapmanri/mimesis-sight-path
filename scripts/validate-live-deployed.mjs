// 배포본 live 검증 (BUILD 418-A) — ⚠ 빌드 게이트에 넣지 말 것.
// 외부 네트워크에 의존하므로 Cloudflare/회선의 일시 장애가 정상 코드를
// 막을 수 있다. 배포 후 수동 확인 또는 별도 CI 단계에서만 사용.
//
//   node scripts/validate-live-deployed.mjs [베이스URL]
//   (기본: https://mimesis-sight-path.pages.dev)
//
// 검사:
//   1) /byeoli-walk/ 응답에 live 주입 마커 5종이 존재하는가
//      (미들웨어가 런타임에 실제로 치환하고 있는가)
//   2) /api/byeoli/state 가 schemaVersion 있는 JSON을 반환하는가 (Authority 생존)

import process from 'node:process';

const BASE = (process.argv[2] || 'https://mimesis-sight-path.pages.dev').replace(/\/$/, '');
const errors = [];

async function get(path) {
  const res = await fetch(BASE + path, { headers: { 'User-Agent': 'validate-live-deployed' } });
  return { status: res.status, text: await res.text() };
}

/* ---------- 1) 페이지 주입 마커 ---------- */
try {
  const page = await get('/byeoli-walk/');
  if (page.status !== 200) {
    errors.push(`/byeoli-walk/ → HTTP ${page.status}`);
  } else {
    const markers = [
      ["live 분기 주입", "if(stateProvider.mode==='sandbox'){"],
      ['WakeLockManager 시동', 'WakeLockManager.start();'],
      ['연결 메시지', '단 하나의 별이에 연결 중'],
      ['renderTaste 게이트', "if(stateProvider.mode==='sandbox'){ renderDrives(); renderTaste(); }"],
      ['LIVE_MODE 파서', "get('mode')==='live'"],
    ];
    for (const [name, m] of markers) {
      if (!page.text.includes(m)) errors.push(`/byeoli-walk/ → 주입 마커 누락 (${name}): ${JSON.stringify(m.slice(0, 50))}`);
    }
  }
} catch (e) {
  errors.push(`/byeoli-walk/ → fetch 실패: ${e.message}`);
}

/* ---------- 2) Authority 생존 ---------- */
try {
  const api = await get('/api/byeoli/state');
  if (api.status !== 200) {
    errors.push(`/api/byeoli/state → HTTP ${api.status}`);
  } else {
    let json;
    try { json = JSON.parse(api.text); } catch { json = null; }
    if (!json || typeof json.schemaVersion !== 'number') {
      errors.push(`/api/byeoli/state → schemaVersion 없는 응답: ${api.text.slice(0, 120)}`);
    }
  }
} catch (e) {
  errors.push(`/api/byeoli/state → fetch 실패: ${e.message}`);
}

if (errors.length > 0) {
  console.error(`Live deployed validation failed (${BASE}):`);
  for (const e of errors) console.error(` - ${e}`);
  process.exit(1);
}
console.log(`Live deployed validation passed: ${BASE}`);
