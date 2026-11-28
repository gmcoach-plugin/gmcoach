import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import { verifyCreatedTemplateReadback } from '../plugin/saved-templates.mjs';

const source = await readFile(new URL('../plugin/mcp_server.mjs', import.meta.url), 'utf8');
const start = source.indexOf('async function resolveNewTemplateCode(');
const end = source.indexOf('\nfunction extractUniqueCreateResponseCode(', start);
assert.ok(start > 0 && end > start);
const shapeStart = source.indexOf('function summarizeCreateResponseShape(');
const shapeEnd = source.indexOf('\nasync function assertQuickTestCalendarTargetDayFree(', shapeStart);
assert.ok(shapeStart > 0 && shapeEnd > shapeStart);
const shapeFunctionEnd = source.indexOf('\n}', shapeStart) + 2;
const summarizeCreateResponseShape = vm.runInNewContext(`(${source.slice(shapeStart, shapeFunctionEnd).trim()})`);

function responseShape(response) {
  const context = {};
  vm.createContext(context);
  context.summarizeCreateResponseShape = summarizeCreateResponseShape;
  return context.summarizeCreateResponseShape(response);
}

function fixture(quickTestFastPath, { strictVerified = false, responseCode = 'new-code' } = {}) {
  const calls = [];
  const readback = { code: 'new-code', name: 'Test three [GM-aaaaaaaaaaaaaaaaaaaaaaaa]', actionLibraryList: [] };
  const context = {
    extractUniqueCreateResponseCode: () => responseCode,
    summarizeCreateResponseShape,
    getTemplateCode: row => row.code,
    getSavedTemplateByCode: async (_profile, _device, code, options) => {
      calls.push(['detail', code, options.createResponseCode]);
      return readback;
    },
    verifyCreatedTemplateReadback: () => { calls.push(['strict']); return { verified: false, status: 'mismatch', mismatches: [], unavailable: [] }; },
    verifyCreatedMachineManagedReadback: options => { calls.push(['strict', options.expectedCode]); return { verified: strictVerified, status: strictVerified ? 'verified' : 'mismatch', mismatches: [], unavailable: [], warnings: [] }; },
    verifyQuickTestSavedReadback: options => {
      calls.push(['quick', options.expectedCode]);
      return { verified: true, warnings: ['machine-managed Smart RM'] };
    }
  };
  vm.createContext(context);
  vm.runInContext(`${source.slice(start, end)}\nthis.run = resolveNewTemplateCode;`, context);
  return { run: context.run, calls };
}

test('new QuickTest uses machine-managed readback and exact create response code', async () => {
  const f = fixture(true);
  const result = await f.run('example-profile', 1, {}, null, { name: 'Test three' }, {}, { quickTestFastPath: true });
  assert.equal(result.templateCode, 'new-code');
  assert.equal(result.identitySource, 'create-response-code-plus-exact-detail-readback');
  assert.deepEqual(f.calls, [['detail', 'new-code', 'new-code'], ['quick', 'new-code']]);
});

test('ordinary plan keeps strict readback', async () => {
  const f = fixture(false);
  await assert.rejects(f.run('example-profile', 1, {}, [], { name: 'Normal' }, {}, { quickTestFastPath: false }), /nie potwierdził go w odczycie/);
  assert.deepEqual(f.calls, [['detail', 'new-code', 'new-code'], ['strict', undefined]]);
});

test('ordinary anomalous list requires a create response code and exact readback', async () => {
  const missing = fixture(false, { responseCode: null });
  await assert.rejects(missing.run('example-profile', 1, {}, null, { name: 'Normal [GM-aaaaaaaaaaaaaaaaaaaaaaaa]' }, {}, { directCodeRequired: true }), /bez jednoznacznego kodu/);
  assert.deepEqual(missing.calls, []);
  const verified = fixture(false, { strictVerified: true });
  const result = await verified.run('example-profile', 1, {}, null, { name: 'Normal [GM-aaaaaaaaaaaaaaaaaaaaaaaa]' }, {}, { directCodeRequired: true });
  assert.equal(result.templateCode, 'new-code');
  assert.equal(result.templateCount, null);
  assert.deepEqual(verified.calls, [['detail', 'new-code', 'new-code'], ['strict', 'new-code']]);
});

