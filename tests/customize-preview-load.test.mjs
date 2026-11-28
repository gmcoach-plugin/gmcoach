import { timeEstimationSchema } from '../plugin/time-budget.mjs';
import { normalizePreferenceReviews, preferenceReviewsSchema } from '../plugin/preference-compliance.mjs';
import { TRAINING_EVIDENCE_CATEGORIES } from '../plugin/training-evidence.mjs';
import { normalizeRecoveryContextDeclaration } from '../plugin/recovery-context.mjs';
const syntheticRecoveryContext = { status: 'not_requested', limitations: ['Synthetic fixture uses no reported health data; biological readiness is not inferred.'] };
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { suggestIntensityTechniques } from '../plugin/intensity-techniques.mjs';
import { buildSessionTable } from '../plugin/session-table.mjs';
import { readInstructionAwareSync as readFileSync } from './fixtures/skill-instructions.mjs';
import * as payloadFunctions from '../plugin/program-payload.mjs';
import * as referenceClientFunctions from '../plugin/athlete-context.mjs';
import { normalizeTrainingProfileData } from '../plugin/coaching-profile.mjs';
import { normalizeExerciseEntry, validateExecutablePlanSections } from '../plugin/executable-plan-sections.mjs';
import { resolveGoalBoundSmartRmPresetName } from '../plugin/goal-preset-routing.mjs';
import { getReferenceClientRmPresetByName } from '../plugin/preset-mapping.mjs';

const source = readFileSync(new URL('../plugin/mcp_server.mjs', import.meta.url), 'utf8');
const suggestStart = source.indexOf("case 'gm_coach_suggest_load': {");
const suggestEnd = source.indexOf("case 'gm_coach_get_exercise_history':", suggestStart);
assert.ok(suggestStart >= 0 && suggestEnd > suggestStart);
const suggest = vm.runInNewContext(`(async args => { switch ('gm_coach_suggest_load') { ${source.slice(suggestStart, suggestEnd)} } })`, {
  ...payloadFunctions, structuredClone, normalizeRecoveryContextDeclaration, normalizePreferenceReviews, ...referenceClientFunctions,
  resolveProfile: async () => 'synthetic',
  withProfileMutationLock: async (_profile, callback) => callback(),
  readTrainingProfileRecord: async () => ({ profileData: {} })
});

test('persisted numerical e1RM roundtrip reaches the actual suggestion branch with provenance', async () => {
  const profileData = JSON.parse(JSON.stringify(normalizeTrainingProfileData({ strengthAnchors: [{
    groupId: 42, exerciseName: 'Confirmed resisted movement', unit: 'kg', source: 'user-confirmed',
    oneRepMax: 100, anchorKind: 'estimated-e1RM', observedAt: '2026-10-01T12:00:00Z'
  }] })));
  const materializeStart = source.indexOf('function materializeStrengthAnchor(');
  const materializeEnd = source.indexOf('\nasync function getExerciseStatisticsForHistory', materializeStart);
  const materializeStrengthAnchor = vm.runInNewContext(`(${source.slice(materializeStart, materializeEnd).trim()})`, payloadFunctions);
  const dispatch = vm.runInNewContext(`(async args => { switch ('gm_coach_suggest_load') { ${source.slice(suggestStart, suggestEnd)} } })`, {
    ...payloadFunctions, normalizeRecoveryContextDeclaration, normalizePreferenceReviews, ...referenceClientFunctions, materializeStrengthAnchor,
    resolveProfile: async () => 'synthetic', withProfileMutationLock: async (_profile, callback) => callback(),
    readTrainingProfileRecord: async () => ({ profileData })
  });
  const result = await dispatch({ exercise_id: 42, goal: 'muscle', set_reps: [8] });
  assert.equal(result.anchor.kind, 'estimated-e1RM');
  assert.equal(result.anchor.approximate, true);
  assert.equal(result.anchor.observedAt, '2026-10-01T12:00:00.000Z');
  assert.equal(result.anchor.estimateMethod, undefined);
  assert.equal(result.anchor.workingSetAssumption, undefined);
  assert.equal(result.suggestions[0].estimatedLoad, 77);
});

