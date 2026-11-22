import {createHash} from 'node:crypto';
import { runWithRecoveryFixture } from './recovery-fixture.mjs';
import { getReferenceClientRmPresetRules } from '../program-payload.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { buildSavedTemplateUpdatePayload, verifyUpdatedTemplateReadback, preserveMatchedPresetIds, assertRawActionListResistanceModesUnchanged, matchSavedActionOccurrences, applySmartRmConversions, applyReferenceClientResistanceModeUpdates, savedTemplateDigest } from '../saved-templates.mjs';
import { savedSmartRmRequiresAccountObservation } from '../smart-rm-readiness.mjs';
import { getReferenceClientRmPresetById, getReferenceClientRmPresetByName, buildReferenceClientRmPresetCandidates, hasGlobalReferenceClientRmPreset, isObservedRmPresetAction } from '../preset-mapping.mjs';
import { reconcileSavedEditPayload, diffSavedEditPayloads, savedEditExecutionDisclosure, assertSavedEditScope } from '../saved-edit-diff.mjs';
import { createSavedPlanIdentity, createSavedEditOccurrenceMapping, reconcileSavedPlanIdentity } from '../saved-plan-identity.mjs';
import { buildPresetPayload } from '../program-serialization.mjs';
import { validateExecutablePlanSections } from '../executable-plan-sections.mjs';
import { expandPlanForSerialization } from '../superset-serialization.mjs';

