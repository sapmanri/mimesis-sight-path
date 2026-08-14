import { buildGenomeContext } from './functions/api/_genome-identity.ts';
const r = buildGenomeContext('byeoli', null);
console.log('pass:', r.result?.pass, '| errors:', JSON.stringify(r.result?.errors));
console.log('context?', !!r.context);
if (r.context) console.log('identity keys:', Object.keys(r.context.identity||{}), '| selection:', r.context.selection);
