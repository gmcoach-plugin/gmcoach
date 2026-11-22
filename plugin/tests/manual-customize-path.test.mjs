import { runWithAccessoryFixture, installAccessoryFixture } from './accessory-empty-store-fixture.mjs';
import * as timeBudgetFunctions from '../time-budget.mjs';
import { normalizePreferenceReviews, preferenceReviewsSchema } from '../preference-compliance.mjs';
import { normalizeRecoveryContextDeclaration } from '../recovery-context.mjs';
const syntheticRecoveryContext = { status: 'not_requested', limitations: ['Synthetic fixture uses no reported health data; biological readiness is not inferred.'] };
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import * as payloadFunctions from '../program-payload.mjs';
import { normalizeExerciseEntry, validateExecutablePlanSections } from '../executable-plan-sections.mjs';
import { buildPresetPayload, resolveActionLibraryVariantId } from '../program-serialization.mjs';
import { verifyCreatedTemplateReadback } from '../saved-templates.mjs';
import { snapshotNormalizedPlan } from '../reviewed-plan-record.mjs';
import { encodeStaticLoad, decodeStaticLoad } from '../static-load-protocol.mjs';
import { createHash } from 'node:crypto';
import { buildSavedTemplateUpdatePayload, verifyUpdatedTemplateReadback, resolveSavedTemplateLoadPresentation } from '../saved-templates.mjs';
import { diffSavedEditPayloads, savedEditExecutionDisclosure, assertSavedEditScope, reconcileSavedEditPayload } from '../saved-edit-diff.mjs';
import { assertStrengthAnchorMatchesActionVariant } from '../coaching-profile.mjs';

