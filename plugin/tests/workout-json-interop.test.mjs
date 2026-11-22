import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { inspectWorkoutJson, workoutJsonInspectionSchema, exportWorkoutJson } from '../workout-json-interop.mjs';
const workout = () => ({ name: 'reference client export', exercises: [{ id: 42, title: 'Imported title', preset: -1, isUnilateralExpanded: true, sets: [{ reps: 30, weight: 15, mode: 1, rest: 60 }, { reps: 8, weight: 18, mode: 2, rest: 90 }] }] });
const exportInput = () => ({ staticWeightUnit: 'lb', staticLoadProtocol: 'legacy-reference-client-wire-lb-get-kg', normalizedPlan: { name: 'Export', exercises: [{ id: 42, title: 'Source', actionLibraryId: 142, exportIsUnilateral: false, loadType: 'customize-manual', staticLoadRequested: true, sets: [15, 18, 21].map(weight => ({ unit: 'reps', reps: 8, weight, weightUnit: 'lb', mode: 1, rest: 60, rirTarget: 2 })) }] } });
test('static export retains requested account loads and discloses omissions and actual normalization', () => {
  const input = exportInput(), before = structuredClone(input);
  const result = exportWorkoutJson(input);
  assert.deepEqual(input, before);
  assert.deepEqual(result.workoutJson.exercises[0].sets.map(set => set.weight), [15, 18, 21]);
  assert.deepEqual(result.normalizations.map(value => value.expectedReferenceClientApiWeight), [15.4, 17.6, 20.9]);
  assert.equal(result.workoutJson.exercises[0].actionLibraryId, undefined);
  assert.equal(result.workoutJson.exercises[0].sets[0].rirTarget, undefined);
  assert.equal(result.lossless, false);
  assert.equal(result.scientificApproval, false); assert.equal(result.accountRead, false);
  input.staticLoadProtocol = 'account-unit-verbatim';
  assert.deepEqual(exportWorkoutJson(input).normalizations, []);
});
test('named RM export preserves actual selectors and refuses omitted defaults', () => {
  const input = exportInput(), exercise = input.normalizedPlan.exercises[0];
  Object.assign(exercise, { loadType: 'smart-rm', smartRmPresetId: 1, smartRmPresetName: 'Gain Muscle' });
  exercise.sets = [12, 11].map(rmLevel => ({ unit: 'reps', reps: 8, rmLevel, mode: 1, rest: 60 }));
  assert.deepEqual(exportWorkoutJson(input).workoutJson.exercises[0].sets.map(set => set.weight), [12, 11]);
  delete exercise.sets[0].rmLevel;
  assert.throws(() => exportWorkoutJson(input), /no default/);
});
for (const [name, id, reps, rmLevel, min, max] of [['Customize', -1, 8, null, 0, 300], ['Gain Muscle', 1, 8, 9, 45, 120], ['Stamina', 3, 13, 15, 30, 180], ['Strength', 5, 2, 4, 60, 180]]) {
  test(`export enforces ${name} import UI rest bounds without changing source`, () => {
    const input = exportInput(), exercise = input.normalizedPlan.exercises[0];
    if (id !== -1) Object.assign(exercise, { loadType: 'smart-rm', smartRmPresetId: id, smartRmPresetName: name });
    exercise.sets = [{ ...exercise.sets[0], reps, ...(id === -1 ? {} : { rmLevel }) }];
    for (const rest of [min, max]) {
      exercise.sets[0].rest = rest;
      const before = structuredClone(input);
      assert.equal(exportWorkoutJson(input).workoutJson.exercises[0].sets[0].rest, rest === 0 ? '0' : rest);
      assert.deepEqual(input, before);
    }
    for (const rest of [min - 1, max + 1, 600]) {
      exercise.sets[0].rest = rest;
      const before = structuredClone(input);
      assert.throws(() => exportWorkoutJson(input), /reference client.*rest|reference client import UI range/);
      assert.deepEqual(input, before);
    }
  });
}