const source = readFileSync(new URL('../mcp_server.mjs', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const originalAction = () => ({ groupId: 10, actionLibraryId: 101, templatePresetId: 1,
  weights: '3.5,3.5', counterweight: '13,13', counterweight2: '13,13',
  setsAndReps: '8,8', completionMethod: '1,1', countType: '1,1',
  sportMode: '1,1', leftRight: '0,0', level: '1,1', breakTime: '60,60', breakTime2: '60,60', capacity: 100 });
const currentTemplate = (actions = [originalAction()]) => ({ id: 7, code: 'synthetic-rest', name: 'Synthetic rest', deviceType: 1,
  totalCapacity: actions.reduce((sum, action) => sum + action.capacity, 0), actionLibraryList: actions });
const context = { contextDigest: 'synthetic-protocol' };
const baselineFor = current => buildSavedTemplateUpdatePayload(current, context);
const proposedFor = (current, actions) => buildSavedTemplateUpdatePayload(current, { ...context, actionLibraryList: actions });

test('actual changed-exercise validator checks each duplicate Smart RM occurrence without requiring 1RM', async () => {
  const first = { ...originalAction(), templatePresetId: 5, counterweight: '7,7', counterweight2: '7,7' };
  const current = currentTemplate([first, originalAction()]);
  const start = source.indexOf('async function validateChangedTemplateExercises(');
  const end = source.indexOf('\nasync function setupInfo(', start);
  assert.ok(start >= 0 && end > start);
  let metadataCalls = 0, readinessCalls = 0;
  const validate = runWithRecoveryFixture(`(${source.slice(start, end).trim()})`, {
    matchSavedActionOccurrences, savedSmartRmRequiresAccountObservation,
    parseNonNegativePresetId: value => [1, 3, 5].includes(Number(value)) ? Number(value) : null,
    getExerciseApiMetadata: async () => { metadataCalls++; return { batch: { actionLibraryList: [{ id: 101 }] } }; },
    loadExercisePresetOptions: async () => ({ referenceClientPresetOptions: buildReferenceClientRmPresetCandidates() }),
    getReferenceClientRmPresetById, isObservedRmPresetAction, hasGlobalReferenceClientRmPreset,
    readProfileConfig: async () => ({ config: {}, password: '' }), profileConfigFingerprint: () => 'synthetic',
    smartRmReadiness: { check: () => { readinessCalls++; return { ready: false, reason: 'synthetic-missing' }; } }
  });
  await validate('synthetic', current, structuredClone(current.actionLibraryList), 1);
  assert.equal(metadataCalls, 0);
  assert.equal(readinessCalls, 0);
  const changed = [structuredClone(first), structuredClone(first)];
  await validate('synthetic', current, changed, 1);
  assert.equal(metadataCalls, 1);
  assert.equal(readinessCalls, 0);
  assert.equal(current.actionLibraryList[1].templatePresetId, 1);
});

test('actual raw edit preflight matches duplicate variants by occurrence for presets and modes', () => {
  const first = { ...originalAction(), templatePresetId: 5, counterweight: '9,9', counterweight2: '9,9' };
  const second = { ...originalAction(), sportMode: '3,3' };
  const current = currentTemplate([first, second]);
  const start = source.indexOf('          if (args.action_library_list !== undefined) {\n            assertRawActionListResistanceModesUnchanged');
  assert.ok(start >= 0);
  const end = source.indexOf('          await validateChangedTemplateExercises', start);
  const preflight = runWithRecoveryFixture(`(function(args,current,requestedActions){${source.slice(start, end)}; return replacementActions;})`, {
    preserveMatchedPresetIds, assertRawActionListResistanceModesUnchanged
  });
  const replacement = structuredClone(current.actionLibraryList);
  for (const action of replacement) { delete action.templatePresetId; action.breakTime = '90,90'; }
  const matched = preflight({ action_library_list: replacement }, current, replacement);
  assert.deepEqual(matched.map(action => action.templatePresetId), [5, 1]);
  const baseline = baselineFor(current);
  const result = proposedFor(current, matched);
  assert.deepEqual(diffSavedEditPayloads(baseline, result, context).categories, ['rest']);
  assert.equal(result.actionLibraryList[1].sportMode, '3,3');
  const changed = structuredClone(replacement);
  changed[1].sportMode = '1,1';
  assert.throws(() => preflight({ action_library_list: changed }, current, changed), /nie zmieniaj surowego sportMode/);
  replacement[0].templatePresetId = 5;
  assert.deepEqual(preflight({ action_library_list: replacement }, current, replacement).map(action => action.templatePresetId), [5, 1]);
  assert.equal(current.actionLibraryList[1].templatePresetId, 1);
});

test('same proven Smart RM dose ignores canonical name and shared-cell readback forms while preserving real changes', () => {
  const old = { ...originalAction(), weights: '3.5', presetId: '1', presetName: null };
  const baseline = { name: 'Synthetic', totalCapacity: 100, actionLibraryList: [old] };
  const next = { ...originalAction(), templatePresetName: 'Gain Muscle', breakTime: '90,90', capacity: 457.6 };
  const proposed = { ...baseline, totalCapacity: 457.6, actionLibraryList: [next] };
  const reconciled = reconcileSavedEditPayload(baseline, proposed, context);
  assert.equal(reconciled.totalCapacity, 100);
  assert.deepEqual(diffSavedEditPayloads(baseline, reconciled, context).categories, ['rest']);
  assert.equal(Object.hasOwn(reconciled.actionLibraryList[0], 'templatePresetName'), true);
  for (const patch of [{ presetId: 5 }, { presetName: 'Strength' }, { presetName: true }, { counterweight: '12,13', counterweight2: '12,13' }]) {
    const changed = { ...proposed, actionLibraryList: [{ ...next, ...patch }] };
    assert.throws(() => assertSavedEditScope(diffSavedEditPayloads(baseline, changed, context), ['rest']), /load/);
  }
});

test('actual builder reconciles opaque capacity and generated optional selection for rest edits', () => {
  const current = currentTemplate(), baseline = baselineFor(current);
  const proposed = proposedFor(current, [{ ...current.actionLibraryList[0], breakTime: '90,90', breakTime2: '90,90' }]);
  assert.equal(proposed.totalCapacity, 100);
  assert.equal(Object.hasOwn(proposed.actionLibraryList[0], 'selectCompletionMethod'), false);
  const untouched = structuredClone(proposed);
  const reconciled = reconcileSavedEditPayload(baseline, proposed, context);
  assert.equal(reconciled.totalCapacity, 100);
  assert.equal(reconciled.actionLibraryList[0].capacity, 100);
  assert.equal(Object.hasOwn(reconciled.actionLibraryList[0], 'selectCompletionMethod'), false);
  assert.deepEqual(diffSavedEditPayloads(baseline, reconciled, context).categories, ['rest']);
  assert.deepEqual(proposed, untouched);
  const readback = structuredClone(reconciled);
  const verification = verifyUpdatedTemplateReadback({ expectedPayload: reconciled, readback, expectedCode: current.code });
  assert.equal(verification.verified, true, JSON.stringify(verification));
});

test('reconciliation preserves real reps and RM selector changes instead of authorizing rest scope', () => {
  const current = currentTemplate(), baseline = baselineFor(current);
  for (const patch of [{ setsAndReps: '9,8' }, { counterweight: '12,13', counterweight2: '12,13' }]) {
    const proposed = proposedFor(current, [{ ...current.actionLibraryList[0], breakTime: '90,90', ...patch }]);
    const reconciled = reconcileSavedEditPayload(baseline, proposed, context);
    assert.equal(reconciled.actionLibraryList[0].capacity, proposed.actionLibraryList[0].capacity);
    assert.equal(reconciled.totalCapacity, proposed.totalCapacity);
    assert.throws(() => assertSavedEditScope(diffSavedEditPayloads(baseline, reconciled, context), ['rest']), /dose|load/);
  }
});

test('explicit optional selection or capacity changes remain visible even when default-shaped', () => {
  const current = currentTemplate(), baseline = baselineFor(current);
  const proposed = proposedFor(current, [{ ...current.actionLibraryList[0], breakTime: '90,90', selectCompletionMethod: '1,1', capacity: 457.6 }]);
  for (const explicitActions of [[{ selectCompletionMethod: '1,1' }], [{ capacity: 457.6 }]]) {
    const reconciled = reconcileSavedEditPayload(baseline, proposed, context, { explicitActions });
    assert.throws(() => assertSavedEditScope(diffSavedEditPayloads(baseline, reconciled, context), ['rest']), /dose|load/);
  }
  const explicitTotal = reconcileSavedEditPayload(baseline, proposed, context, { explicitTotalCapacity: true });
  assert.throws(() => assertSavedEditScope(diffSavedEditPayloads(baseline, explicitTotal, context), ['rest']), /load/);
  const unknown = structuredClone(proposed); unknown.actionLibraryList[0].unconfirmedExecution = 'changed';
  assert.throws(() => assertSavedEditScope(diffSavedEditPayloads(baseline, reconcileSavedEditPayload(baseline, unknown, context), context), ['rest']), /unknown_metadata/);
});

test('duplicate occurrences preserve individual opaque capacities without merging; selection changes stay explicit', () => {
  const current = currentTemplate([originalAction(), { ...originalAction(), capacity: 237 }]), baseline = baselineFor(current);
  const proposed = proposedFor(current, current.actionLibraryList.map((action, index) => ({ ...action, breakTime: index ? '120,120' : '90,90' })));
  const reconciled = reconcileSavedEditPayload(baseline, proposed, context);
  assert.deepEqual(reconciled.actionLibraryList.map(action => action.capacity), [100, 237]);
  assert.equal(reconciled.totalCapacity, 337);
  assert.deepEqual(diffSavedEditPayloads(baseline, reconciled, context).categories, ['rest']);
  const selected = structuredClone(proposed); selected.actionLibraryList[1].actionLibraryId = 102;
  assert.throws(() => assertSavedEditScope(diffSavedEditPayloads(baseline, reconcileSavedEditPayload(baseline, selected, context), context), ['rest']), /exercise_selection/);
});

test('mixed executable dose edits sum the capacities actually sent without normalizing untouched occurrences', () => {
  const current = currentTemplate([originalAction(), { ...originalAction(), groupId: 11, actionLibraryId: 102, capacity: 237 }]);
  const baseline = baselineFor(current);
  const proposed = proposedFor(current, [{ ...current.actionLibraryList[0], breakTime: '90,90' },
    { ...current.actionLibraryList[1], setsAndReps: '9,8' }]);
  const reconciled = reconcileSavedEditPayload(baseline, proposed, context);
  assert.equal(reconciled.actionLibraryList[0].capacity, 100);
  assert.equal(reconciled.actionLibraryList[1].capacity, 486.2);
  assert.equal(reconciled.totalCapacity, 586.2);
  assert.throws(() => assertSavedEditScope(diffSavedEditPayloads(baseline, reconciled, context), ['rest']), /dose|load/);
  const named = structuredClone(proposed); named.actionLibraryList[0].presetName = 'Strength';
  assert.throws(() => assertSavedEditScope(diffSavedEditPayloads(baseline, reconcileSavedEditPayload(baseline, named, context), context), ['rest']), /load/);
});

for (const category of ['rest', 'resistance_mode', 'exercise_order', 'duplicate_order']) {
test(`actual MCP preview and commit bind the same reconciled ${category} payload`, async () => {
  const scope = category === 'duplicate_order' ? 'exercise_order' : category;
  const current = currentTemplate([{ ...originalAction(), counterweight: '12,11', counterweight2: '12,11' },
    ...(category === 'duplicate_order' ? [{ ...originalAction(), counterweight: '10,9', counterweight2: '10,9', capacity: 237 }] : []),
    ...(scope === 'exercise_order' ? [{ ...originalAction(), groupId: 11, actionLibraryId: 102, counterweight: '10,9', counterweight2: '10,9', capacity: 237 }] : [])]);
  const generated = category === 'duplicate_order'
    ? { ...baselineFor(current), actionLibraryList: [{ ...originalAction(), groupId: 11, actionLibraryId: 102 }, originalAction(), originalAction()] }
    : proposedFor(current, category === 'exercise_order'
    ? [{ ...originalAction(), groupId: 11, actionLibraryId: 102 }, originalAction()]
    : [{ ...originalAction(), ...(category === 'rest' ? { breakTime: '90,90', breakTime2: '90,90' } : { sportMode: '3,3' }) }]);
  const makePlan = (actions, ids) => ({ exercises: actions.map((action, index) => ({ id: action.groupId, actionLibraryId: action.actionLibraryId, entryId: ids[index], section: 'main', sets: [{ reps: 8, unit: 'reps', rest: 60 }] })), warmup: { status: 'omitted_user_preference', items: [] }, postWorkoutStretching: { status: 'omitted_user_preference', items: [] } });
  const oldPlan = makePlan(current.actionLibraryList, current.actionLibraryList.map((_, index) => index + 100));
  const newPlan = category === 'duplicate_order' ? makePlan(generated.actionLibraryList, [102, 101, 100]) : oldPlan;
  const fingerprint = 'a'.repeat(64);
  const savedIdentity = createSavedPlanIdentity(oldPlan, expandPlanForSerialization(oldPlan), baselineFor(current), fingerprint);
  let storedIdentity = savedIdentity;
  const helperStart = source.indexOf('async function savedEditOccurrenceContext(');
  const helperEnd = source.indexOf('\nasync function updateProgramCoachNoteName', helperStart);
  const occurrenceContext = runWithRecoveryFixture(`(${source.slice(helperStart, helperEnd).trim()})`, {
    readProgramCoachNotes: async () => ({ programs: { [current.code]: { savedPlanIdentity: storedIdentity } } }),
    createSavedEditOccurrenceMapping, expandPlanForSerialization, savedIdentityAccountFingerprint: () => fingerprint,
  });
  // Independent program-creation serializer fields, as reproduced in the
  // reported preview bug; the update builder itself now preserves readback.
  generated.totalCapacity = 457.6;
  generated.actionLibraryList[0].capacity = 457.6;
  generated.actionLibraryList[0].selectCompletionMethod = '1,1';
  generated.actionLibraryList[0].templatePresetName = 'Gain Muscle';
  const approval = { payload: generated, staticLoadContext: context, displayUnit: 'kg', kind: 'saved-update', profile: 'p',
    editProgramCode: current.code, editBaseDigest: 'base', profileFingerprint: 'fp', intakeFingerprint: 'intake', digest: 'digest',
    editPlanArgs: {}, plan: newPlan, expiresAt: Date.now() + 60_000, allowedChanges: [scope] };
  const writeApprovals = new Map([['edit', approval]]);
  const previewStart = source.indexOf('      let editDiff;', source.indexOf("case 'speediance_preview_saved_program_update':"));
  const previewEnd = source.indexOf('      return { ...result, editPreviewId:', previewStart);
  assert.ok(previewStart > 0 && previewEnd > previewStart);
  const preview = runWithRecoveryFixture(`(async function(args) { ${source.slice(previewStart, previewEnd)} return editDiff; })`, {
    current, approval, result: { previewId: 'edit' }, writeApprovals, profile: 'p', config: {},
    savedEditOccurrenceContext: occurrenceContext,
    buildSavedTemplateUpdatePayload, reconcileSavedEditPayload, diffSavedEditPayloads, savedEditExecutionDisclosure, assertSavedEditScope,
  });
  const previewDiff = await preview({ allowed_changes: [scope], program_code: current.code, base_digest: 'base' });
  assert.deepEqual(Array.from(previewDiff.categories), [scope]);
  assert.equal(approval.editWirePayload.totalCapacity, current.totalCapacity);
  assert.equal(approval.editWirePayload.actionLibraryList[0].counterweight, scope === 'exercise_order' ? '10,9' : '12,11');
  assert.equal(approval.editWirePayload.actionLibraryList[0].counterweight2, scope === 'exercise_order' ? '10,9' : '12,11');
  assert.equal(approval.editWirePayload.actionLibraryList[0].capacity, scope === 'exercise_order' ? 237 : 100);
  if (category === 'duplicate_order') assert.deepEqual(Array.from(approval.editWirePayload.actionLibraryList, action => action.counterweight), ['10,9', '10,9', '12,11']);
  assert.equal(Object.hasOwn(approval.editWirePayload.actionLibraryList[0], 'selectCompletionMethod'), false);
  if (category === 'resistance_mode') assert.equal(approval.editWirePayload.actionLibraryList[0].sportMode, '3,3');
  const commitStart = source.indexOf('        const baseline = buildSavedTemplateUpdatePayload(current, staticLoadContext);', source.indexOf("case 'speediance_update_saved_program':"));
  const commitEnd = source.indexOf('        let result;', commitStart);
  assert.ok(commitStart > 0 && commitEnd > commitStart);
  const commit = runWithRecoveryFixture(`(async function(args) { let payload = initial; let staticLoadContext = context; let approvedEditPlan; let approvedEditReviewContext; let approvalEditFingerprint; ${source.slice(commitStart, commitEnd)} return payload; })`, {
    cycleHash:value=>createHash("sha256").update(JSON.stringify(value)).digest("hex"), initial: generated, context, current, profile: 'p', editModes: [], writeApprovals,
    savedEditOccurrenceContext: occurrenceContext,
    buildSavedTemplateUpdatePayload, reconcileSavedEditPayload, diffSavedEditPayloads, savedEditExecutionDisclosure, assertSavedEditScope,
    readProfileConfig: async () => ({ config: { deviceType: 1 }, password: '' }), profileConfigFingerprint: () => 'fp',
    savedIdentityAccountFingerprint: () => 'a'.repeat(64), readTrainingProfileRecord: async () => null,
    currentExerciseCatalog: async () => ({}), normalizePlan: () => newPlan,
    validatePlanForProfile: async plan => ({ plan, intakeFingerprint: 'intake' }), planDigest: () => 'digest',
    prepareProgramPayload: async () => ({ payload: generated, displayUnit: 'kg', staticLoadContext: context }),
  });
  if (category === 'duplicate_order') {
    assert.equal(Object.isFrozen(approval.editOccurrenceMapping), true);
    assert.equal(Object.getOwnPropertyDescriptor(approval, 'editOccurrenceMapping').writable, false);
    storedIdentity = { ...savedIdentity, executionDigest: 'b'.repeat(64) };
    await assert.rejects(commit({ base_digest: 'base', edit_preview_id: 'edit' }), /matched saved occurrence/);
    assert.equal(writeApprovals.has('edit'), true);
    storedIdentity = savedIdentity;
    const entry = newPlan.exercises[1].entryId;
    newPlan.exercises[1].entryId = 999;
    await assert.rejects(commit({ base_digest: 'base', edit_preview_id: 'edit' }), /membership/);
    newPlan.exercises[1].entryId = entry;
  }
  const committed = await commit({ base_digest: 'base', edit_preview_id: 'edit' });
  assert.equal(JSON.stringify(committed), JSON.stringify(approval.editWirePayload));
  const verified = verifyUpdatedTemplateReadback({ expectedPayload: committed, readback: structuredClone(committed), expectedCode: current.code });
  assert.equal(verified.verified, true, JSON.stringify(verified));
  assert.equal(writeApprovals.has('edit'), false);
  assert.ok(commitEnd < source.indexOf("result = await speedianceApiRequest(profile, '/app/v2/customTrainingTemplate'", commitEnd));
});
}

test('actual preview/commit gates preserve mixed executable sections, timed dose and distinct RM across repeated catalog identity', async () => {
  const staticContext = { staticLoadProtocol: 'account-unit-verbatim', displayUnit: 'kg', accountUnit: 'kg', contextDigest: 'mixed-sections' };
  const plan = { name: 'Mixed sections', exercises: [
    { id: 10, actionLibraryId: 101, entryId: 100, section: 'warmup', title: 'Warmup', loadType: 'bodyweight', sets: [{ unit: 'sec', durationSeconds: 30, mode: 1, rest: 30 }] },
    { id: 10, actionLibraryId: 101, entryId: 101, section: 'main', title: 'Main RM', loadType: 'smart-rm', smartRmPresetId: 1, smartRmPresetName: 'Gain Muscle', sets: [8, 10].map(reps => ({ unit: 'reps', reps, rirTarget: 2, mode: 1, rest: 60 })) },
    { id: 10, actionLibraryId: 101, entryId: 102, section: 'main', title: 'Timed Customize', loadType: 'customize-manual', staticLoadRequested: true, movementKind: 'strength', sets: [30, 40].map((durationSeconds, index) => ({ unit: 'sec', durationSeconds, weight: 8 + index, weightUnit: 'kg', mode: 1, rest: 60 })) },
    { id: 10, actionLibraryId: 101, entryId: 103, section: 'stretching', title: 'Stretching', loadType: 'bodyweight', sets: [{ unit: 'sec', durationSeconds: 45, mode: 1, rest: 30 }] }
  ], warmup: { status: 'included', items: [{ executionRef: 100 }] }, postWorkoutStretching: { status: 'included', items: [{ executionRef: 103 }] } };
  const metadata = new Map([[10, { detail: { isLeftRight: 0, isBarbell: 0 }, batch: { actionLibraryList: [{ id: 101 }] } }]]);
  const serialize = value => buildPresetPayload(value, metadata, 1, 'kg', staticContext).payload;
  validateExecutablePlanSections(plan);
  const oldPayload = serialize(plan);
  const current = { ...structuredClone(oldPayload), id: 7, code: 'mixed-sections' };
  current.actionLibraryList.forEach((action, index) => { action.capacity = 123 + index; }); current.totalCapacity = 498;
  Object.assign(current.actionLibraryList[1], { counterweight: '12,11', counterweight2: '12,11' });
  // Saved timed GET codes differ from the fresh writer's timed code.
  for (const index of [0, 2, 3]) current.actionLibraryList[index].completionMethod = index === 2 ? '0,0' : '0';
  const baseline = buildSavedTemplateUpdatePayload(current, staticContext);
  const fingerprint = 'a'.repeat(64);
  const savedIdentity = createSavedPlanIdentity(plan, expandPlanForSerialization(plan), baseline, fingerprint);
  plan.exercises.forEach(exercise => exercise.sets.forEach(set => { set.rest += 15; }));
  const generated = serialize(plan);
  const approval = { payload: generated, plan, staticLoadContext: staticContext, displayUnit: 'kg', profile: 'p', profileFingerprint: 'fp', intakeFingerprint: 'intake', digest: 'digest', expiresAt: Date.now() + 60000 };
  const writeApprovals = new Map([['edit', approval]]);
  const occurrenceContext = async (_profile, _current, _baseline, _plan, _generated, _config, value) => value;
  const services = { current, approval, writeApprovals, profile: 'p', config: {}, savedEditOccurrenceContext: occurrenceContext, buildSavedTemplateUpdatePayload, reconcileSavedEditPayload, diffSavedEditPayloads, savedEditExecutionDisclosure, assertSavedEditScope };
  const previewStart = source.indexOf('      let editDiff;', source.indexOf("case 'speediance_preview_saved_program_update':"));
  const previewEnd = source.indexOf('      return { ...result, editPreviewId:', previewStart);
  assert.ok(previewStart > 0 && previewEnd > previewStart);
  const preview = runWithRecoveryFixture(`(async args => { ${source.slice(previewStart, previewEnd)} return editDiff; })`, { ...services, result: { previewId: 'edit' } });
  assert.deepEqual(Array.from((await preview({ allowed_changes: ['rest'], program_code: current.code, base_digest: 'base' })).categories), ['rest']);
  const wire = approval.editWirePayload;
  assert.deepEqual(Array.from(wire.actionLibraryList, action => action.setsAndReps), ['30', '8,10', '30,40', '45']);
  assert.deepEqual(Array.from(wire.actionLibraryList, action => action.completionMethod), ['2', '1,1', '2,2', '2']);
  assert.deepEqual(Array.from(wire.actionLibraryList, action => action.weights), Array.from(generated.actionLibraryList, action => action.weights));
  assert.equal(wire.actionLibraryList[1].counterweight, '12,11'); assert.equal(wire.actionLibraryList[1].counterweight2, '12,11');
  assert.deepEqual(Array.from(wire.actionLibraryList, action => action.capacity), [123, 124, 125, 126]); assert.equal(wire.totalCapacity, 498);
  const commitStart = source.indexOf('        const baseline = buildSavedTemplateUpdatePayload(current, staticLoadContext);', source.indexOf("case 'speediance_update_saved_program':"));
  const commitEnd = source.indexOf('        let result;', commitStart);
  assert.ok(commitStart > 0 && commitEnd > commitStart);
  const commit = runWithRecoveryFixture(`(async args => { let payload = initial; let staticLoadContext = context; let approvedEditPlan; let approvedEditReviewContext; let approvalEditFingerprint; ${source.slice(commitStart, commitEnd)} return { payload, approvedEditPlan }; })`, {
    ...services, cycleHash:value=>createHash("sha256").update(JSON.stringify(value)).digest("hex"), initial: generated, context: staticContext, editModes: [], readProfileConfig: async () => ({ config: { deviceType: 1 }, password: '' }), profileConfigFingerprint: () => 'fp', savedIdentityAccountFingerprint: () => fingerprint,
    readTrainingProfileRecord: async () => null, currentExerciseCatalog: async () => null, normalizePlan: () => structuredClone(plan), validatePlanForProfile: async value => ({ plan: value, intakeFingerprint: 'intake' }), planDigest: () => 'digest', prepareProgramPayload: async value => ({ payload: serialize(value), displayUnit: 'kg', staticLoadContext: staticContext })
  });
  const committed = await commit({ base_digest: 'base', edit_preview_id: 'edit' });
  assert.equal(JSON.stringify(committed.payload), JSON.stringify(wire));
  assert.equal(verifyUpdatedTemplateReadback({ expectedPayload: committed.payload, readback: committed.payload, expectedCode: current.code, staticLoadProtocol: staticContext.staticLoadProtocol, accountUnit: 'kg' }).verified, true);
  const newIdentity = createSavedPlanIdentity(committed.approvedEditPlan, expandPlanForSerialization(committed.approvedEditPlan), buildSavedTemplateUpdatePayload(committed.payload, staticContext), fingerprint);
  assert.deepEqual(Array.from(reconcileSavedPlanIdentity(newIdentity, committed.payload, fingerprint).mappings, row => [row.entryId, row.section]), [[100, 'warmup'], [101, 'main'], [102, 'main'], [103, 'stretching']]);
  assert.equal(reconcileSavedPlanIdentity(savedIdentity, baseline, fingerprint).status, 'matched');
  for (const mutate of [value => { value.actionLibraryList.shift(); }, value => { value.actionLibraryList.pop(); }, value => { value.actionLibraryList[2].completionMethod = '1,1'; value.actionLibraryList[2].countType = '1,1'; }]) {
    approval.payload = structuredClone(generated); mutate(approval.payload); writeApprovals.set('edit', approval);
    await assert.rejects(preview({ allowed_changes: ['rest'], program_code: current.code, base_digest: 'base' }), /scope|reorder|preset|jednost|seconds/);
    assert.equal(writeApprovals.has('edit'), false);
  }
});

for (const kind of ['conversion', 'mode', 'dose']) test(`public ${kind} patch actual scientific preview commits intercepted POST and verifies readback`, async () => {
  const staticContext = { staticLoadProtocol: 'account-unit-verbatim', displayUnit: 'kg', accountUnit: 'kg', contextDigest: 'patch-context' };
  const original = kind === 'conversion' ? { ...originalAction(), templatePresetId: -1, weights: '8,9', counterweight: '', counterweight2: '' } : { ...originalAction(), counterweight: '12,11', counterweight2: '12,11' };
  const untouched = { ...originalAction(), groupId: 11, actionLibraryId: 102, templatePresetId: -1, setsAndReps: '30,45', completionMethod: '2,2', countType: '2,2', weights: '0,0', counterweight: '', counterweight2: '', capacity: 77 };
  const current = currentTemplate([original, untouched]);
  const patch = kind === 'conversion' ? { primary_goal: 'hypertrophy', smart_rm_conversion: [{ groupId: 10, actionLibraryId: 101, smartRmPresetName: 'Gain Muscle', sets: [{ unit: 'reps', reps: 8 }, { unit: 'reps', reps: 8 }] }] } : kind === 'mode' ? { resistance_mode_updates: [{ groupId: 10, actionLibraryId: 101, modes: [2, 3] }] } : {};
  const actions = kind === 'conversion' ? applySmartRmConversions(current.actionLibraryList, patch.smart_rm_conversion, { primaryGoal: patch.primary_goal }) : kind === 'mode' ? applyReferenceClientResistanceModeUpdates(current.actionLibraryList, patch.resistance_mode_updates) : current.actionLibraryList.map((action, index) => index === 0 ? { ...action, setsAndReps: '9,8' } : action);
  // Scientific serialization emits the preset adapter default, not the hidden
  // saved selectors. Exercise reconciliation of that actual boundary rather
  // than using the raw patch writer as a substitute scientific serializer.
  const defaultSelectors = Array(2).fill(getReferenceClientRmPresetRules('Gain Muscle').defaultRmLevel).join(',');
  const scientificActions = kind !== 'conversion' ? actions.map((action, index) => index === 0
    ? { ...action, counterweight: defaultSelectors, counterweight2: defaultSelectors }
    : action) : actions;
  const generated = buildSavedTemplateUpdatePayload(current, { ...staticContext, actionLibraryList: scientificActions });
  const plan = { exercises: actions.map((action, index) => ({ id: action.groupId, actionLibraryId: action.actionLibraryId, entryId: 100 + index, section: 'main', sets: [] })), warmup: { status: 'omitted_user_preference', items: [] }, postWorkoutStretching: { status: 'omitted_user_preference', items: [] } };
  let ready = true, scienceValid = true, readinessChecks = 0, posts = 0, posted, readinessHook;
  let refreshedUnit = 'kg', refreshedContext = staticContext;
  const helperStart = source.indexOf('async function validateSavedProgramPreviewPatch('), helperEnd = source.indexOf('\nasync function deleteProgramCoachNote', helperStart);
  assert.ok(helperStart > 0 && helperEnd > helperStart);
  const validatePatch = runWithRecoveryFixture(`(${source.slice(helperStart, helperEnd).trim()})`, {
    applySmartRmConversions, applyReferenceClientResistanceModeUpdates, getReferenceClientRmPresetByName, buildSavedTemplateUpdatePayload, reconcileSavedEditPayload, diffSavedEditPayloads, structuredClone,
    readTrainingProfileRecord: async () => null, currentExerciseCatalog: async () => ({ exerciseRecordsById: new Map() }),
    validateChangedTemplateExercises: async () => { readinessChecks++; if (!ready) throw new Error('readiness expired'); if (readinessHook) await readinessHook(); }
  });
  const approval = { payload: generated, plan, staticLoadContext: staticContext, displayUnit: 'kg', profile: 'p', profileFingerprint: 'fp', intakeFingerprint: 'intake', digest: 'digest', expiresAt: Date.now() + 60000 };
  const writeApprovals = new Map([['edit', approval]]);
  const services = { current, approval, writeApprovals, profile: 'p', config: { deviceType: 1 }, validateSavedProgramPreviewPatch: validatePatch, savedEditOccurrenceContext: async (_p, _c, _b, _plan, _g, _config, value) => value, buildSavedTemplateUpdatePayload, reconcileSavedEditPayload, diffSavedEditPayloads, savedEditExecutionDisclosure, assertSavedEditScope };
  const previewStart = source.indexOf('      let editDiff;', source.indexOf("case 'speediance_preview_saved_program_update':")), previewEnd = source.indexOf('      return { ...result, editPreviewId:', previewStart);
  const preview = runWithRecoveryFixture(`(async args => { ${source.slice(previewStart, previewEnd)} return editDiff; })`, { ...services, result: { previewId: 'edit' } });
  const args = { ...patch, allowed_changes: [kind === 'conversion' ? 'load' : kind === 'mode' ? 'resistance_mode' : 'dose'], program_code: current.code, base_digest: 'base' };
  await preview(args);
  if (kind === 'dose') {
    assert.deepEqual(Array.from(approval.editDiff.categories), ['dose']);
    assert.equal(approval.editWirePayload.actionLibraryList[0].counterweight, '12,11');
    assert.equal(approval.editWirePayload.actionLibraryList[0].capacity, 431.2);
  }
  assert.equal(Object.isFrozen(approval.editPatch), true);
  assert.equal(Object.hasOwn(approval.editWirePayload.actionLibraryList[0], 'selectCompletionMethod'), false, 'Generated default selection must not invent a dose edit when the targeted row changes load/mode.');
  if (kind !== 'dose') assert.equal(Object.getOwnPropertyDescriptor(approval, 'editPatch').writable, false);
  assert.deepEqual(Array.from(approval.editWirePayload.actionLibraryList[1].setsAndReps.split(',')), ['30', '45']);
  assert.equal(approval.editWirePayload.actionLibraryList[1].capacity, 77);
  if (kind === 'mode') {
    assert.equal(approval.editWirePayload.actionLibraryList[0].counterweight, '12,11');
    assert.equal(approval.editWirePayload.actionLibraryList[0].counterweight2, '12,11');
  }
  const commitStart = source.indexOf('        const baseline = buildSavedTemplateUpdatePayload(current, staticLoadContext);', source.indexOf("case 'speediance_update_saved_program':"));
  const commitEnd = source.indexOf('        if (!readbackVerification.safeToReportSuccess)', commitStart);
  assert.ok(commitStart > 0 && commitEnd > commitStart);
  const baselineGateStart = source.indexOf('        if (savedTemplateDigest(current) !== args.base_digest)', source.indexOf("case 'speediance_update_saved_program':"));
  const baselineGateEnd = source.indexOf('        let smartRmConversionSummary;', baselineGateStart);
  assert.ok(baselineGateStart > 0 && baselineGateEnd > baselineGateStart);
  const commit = runWithRecoveryFixture(`(async args => { ${source.slice(baselineGateStart, baselineGateEnd)} let payload = initial; let staticLoadContext = context; let approvedEditPlan; let approvedEditReviewContext; let approvalEditFingerprint; let smartRmConversionSummary; let resistanceModeUpdateSummary; ${source.slice(commitStart, commitEnd)} return { payload, readbackVerification }; })`, {
    ...services, cycleHash:value=>createHash("sha256").update(JSON.stringify(value)).digest("hex"), initial: generated, context: staticContext, editModes: [], verifyUpdatedTemplateReadback, savedTemplateDigest,
    readProfileConfig: async () => ({ config: { deviceType: 1 }, password: '' }), profileConfigFingerprint: () => 'fp', savedIdentityAccountFingerprint: () => 'a'.repeat(64), readTrainingProfileRecord: async () => null, currentExerciseCatalog: async () => null,
    normalizePlan: () => structuredClone(plan), validatePlanForProfile: async value => { if (!scienceValid) throw new Error('science invalid'); return { plan: value, intakeFingerprint: 'intake' }; }, planDigest: () => 'digest', prepareProgramPayload: async () => ({ payload: generated, displayUnit: refreshedUnit, staticLoadContext: refreshedContext }),
    speedianceApiRequest: async (_profile, endpoint, request) => { assert.equal(endpoint, '/app/v2/customTrainingTemplate'); assert.equal(request.method, 'POST'); posts++; posted = structuredClone(request.body); return { code: 0 }; },
    getSavedTemplateByCode: async () => ({ ...structuredClone(posted), id: current.id, code: current.code })
  });
  // Exercise the actual outer concurrency gate together with the inner approval/POST branch.
  const commitArgs = { base_digest: savedTemplateDigest(current), edit_preview_id: 'edit' };
  approval.editBaseDigest = commitArgs.base_digest;
  const originalRest = current.actionLibraryList[1].breakTime;
  current.actionLibraryList[1].breakTime = '61,61';
  await assert.rejects(commit(commitArgs), /Szablon zmienił/); assert.equal(posts, 0);
  assert.equal(writeApprovals.get('edit'), approval);
  current.actionLibraryList[1].breakTime = originalRest;
  refreshedUnit = 'lb';
  await assert.rejects(commit(commitArgs), /Payload lub jednostka/); assert.equal(posts, 0);
  refreshedUnit = 'kg';
  refreshedContext = { ...staticContext, staticLoadProtocol: 'legacy-get-kg', contextDigest: 'changed-protocol' };
  await assert.rejects(commit(commitArgs), /Payload lub jednostka/); assert.equal(posts, 0);
  refreshedContext = staticContext;
  scienceValid = false; await assert.rejects(commit(commitArgs), /science invalid/); assert.equal(posts, 0);
  scienceValid = true; ready = false; if (kind !== 'dose') { await assert.rejects(commit(commitArgs), /readiness expired/); assert.equal(posts, 0); }
  ready = true;
  const approvedArgs = approval.editPlanArgs;
  if (kind !== 'dose') {
  approval.editPlanArgs = { ...approvedArgs, ...(kind === 'conversion' ? { primary_goal: 'strength' } : { resistance_mode_updates: [{ groupId: 10, actionLibraryId: 101, modes: [1, 1] }] }) };
  await assert.rejects(commit(commitArgs), /preset|goal|cel|differs|zgod/); assert.equal(posts, 0);
  approval.editPlanArgs = approvedArgs;
  const expiry = approval.expiresAt;
  readinessHook = async () => { await Promise.resolve(); approval.expiresAt = Date.now() - 1; };
  await assert.rejects(commit(commitArgs), /wygasł/); assert.equal(posts, 0);
  assert.equal(writeApprovals.get('edit'), approval, 'Expiry during awaited readiness must stop before consuming approval or POST.');
  readinessHook = undefined; approval.expiresAt = expiry;
  }
  const result = await commit(commitArgs);
  assert.equal(posts, 1); if (kind !== 'dose') assert.ok(readinessChecks >= 3);
  assert.equal(JSON.stringify(posted), JSON.stringify(approval.editWirePayload));
  assert.equal(result.readbackVerification.verified, true);
  if (kind === 'mode') {
    assert.equal(posted.actionLibraryList[0].counterweight, '12,11');
    assert.equal(posted.actionLibraryList[0].counterweight2, '12,11');
    assert.equal(posted.actionLibraryList[0].sportMode, '2,3');
  }
  if (kind === 'dose') {
    assert.equal(posted.actionLibraryList[0].counterweight, '12,11');
    assert.equal(posted.actionLibraryList[0].counterweight2, '12,11');
    assert.equal(posted.actionLibraryList[0].setsAndReps, '9,8');
    assert.equal(posted.actionLibraryList[0].capacity, 431.2);
    assert.equal(posted.totalCapacity, 508.2);
  }
  assert.equal(writeApprovals.has('edit'), false);
  await assert.rejects(commit(commitArgs), /podgl|preview/); assert.equal(posts, 1);
});

test('dose-only RM preservation rejects changed count, units, sides, preset, variant and explicit load inputs', () => {
  const current = currentTemplate([{ ...originalAction(), counterweight: '12,11', counterweight2: '12,11' }]);
  const baseline = baselineFor(current);
  const generated = proposedFor(current, [{ ...originalAction(), setsAndReps: '9,8' }]);
  const options = { allowedChanges: ['dose'], generatedPresetDefaults: true };
  const result = reconcileSavedEditPayload(baseline, generated, context, options);
  assert.equal(result.actionLibraryList[0].counterweight, '12,11');
  assert.equal(result.actionLibraryList[0].capacity, 431.2);
  assertSavedEditScope(diffSavedEditPayloads(baseline, result, context), ['dose']);
  for (const patch of [
    { setsAndReps: '9' }, { completionMethod: '2,2', countType: '2,2' }, { completionMethod: 'bad,1' },
    { leftRight: '1,1' }, { leftRight: 'bad,bad' }, { templatePresetId: 5, counterweight: '7,7', counterweight2: '7,7' },
    { presetId: 5 }, { presetName: 'Strength' }, { actionLibraryId: 999 },
    { counterweight: '12,12', counterweight2: '12,12' }, { counterweight2: '13,12' }, { weights: '4,4' },
    { breakTime: '90,90' }, { sportMode: '2,2' }
  ]) {
    const changed = structuredClone(generated); Object.assign(changed.actionLibraryList[0], patch);
    assert.throws(() => assertSavedEditScope(diffSavedEditPayloads(baseline, reconcileSavedEditPayload(baseline, changed, context, options), context), ['dose']), /scope|preset|Ambiguous|jednost|RM/);
  }
  for (const overrides of [{ explicitActions: [{}] }, { explicitTotalCapacity: true }, { generatedPresetDefaults: false }]) {
    assert.throws(() => assertSavedEditScope(diffSavedEditPayloads(baseline, reconcileSavedEditPayload(baseline, generated, context, { ...options, ...overrides }), context), ['dose']), /load/);
  }
  const forged = structuredClone(result); forged.actionLibraryList[0].capacity += 1;
  assert.throws(() => assertSavedEditScope(diffSavedEditPayloads(baseline, forged, context), ['dose']), /load/);
  const forgedTotal = structuredClone(result); forgedTotal.totalCapacity += 1;
  assert.throws(() => assertSavedEditScope(diffSavedEditPayloads(baseline, forgedTotal, context), ['dose']), /load/);
  const mixedCurrent = currentTemplate([current.actionLibraryList[0], { ...originalAction(), groupId: 11, actionLibraryId: 102, counterweight: '11,10', counterweight2: '11,10', capacity: 77 }]);
  const mixedBaseline = baselineFor(mixedCurrent);
  const mixedGenerated = proposedFor(mixedCurrent, [{ ...originalAction(), setsAndReps: '9,8' }, { ...originalAction(), groupId: 11, actionLibraryId: 102 }]);
  const mixedResult = reconcileSavedEditPayload(mixedBaseline, mixedGenerated, context, options);
  assert.deepEqual(mixedResult.actionLibraryList.map(row => row.counterweight), ['12,11', '11,10']);
  assert.deepEqual(mixedResult.actionLibraryList.map(row => row.capacity), [431.2, 77]);
  assert.equal(mixedResult.totalCapacity, 508.2);
  assertSavedEditScope(diffSavedEditPayloads(mixedBaseline, mixedResult, context), ['dose']);
});

test('rest-only scientific reconciliation preserves hidden selectors only with unchanged validated load intent', () => {
  const current = currentTemplate([{ ...originalAction(), counterweight: '12,11', counterweight2: '12,11' }]);
  const baseline = baselineFor(current);
  const generated = proposedFor(current, [{ ...originalAction(), breakTime: '90,90' }]);
  const options = { allowedChanges: ['rest'], generatedPresetDefaults: true };
  const reconciled = reconcileSavedEditPayload(baseline, generated, context, options);
  assert.equal(reconciled.actionLibraryList[0].counterweight, '12,11');
  assert.deepEqual(diffSavedEditPayloads(baseline, reconciled, context).categories, ['rest']);
  assert.equal(generated.actionLibraryList[0].counterweight, '13,13');
  for (const opt of [{}, { allowedChanges: ['rest'] }, { ...options, allowedChanges: ['rest', 'load'] }, { ...options, explicitActions: [{}] }]) {
    assert.throws(() => assertSavedEditScope(diffSavedEditPayloads(baseline, reconcileSavedEditPayload(baseline, generated, context, opt), context), ['rest']), /load/);
  }
  for (const patch of [
    { setsAndReps: '9,8' }, { sportMode: '3,3' }, { leftRight: '1,1' },
    { templatePresetId: 5, counterweight: '8,8', counterweight2: '8,8' },
    { counterweight: '12,12', counterweight2: '12,12' },
    { counterweight2: '12,13' }, { presetName: 'Strength' }, { weights: '4,4' },
    { unconfirmedExecution: 'changed' }
  ]) {
    const changed = structuredClone(generated);
    Object.assign(changed.actionLibraryList[0], patch);
    const result = reconcileSavedEditPayload(baseline, changed, context, options);
    assert.equal(result.actionLibraryList[0].counterweight, changed.actionLibraryList[0].counterweight, JSON.stringify(patch));
    assert.throws(() => assertSavedEditScope(diffSavedEditPayloads(baseline, result, context), ['rest']), /scope/);
  }
});

test('rest-only generated reconciliation preserves distinct duplicate occurrence selectors', () => {
  const current = currentTemplate([
    { ...originalAction(), counterweight: '10', counterweight2: '10' },
    { ...originalAction(), counterweight: '11,12', counterweight2: '11,12', capacity: 237 }
  ]);
  const baseline = baselineFor(current);
  const generated = proposedFor(current, [
    { ...originalAction(), breakTime: '90,90' },
    { ...originalAction(), breakTime: '120,120' }
  ]);
  const result = reconcileSavedEditPayload(baseline, generated, context, { allowedChanges: ['rest'], generatedPresetDefaults: true });
  assert.deepEqual(result.actionLibraryList.map(action => action.counterweight), ['10,10', '11,12']);
  assert.deepEqual(result.actionLibraryList.map(action => action.capacity), [100, 237]);
  assert.deepEqual(diffSavedEditPayloads(baseline, result, context).categories, ['rest']);
});

test('safe non-load scientific scopes preserve selectors without hiding unauthorized execution changes', () => {
  const current = currentTemplate([{ ...originalAction(), counterweight: '12,11', counterweight2: '12,11' }]);
  const baseline = baselineFor(current);
  const generated = proposedFor(current, [{ ...originalAction(), sportMode: '3,3', breakTime: '90,90' }]);
  generated.name = 'Renamed';
  generated.actionLibraryList[0].selectCompletionMethod = '1,1';
  const options = { allowedChanges: ['name', 'rest', 'resistance_mode'], generatedPresetDefaults: true };
  const result = reconcileSavedEditPayload(baseline, generated, context, options);
  assert.equal(result.actionLibraryList[0].counterweight, '12,11');
  assert.equal(result.actionLibraryList[0].capacity, 100);
  assert.equal(result.totalCapacity, 100);
  assert.equal(Object.hasOwn(result.actionLibraryList[0], 'selectCompletionMethod'), false);
  assertSavedEditScope(diffSavedEditPayloads(baseline, result, context), options.allowedChanges);
  for (const allowedChanges of [['rest'], ['name'], ['resistance_mode'], ['exercise_order'], ['rest', 'load']]) {
    const rejected = reconcileSavedEditPayload(baseline, generated, context, { ...options, allowedChanges });
    assert.throws(() => assertSavedEditScope(diffSavedEditPayloads(baseline, rejected, context), allowedChanges), /scope/);
  }
  for (const overrides of [{ explicitActions: [{}] }, { explicitTotalCapacity: true }]) {
    const rejected = reconcileSavedEditPayload(baseline, generated, context, { ...options, ...overrides });
    assert.throws(() => assertSavedEditScope(diffSavedEditPayloads(baseline, rejected, context), options.allowedChanges), /load/);
  }
});

test('unique reorder retains matched representations and exposes real dose or load changes', () => {
  const first = { ...originalAction(), counterweight: '12', counterweight2: '12', weights: '3.5' };
  const second = { ...originalAction(), groupId: 11, actionLibraryId: 102, counterweight: '10,9', counterweight2: '10,9', capacity: 237 };
  const current = currentTemplate([first, second]);
  const baseline = baselineFor(current);
  const reordered = { ...baseline, actionLibraryList: [baseline.actionLibraryList[1], { ...baseline.actionLibraryList[0], counterweight: '12', counterweight2: '12' }] };
  assert.deepEqual(diffSavedEditPayloads(baseline, reordered, context).categories, ['exercise_order']);
  const options = { allowedChanges: ['exercise_order'], generatedPresetDefaults: true };
  for (const patch of [{ setsAndReps: '9,8' }, { counterweight: '11,11', counterweight2: '11,11' }, { templatePresetId: 5, counterweight: '7,7', counterweight2: '7,7' }]) {
    const changed = structuredClone(reordered);
    Object.assign(changed.actionLibraryList[0], patch);
    const result = reconcileSavedEditPayload(baseline, changed, context, options);
    assert.throws(() => assertSavedEditScope(diffSavedEditPayloads(baseline, result, context), ['exercise_order']), /dose|load/);
  }
});

test('duplicate identity permutation is explicitly ambiguous without verified occurrence mapping', () => {
  const duplicate = { ...originalAction(), counterweight: '12,11', counterweight2: '12,11' };
  const other = { ...originalAction(), groupId: 11, actionLibraryId: 102 };
  const baseline = baselineFor(currentTemplate([originalAction(), duplicate, other]));
  const reordered = { ...baseline, actionLibraryList: [baseline.actionLibraryList[2], baseline.actionLibraryList[0], baseline.actionLibraryList[1]] };
  assert.throws(() => diffSavedEditPayloads(baseline, reordered, context), /Ambiguous duplicate/);
  assert.throws(() => reconcileSavedEditPayload(baseline, reordered, context, { allowedChanges: ['exercise_order'], generatedPresetDefaults: true }), /Ambiguous duplicate/);
});

test('trusted occurrence mapping preserves repeated logical-entry ordinals and rejects stale or forged bindings', () => {
  const omitted = { status: 'omitted_user_preference', items: [] };
  const exercises = [{ id: 10, actionLibraryId: 101, entryId: 100, section: 'main' }, { id: 11, actionLibraryId: 102, entryId: 101, section: 'main' }];
  const plan = { exercises, warmup: omitted, postWorkoutStretching: omitted };
  const oldEntries = [exercises[0], exercises[1], exercises[0], exercises[1]].map(exercise => ({ exercise }));
  const oldActions = oldEntries.map(({ exercise }, index) => ({ ...originalAction(), groupId: exercise.id, actionLibraryId: exercise.actionLibraryId, counterweight: `${9 + index},${9 + index}`, counterweight2: `${9 + index},${9 + index}`, capacity: 100 + index }));
  const baseline = baselineFor(currentTemplate(oldActions));
  const proposed = { ...baseline, actionLibraryList: [oldActions[1], oldActions[0], oldActions[3], oldActions[2]].map(action => ({ ...action, counterweight: '13,13', counterweight2: '13,13', capacity: 457.6 })) };
  const newPlan = { ...plan, exercises: [exercises[1], exercises[0]] };
  const newEntries = [exercises[1], exercises[0], exercises[1], exercises[0]].map(exercise => ({ exercise }));
  const fingerprint = 'a'.repeat(64);
  const identity = createSavedPlanIdentity(plan, oldEntries, baseline, fingerprint);
  const mapping = createSavedEditOccurrenceMapping(identity, baseline, newPlan, newEntries, proposed, fingerprint);
  const mappedContext = { ...context, savedEditOccurrenceMapping: mapping };
  const result = reconcileSavedEditPayload(baseline, proposed, mappedContext, { allowedChanges: ['exercise_order'], generatedPresetDefaults: true });
  assert.deepEqual(result.actionLibraryList.map(action => action.counterweight), ['10,10', '9,9', '12,12', '11,11']);
  assert.deepEqual(result.actionLibraryList.map(action => action.capacity), [101, 100, 103, 102]);
  assert.deepEqual(diffSavedEditPayloads(baseline, result, mappedContext).categories, ['exercise_order']);
  assert.throws(() => createSavedEditOccurrenceMapping(identity, baseline, newPlan, newEntries, proposed, 'b'.repeat(64)), /matched/);
  assert.throws(() => createSavedEditOccurrenceMapping(undefined, baseline, newPlan, newEntries, proposed, fingerprint), /matched/);
  const forged = structuredClone(mapping); forged.after[0].entryId = 999;
  assert.throws(() => reconcileSavedEditPayload(baseline, proposed, { ...context, savedEditOccurrenceMapping: forged }, { allowedChanges: ['exercise_order'], generatedPresetDefaults: true }), /membership|alignment/);
  const stale = structuredClone(baseline); stale.actionLibraryList[0].counterweight = '13,13'; stale.actionLibraryList[0].counterweight2 = '13,13';
  assert.throws(() => diffSavedEditPayloads(stale, proposed, mappedContext), /stale/);
});

for (const duplicate of [false, true]) test(`version3 compressed static identity permits ${duplicate ? 'duplicate' : 'unique'} reorder plus authorized mode only`, async () => {
  const exercises = [{ id: 10, actionLibraryId: 101, entryId: 100, section: 'main' }, { id: duplicate ? 10 : 11, actionLibraryId: duplicate ? 101 : 102, entryId: 101, section: 'main' }];
  const omitted = { status: 'omitted_user_preference', items: [] };
  const plan = { exercises, warmup: omitted, postWorkoutStretching: omitted };
  const staticContext = { staticLoadProtocol: 'account-unit-verbatim', displayUnit: 'kg' };
  const actions = exercises.map((exercise, index) => ({ ...originalAction(), groupId: exercise.id, actionLibraryId: exercise.actionLibraryId, templatePresetId: -1, weights: `${8 + index},${8 + index}`, counterweight: '', counterweight2: '', capacity: 123 + index }));
  const expanded = buildSavedTemplateUpdatePayload(currentTemplate(actions), staticContext);
  const fingerprint = 'a'.repeat(64);
  const identity = createSavedPlanIdentity(plan, exercises.map(exercise => ({ exercise })), expanded, fingerprint);
  const current = currentTemplate(actions.map((action, index) => ({ ...action, weights: index ? '9' : 8 })));
  const baseline = buildSavedTemplateUpdatePayload(current, staticContext);
  const nextPlan = { ...plan, exercises: [...exercises].reverse() };
  const generated = { ...baseline, totalCapacity: 999, actionLibraryList: [...actions].reverse().map(action => ({ ...action, sportMode: '2,2', capacity: 999 })) };
  const start = source.indexOf('async function savedEditOccurrenceContext('), end = source.indexOf('\nasync function updateProgramCoachNoteName', start);
  const occurrence = runWithRecoveryFixture(`(${source.slice(start, end).trim()})`, {
    readProgramCoachNotes: async () => ({ programs: { [current.code]: { savedPlanIdentity: identity } } }), createSavedEditOccurrenceMapping,
    expandPlanForSerialization: value => value.exercises.map(exercise => ({ exercise })), savedIdentityAccountFingerprint: () => fingerprint
  });
  const allowedChanges = ['exercise_order', 'resistance_mode'];
  const mappedContext = await occurrence('synthetic', current, baseline, nextPlan, generated, {}, staticContext, allowedChanges);
  assert.equal(Boolean(mappedContext.savedEditOccurrenceMapping), duplicate);
  const result = reconcileSavedEditPayload(baseline, generated, mappedContext, { allowedChanges, generatedPresetDefaults: true });
  assert.deepEqual(result.actionLibraryList.map(action => action.capacity), [124, 123]);
  assert.equal(result.totalCapacity, 247);
  assert.deepEqual(diffSavedEditPayloads(baseline, result, mappedContext).categories, ['exercise_order', 'resistance_mode']);
  assert.equal(assertSavedEditScope(diffSavedEditPayloads(baseline, result, mappedContext), allowedChanges).permitted, true);
  for (const patch of [{ weights: '9,10' }, { setsAndReps: '9,8' }]) {
    const changed = structuredClone(generated); Object.assign(changed.actionLibraryList[0], patch);
    const rejected = reconcileSavedEditPayload(baseline, changed, mappedContext, { allowedChanges, generatedPresetDefaults: true });
    assert.throws(() => assertSavedEditScope(diffSavedEditPayloads(baseline, rejected, mappedContext), allowedChanges), /load|dose/);
  }
});

test('trusted duplicate reorder keeps distinct static loads alongside Smart RM without unit conversion', () => {
  const actions = [
    { ...originalAction(), counterweight: '12,11', counterweight2: '12,11' },
    { ...originalAction(), counterweight: '10,9', counterweight2: '10,9', capacity: 237 },
    { ...originalAction(), groupId: 11, actionLibraryId: 102, templatePresetId: -1, weights: '40,45', counterweight: '', counterweight2: '', capacity: 333 }
  ];
  const baseline = baselineFor(currentTemplate(actions));
  const generated = { ...baseline, actionLibraryList: [structuredClone(baseline.actionLibraryList[2]),
    { ...originalAction() }, { ...originalAction() }] };
  const plan = { exercises: actions.map((action, index) => ({ id: action.groupId, actionLibraryId: action.actionLibraryId, entryId: 100 + index, section: 'main' })),
    warmup: { status: 'omitted_user_preference', items: [] }, postWorkoutStretching: { status: 'omitted_user_preference', items: [] } };
  const nextPlan = { ...plan, exercises: [plan.exercises[2], plan.exercises[1], plan.exercises[0]] };
  const entries = value => value.exercises.map(exercise => ({ exercise }));
  const fingerprint = 'a'.repeat(64);
  const identity = createSavedPlanIdentity(plan, entries(plan), baseline, fingerprint);
  const mapping = createSavedEditOccurrenceMapping(identity, baseline, nextPlan, entries(nextPlan), generated, fingerprint);
  const mappedContext = { ...context, savedEditOccurrenceMapping: mapping };
  const result = reconcileSavedEditPayload(baseline, generated, mappedContext, { allowedChanges: ['exercise_order'], generatedPresetDefaults: true });
  assert.equal(result.actionLibraryList[0].weights, baseline.actionLibraryList[2].weights);
  assert.equal(result.actionLibraryList[0].templatePresetId, -1);
  assert.deepEqual(result.actionLibraryList.slice(1).map(action => action.counterweight), ['10,9', '12,11']);
  assert.deepEqual(diffSavedEditPayloads(baseline, result, mappedContext).categories, ['exercise_order']);
});