const source = readFileSync(new URL('../mcp_server.mjs', import.meta.url), 'utf8');
function extract(startText, endText) {
  const start = source.indexOf(startText), end = source.indexOf(endText, start);
  assert.ok(start >= 0 && end > start);
  return source.slice(start, end).trim();
}
const evidenceSource = readFileSync(new URL('../training-evidence.mjs', import.meta.url), 'utf8');
const baseSetDecisionValue = runWithAccessoryFixture(`(${evidenceSource.slice(evidenceSource.indexOf('function baseSetDecisionValue(')).trim()})`);
const normalize = runWithAccessoryFixture(`(${extract('function normalizePlan(', '\nfunction assertQuickTestProgramShape')})`, {
  ...timeBudgetFunctions, ...payloadFunctions, normalizeRecoveryContextDeclaration, normalizePreferenceReviews, normalizeExerciseEntry, validateExecutablePlanSections,
  resolveProfileStrengthAnchor: ({ providedAnchor }) => providedAnchor,
  isSupportedCustomizeAnchorSource: value => value === 'speediance-reported',
  classifyPrescriptionUnit: unit => ['sec', 'seconds'].includes(unit) ? 'seconds' : 'reps',
  normalizeTrainingEvidence: (rationale, evidence) => ({ rationale, evidence }),
  normalizeSupersetBlocks: () => [],
  normalizeEvidencePlanItems: (warmup, postWorkoutStretching) => ({ warmup, postWorkoutStretching }),
  normalizeEvidenceCoverage: (_evidence, _coverage, exercises) => exercises.flatMap(exercise => exercise.sets.map((set, index) => ({ category: 'set_load', target: `set:${exercise.entryId}:${index + 1}`, status: 'applied', relationship: 'direct', reasoning: 'Synthetic load binding fixture; research services isolated.', evidenceIds: [], supportingExcerpts: [], sourceAssessments: [], value: baseSetDecisionValue(exercise, set, 'set_load') }))),
  assertNoUnserializedTechniqueInstructions: () => {}
});
const metadata = { batch: { actionLibraryList: [{ id: 142 }] }, detail: { isLeftRight: 0, isBarbell: 0 } };
function input(unit) {
  return { name: 'Manual Customize', recoveryContext: syntheticRecoveryContext, rationale: 'Synthetic regression', evidence: [], scienceGate: 'user_declined',
    warmup: { status: 'omitted_user_preference', items: [] }, postWorkoutStretching: { status: 'omitted_user_preference', items: [] },
    exercises: [{ id: 42, actionLibraryId: 142, title: 'Confirmed resisted movement', loadType: 'customize-manual', staticLoadRequested: true,
      sets: (unit === 'kg' ? [8, 12, 20] : [15.4, 17.6, 20.9]).map((weight, index) => ({ unit: 'reps', reps: 8 + index, weight, weightUnit: unit, rirTarget: 2, mode: index + 1, restSeconds: 60 + index })) }]
  };
}
function prepare(unit, protocol, { unitSource = 'speediance-account-userinfo', exerciseMetadata = metadata } = {}) {
  return runWithAccessoryFixture(`(${extract('async function prepareProgramPayload(', '\nasync function validateChangedTemplateExercises')})`, {
    assertExerciseMetadataGroupScope: runWithAccessoryFixture(`(${source.slice(source.indexOf('function assertExerciseMetadataGroupScope('), source.indexOf('\nasync function getExerciseApiMetadata(', source.indexOf('function assertExerciseMetadataGroupScope('))).trim()})`),
    ...timeBudgetFunctions, ...payloadFunctions, buildPresetPayload, resolveActionLibraryVariantId, encodeStaticLoad, decodeStaticLoad, assertStrengthAnchorMatchesActionVariant,
    readProfileConfig: async () => ({ config: { deviceType: 1 }, password: '' }),
    getAccountWeightUnitDetails: async () => ({ unit, source: unitSource }),
    getExerciseApiMetadata: async () => exerciseMetadata,
    resolveProfileStaticProtocolContext: async () => ({ staticLoadProtocol: protocol }),
    resolveStaticProtocolReadContext: () => { throw new Error('Manual static writes must use write protocol context.'); }
  });
}
for (const protocol of ['legacy-reference-client-wire-lb-get-kg', 'account-unit-verbatim']) {
  test(`actual profile-auto normalization disclosure normalizer/prepare/public/approval/readback ${protocol}`, async () => {
    const args = input('lb'); args.showCalculatedLoads = true;
    const exerciseInput = args.exercises[0];
    exerciseInput.loadType = 'profile-auto';
    delete exerciseInput.staticLoadRequested;
    exerciseInput.userRequestedReferenceClientCustomize = true;
    exerciseInput.strengthAnchor = { oneRepMax: 125, unit: 'lb', source: 'speediance-reported' };
    exerciseInput.sets = [15, 8].map(reps => ({ unit: 'reps', reps, rirTarget: 2, mode: 1, restSeconds: 90 }));
    const plan = structuredClone(normalize(args));
    const sets = plan.exercises[0].sets;
    assert.deepEqual(sets.map(set => set.calculatedLoad), [77.2, 97]); // device kg step (35/44 kg) in lb
    const beforeEvidence = JSON.stringify(plan.decisionEvidence);
    const beforeEstimates = JSON.stringify(sets.map(set => set.loadEstimate));
    const { payload } = await prepare('lb', protocol)(plan, 'synthetic');
    assert.deepEqual(sets.map(set => set.calculatedLoad), [77.2, 97]); // device kg step (35/44 kg) in lb
    assert.equal(JSON.stringify(plan.decisionEvidence), beforeEvidence);
    assert.equal(JSON.stringify(sets.map(set => set.loadEstimate)), beforeEstimates);
    assert.equal(new Set(payload.actionLibraryList[0].weights.split(',')).size, 2);
    const previewStart = source.indexOf('exercises: executionExercises.map((exercise) => ({', source.indexOf("case 'speediance_preview_program'"));
    const previewEnd = source.indexOf('\n          showCalculatedLoads:', previewStart);
    assert.ok(previewStart > 0 && previewEnd > previewStart);
    const expression = source.slice(previewStart + 'exercises: '.length, previewEnd).trim().replace(/,$/, '');
    const publicPreview = runWithAccessoryFixture(`(plan, displayUnit, executionExercises = plan.exercises) => (${expression})`)(plan, 'lb');
    const render = runWithAccessoryFixture(`(${extract('function approvalPage(', '\nasync function handleApprovalRequest')})`, {
      escapeHtml: value => String(value ?? ''), RESISTANCE_MODES: { 1: 'Standard' }, setupPage: (_title, _message, form) => form
    });
    const html = render({ plan, profile: 'synthetic', preview: { showCalculatedLoads: true }, payload });
    const readback = { ...structuredClone(payload), id: 1001, code: 'synthetic-template' };
    if (protocol === 'legacy-reference-client-wire-lb-get-kg') readback.actionLibraryList[0].weights = payload.actionLibraryList[0].weights.split(',').map(value => Number(value) / 2.2).join(',');
    assert.equal(verifyCreatedTemplateReadback({ expectedPayload: payload, readback, existingTemplateCodes: [], staticLoadProtocol: protocol, accountUnit: 'lb' }).verified, true);
    for (const [index, set] of sets.entries()) {
      const displayed = publicPreview[0].sets[index];
      assert.equal(displayed.weight, set.calculatedLoad);
      assert.equal(displayed.weightUnit, 'lb');
      assert.equal(set.apiLoadNormalized, protocol === 'legacy-reference-client-wire-lb-get-kg');
      if (set.apiLoadNormalized) {
        assert.equal(displayed.serializedDisplayWeight, set.serializedDisplayWeight);
        assert.equal(displayed.serializedDisplayUnit, 'lb');
        assert.match(displayed.normalizationMeaning, /not measured device resistance/);
        assert.ok(html.includes(`zapis API ≈ ${set.serializedDisplayWeight} lb`));
      } else {
        assert.equal(displayed.serializedDisplayWeight, undefined);
        assert.doesNotMatch(html, /zapis API ≈/);
      }
      assert.ok(html.includes(`≈ ${set.calculatedLoad} lb`));
      const savedDisplay = resolveSavedTemplateLoadPresentation(readback.actionLibraryList[0], index, 2, 'lb', 'reps', { staticLoadProtocol: protocol, accountUnit: 'lb' });
      assert.equal(savedDisplay.displayLoad, `${Math.round(set.serializedDisplayWeight * 10) / 10} lb`);
    }
    const hiddenPlan = structuredClone(plan); hiddenPlan.showCalculatedLoads = false;
    const hidden = runWithAccessoryFixture(`(plan, displayUnit, executionExercises = plan.exercises) => (${expression})`)(hiddenPlan, 'lb')[0].sets[0];
    assert.equal(hidden.weight, undefined); assert.equal(hidden.serializedDisplayWeight, undefined);
    const publicPlanStart = source.indexOf('      const publicPlan = {', source.indexOf("case 'speediance_preview_program'"));
    const publicPlanEnd = source.indexOf('\n      return {', publicPlanStart);
    assert.ok(publicPlanStart > 0 && publicPlanEnd > publicPlanStart);
    const publicPlanRenderer = runWithAccessoryFixture(`plan => { ${source.slice(publicPlanStart, publicPlanEnd)} return publicPlan; }`, { payload });
    assert.equal(publicPlanRenderer(hiddenPlan).exercises[0].sets[0].serializedDisplayWeight, undefined);
    assert.equal(publicPlanRenderer(plan).exercises[0].sets[0].serializedDisplayWeight, sets[0].serializedDisplayWeight);
    assert.doesNotMatch(render({ plan: hiddenPlan, profile: 'synthetic', preview: { showCalculatedLoads: false }, payload }), /zapis API ≈/);
    const tampered = structuredClone(readback); tampered.actionLibraryList[0].weights = '50,50';
    assert.equal(verifyCreatedTemplateReadback({ expectedPayload: payload, readback: tampered, existingTemplateCodes: [], staticLoadProtocol: protocol, accountUnit: 'lb' }).verified, false);
  });
}
for (const unit of ['kg', 'lb']) for (const protocol of ['legacy-reference-client-wire-lb-get-kg', 'account-unit-verbatim']) {
  test(`real manual Customize normalizer/evidence/prepare/readback ${unit}/${protocol}`, async () => {
    const normalized = normalize(input(unit));
    const plan = structuredClone(normalized);
    assert.equal(plan.exercises[0].strengthAnchor, undefined);
    assert.equal(plan.exercises[0].staticLoadRequested, true);
    for (const set of plan.exercises[0].sets) assert.equal(baseSetDecisionValue(plan.exercises[0], set, 'set_load'), `loadType=customize-manual;weight=${set.weight};weightUnit=${unit}`);
    const { payload } = await prepare(unit, protocol)(plan, 'synthetic');
    const action = payload.actionLibraryList[0];
    assert.equal(action.templatePresetId, -1);
    assert.equal(action.counterweight, ''); assert.equal(action.counterweight2, '');
    assert.equal(new Set(action.weights.split(',')).size, 3);
    assert.equal(action.sportMode, '1,2,3'); assert.equal(action.breakTime, '60,61,62');
    const readback = { ...structuredClone(payload), id: 1001, code: 'synthetic-template' };
    if (protocol === 'legacy-reference-client-wire-lb-get-kg') readback.actionLibraryList[0].weights = action.weights.split(',').map(value => Number(value) / 2.2).join(',');
    assert.equal(verifyCreatedTemplateReadback({ expectedPayload: payload, readback, existingTemplateCodes: [], staticLoadProtocol: protocol, accountUnit: unit }).verified, true);
    const saved = snapshotNormalizedPlan(plan);
    assert.equal(saved.exercises[0].staticLoadRequested, true);
    assert.deepEqual(saved.exercises[0].sets.map(set => [set.weight, set.weightUnit]), plan.exercises[0].sets.map(set => [set.weight, set.weightUnit]));
    const tampered = structuredClone(readback); tampered.actionLibraryList[0].weights = '50,50,50';
    assert.equal(verifyCreatedTemplateReadback({ expectedPayload: payload, readback: tampered, existingTemplateCodes: [], staticLoadProtocol: protocol, accountUnit: unit }).verified, false);
  });
}
// Independent pinned writer oracle: hbui3 4e12bc api_client.py:531–564 and
// labatt fdd62c api_client.py:739–786. Legacy lb first snaps account input to
// 7/8 kg; these constants do not call the production conversion/rounding helpers.
const mixedManualWriterOracle = {
  'legacy-reference-client-wire-lb-get-kg': { kg: { weights: '17.6,26.4', capacity: 932.8 }, lb: { weights: '15.4,17.6', capacity: 651.2 } },
  'account-unit-verbatim': { kg: { weights: '8.0,12.0', capacity: 424 }, lb: { weights: '15.4,17.6', capacity: 651.2 } }
};
for (const unit of ['kg', 'lb']) for (const protocol of ['legacy-reference-client-wire-lb-get-kg', 'account-unit-verbatim']) {
  test(`actual manual Customize mixed reps/seconds asymmetric sides ${unit}/${protocol}`, async () => {
    const args = input(unit);
    const exerciseInput = args.exercises[0];
    exerciseInput.unilateralPrescription = 'explicit-sides';
    exerciseInput.sets = [
      { side: 1, unit: 'reps', reps: 8, rirTarget: 2, weight: unit === 'kg' ? 8 : 15.4, weightUnit: unit, mode: 1, restSeconds: 0 },
      { side: 2, unit: 'seconds', durationSeconds: 30, weight: unit === 'kg' ? 12 : 17.6, weightUnit: unit, mode: 3, restSeconds: 75 }
    ];
    const catalog = { exerciseRecordsById: new Map([[42, { kind: 'strength' }]]) };
    assert.throws(() => normalize(args), /confirmed strength catalog metadata/);
    const plan = structuredClone(normalize(args, {}, catalog));
    const normalizedSets = structuredClone(plan.exercises[0].sets);
    const evidenceBefore = JSON.stringify(plan.decisionEvidence);
    const unilateralMetadata = { batch: { actionLibraryList: [{ id: 142 }], isLeftRight: 1 }, detail: { isLeftRight: 1, isBarbell: 0 } };
    const { payload } = await prepare(unit, protocol, { exerciseMetadata: unilateralMetadata })(plan, 'synthetic');
    const action = payload.actionLibraryList[0];
    assert.equal(action.templatePresetId, -1);
    assert.equal(action.leftRight, '1,2'); assert.equal(action.setsAndReps, '8,30');
    assert.equal(action.completionMethod, '1,2'); assert.equal(action.countType, '1,2');
    assert.equal(action.sportMode, '1,3'); assert.equal(action.breakTime, '0,75');
    assert.equal(action.counterweight, ''); assert.equal(action.counterweight2, '');
    const oracle = mixedManualWriterOracle[protocol][unit];
    assert.equal(action.weights, oracle.weights);
    // Only binary floating-point sum error is tolerated, never wire rounding drift.
    const capacityTolerance = Number.EPSILON * Math.max(1, oracle.capacity) * 8;
    assert.ok(Math.abs(action.capacity - oracle.capacity) <= capacityTolerance, 'action capacity must match independent writer oracle');
    assert.ok(Math.abs(payload.totalCapacity - oracle.capacity) <= capacityTolerance, 'totalCapacity must match independent writer oracle');
    assert.equal(JSON.stringify(plan.decisionEvidence), evidenceBefore);
    for (const [index, set] of normalizedSets.entries()) {
      assert.equal(plan.exercises[0].sets[index].unit, set.unit);
      assert.equal(plan.exercises[0].sets[index].weight, set.weight);
      assert.equal(plan.exercises[0].sets[index].side, set.side);
    }
    const readback = { ...structuredClone(payload), id: 1001, code: 'synthetic-mixed-side' };
    if (protocol === 'legacy-reference-client-wire-lb-get-kg') readback.actionLibraryList[0].weights = action.weights.split(',').map(value => Number(value) / 2.2).join(',');
    const verify = value => verifyCreatedTemplateReadback({ expectedPayload: payload, readback: value, existingTemplateCodes: [], expectedSetUnits: [['reps', 'seconds']], staticLoadProtocol: protocol, accountUnit: unit });
    assert.equal(verify(readback).verified, true);
    // Saved endpoint countType is non-authoritative metadata when completionMethod resolves each unit.
    const metadataOnly = structuredClone(readback); metadataOnly.actionLibraryList[0].countType = '1,1';
    assert.equal(verify(metadataOnly).verified, true);
    for (const [field, value] of [['leftRight', '2,1'], ['setsAndReps', '30,8'], ['completionMethod', '1,1'], ['sportMode', '3,1'], ['breakTime', '75,0'], ['weights', readback.actionLibraryList[0].weights.split(',').reverse().join(',')]]) {
      const changed = structuredClone(readback); changed.actionLibraryList[0][field] = value;
      assert.equal(verify(changed).verified, false, `readback must reject ${field} drift`);
    }
    const smartRm = { ...plan.exercises[0], loadType: 'smart-rm', smartRmPresetName: 'Gain Muscle', smartRmPresetId: 1 };
    assert.throws(() => buildPresetPayload({ ...plan, exercises: [smartRm] }, new Map([[42, unilateralMetadata]]), 1, unit, { staticLoadProtocol: protocol }), /serie czasowe pozostają w sekundach i nie mogą używać Smart RM/);
  });
}