test('fixed kg and prepared profile exports use display loads rather than wire tokens', () => {
  const input = exportInput(), exercise = input.normalizedPlan.exercises[0];
  Object.assign(exercise, { loadType: 'fixed-kg', fixedKgAuthorized: true });
  exercise.sets = [{ unit: 'reps', reps: 8, weightKg: 10, mode: 1, rest: 60 }];
  const fixed = exportWorkoutJson(input);
  assert.equal(fixed.workoutJson.exercises[0].sets[0].weight, 22);
  assert.equal(fixed.accountUnitVerified, false); assert.equal(fixed.catalogSidesVerified, false);
  Object.assign(exercise, { loadType: 'profile-auto', strengthAnchor: { unit: 'lb', source: 'source-only' } });
  Object.assign(exercise.sets[0], { calculatedLoad: 15, loadUnit: 'lb', loadEstimate: { targetPercent1RM: 0.77 } });
  assert.equal(exportWorkoutJson(input).workoutJson.exercises[0].sets[0].weight, 15);
  assert.equal(exportWorkoutJson(input).normalizations[0].expectedReferenceClientApiWeight, 15.4);
});
test('export rejects static inputs reference client would clamp or snap instead of silently altering them', () => {
  // lb accepts 0.1 lb (device kg steps shown in lb); finer values are still rejected.
  const input = exportInput(); input.normalizedPlan.exercises[0].sets[0].weight = 15.45;
  assert.throws(() => exportWorkoutJson(input), /step/);
  input.staticWeightUnit = 'kg';
  const exercise = input.normalizedPlan.exercises[0];
  exercise.sets = [{ unit: 'reps', reps: 8, weight: 8, weightUnit: 'kg', mode: 1, rest: 60 }];
  assert.throws(() => exportWorkoutJson(input), /exportIsBarbell/);
  exercise.exportIsBarbell = false;
  assert.equal(exportWorkoutJson(input).workoutJson.exercises[0].sets[0].weight, 8);
  exercise.sets[0].weight = 3;
  assert.throws(() => exportWorkoutJson(input), /Static load/);
});
test('export rejects unsupported execution and unresolved sides, permits exact L/R pairs', () => {
  for (const mutate of [value => { value.normalizedPlan.supersetBlocks = [{}]; }, value => { value.normalizedPlan.exercises[0].loadType = 'vita'; }, value => { value.normalizedPlan.exercises[0].section = 'warmup'; }, value => { delete value.normalizedPlan.exercises[0].exportIsUnilateral; }, value => { value.normalizedPlan.exercises[0].bands = [1]; }, value => { value.normalizedPlan.exercises[0].sets[0].unit = 'sec'; }]) {
    const input = exportInput(); mutate(input); assert.throws(() => exportWorkoutJson(input));
  }
  const input = exportInput(), exercise = input.normalizedPlan.exercises[0];
  exercise.exportIsUnilateral = true; exercise.unilateralPrescription = 'explicit-sides';
  exercise.sets = [{ ...exercise.sets[0], side: 1 }, { ...exercise.sets[0], side: 2 }];
  assert.equal(exportWorkoutJson(input).workoutJson.exercises[0].isUnilateralExpanded, true);
  exercise.sets[1].side = 1;
  assert.throws(() => exportWorkoutJson(input), /left\/right/);
});
test('actual export dispatch is local and returns reference client JSON without mutation capability', async () => {
  const source = readFileSync(new URL('../mcp_server.mjs', import.meta.url), 'utf8');
  const start = source.indexOf("case 'gm_coach_export_reference_client_workout_json': {");
  const end = source.indexOf("case 'gm_coach_inspect_reference_client_workout_json':", start);
  assert.ok(start > 0 && end > start);
  const dispatch = vm.runInNewContext(`(async args => { switch ('gm_coach_export_reference_client_workout_json') { ${source.slice(start, end)} } })`, { exportWorkoutJson });
  const result = await dispatch(exportInput());
  assert.equal(result.mutationSent, false); assert.equal(result.requiresScientificPreview, true);
  assert.equal(result.workoutJson.name, 'Export');
});
test('static inspection preserves exact original and makes absent unit dose variant sides unresolved', () => {
  const original = workout(), before = structuredClone(original);
  const result = inspectWorkoutJson({ workoutJson: original });
  assert.deepEqual(result.originalWorkout, before);
  assert.deepEqual(original, before);
  assert.equal(result.exercises[0].sets.length, 2);
  assert.equal(result.exercises[0].expansionApplied, false);
  assert.equal(result.exercises[0].sets[0].doseUnit, 'unknown');
  assert.equal(result.exercises[0].sets[0].side, 'unknown');
  assert.equal(result.exercises[0].catalogVariantId, null);
  assert.equal(result.exercises[0].sets[0].load.unit, 'unknown');
  for (const unit of ['kg', 'lb']) {
    const explicit = inspectWorkoutJson({ workoutJson: original, staticWeightUnit: unit });
    assert.equal(explicit.exercises[0].sets[0].load.unit, unit);
    assert.equal(explicit.exercises[0].sets[0].load.accountUnitVerified, false);
  }
  original.exercises[0].sets[0].weight = 99;
  assert.equal(result.originalWorkout.exercises[0].sets[0].weight, 15);
});
test('named RM selectors remain distinct metadata without default replacement or invented load', () => {
  const source = workout(); source.exercises[0].preset = 1;
  source.exercises[0].sets[0].weight = 12; source.exercises[0].sets[1].weight = 11;
  const result = inspectWorkoutJson({ workoutJson: source, staticWeightUnit: 'lb' });
  assert.deepEqual(result.exercises[0].sets.map(set => set.load.selector), [12, 11]);
  assert.equal(result.exercises[0].sets[0].load.presetName, 'Gain Muscle');
  assert.equal(result.exercises[0].sets[0].load.physicalLoadKnown, false);
  assert.equal(result.exercises[0].sets[0].load.executableSelectorAuthorized, false);
  assert.equal(result.exercises[0].sets[0].load.unit, undefined);
});
test('unknown and malformed fields are preserved with diagnostics rather than defaulted', () => {
  const source = workout(); source.extra = { note: 'preserve' }; source.exercises[0].preset = 99;
  source.exercises[0].isUnilateralExpanded = 'yes';
  Object.assign(source.exercises[0].sets[0], { unit: 'seconds', reps: -1, mode: 4, rest: 0.5, weight: 'not numeric' });
  const result = inspectWorkoutJson({ workoutJson: source });
  assert.deepEqual(result.originalWorkout, source);
  assert.equal(result.exercises[0].sets[0].doseUnit, 'unknown');
  assert.equal(result.exercises[0].sets[0].load.kind, 'unknown');
  assert.ok(result.diagnostics.some(item => item.path.endsWith('.unit')));
  assert.ok(result.diagnostics.some(item => item.path.endsWith('.preset')));
  assert.ok(result.diagnostics.some(item => item.path.endsWith('.mode')));
});
test('bounded plain JSON rejects sparse cycles accessors nonfinite and oversized structures', () => {
  const cycle = workout(); cycle.loop = cycle;
  const sparse = workout(); sparse.exercises[0].sets = Array(2);
  const nonfinite = workout(); nonfinite.exercises[0].sets[0].weight = Infinity;
  const oversized = workout(); oversized.exercises = Array.from({ length: 61 }, () => workout().exercises[0]);
  const getter = workout(); Object.defineProperty(getter, 'extra', { enumerable: true, get() { throw new Error('Getter executed'); } });
  for (const value of [cycle, sparse, nonfinite, oversized, getter]) assert.throws(() => inspectWorkoutJson({ workoutJson: value }));
  assert.throws(() => inspectWorkoutJson({ workoutJson: workout(), staticWeightUnit: 'stone' }), /kg or lb/);
  assert.throws(() => inspectWorkoutJson({ workoutJson: workout(), confirm: true }), /Unknown/);
});
test('actual public local dispatch requires no account capability and never grants execution approval', async () => {
  const source = readFileSync(new URL('../mcp_server.mjs', import.meta.url), 'utf8');
  const start = source.indexOf("case 'gm_coach_inspect_reference_client_workout_json': {");
  const end = source.indexOf("case 'gm_coach_derive_training_cycle_prescription':", start);
  assert.ok(start > 0 && end > start);
  const dispatch = vm.runInNewContext(`(async args => { switch ('gm_coach_inspect_reference_client_workout_json') { ${source.slice(start, end)} } })`, { inspectWorkoutJson });
  const result = await dispatch({ workoutJson: workout(), staticWeightUnit: 'lb' });
  assert.equal(result.scientificApproval, false);
  assert.equal(result.mutationSent, false); assert.equal(result.accountRead, false);
  assert.equal(result.requiresScientificPreview, true);
  assert.equal(workoutJsonInspectionSchema.additionalProperties, false);
  assert.deepEqual(workoutJsonInspectionSchema.required, ['workoutJson']);
});