for (const unit of ['kg', 'lb']) {
  for (const rir of [2, undefined]) {
    test(`actual suggest-load working anchor agrees with profile-auto (${unit}, RIR ${rir ?? 'absent'})`, async () => {
      const reps = [8, 12];
      const result = await suggest({ exercise_id: 42, goal: 'muscle', working_weight: 60, working_reps: 8,
        ...(rir === undefined ? {} : { working_rir: rir }), unit, set_reps: reps });
      const load = payloadFunctions.buildExerciseLoadPayload('profile-auto', reps.map(count => ({ unit: 'reps', reps: count, mode: 1 })), {
        displayUnit: unit, strengthAnchor: { workingWeight: 60, workingReps: 8,
          ...(rir === undefined ? {} : { workingRir: rir }), unit, source: 'user-confirmed-working-set' }
      });
      assert.equal(result.writesToSpeediance, false);
      assert.equal(result.anchor.workingSetAssumption, rir === undefined ? '0 RIR assumed' : '2 RIR');
      assert.equal(result.anchor.estimateMethod, 'reference-client-rep-max-curve');
      for (const [index, estimate] of load.loadEstimates.entries()) {
        assert.equal(result.suggestions[index].estimatedLoad, estimate.suggestedLoad);
        assert.equal(result.suggestions[index].unit, unit);
        assert.equal(result.suggestions[index].referenceClientRmStep, estimate.referenceReps);
        assert.equal(estimate.approximate, true);
        assert.equal(estimate.anchorSource, 'working-set-estimate');
        assert.equal(estimate.anchorEvidenceSource, 'user-confirmed-working-set');
        assert.equal(estimate.effectiveReps, 8 + (rir ?? 0));
        if (rir === undefined) assert.equal(estimate.workingSetAssumption, '0 RIR assumed');
        else assert.equal(estimate.workingRir, rir);
      }
    });
  }
}

test('actual suggest-load rejects incomplete, mixed or unit-only explicit anchors', async () => {
  const base = { exercise_id: 42, goal: 'muscle', set_reps: [8] };
  for (const fields of [
    { unit: 'kg' }, { working_weight: 60, unit: 'kg' }, { working_reps: 8, unit: 'kg' },
    { working_weight: 60, working_reps: 8 }, { one_rep_max: 100 },
    { one_rep_max: 100, working_weight: 60, working_reps: 8, unit: 'kg' },
    { working_rir: 2, unit: 'kg' }
  ]) await assert.rejects(suggest({ ...base, ...fields }));
});
const start = source.indexOf('function normalizePlan(');
const end = source.indexOf('\nfunction assertQuickTestProgramShape', start);
assert.ok(start >= 0 && end > start);
// Exercise the complete real normalizer with scientific/catalog services isolated;
// load selection and its account/wire conversion remain real module functions.
const normalize = vm.runInNewContext(`(${source.slice(start, end).trim()})`, {
  ...payloadFunctions, normalizeRecoveryContextDeclaration, normalizePreferenceReviews,
  resolveGoalBoundSmartRmPresetName, getReferenceClientRmPresetByName,
  classifyPrescriptionUnit: unit => ['sec', 'seconds'].includes(unit) ? 'seconds' : 'reps',
  normalizeExerciseEntry, validateExecutablePlanSections,
  normalizeTrainingEvidence: (rationale, evidence) => ({ rationale, evidence }),
  resolveProfileStrengthAnchor: ({ providedAnchor }) => providedAnchor,
  isSupportedCustomizeAnchorSource: source => source === 'speediance-reported',
  isWritableResistanceMode: mode => [1, 2, 3].includes(mode),
  normalizeSupersetBlocks: () => [],
  normalizeEvidencePlanItems: (warmup, postWorkoutStretching) => ({ warmup, postWorkoutStretching }),
  normalizeEvidenceCoverage: () => [],
  assertNoUnserializedTechniqueInstructions: () => {}
});

function plan(unit, oneRepMax = 100, reps = [8, 12]) {
  return {
    // Synthetic load regression: the scientific gate is explicitly declined (gate tests live in training-evidence).
    name: 'Customize preview', scienceGate: 'user_declined', recoveryContext: syntheticRecoveryContext, rationale: 'Synthetic regression', evidence: [], showCalculatedLoads: true,
    warmup: { status: 'omitted_user_preference', items: [] },
    postWorkoutStretching: { status: 'omitted_user_preference', items: [] },
    exercises: [{ id: 42, title: 'Confirmed resisted movement', loadType: 'profile-auto',
      userRequestedReferenceClientCustomize: true,
      strengthAnchor: { oneRepMax, unit, source: 'speediance-reported' },
      sets: reps.map(count => ({ unit: 'reps', reps: count, rirTarget: 2, mode: 1, restSeconds: 90 })) }]
  };
}

test('actual normalizer rejects negated intake goals before any Smart RM readiness stage', () => {
  for (const primaryGoal of ['nie chcę siły', 'not strength', 'no strength', 'siła, nie chcę siły', 'power']) {
    const input = plan('kg', 100, [8]);
    input.intakeAnswers = { primaryGoal };
    input.exercises[0].loadType = 'smart-rm';
    delete input.exercises[0].userRequestedReferenceClientCustomize;
    delete input.exercises[0].strengthAnchor;
    assert.throws(() => normalize(input), /dopytaj.*priorytet/i, primaryGoal);
  }
});

