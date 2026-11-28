import test from 'node:test';
import assert from 'node:assert/strict';
import { annotateTimedWorkoutOutput } from '../plugin/workout-data.mjs';
import { collectPlanInputs } from '../plugin/plan-input-bundle.mjs';
import { projectSessionPlanningView } from '../plugin/session-planning-view.mjs';

const sessionKey = { training_id: '42', kind: 'program', date: '2026-11-10' };
const planInputArgs = {
  profile: 'synthetic', month: '2026-11', program_codes: [], days: 14,
  consent_to_read_history: true, include_recent_session_details: true
};

function annotate(detail, { displayUnit = 'kg', sessionFields = {} } = {}) {
  const payload = {
    training_id: 42, kind: 'program', ...sessionFields,
    detail: [{ actionLibraryGroupId: 116, actionLibraryId: 901, title: 'Synthetic movement',
      completionMethod: 1, finishedReps: [{ finishedCount: 2, targetCount: 2, ...detail.set,
        trainingInfoDetail: detail.telemetry }] }]
  };
  const full = JSON.parse(annotateTimedWorkoutOutput(JSON.stringify(payload), { displayUnit }));
  return { payload, full, planning: projectSessionPlanningView(full) };
}

async function bundlePlanning(planning) {
  return collectPlanInputs(planInputArgs, {
    resolveProfile: async value => value,
    readProfileConfig: async () => ({ id: 'same-account' }),
    accountFingerprint: value => value.id,
    readTrainingProfile: async () => ({}),
    readCalendar: async () => ({}),
    readBaselines: async () => ({}),
    readAthlete: async () => ({ history: { mobileSessions: [sessionKey] } }),
    readDetail: async () => planning
  });
}

function bundledSet(result) {
  const row = result.recentSessionDetails.results[0];
  assert.equal(row.status, 'complete');
  return row.detail.exercises[0].sets[0];
}

test('resolved kg/lb/unknown units survive annotate, planning and plan-input compaction for one or two sides', async () => {
  for (const unit of ['kg', 'lb', 'unknown']) {
    for (const shape of ['left', 'right', 'dual']) {
      const telemetry = { weights: [28, 28] };
      if (shape !== 'right') telemetry.leftWeights = [28, 28];
      if (shape !== 'left') telemetry.rightWeights = [28, 28];
      const { full, planning } = annotate({
        telemetry,
        set: { leftRight: shape === 'left' ? 1 : shape === 'right' ? 2 : 0 }
      }, { displayUnit: unit });
      const summary = full.gmCoachSessionSummary;
      assert.equal(summary.weightUnit, unit, `${unit}/${shape} summary`);
      const result = await bundlePlanning(planning);
      const set = bundledSet(result);
      assert.equal(set.nativeExecutionEvidence.nativeReportedLoad.unit, unit, `${unit}/${shape} native unit`);
      assert.equal(set.nativeExecutionEvidence.nativeReportedLoad.fixedCustomizeSettingVerified, false);
      assert.equal(set.nativeExecutionEvidence.nativeReportedLoad.historicalUnitIndependentlyVerified, false);
      assert.equal(set.nativeExecutionEvidence.nativeReportedLoad.unitSource, summary.weightUnitSource);
      assert.deepEqual(set.loadChannelPresentation.channels.map(channel => [channel.channel, channel.status]), [
        ['left-cable', shape === 'right' ? 'not-reported' : 'reported'],
        ['right-cable', shape === 'left' ? 'not-reported' : 'reported']
      ]);
      assert.ok(set.loadChannelPresentation.channels.filter(channel => channel.status === 'reported').every(channel => channel.unit === unit));
      assert.deepEqual(full.detail, [{ actionLibraryGroupId: 116, actionLibraryId: 901, title: 'Synthetic movement',
        completionMethod: 1, finishedReps: [{ finishedCount: 2, targetCount: 2,
          leftRight: shape === 'left' ? 1 : shape === 'right' ? 2 : 0, trainingInfoDetail: telemetry }] }]);
    }
  }
});

