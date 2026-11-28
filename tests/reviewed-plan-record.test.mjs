import { assertSavedPresentationArguments, presentSavedRead } from '../plugin/saved-presentation.mjs';
import { normalizePreferenceReviews, preferenceReviewsSchema } from '../plugin/preference-compliance.mjs';
import { runWithRecoveryFixture } from './recovery-fixture.mjs';
import { normalizeRecoveryContextDeclaration } from '../plugin/recovery-context.mjs';
import test from 'node:test';
import { resolvePercent1RMSet } from '../plugin/percent-1rm.mjs';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import * as payloadFunctions from '../plugin/program-payload.mjs';
import { normalizeExerciseEntry, validateExecutablePlanSections } from '../plugin/executable-plan-sections.mjs';
import { buildPresetPayload } from '../plugin/program-serialization.mjs';
import { buildSavedTemplateUpdatePayload, savedTemplateDigest, verifyUpdatedTemplateReadback, getSavedTemplateId, applySmartRmConversions, applyReferenceClientResistanceModeUpdates } from '../plugin/saved-templates.mjs';
import { getReferenceClientRmPresetByName } from '../plugin/preset-mapping.mjs';
import { reconcileSavedEditPayload, diffSavedEditPayloads, savedEditExecutionDisclosure, assertSavedEditScope } from '../plugin/saved-edit-diff.mjs';
import { expandPlanForSerialization } from '../plugin/superset-serialization.mjs';
import { createSavedPlanIdentity } from '../plugin/saved-plan-identity.mjs';
import { snapshotNormalizedPlan, createReviewedPlanRecord, inspectReviewedPlanRecord } from '../plugin/reviewed-plan-record.mjs';
import { applyDeloadLoadPolicy, DELOAD_CUSTOMIZE_WEIGHT_REQUIRED } from '../plugin/deload-load-policy.mjs';

function fixture() {
  const accountFingerprint = 'a'.repeat(64);
  const exercise = { id: 42, entryId: 101, actionLibraryId: 7, section: 'main', title: 'Bodyweight exercise', loadType: 'bodyweight', sets: [{ reps: 8, unit: 'reps', weightKg: undefined, mode: 1, rest: 90 }] };
  Object.defineProperty(exercise, 'fixedKgAuthorized', {value: false});
  const plan = { name: 'Reviewed plan', exercises: [exercise], evidence: [{ id: 'source' }], decisionEvidence: [{ category: 'exercise_selection' }], warmup: { status: 'omitted_user_preference', items: [] }, postWorkoutStretching: { status: 'omitted_user_preference', items: [] } };
  const metadataById = new Map([[42, {batch: {actionLibraryList: [{id: 7}]}, detail: {isLeftRight: 0, isBarbell: 0}}]]);
  const payload = buildPresetPayload(plan, metadataById, 1, 'kg').payload;
  const wire = {...structuredClone(payload), id: 1001, code: 'template-1'};
  const context = {metadataById, deviceType: 1, displayUnit: undefined, staticLoadContext: {}};
  const args = { ...context, pluginVersion: '1.0.98', reviewedAt: '2026-10-03T12:00:00.000Z', accountFingerprint, intakeFingerprint: 'b'.repeat(64), staticContextDigest: 'c'.repeat(64), templateCode: wire.code, plan, verifiedReadback: wire, savedPlanIdentity: createSavedPlanIdentity(plan, [{ exercise }], buildSavedTemplateUpdatePayload(wire), accountFingerprint) };
  const current = { ...context, currentWirePayload: wire, accountFingerprint, intakeFingerprint: args.intakeFingerprint, staticContextDigest: args.staticContextDigest, templateCode: wire.code };  return { args, current };
}

