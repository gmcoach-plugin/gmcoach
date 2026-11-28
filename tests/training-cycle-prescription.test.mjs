import test from 'node:test';
import assert from 'node:assert/strict';
import { deriveTrainingCyclePrescription } from '../plugin/training-cycle-prescription.mjs';

test('structural dose mode rest and modality limits reject malformed prepared plans', () => {
  for (const mutate of [
    ex => ex.sets[0].mode = 99,
    ex => ex.sets[0].rest = 1.5,
    ex => ex.sets[0].reps = 101,
    ex => { ex.sets[0].unit = 'sec'; delete ex.sets[0].reps; ex.sets[0].durationSeconds = 86401; },
    ex => ex.loadType = 'unknown',
    ex => ex.loadType = 'vita',
    ex => ex.loadType = 'cardio',
    ex => ex.loadType = 'smart-rm',
    ex => ex.loadType = 'profile-auto'
  ]) { const input = fixture(); mutate(input.occurrences[0].normalizedPlan.exercises[1]); assert.throws(() => deriveTrainingCyclePrescription(input)); }
});

test('actual cycle prescription rejects repetition RIR on timed work', () => {
  const input = fixture();
  input.occurrences.forEach(row => {
    const set = row.normalizedPlan.exercises[1].sets[0];
    set.unit = 'sec'; delete set.reps; set.durationSeconds = 30;
  });
  assert.equal(deriveTrainingCyclePrescription(input).scientificApproval, false);
  for (const rirTarget of [0, 2, null, false, '2', undefined]) {
    const invalid = structuredClone(input);
    invalid.occurrences[0].normalizedPlan.exercises[1].sets[0].rirTarget = rirTarget;
    assert.throws(() => deriveTrainingCyclePrescription(invalid), /Timed prescription/);
  }
});

test('whole-cycle snapshot budget rejects large provenance rather than truncating it', () => {
  const input = fixture();
  input.occurrences = Array.from({ length: 12 }, (_, index) => ({ ...structuredClone(input.occurrences[0]), occurrenceId: `row-${index}`, normalizedPlan: { ...structuredClone(input.occurrences[0].normalizedPlan), rationale: 'x'.repeat(750000) } }));
  assert.throws(() => deriveTrainingCyclePrescription(input), /byte limit/);
});
test('cycle Smart RM preserves exact reference client preset identity independently of RIR', () => {
  for (const [name, id, reps, rmLevel] of [['Gain Muscle', 1, 8, 13], ['Strength', 5, 6, 7], ['Stamina', 3, 15, 17]]) {
    const input = fixture();
    input.occurrences.forEach(row => {
      const exercise = row.normalizedPlan.exercises[1];
      exercise.loadType = 'smart-rm'; exercise.smartRmPresetName = name; exercise.smartRmPresetId = id;
      Object.assign(exercise.sets[0], { reps, rmLevel, rirTarget: 2 });
    });
    assert.equal(deriveTrainingCyclePrescription(input).scientificApproval, false);
    input.occurrences[0].normalizedPlan.exercises[1].smartRmPresetId = id === 1 ? 5 : 1;
    assert.throws(() => deriveTrainingCyclePrescription(input), /Smart RM/);
  }
});

const exercise = (id, section, unit = 'reps', amount = 8) => ({ id, title: 'Exercise', section, loadType: 'bodyweight', sets: [{ unit, ...(unit === 'reps' ? { reps: amount } : { durationSeconds: amount }), rest: 90, mode: 1 }] });

