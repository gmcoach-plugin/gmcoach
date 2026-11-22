import test from 'node:test';
import assert from 'node:assert/strict';
import { projectSessionPlanningView } from '../session-planning-view.mjs';

function project({weights, leftWeights, rightWeights, side=0, reps=weights.length, name='Synthetic exercise'}) {
  const telemetry = { weights };
  if (leftWeights) telemetry.leftWeights = leftWeights;
  if (rightWeights) telemetry.rightWeights = rightWeights;
  return projectSessionPlanningView({
    detail: [{ actionLibraryId: 901, finishedReps: [{ trainingInfoDetail: telemetry }] }],
    gmCoachSessionSummary: {
      weightUnit: 'kg',
      exercises: [{ exercise: name, path: '$.detail[0]', sets: [{ set: 1, reps, unit: 'reps', weightUnit: 'kg', side }] }]
    }
  }).exercises[0].sets[0];
}

test('ragged Vita-like native range is preserved without calling it a Customize scalar', () => {
  const set = project({ weights: [7.5, 48.5], leftWeights: [7.5, 12.5], rightWeights: [7.5, 12.5], reps: 2, name: 'Vita-like synthetic movement' });
  const native = set.nativeExecutionEvidence.nativeReportedLoad;
  assert.deepEqual([native.lower, native.upper, native.sampleCount], [7.5, 48.5, 2]);
  assert.deepEqual(set.observedRepLoadEvidence.map(row => [row.channel, row.minimumReportedLoad, row.maximumReportedLoad]), [
    ['left-cable', 7.5, 12.5], ['right-cable', 7.5, 12.5]
  ]);
  assert.equal(native.sampleSemantics, 'reported-native-sample-range-only');
  assert.equal(native.customizeSettingRelation, 'not-verified-as-static-Customize-setting');
  assert.equal(native.customizeWriteScalarContract, 'unverified');
  assert.equal(native.cableDerivedScalarInterpretation, 'possible-but-unconfirmed');
  assert.equal(native.fixedCustomizeSettingVerified, false);
  assert.deepEqual([set.reportedCableSum.lower, set.reportedCableSum.upper], [15, 25]);
  assert.equal(set.reportedCableSum.fixedCustomizeSettingVerified, false);
});

test('single-channel native sample still has no general Customize write contract', () => {
  const set = project({ weights: [12, 12], side: 1, reps: 2, name: 'Single-side synthetic movement' });
  const native = set.nativeExecutionEvidence.nativeReportedLoad;
  assert.deepEqual([native.lower, native.upper], [12, 12]);
  assert.equal(native.customizeSettingRelation, 'not-verified-as-static-Customize-setting');
  assert.equal(native.customizeWriteScalarContract, 'unverified');
  assert.equal(native.cableDerivedScalarInterpretation, 'possible-but-unconfirmed');
  assert.equal(set.reportedCableSum, undefined);
});

test('bench row 61 remains separate from the 30.5 plus 30.5 channel envelope', () => {
  const set = project({ weights: [61, 61], leftWeights: [30.5, 30.5], rightWeights: [30.5, 30.5], reps: 2, name: 'Bench synthetic fixture' });
  const native = set.nativeExecutionEvidence.nativeReportedLoad;
  assert.deepEqual([native.lower, native.upper], [61, 61]);
  assert.deepEqual([set.reportedCableSum.lower, set.reportedCableSum.upper], [61, 61]);
  assert.equal(native.customizeWriteScalarContract, 'unverified');
  assert.equal(native.fixedCustomizeSettingVerified, false);
  assert.equal(set.reportedCableSum.status, 'bounded-cable-sum-envelope');
});