for (const scenario of ['dose', 'rest', 'resistance_mode', 'dose+rest', 'dose+name', 'dose+resistance_mode', 'dose+rest+name+resistance_mode', 'smart_rm_conversion', 'resistance_mode_updates']) test(`actual saved preview/commit persists v2 reviewed RM provenance (${scenario})`, async () => {
  const scope = scenario === 'smart_rm_conversion' ? 'load' : scenario === 'resistance_mode_updates' ? 'resistance_mode' : scenario;
  const scopes = scope.split('+');
  const isConversion = scenario === 'smart_rm_conversion';
  const { args: original } = fixture();
  const plan = original.plan, exercise = plan.exercises[0];
  Object.assign(exercise, { loadType: 'smart-rm', smartRmPresetName: 'Gain Muscle', smartRmPresetId: 1 });
  exercise.sets = [8, 8].map(reps => ({ unit: 'reps', reps, rmLevel: 13, rirTarget: 2, mode: 1, rest: 90 }));
  // Smart RM always carries a percent: the resulting plan of a conversion test carries the same resolved percent (reps 8 + RIR 2 -> level 10, 75%).
  if (isConversion) for (const set of exercise.sets) { set.percentResolved = resolvePercent1RMSet({ reps: set.reps, rirTarget: 2, presetName: 'Gain Muscle' }); set.rmLevel = set.percentResolved.rmLevel; }
  const context = { contextDigest: original.staticContextDigest, staticLoadProtocol: 'legacy-reference-client-wire-lb-get-kg' };
  const oldPayload = buildPresetPayload(plan, original.metadataById, 1, undefined, context).payload;
  const current = { ...structuredClone(oldPayload), id: 1001, code: original.templateCode };
  Object.assign(current.actionLibraryList[0], { counterweight: '12,11', counterweight2: '12,11', capacity: 77 }); current.totalCapacity = 77;
  if (isConversion) Object.assign(current.actionLibraryList[0], { templatePresetId: -1, weights: '8,9', counterweight: '', counterweight2: '' });
  if (scopes.includes('dose')) exercise.sets[0].reps = 9;
  if (scopes.includes('rest')) exercise.sets[0].rest = 100;
  if (scopes.includes('resistance_mode')) exercise.sets[0].mode = 2;
  if (scopes.includes('name')) plan.name = 'Updated reviewed plan';
  const generated = buildPresetPayload(plan, original.metadataById, 1, undefined, context).payload;
  const source = readFileSync(new URL('../plugin/mcp_server.mjs', import.meta.url), 'utf8');
  const approval = { plan, payload: generated, staticLoadContext: context, displayUnit: undefined, profile: 'synthetic', profileFingerprint: original.accountFingerprint, intakeFingerprint: original.intakeFingerprint, digest: 'plan-digest', expiresAt: Date.now() + 60000 };
  const writeApprovals = new Map([['edit', approval]]);
  let posts = 0, posted, stored, readinessChecks = 0;
  const baseDigest = savedTemplateDigest(current);
  const helperStart = source.indexOf('async function validateSavedProgramPreviewPatch(');
  const helperEnd = source.indexOf('\nasync function deleteProgramCoachNote', helperStart);
  assert.ok(helperStart > 0 && helperEnd > helperStart);
  const validatePatch = runWithRecoveryFixture(`(${source.slice(helperStart, helperEnd).trim()})`, {
    applySmartRmConversions, applyReferenceClientResistanceModeUpdates, getReferenceClientRmPresetByName, structuredClone,
    buildSavedTemplateUpdatePayload, reconcileSavedEditPayload, diffSavedEditPayloads,
    cycleHash: value => createHash('sha256').update(JSON.stringify(value)).digest('hex'), readTrainingProfileRecord: async () => ({ profileData: { primaryGoal: 'hypertrophy' } }),
    currentExerciseCatalog: async () => ({ exerciseRecordsById: new Map() }),
    validateChangedTemplateExercises: async () => { readinessChecks++; }
  });
  const patch = isConversion ? { primary_goal: 'hypertrophy', smart_rm_conversion: [{ groupId: 42, actionLibraryId: 7, smartRmPresetName: 'Gain Muscle', sets: [{ unit: 'reps', reps: 8, rirTarget: 2 }, { unit: 'reps', reps: 8, rirTarget: 2 }] }] }
    : scenario === 'resistance_mode_updates' ? { resistance_mode_updates: [{ groupId: 42, actionLibraryId: 7, modes: [2, 1] }] } : {};
  const services = { current, approval, writeApprovals, profile: 'synthetic', config: { deviceType: 1 }, structuredClone, validateSavedProgramPreviewPatch: validatePatch, buildSavedTemplateUpdatePayload, reconcileSavedEditPayload, diffSavedEditPayloads, savedEditExecutionDisclosure, assertSavedEditScope, savedEditOccurrenceContext: async (_profile, _current, _baseline, _plan, _generated, _config, ctx) => ctx };
  const previewStart = source.indexOf('      let editDiff;', source.indexOf("case 'speediance_preview_saved_program_update':"));
  const previewEnd = source.indexOf('      return { ...result, editPreviewId:', previewStart);
  const preview = runWithRecoveryFixture(`async args => { ${source.slice(previewStart, previewEnd)} }`, { ...services, result: { previewId: 'edit' } });
  const previewArgs = { ...patch, program_code: current.code, base_digest: baseDigest, allowed_changes: scopes };
  if (isConversion) {
    const bad = structuredClone(previewArgs); bad.smart_rm_conversion[0].sets[0].rirTarget = 3;
    await assert.rejects(preview(bad), /preserve explicitly supplied conversion RIR/);
    assert.equal(posts, 0); assert.equal(writeApprovals.has('edit'), false);
    writeApprovals.set('edit', approval);
  }
  await preview(previewArgs);
  // A conversion is written like the app: counterweight absent, counterweight2 = percent-table level (reps 8 + RIR 2 = 10), percent1rmStr per set.
  const expectedSelectors = isConversion ? '' : '12,11';
  assert.equal(approval.editWirePayload.actionLibraryList[0].counterweight, expectedSelectors);
  if (isConversion) { assert.equal(approval.editWirePayload.actionLibraryList[0].counterweight2, '10,10'); assert.equal(approval.editWirePayload.actionLibraryList[0].percent1rmStr, '75,75'); }
  if (Object.keys(patch).length) assert.deepEqual(JSON.parse(JSON.stringify(approval.editPatch)), patch);
  const commitStart = source.indexOf('        const baseline = buildSavedTemplateUpdatePayload(current, staticLoadContext);', source.indexOf("case 'speediance_update_saved_program':"));
  const commitEnd = source.indexOf('\n      });', commitStart);
  assert.ok(commitStart > 0 && commitEnd > commitStart);
  const commit = runWithRecoveryFixture(`async args => { let payload = initial; let staticLoadContext = context; let approvedEditPlan; let approvedEditReviewContext; let approvalEditFingerprint; let smartRmConversionSummary; let resistanceModeUpdateSummary; ${source.slice(commitStart, commitEnd)} }`, {
    ...services, initial: generated, context, editModes: [], verifyUpdatedTemplateReadback, getSavedTemplateId, expandPlanForSerialization, createSavedPlanIdentity,
    readProfileConfig: async () => ({ config: { deviceType: 1 }, password: '' }), profileConfigFingerprint: () => original.accountFingerprint, savedIdentityAccountFingerprint: () => original.accountFingerprint,
    cycleHash: value => createHash('sha256').update(JSON.stringify(value)).digest('hex'), readTrainingProfileRecord: async () => null, currentExerciseCatalog: async () => null, normalizePlan: () => structuredClone(plan),
    validatePlanForProfile: async value => ({ plan: value, intakeFingerprint: original.intakeFingerprint }), planDigest: () => 'plan-digest',
    prepareProgramPayload: async () => ({ payload: generated, displayUnit: undefined, staticLoadContext: context, metadataById: original.metadataById }),
    speedianceApiRequest: async (_profile, endpoint, request) => { assert.equal(endpoint, '/app/v2/customTrainingTemplate'); assert.equal(request.method, 'POST'); posts++; posted = structuredClone(request.body); return { code: 0 }; },
    getSavedTemplateByCode: async () => structuredClone(posted), readProgramCoachNotes: async () => ({ programs: {} }), saveProgramCoachNote: async () => {},
    createReviewedPlanRecord: value => createReviewedPlanRecord({ ...value, savedEdit: JSON.parse(JSON.stringify(value.savedEdit)) }),
    writeReviewedPlanRecord: async (_dir, code, record) => { assert.equal(code, current.code); stored = record; }, profilePaths: () => ({ dir: 'synthetic-no-files' }), PLUGIN_VERSION: '1.0.179'
  });
  const commitArgs = { edit_preview_id: 'edit', base_digest: baseDigest };
  if (isConversion) {
    const good = approval.editPlanArgs;
    const bad = structuredClone(good); bad.smart_rm_conversion[0].sets[0].rirTarget = 3;
    approval.editPlanArgs = bad;
    await assert.rejects(commit(commitArgs), /preserve explicitly supplied conversion RIR/);
    assert.equal(posts, 0); assert.equal(stored, undefined);
    approval.editPlanArgs = good;
  }
  const result = await commit(commitArgs);
  assert.equal(posts, 1); assert.equal(result.verified, true); assert.equal(result.reviewedPlanRecordSaved, true);
  assert.equal(stored.version, 2); assert.equal(stored.plan.exercises[0].sets[0].rmLevel, isConversion ? 10 : 13);
  assert.equal(Object.isFrozen(stored.savedEdit), true); assert.equal(Object.isFrozen(stored.savedEdit.baselineTemplate.actionLibraryList), true);
  assert.equal(stored.expectedPayload.actionLibraryList[0].counterweight, expectedSelectors);
  assert.equal(posted.actionLibraryList[0].counterweight, expectedSelectors);
  if (scopes.includes('dose')) {
    assert.equal(posted.actionLibraryList[0].setsAndReps, '9,8');
    assert.equal(posted.actionLibraryList[0].capacity, 431.2);
    assert.equal(posted.totalCapacity, 431.2);
  }
  if (scopes.includes('rest')) assert.equal(posted.actionLibraryList[0].breakTime, '100,90');
  if (scopes.includes('resistance_mode')) assert.equal(posted.actionLibraryList[0].sportMode, '2,1');
  if (scopes.includes('name')) assert.equal(posted.name, 'Updated reviewed plan');
  if (Object.keys(patch).length) assert.ok(readinessChecks >= 2);
  if (scenario === 'resistance_mode_updates') assert.equal(posted.actionLibraryList[0].sportMode, '2,1');
  if (isConversion) assert.deepEqual(stored.plan.exercises[0].sets.map(set => set.rirTarget), [2, 2]);
  const inspection = { record: stored, currentWirePayload: posted, accountFingerprint: original.accountFingerprint, intakeFingerprint: original.intakeFingerprint, staticContextDigest: original.staticContextDigest, templateCode: current.code, metadataById: original.metadataById, deviceType: 1, displayUnit: undefined, staticLoadContext: context };
  assert.equal(inspectReviewedPlanRecord(inspection).status, 'historical-review-matched');
  for (const mutate of [
    record => { record.savedEdit.finalWirePayload.actionLibraryList[0].counterweight = isConversion ? '12,12' : '13,13'; },
    record => { record.savedEdit.finalWirePayload.actionLibraryList[0].setsAndReps = '10,8'; },
    record => { record.savedEdit.finalWirePayload.actionLibraryList[0].capacity += 1; },
    record => { record.savedEdit.baselineTemplate.actionLibraryList[0].counterweight = '11,10'; record.savedEdit.baselineTemplate.actionLibraryList[0].counterweight2 = '11,10'; record.savedEdit.baseDigest = savedTemplateDigest(record.savedEdit.baselineTemplate); },
    record => { record.savedEdit.baselineTemplate.actionLibraryList[0].counterweight = '10,10'; },
    record => { record.savedEdit.allowedChanges = isConversion ? ['rest'] : ['load']; },
    record => { record.savedEdit.baseDigest = 'd'.repeat(64); },
    record => { record.savedEdit.occurrenceMapping = { accountFingerprint: 'd'.repeat(64) }; }
  ]) {
    const changed = structuredClone(stored); mutate(changed);
    assert.equal(inspectReviewedPlanRecord({ ...inspection, record: changed }).status, 'invalid');
  }
  for (const alter of [
    record => { record.savedEdit.finalWirePayload.actionLibraryList[0].counterweight = isConversion ? '12,12' : '13,13'; },
    record => { record.savedEdit.finalWirePayload.actionLibraryList[0].capacity += 1; },
    record => { record.savedEdit.allowedChanges = ['rest']; },
    record => { record.savedEdit.occurrenceMapping = { accountFingerprint: 'd'.repeat(64) }; }
  ]) {
    if (scope === 'rest' && String(alter).includes("['rest']")) continue;
    const changed = structuredClone(stored); alter(changed);
    const { provenanceDigest, ...bound } = changed.savedEdit;
    changed.savedEdit.provenanceDigest = createHash('sha256').update(JSON.stringify(bound)).digest('hex');
    assert.equal(inspectReviewedPlanRecord({ ...inspection, record: changed }).status, 'invalid', 'Actual regeneration/account/scope validation must reject even when the provenance checksum is recomputed.');
  }
  assert.equal(inspectReviewedPlanRecord({ ...inspection, staticLoadContext: { ...context, contextDigest: 'd'.repeat(64) } }).status, 'invalid');
  const contextGetter = { ...context }; Object.defineProperty(contextGetter, 'contextDigest', { enumerable: true, get() { throw new Error('must not execute context getter'); } });
  assert.equal(inspectReviewedPlanRecord({ ...inspection, staticLoadContext: contextGetter }).status, 'invalid');
  const getter = structuredClone(stored); Object.defineProperty(getter.savedEdit, 'baselineTemplate', { enumerable: true, get() { throw new Error('must not execute'); } });
  assert.equal(inspectReviewedPlanRecord({ ...inspection, record: getter }).status, 'invalid');
  const oversized = structuredClone(stored); oversized.savedEdit.extra = 'x'.repeat(1_000_001);
  assert.equal(inspectReviewedPlanRecord({ ...inspection, record: oversized }).status, 'invalid');
  const sparse = structuredClone(stored); sparse.savedEdit.allowedChanges = Array(100);
  assert.equal(inspectReviewedPlanRecord({ ...inspection, record: sparse }).status, 'invalid');
  const inherited = structuredClone(stored); Object.setPrototypeOf(inherited.savedEdit, { fake: true });
  assert.equal(inspectReviewedPlanRecord({ ...inspection, record: inherited }).status, 'invalid');
});