function inspectionDispatch() {
  const source = readFileSync(new URL('../mcp_server.mjs', import.meta.url), 'utf8');
  const start = source.indexOf("case 'gm_coach_inspect_reference_client_workout_json': {");
  const end = source.indexOf("case 'gm_coach_derive_training_cycle_prescription':", start);
  assert.ok(start > 0 && end > start);
  return vm.runInNewContext(`(async args => { switch ('gm_coach_inspect_reference_client_workout_json') { ${source.slice(start, end)} } })`, { inspectWorkoutJson });
}

function exportDispatch() {
  const source = readFileSync(new URL('../mcp_server.mjs', import.meta.url), 'utf8');
  const start = source.indexOf("case 'gm_coach_export_reference_client_workout_json': {");
  const end = source.indexOf("case 'gm_coach_inspect_reference_client_workout_json':", start);
  assert.ok(start > 0 && end > start);
  return vm.runInNewContext(`(async args => { switch ('gm_coach_export_reference_client_workout_json') { ${source.slice(start, end)} } })`, { exportWorkoutJson });
}

// Independent captured primary importer mapping: hbui3 public create.html
// lines 795–800, inspected 2026-10-07. Main is mutable; this is a source-behavior
// oracle, not an account or firmware test. No Coach production helper supplies it.
function referenceClientImportedSets(sets) {
  return sets.map(s => ({
    reps: parseInt(s.reps),
    weight: parseFloat(String(s.weight ?? 0).replace(',', '.')),
    mode: parseInt(s.mode || 1),
    rest: parseInt(s.rest || 60),
    unit: 'reps'
  }));
}

