// 공유카드 회귀 검증 (P0-1 / BUILD 415-A에서 확립)
//
// public/byeoli-walk/index.html의 PR.buildCard()를 추출해 스텁 캔버스 컨텍스트로
// 실행하고, fillText 호출 기록으로 다음을 검증한다:
//
//   1) Observer Code 마스킹 — 카드에 원본 풀코드가 절대 찍히지 않고 마스킹 값만 존재
//   2) 목록 최대 5행 — 취향 n개일 때 렌더되는 목록행은 min(n, 5)
//   3) 초과분 요약 — n > 5이면 "외 N개의 발견" 요약행, 아니면 없음
//   4) footer 여백 — footer 문구를 제외한 모든 콘텐츠 baseline이
//      (footer 1278 − 최소여백 48) = 1230 이하
//   5) 가드 미발동 — buildCard 내부 footer gap console.warn이 0건
//
// 케이스: 취향 0 / 1 / 5 / 6 / 20개 (홈즈 확정 회귀 세트)
//
// 의존성 없음 — 픽셀이 아니라 드로우 콜 기하를 검증하므로 node-canvas가 필요 없다.
// 육안 확인용 PNG가 필요하면 `npm i -D canvas` 후 --png 옵션으로 /tmp에 출력된다.

import { readFile, writeFile } from 'node:fs/promises';
import process from 'node:process';

const htmlPath = new URL('../public/byeoli-walk/index.html', import.meta.url);
const html = await readFile(htmlPath, 'utf8');

const errors = [];

/* ---------- buildCard / _roundRect 본문 추출 ---------- */
// 메서드 "정의부"를 찾는다. 'name(' 단순 검색은 this.buildCard() 같은
// "호출부"를 먼저 잡아 엉뚱한 코드를 추출하므로 절대 사용하지 말 것 (415-A에서 실제 발생).
function extractMethodBody(name) {
  const start = html.indexOf(`\n  ${name}(`);
  if (start < 0) {
    errors.push(`method definition not found: ${name}`);
    return null;
  }
  const bodyStart = html.indexOf('{', start);
  let depth = 0;
  let i = bodyStart;
  for (;; i += 1) {
    if (i >= html.length) {
      errors.push(`unbalanced braces while extracting: ${name}`);
      return null;
    }
    const ch = html[i];
    if (ch === '{') depth += 1;
    else if (ch === '}') {
      depth -= 1;
      if (depth === 0) break;
    }
  }
  return html.slice(bodyStart + 1, i);
}

const buildCardBody = extractMethodBody('buildCard');
const roundRectBody = extractMethodBody('_roundRect');
if (!buildCardBody || !roundRectBody) fail();

/* ---------- 스텁 캔버스 환경 ---------- */
const FULL_CODE = 'BYL-TEST-WXYZ';
const MASKED = FULL_CODE.slice(0, -4) + '••••';
const H = 1350;
const FOOTER_BASE = H - 72; // 1278
const MIN_GAP = 48;

const wantPng = process.argv.includes('--png');
let createCanvas = null;
if (wantPng) {
  try {
    ({ createCanvas } = await import('canvas'));
  } catch {
    console.warn('[card] --png requested but `canvas` is not installed — geometry checks only');
  }
}

function makeStubContext(recorder) {
  const gradient = { addColorStop() {} };
  return {
    textAlign: 'left',
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
    font: '',
    letterSpacing: '0px',
    createLinearGradient: () => gradient,
    fillRect() {},
    beginPath() {},
    moveTo() {},
    arcTo() {},
    arc() {},
    closePath() {},
    fill() {},
    stroke() {},
    clip() {},
    save() {},
    restore() {},
    drawImage() {},
    fillText(text, x, y) {
      recorder.push({ text: String(text), x, y });
    },
  };
}