test('actual normalizer routes affirmative hypertrophy with explicit strength exclusion to Gain Muscle', () => {
  for (const primaryGoal of ['hipertrofia, nie siła', 'not strength but hypertrophy']) {
    const input = plan('kg', 100, [8]);
    input.intakeAnswers = { primaryGoal };
    input.exercises[0].loadType = 'smart-rm';
    delete input.exercises[0].userRequestedReferenceClientCustomize;
    delete input.exercises[0].strengthAnchor;
    const normalized = normalize(input);
    assert.equal(normalized.exercises[0].smartRmPresetName, 'Gain Muscle');
    assert.equal(normalized.exercises[0].smartRmPresetId, 1);
    assert.equal(normalized.exercises[0].loadType, 'smart-rm');
  }
});

for (const unit of ['kg', 'lb']) {
  test(`real normalizePlan displays Customize suggestions in ${unit}, not wire weights`, () => {
    const input = plan(unit);
    const normalized = normalize(input);
    const exercise = normalized.exercises[0];
    const load = payloadFunctions.buildExerciseLoadPayload('profile-auto', input.exercises[0].sets, {
      strengthAnchor: input.exercises[0].strengthAnchor, displayUnit: unit
    });
    exercise.sets.forEach((set, index) => {
      assert.equal(set.calculatedLoad, load.loadEstimates[index].suggestedLoad);
      assert.equal(set.loadUnit, unit);
      assert.equal(set.loadEstimate.targetPercent1RM, load.loadEstimates[index].targetPercent1RM / 100);
      assert.equal(set.loadEstimate.method, 'reference-client-observed-assessment-suggestion');
      assert.equal(set.loadEstimate.referenceReps, input.exercises[0].sets[index].reps + 1);
    });
    assert.equal(exercise.sets[0].calculatedLoad, unit === 'lb' ? 77.2 : 77); // lb: 35 kg device step
    assert.equal(exercise.sets[0].loadEstimate.targetPercent1RM, .77);
    assert.notEqual(exercise.sets[0].loadEstimate.targetPercent1RM, .8);
    if (unit === 'kg') assert.notEqual(exercise.sets[0].calculatedLoad, Number(load.weights.split(',')[0]));
  });
}

test('imperial UI snapping remains separate from the displayed account-unit suggestion', () => {
  const input = plan('lb', 125, [15]);
  const set = normalize(input).exercises[0].sets[0];
  const load = payloadFunctions.buildExerciseLoadPayload('profile-auto', input.exercises[0].sets, {
    strengthAnchor: input.exercises[0].strengthAnchor, displayUnit: 'lb'
  });
  assert.equal(set.calculatedLoad, 77.2); // 78 lb -> 35 kg device step
  assert.equal(set.loadUnit, 'lb');
  assert.equal(load.weights, '77.0');
  assert.notEqual(set.calculatedLoad, Number(load.weights));
});

test('actual public preview exercise renderer preserves whole-percent Customize contract', () => {
  const previewStart = source.indexOf('exercises: executionExercises.map((exercise) => ({', source.indexOf("case 'speediance_preview_program'"));
  const previewEnd = source.indexOf('\n          showCalculatedLoads:', previewStart);
  assert.ok(previewStart >= 0 && previewEnd > previewStart);
  const expression = source.slice(previewStart + 'exercises: '.length, previewEnd).trim().replace(/,$/, '');
  const planValue = normalize(plan('kg'));
  const render = vm.runInNewContext(`(plan, displayUnit, executionExercises = plan.exercises) => (${expression})`);
  const set = render(planValue, 'kg')[0].sets[0];
  assert.equal(set.targetPercent1RM, 77);
  assert.equal(set.weight, 77);
  assert.equal(set.weightUnit, 'kg');
});

test('actual approval HTML renderer displays 77 percent rather than 7700 percent', () => {
  const htmlStart = source.indexOf('function approvalPage(');
  const htmlEnd = source.indexOf('\nasync function handleApprovalRequest', htmlStart);
  const render = vm.runInNewContext(`(${source.slice(htmlStart, htmlEnd).trim()})`, {
    escapeHtml: value => String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;'),
    RESISTANCE_MODES: { 1: 'Standard' }, setupPage: (_title, _message, form) => form
  });
  const planValue = normalize(plan('kg'));
  const html = render({ plan: planValue, preview: { showCalculatedLoads: true }, profile: 'synthetic', payload: { name: planValue.name } });
  assert.match(html, /77% 1RM/);
  assert.match(html, /77 kg/);
  assert.doesNotMatch(html, /7700%|169\.4 kg/);
});