for (const unilateral of [false, true]) {
  test(`public reference client export preserves zero-rest Customize through captured importer (${unilateral ? 'explicit left/right pairs' : 'bilateral'})`, async () => {
    const input = exportInput(); input.staticWeightUnit = 'kg';
    const exercise = input.normalizedPlan.exercises[0];
    Object.assign(exercise, { exportIsUnilateral: unilateral, exportIsBarbell: false });
    if (unilateral) exercise.unilateralPrescription = 'explicit-sides';
    const rests = unilateral ? [0, 60, 90, 0, 60, 90] : [0, 60, 90];
    exercise.sets = rests.map((rest, index) => ({ unit: 'reps', reps: 8 + index, weight: 10 + index / 2, weightUnit: 'kg', mode: index % 3 + 1, rest, ...(unilateral ? { side: index % 2 + 1 } : {}) }));
    const before = structuredClone(input);
    const result = await exportDispatch()(input);
    assert.deepEqual(input, before);
    const exported = JSON.parse(JSON.stringify(result.workoutJson));
    assert.equal(exported.exercises[0].isUnilateralExpanded, unilateral);
    assert.equal(exported.exercises[0].sets.length, rests.length);
    assert.deepEqual(exported.exercises[0].sets.map(set => set.rest), rests.map(rest => rest === 0 ? '0' : rest));
    assert.equal(referenceClientImportedSets([{ reps: 8, weight: 10, mode: 1, rest: 0 }])[0].rest, 60, 'oracle exhibits the original numeric-zero loss');
    const imported = referenceClientImportedSets(exported.exercises[0].sets);
    assert.deepEqual(imported.map(set => set.rest), rests);
    assert.deepEqual(imported.map(set => set.weight), exercise.sets.map(set => set.weight));
    assert.deepEqual(imported.map(set => set.mode), exercise.sets.map(set => set.mode));
    assert.deepEqual(imported.map(set => set.reps), exercise.sets.map(set => set.reps));
    assert.deepEqual(result.representationNormalizations, rests.flatMap((rest, index) => rest === 0 ? [{ exerciseIndex: 0, setIndex: index, field: 'rest', requestedSeconds: 0, exportedValue: '0', expectedReferenceClientImportedSeconds: 0, reason: 'Preserve zero rest through the public reference client importer numeric-zero fallback.', accountApiVerified: false }] : []));
    const inspected = await inspectionDispatch()({ workoutJson: { ...exported, exercises: [{ ...exported.exercises[0], sets: imported }] }, staticWeightUnit: 'kg' });
    assert.deepEqual(inspected.exercises[0].sets.map(set => set.restSeconds), rests);
    assert.ok(inspected.exercises[0].sets.every(set => set.doseUnit === 'unknown'));
    for (const value of [result, inspected]) {
      assert.equal(value.scientificApproval, false); assert.equal(value.mutationSent, false); assert.equal(value.accountRead, false);
    }
  });
}

