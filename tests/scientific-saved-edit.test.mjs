import { runWithAccessoryFixture, installAccessoryFixture } from './accessory-empty-store-fixture.mjs';
import { createHash } from 'node:crypto';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { diffSavedEditPayloads, savedEditExecutionDisclosure, assertSavedEditScope, reconcileSavedEditPayload, SAVED_EDIT_CHANGE_CATEGORIES } from '../plugin/saved-edit-diff.mjs';
import { createSavedEditOccurrenceMapping } from '../plugin/saved-plan-identity.mjs';
import { expandPlanForSerialization } from '../plugin/superset-serialization.mjs';

const source = readFileSync(new URL('../plugin/mcp_server.mjs', import.meta.url), 'utf8');
const importedRmPolicyTokens=new Map();
const resolverStart=source.indexOf('function resolveImportedRmPolicy('),resolverEnd=source.indexOf('\n',resolverStart);assert.ok(resolverStart>=0&&resolverEnd>resolverStart);
const resolveImportedRmPolicy=new Function('importedRmPolicyTokens',`return (${source.slice(resolverStart,resolverEnd)});`)(importedRmPolicyTokens);
assert.equal(resolveImportedRmPolicy({},'p','a'.repeat(64)),null);
assert.throws(()=>resolveImportedRmPolicy({importedRmPolicyId:'d'.repeat(48)},'p','a'.repeat(64)),/Fresh account-bound imported RM policy required/);
const start = source.indexOf('        const baseline = buildSavedTemplateUpdatePayload(current, staticLoadContext);', source.indexOf("case 'speediance_update_saved_program':"));
const end = source.indexOf('        let result;', start);
assert.ok(start > 0 && end > start);
const gate = source.slice(start, end);
const helperStart = source.indexOf('async function savedEditOccurrenceContext(');
const helperEnd = source.indexOf('\nasync function updateProgramCoachNoteName', helperStart);
assert.ok(helperStart > 0 && helperEnd > helperStart);
const savedEditOccurrenceContext = runWithAccessoryFixture(`(${source.slice(helperStart, helperEnd).trim()})`, {
  createSavedEditOccurrenceMapping, expandPlanForSerialization,
  savedIdentityAccountFingerprint: () => 'a'.repeat(64),
  readProgramCoachNotes: async () => { throw new Error('Unexpected duplicate identity read in unique fixture.'); }
});

function harness({ changed = true, kind = 'saved-update', mismatch = false, enrichedDigest = false, changedPrescription = false } = {}) {
  const baseline = { id: 7, code: 'old', actionLibraryList: [{ reps: 8 }] };
  const payload = changed ? { ...baseline, actionLibraryList: [{ reps: 8, unknownTechnique: true }] } : baseline;
  const approved = { name: 'Result', actionLibraryList: [{ reps: 12 }] };
  const approval = { kind, profile: 'p', editProgramCode: 'old', editBaseDigest: 'base', expiresAt: Date.now() + 60000,
    profileFingerprint: 'fp', intakeFingerprint: 'intake', digest: 'digest', payload: approved, displayUnit: 'kg', staticLoadContext: { contextDigest: 'protocol' }, editPlanArgs: {} };
  approval.editDiff = diffSavedEditPayloads(baseline, { ...baseline, ...approved });
  approval.editWirePayload = { ...baseline, ...approved };
  approval.allowedChanges = [...SAVED_EDIT_CHANGE_CATEGORIES];
  approval.editOccurrenceMapping = null;
  const writeApprovals = new Map([['edit', approval]]);
  let validations = 0;
  const run = runWithAccessoryFixture(`(async function(args) { let payload = initial; let approvedEditPlan; let approvalEditFingerprint; let staticLoadContext = { contextDigest: 'protocol' }; ${gate} return { payload, approvedEditPlan }; })`, {
    initial: payload, current: { code: 'old' }, profile: 'p', editModes: [], writeApprovals, diffSavedEditPayloads, savedEditExecutionDisclosure, assertSavedEditScope, reconcileSavedEditPayload, savedEditOccurrenceContext,
    buildSavedTemplateUpdatePayload: () => baseline, readProfileConfig: async () => ({ config: {}, password: '' }),
    profileConfigFingerprint: () => 'fp', savedIdentityAccountFingerprint: () => 'a'.repeat(64), cycleHash: value => createHash('sha256').update(JSON.stringify(value)).digest('hex'), readTrainingProfileRecord: async () => null, currentExerciseCatalog: async () => ({}),
    resolveImportedRmPolicy, normalizePlan: () => ({ name: 'Result', ...(enrichedDigest ? { smartRmPresetName: 'Gain Muscle', reps: changedPrescription ? 9 : 8 } : {}) }), validatePlanForProfile: async plan => { validations++; return { plan, intakeFingerprint: 'intake' }; },
    planDigest: (_profile, plan) => enrichedDigest ? plan.smartRmPresetId === 1 && plan.reps === 8 ? 'digest' : 'unprepared-or-changed' : 'digest',
    prepareProgramPayload: async plan => { if (enrichedDigest) plan.smartRmPresetId = 1; return { payload: mismatch ? { ...approved, name: 'Different' } : approved, displayUnit: 'kg', staticLoadContext: { contextDigest: 'protocol' } }; }
  });
  return { run, writeApprovals, validations: () => validations };
}

