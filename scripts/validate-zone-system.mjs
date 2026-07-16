// 거리 존 시스템 검증 (BUILD 416-A)
//
// public/byeoli-walk/index.html에서 BG_PACK / BG_ZONES / BG_ZONE_PREF /
// BG_STAGGER / bgEligible / bgPick / bgJourney를 추출해 검증한다:
//
//   1) 고아 참조 0 — BG_ZONE_PREF의 모든 id가 BG_PACK에 실존
//   2) 전수 검사 — 4계절 × 4시간 × 5날씨 × 4존 × 7레이어(sky 제외) 선택 결과가
//      eligibility 위반 0 · undefined 0
//   3) 존 구간이 빈틈·겹침 없이 연속이고 마지막 끝 = BG_CYCLE_M
//   4) stagger가 BG_ORDER far→near 순으로 강증가
//   5) 사이클 재조합 실효성 — 동일 (seed, ctx, zone)에서 cycle 0/1 조합이
//      전체 케이스의 절반 이상에서 최소 1개 레이어 상이
//
// 의존성 없음. 추출은 카드 validator와 동일하게 "정의부" 기준.

import { readFile } from 'node:fs/promises';
import process from 'node:process';

const htmlPath = new URL('../public/byeoli-walk/index.html', import.meta.url);
const html = await readFile(htmlPath, 'utf8');
const errors = [];

/* ---------- 선언 추출 ---------- */
function extractConst(name) {
  const marker = `const ${name}=`;
  const start = html.indexOf(marker);
  if (start < 0) {
    errors.push(`declaration not found: ${name}`);
    return null;
  }
  const exprStart = start + marker.length;
  const open = html[exprStart];
  if (open !== '{' && open !== '[') {
    // 숫자 등 단순 리터럴
    const end = html.indexOf(';', exprStart);
    return html.slice(exprStart, end);
  }
  const close = open === '{' ? '}' : ']';
  let depth = 0;
  let i = exprStart;
  for (;; i += 1) {
    if (i >= html.length) {
      errors.push(`unbalanced brackets extracting: ${name}`);
      return null;
    }
    if (html[i] === open) depth += 1;
    else if (html[i] === close) {
      depth -= 1;
      if (depth === 0) break;
    }
  }
  return html.slice(exprStart, i + 1);
}

function extractFunction(name) {
  const marker = `function ${name}(`;
  const start = html.indexOf(marker);
  if (start < 0) {
    errors.push(`function not found: ${name}`);
    return null;
  }
  let depth = 0;
  let i = html.indexOf('{', start);
  for (;; i += 1) {
    if (html[i] === '{') depth += 1;
    else if (html[i] === '}') {
      depth -= 1;
      if (depth === 0) break;
    }
  }
  return html.slice(start, i + 1);
}

const src = {
  BG_PACK: extractConst('BG_PACK'),
  BG_ORDER: extractConst('BG_ORDER'),
  BG_M2PX: extractConst('BG_M2PX'),
  BG_ZONES: extractConst('BG_ZONES'),
  BG_CYCLE_M: extractConst('BG_CYCLE_M'),
  BG_STAGGER: extractConst('BG_STAGGER'),
  BG_ZONE_PREF: extractConst('BG_ZONE_PREF'),
  fnEligible: extractFunction('bgEligible'),
  fnPick: extractFunction('bgPick'),
  fnJourney: extractFunction('bgJourney'),
};
if (Object.values(src).some((v) => v == null)) fail();

const env = new Function(`
  const BG_PACK=${src.BG_PACK};
  const BG_ORDER=${src.BG_ORDER};
  const BG_M2PX=${src.BG_M2PX};
  const BG_ZONES=${src.BG_ZONES};
  const BG_CYCLE_M=${src.BG_CYCLE_M};
  const BG_STAGGER=${src.BG_STAGGER};
  const BG_ZONE_PREF=${src.BG_ZONE_PREF};
  ${src.fnEligible}
  ${src.fnPick}
  ${src.fnJourney}
  return { BG_PACK, BG_ORDER, BG_M2PX, BG_ZONES, BG_CYCLE_M, BG_STAGGER,
           BG_ZONE_PREF, bgEligible, bgPick, bgJourney };
`)();

const {
  BG_PACK, BG_ORDER, BG_ZONES, BG_CYCLE_M, BG_STAGGER, BG_ZONE_PREF,
  bgEligible, bgPick, bgJourney,
} = env;

const GROUND_LAYERS = BG_ORDER.filter((l) => l !== 'sky');
const ZONE_IDS = BG_ZONES.map((z) => z.id);