test('public named RM export retains numeric positive rests and distinct selectors without representation changes', async () => {
  const input = exportInput(), exercise = input.normalizedPlan.exercises[0];
  Object.assign(exercise, { loadType: 'smart-rm', smartRmPresetId: 1, smartRmPresetName: 'Gain Muscle' });
  exercise.sets = [12, 11].map((rmLevel, index) => ({ unit: 'reps', reps: 8 + index, rmLevel, mode: index + 1, rest: index ? 120 : 45 }));
  const before = structuredClone(input), result = await exportDispatch()(input);
  assert.deepEqual(input, before); assert.deepEqual(result.representationNormalizations, []);
  assert.deepEqual(referenceClientImportedSets(result.workoutJson.exercises[0].sets).map(set => [set.reps, set.weight, set.mode, set.rest]), [[8, 12, 1, 45], [9, 11, 2, 120]]);
  assert.ok(result.workoutJson.exercises[0].sets.every(set => typeof set.rest === 'number'));
});

test('public inspection accepts whole-token comma weight spelling without guessing static units', async () => {
  const source = workout();
  const spellings = ['11,5', '11.5', ' +11,50 ', ',5', '-0,5'];
  source.exercises[0].sets = spellings.map(weight => ({ reps: 8, weight, mode: 1, rest: 60 }));
  const before = structuredClone(source), result = await inspectionDispatch()({ workoutJson: source });
  assert.deepEqual(source, before); assert.deepEqual(result.originalWorkout, before);
  assert.deepEqual(result.exercises[0].sets.map(set => set.load.value), [11.5, 11.5, 11.5, 0.5, -0.5]);
  assert.ok(result.exercises[0].sets.every(set => set.load.unit === 'unknown' && set.load.accountUnitVerified === false && set.doseUnit === 'unknown'));
  assert.equal(result.diagnostics.filter(item => /comma decimal parsed/.test(item.reason)).length, 4);
  assert.ok(result.diagnostics.some(item => item.path === 'exercises[0].sets[4].weight' && /Invalid imported load/.test(item.reason)), 'negative loads remain invalid after spelling parsing');
  const explicit = await inspectionDispatch()({ workoutJson: source, staticWeightUnit: 'kg' });
  assert.equal(explicit.exercises[0].sets[0].load.unit, 'kg');
  assert.equal(explicit.exercises[0].sets[0].load.accountUnitVerified, false);
  for (const value of [result, explicit]) {
    assert.equal(value.scientificApproval, false); assert.equal(value.mutationSent, false); assert.equal(value.accountRead, false);
  }
});

test('public inspection rejects comma prefix junk and leaves non-weight numeric parsing strict', async () => {
  const invalid = ['11,5kg', '11,5,2', '11.5,2', '1e2', ' ', '+', 'Infinity', '1 000,5'];
  const source = workout();
  source.exercises[0].sets = invalid.map(weight => ({ reps: 8, weight, mode: 1, rest: 60 }));
  source.exercises[0].sets.push({ reps: '8,0', weight: '11,5', mode: '1,0', rest: '60,0' });
  const before = structuredClone(source), result = await inspectionDispatch()({ workoutJson: source });
  assert.deepEqual(result.originalWorkout, before);
  invalid.forEach((_, index) => {
    assert.equal(result.exercises[0].sets[index].load.value, null);
    assert.equal(result.diagnostics.filter(item => item.path === `exercises[0].sets[${index}].weight` && /Invalid imported load/.test(item.reason)).length, 1);
  });
  const index = invalid.length;
  for (const field of ['reps', 'mode', 'rest']) assert.ok(result.diagnostics.some(item => item.path === `exercises[0].sets[${index}].${field}`));
  assert.equal(result.exercises[0].sets[index].importedAmount, null);
  assert.equal(result.exercises[0].sets[index].mode, null);
  assert.equal(result.exercises[0].sets[index].restSeconds, null);
});