test('manual Customize rejects missing authorization, mixed/invalid unit and wrong-mode fields', () => {
  for (const mutate of [exercise => { delete exercise.staticLoadRequested; }, exercise => { exercise.staticLoadRequested = false; }, exercise => { exercise.sets[1].weightUnit = 'lb'; }, exercise => { exercise.sets[0].weightUnit = 'stone'; }, exercise => { exercise.sets[0].weightKg = 8; }, exercise => { exercise.strengthAnchor = {}; }]) {
    const args = input('kg'); mutate(args.exercises[0]); assert.throws(() => normalize(args));
  }
});
test('actual prepare rejects account unit change and local fallback despite confirmedDisplayUnit', async () => {
  const plan = structuredClone(normalize(input('kg'))); plan.confirmedDisplayUnit = 'kg';
  await assert.rejects(prepare('lb', 'legacy-reference-client-wire-lb-get-kg')(plan, 'synthetic'), /account unit changed/);
  await assert.rejects(prepare('kg', 'legacy-reference-client-wire-lb-get-kg', { unitSource: 'user-confirmed' })(plan, 'synthetic'), /current account unit/);
  const invalid = structuredClone(plan); invalid.exercises[0].sets[0].weight = 8.1;
  await assert.rejects(prepare('kg', 'legacy-reference-client-wire-lb-get-kg')(invalid, 'synthetic'), /step/);
});
test('manual Customize final serializer rejects unauthorized direct input and real approval shows requested account loads', async () => {
  const plan = structuredClone(normalize(input('lb')));
  const exercise = plan.exercises[0];
  const { payload } = await prepare('lb', 'legacy-reference-client-wire-lb-get-kg')(plan, 'synthetic');
  const renderer = runWithAccessoryFixture(`(${extract('function approvalPage(', '\nasync function handleApprovalRequest')})`, {
    escapeHtml: value => String(value ?? ''), RESISTANCE_MODES: { 1: 'Standard', 2: 'Chain', 3: 'Eccentric' }, setupPage: (_title, _message, form) => form
  });
  const html = renderer({ plan, profile: 'synthetic', preview: {}, payload });
  for (const set of exercise.sets) assert.ok(html.includes(`${set.weight} lb`));
  const patchHtml = renderer({ plan, profile: 'synthetic', preview: {}, payload, editPatch: { smart_rm_conversion: [{ groupId: 42, actionLibraryId: 142, smartRmPresetName: 'Gain Muscle', sets: [{ reps: 8, rirTarget: 2 }] }] } });
  assert.match(patchHtml, /Zatwierdzana poprawka istniejącego treningu/);
  assert.match(patchHtml, /42\/142: Smart RM Gain Muscle; 8 powt\. · RIR 2/);
  const modeHtml = renderer({ plan, profile: 'synthetic', preview: {}, payload, editPatch: { resistance_mode_updates: [{ groupId: 42, actionLibraryId: 142, modes: [2, 3] }] } });
  assert.match(modeHtml, /42\/142: Chain; Eccentric/);
  const changed = { ...exercise.sets[0], weight: 16 };
  assert.notEqual(baseSetDecisionValue(exercise, changed, 'set_load'), baseSetDecisionValue(exercise, exercise.sets[0], 'set_load'));
  delete exercise.staticLoadRequested;
  assert.throws(() => buildPresetPayload(plan, new Map([[42, metadata]]), 1, 'lb'), /explicit authorization/);
});
test('timed manual Customize requires confirmed strength and preserves seconds without RIR', async () => {
  const args = input('kg'); args.exercises[0].sets = [{ unit: 'sec', durationSeconds: 30, weight: 8, weightUnit: 'kg', mode: 1, restSeconds: 60 }];
  assert.throws(() => normalize(args), /confirmed strength/);
  const catalog = { exerciseRecordsById: new Map([[42, { kind: 'strength' }]]) };
  const normalized = structuredClone(normalize(args, {}, catalog));
  const { payload } = await prepare('kg', 'legacy-reference-client-wire-lb-get-kg')(normalized, 'synthetic');
  assert.equal(payload.actionLibraryList[0].completionMethod, '2');
  assert.equal(payload.actionLibraryList[0].setsAndReps, '30');
  assert.equal(normalized.exercises[0].sets[0].rirTarget, undefined);
});