test('working-set preview and approval distinguish estimated e1RM without leaking hidden loads', () => {
  const previewStart = source.indexOf('exercises: executionExercises.map((exercise) => ({', source.indexOf("case 'speediance_preview_program'"));
  const previewEnd = source.indexOf('\n          showCalculatedLoads:', previewStart);
  const expression = source.slice(previewStart + 'exercises: '.length, previewEnd).trim().replace(/,$/, '');
  const renderPreview = vm.runInNewContext(`(plan, displayUnit, executionExercises = plan.exercises) => (${expression})`);
  const htmlStart = source.indexOf('function approvalPage(');
  const htmlEnd = source.indexOf('\nasync function handleApprovalRequest', htmlStart);
  const renderHtml = vm.runInNewContext(`(${source.slice(htmlStart, htmlEnd).trim()})`, {
    escapeHtml: value => String(value ?? ''), RESISTANCE_MODES: { 1: 'Standard' }, setupPage: (_title, _message, form) => form
  });
  for (const showCalculatedLoads of [true, false]) {
    const input = plan('kg');
    input.showCalculatedLoads = showCalculatedLoads;
    input.exercises[0].strengthAnchor = { workingWeight: 60, workingReps: 8, unit: 'kg', source: 'speediance-reported' };
    const normalized = normalize(input);
    const exercise = renderPreview(normalized, 'kg')[0];
    assert.equal(exercise.strengthAnchor.kind, 'estimated-e1RM');
    assert.equal(exercise.strengthAnchor.approximate, true);
    assert.equal(exercise.sets[0].approximate, true);
    assert.equal(exercise.sets[0].anchorEvidenceSource, 'speediance-reported');
    assert.equal(exercise.sets[0].workingSetAssumption, '0 RIR assumed');
    const html = renderHtml({ plan: normalized, preview: { showCalculatedLoads }, profile: 'synthetic', payload: { name: normalized.name } });
    assert.match(html, /% szacowanego e1RM/);
    assert.match(html, /źródło: speediance-reported/);
    assert.match(html, /0 RIR assumed/);
    if (showCalculatedLoads) assert.match(html, /szacowane e1RM/);
    if (!showCalculatedLoads) {
      assert.equal(exercise.strengthAnchor.oneRepMax, undefined);
      assert.equal(exercise.sets[0].weight, undefined);
      assert.doesNotMatch(html, /≈ [\d.]+ kg/);
    }
  }
  const measured = renderPreview(normalize(plan('kg')), 'kg')[0];
  assert.equal(measured.strengthAnchor.kind, 'unspecified-oneRepMax');
  assert.equal(measured.sets[0].approximate, false);
});

test('numerical estimated e1RM public preview preserves approximation without invented working RIR', () => {
  const input = plan('kg');
  input.exercises[0].strengthAnchor.anchorKind = 'estimated-e1RM';
  const normalized = normalize(input);
  assert.equal(normalized.exercises[0].sets[0].loadEstimate.approximate, true);
  assert.equal(normalized.exercises[0].sets[0].loadEstimate.workingRir, undefined);
  const start = source.indexOf('exercises: executionExercises.map((exercise) => ({', source.indexOf("case 'speediance_preview_program'"));
  const end = source.indexOf('\n          showCalculatedLoads:', start);
  const expression = source.slice(start + 'exercises: '.length, end).trim().replace(/,$/, '');
  const render = vm.runInNewContext(`(plan, displayUnit, executionExercises = plan.exercises) => (${expression})`);
  const exercise = render(normalized, 'kg')[0];
  assert.equal(exercise.strengthAnchor.kind, 'estimated-e1RM');
  assert.equal(exercise.sets[0].approximate, true);
  assert.equal(Object.hasOwn(exercise.sets[0], 'workingRir'), false);
  assert.equal(exercise.sets[0].workingSetAssumption, undefined);
  const htmlStart = source.indexOf('function approvalPage(');
  const htmlEnd = source.indexOf('\nasync function handleApprovalRequest', htmlStart);
  const html = vm.runInNewContext(`(${source.slice(htmlStart, htmlEnd).trim()})`, {
    escapeHtml: value => String(value ?? ''), RESISTANCE_MODES: { 1: 'Standard' }, setupPage: (_title, _message, form) => form
  })({ plan: normalized, preview: { showCalculatedLoads: true }, profile: 'synthetic', payload: { name: normalized.name } });
  assert.match(html, /szacowane e1RM 100 kg/);
  assert.match(html, /metoda oszacowania niepodana/);
  assert.doesNotMatch(html, /undefined RIR|0 RIR assumed/);
});

