import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../plugin/mcp_server.mjs', import.meta.url), 'utf8');
const start = source.indexOf('function extractUniqueCreateResponseCode(');
const end = source.indexOf('function summarizeCreateResponseShape(', start);
assert.ok(start >= 0 && end > start, 'nie znaleziono źródła extractUniqueCreateResponseCode');
const extract = vm.runInNewContext(`(${source.slice(start, end).trim()})`);

assert.equal(extract({ code: 0, data: '6af4a7dee4b04f0c79a5dea3' }), '6af4a7dee4b04f0c79a5dea3');
assert.equal(extract({ code: 0, data: 'OK' }), null);
assert.throws(() => extract({ code: 0, data: '6af4a7dee4b04f0c79a5dea3', templateCode: '6af4280ae4b04f0c8153a8a5' }), /sprzeczne kody/);
assert.equal(extract({ data: { templateCode: 'abc' } }), 'abc');
let getterCalls = 0;
const withGetter = { code: 0 };
Object.defineProperty(withGetter, 'data', { enumerable: true, get() { getterCalls += 1; return '6af4a7dee4b04f0c79a5dea3'; } });
assert.equal(extract(withGetter), null);
assert.equal(getterCalls, 0);
console.log('create-response-code: 5/5 OK');