test('public inspection treats comma named selectors as unapproved metadata and rejects fractional selectors', async () => {
  const source = workout(); source.exercises[0].preset = 1;
  source.exercises[0].sets = ['12,0', '12,5'].map(weight => ({ reps: 8, weight, mode: 1, rest: 60 }));
  const before = structuredClone(source), result = await inspectionDispatch()({ workoutJson: source });
  assert.deepEqual(result.originalWorkout, before);
  assert.deepEqual(result.exercises[0].sets.map(set => set.load.selector), [12, 12.5]);
  assert.ok(result.exercises[0].sets.every(set => set.load.executableSelectorAuthorized === false && set.load.physicalLoadKnown === false));
  assert.equal(result.diagnostics.some(item => item.path === 'exercises[0].sets[0].weight' && /Invalid .*RM selector/.test(item.reason)), false);
  assert.equal(result.diagnostics.some(item => item.path === 'exercises[0].sets[1].weight' && /Invalid .*RM selector/.test(item.reason)), true);
  source.exercises[0].preset = 99;
  const unknown = await inspectionDispatch()({ workoutJson: source });
  assert.equal(unknown.exercises[0].sets[0].load.kind, 'unknown');
  assert.equal(unknown.exercises[0].sets[0].load.rawWeight, '12,0');
  assert.equal(unknown.scientificApproval, false); assert.equal(unknown.accountRead, false);
});

for (const [name, preset, selector, minReps, maxReps, minRest, maxRest] of [
  ['Customize', -1, 15, 1, 99, 0, 300],
  ['Gain Muscle', 1, 13, 8, 12, 45, 120],
  ['Stamina', 3, 17, 13, 20, 30, 180],
  ['Strength', 5, 7, 2, 8, 60, 180]
]) {
  test(`public inspection discloses ${name} UI boundaries without changing or approving imported dose`, async () => {
    const dispatch = inspectionDispatch();
    const source = workout(); source.exercises[0].preset = preset;
    const amounts = [minReps - 1, minReps, maxReps, maxReps + 1];
    const rests = [minRest - 1, minRest, maxRest, maxRest + 1];
    source.exercises[0].sets = amounts.map((reps, index) => ({ reps, weight: selector, mode: 1, rest: rests[index] }));
    const before = structuredClone(source);
    const result = await dispatch({ workoutJson: source });
    assert.deepEqual(source, before); assert.deepEqual(result.originalWorkout, before);
    for (let index = 0; index < 4; index++) {
      const path = `exercises[0].sets[${index}]`;
      const amountDiagnostics = result.diagnostics.filter(item => item.path === `${path}.reps`);
      const restDiagnostics = result.diagnostics.filter(item => item.path === `${path}.rest`);
      assert.equal(amountDiagnostics.length, index === 0 || index === 3 ? 1 : 0);
      assert.equal(restDiagnostics.length, index === 0 || index === 3 ? 1 : 0);
      if (amounts[index] >= 1 && amountDiagnostics.length) assert.match(amountDiagnostics[0].reason, /reference client import\/editor UI compatibility:.*dose unit remains unknown/);
      if (rests[index] >= 0 && restDiagnostics.length) assert.match(restDiagnostics[0].reason, /reference client import\/editor UI compatibility:.*not an account API limit/);
      assert.equal(result.exercises[0].sets[index].importedAmount, amounts[index]);
      assert.equal(result.exercises[0].sets[index].restSeconds, rests[index]);
      assert.equal(result.exercises[0].sets[index].doseUnit, 'unknown');
    }
    assert.equal(result.status, 'inspection-draft-only');
    assert.equal(result.scientificApproval, false); assert.equal(result.mutationSent, false);
    assert.equal(result.accountRead, false); assert.equal(result.requiresScientificPreview, true);
  });
}

