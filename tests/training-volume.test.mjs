import test from 'node:test';
import assert from 'node:assert/strict';
import { summarizeHistoryLiftedVolume } from '../plugin/training-volume.mjs';

function historySet(weights, capacity, overrides = {}) {
  return {
    unit: 'reps',
    finishedCount: weights.length,
    capacity,
    trainingInfoDetail: { weights },
    ...overrides
  };
}

function historyExercise(...finishedReps) {
  return { finishedReps };
}

test('side telemetry cannot certify tonnage from aggregate weights or zero-load exclusion', () => {
  for (const weights of [[10, 10], [0, 0]]) {
    for (const sides of [
      { leftWeights: [8, 9], rightWeights: [3] },
      { leftWeights: ['bad'], rightWeights: [0, 0] },
      { left_weights: [4], right_weights: [6, 7] }
    ]) {
      const summary = summarizeHistoryLiftedVolume([historyExercise(historySet(weights,
        weights.reduce((sum, weight) => sum + weight, 0), {
          trainingInfoDetail: { weights, ...sides }
        }))], 'kg');
      assert.equal(summary.complete, false);
      assert.equal(summary.totalLiftedVolume, null);
      assert.equal(summary.exercises[0].sets[0].reason, 'SIDE_TELEMETRY_NOT_VERIFIED_PER_REP_LOADS');
    }
  }
});

test('sums one-point per-rep loads over sets using explicit history capacity', () => {
  const summary = summarizeHistoryLiftedVolume([
    historyExercise(
      historySet(Array(8).fill(50), 400),
      historySet(Array(6).fill(40), 240)
    )
  ], 'kg');

  assert.equal(summary.complete, true);
  assert.equal(summary.totalLiftedVolume, 640);
  assert.equal(summary.totalLiftedVolumeUnit, 'kg·powt.');
  assert.deepEqual(summary.exercises[0].sets.map((set) => set.loadPoints), [1, 1]);
  assert.equal(summary.exercises[0].sets[0].liftedVolume, 400);
  assert.equal(summary.provenance.sourceScope, 'completed workout exercise.finishedReps history only');
});

test('counts both load points when history capacity clearly supports dual handles', () => {
  const summary = summarizeHistoryLiftedVolume([
    historyExercise(historySet(Array(8).fill(50), 800))
  ], 'kg');

  assert.equal(summary.complete, true);
  assert.equal(summary.totalLiftedVolume, 800);
  assert.equal(summary.exercises[0].sets[0].loadPoints, 2);
});

test('sums variable per-rep ramp loads instead of multiplying the heaviest rep', () => {
  const ramp = [20, 40, 50, 50, 50, 50, 50, 50];
  const onePoint = summarizeHistoryLiftedVolume([
    historyExercise(historySet(ramp, 360))
  ], 'kg');
  const twoPoints = summarizeHistoryLiftedVolume([
    historyExercise(historySet(ramp, 720))
  ], 'kg');

  assert.equal(onePoint.totalLiftedVolume, 360);
  assert.equal(twoPoints.totalLiftedVolume, 720);
});

test('rejects a one-value weight array for a multi-rep set as ambiguous', () => {
  const summary = summarizeHistoryLiftedVolume([
    historyExercise(historySet([50], 800, { finishedCount: 8 }))
  ], 'kg');

  assert.equal(summary.complete, false);
  assert.equal(summary.totalLiftedVolume, null);
  assert.equal(summary.exercises[0].sets[0].reason, 'SCALAR_WEIGHT_AMBIGUOUS_FOR_MULTI_REP_SET');
});

test('requires an explicit reps unit and a known account weight unit', () => {
  const timed = summarizeHistoryLiftedVolume([
    historyExercise(historySet(Array(8).fill(50), 800, { unit: 'seconds' }))
  ], 'kg');
  const noUnit = summarizeHistoryLiftedVolume([
    historyExercise(historySet(Array(8).fill(50), 800, { unit: undefined }))
  ], 'kg');
  const unknownAccountUnit = summarizeHistoryLiftedVolume([
    historyExercise(historySet(Array(8).fill(50), 800))
  ], 'unknown');

  assert.equal(timed.exercises[0].sets[0].reason, 'UNIT_NOT_EXPLICIT_REPS');
  assert.equal(noUnit.exercises[0].sets[0].reason, 'UNIT_NOT_EXPLICIT_REPS');
  assert.equal(unknownAccountUnit.exercises[0].sets[0].reason, 'UNKNOWN_WEIGHT_UNIT');
  assert.equal(unknownAccountUnit.totalLiftedVolume, null);
});

