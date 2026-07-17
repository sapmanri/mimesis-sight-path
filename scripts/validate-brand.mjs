/**
 * BUILD 421-B — 공개 메타데이터·브랜드 자산 정적 검증 (게이트 편입).
 * 실제 커스텀 도메인 응답 검사는 배포 후 validate:live:deployed 쪽 책임.
 * 검사:
 *   1. 필수 meta/link 태그 존재 + canonical·og:url 정본 일치
 *   2. og:image / 아이콘 / 스크린샷 파일 존재 + 선언 크기 = 실제 픽셀 크기
 *   3. manifest JSON 유효성 · 필수 필드 · icon/screenshot 경로 존재 · start_url·scope 유효
 *   4. Recovery Key가 메타·파일명·manifest에 없음
 *   5. pages.dev 개발 URL이 공개 메타데이터에 없음
 *   6. 모든 브랜드 자산이 빌드 산출물(dist)에 포함
 */
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const HTML_PATH = resolve(ROOT, 'public/byeoli-walk/index.html');
const MANIFEST_PATH = resolve(ROOT, 'public/byeoli-walk/manifest.webmanifest');
const BRAND_DIR = resolve(ROOT, 'public/byeoli-walk/assets/brand');
const DIST_BRAND = resolve(ROOT, 'dist/byeoli-walk/assets/brand');

const CANONICAL = 'https://byeoli.sapmanri.com/';
const OG_IMAGE = 'https://byeoli.sapmanri.com/byeoli-walk/assets/brand/og-byeoli-1200x630.png';

const errors = [];
const html = readFileSync(HTML_PATH, 'utf8');
const head = html.slice(0, html.indexOf('</head>'));

/* ---------- PNG 실제 픽셀 크기 (IHDR 직접 파싱 — 외부 의존성 없음) ---------- */
function pngSize(file) {
  const b = readFileSync(file);
  if (b.readUInt32BE(0) !== 0x89504e47) return null;
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
}