test('public inspection retains timed/unknown-preset ambiguity and avoids duplicate malformed-input warnings', async () => {
  const dispatch = inspectionDispatch();
  const source = workout(); source.exercises[0].preset = 1;
  source.exercises[0].sets = [
    { reps: 30, weight: 13, mode: 1, rest: 150, unit: 'seconds' },
    { reps: 'invalid', weight: 13, mode: 1, rest: 0.5 },
    { reps: 0, weight: 13, mode: 1, rest: 601 }
  ];
  const before = structuredClone(source);
  const result = await dispatch({ workoutJson: source });
  assert.deepEqual(result.originalWorkout, before);
  assert.equal(result.exercises[0].sets[0].doseUnit, 'unknown');
  assert.ok(result.diagnostics.some(item => item.path.endsWith('.unit')));
  assert.match(result.diagnostics.find(item => item.path === 'exercises[0].sets[0].reps').reason, /UI compatibility/);
  for (const index of [1, 2]) for (const field of ['reps', 'rest']) {
    const diagnostics = result.diagnostics.filter(item => item.path === `exercises[0].sets[${index}].${field}`);
    assert.equal(diagnostics.length, 1); assert.doesNotMatch(diagnostics[0].reason, /UI compatibility/);
  }
  source.exercises[0].preset = 99;
  const unknown = await dispatch({ workoutJson: source });
  assert.equal(unknown.exercises[0].sets[0].doseUnit, 'unknown');
  assert.equal(unknown.exercises[0].sets[0].load.kind, 'unknown');
  assert.equal(unknown.diagnostics.some(item => /UI compatibility/.test(item.reason)), false);
  assert.equal(unknown.scientificApproval, false); assert.equal(unknown.accountRead, false);
});

for (const [preset, values, low, high] of [[1, [8, 9, 13, 14], 9, 13], [5, [3, 4, 9, 10], 4, 9], [3, [14, 15, 20, 21], 15, 20]]) {
  test(`named preset ${preset} reports only selector values outside its public range`, () => {
    const source = workout(); source.exercises[0].preset = preset;
    source.exercises[0].sets = values.map(weight => ({ reps: 8, weight, mode: 1, rest: 60 }));
    const result = inspectWorkoutJson({ workoutJson: source });
    assert.deepEqual(result.originalWorkout, source);
    assert.deepEqual(result.exercises[0].sets.map(set => set.load.selector), values);
    values.forEach((value, index) => {
      assert.equal(result.diagnostics.some(item => item.path === `exercises[0].sets[${index}].weight`), value < low || value > high);
      assert.equal(result.exercises[0].sets[index].load.executableSelectorAuthorized, false);
    });
  });
}
test('prototype-shaped own JSON keys remain preserved data without changing object prototypes', () => {
  const source = workout();
  source.extra = JSON.parse('{"__proto__":{"referenceClientInspectionPolluted":true},"constructor":{"prototype":{"referenceClientInspectionPolluted":true}}}');
  const result = inspectWorkoutJson({ workoutJson: source });
  assert.equal(Object.getPrototypeOf(result.originalWorkout.extra), Object.prototype);
  assert.equal(Object.hasOwn(result.originalWorkout.extra, '__proto__'), true);
  assert.equal(result.originalWorkout.extra.__proto__.referenceClientInspectionPolluted, true);
  assert.equal({}.referenceClientInspectionPolluted, undefined);
  assert.deepEqual(result.originalWorkout, source);
  const inherited = Object.assign(Object.create({ name: 'Inherited workout' }), source);
  assert.throws(() => inspectWorkoutJson({ workoutJson: inherited }), /plain JSON/);
});
test('deep unknown fields and oversized sparse arrays reject before inspection', () => {
  const source = workout(); let cursor = source;
  for (let index = 0; index < 14; index++) { cursor.extra = {}; cursor = cursor.extra; }
  assert.throws(() => inspectWorkoutJson({ workoutJson: source }), /nesting/);
  const sparse = workout(); sparse.extra = Array(1000000);
  assert.throws(() => inspectWorkoutJson({ workoutJson: sparse }), /bounds|sparse/);
});
test('UTF-8 bytes bound multibyte JSON independently of character count', () => {
  const source = workout();
  source.extra = Object.fromEntries(Array.from({ length: 17 }, (_, index) => [`text${index}`, '界'.repeat(9800)]));
  const encoded = JSON.stringify({ workoutJson: source });
  assert.ok(encoded.length < 500000);
  assert.ok(Buffer.byteLength(encoded, 'utf8') > 500000);
  assert.throws(() => inspectWorkoutJson({ workoutJson: source }), /UTF-8 byte limit/);
  source.extra = Object.fromEntries(Array.from({ length: 16 }, (_, index) => [`text${index}`, '界'.repeat(9800)]));
  assert.ok(Buffer.byteLength(JSON.stringify({ workoutJson: source }), 'utf8') < 500000);
  assert.deepEqual(inspectWorkoutJson({ workoutJson: source }).originalWorkout, source);
});