function comparisonFixture() {
  const input = fixture();
  input.occurrences.splice(1, 1);
  input.occurrences[1].sessionId = 'b';
  input.occurrences.forEach(row => row.normalizedPlan.exercises.forEach(ex => { ex.actionLibraryId = ex.id + 100; }));
  return input;
}
function comparedMain(input) {
  return deriveTrainingCyclePrescription(input).transitions[0].prescriptionComparison.exercises.find(ex => ex.catalogId === 2);
}
test('cycle exposes local set summaries and comparable dose/rest/mode/RIR without physical claims', () => {
  const input = comparisonFixture();
  input.occurrences[0].normalizedPlan.exercises[1].sets[0].rirTarget = 3;
  Object.assign(input.occurrences[1].normalizedPlan.exercises[1].sets[0], { reps: 10, rest: 120, mode: 3, rirTarget: 2 });
  const result = deriveTrainingCyclePrescription(input), change = comparedMain(input).sets[0];
  assert.equal(change.deltaAmount, 2);
  assert.equal(change.deltaRestSeconds, 30);
  assert.deepEqual(change.mode, { from: 1, to: 3 });
  assert.equal(change.rir.status, 'known');
  assert.equal(change.rir.delta, -1);
  assert.equal(change.rir.to - change.rir.from, -1);
  assert.equal(result.occurrences[0].localPrescribedSets, 2);
  assert.equal(result.weeks[0].expandedExecutionRows, 'unknown');
  assert.equal(result.transitions[0].prescriptionComparison.physiologicalProgressionConfirmed, false);
  assert.match(result.note, /before unilateral or superset/);
});
test('variant and dose/load unit changes stay unmatched without numeric deltas', () => {
  for (const [mutate, reason] of [
    [ex => ex.actionLibraryId = 999, 'variant-changed'],
    [ex => delete ex.actionLibraryId, 'variant-unknown'],
    [ex => { ex.sets[0].unit = 'sec'; delete ex.sets[0].reps; ex.sets[0].durationSeconds = 30; }, 'dose-unit-changed'],
    [ex => { ex.loadType = 'fixed-kg'; ex.sets[0].weightKg = 20; }, 'load-type-changed']
  ]) {
    const input = comparisonFixture(); mutate(input.occurrences[1].normalizedPlan.exercises[1]);
    const change = comparedMain(input).sets[0];
    assert.equal(change.status, 'unmatched'); assert.ok(change.reasons.includes(reason));
    assert.equal(change.deltaRestSeconds, undefined); assert.equal(change.load, undefined);
  }
});
test('canonical fixed kg compares weight; account Customize kg/lb transition does not', () => {
  const input = comparisonFixture();
  input.occurrences.forEach((row, index) => { const ex = row.normalizedPlan.exercises[1]; ex.loadType = 'fixed-kg'; ex.sets[0].weightKg = 20 + index * 2; });
  assert.deepEqual(comparedMain(input).sets[0].load, { unit: 'kg', delta: 2 });
  input.occurrences.forEach((row, index) => {
    const ex = row.normalizedPlan.exercises[1], unit = index ? 'lb' : 'kg';
    ex.loadType = 'profile-auto'; ex.strengthAnchor = { source: 'fixture', unit };
    delete ex.sets[0].weightKg;
    Object.assign(ex.sets[0], { calculatedLoad: 20, loadUnit: unit, loadEstimate: { prescribedReps: 8, targetPercent1RM: 0.5 } });
  });
  const change = comparedMain(input).sets[0];
  assert.ok(change.reasons.includes('load-unit-changed-or-unknown')); assert.equal(change.load, undefined);
});
test('missing RIR remains unknown and added local series is explicit unmatched work', () => {
  const input = comparisonFixture();
  input.occurrences[1].normalizedPlan.exercises[1].sets.push(structuredClone(input.occurrences[1].normalizedPlan.exercises[1].sets[0]));
  const comparison = comparedMain(input);
  assert.deepEqual(comparison.sets[0].rir, { status: 'unknown' });
  assert.equal(comparison.deltaLocalPrescribedSets, 1);
  assert.equal(comparison.sets[1].reason, 'added-set');
});
function fixture() {
  const normalizedPlan = { name: 'Session', exercises: [exercise(1, 'warmup', 'sec', 30), exercise(2, 'main'), exercise(3, 'main', 'sec', 45), exercise(4, 'stretching', 'sec', 30)] };
  return { startDate: '2026-10-05', totalWeeks: 2, occurrences: ['2026-10-05', '2026-10-08', '2026-10-12'].map(date => ({ date, sessionId: 'a', templateCode: 'template-a', executionDigest: 'a'.repeat(64), normalizedPlan: structuredClone(normalizedPlan) })) };
}
test('actual dated main work excludes executable warmup/stretch and never grants approval', () => {
  const result = deriveTrainingCyclePrescription(fixture());
  assert.deepEqual(result.weeks.map(w => [w.sessionCount, w.mainSets, w.prescribedReps, w.prescribedSeconds]), [[2, 4, 16, 90], [1, 2, 8, 45]]);
  assert.deepEqual(result.gaps.map(g => g.days), [3, 4]);
  assert.equal(result.scientificApproval, false);
  assert.equal(result.mutationSent, false);
  assert.equal(result.muscleGroupAttribution, 'unavailable');
  assert.equal(Object.keys(result.bindingValues).length, 4);
});
test('same-day distinct occurrences are counted canonically without invented hours of recovery', () => {
  const input = fixture();
  const extra = structuredClone(input.occurrences[0]);
  extra.occurrenceId = 'second';
  input.occurrences.push(extra);
  const before = deriveTrainingCyclePrescription(input);
  assert.equal(before.weeks[0].sessionCount, 3);
  assert.equal(before.weeks[0].trainingDayCount, 2);
  assert.equal(before.gaps[0].days, 0);
  assert.equal(before.gaps[0].intradaySeparation, 'unknown');
  input.occurrences.reverse();
  assert.equal(deriveTrainingCyclePrescription(input).prescriptionDigest, before.prescriptionDigest);
  input.occurrences.push(structuredClone(extra));
  assert.throws(() => deriveTrainingCyclePrescription(input), /Duplicate/);
});
test('ordering is canonical; actual dates and complete normalized prescriptions bind digest', () => {
  const input = fixture(), original = deriveTrainingCyclePrescription(input);
  input.occurrences.reverse();
  assert.equal(deriveTrainingCyclePrescription(input).prescriptionDigest, original.prescriptionDigest);
  input.occurrences.forEach(row => row.normalizedPlan.exercises[1].sets[0].reps = 9);
  assert.notEqual(deriveTrainingCyclePrescription(input).prescriptionDigest, original.prescriptionDigest);
  input.occurrences[0].date = '2026-10-13';
  assert.notEqual(deriveTrainingCyclePrescription(input).bindingValues.frequency, original.bindingValues.frequency);
});
test('declared counts cannot override actual dates; identities cannot hide different plans', () => {
  assert.throws(() => deriveTrainingCyclePrescription({ ...fixture(), claimedWeeklySessionCounts: [3, 3] }), /frequency/);
  const input = fixture(); input.occurrences[1].normalizedPlan.exercises[1].sets[0].reps = 12;
  assert.throws(() => deriveTrainingCyclePrescription(input), /identity/);
});
test('deload compares explicit actual baseline and refuses unchanged dose', () => {
  const input = fixture(); input.deload = { baselineWeek: 1, week: 2 };
  assert.equal(deriveTrainingCyclePrescription(input).deload.deltaMainSets, -2);
  input.occurrences.splice(1, 1);
  assert.throws(() => deriveTrainingCyclePrescription(input), /no reduced/);
});