/* ---------- 1. 필수 태그 ---------- */
const REQUIRED_META = [
  ['name', 'description'],
  ['property', 'og:type'], ['property', 'og:title'], ['property', 'og:description'],
  ['property', 'og:image'], ['property', 'og:image:width'], ['property', 'og:image:height'],
  ['property', 'og:url'], ['property', 'og:site_name'],
  ['name', 'twitter:card'], ['name', 'twitter:title'], ['name', 'twitter:description'],
  ['name', 'twitter:image'], ['name', 'theme-color'],
  ['name', 'apple-mobile-web-app-title'], ['name', 'apple-mobile-web-app-capable'],
  ['name', 'apple-mobile-web-app-status-bar-style'],
];
for (const [attr, key] of REQUIRED_META) {
  if (!new RegExp(`<meta\\s+${attr}=["']${key.replace(/[:]/g, '[:]')}["']`, 'i').test(head)) {
    errors.push(`missing <meta ${attr}="${key}">`);
  }
}
if (!/<title>별이 — 함께 걷는 작은 산책<\/title>/.test(head)) errors.push('title must be the finalized copy');
for (const rel of ['canonical', 'manifest', 'apple-touch-icon']) {
  if (!new RegExp(`<link[^>]+rel=["']${rel}["']`, 'i').test(head)) errors.push(`missing <link rel="${rel}">`);
}
if (!/<link[^>]+rel=["']icon["']/i.test(head)) errors.push('missing <link rel="icon">');

const canonical = head.match(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i)?.[1];
if (canonical !== CANONICAL) errors.push(`canonical must be ${CANONICAL} (got ${canonical})`);
const ogUrl = head.match(/<meta\s+property=["']og:url["'][^>]+content=["']([^"']+)["']/i)?.[1];
if (ogUrl !== CANONICAL) errors.push(`og:url must be ${CANONICAL} (got ${ogUrl})`);
const ogImage = head.match(/<meta\s+property=["']og:image["'][^>]+content=["']([^"']+)["']/i)?.[1];
if (ogImage !== OG_IMAGE) errors.push(`og:image must be ${OG_IMAGE} (got ${ogImage})`);

/* ---------- 2. 자산 존재 + 선언 크기 = 실제 크기 ---------- */
const ASSETS = [
  ['og-byeoli-1200x630.png', 1200, 630],
  ['icon-192.png', 192, 192],
  ['icon-512.png', 512, 512],
  ['icon-maskable-512.png', 512, 512],
  ['apple-touch-icon.png', 180, 180],
  ['favicon-32x32.png', 32, 32],
  ['favicon-16x16.png', 16, 16],
];
for (const [name, w, h] of ASSETS) {
  const p = resolve(BRAND_DIR, name);
  if (!existsSync(p)) { errors.push(`missing brand asset: ${name}`); continue; }
  const size = pngSize(p);
  if (!size) { errors.push(`${name}: not a valid PNG`); continue; }
  if (size.w !== w || size.h !== h) errors.push(`${name}: expected ${w}x${h}, actual ${size.w}x${size.h}`);
}
if (!existsSync(resolve(BRAND_DIR, 'favicon.ico'))) errors.push('missing brand asset: favicon.ico');

const ogDeclaredW = head.match(/<meta\s+property=["']og:image:width["'][^>]+content=["'](\d+)["']/i)?.[1];
const ogDeclaredH = head.match(/<meta\s+property=["']og:image:height["'][^>]+content=["'](\d+)["']/i)?.[1];
if (ogDeclaredW !== '1200' || ogDeclaredH !== '630') errors.push('og:image:width/height must be 1200/630');

/* ---------- 3. manifest ---------- */
let manifest = null;
try {
  manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8'));
} catch (e) {
  errors.push(`manifest is not valid JSON: ${e.message}`);
}
if (manifest) {
  for (const f of ['id', 'name', 'short_name', 'description', 'lang', 'start_url', 'scope',
                   'display', 'orientation', 'background_color', 'theme_color', 'icons', 'screenshots']) {
    if (manifest[f] === undefined) errors.push(`manifest missing field: ${f}`);
  }
  if (manifest.name !== '별이 — 함께 걷는 작은 산책') errors.push('manifest.name must be the finalized copy');
  if (manifest.short_name !== '별이') errors.push('manifest.short_name must be 별이');
  if (manifest.display !== 'standalone') errors.push('manifest.display must be standalone');
  if (manifest.lang !== 'ko') errors.push('manifest.lang must be ko');
  // 정본(공개 도메인) 기준 — pages.dev 값은 미들웨어가 런타임에 재작성
  if (manifest.start_url !== '/') errors.push('manifest.start_url must be "/" (host rewrite handles pages.dev)');
  if (manifest.scope !== '/') errors.push('manifest.scope must be "/"');
  if (!String(manifest.start_url).startsWith(String(manifest.scope))) {
    errors.push('manifest.start_url must be within scope');
  }
  const hasMaskable = (manifest.icons ?? []).some((i) => String(i.purpose ?? '').includes('maskable'));
  if (!hasMaskable) errors.push('manifest needs a maskable icon');
  for (const entry of [...(manifest.icons ?? []), ...(manifest.screenshots ?? [])]) {
    const rel = String(entry.src ?? '').replace(/^\//, '');
    const p = resolve(ROOT, 'public', rel);
    if (!existsSync(p)) { errors.push(`manifest src not found: ${entry.src}`); continue; }
    const size = pngSize(p);
    const [dw, dh] = String(entry.sizes ?? '').split('x').map(Number);
    if (size && (size.w !== dw || size.h !== dh)) {
      errors.push(`manifest ${entry.src}: declared ${entry.sizes}, actual ${size.w}x${size.h}`);
    }
  }
  if ((manifest.screenshots ?? []).length < 2) errors.push('manifest needs mobile + desktop screenshots');
  const forms = new Set((manifest.screenshots ?? []).map((s) => s.form_factor));
  if (!forms.has('narrow') || !forms.has('wide')) errors.push('screenshots need both narrow and wide form_factor');
}

/* ---------- 4·5. 노출 금지 문자열 ---------- */
const manifestRaw = existsSync(MANIFEST_PATH) ? readFileSync(MANIFEST_PATH, 'utf8') : '';
for (const [label, text] of [['head', head], ['manifest', manifestRaw]]) {
  if (/BYLR-/.test(text)) errors.push(`${label}: Recovery Key pattern (BYLR-) must never appear`);
  if (/pages\.dev/.test(text)) errors.push(`${label}: pages.dev dev URL must not appear in public metadata`);
}
if (existsSync(BRAND_DIR)) {
  for (const f of readdirSync(BRAND_DIR)) {
    if (/BYLR-|BYL-/.test(f)) errors.push(`brand asset filename leaks a code: ${f}`);
  }
}

/* ---------- 6. dist 포함 ---------- */
if (existsSync(DIST_BRAND)) {
  for (const [name] of ASSETS) {
    if (!existsSync(resolve(DIST_BRAND, name))) errors.push(`brand asset missing from dist: ${name}`);
  }
  if (!existsSync(resolve(ROOT, 'dist/byeoli-walk/manifest.webmanifest'))) {
    errors.push('manifest missing from dist');
  }
}

if (errors.length) {
  console.error('Brand/metadata validation FAILED:');
  for (const e of errors) console.error('  - ' + e);
  process.exit(1);
}
console.log(`Brand validation passed: ${ASSETS.length + 1} assets, manifest ok, canonical ${CANONICAL}`);
