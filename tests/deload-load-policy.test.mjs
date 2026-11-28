import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { applyDeloadLoadPolicy, DELOAD_CUSTOMIZE_WEIGHT_REQUIRED } from '../plugin/deload-load-policy.mjs';
import { resolveGoalBoundSmartRmPresetName } from '../plugin/goal-preset-routing.mjs';
import { getReferenceClientRmPresetByName } from '../plugin/preset-mapping.mjs';
import { MAX_PRESET_REPS, resolvePercent1RMSet, validateReferenceClientRmLevel } from '../plugin/program-payload.mjs';

const exercise = (overrides = {}) => ({
  id: 12,
  entryId: 3,
  title: 'Standing Dual-Handle Row',
  section: 'main',
  loadType: 'smart-rm',
  smartRmPresetId: 1,
  smartRmPresetName: 'Gain Muscle',
  sets: [
    { unit: 'reps', reps: 10, mode: 1, restSeconds: 120 },
    { unit: 'reps', reps: 10, mode: 1, restSeconds: 120 }
  ],
  ...overrides
});


test('explicit deload converts complete per-set account loads to Customize and preserves side/dose', () => {
  const input = exercise({ sets: [
    { unit: 'reps', reps: 12, side: 1, weight: 9, weightUnit: 'kg', mode: 1, restSeconds: 75 },
    { unit: 'reps', reps: 12, side: 2, weight: 9, weightUnit: 'kg', mode: 1, restSeconds: 75 }
  ] });
  const result = applyDeloadLoadPolicy({ isDeload: true, exercises: [input], inferredLoadTypes: ['smart-rm'] });
  assert.equal(result.requiredLoads.length, 0);
  assert.equal(result.exercises[0].loadType, 'customize-manual');
  assert.equal(result.exercises[0].staticLoadRequested, true);
  assert.equal(result.exercises[0].smartRmPresetName, undefined);
  assert.deepEqual(result.exercises[0].sets.map(({ side, reps, weight, weightUnit }) => ({ side, reps, weight, weightUnit })), [
    { side: 1, reps: 12, weight: 9, weightUnit: 'kg' },
    { side: 2, reps: 12, weight: 9, weightUnit: 'kg' }
  ]);
});

test('explicit deload returns structured required loads instead of Smart RM fallback', () => {
  const input = exercise({ sets: [
    { unit: 'reps', reps: 8, side: 1, mode: 1, restSeconds: 90 },
    { unit: 'reps', reps: 8, side: 2, weight: 12, weightUnit: 'kg', mode: 1, restSeconds: 90 }
  ] });
  const result = applyDeloadLoadPolicy({ isDeload: true, exercises: [input], inferredLoadTypes: ['smart-rm'] });
  assert.equal(result.exercises[0].loadType, 'smart-rm');
  assert.deepEqual(result.requiredLoads, [{
    exerciseIndex: 1,
    entryId: 3,
    exerciseId: 12,
    title: 'Standing Dual-Handle Row',
    section: 'main',
    sourceLoadType: 'smart-rm',
    requiredLoadType: 'customize-manual',
    requiredSets: [{ set: 1, side: 1, reps: 8, unit: 'reps', missingFields: ['weight', 'weightUnit'] }]
  }]);
  const message = JSON.stringify({ code: DELOAD_CUSTOMIZE_WEIGHT_REQUIRED, requiredLoads: result.requiredLoads });
  assert.match(message, /GM_COACH_DELOAD_CUSTOMIZE_WEIGHT_REQUIRED/);
  assert.match(message, /Standing Dual-Handle Row/);
});

test('defaults missing loadType through resolved catalog inference but never infers deload from a name', () => {
  const named = exercise({ name: undefined, title: 'W6 DELOAD Bench', loadType: undefined });
  const ordinary = applyDeloadLoadPolicy({ isDeload: false, exercises: [named], inferredLoadTypes: ['smart-rm'] });
  assert.equal(ordinary.exercises[0].loadType, undefined);
  assert.deepEqual(ordinary.requiredLoads, []);

  const explicit = applyDeloadLoadPolicy({ isDeload: true, exercises: [named], inferredLoadTypes: ['smart-rm'] });
  assert.equal(explicit.requiredLoads.length, 1);
  assert.equal(explicit.requiredLoads[0].requiredLoadType, 'customize-manual');
});