test('explicit unknown and conflicting session/account unit evidence remain unknown through the public helper path', async () => {
  const cases = [
    { label: 'explicit unknown', sessionFields: { weightUnit: 'unknown' }, displayUnit: 'kg', source: 'invalid-explicit-session-weight-unit' },
    { label: 'session/account conflict', sessionFields: { weightUnit: 'kg', account: { unit: 'lb' } }, displayUnit: 'kg', source: 'conflicting-explicit-session-weight-unit-context' }
  ];
  for (const scenario of cases) {
    const { full, planning } = annotate({ telemetry: { weights: [28, 28], leftWeights: [28, 28], rightWeights: [28, 28] } }, scenario);
    assert.equal(full.gmCoachSessionSummary.weightUnit, 'unknown', scenario.label);
    assert.equal(full.gmCoachSessionSummary.weightUnitSource, scenario.source, scenario.label);
    assert.equal(planning.weightUnit, 'unknown', `${scenario.label} planning projection`);
    const set = bundledSet(await bundlePlanning(planning));
    assert.equal(set.nativeExecutionEvidence.nativeReportedLoad.unit, 'unknown', scenario.label);
    assert.equal(set.nativeExecutionEvidence.nativeReportedLoad.unitSource, scenario.source, scenario.label);
    assert.ok(set.loadChannelPresentation.channels.filter(channel => channel.status === 'reported').every(channel => channel.unit === 'unknown'));
    assert.equal(set.nativeExecutionEvidence.nativeReportedLoad.fixedCustomizeSettingVerified, false);
  }
});

test('an explicit normalized set-level unknown is not replaced by a known summary unit', async () => {
  const { full } = annotate({ telemetry: { weights: [28, 28] } }, { displayUnit: 'kg' });
  const normalizedSet = full.gmCoachSessionSummary.exercises[0].sets[0];
  assert.equal(full.gmCoachSessionSummary.weightUnit, 'kg');
  normalizedSet.weightUnit = 'unknown'; // Exercise the explicit-value precedence edge.
  const planning = projectSessionPlanningView(full);
  const set = bundledSet(await bundlePlanning(planning));
  assert.equal(set.nativeExecutionEvidence.nativeReportedLoad.unit, 'unknown');
  assert.equal(set.nativeExecutionEvidence.nativeReportedLoad.unitSource, 'normalized-set-weightUnit');
  assert.equal(set.nativeExecutionEvidence.nativeReportedLoad.sessionContextUnitSource, full.gmCoachSessionSummary.weightUnitSource);
});

test('native row values remain distinct from two-cable ranges and never become a Customize setting', async () => {
  for (const [nativeRow, cablePerSide] of [[28, 28], [61, 30.5]]) {
    const telemetry = { weights: [nativeRow, nativeRow], leftWeights: [cablePerSide, cablePerSide], rightWeights: [cablePerSide, cablePerSide] };
    const { planning } = annotate({ telemetry, set: { leftRight: 0 } }, { displayUnit: 'kg' });
    const set = bundledSet(await bundlePlanning(planning));
    const native = set.nativeExecutionEvidence.nativeReportedLoad;
    assert.deepEqual([native.lower, native.upper, native.unit], [nativeRow, nativeRow, 'kg']);
    assert.equal(native.cableAggregation, 'not-inferred');
    assert.equal(native.fixedCustomizeSettingVerified, false);
    assert.equal(native.physicalResistanceIndependentlyMeasured, false);
    assert.deepEqual(set.loadChannelPresentation.channels.map(channel => [channel.channel, channel.minimum, channel.maximum]), [
      ['left-cable', cablePerSide, cablePerSide], ['right-cable', cablePerSide, cablePerSide]
    ]);
    assert.equal(set.reportedCableSum.status, 'bounded-cable-sum-envelope');
    assert.deepEqual([set.reportedCableSum.lower, set.reportedCableSum.upper], [2 * cablePerSide, 2 * cablePerSide]);
    assert.equal(set.reportedCableSum.fixedCustomizeSettingVerified, false);
    assert.equal(Object.hasOwn(set, 'executionLoadVerified'), false);
  }
});

test('unilateral history keeps its selected-side anchor without doubling the native row', async () => {
  const { planning } = annotate({
    telemetry: { weights: [12, 12], leftWeights: [12, 12], rightWeights: [12, 12] },
    set: { leftRight: 1 }
  }, { displayUnit: 'kg' });
  const set = bundledSet(await bundlePlanning(planning));
  assert.equal(set.side, 1);
  assert.equal(set.reportedLoadScope, 'left-side-reported');
  assert.deepEqual(set.observedLoadAnchor.channels.map(row => row.channel), ['left-cable']);
  assert.equal(set.reportedCableSum, undefined);
  assert.deepEqual([set.nativeExecutionEvidence.nativeReportedLoad.lower, set.nativeExecutionEvidence.nativeReportedLoad.upper], [12, 12]);
  assert.equal(set.nativeExecutionEvidence.nativeReportedLoad.fixedCustomizeSettingVerified, false);
});