test('durable matching record never grants scientific approval and clones exact plan', () => {
  const { args, current } = fixture();
  const record = createReviewedPlanRecord(args);
  assert.equal(record.plan.exercises[0].fixedKgAuthorized, false);
  assert.equal(Object.hasOwn(record.plan.exercises[0].sets[0], 'weightKg'), false);
  args.plan.exercises[0].sets[0].reps = 12;
  assert.equal(record.plan.exercises[0].sets[0].reps, 8);
  assert.deepEqual(inspectReviewedPlanRecord({ record: JSON.parse(JSON.stringify(record)), ...current }), { status: 'historical-review-matched', scientificApproval: false, requiresFreshScientificReview: true });
});

test('review snapshots retain validated session limits and omit unknown limits without rewriting legacy records', () => {
  for (const limit of [10, 45, 240, undefined]) {
    const { args, current } = fixture();
    args.plan.confirmedSessionMinutes = limit;
    const record = createReviewedPlanRecord(args);
    assert.equal(Object.hasOwn(record.plan, 'confirmedSessionMinutes'), limit !== undefined);
    if (limit !== undefined) assert.equal(record.plan.confirmedSessionMinutes, limit);
    assert.equal(inspectReviewedPlanRecord({ record, ...current }).status, 'historical-review-matched');
  }
  const { args, current } = fixture();
  const legacy = createReviewedPlanRecord(args);
  const before = JSON.stringify(legacy);
  assert.equal(inspectReviewedPlanRecord({ record: legacy, ...current }).status, 'historical-review-matched');
  assert.equal(JSON.stringify(legacy), before);
  for (const invalid of [9, 241, 45.5, '45', null, true]) {
    assert.throws(() => createReviewedPlanRecord({ ...args, plan: { ...args.plan, confirmedSessionMinutes: invalid } }), /confirmed session minutes/);
  }
});