test('bodyweight, timed warm-up, existing Customize, and explicit Smart RM override are preserved', () => {
  const bodyweight = exercise({ loadType: 'bodyweight', sets: [{ unit: 'sec', durationSeconds: 25, mode: 1, restSeconds: 30 }] });
  const warmup = exercise({ section: 'warmup' });
  const customize = exercise({ loadType: 'customize-manual', staticLoadRequested: true, sets: [{ unit: 'reps', reps: 10, weight: 20, weightUnit: 'kg', mode: 1, restSeconds: 60 }] });
  const smartOverride = exercise();
  const result = applyDeloadLoadPolicy({ isDeload: true, exercises: [bodyweight, warmup, customize] });
  assert.equal(result.requiredLoads.length, 0);
  assert.equal(result.exercises[0].loadType, 'bodyweight');
  assert.equal(result.exercises[1].loadType, 'smart-rm');
  assert.equal(result.exercises[2].loadType, 'customize-manual');
  const missing = applyDeloadLoadPolicy({ isDeload: true, exercises: [smartOverride] });
  assert.equal(missing.requiredLoads.length, 1);

  const override = applyDeloadLoadPolicy({ isDeload: true, deloadLoadOverride: 'smart-rm', exercises: [smartOverride] });
  assert.equal(override.requiredLoads.length, 0);
  assert.equal(override.exercises[0].loadType, 'smart-rm');
});

