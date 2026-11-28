import test from 'node:test';
import assert from 'node:assert/strict';
import { annotateTimedWorkoutOutput } from '../plugin/workout-data.mjs';

function normalize(detail, extra = {}) {
  const raw = { detail: [{ title: 'Cable exercise', unit: 'reps', finishedReps: [{
    finishedCount: 2, targetCount: 2, time: 20, capacity: 96,
    trainingInfoDetail: detail, ...extra
  }] }] };
  const result = JSON.parse(annotateTimedWorkoutOutput(JSON.stringify(raw), { displayUnit: 'kg' }));
  return { raw, result, set: result.gmCoachSessionSummary.exercises[0].sets[0] };
}

test('real session normalizer never labels derived dual-cable spikes as resistance ranges', () => {
  const { raw, result, set } = normalize({
    weights: [7.5, 48.5, 47], leftWeights: [7.5, 11.5, 12], rightWeights: [7.5, 12.5]
  });
  assert.deepEqual(result.detail, raw.detail);
  assert.equal(set.weightMin, undefined);
  assert.equal(set.weightMax, undefined);
  assert.equal(set.weightUnit, undefined);
  assert.equal(set.reportedCablePeakLoad, 24.5);
  assert.equal(set.reportedCablePeakLoadEvidence.leftPeak, 12);
  assert.equal(set.reportedCablePeakLoadEvidence.rightPeak, 12.5);
  assert.equal(set.reportedCablePeakLoadEvidence.perRepTelemetry, false);
  assert.equal(set.liftedVolume, undefined);
  assert.equal(result.gmCoachSessionSummary.totalLiftedVolume, undefined);
});

test('invalid or conflicting side evidence does not restore aggregate resistance ranges', () => {
  for (const [detail, extra] of [
    [{ weights: [48.5, 47], leftWeights: [12, null], rightWeights: [12.5] }, {}],
    [{ weights: [48.5, 47], leftWeights: [12], rightWeights: [12.5], leftRight: 2 }, { leftRight: 1 }],
    [{ weights: [48.5, 47], rightWeights: [12.5] }, { leftRight: 1 }]
  ]) {
    const { set } = normalize(detail, extra);
    assert.equal(set.reportedCablePeakLoadStatus, 'unknown');
    assert.equal(set.weightMin, undefined);
    assert.equal(set.weightMax, undefined);
    assert.equal(set.liftedVolume, undefined);
  }
});

test('single side and telemetry aliases also suppress aggregate ranges without inventing side pairings', () => {
  for (const detail of [
    { weights: [48.5, 47], leftWeights: [12] },
    { weights: [48.5, 47], left_weights: [12] }
  ]) {
    const { set } = normalize(detail);
    assert.equal(set.weightMin, undefined);
    assert.equal(set.weightMax, undefined);
    assert.equal(set.liftedVolume, undefined);
  }
});

test('aggregate-only history keeps existing range behavior when side channels are absent or empty', () => {
  for (const detail of [
    { weights: [10, 12] },
    { weights: [10, 12], leftWeights: [], rightWeights: '' }
  ]) {
    const { set } = normalize(detail);
    assert.equal(set.weightMin, 10);
    assert.equal(set.weightMax, 12);
  }
});