for (const unit of ['kg', 'lb']) for (const protocol of ['legacy-reference-client-wire-lb-get-kg', 'account-unit-verbatim']) for (const timed of [false, true]) {
  test(`manual Customize discloses serialized API normalization ${unit}/${protocol}/${timed ? 'seconds' : 'reps'}`, async () => {
    const args = input(unit);
    if (timed) args.exercises[0].sets = args.exercises[0].sets.map(({ reps, rirTarget, ...set }) => ({ ...set, unit: 'sec', durationSeconds: 30 }));
    const catalog = { exerciseRecordsById: new Map([[42, { kind: 'strength' }]]) };
    const plan = structuredClone(normalize(args, {}, catalog));
    // Caller-supplied display claims are overwritten by preparation.
    for (const set of plan.exercises[0].sets) Object.assign(set, { serializedDisplayWeight: 999, serializedDisplayUnit: 'stone', apiLoadNormalized: false });
    const evidenceBefore = JSON.stringify(plan.decisionEvidence);
    const { payload } = await prepare(unit, protocol)(plan, 'synthetic');
    const renderer = runWithAccessoryFixture(`(${extract('function approvalPage(', '\nasync function handleApprovalRequest')})`, {
      escapeHtml: value => String(value ?? ''), RESISTANCE_MODES: { 1: 'Standard', 2: 'Chain', 3: 'Eccentric' }, setupPage: (_title, _message, form) => form
    });
    const html = renderer({ plan, profile: 'synthetic', preview: {}, payload });
    const previewStart = source.indexOf('exercises: executionExercises.map((exercise) => ({', source.indexOf("case 'speediance_preview_program'"));
    const previewEnd = source.indexOf('\n          showCalculatedLoads:', previewStart);
    assert.ok(previewStart >= 0 && previewEnd > previewStart);
    const expression = source.slice(previewStart + 'exercises: '.length, previewEnd).trim().replace(/,$/, '');
    const preview = runWithAccessoryFixture(`(plan, displayUnit, executionExercises = plan.exercises) => (${expression})`)(plan, unit);
    // lb inputs on the device kg step (7/8/9.5 kg) round-trip like kg: no residual API normalization.
    const expectedNormalized = false;
    const expectedValues = unit === 'kg' ? [8, 12, 20] : [15.4, 17.6, 20.9];
    plan.exercises[0].sets.forEach((set, index) => {
      assert.equal(set.weight, args.exercises[0].sets[index].weight);
      assert.equal(set.serializedDisplayWeight, expectedValues[index]);
      assert.equal(set.serializedDisplayUnit, unit);
      assert.equal(set.apiLoadNormalized, expectedNormalized);
      assert.ok(html.includes(`wybrano ${set.weight} ${unit}`));
      assert.equal(preview[0].sets[index].weight, set.weight);
      if (expectedNormalized) {
        assert.ok(html.includes(`zapis API ≈ ${expectedValues[index]} lb`));
        assert.equal(preview[0].sets[index].serializedDisplayWeight, expectedValues[index]);
        assert.match(preview[0].sets[index].normalizationMeaning, /not measured device resistance/);
      } else assert.equal(preview[0].sets[index].serializedDisplayWeight, undefined);
    });
    assert.equal(JSON.stringify(plan.decisionEvidence), evidenceBefore);
    if (expectedNormalized) assert.match(html, /nie pomiar oporu/);
    else assert.doesNotMatch(html, /zapis API ≈/);
    const preparedPlanJson = JSON.stringify(plan);
    const second = await prepare(unit, protocol)(plan, 'synthetic');
    assert.deepEqual(second.payload, payload);
    assert.equal(JSON.stringify(plan), preparedPlanJson, 'Repeated preparation retains exact digest input, including display disclosure.');
  });
}

