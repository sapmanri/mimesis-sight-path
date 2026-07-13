import { readFile } from 'node:fs/promises';
import process from 'node:process';

// Mirrors validateWorldEventRegistry() in src/worldEvents/worldEventRegistry.ts but
// runs as a standalone text check (no TS runtime needed), matching the object
// validator's approach. World Events take the whole screen, so out-of-range values
// are build-blocking here.

const registryPath = new URL('../src/worldEvents/worldEventRegistry.ts', import.meta.url);
const source = await readFile(registryPath, 'utf8');

const errors = [];

// Required exports so downstream (2D hook, future Authority) can rely on the API.
for (const token of [
  'WORLD_EVENT_REGISTRY',
  'getWorldEventById',
  'validateWorldEventRegistry',
  'listEligibleWorldEvents',
  'ActiveWorldEvent',
]) {
  if (!source.includes(token)) errors.push(`missing required export/type: ${token}`);
}

// Isolate the registry array literal.
const arrayMatch = source.match(/WORLD_EVENT_REGISTRY[^=]*=\s*\[([\s\S]*?)\n\];/);
if (!arrayMatch) {
  errors.push('could not locate WORLD_EVENT_REGISTRY array literal');
} else {
  const body = arrayMatch[1];
  // Split into per-event object blocks by top-level id: markers.
  const ids = [...body.matchAll(/\bid:\s*'([^']+)'/g)].map((m) => m[1]);
  const durations = [...body.matchAll(/durationSeconds:\s*(\d+)/g)].map((m) => Number(m[1]));
  const cooldowns = [...body.matchAll(/cooldownSeconds:\s*(\d+)/g)].map((m) => Number(m[1]));
  const shakes = [...body.matchAll(/shakePx:\s*(\d+)/g)].map((m) => Number(m[1]));
  const repeats = [...body.matchAll(/repeat:\s*(\d+)/g)].map((m) => Number(m[1]));
  const rarities = [...body.matchAll(/rarity:\s*'([^']+)'/g)].map((m) => m[1]);

  // Duplicate / empty ids.
  const seen = new Set();
  for (const id of ids) {
    if (!id.trim()) errors.push('world event with empty id');
    if (seen.has(id)) errors.push(`duplicate world event id: ${id}`);
    seen.add(id);
  }

  // Per-event blocks for journalLines + duration/cooldown relationship.
  const blocks = body.split(/\n\s*\{/).filter((b) => b.includes('id:'));
  for (const block of blocks) {
    const idMatch = block.match(/id:\s*'([^']+)'/);
    const id = idMatch ? idMatch[1] : '(unknown)';
    const dur = Number((block.match(/durationSeconds:\s*(\d+)/) || [])[1] ?? NaN);
    const cd = Number((block.match(/cooldownSeconds:\s*(\d+)/) || [])[1] ?? NaN);
    if (!(dur > 0)) errors.push(`durationSeconds must be > 0: ${id}`);
    if (dur > 30) errors.push(`durationSeconds too long (>30): ${id}`);
    if (Number.isFinite(cd) && Number.isFinite(dur) && cd < dur) errors.push(`cooldownSeconds < durationSeconds: ${id}`);
    const jl = block.match(/journalLines:\s*\[([\s\S]*?)\]/);
    if (!jl || jl[1].trim() === '') errors.push(`journalLines empty: ${id}`);
  }

  const validRarities = new Set(['uncommon', 'rare', 'legendary']);
  for (const r of rarities) if (!validRarities.has(r)) errors.push(`invalid rarity: ${r}`);
  for (const s of shakes) if (s > 2) errors.push(`camera.shakePx over 2: ${s}`);
  for (const r of repeats) if (r > 8) errors.push(`sound.repeat over 8: ${r}`);

  if (ids.length === 0) errors.push('no world events registered');

  var counts = { events: ids.length, ids };
}

if (errors.length) {
  console.error('World Event Registry validation failed:');
  for (const e of errors) console.error(`- ${e}`);
  process.exit(1);
}

console.log(`World Event Registry validation passed: ${JSON.stringify(counts)}`);