test('real scientific load prescription accepts the normalized fraction and account-unit weight', () => {
  const science = readFileSync(new URL('../plugin/training-evidence.mjs', import.meta.url), 'utf8');
  const start = science.indexOf('function setDecisionValue(');
  const baseStart = science.indexOf('function baseSetDecisionValue(');
  const nextFunction = science.indexOf('\nfunction ', baseStart + 1);
  const end = nextFunction < 0 ? science.length : nextFunction;
  assert.ok(start >= 0 && end > start);
  const prescribe = vm.runInNewContext(`${science.slice(start, end).trim()}; setDecisionValue`);
  for (const unit of ['kg', 'lb']) {
    const exercise = normalize(plan(unit)).exercises[0];
    const value = prescribe(exercise, exercise.sets[0], 'set_load');
    assert.match(value, /targetPercent1RM=77\.0%/);
    assert.ok(value.includes(`calculatedWeight=${unit === 'lb' ? 77.2 : 77}${unit}`));
    assert.match(value, /curve=reference-client-observed-assessment-suggestion/);
    const invalid = { ...exercise.sets[0], loadEstimate: { ...exercise.sets[0].loadEstimate, targetPercent1RM: 77 } };
    assert.throws(() => prescribe(exercise, invalid, 'set_load'), /obciążenie musi/);
  }
});

test('manual fixed kg preview declares kg independently of account unit', () => { assert.match(source, /weightKg: set\.weightKg, weightUnit: 'kg', accountDisplayUnit: displayUnit/); });