for (const loadType of ['customize-manual', 'profile-auto']) for (const unit of ['kg', 'lb']) for (const protocol of ['legacy-reference-client-wire-lb-get-kg', 'account-unit-verbatim']) for (const representation of ['number', 'string', 'csv']) for (const category of ['rest', 'resistance_mode']) {
  test(`actual saved preview/commit gates preserve equal ${loadType} loads ${unit}/${protocol}/${representation}/${category}`, async () => {
    const args = input(unit), exercise = args.exercises[0];
    exercise.sets.forEach(set => { set.reps = 8; set.weight = unit === 'kg' ? 8 : 15; set.mode = 1; set.restSeconds = 60; });
    if (loadType === 'profile-auto') {
      Object.assign(exercise, { loadType, userRequestedReferenceClientCustomize: true, strengthAnchor: { oneRepMax: 50, unit, source: 'speediance-reported' } });
      delete exercise.staticLoadRequested;
      exercise.sets.forEach(set => { delete set.weight; delete set.weightUnit; });
    }
    const oldPrepared = await prepare(unit, protocol)(structuredClone(normalize(args)), 'synthetic');
    const current = { ...structuredClone(oldPrepared.payload), id: 1001, code: 'saved-equal', totalCapacity: 123 };
    const wire = oldPrepared.payload.actionLibraryList[0].weights.split(',').map(Number);
    assert.equal(new Set(wire).size, 1, 'Fixture must actually produce equal loads.');
    const getWeight = protocol === 'legacy-reference-client-wire-lb-get-kg' ? wire[0] / 2.2 : wire[0];
    current.actionLibraryList[0].weights = representation === 'number' ? getWeight : representation === 'string' ? String(getWeight) : Array(3).fill(getWeight).join(',');
    current.actionLibraryList[0].capacity = 123;
    exercise.sets.forEach(set => { if (category === 'rest') set.restSeconds = 90; else set.mode = 2; });
    Object.assign(args, { allowed_changes: [category], program_code: current.code, base_digest: 'base' });
    const plan = structuredClone(normalize(args)), prepared = await prepare(unit, protocol)(plan, 'synthetic');
    const context = { ...prepared.staticLoadContext, displayUnit: unit, accountUnit: unit, contextDigest: 'protocol-context' };
    const digest = (_profile, value) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
    const approval = { payload: prepared.payload, plan, staticLoadContext: context, displayUnit: unit, profile: 'p', profileFingerprint: 'fp', intakeFingerprint: 'intake', digest: digest('p', plan), expiresAt: Date.now() + 60000 };
    const writeApprovals = new Map([['edit', approval]]);
    const occurrenceContext = async (_profile, _current, _baseline, _plan, _generated, _config, value) => value;
    const services = { current, approval, writeApprovals, profile: 'p', config: {}, savedEditOccurrenceContext: occurrenceContext, buildSavedTemplateUpdatePayload, reconcileSavedEditPayload, diffSavedEditPayloads, savedEditExecutionDisclosure, assertSavedEditScope };
    const previewStart = source.indexOf('      let editDiff;', source.indexOf("case 'speediance_preview_saved_program_update':"));
    const previewEnd = source.indexOf('      return { ...result, editPreviewId:', previewStart);
    assert.ok(previewStart > 0 && previewEnd > previewStart);
    const preview = runWithAccessoryFixture(`(async args => { ${source.slice(previewStart, previewEnd)} return editDiff; })`, { ...services, result: { previewId: 'edit' } });
    assert.deepEqual(Array.from((await preview(args)).categories), [category]);
    assert.equal(approval.editWirePayload.totalCapacity, 123);
    assert.equal(approval.editWirePayload.actionLibraryList[0].capacity, 123);
    assert.deepEqual(approval.editWirePayload.actionLibraryList[0].weights.split(',').map(Number), wire);
    if (category === 'resistance_mode') {
      const baseline = buildSavedTemplateUpdatePayload(current, context);
      assert.throws(() => assertSavedEditScope(diffSavedEditPayloads(baseline, approval.editWirePayload, context), ['rest']), /resistance_mode/);
      const changedDose = structuredClone(prepared.payload);
      changedDose.actionLibraryList[0].setsAndReps = '9,8,8';
      const rejected = reconcileSavedEditPayload(baseline, { ...baseline, ...changedDose }, context, { allowedChanges: ['resistance_mode'], generatedPresetDefaults: true });
      assert.notEqual(rejected.actionLibraryList[0].capacity, 123, 'Dose changes cannot inherit opaque capacity through the mode guard.');
      assert.throws(() => assertSavedEditScope(diffSavedEditPayloads(baseline, rejected, context), ['resistance_mode']), /dose/);
    }
    const commitStart = source.indexOf('        const baseline = buildSavedTemplateUpdatePayload(current, staticLoadContext);', source.indexOf("case 'speediance_update_saved_program':"));
    const commitEnd = source.indexOf('        let result;', commitStart);
    assert.ok(commitStart > 0 && commitEnd > commitStart);
    const commit = runWithAccessoryFixture(`(async args => { let payload = initial; let staticLoadContext = context; let approvedEditPlan; let approvedEditReviewContext; let approvalEditFingerprint; ${source.slice(commitStart, commitEnd)} return payload; })`, {
      ...services, initial: prepared.payload, context, editModes: [],
      readProfileConfig: async () => ({ config: { deviceType: 1 }, password: '' }), profileConfigFingerprint: () => 'fp',
      savedIdentityAccountFingerprint: () => 'a'.repeat(64), cycleHash: value => createHash('sha256').update(JSON.stringify(value)).digest('hex'), readTrainingProfileRecord: async () => null, currentExerciseCatalog: async () => null,
      normalizePlan: (...values) => structuredClone(normalize(...values)), validatePlanForProfile: async value => ({ plan: value, intakeFingerprint: 'intake' }), planDigest: digest,
      prepareProgramPayload: async value => ({ ...await prepare(unit, protocol)(value, 'synthetic'), staticLoadContext: context })
    });
    const committed = await commit({ base_digest: 'base', edit_preview_id: 'edit' });
    assert.equal(JSON.stringify(committed), JSON.stringify(approval.editWirePayload));
    const readback = { ...structuredClone(committed), actionLibraryList: committed.actionLibraryList.map(action => ({ ...action, weights: representation === 'number' ? getWeight : representation === 'string' ? String(getWeight) : Array(3).fill(getWeight).join(',') })) };
    assert.equal(verifyUpdatedTemplateReadback({ expectedPayload: committed, readback, expectedCode: current.code, staticLoadProtocol: protocol, accountUnit: unit }).verified, true);
    assert.equal(writeApprovals.has('edit'), false);
    // A genuinely different one-set load is outside the approved non-load scope.
    const changed = wire.slice(); changed[1] += 1;
    approval.payload = structuredClone(prepared.payload);
    approval.payload.actionLibraryList[0].weights = changed.join(',');
    writeApprovals.set('edit', approval);
    await assert.rejects(preview(args), /outside approved scope: load/);
    assert.equal(writeApprovals.has('edit'), false);
  });
}