test('publicly normalized channels never zip by array index without equal timestamps', async () => {
  const telemetry = { weights: [99, 99], leftWeights: [10, 20], rightWeights: [20, 10], leftTimestamps: [100, 200], rightTimestamps: [100, 201] };
  const { planning } = annotate({ telemetry, set: { leftRight: 0 } }, { displayUnit: 'kg' });
  const set = bundledSet(await bundlePlanning(planning));
  assert.equal(set.reportedCableSum.status, 'bounded-cable-sum-envelope');
  assert.deepEqual([set.reportedCableSum.lower, set.reportedCableSum.upper], [20, 40]);
  assert.equal(set.reportedCableSum.fixedCustomizeSettingVerified, false);
});

test('matching timestamp arrays gate the derived paired sum in the actual annotate/planning/bundle flow', async () => {
  const telemetry = { weights: [99, 99], leftWeights: [10, 20], rightWeights: [20, 10], leftTimestamps: [100, 200], rightTimestamps: [100, 200] };
  const { planning } = annotate({ telemetry, set: { leftRight: 0 } }, { displayUnit: 'kg' });
  const set = bundledSet(await bundlePlanning(planning));
  assert.equal(set.reportedCableSum.status, 'derived-from-paired-reported-samples');
  assert.deepEqual([set.reportedCableSum.lower, set.reportedCableSum.upper], [30, 30]);
  assert.match(set.reportedCableSum.basis, /identical-monotonic-reported-timestamps/);
  assert.equal(set.reportedCableSum.fixedCustomizeSettingVerified, false);
});

test('snake-case aliases remain separate observations and conflicting aliases cannot qualify a paired sum', async () => {
  const snakeOnly = {
    weights: [99, 99], left_weights: [10, 20], right_weights: [20, 10],
    left_timestamps: [100, 200], right_timestamps: [100, 200]
  };
  const aligned = annotate({ telemetry: snakeOnly, set: { leftRight: 0 } }, { displayUnit: 'kg' });
  const alignedSet = bundledSet(await bundlePlanning(aligned.planning));
  assert.equal(alignedSet.reportedCableSum.status, 'derived-from-paired-reported-samples');
  assert.deepEqual([alignedSet.reportedCableSum.lower, alignedSet.reportedCableSum.upper], [30, 30]);

  const aliasesConflict = {
    weights: [99, 99], leftWeights: [10, 20], left_weights: [99, 99], rightWeights: [20, 10],
    leftTimestamps: [100, 200], left_timestamps: [100, 200], rightTimestamps: [100, 200]
  };
  const conflict = annotate({ telemetry: aliasesConflict, set: { leftRight: 0 } }, { displayUnit: 'kg' });
  const conflictSet = bundledSet(await bundlePlanning(conflict.planning));
  assert.equal(conflictSet.loadChannelPresentation.channels[0].status, 'unknown');
  assert.ok(!conflictSet.observedRepLoadEvidence.some(row=>row.channel==='left-cable'));
  assert.ok(!(conflictSet.observedLoadAnchor.channels??[]).some(row=>row.channel==='left-cable'));
  assert.notEqual(conflictSet.reportedCableSum?.status, 'derived-from-paired-reported-samples');
  assert.equal(conflictSet.nativeExecutionEvidence.nativeReportedLoad.cableAggregation, 'not-inferred');
});

test('malformed one-side samples stay unknown and do not produce a cable sum', async () => {
  const telemetry = { weights: [99, 99], leftWeights: [10, null], rightWeights: [20, 10] };
  const { planning } = annotate({ telemetry, set: { leftRight: 0 } }, { displayUnit: 'kg' });
  const set = bundledSet(await bundlePlanning(planning));
  assert.equal(set.loadChannelPresentation.channels[0].status, 'unknown');
  assert.equal(set.reportedCableSum, undefined);
  assert.equal(set.nativeExecutionEvidence.nativeReportedLoad.cableAggregation, 'not-inferred');
  assert.equal(set.nativeExecutionEvidence.nativeReportedLoad.fixedCustomizeSettingVerified, false);
});

test('equivalent side aliases deduplicate while a malformed alias withholds that side',async()=>{
 for(const malformed of [false,true]){
 const telemetry={weights:[28,28],leftWeights:[10,20],left_weights:malformed?[10,null]:['10','20'],rightWeights:[20,10]};
 const {planning}=annotate({telemetry,set:{leftRight:0}},{displayUnit:'kg'});
 const set=bundledSet(await bundlePlanning(planning));
 const left=set.observedRepLoadEvidence.filter(row=>row.channel==='left-cable');
 assert.equal(left.length,malformed?0:1);
 if(!malformed)assert.deepEqual([left[0].minimumReportedLoad,left[0].maximumReportedLoad],[10,20]);
 }
});