function makeEnv(tasteCount) {
  const tastes = {};
  for (let i = 0; i < tasteCount; i += 1) {
    tastes[`obj${i}`] = {
      type: `obj${i}`,
      total: tasteCount - i,
      acts: { observe: 1, record: 0, rest: 0, wonder: 0 },
      firstAt: 1700000000000,
      lastAt: 1700000600000,
    };
  }

  const texts = [];
  const warned = [];
  const realCanvas = createCanvas ? createCanvas(1, 1) : null;

  const doc = {
    createElement(tag) {
      if (tag !== 'canvas') throw new Error(`unexpected createElement: ${tag}`);
      if (realCanvas) {
        // node-canvas 사용 시: 실제 렌더 + fillText 기록 병행
        const realGetCtx = realCanvas.getContext.bind(realCanvas);
        realCanvas.getContext = (type) => {
          const g = realGetCtx(type);
          const realFill = g.fillText.bind(g);
          g.fillText = (text, x, y) => {
            texts.push({ text: String(text), x, y });
            realFill(text, x, y);
          };
          Object.defineProperty(g, 'letterSpacing', { get: () => '0px', set() {} });
          return g;
        };
        realCanvas.toBlob = (cb) => cb(realCanvas.toBuffer('image/png'));
        return realCanvas;
      }
      // 기본: 스텁 컨텍스트 (의존성 제로)
      return {
        width: 0,
        height: 0,
        getContext: () => makeStubContext(texts),
        toBlob: (cb) => cb(new Uint8Array(1)),
      };
    },
    getElementById() {
      return null; // #game 스냅샷 경로는 buildCard 내부 try/catch로 스킵된다
    },
  };

  const Profile = {
    data: {
      observerId: FULL_CODE,
      memoryCount: 12,
      diaryCount: 3,
      tastes,
      firstSeenAt: 1700000000000,
    },
    observedMs: () => 3600000,
  };

  const stub = {
    // PR.rows()와 동일한 정렬 로직 (원본이 바뀌면 이 사본도 갱신할 것)
    rows() {
      const list = Object.values(Profile.data.tastes).map((t) => ({
        type: t.type,
        acts: t.acts,
        total: t.total,
        firstAt: t.firstAt,
        lastAt: t.lastAt,
      }));
      const max = list.reduce((m, r) => Math.max(m, r.total), 0) || 1;
      for (const r of list) r.score = Math.min(1, r.total / max);
      list.sort(
        (a, b) => b.score - a.score || b.total - a.total || b.lastAt - a.lastAt,
      );
      return list;
    },
    _roundRect: new Function('g', 'x', 'y', 'w', 'h', 'r', roundRectBody),
    buildCard: null,
  };

  const catalogProxy = new Proxy(
    {},
    {
      get: (_, key) =>
        typeof key === 'string' ? { emoji: '·', ko: `대상 ${key}` } : undefined,
      has: () => true,
    },
  );

  stub.buildCard = new Function(
    'document',
    'Profile',
    'CATALOG',
    'RARE',
    'fmtDuration',
    'fmtWhen',
    'console',
    `return (function(){${buildCardBody}}).call(this);`,
  ).bind(
    stub,
    doc,
    Profile,
    catalogProxy,
    {},
    () => '1시간',
    () => '2026.07.16',
    { warn: (...args) => warned.push(args.join(' ')) },
  );

  return { texts, warned, stub, realCanvas };
}

/* ---------- 실행 & 검증 ---------- */
const cases = [0, 1, 5, 6, 20];
const summary = { mode: createCanvas ? 'render+geometry' : 'geometry', cases: {} };

for (const n of cases) {
  const env = makeEnv(n);
  const blobLike = await env.stub.buildCard();
  const t = env.texts;
  const label = `n=${n}`;

  if (t.some((e) => e.text === FULL_CODE)) {
    errors.push(`[${label}] full observer code leaked onto card`);
  }
  if (!t.some((e) => e.text === MASKED)) {
    errors.push(`[${label}] masked observer code (${MASKED}) not drawn`);
  }

  const rowTexts = t.filter((e) => e.x === 84 && e.text.startsWith('·  '));
  const expectedRows = Math.min(n, 5);
  if (rowTexts.length !== expectedRows) {
    errors.push(`[${label}] list rows ${rowTexts.length} !== min(${n},5)=${expectedRows}`);
  }

  const summaryRow = t.find((e) => /^외 \d+개/.test(e.text));
  if (n > 5) {
    const expected = `외 ${n - 5}개의 발견`;
    if (!summaryRow || summaryRow.text !== expected) {
      errors.push(`[${label}] summary row missing or wrong (want "${expected}")`);
    }
  } else if (summaryRow) {
    errors.push(`[${label}] unexpected summary row: "${summaryRow.text}"`);
  }

  const contentMax = Math.max(0, ...t.filter((e) => e.y < FOOTER_BASE).map((e) => e.y));
  if (contentMax > FOOTER_BASE - MIN_GAP) {
    errors.push(
      `[${label}] content bottom ${contentMax} > limit ${FOOTER_BASE - MIN_GAP}`,
    );
  }

  if (env.warned.length > 0) {
    errors.push(`[${label}] footer gap guard fired: ${env.warned.join(' / ')}`);
  }

  summary.cases[label] = { rows: rowTexts.length, contentBottom: contentMax };

  if (env.realCanvas && blobLike?.length > 100) {
    await writeFile(`/tmp/card-${n}.png`, blobLike);
    summary.cases[label].png = `/tmp/card-${n}.png`;
  }
}

function fail() {
  console.error('Share card validation failed:');
  for (const e of errors) console.error(` - ${e}`);
  process.exit(1);
}

if (errors.length > 0) fail();
console.log(`Share card validation passed: ${JSON.stringify(summary)}`);