test('unknown action metadata changes cannot bypass scientific preview', async () => {
  const h = harness();
  await assert.rejects(h.run({ base_digest: 'base' }), /podgl|preview/);
});
test('unchanged training is exempt for rename or no-op', async () => {
  const h = harness({ changed: false });
  await h.run({ base_digest: 'base', name: 'Renamed' });
  assert.equal(h.validations(), 0);
});
test('edit rejects creation approvals and revalidates full result', async () => {
  await assert.rejects(harness({ kind: 'create' }).run({ base_digest: 'base', edit_preview_id: 'edit' }), /preview/);
  const h = harness();
  const result = await h.run({ base_digest: 'base', edit_preview_id: 'edit' });
  assert.equal(h.validations(), 1);
  assert.equal(result.payload.id, 7);
  assert.equal(result.payload.code, 'old');
  assert.equal(result.payload.actionLibraryList[0].reps, 12);
  assert.equal(h.writeApprovals.has('edit'), false);
});
test('result payload mismatch leaves approval unconsumed and blocks write', async () => {
  const h = harness({ mismatch: true });
  await assert.rejects(h.run({ base_digest: 'base', edit_preview_id: 'edit' }), /Payload/);
  assert.equal(h.writeApprovals.has('edit'), true);
});

test('actual saved-edit gate prepares server-owned RM fields before digest and still blocks changed prescription', async () => {
  const valid = harness({ enrichedDigest: true }); await valid.run({ base_digest: 'base', edit_preview_id: 'edit' });
  assert.equal(valid.writeApprovals.has('edit'), false);
  const changed = harness({ enrichedDigest: true, changedPrescription: true });
  await assert.rejects(changed.run({ base_digest: 'base', edit_preview_id: 'edit' }), /Plan zmienił/);
  assert.equal(changed.writeApprovals.has('edit'), true);
});
test('scientific gate precedes mutation and legacy approval cannot approve edits', () => {
  assert.ok(end < source.indexOf("result = await speedianceApiRequest(profile, '/app/v2/customTrainingTemplate'", start));
  const route = source.slice(source.indexOf('async function handleApprovalRequest'), source.indexOf('function setupPage'));
  assert.match(route, /approval.kind === 'saved-update'/);
});

function vitaGate({ change = 'rest', includeMetadata = true } = {}) {
  const baseline = { id: 7, code: 'old', name: 'Vita', actionLibraryList: [{
    groupId: 49, actionLibraryId: 149, templatePresetId: -1, weights: '0,0',
    setsAndReps: '30,8', completionMethod: '5,1', countType: '5,1',
    level: '12,27', breakTime: '45,90', breakTime2: '45,90',
  }] };
  const approved = structuredClone(baseline);
  approved.actionLibraryList[0].completionMethod = '2,1'; approved.actionLibraryList[0].countType = '2,1';
  if (change === 'load') approved.actionLibraryList[0].level = '13,27';
  else { approved.actionLibraryList[0].breakTime = '60,90'; approved.actionLibraryList[0].breakTime2 = '60,90'; }
  if (change === 'dose') approved.actionLibraryList[0].setsAndReps = '31,8';
  const confirmed = { contextDigest: 'protocol', exerciseMetadataByAction: new Map([['49:149', { dataStatTypeStatus: 'available', dataStatType: 6 }]]) };
  const refreshedContext = includeMetadata ? confirmed : { contextDigest: 'protocol' };
  const approval = { kind: 'saved-update', profile: 'p', editProgramCode: 'old', editBaseDigest: 'base', expiresAt: Date.now() + 60000,
    profileFingerprint: 'fp', intakeFingerprint: 'intake', digest: 'digest', payload: approved, displayUnit: 'kg', staticLoadContext: confirmed,
    editPlanArgs: {}, editOccurrenceMapping: null, editDiff: diffSavedEditPayloads(baseline, approved, confirmed), editWirePayload: approved, allowedChanges: [change === 'load' ? 'load' : 'rest'] };
  const writeApprovals = new Map([['edit', approval]]);
  const run = runWithAccessoryFixture(`(async function(args) { let payload = initial; let approvedEditPlan; let approvalEditFingerprint; let staticLoadContext = context; ${gate} return { payload }; })`, {
    initial: baseline, context: confirmed, current: { code: 'old' }, profile: 'p', editModes: [], writeApprovals,
    diffSavedEditPayloads, savedEditExecutionDisclosure, assertSavedEditScope, reconcileSavedEditPayload, savedEditOccurrenceContext, buildSavedTemplateUpdatePayload: () => baseline,
    readProfileConfig: async () => ({ config: {}, password: '' }), profileConfigFingerprint: () => 'fp', savedIdentityAccountFingerprint: () => 'a'.repeat(64),
    cycleHash: value => createHash('sha256').update(JSON.stringify(value)).digest('hex'), readTrainingProfileRecord: async () => null, currentExerciseCatalog: async () => ({}), resolveImportedRmPolicy, normalizePlan: () => ({ name: 'Vita' }),
    validatePlanForProfile: async plan => ({ plan, intakeFingerprint: 'intake' }), planDigest: () => 'digest',
    prepareProgramPayload: async () => ({ payload: approved, displayUnit: 'kg', staticLoadContext: refreshedContext }),
  });
  return { run: () => run({ base_digest: 'base', edit_preview_id: 'edit' }), writeApprovals };
}

test('actual scientific saved-edit gate forwards confirmed Vita metadata for rest/load-only scope', async () => {
  for (const change of ['rest', 'load']) {
    const h = vitaGate({ change }); const result = await h.run();
    assert.equal(result.payload.actionLibraryList[0].completionMethod, '2,1');
    assert.equal(h.writeApprovals.has('edit'), false);
  }
});

test('actual scientific saved-edit gate rejects altered Vita dose and missing fresh metadata', async () => {
  const dose = vitaGate({ change: 'dose' }); await assert.rejects(dose.run(), /dose/); assert.equal(dose.writeApprovals.has('edit'), true);
  const missing = vitaGate({ includeMetadata: false }); await assert.rejects(missing.run(), /Zakres|dose/); assert.equal(missing.writeApprovals.has('edit'), true);
});