test('missing-code create diagnostics disclose only bounded allowlisted paths and types', async () => {
  const secret = 'secret-private-account-token-value';
  const response = { code: 0, message: secret, data: { id: 1425874, templateId: 'template-42', name: secret, actionLibraryList: Array(100).fill({ code: secret }) } };
  const summary = responseShape(response);
  assert.match(summary, /code:number/);
  assert.match(summary, /data\.id:number/);
  assert.match(summary, /data\.templateId:string/);
  assert.match(summary, /data\.actionLibraryList:array/);
  assert.match(summary, /truncated/);
  assert.doesNotMatch(summary, /1425874|template-42|secret-private|name|message/);
  assert.ok(summary.length < 1200);

  const accessor = {};
  Object.defineProperty(accessor, 'data', { enumerable: true, get() { throw new Error('must not invoke getter'); } });
  assert.equal(responseShape(accessor), 'data:accessor');
});

test('fallback replaces a caller supplied GM suffix with a fresh server nonce', () => {
  const start = source.indexOf('function bindUniqueCreateName(');
  const end = source.indexOf('\nconst recoverExpiredSpeedianceSession', start);
  assert.ok(start > 0 && end > start);
  const bind = vm.runInNewContext(`(${source.slice(start, end)})`, { randomBytes: () => Buffer.from('bbbbbbbbbbbbbbbbbbbbbbbb', 'hex') });
  const plan = { name: 'Normal [GM-aaaaaaaaaaaaaaaaaaaaaaaa]' };
  bind(plan);
  assert.equal(plan.name, 'Normal [GM-bbbbbbbbbbbbbbbbbbbbbbbb]');
});

const helperStart = source.indexOf('function verifyCreatedMachineManagedReadback(');
const helperEnd = source.indexOf('\nfunction reconciledProgramCoachNotes(', helperStart);
assert.ok(helperStart > 0 && helperEnd > helperStart);
function verifyFixture(mismatches, unavailable = []) {
  const context = {
    verifyCreatedTemplateReadback: () => ({ verified: false, status: 'mismatch', mismatches, unavailable, warnings: [] })
  };
  vm.createContext(context);
  vm.runInContext(`${source.slice(helperStart, helperEnd)}\nthis.verify = verifyCreatedMachineManagedReadback;`, context);
  return context.verify;
}

test('ordinary mixed plan tolerates machine RM resistance only', () => {
  const verify = verifyFixture([
    { path: 'readback.actionLibraryList[0].weights' },
    { path: 'readback.actionLibraryList[1].weights' }
  ]);
  const actions = [{ templatePresetId: 1 }, { templatePresetId: -1 }];
  const result = verify({ expectedPayload: { actionLibraryList: actions }, readback: { actionLibraryList: actions } });
  assert.equal(result.verified, false);
  assert.deepEqual(Array.from(result.mismatches, row => row.path), ['readback.actionLibraryList[1].weights']);
});

test('ordinary all Smart RM plan tolerates machine capacity but still checks rest', () => {
  const verify = verifyFixture([
    { path: 'readback.totalCapacity' },
    { path: 'readback.actionLibraryList[0].weights' },
    { path: 'readback.actionLibraryList[0].breakTime' }
  ]);
  const actions = [{ templatePresetId: 1 }];
  const result = verify({ expectedPayload: { actionLibraryList: actions }, readback: { actionLibraryList: actions } });
  assert.equal(result.verified, false);
  assert.deepEqual(Array.from(result.mismatches, row => row.path), ['readback.actionLibraryList[0].breakTime']);
});