test('review record preserves explicit deload intent, cycle and Smart RM override provenance', () => {
  const { args, current } = fixture();
  const plan = args.plan;
  plan.isDeload = true;
  plan.cycleContext = { week: 6, deloadWeek: 6 };
  plan.deloadLoadOverride = 'smart-rm';
  const exercise = plan.exercises[0];
  Object.assign(exercise, { loadType: 'smart-rm', smartRmPresetName: 'Gain Muscle', smartRmPresetId: 1 });
  exercise.sets = [{ unit: 'reps', reps: 8, rmLevel: 13, rirTarget: 2, mode: 1, rest: 90 }];
  const payload = buildPresetPayload(plan, args.metadataById, 1, 'kg').payload;
  args.verifiedReadback = { ...structuredClone(payload), id: 1001, code: args.templateCode };
  args.savedPlanIdentity = createSavedPlanIdentity(plan, [{ exercise }], buildSavedTemplateUpdatePayload(args.verifiedReadback), args.accountFingerprint);
  const record = createReviewedPlanRecord(args);
  assert.equal(record.plan.isDeload, true);
  assert.deepEqual(record.plan.cycleContext, { week: 6, deloadWeek: 6 });
  assert.equal(record.plan.deloadLoadOverride, 'smart-rm');
  assert.equal(inspectReviewedPlanRecord({ ...current, currentWirePayload: args.verifiedReadback, record }).status, 'historical-review-matched');
  assert.equal(inspectReviewedPlanRecord({ ...current, currentWirePayload: args.verifiedReadback, record }).scientificApproval, false);
});