test('rejects missing, invalid, negative, and count-mismatched per-rep observations', () => {
  const cases = [
    [historySet([0], 100), 'NONPOSITIVE_WEIGHT_SUM'],
    [historySet([50, 50], 100, { finishedCount: 3 }), 'WEIGHT_COUNT_DOES_NOT_MATCH_COMPLETED_REPS'],
    [historySet([50, -1], 98), 'INVALID_PER_REP_WEIGHTS'],
    [historySet([50, Number.NaN], 100), 'INVALID_PER_REP_WEIGHTS'],
    [historySet([50, 50], 0), 'MISSING_OR_NONPOSITIVE_HISTORY_CAPACITY'],
    [{ ...historySet([50, 50], 100), capacity: undefined }, 'MISSING_OR_NONPOSITIVE_HISTORY_CAPACITY']
  ];

  for (const [set, reason] of cases) {
    const summary = summarizeHistoryLiftedVolume([historyExercise(set)], 'kg');
    assert.equal(summary.complete, false, reason);
    assert.equal(summary.totalLiftedVolume, null, reason);
    assert.equal(summary.exercises[0].sets[0].reason, reason);
  }
});

test('accepts only ratios clearly near one or two load points', () => {
  const nearOne = summarizeHistoryLiftedVolume([
    historyExercise(historySet([50, 50], 101.01))
  ], 'kg');
  const ambiguous = summarizeHistoryLiftedVolume([
    historyExercise(historySet([50, 50], 150))
  ], 'kg');
  const outsideDualTolerance = summarizeHistoryLiftedVolume([
    historyExercise(historySet([50, 50], 205))
  ], 'kg');

  assert.equal(nearOne.exercises[0].sets[0].loadPoints, 1);
  assert.equal(ambiguous.exercises[0].sets[0].reason, 'CAPACITY_RATIO_NOT_CLEAR_ONE_OR_TWO');
  assert.equal(outsideDualTolerance.exercises[0].sets[0].reason, 'CAPACITY_RATIO_NOT_CLEAR_ONE_OR_TWO');
});

test('marks every set in an exercise unknown if inferred load-point counts disagree', () => {
  const summary = summarizeHistoryLiftedVolume([
    historyExercise(
      historySet(Array(8).fill(50), 400),
      historySet(Array(8).fill(50), 800)
    )
  ], 'kg');

  assert.equal(summary.complete, false);
  assert.equal(summary.totalLiftedVolume, null);
  assert.equal(summary.exercises[0].status, 'unknown');
  assert.deepEqual(summary.exercises[0].sets.map((set) => [set.status, set.reason]), [
    ['unknown', 'INCONSISTENT_LOAD_POINTS_WITHIN_EXERCISE'],
    ['unknown', 'INCONSISTENT_LOAD_POINTS_WITHIN_EXERCISE']
  ]);
});

test('one unresolved loaded set suppresses the complete session total', () => {
  const summary = summarizeHistoryLiftedVolume([
    historyExercise(historySet(Array(8).fill(50), 400)),
    historyExercise(historySet([30], 240, { finishedCount: 8 }))
  ], 'lb');

  assert.equal(summary.loadedSetCount, 2);
  assert.equal(summary.unknownLoadedSetCount, 1);
  assert.equal(summary.complete, false);
  assert.equal(summary.totalLiftedVolume, null);
  assert.equal(summary.totalLiftedVolumeUnit, 'lb·powt.');
});

test('explicit zero-load history sets are excluded without inflating weighted volume', () => {
  const zeros = historySet(Array(8).fill(0), 0);
  const loaded = historySet(Array(8).fill(50), 400);
  const summary = summarizeHistoryLiftedVolume([
    historyExercise(zeros, loaded)
  ], 'kg');

  assert.equal(summary.complete, true);
  assert.equal(summary.totalLiftedVolume, 400);
  assert.equal(summary.loadedSetCount, 1);
  assert.equal(summary.exercises[0].sets[0].status, 'excluded');
});

test('does not infer load points from leftRight, exercise names, or barbell flags', () => {
  const history = historyExercise(historySet(Array(8).fill(50), 800, { leftRight: 1 }));
  history.actionLibraryName = 'Barbell squat';
  history.isBarbell = true;
  history.isLeftRight = false;
  const summary = summarizeHistoryLiftedVolume([history], 'kg');

  assert.equal(summary.complete, true);
  assert.equal(summary.exercises[0].sets[0].loadPoints, 2);
  assert.equal(summary.totalLiftedVolume, 800);
});

test('rejects planned template-shaped input because only finished history sets are read', () => {
  const summary = summarizeHistoryLiftedVolume([{
    actionLibraryList: [{
      setsAndReps: '8',
      weights: '3.5',
      counterweight: '10',
      capacity: 80
    }]
  }], 'kg');

  assert.equal(summary.complete, false);
  assert.equal(summary.totalLiftedVolume, null);
  assert.equal(summary.exercises[0].reason, 'MISSING_FINISHED_HISTORY_SETS');
});

test('returns no zero-tonnage total when history contains no loaded set', () => {
  const summary = summarizeHistoryLiftedVolume([
    historyExercise(historySet(Array(8).fill(0), 0))
  ], 'kg');

  assert.equal(summary.complete, false);
  assert.equal(summary.totalLiftedVolume, null);
  assert.equal(summary.reason, 'NO_LOADED_SETS');
});