// These examples exercise the real normalizer; isolated evidence services do not
// establish scientific approval, account readiness or firmware behavior.
const canonicalPreviewSets = [
  { unit: 'reps', reps: 8, rirTarget: 2, mode: 1, restSeconds: 120 },
  { unit: 'sec', durationSeconds: 30, mode: 1, restSeconds: 15 }
];
function canonicalExamplePlan(index) {
  const input = plan('kg', 100, [8]);
  const exercise = input.exercises[0];
  exercise.loadType = 'bodyweight';
  delete exercise.userRequestedReferenceClientCustomize;
  delete exercise.strengthAnchor;
  exercise.sets = [{ ...canonicalPreviewSets[index] }];
  return input;
}
test('canonical skill examples preserve actual public-normalizer dose, mode and rest', () => {
  for (const path of ['../plugin/SKILL.md', '../plugin/skills/speediance-coach/SKILL.md', '../plugin/skills/training-science/SKILL.md']) {
    const section = readFileSync(new URL(path, import.meta.url), 'utf8').split('## Kanoniczne wejście podglądu')[1]?.split(/\n## /)[0];
    const examples = [...section.matchAll(/```json\s*([^`]+)```/g)].map(match => JSON.parse(match[1]));
    assert.deepEqual(examples, canonicalPreviewSets);
    examples.forEach((example, index) => {
      const input = canonicalExamplePlan(index);
      input.exercises[0].sets = [example];
      const actual = normalize(input).exercises[0].sets[0];
      assert.equal(actual.unit, example.unit);
      assert.equal(actual.mode, example.mode);
      assert.equal(actual.rest, example.restSeconds);
      assert.equal(actual.reps, example.reps);
      assert.equal(actual.durationSeconds, example.durationSeconds);
      assert.equal(actual.rirTarget, example.rirTarget);
    });
  }
});
test('actual normalizer rejects readback-field replacements and timed Smart RM', () => {
  for (const [inputField, readbackField] of [['mode', 'resistanceMode'], ['restSeconds', 'rest']]) {
    const input = canonicalExamplePlan(0);
    const set = input.exercises[0].sets[0];
    set[readbackField] = set[inputField]; delete set[inputField];
    assert.throws(() => normalize(input), /seria 1/);
  }
  const wrongDose = canonicalExamplePlan(1);
  wrongDose.exercises[0].sets[0].reps = 30;
  delete wrongDose.exercises[0].sets[0].durationSeconds;
  assert.throws(() => normalize(wrongDose), /seria 1/);
  const timedRm = canonicalExamplePlan(1);
  timedRm.intakeAnswers = { primaryGoal: 'hipertrofia' };
  timedRm.exercises[0].loadType = 'smart-rm';
  assert.throws(() => normalize(timedRm));
  const internalRm = canonicalExamplePlan(0);
  internalRm.exercises[0].sets[0].rmLevel = 10;
  assert.throws(() => normalize(internalRm), /rmLevel jest technicznym/);
});
test('actual public program schema limits canonical set keys independently of normalizer', () => {
  const schemaStart = source.indexOf('function programSchema(');
  const schemaEnd = source.indexOf('\nfunction validateProfile(', schemaStart);
  assert.ok(schemaStart >= 0 && schemaEnd > schemaStart);
  const schema = vm.runInNewContext(`(${source.slice(schemaStart, schemaEnd).trim()})`, {
    timeEstimationSchema, preferenceReviewsSchema, profileProperty: () => ({}), recoveryContextDeclarationSchema: {}, trainingProfileDataSchema: {}, TRAINING_EVIDENCE_CATEGORIES, structuredClone
  })();
  const setSchema = schema.properties.exercises.items.properties.sets.items;
  assert.deepEqual(Array.from(setSchema.required), ['unit', 'mode', 'restSeconds']);
  assert.deepEqual(Array.from(setSchema.properties.unit.enum), ['reps', 'sec', 'seconds']);
  assert.deepEqual(Array.from(setSchema.properties.mode.enum), [1, 2, 3]);
  assert.equal(setSchema.additionalProperties, false);
  for (const example of canonicalPreviewSets) {
    for (const key of Object.keys(example)) assert.ok(Object.hasOwn(setSchema.properties, key), key);
    for (const key of setSchema.required) assert.ok(Object.hasOwn(example, key), key);
  }
  for (const key of ['rest', 'resistanceMode', 'setNumber', 'rmLevel']) assert.equal(Object.hasOwn(setSchema.properties, key), false, key);
});

test('actual normalizer rejects extra readback keys even alongside valid canonical fields', () => {
  for (const [key, value] of [['setNumber', 1], ['resistanceMode', 1], ['rest', 120], ['sideLabel', 'left'], ['machinePreset', 'Gain Muscle']]) {
    const input = canonicalExamplePlan(0);
    input.exercises[0].sets[0][key] = value;
    assert.throws(() => normalize(input), /nieobsługiwane pole serii/, key);
  }
  const input = canonicalExamplePlan(0);
  input.exercises[0].sets[0].rmLevel = 10;
  assert.throws(() => normalize(input), /rmLevel jest technicznym/);
});

test('actual normalizer rejects intensity on every non-cardio load path without discarding it', () => {
  const fixtures = [canonicalExamplePlan(0), plan('kg', 100, [8])];
  const smart = canonicalExamplePlan(0);
  smart.intakeAnswers = { primaryGoal: 'hipertrofia' };
  smart.exercises[0].loadType = 'smart-rm';
  fixtures.push(smart);
  const manual = canonicalExamplePlan(0);
  Object.assign(manual.exercises[0], { loadType: 'customize-manual', staticLoadRequested: true });
  Object.assign(manual.exercises[0].sets[0], { weight: 8, weightUnit: 'kg' });
  fixtures.push(manual);
  const fixed = canonicalExamplePlan(0);
  Object.assign(fixed.exercises[0], { loadType: 'fixed-kg', userRequestedFixedKg: true });
  fixed.exercises[0].sets[0].weightKg = 8;
  fixtures.push(fixed);
  for (const fixture of fixtures) {
    assert.equal(normalize(fixture).exercises[0].loadType, fixture.exercises[0].loadType);
    for (const intensity of [0, 1, 10, null, false, '1']) {
      const mutated = structuredClone(fixture);
      mutated.exercises[0].sets[0].intensity = intensity;
      assert.throws(() => normalize(mutated), /intensity jest dozwolone wyłącznie/, `${fixture.exercises[0].loadType}: ${String(intensity)}`);
    }
  }
});
test('actual normalizer rejects repetition RIR on timed sets while preserving valid timed paths', () => {
  const fixtures = [canonicalExamplePlan(1)];
  const fixed = canonicalExamplePlan(1);
  Object.assign(fixed.exercises[0], { loadType: 'fixed-kg', userRequestedFixedKg: true });
  fixed.exercises[0].sets[0].weightKg = 8;
  fixtures.push(fixed);
  const manual = canonicalExamplePlan(1);
  Object.assign(manual.exercises[0], { loadType: 'customize-manual', staticLoadRequested: true });
  Object.assign(manual.exercises[0].sets[0], { weight: 8, weightUnit: 'kg' });
  fixtures.push(manual);
  const cardio = canonicalExamplePlan(1);
  cardio.exercises[0].loadType = 'cardio';
  cardio.exercises[0].sets[0].intensity = 5;
  fixtures.push(cardio);
  for (const fixture of fixtures) {
    const catalog = { exerciseRecordsById: new Map([[fixture.exercises[0].id, { kind: 'strength' }]]) };
    for (const unit of ['sec', 'seconds']) {
      fixture.exercises[0].sets[0].unit = unit;
      assert.equal(normalize(fixture, {}, catalog).exercises[0].sets[0].durationSeconds, 30);
      for (const rirTarget of [0, 2, null, '2', false, undefined]) {
        const invalid = structuredClone(fixture);
        invalid.exercises[0].sets[0].rirTarget = rirTarget;
        assert.throws(() => normalize(invalid, {}, catalog), /RIR oznacza zapas powtórzeń/);
      }
    }
  }
});

test('actual normalizer preserves valid timed cardio intensities and rejects invalid range or type', () => {
  const fixture = canonicalExamplePlan(1);
  fixture.exercises[0].loadType = 'cardio';
  fixture.exercises[0].title = 'Row';
  for (const intensity of [1, 5, 10]) {
    fixture.exercises[0].sets[0].intensity = intensity;
    const actual = normalize(fixture).exercises[0].sets[0];
    assert.equal(actual.intensity, intensity);
    assert.equal(actual.unit, 'sec');
    assert.equal(actual.durationSeconds, 30);
    assert.equal(actual.mode, 1);
    assert.equal(actual.rest, 15);
  }
  for (const intensity of [0, 11, null, false, '1']) {
    fixture.exercises[0].sets[0].intensity = intensity;
    assert.throws(() => normalize(fixture));
  }
});

test('actual normalizer rejects any supplied weightKg on Smart RM and anchor-based Customize', () => {
  const smart = canonicalExamplePlan(0);
  smart.intakeAnswers = { primaryGoal: 'hipertrofia' };
  smart.exercises[0].loadType = 'smart-rm';
  for (const fixture of [smart, plan('kg', 100, [8])]) {
    const canonical = normalize(fixture).exercises[0];
    assert.equal(canonical.loadType, fixture.exercises[0].loadType);
    for (const weightKg of [0, 8, null, false, '8']) {
      const mutated = structuredClone(fixture);
      mutated.exercises[0].sets[0].weightKg = weightKg;
      assert.throws(() => normalize(mutated), /weightKg (?:jest wejściem wyłącznie|nie może być podane)/, `${fixture.exercises[0].loadType}: ${String(weightKg)}`);
    }
    const suppliedUndefined = structuredClone(fixture);
    suppliedUndefined.exercises[0].sets[0].weightKg = undefined;
    assert.throws(() => normalize(suppliedUndefined), /weightKg (?:jest wejściem wyłącznie|nie może być podane)/);
  }
  const fixed = canonicalExamplePlan(0);
  Object.assign(fixed.exercises[0], { loadType: 'fixed-kg', userRequestedFixedKg: true });
  fixed.exercises[0].sets[0].weightKg = 8;
  assert.equal(normalize(fixed).exercises[0].sets[0].weightKg, 8);
  const manual = canonicalExamplePlan(0);
  Object.assign(manual.exercises[0], { loadType: 'customize-manual', staticLoadRequested: true });
  Object.assign(manual.exercises[0].sets[0], { weight: 8, weightUnit: 'kg' });
  assert.equal(normalize(manual).exercises[0].sets[0].weight, 8);
});

function smartPlan(sets, extra = {}) {
  const input = plan('kg', 100, [10]);
  input.intakeAnswers = { primaryGoal: 'hipertrofia' };
  Object.assign(input.exercises[0], { loadType: 'smart-rm', ...extra });
  delete input.exercises[0].userRequestedReferenceClientCustomize;
  delete input.exercises[0].strengthAnchor;
  input.exercises[0].sets = sets;
  return input;
}
const rmSet = (extra = {}) => ({ unit: 'reps', reps: 10, rirTarget: 2, mode: 1, restSeconds: 60, ...extra });

test('Smart RM always gets an automatic percent; kg stay with Speediance without 1RM', () => {
  const set = normalize(smartPlan([rmSet(), rmSet({ reps: 8, rirTarget: 1 })])).exercises[0].sets;
  assert.equal(set[0].percentResolved.percent1RM, 70);
  assert.equal(set[0].rmLevel, 12);
  assert.equal(set[0].percentResolved.loadKg, null);
  assert.equal(set[1].percentResolved.percent1RM, 77);
});
test('known 1RM adds estimated kg; manual percent wins but a differing percent needs a reason', () => {
  const oneRepMax = { value: 43.5, unit: 'kg', source: 'user-confirmed-one-rep-max' };
  const ok = normalize(smartPlan([rmSet({ percent1RM: 50, percentReason: 'seria wprowadzająca' }), rmSet(), rmSet({ percent1RM: 80, percentReason: 'top set' })], { percentLoad: { oneRepMax } })).exercises[0].sets;
  assert.deepEqual(ok.map((item) => [item.percentResolved.percent1RM, item.percentResolved.loadKg]), [[50, 22], [70, 30], [80, 35]]);
  assert.throws(() => normalize(smartPlan([rmSet({ percent1RM: 50 })])), /percentReason/);
  assert.equal(normalize(smartPlan([rmSet({ percent1RM: 70 })])).exercises[0].sets[0].percentResolved.method, 'manual-override');
});


const dropRm = (extra = {}) => rmSet({ restSeconds: 0, dropSet: true, ...extra });
test('Smart RM drop set 70 > 65 > 55 passes preview normalization and serializes counterweight2/percent1rmStr per set', () => {
  const sets = normalize(smartPlan([rmSet({ restSeconds: 0 }), dropRm({ percent1RM: 65 }), dropRm({ percent1RM: 55, restSeconds: 60 })])).exercises[0].sets;
  assert.deepEqual(sets.map((s) => s.percentResolved.percent1RM), [70, 65, 55]);
  assert.deepEqual(sets.map((s) => s.dropSet === true), [false, true, true]);
  assert.deepEqual(sets.map((s) => s.rest), [0, 0, 60]);
  assert.match(sets[1].percentResolved.rationale, /drop set/);
  const wire = payloadFunctions.buildExerciseLoadPayload('smart-rm', sets, { smartRmPresetName: 'Gain Muscle' });
  assert.equal(wire.counterweight, ''); assert.equal(wire.counterweight2, '12,14,18'); assert.equal(wire.percent1rmStr, '70,65,55');
});
test('Customize drop set with decreasing kg passes; heavier, first-set or long-rest drop sets are rejected', () => {
  const custom = (sets) => { const input = plan('kg', 100, [10]); delete input.exercises[0].userRequestedReferenceClientCustomize; delete input.exercises[0].strengthAnchor; Object.assign(input.exercises[0], { loadType: 'customize-manual', staticLoadRequested: true }); input.exercises[0].sets = sets; return input; };
  const row = (weight, extra = {}) => ({ unit: 'reps', reps: 10, rirTarget: 1, mode: 1, restSeconds: 60, weight, weightUnit: 'kg', ...extra });
  const ok = normalize(custom([row(40, { restSeconds: 0 }), row(30, { dropSet: true, restSeconds: 0 }), row(24, { dropSet: true, restSeconds: 60 })])).exercises[0].sets;
  assert.deepEqual(ok.map((s) => s.weight), [40, 30, 24]); assert.deepEqual(ok.map((s) => s.dropSet === true), [false, true, true]);
  assert.throws(() => normalize(custom([row(40, { restSeconds: 0 }), row(45, { dropSet: true, restSeconds: 0 })])), /niższe niż poprzedniej/);
  assert.throws(() => normalize(custom([row(40, { dropSet: true, restSeconds: 0 })])), /bezpośrednio po serii roboczej/);
  assert.throws(() => normalize(custom([row(40), row(30, { dropSet: true, restSeconds: 0 })])), /przerwa przed serią drop setu/);
  assert.throws(() => normalize(custom([row(40, { restSeconds: 0 }), row(32, { dropSet: true, restSeconds: 60 }), row(26, { dropSet: true, restSeconds: 0 })])), /przerwa przed serią drop setu/);
  assert.throws(() => normalize(custom([row(40, { restSeconds: 0 }), row(32, { dropSet: true, restSeconds: 0 }), row(26, { dropSet: true, restSeconds: 0 }), row(20, { dropSet: true, restSeconds: 0 })])), /1–2 dodatkowe/);
});
test('Smart RM drop set must lower the percent', () => {
  assert.throws(() => normalize(smartPlan([rmSet({ restSeconds: 0 }), dropRm({ percent1RM: 80 })])), /niższe niż poprzedniej/);
});
test('suggestions add no drop set when the goal does not justify it; hypertrophy isolation gets one with a reason', () => {
  const ex = [{ entryId: 1, section: 'main', muscleGroup: 'chest', equipment: 'a', isolation: false, anchor: true }, { entryId: 2, section: 'main', muscleGroup: 'biceps', equipment: 'b', isolation: true }];
  assert.deepEqual(suggestIntensityTechniques(ex, { goal: 'strength' }).dropSets, []);
  const hyp = suggestIntensityTechniques(ex, { goal: 'hypertrophy' }).dropSets;
  assert.equal(hyp.length, 1); assert.match(hyp[0].serializedAs, /dropSet=true/); assert.ok(hyp[0].reason);
});
test('drop set rows are never grouped and are labelled in the session table', () => {
  const rows = normalize(smartPlan([rmSet({ restSeconds: 0 }), dropRm({ percent1RM: 65 }), dropRm({ percent1RM: 55 })])).exercises;
  const table = buildSessionTable({ exercises: rows.map((e) => ({ ...e, title: 'Press' })) });
  const parts = table.main[0].sets.split('; ');
  assert.equal(parts.length, 3); assert.doesNotMatch(parts[0], /Drop set/); assert.match(parts[1], /\[Drop set\]/); assert.match(parts[2], /\[Drop set\]/);
});