test('reviewed deload metadata is exact, bounded and rejects invalid intent without weakening hidden-field checks', () => {
  const { args } = fixture();
  assert.equal(Object.hasOwn(snapshotNormalizedPlan(args.plan), 'isDeload'), false);
  for (const cycleContext of [null, {}, { week: 6 }, { week: 0, deloadWeek: 6 }, { week: 6, deloadWeek: 105 }, { week: 6, deloadWeek: 6, source: 'user' }]) {
    assert.throws(() => snapshotNormalizedPlan({ ...args.plan, cycleContext }), /Invalid reviewed deload cycle context/);
  }
  assert.throws(() => snapshotNormalizedPlan({ ...args.plan, isDeload: 'true' }), /Invalid reviewed deload intent/);
  assert.throws(() => snapshotNormalizedPlan({ ...args.plan, deloadLoadOverride: 'fixed-kg' }), /Invalid reviewed deload override provenance/);
  assert.throws(() => snapshotNormalizedPlan({ ...args.plan, deloadLoadOverride: 'smart-rm' }), /Invalid reviewed deload override provenance/);
  assert.throws(() => snapshotNormalizedPlan({ ...args.plan, isDeload: false, cycleContext: { week: 6, deloadWeek: 6 } }), /does not preserve deload intent/);
  const hiddenCycle = { week: 6, deloadWeek: 6 };
  Object.defineProperty(hiddenCycle, 'extra', { value: 'secret', enumerable: false });
  assert.throws(() => snapshotNormalizedPlan({ ...args.plan, cycleContext: hiddenCycle }), /accessors and hidden fields/);
});

test('readback dose must match actual serialization before an identity record is accepted', () => {
  for (const [field, value] of [['setsAndReps', '9'], ['breakTime', '91'], ['sportMode', '3'], ['completionMethod', '2'], ['setsAndReps', '8,8']]) {
    const { args, current } = fixture();
    const record = createReviewedPlanRecord(args);
    const changed = structuredClone(args.verifiedReadback);
    changed.actionLibraryList[0][field] = value;
    assert.throws(() => createReviewedPlanRecord({...args, verifiedReadback: changed}), /readback/);
    assert.equal(inspectReviewedPlanRecord({record, ...current, currentWirePayload: changed}).status, 'invalid');
  }
});

test('fresh metadata is required and altered metadata cannot silently change reviewed output', () => {
  const {args, current} = fixture();
  const record = createReviewedPlanRecord(args);
  assert.throws(() => createReviewedPlanRecord({...args, metadataById: undefined}), /Fresh metadata/);
  const metadataById = new Map([[42, {batch: {actionLibraryList: [{id: 7}]}, detail: {isLeftRight: 1, isBarbell: 0}}]]);
  assert.equal(inspectReviewedPlanRecord({record, ...current, metadataById}).status, 'invalid');
});

test('Smart RM keeps machine preset and optional normalized fields without invented kg', () => {
  const {args, current} = fixture();
  const exercise = args.plan.exercises[0];
  exercise.loadType = 'smart-rm';
  exercise.smartRmPresetName = 'Gain Muscle';
  exercise.smartRmPresetId = 1;
  exercise.sets[0].rmLevel = 13;
  const payload = buildPresetPayload(args.plan, args.metadataById, 1, 'kg').payload;
  args.verifiedReadback = {...structuredClone(payload), id: 1001, code: args.templateCode};
  args.savedPlanIdentity = createSavedPlanIdentity(args.plan, [{exercise}], buildSavedTemplateUpdatePayload(args.verifiedReadback), args.accountFingerprint);
  const record = createReviewedPlanRecord(args);
  assert.equal(record.expectedPayload.actionLibraryList[0].templatePresetId, 1);
  assert.equal(inspectReviewedPlanRecord({record, ...current, currentWirePayload: args.verifiedReadback}).status, 'historical-review-matched');
});