test('live-shaped Smart RM GET keeps preset and dose verification without treating weights as kg', () => {
  const verify = vm.runInNewContext(`${source.slice(source.indexOf('function verifyQuickTestSavedReadback('), helperEnd)}\nverifyQuickTestSavedReadback`, { verifyCreatedTemplateReadback });
  const specs = [
    { preset: 1, reps: 12, rm: 13, returnedWeight: 29 },
    { preset: 5, reps: 6, rm: 7, returnedWeight: 66 },
    { preset: 3, reps: 15, rm: 17, returnedWeight: 39 }
  ];
  const expectedPayload = { name: 'Test live shape', actionLibraryList: specs.map((spec, index) => ({
    groupId: index + 1, actionLibraryId: index + 101, templatePresetId: spec.preset,
    setsAndReps: String(spec.reps), weights: '3.5', counterweight: String(spec.rm), counterweight2: String(spec.rm),
    breakTime: '60', breakTime2: '60', sportMode: '1', leftRight: '0',
    selectCompletionMethod: '1', completionMethod: '1', countType: '1', level: '0'
  })) };
  const readback = { code: 'live-shaped', name: expectedPayload.name, actionLibraryList: expectedPayload.actionLibraryList.map((action, index) => {
    const row = { ...action, weights: String(specs[index].returnedWeight) };
    delete row.counterweight;
    return row;
  }) };
  const result = verify({ expectedPayload, readback, expectedCode: 'live-shaped' });
  assert.equal(result.verified, true);
  assert.match(result.warnings.join(' '), /ciężary|oporu/);
  const wrongPreset = structuredClone(readback);
  wrongPreset.actionLibraryList[1].templatePresetId = 1;
  assert.equal(verify({ expectedPayload, readback: wrongPreset, expectedCode: 'live-shaped' }).verified, false);
});


// 678: POST customTrainingTemplate zwraca { code: 0, data: '<24 hex>' }.
const extractStart = source.indexOf('function extractUniqueCreateResponseCode(');
const extractEnd = source.indexOf('\n}', extractStart) + 2;
const extractUniqueCreateResponseCode = vm.runInNewContext(`(${source.slice(extractStart, extractEnd).trim()})`);

test('678: kod szablonu jako string w data obok statusu code 0', () => {
  assert.equal(extractUniqueCreateResponseCode({ code: 0, data: '6af4a7dee4b04f0c79a5dea3' }), '6af4a7dee4b04f0c79a5dea3');
  assert.equal(extractUniqueCreateResponseCode({ code: '0', message: 'success', data: '6AF4280AE4B04F0C8153A8A5' }), '6AF4280AE4B04F0C8153A8A5');
  assert.equal(extractUniqueCreateResponseCode({ code: 0, data: 'OK' }), null);
  assert.equal(extractUniqueCreateResponseCode({ code: 0, data: '6af4a7dee4b04f0c79a5dea' }), null);
  assert.throws(() => extractUniqueCreateResponseCode({ code: 0, data: '6af4a7dee4b04f0c79a5dea3', templateCode: '6af4280ae4b04f0c8153a8a5' }), /sprzeczne kody/);
  assert.equal(extractUniqueCreateResponseCode({ data: { code: 'abc' } }), 'abc');
  assert.equal(extractUniqueCreateResponseCode({ code: 0, data: '6af4a7dee4b04f0c79a5dea3', templateCode: '6af4a7dee4b04f0c79a5dea3' }), '6af4a7dee4b04f0c79a5dea3');
  assert.throws(() => extractUniqueCreateResponseCode({ code: 0, data: { templateCode: 'bad code!' } }), /nieprawidłowy kod/);
});

test('678: getter na data nie jest wywoływany przy odczycie kodu z poziomu głównego', () => {
  let called = 0;
  const response = { code: 0 };
  Object.defineProperty(response, 'data', { enumerable: true, get() { called++; return '6af4a7dee4b04f0c79a5dea3'; } });
  assert.equal(extractUniqueCreateResponseCode(response), null);
  assert.ok(called <= 1, 'nowa reguła nie wywołuje gettera');
});

test('678: directCodeRequired i QuickTest używają extractUniqueCreateResponseCode', () => {
  const body = source.slice(start, end);
  assert.match(body, /extractUniqueCreateResponseCode\(createResponse\)/);
  assert.match(body, /quickTestFastPath \|\| directCodeRequired\) && !directCode/);
});