/* ---------- 1) 고아 참조 ---------- */
for (const [zone, layers] of Object.entries(BG_ZONE_PREF)) {
  if (!ZONE_IDS.includes(zone)) errors.push(`zone pref for unknown zone: ${zone}`);
  for (const [layer, ids] of Object.entries(layers)) {
    const packIds = new Set((BG_PACK[layer] || []).map((c) => c.id));
    for (const id of ids) {
      if (!packIds.has(id)) errors.push(`orphan pref id: ${zone}.${layer} -> ${id}`);
    }
  }
}
for (const zone of ZONE_IDS) {
  if (!BG_ZONE_PREF[zone]) errors.push(`zone missing pref table: ${zone}`);
}

/* ---------- 2) 전수 eligibility ---------- */
const SEASONS = ['spring', 'summer', 'autumn', 'winter'];
const TIMES = ['morning', 'day', 'dusk', 'night'];
const WEATHERS = ['clear', 'cloudy', 'rain', 'snow', 'fog'];
const SEEDS = [1, 20260716, 987654321];

let checkedPicks = 0;
for (const season of SEASONS)
  for (const time of TIMES)
    for (const weather of WEATHERS)
      for (const zone of ZONE_IDS)
        for (const layer of GROUND_LAYERS)
          for (const seed of SEEDS) {
            const ctxv = { season, time, weather };
            const c = bgPick(layer, seed, ctxv, zone, 0);
            checkedPicks += 1;
            if (!c) {
              errors.push(`empty pick: ${layer} @ ${season}/${time}/${weather}/${zone}`);
              continue;
            }
            // 존 좁히기가 eligibility를 깨지 않았는지 — 완화 경로 진입 여부와
            // 무관하게, 완전 eligible 풀이 존재하는 컨텍스트에서는 위반이 없어야 한다
            const fullPool = BG_PACK[layer].filter((x) => bgEligible(x, ctxv));
            if (fullPool.length > 0 && !bgEligible(c, ctxv)) {
              errors.push(
                `eligibility violated by zone narrowing: ${layer}=${c.id} @ ${season}/${time}/${weather}/${zone}`,
              );
            }
          }

/* ---------- 3) 존 구간 연속성 ---------- */
let cursor = 0;
for (const z of BG_ZONES) {
  if (z.from !== cursor) errors.push(`zone gap/overlap at ${z.id}: from=${z.from}, expected ${cursor}`);
  if (z.to <= z.from) errors.push(`zone ${z.id} has non-positive span`);
  cursor = z.to;
}
if (cursor !== BG_CYCLE_M) errors.push(`cycle length ${BG_CYCLE_M} !== last zone end ${cursor}`);

/* ---------- 4) stagger 강증가 (far→near) ---------- */
let prev = -Infinity;
for (const layer of GROUND_LAYERS) {
  const v = BG_STAGGER[layer];
  if (typeof v !== 'number') {
    errors.push(`stagger missing for layer: ${layer}`);
    continue;
  }
  if (v <= prev) errors.push(`stagger not strictly increasing at ${layer}: ${v} <= ${prev}`);
  prev = v;
}

/* ---------- 5) 사이클 재조합 실효성 ---------- */
let differing = 0;
let total = 0;
for (const season of SEASONS)
  for (const weather of WEATHERS)
    for (const zone of ZONE_IDS)
      for (const seed of SEEDS) {
        const ctxv = { season, time: 'day', weather };
        let diff = false;
        for (const layer of GROUND_LAYERS) {
          const a = bgPick(layer, seed, ctxv, zone, 0);
          const b = bgPick(layer, seed, ctxv, zone, 1);
          if (a && b && a.id !== b.id) diff = true;
        }
        total += 1;
        if (diff) differing += 1;
      }
if (differing < total * 0.5) {
  errors.push(`cycle reshuffle ineffective: only ${differing}/${total} contexts differ between cycle 0 and 1`);
}

/* ---------- 존 진행 스모크 — 계단식 순서 ---------- */
// 경계(500m) 직후 구간에서 farMountains가 foreground보다 먼저 다음 존에 들어가는지
{
  const atBoundary = bgJourney(500, 'farMountains');
  const nearAtBoundary = bgJourney(500, 'foreground');
  if (atBoundary.zone !== 'paddy') errors.push(`farMountains should enter paddy at 500m, got ${atBoundary.zone}`);
  if (nearAtBoundary.zone !== 'village') errors.push(`foreground should still be in village at 500m, got ${nearAtBoundary.zone}`);
  const nearLater = bgJourney(500 + BG_STAGGER.foreground, 'foreground');
  if (nearLater.zone !== 'paddy') errors.push(`foreground should enter paddy at 500m+stagger`);
}

function fail() {
  console.error('Zone system validation failed:');
  for (const e of errors) console.error(` - ${e}`);
  process.exit(1);
}

if (errors.length > 0) fail();
console.log(
  `Zone system validation passed: ${JSON.stringify({
    zones: ZONE_IDS,
    checkedPicks,
    cycleReshuffleDiffering: `${differing}/${total}`,
  })}`,
);