test('changed account intake context template and wire invalidate a review', () => {
  const { args, current } = fixture();
  const record = createReviewedPlanRecord(args);
  for (const field of ['accountFingerprint', 'intakeFingerprint', 'staticContextDigest']) assert.equal(inspectReviewedPlanRecord({ record, ...current, [field]: 'd'.repeat(64) }).status, 'stale');
  assert.equal(inspectReviewedPlanRecord({ record, ...current, templateCode: 'other' }).status, 'stale');
  assert.equal(inspectReviewedPlanRecord({ record, ...current, currentWirePayload: { ...current.currentWirePayload, actionLibraryList: [{ ...current.currentWirePayload.actionLibraryList[0], weights: '10' }] } }).status, 'invalid');
});

test('tampered plans evidence and identity mismatches fail closed', () => {
  for (const code of ['bad code', '../plugin/bad/code', 'x'.repeat(129), '', ' template-1']) {
    const { args } = fixture(); args.templateCode = code;
    assert.throws(() => createReviewedPlanRecord(args));
  }
  for (const alter of [args => { args.plan.evidence = []; }, args => { args.plan.decisionEvidence = []; }, args => { args.plan.exercises[0].actionLibraryId = 8; }, args => { args.templateCode = 'other'; }, args => { args.reviewedAt = 'yesterday'; }]) {
    const { args } = fixture(); alter(args);
    assert.throws(() => createReviewedPlanRecord(args));
  }
  const { args, current } = fixture();
  const record = createReviewedPlanRecord(args); record.plan.exercises[0].sets[0].reps = 9;
  assert.equal(inspectReviewedPlanRecord({ record, ...current }).status, 'invalid');
});

test('private fields are rejected recursively without invoking accessors', () => {
  for (const key of ['password', 'accessToken', 'email', 'credentials', 'intakeAnswers']) {
    const { args } = fixture(); args.plan[key] = 'private';
    assert.throws(() => createReviewedPlanRecord(args), /private/);
  }
  const { args } = fixture();
  Object.defineProperty(args.plan, 'getter', { enumerable: true, get() { throw new Error('getter executed'); } });
  assert.throws(() => createReviewedPlanRecord(args), /accessors/);
});

test('nonfinite cyclic sparse overdeep and oversized data are rejected', () => {
  let deep = {};
  for (let i = 0; i < 21; i++) deep = { nested: deep };
  const cycle = {}; cycle.self = cycle;
  for (const extra of [NaN, undefined, Array(2), cycle, deep, 'x'.repeat(1_000_001), Array.from({ length: 50_001 }, () => 1)]) {
    const { args } = fixture(); args.plan.extra = extra;
    assert.throws(() => createReviewedPlanRecord(args));
  }
});


test('rename-only preserves historical prescription but never grants approval', () => {
  const {args, current} = fixture();
  const record = createReviewedPlanRecord(args);
  const renamed = {...current.currentWirePayload, name: 'Renamed program'};
  assert.equal(inspectReviewedPlanRecord({record, ...current, currentWirePayload: renamed}).status, 'historical-review-matched');
  assert.equal(inspectReviewedPlanRecord({record, ...current, currentWirePayload: renamed}).scientificApproval, false);
  assert.throws(() => createReviewedPlanRecord({...args, verifiedReadback: renamed}), /readback/);
  renamed.actionLibraryList = structuredClone(renamed.actionLibraryList);
  renamed.actionLibraryList[0].setsAndReps = '9';
  assert.equal(inspectReviewedPlanRecord({record, ...current, currentWirePayload: renamed}).status, 'invalid');
});

const serverSource = readFileSync(new URL('../plugin/mcp_server.mjs', import.meta.url), 'utf8');
const normalizeStart = serverSource.indexOf('function normalizePlan(');
const normalizeEnd = serverSource.indexOf('\nfunction assertQuickTestProgramShape', normalizeStart);
assert.ok(normalizeStart >= 0 && normalizeEnd > normalizeStart);
const normalizeStaticPlan = runWithRecoveryFixture(`(${serverSource.slice(normalizeStart, normalizeEnd).trim()})`, {
  applyDeloadLoadPolicy, DELOAD_CUSTOMIZE_WEIGHT_REQUIRED,
  ...payloadFunctions, normalizeRecoveryContextDeclaration, normalizePreferenceReviews,
  classifyPrescriptionUnit: unit => ['sec', 'seconds'].includes(unit) ? 'seconds' : 'reps',
  normalizeExerciseEntry, validateExecutablePlanSections,
  normalizeTrainingEvidence: (rationale, evidence) => ({rationale, evidence}),
  resolveProfileStrengthAnchor: ({providedAnchor}) => providedAnchor,
  isSupportedCustomizeAnchorSource: source => source === 'speediance-reported',
  isWritableResistanceMode: mode => [1, 2, 3].includes(mode),
  normalizeSupersetBlocks: () => [],
  normalizeEvidencePlanItems: (warmup, postWorkoutStretching) => ({warmup, postWorkoutStretching}),
  normalizeEvidenceCoverage: (_evidence, decisionEvidence) => decisionEvidence,
  assertNoUnserializedTechniqueInstructions: () => {}
});