test('explicit deload target may have zero prescribed sessions but never an empty baseline', () => {
  const input = fixture(); input.deload = { baselineWeek: 1, week: 2 };
  input.occurrences = input.occurrences.filter(row => row.date < '2026-10-12');
  const facts = deriveTrainingCyclePrescription(input);
  assert.equal(facts.deload.targetPrescription, 'zero-prescribed-sessions');
  assert.deepEqual([facts.deload.deltaMainSets, facts.deload.deltaReps, facts.deload.deltaSeconds], [-4, -16, -90]);
  assert.equal(facts.deload.aggregateDoseDirection, 'reduced');
  assert.equal(facts.deload.prescriptionComparison.exercises.every(row => row.status === 'unmatched' && row.reason === 'removed-occurrence'), true);
  assert.equal(facts.deload.physiologicalDeloadConfirmed, false);
  assert.equal(facts.scientificApproval, false);
  const noBaseline = fixture(); noBaseline.deload = { baselineWeek: 1, week: 2 };
  noBaseline.occurrences = noBaseline.occurrences.filter(row => row.date >= '2026-10-12');
  assert.throws(() => deriveTrainingCyclePrescription(noBaseline), /actual baseline sessions/);
});
test('equal totals do not hide changed mode or static load across weeks', () => {
  for (const change of [set => set.mode = 2]) {
    const input = fixture(); input.occurrences.splice(1, 1);
    input.occurrences[1].sessionId = 'b';
    input.occurrences[1].templateCode = 'template-b';
    change(input.occurrences[1].normalizedPlan.exercises[1].sets[0]);
    const result = deriveTrainingCyclePrescription(input);
    assert.equal(result.transitions[0].deltaMainSets, 0);
    assert.equal(result.transitions[0].deltaReps, 0);
    assert.equal(result.transitions[0].executablePrescriptionChanged, true);
    assert.equal(result.scientificApproval, false);
  }
});
test('valid large catalog identifiers are not constrained by work-dose bounds', () => {
  const input = fixture();
  input.occurrences.forEach(row => row.normalizedPlan.exercises[1].id = 100001);
  assert.equal(deriveTrainingCyclePrescription(input).weeks[0].mainSets, 4);
});
test('invalid dates doses sections sparse work and arbitrary muscle attribution fail', () => {
  for (const mutate of [
    input => input.occurrences[0].date = '2026-02-30',
    input => input.occurrences[0].date = input.occurrences[1].date,
    input => input.occurrences[0].normalizedPlan.exercises[1].sets[0].reps = NaN,
    input => input.occurrences[0].normalizedPlan.exercises[1].sets[0].unit = 'unknown',
    input => input.occurrences[0].normalizedPlan.exercises[1].section = 'other',
    input => delete input.occurrences[0].normalizedPlan.exercises[1],
    input => input.occurrences[0].normalizedPlan.exercises[1].muscleGroup = 'guessed chest'
  ]) { const input = fixture(); mutate(input); assert.throws(() => deriveTrainingCyclePrescription(input)); }
});