test('mcp public preview/create schemas and normalization call the same explicit deload policy', async () => {
  const source = await readFile(new URL('../plugin/mcp_server.mjs', import.meta.url), 'utf8');
  assert.match(source, /from ['"]\.\/deload-load-policy\.mjs['"]/);
  assert.match(source, /applyDeloadLoadPolicy\(/);
  assert.match(source, /isDeload:\s*\{\s*type:\s*['"]boolean['"]/);
  assert.match(source, /deloadLoadOverride:\s*\{\s*type:\s*['"]string['"].*smart-rm/s);
  assert.match(source, /cycleContext:\s*\{\s*type:\s*['"]object['"]/);
  assert.match(source, /DELOAD_CUSTOMIZE_WEIGHT_REQUIRED/);
  assert.match(source, /\.\.\.\(args\.isDeload === undefined \? \{\} : \{ isDeload: args\.isDeload \}\)/);
  assert.match(source, /deloadRecognitionNotice/);
});

test('actual public normalizePlan converts supplied deload loads and returns requiredLoads before any write path', async () => {
  const source = await readFile(new URL('../plugin/mcp_server.mjs', import.meta.url), 'utf8');
  const begin = source.indexOf('function normalizePlan(args,');
  const end = source.indexOf('\nfunction assertQuickTestProgramShape', begin);
  assert.ok(begin >= 0 && end > begin);
  const context = {
    applyDeloadLoadPolicy,
    DELOAD_CUSTOMIZE_WEIGHT_REQUIRED,
    resolveGoalBoundSmartRmPresetName,
    getReferenceClientRmPresetByName,
    validateReferenceClientRmLevel,resolvePercent1RMSet,
    MAX_PRESET_REPS,
    inferDefaultLoadType: () => 'smart-rm',
    normalizeRecoveryContextDeclaration: value => value,
    normalizeTrainingEvidence: (rationale, evidence) => ({ rationale, evidence }),
    normalizeExerciseLoadType: value => value,
    resolveRequestedLoadType: ({ loadType, defaultLoadType }) => loadType ?? defaultLoadType,
    assertPilatesResistanceSupported: () => {},
    classifyPrescriptionUnit: unit => ['sec', 'seconds'].includes(unit) ? 'seconds' : 'reps',
    isWritableResistanceMode: mode => mode === 1 || mode === 2 || mode === 3,
    normalizeExerciseEntry: value => ({ ...value, section: value.section ?? 'main' }),
    normalizeSupersetBlocks: () => [],
    normalizeEvidencePlanItems: () => ({ warmup: { status: 'omitted_user_preference', items: [] }, postWorkoutStretching: { status: 'omitted_user_preference', items: [] } }),
    normalizeEvidenceCoverage: () => [],
    normalizePreferenceReviews: () => [],
    assertNoUnserializedTechniqueInstructions: () => {},
    validateExecutablePlanSections: () => {}
  };
  const normalize = new Function(...Object.keys(context), `return (${source.slice(begin, end)});`)(...Object.values(context));
  const base = {
    name: 'Deload Week', isDeload: true, scienceGate: 'user_declined', rationale: 'Reduced work.', evidence: [], decisionEvidence: [],
    warmup: { status: 'omitted_user_preference', items: [] }, postWorkoutStretching: { status: 'omitted_user_preference', items: [] },
    exercises: [exercise({ sets: [
      { unit: 'reps', reps: 8, rirTarget: 5, weight: 48.5, weightUnit: 'kg', mode: 1, restSeconds: 120 },
      { unit: 'reps', reps: 8, rirTarget: 5, weight: 48.5, weightUnit: 'kg', mode: 1, restSeconds: 120 }
    ] })]
  };
  const normalized = normalize(structuredClone(base));
  assert.equal(normalized.isDeload, true);
  assert.equal(normalized.exercises[0].loadType, 'customize-manual');
  assert.equal(normalized.exercises[0].staticLoadRequested, true);
  // Device step: above 10 kg only whole kg; 48.5 kg is normalized down to 48 kg.
  assert.deepEqual(normalized.exercises[0].sets.map(set => set.weight), [48, 48]);

  const ordinary = structuredClone(base);
  delete ordinary.isDeload;
  ordinary.name = 'Deload label alone is not intent';
  ordinary.exercises[0].sets = ordinary.exercises[0].sets.map(({ weight, weightUnit, ...set }) => set);
  const ordinaryNormalized = normalize(ordinary);
  assert.equal(Object.hasOwn(ordinaryNormalized, 'isDeload'), false);
  assert.equal(ordinaryNormalized.exercises[0].loadType, 'smart-rm');

  const nonDeloadWeek = structuredClone(ordinary);
  nonDeloadWeek.cycleContext = { week: 1, deloadWeek: 6 };
  const nonDeloadWeekNormalized = normalize(nonDeloadWeek);
  assert.equal(Object.hasOwn(nonDeloadWeekNormalized, 'isDeload'), false);
  assert.equal(nonDeloadWeekNormalized.exercises[0].loadType, 'smart-rm');

  const missingScheduledDeloadLoads = structuredClone(ordinary);
  missingScheduledDeloadLoads.cycleContext = { week: 6, deloadWeek: 6 };
  assert.throws(() => normalize(missingScheduledDeloadLoads), error => error.code === DELOAD_CUSTOMIZE_WEIGHT_REQUIRED);

  const suppliedScheduledDeload = structuredClone(base);
  delete suppliedScheduledDeload.isDeload;
  suppliedScheduledDeload.cycleContext = { week: 6, deloadWeek: 6 };
  const suppliedScheduledDeloadNormalized = normalize(suppliedScheduledDeload);
  assert.equal(suppliedScheduledDeloadNormalized.isDeload, true);
  assert.deepEqual(suppliedScheduledDeloadNormalized.cycleContext, { week: 6, deloadWeek: 6 });
  assert.equal(suppliedScheduledDeloadNormalized.exercises[0].loadType, 'customize-manual');

  const missing = structuredClone(base);
  missing.exercises[0].sets[0] = { unit: 'reps', reps: 8, rirTarget: 5, mode: 1, restSeconds: 120 };
  delete missing.exercises[0].sets[1].weight;
  delete missing.exercises[0].sets[1].weightUnit;
  assert.throws(() => normalize(missing), error => {
    assert.equal(error.code, DELOAD_CUSTOMIZE_WEIGHT_REQUIRED);
    assert.equal(error.requiredLoads[0].requiredLoadType, 'customize-manual');
    assert.deepEqual(error.requiredLoads[0].requiredSets.map(set => set.set), [1, 2]);
    return true;
  });
});