function staticFixture(loadType, displayUnit) {
  const {args} = fixture();
  const input = {
    name: 'Static reviewed prescription', recoveryContext: {status:'not_requested',limitations:['Synthetic fixture uses no reported health data.']}, rationale: 'Synthetic regression only',
    evidence: [{id: 'synthetic-source'}], decisionEvidence: [{category: 'exercise_selection'}],
    warmup: args.plan.warmup, postWorkoutStretching: args.plan.postWorkoutStretching,
    exercises: [{id: 42, entryId: 101, actionLibraryId: 7, section: 'main', title: 'Confirmed resisted exercise', loadType,
      ...(loadType === 'profile-auto' ? {userRequestedReferenceClientCustomize: true, strengthAnchor: {oneRepMax: 100, unit: displayUnit, source: 'speediance-reported'}} : {userRequestedFixedKg: true}),
      sets: [8, 12].map(reps => ({unit: 'reps', reps, rirTarget: 2, mode: 1, restSeconds: 90, ...(loadType === 'fixed-kg' ? {weightKg: 35} : {})}))}]
  };
  const normalized = normalizeStaticPlan(input);
  // VM objects have foreign prototypes. Move to this realm without changing the
  // real normalized fields, restoring its intentional nonenumerable permission.
  args.plan = structuredClone(normalized);
  Object.defineProperty(args.plan.exercises[0], 'fixedKgAuthorized', {value: normalized.exercises[0].fixedKgAuthorized});
  args.displayUnit = displayUnit;
  args.staticLoadContext = {staticLoadProtocol: 'legacy-reference-client-wire-lb-get-kg'};
  const payload = buildPresetPayload(args.plan, args.metadataById, 1, displayUnit, args.staticLoadContext).payload;
  // Confirmed legacy reference client POST lb / GET kg contract, as in the existing
  // static-protocol-saved-roundtrip regressions. This is synthetic, not firmware proof.
  args.verifiedReadback = {...structuredClone(payload), id: 1001, code: args.templateCode};
  for (const action of args.verifiedReadback.actionLibraryList) action.weights = action.weights.split(',').map(weight => Number(weight) / 2.2).join(',');
  const exercise = args.plan.exercises[0];
  args.savedPlanIdentity = createSavedPlanIdentity(args.plan, [{exercise}], buildSavedTemplateUpdatePayload(args.verifiedReadback, {...args.staticLoadContext, displayUnit}), args.accountFingerprint);
  const current = {metadataById: args.metadataById, deviceType: 1, displayUnit, staticLoadContext: args.staticLoadContext,
    currentWirePayload: args.verifiedReadback, accountFingerprint: args.accountFingerprint, intakeFingerprint: args.intakeFingerprint,
    staticContextDigest: args.staticContextDigest, templateCode: args.templateCode};
  return {args, current, payload};
}

for (const loadType of ['profile-auto', 'fixed-kg']) for (const unit of ['kg', 'lb']) {
  test(`real normalized ${loadType}/${unit} survives serializer GET identity JSON and review`, () => {
    const {args, current, payload} = staticFixture(loadType, unit);
    const record = JSON.parse(JSON.stringify(createReviewedPlanRecord(args)));
    assert.equal(record.plan.exercises[0].fixedKgAuthorized, loadType === 'fixed-kg');
    assert.deepEqual(record.expectedPayload, payload);
    assert.equal(record.expectedPayload.actionLibraryList[0].templatePresetId, -1);
    if (loadType === 'profile-auto') {
      assert.equal(record.plan.exercises[0].sets[0].loadEstimate.targetPercent1RM, .77);
      assert.equal(record.plan.exercises[0].sets[0].loadUnit, unit);
    } else assert.equal(record.plan.exercises[0].sets[0].weightKg, 35);
    assert.equal(inspectReviewedPlanRecord({record, ...current}).status, 'historical-review-matched');
    assert.equal(inspectReviewedPlanRecord({record, ...current}).scientificApproval, false);
    for (const [field, value] of [['setsAndReps', '9,12'], ['weights', '36,36'], ['breakTime', '91,90']]) {
      const changed = structuredClone(args.verifiedReadback);
      changed.actionLibraryList[0][field] = value;
      assert.throws(() => createReviewedPlanRecord({...args, verifiedReadback: changed}), /readback/);
      assert.equal(inspectReviewedPlanRecord({record, ...current, currentWirePayload: changed}).status, 'invalid');
    }
    assert.equal(inspectReviewedPlanRecord({record, ...current, displayUnit: undefined}).status, 'invalid');
    assert.equal(inspectReviewedPlanRecord({record, ...current, displayUnit: 'unknown'}).status, 'invalid');
    assert.equal(inspectReviewedPlanRecord({record, ...current, staticContextDigest: 'd'.repeat(64)}).status, 'stale');
    assert.equal(inspectReviewedPlanRecord({record, ...current, staticLoadContext: {staticLoadProtocol: 'account-unit-verbatim'}}).status, 'invalid');
    // Unit changes are bound by the separately refreshed context fingerprint,
    // including fixed canonical kg whose wire numerals can remain unchanged.
    assert.equal(inspectReviewedPlanRecord({record, ...current, displayUnit: unit === 'kg' ? 'lb' : 'kg', staticContextDigest: 'd'.repeat(64)}).status, 'stale');
  });
}