test('renewed evidence name and anchor provenance keep session execution identity but bind full snapshot', () => {
  const input = fixture(), before = deriveTrainingCyclePrescription(input);
  const changed = input.occurrences[1].normalizedPlan;
  changed.name = 'Renamed session';
  changed.evidence = [{ id: 'e1', researchBatchIds: ['new-batch'] }];
  changed.exercises[1].strengthAnchor = { source: 'saved-profile', unit: 'kg', oneRepMax: 100 };
  const after = deriveTrainingCyclePrescription(input);
  assert.equal(after.occurrences[1].executablePrescriptionDigest, before.occurrences[1].executablePrescriptionDigest);
  assert.notEqual(after.occurrences[1].planDigest, before.occurrences[1].planDigest);
  assert.notEqual(after.prescriptionDigest, before.prescriptionDigest);
});

test('load mode rest and RIR changes cannot hide behind unchanged session id', () => {
  for (const [field, value] of [['weightKg', 25], ['mode', 3], ['rest', 120], ['rirTarget', 1]]) {
    const input = fixture();
    if (field === 'weightKg') input.occurrences.forEach(row => {
      row.normalizedPlan.exercises[1].loadType = 'fixed-kg';
      row.normalizedPlan.exercises[1].sets[0].weightKg = 20;
    });
    input.occurrences[1].normalizedPlan.exercises[1].sets[0][field] = value;
    assert.throws(() => deriveTrainingCyclePrescription(input), /identity/);
  }
});

test('deload mixed direction and load-only differences remain explicit pending scientific review', () => {
  const mixed = fixture(); mixed.occurrences.splice(1, 1); mixed.deload = { baselineWeek: 1, week: 2 };
  mixed.occurrences[1].sessionId = 'b';
  mixed.occurrences[1].normalizedPlan.exercises[1].sets[0].reps = 4;
  mixed.occurrences[1].normalizedPlan.exercises[2].sets[0].durationSeconds = 90;
  const result = deriveTrainingCyclePrescription(mixed);
  assert.equal(result.deload.aggregateDoseDirection, 'mixed');
  assert.equal(result.deload.physiologicalDeloadConfirmed, false);
  assert.equal(result.deload.status, 'prescription-comparison-needs-review');
  const load = fixture(); load.occurrences.splice(1, 1); load.deload = { baselineWeek: 1, week: 2 };
  load.occurrences[1].sessionId = 'b';
  load.occurrences.forEach(row => row.normalizedPlan.exercises[1].loadType = 'fixed-kg');
  load.occurrences[0].normalizedPlan.exercises[1].sets[0].weightKg = 25;
  load.occurrences[1].normalizedPlan.exercises[1].sets[0].weightKg = 20;
  const lowerLoad = deriveTrainingCyclePrescription(load);
  assert.equal(lowerLoad.deload.aggregateDoseDirection, 'unchanged');
  assert.equal(lowerLoad.deload.executablePrescriptionChanged, true);
  assert.equal(lowerLoad.deload.physiologicalDeloadConfirmed, false);
});

test('cycle compares named presets without inventing a machine load change', () => {
  const input = comparisonFixture();
  input.occurrences.forEach((row, index) => {
    const ex = row.normalizedPlan.exercises[1];
    ex.loadType = 'smart-rm';
    ex.smartRmPresetName = index ? 'Strength' : 'Gain Muscle';
    ex.smartRmPresetId = index ? 5 : 1;
    Object.assign(ex.sets[0], { rmLevel: index ? 7 : 13, rirTarget: 2, reps: 8 });
  });
  const change = comparedMain(input).sets[0];
  assert.deepEqual(change.machinePreset, { from: 'Gain Muscle', to: 'Strength', physicalLoad: 'unknown' });
  assert.equal(change.load, undefined);
  assert.equal(change.rmLevel, undefined);
});

test('cycle identifies added and removed exercise occurrences rather than pairing different catalogs', () => {
  const input = comparisonFixture();
  input.occurrences[1].normalizedPlan.exercises[1].id = 9;
  input.occurrences[1].normalizedPlan.exercises[1].actionLibraryId = 109;
  const comparisons = deriveTrainingCyclePrescription(input).transitions[0].prescriptionComparison.exercises;
  assert.equal(comparisons.find(ex => ex.catalogId === 2).reason, 'removed-occurrence');
  assert.equal(comparisons.find(ex => ex.catalogId === 9).reason, 'added-occurrence');
});

test('cycle execution digest binds explicit exercise adaptation independently of physical load',()=>{const ordinary=fixture(),declared=structuredClone(ordinary);for(const row of declared.occurrences)row.normalizedPlan.exercises[1].trainingGoal='strength';const a=deriveTrainingCyclePrescription(ordinary),b=deriveTrainingCyclePrescription(declared);assert.notDeepEqual(a,b);const malformed=structuredClone(declared);malformed.occurrences[0].normalizedPlan.exercises[1].trainingGoal='technical';assert.throws(()=>deriveTrainingCyclePrescription(malformed),/training goal/);});
