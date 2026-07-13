import { readFile } from 'node:fs/promises';
import process from 'node:process';

const registryPath = new URL('../src/objects/objectRegistry.ts', import.meta.url);
const htmlPath = new URL('../public/byeoli-walk/index.html', import.meta.url);
const middlewarePath = new URL('../functions/byeoli-walk/_middleware.ts', import.meta.url);

const [registrySource, htmlSource, middlewareSource] = await Promise.all([
  readFile(registryPath, 'utf8'),
  readFile(htmlPath, 'utf8'),
  readFile(middlewarePath, 'utf8'),
]);

const errors = [];
const warnings = [];

function collect(regex, source, group = 1) {
  const values = [];
  for (const match of source.matchAll(regex)) values.push(match[group]);
  return values;
}

function duplicates(values) {
  const seen = new Set();
  const repeated = new Set();
  for (const value of values) {
    if (seen.has(value)) repeated.add(value);
    seen.add(value);
  }
  return [...repeated].sort();
}

// Registry entries are intentionally declared through the twoD()/threeD() helpers.
// A both(twoD(...)) declaration is captured once by the twoD expression.
const twoDIds = collect(/\btwoD\(\s*['"]([^'"]+)['"]/g, registrySource);
const threeDIds = collect(/\bthreeD\(\s*['"]([^'"]+)['"]/g, registrySource);
const allDeclaredIds = [...twoDIds, ...threeDIds];

for (const id of duplicates(allDeclaredIds)) {
  errors.push(`duplicate registry id: ${id}`);
}

if (twoDIds.length === 0) errors.push('no 2D registry entries detected');
if (!registrySource.includes('validateObjectRegistry')) errors.push('validateObjectRegistry export is missing');
if (!registrySource.includes('serialize2DRegistry')) errors.push('serialize2DRegistry export is missing');

// Every 2D registry object must have a dedicated drawProp branch. The generic
// fallback is allowed only for genuinely unknown/corrupt runtime data.
const rendererIds = new Set(collect(/\bt\s*===\s*['"]([^'"]+)['"]/g, htmlSource));
for (const id of twoDIds) {
  if (!rendererIds.has(id)) errors.push(`2D renderer missing for registry id: ${id}`);
}

// Renderer branches without a 2D registry entry usually indicate stale or
// duplicated metadata. Keep them as errors so old branches do not silently rot.
const twoDSet = new Set(twoDIds);
for (const id of [...rendererIds].sort()) {
  if (!twoDSet.has(id)) errors.push(`drawProp branch has no 2D registry entry: ${id}`);
}

// The deployed HTML must be generated from the canonical registry, not from
// hand-maintained inline CATALOG / PLAN metadata.
const requiredMiddlewareTokens = [
  'serialize2DRegistry',
  'validateObjectRegistry',
  'twoD.catalog',
  'twoD.variants',
  'twoD.rare',
  'twoD.plan',
];
for (const token of requiredMiddlewareTokens) {
  if (!middlewareSource.includes(token)) errors.push(`2D registry middleware wiring missing token: ${token}`);
}

// Catch accidental edits that remove the four known replacement anchors.
for (const anchor of ['const CATALOG = {', 'const VARIANTS = {', 'const RARE = {', 'const PLAN = {']) {
  if (!htmlSource.includes(anchor)) errors.push(`static HTML replacement anchor missing: ${anchor}`);
}

const counts = {
  twoDRegistry: twoDIds.length,
  threeDDeclarations: threeDIds.length,
  drawPropBranches: rendererIds.size,
};

if (warnings.length) {
  console.warn('Object Registry warnings:');
  for (const warning of warnings) console.warn(`- ${warning}`);
}

if (errors.length) {
  console.error('Object Registry validation failed:');
  for (const error of errors) console.error(`- ${error}`);
  console.error(`Counts: ${JSON.stringify(counts)}`);
  process.exit(1);
}

console.log(`Object Registry validation passed: ${JSON.stringify(counts)}`);