test('historical rename inspection requires an actual valid current display name', () => {
  const {args, current} = fixture();
  const record = createReviewedPlanRecord(args);
  for (const name of [undefined, null, '', '   ', 42, {}, []]) {
    assert.equal(inspectReviewedPlanRecord({record, ...current, currentWirePayload: {...current.currentWirePayload, name}}).status, 'invalid');
  }
});

import { historicalReviewForDisplay } from '../plugin/reviewed-plan-record.mjs';
test('historical display is account-bound, intact and explicitly unverified', () => {
  const {args} = fixture();
  const record = createReviewedPlanRecord(args);
  const view = historicalReviewForDisplay(record, args.accountFingerprint, args.templateCode);
  assert.equal(view.status, 'historical-unverified');
  assert.equal(view.currentPrescriptionVerified, false);
  assert.equal(view.scientificApproval, false);
  assert.equal(view.requiresFreshScientificReview, true);
  view.plan.exercises[0].sets[0].reps = 99;
  assert.equal(record.plan.exercises[0].sets[0].reps, 8);
  for (const [account, code] of [['d'.repeat(64), args.templateCode], [args.accountFingerprint, 'other']]) {
    const denied = historicalReviewForDisplay(record, account, code);
    assert.equal(denied.status, 'stale'); assert.equal(denied.plan, undefined);
  }
  record.plan.exercises[0].sets[0].reps = 9;
  assert.equal(historicalReviewForDisplay(record, args.accountFingerprint, args.templateCode).status, 'invalid');
  assert.equal(historicalReviewForDisplay(null, args.accountFingerprint, args.templateCode).status, 'missing');
});

test('actual saved-program dispatch exposes optional history without changing read-only status', async () => {
  const start = serverSource.indexOf("    case 'speediance_get_saved_program': {");
  const end = serverSource.indexOf("    case 'speediance_preview_saved_program_update':", start);
  assert.ok(start > 0 && end > start);
  const {args} = fixture();
  const record = createReviewedPlanRecord(args);
  let reads = 0;
  const run = runWithRecoveryFixture(`(async (args) => {switch ('speediance_get_saved_program') {${serverSource.slice(start, end)}}})`, {
    assertUnitMemoryAccountBinding: () => ({}), assertUnitMemoryAccountCurrent: async () => {}, assertSavedPresentationArguments, presentSavedRead:(value,options)=>{const adapted=JSON.parse(JSON.stringify(value));for(const key of ['displayWeightUnit','displayWeightUnitSource','accountWeightUnit','accountWeightUnitSource'])if(Object.hasOwn(value,key)&&value[key]===undefined)adapted[key]=undefined;return presentSavedRead(adapted,options);},
    resolveProfile: async () => 'synthetic', readProfileConfig: async () => ({config: {deviceType: 1}}),
    getSavedTemplateByCode: async () => args.verifiedReadback,
    createSavedTemplateSnapshot: () => ({}), buildReadableSavedTemplate: async () => ({exercises: []}),
    readProgramCoachNotes: async () => ({programs: {}}), reconciledProgramCoachNotes: () => ({}),
    savedIdentityAccountFingerprint: () => args.accountFingerprint, resolveStaticProtocolReadContext: () => ({}),
    profilePaths: () => ({dir: 'synthetic'}), readReviewedPlanRecord: async () => {reads++; return record;},
    historicalReviewForDisplay, savedTemplateDigest: () => 'digest',
    markReadOnlyProgramResult: value => ({...value, operationStatus: 'read-only', programCreatedByThisCall: false})
  });
  const defaultView = await run({program_code: args.templateCode});
  assert.equal(reads, 0); assert.equal(defaultView.historicalCoachReview, undefined);
  const historical = await run({program_code: args.templateCode, include_coach_review: true});
  assert.equal(reads, 1); assert.equal(historical.historicalCoachReview.status, 'historical-unverified');
  assert.equal(historical.historicalCoachReview.scientificApproval, false);
  assert.equal(historical.operationStatus, 'read-only'); assert.equal(historical.programCreatedByThisCall, false);
  for(const key of ['displayWeightUnit','displayWeightUnitSource','accountWeightUnit','accountWeightUnitSource']){assert.equal(Object.hasOwn(historical,key),true);assert.equal(historical[key],undefined);}
  assert.equal(historical.humanLoadPresentationReadOnly.status,'available');
});

test('snapshot preserves explicit exercise trainingGoal without accepting unknown values',()=>{const p={name:'Synthetic',exercises:[{id:1,title:'Synthetic',trainingGoal:'strength',sets:[{unit:'reps',reps:6,mode:1,rest:90}]}]};assert.equal(snapshotNormalizedPlan(p).exercises[0].trainingGoal,'strength');assert.throws(()=>snapshotNormalizedPlan({...p,exercises:[{...p.exercises[0],trainingGoal:'technical'}]}),/training goal/);});