test('actual saved-edit preview and commit bind manual imperial normalization and preserve opaque capacity', async () => {
  const protocol = 'legacy-reference-client-wire-lb-get-kg';
  const oldPlan = structuredClone(normalize(input('lb')));
  const oldPrepared = await prepare('lb', protocol)(oldPlan, 'synthetic');
  const current = { ...structuredClone(oldPrepared.payload), id: 1001, code: 'saved-manual' };
  current.totalCapacity = 123;
  const oldAction = current.actionLibraryList[0];
  Object.assign(oldAction, { weights: '7,8,9.5', capacity: 123 });
  const args = input('lb');
  args.exercises[0].sets.forEach(set => { set.restSeconds += 30; });
  Object.assign(args, { allowed_changes: ['rest'], program_code: current.code, base_digest: 'base' });
  const plan = structuredClone(normalize(args));
  const prepared = await prepare('lb', protocol)(plan, 'synthetic');
  const context = { ...prepared.staticLoadContext, displayUnit: 'lb', accountUnit: 'lb', contextDigest: 'protocol-context' };
  const digest = (_profile, value) => createHash('sha256').update(JSON.stringify({ profile: 'p', plan: value })).digest('hex');
  const approval = { payload: prepared.payload, plan, staticLoadContext: context, displayUnit: 'lb', profile: 'p',
    profileFingerprint: 'fp', intakeFingerprint: 'intake', digest: digest('p', plan), expiresAt: Date.now() + 60000 };
  const writeApprovals = new Map([['edit', approval]]);
  const occurrenceContext = async (_profile, _current, _baseline, _plan, _generated, _config, value) => value;
  const previewStart = source.indexOf('      let editDiff;', source.indexOf("case 'speediance_preview_saved_program_update':"));
  const previewEnd = source.indexOf('      return { ...result, editPreviewId:', previewStart);
  assert.ok(previewStart > 0 && previewEnd > previewStart);
  const preview = runWithAccessoryFixture(`(async function(args) { ${source.slice(previewStart, previewEnd)} return editDiff; })`, {
    current, approval, result: { previewId: 'edit' }, writeApprovals, profile: 'p', config: {},
    savedEditOccurrenceContext: occurrenceContext, buildSavedTemplateUpdatePayload, reconcileSavedEditPayload, diffSavedEditPayloads, savedEditExecutionDisclosure, assertSavedEditScope
  });
  const previewDiff = await preview(args);
  assert.deepEqual(Array.from(previewDiff.categories), ['rest']);
  assert.equal(approval.editWirePayload.totalCapacity, 123);
  assert.equal(approval.editWirePayload.actionLibraryList[0].capacity, 123);
  assert.equal(approval.editWirePayload.actionLibraryList[0].weights, '15.4,17.6,20.9');
  const renderer = runWithAccessoryFixture(`(${extract('function approvalPage(', '\nasync function handleApprovalRequest')})`, {
    escapeHtml: value => String(value ?? ''), RESISTANCE_MODES: { 1: 'Standard', 2: 'Chain', 3: 'Eccentric' }, setupPage: (_title, _message, form) => form
  });
  const html = renderer({ ...approval, preview: {} });
  // Legal lb loads (device kg steps) are shown as chosen; no residual API normalization disclosure.
  for (const requested of [15.4, 17.6, 20.9]) assert.ok(html.includes(`wybrano ${requested} lb`));
  assert.doesNotMatch(html, /zapis API ≈/);
  let liveUnit = 'lb', liveProtocol = protocol;
  const commitStart = source.indexOf('        const baseline = buildSavedTemplateUpdatePayload(current, staticLoadContext);', source.indexOf("case 'speediance_update_saved_program':"));
  const commitEnd = source.indexOf('        let result;', commitStart);
  assert.ok(commitStart > 0 && commitEnd > commitStart);
  const commit = runWithAccessoryFixture(`(async function(args) { let payload = initial; let staticLoadContext = context; let approvedEditPlan; let approvedEditReviewContext; let approvalEditFingerprint; ${source.slice(commitStart, commitEnd)} return { payload, approvedEditPlan }; })`, {
    initial: prepared.payload, context, current, profile: 'p', editModes: [], writeApprovals,
    savedEditOccurrenceContext: occurrenceContext, buildSavedTemplateUpdatePayload, reconcileSavedEditPayload, diffSavedEditPayloads, savedEditExecutionDisclosure, assertSavedEditScope,
    readProfileConfig: async () => ({ config: { deviceType: 1 }, password: '' }), profileConfigFingerprint: () => 'fp',
    savedIdentityAccountFingerprint: () => 'a'.repeat(64), cycleHash: value => createHash('sha256').update(JSON.stringify(value)).digest('hex'), readTrainingProfileRecord: async () => null, currentExerciseCatalog: async () => null,
    normalizePlan: (...values) => structuredClone(normalize(...values)), validatePlanForProfile: async value => ({ plan: value, intakeFingerprint: 'intake' }), planDigest: digest,
    prepareProgramPayload: async value => {
      const result = await prepare(liveUnit, liveProtocol)(value, 'synthetic');
      return { ...result, staticLoadContext: { ...result.staticLoadContext, displayUnit: liveUnit, accountUnit: liveUnit, contextDigest: liveProtocol === protocol ? 'protocol-context' : 'changed-protocol-context' } };
    }
  });
  const commitArgs = { base_digest: 'base', edit_preview_id: 'edit' };
  liveUnit = 'kg';
  await assert.rejects(commit(commitArgs), /account unit changed/);
  liveUnit = 'lb'; liveProtocol = 'account-unit-verbatim';
  await assert.rejects(commit(commitArgs), /Plan zmienił|Payload lub jednostka/);
  liveProtocol = protocol;
  const approvedDigest = approval.digest;
  approval.digest = 'forged-display-digest';
  await assert.rejects(commit(commitArgs), /Plan zmienił/);
  approval.digest = approvedDigest;
  // Derived display fields are forbidden in public replay arguments.
  approval.editPlanArgs.exercises[0].sets[0].serializedDisplayWeight = 999;
  approval.editPlanArgs.exercises[0].sets[0].apiLoadNormalized = false;
  assert.equal(writeApprovals.has('edit'), true);
  await assert.rejects(commit(commitArgs), /nieobsługiwane pole serii/);
  delete approval.editPlanArgs.exercises[0].sets[0].serializedDisplayWeight;
  delete approval.editPlanArgs.exercises[0].sets[0].apiLoadNormalized;
  const committed = await commit(commitArgs);
  assert.equal(JSON.stringify(committed.payload), JSON.stringify(approval.editWirePayload));
  assert.equal(digest('p', committed.approvedEditPlan), approvedDigest);
  const readback = { ...structuredClone(committed.payload), actionLibraryList: committed.payload.actionLibraryList.map(action => ({ ...action, weights: action.weights.split(',').map(value => Number(value) / 2.2).join(',') })) };
  assert.equal(verifyUpdatedTemplateReadback({ expectedPayload: committed.payload, readback, expectedCode: current.code, staticLoadProtocol: protocol, accountUnit: 'lb' }).verified, true);
  const snapshot = snapshotNormalizedPlan(committed.approvedEditPlan);
  assert.deepEqual(snapshot.exercises[0].sets.map(set => set.weight), [15.4, 17.6, 20.9]);
  assert.equal(writeApprovals.has('edit'), false);
});

test('preview normalizuje ręczny Customize w lb krokiem kg urządzenia (lustrzanie do kg)', () => {
  const args = input('lb'); args.exercises[0].sets = [120, 12.1, 119].map((weight, index) => ({ unit: 'reps', reps: 8, weight, weightUnit: 'lb', rirTarget: 2, mode: 1, restSeconds: 60 + index }));
  const sets = normalize(args).exercises[0].sets;
  assert.deepEqual(sets.map(set => set.weight), [119, 12.1, 119]);
  assert.equal(sets[0].loadStepNormalized, true); assert.equal(sets[0].requestedWeight, 120); assert.match(sets[0].loadStepNote, /54 kg = 119 lb/);
  assert.equal(sets[1].loadStepNormalized, undefined);
  const kg = input('kg'); kg.exercises[0].sets[0].weight = 54.5;
  assert.equal(normalize(kg).exercises[0].sets[0].weight, 54);
});
