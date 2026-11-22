import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeFreeLiftSummary } from '../free-lift-data.mjs';

function fixture({ total = 2000, capacities = [1000, 1000], weights = [100, 100], method = 1 } = {}) {
  return { training_id: 6001, kind: 'free', info: {
    totalCapacity: total, actionList: [{ groupId: 424, actionLibraryName: 'Seated Barbell Row', completionMethod: method, countType: 2,
      setList: capacities.map((capacity, index) => ({ summary: {
        finishedCount: 10, weight: weights[index], time: 40, leftRight: 0, totalCapacity: capacity
      }, rawRepList: [] }))
    }]
  }, detail: null };
}

test('returns null for unrelated, empty and incomplete format envelopes', () => {
  for (const value of [null, [], {}, { kind: 'free' }, { kind: 'free', info: { actionList: [] } },
    { ...fixture(), kind: 'program' }, { kind: 'free', info: { actionList: [{ setList: [] }] } },
    { kind: 'free', info: { actionList: [{ setList: [{ summary: null }] }] } }]) {
    assert.equal(normalizeFreeLiftSummary(value), null);
  }
});

test('recognizes the public lb fixture, scalar weights, real counts and paths', () => {
  const result = normalizeFreeLiftSummary(fixture(), { weightUnit: 'lb' });
  assert.equal(result.format, 'free-lift-set-summary');
  assert.equal(result.scaleReconciliation.factor, 1);
  assert.equal(result.scaleReconciliation.status, 'matched-unscaled');
  assert.equal(result.scaleReconciliation.capacityComplete, true);
  assert.equal(result.partial, false);
  assert.equal(result.exercises[0].groupId, 424);
  assert.equal(result.exercises[0].path, '$.info.actionList[0]');
  assert.equal(result.exercises[0].sets[0].path, '$.info.actionList[0].setList[0].summary');
  assert.deepEqual(result.exercises[0].sets.map((set) => [set.reps, set.elapsedSeconds, set.summaryWeight, set.rawSummaryWeight, set.weightUnit]), [
    [10, 40, 100, 100, 'lb'], [10, 40, 100, 100, 'lb']
  ]);
  assert.equal(result.exercises[0].sets[0].unitResolution, 'api-code-inference');
});

test('reconciles the public kg fixture using the observed 2.2 encoding rather than a different conversion constant', () => {
  const result = normalizeFreeLiftSummary(fixture({ total: 909.09 }), { weightUnit: 'kg' });
  assert.equal(result.scaleReconciliation.factor, 2.2);
  assert.equal(result.scaleReconciliation.status, 'matched-2.2');
  const set = result.exercises[0].sets[0];
  assert.equal(set.summaryWeight, 100 / 2.2);
  assert.equal(set.rawSummaryWeight, 100);
  assert.equal(set.weightUnit, 'kg');
  assert.equal(set.apiCapacity, 1000, 'retain raw set capacity; it is not relabeled as converted tonnage');
  assert.equal(result.totalApiCapacity, 909.09);
  assert.equal(set.summaryWeightSource.scaleFactor, 2.2);
  assert.equal(set.summaryWeightSource.field, 'info.actionList[].setList[].summary.weight');
  assert.equal(result.partial, false);
});

test('keeps only raw scalar load when capacities reconcile neither way', () => {
  const result = normalizeFreeLiftSummary(fixture({ total: 1500 }), { weightUnit: 'kg' });
  assert.equal(result.scaleReconciliation.status, 'unknown');
  assert.equal(result.scaleReconciliation.factor, null);
  assert.equal(result.scaleReconciliation.reason, 'capacity-scale-conflict');
  assert.equal(result.exercises[0].sets[0].rawSummaryWeight, 100);
  assert.equal(result.exercises[0].sets[0].weightUnit, 'unknown');
  assert.equal(Object.hasOwn(result.exercises[0].sets[0], 'summaryWeight'), false);
  assert.equal(result.partial, true);
});

test('requires the entire capacity population, not a sum of only the usable sets', () => {
  for (const corrupt of [undefined, null, -10, Infinity, 'bad', true]) {
    const input = fixture({ total: 1000 });
    input.info.actionList[0].setList[1].summary.totalCapacity = corrupt;
    const result = normalizeFreeLiftSummary(input, { weightUnit: 'kg' });
    assert.equal(result.scaleReconciliation.factor, null);
    assert.equal(result.scaleReconciliation.capacityComplete, false);
    assert.equal(Object.hasOwn(result.scaleReconciliation, 'rawSetCapacitySum'), false);
    assert.equal(result.exercises[0].sets[0].weightUnit, 'unknown');
  }
  const malformed = fixture({ total: 1000 });
  malformed.info.actionList[0].setList[1] = {};
  const result = normalizeFreeLiftSummary(malformed, { weightUnit: 'kg' });
  assert.equal(result.scaleReconciliation.capacityComplete, false);
  assert.equal(result.omittedSetCount, 1);
});

test('missing, invalid or nonpositive session capacity never confirms a scale', () => {
  for (const total of [undefined, null, 0, -1, NaN, 'bad', false]) {
    const payload = fixture({ total });
    if (total === undefined) delete payload.info.totalCapacity;
    const result = normalizeFreeLiftSummary(payload, { weightUnit: 'lb' });
    assert.equal(result.scaleReconciliation.factor, null);
    assert.equal(result.partial, true);
    assert.equal(result.exercises[0].sets[0].weightUnit, 'unknown');
  }
});

test('uses the stated one-percent tolerance and rejects a result just outside it', () => {
  assert.equal(normalizeFreeLiftSummary(fixture({ total: 1000, capacities: [505, 505] }), { weightUnit: 'kg' }).scaleReconciliation.factor, 1);
  assert.equal(normalizeFreeLiftSummary(fixture({ total: 1000, capacities: [495, 495] }), { weightUnit: 'kg' }).scaleReconciliation.factor, 1);
  assert.equal(normalizeFreeLiftSummary(fixture({ total: 1000, capacities: [505.1, 505] }), { weightUnit: 'kg' }).scaleReconciliation.factor, null);
});

test('detects a claimed lb account that contradicts the observed kg scaling pattern', () => {
  const result = normalizeFreeLiftSummary(fixture({ total: 909.09 }), { weightUnit: 'lb' });
  assert.equal(result.scaleReconciliation.factor, null);
  assert.equal(result.scaleReconciliation.reason, 'account-unit-scaling-conflict');
  assert.equal(result.exercises[0].sets[0].weightUnit, 'unknown');
});

test('unknown account units remain unknown even when an encoding factor is reconciled', () => {
  const result = normalizeFreeLiftSummary(fixture({ total: 909.09 }));
  assert.equal(result.weightUnit, 'unknown');
  assert.equal(result.scaleReconciliation.factor, 2.2);
  assert.equal(result.exercises[0].sets[0].summaryWeight, 100 / 2.2);
  assert.equal(result.exercises[0].sets[0].weightUnit, 'unknown');
  assert.equal(result.partial, true);
  assert.ok(result.diagnostics.some(({ reason }) => reason === 'unknown-account-weight-unit'));
});

test('completionMethod zero and two describe timed work; actual elapsed time does not become a target dose', () => {
  for (const method of [0, 2, '2']) {
    const result = normalizeFreeLiftSummary(fixture({ method }), { weightUnit: 'lb' });
    const set = result.exercises[0].sets[0];
    assert.equal(set.unit, 'seconds');
    assert.equal(set.rawCount, 10);
    assert.equal(set.elapsedSeconds, 40);
    assert.equal(Object.hasOwn(set, 'reps'), false);
    assert.equal(Object.hasOwn(set, 'durationSeconds'), false);
    assert.equal(Object.hasOwn(set, 'targetCount'), false);
    assert.equal(set.summaryWeight, 100, 'timed work may retain its reported scalar load');
  }
});

test('countType metadata does not guess units; unknown or conflicting methods remain unknown', () => {
  for (const extra of [{ completionMethod: undefined }, { completionMethod: 9 }, { completionMethod: 1, unit: 'seconds' }]) {
    const input = fixture();
    Object.assign(input.info.actionList[0], extra);
    const result = normalizeFreeLiftSummary(input, { weightUnit: 'lb' });
    assert.equal(result.exercises[0].sets[0].unit, 'unknown');
    assert.equal(result.exercises[0].sets[0].rawCount, 10);
    assert.equal(Object.hasOwn(result.exercises[0].sets[0], 'reps'), false);
    assert.equal(result.partial, true);
  }
});

test('aligned mixed completion methods are resolved for their original set positions', () => {
  const result = normalizeFreeLiftSummary(fixture({ method: '1,2' }), { weightUnit: 'lb' });
  assert.deepEqual(result.exercises[0].sets.map(({ unit, reps, rawCount }) => [unit, reps, rawCount]), [
    ['reps', 10, undefined], ['seconds', undefined, 10]
  ]);
  const mismatch = normalizeFreeLiftSummary(fixture({ method: '1,2,1' }), { weightUnit: 'lb' });
  assert.deepEqual(mismatch.exercises[0].sets.map(({ unit }) => unit), ['unknown', 'unknown']);
});

test('retains explicit group and variant scope and omits ambiguous IDs without name matching', () => {
  const input = fixture();
  input.info.actionList[0].groupId = '424';
  input.info.actionList[0].actionLibraryId = '123';
  const result = normalizeFreeLiftSummary(input, { weightUnit: 'lb' });
  assert.equal(result.exercises[0].groupId, 424);
  assert.equal(result.exercises[0].actionLibraryId, 123);
  assert.equal(result.exercises[0].evidence.variantScope, 'explicit-variant');
  for (const extra of [{ groupId: undefined }, { groupId: 424, group_id: 425 }, { actionLibraryId: 123, action_library_id: 124 }]) {
    const ambiguous = fixture(); Object.assign(ambiguous.info.actionList[0], extra);
    const output = normalizeFreeLiftSummary(ambiguous, { weightUnit: 'lb' });
    assert.deepEqual(output.exercises, []);
    assert.equal(output.omittedExerciseCount, 1);
    assert.equal(output.partial, true);
  }
});

test('does not fabricate targets, side multipliers, per-rep loads, tonnage, 1RM or RIR', () => {
  const input = fixture();
  input.info.token = 'secret-token';
  input.info.actionList[0].isBarbell = true;
  const rawSet = input.info.actionList[0].setList[0];
  rawSet.summary.leftRight = 2;
  rawSet.summary.oneRepMax = 999;
  rawSet.summary.rir = 2;
  rawSet.summary.password = 'secret-password';
  rawSet.rawRepList = [{ weight: 777, token: 'secret-raw-rep' }];
  const before = JSON.stringify(input);
  const result = normalizeFreeLiftSummary(input, { weightUnit: 'lb' });
  assert.equal(JSON.stringify(input), before);
  const set = result.exercises[0].sets[0];
  assert.equal(set.side, 2);
  assert.equal(set.summaryWeight, 100, 'leftRight does not double summary weight');
  for (const key of ['weights', 'weightMin', 'weightMax', 'targetCount', 'durationSeconds', 'oneRepMax', 'rir', 'liftedVolume']) assert.equal(Object.hasOwn(set, key), false);
  assert.equal(Object.hasOwn(result, 'totalLiftedVolume'), false);
  assert.doesNotMatch(JSON.stringify(result), /secret-token|secret-password|secret-raw-rep|777|"rawRepList"/);
});

test('validates completed count, elapsed time and scalar weight without flooring or replacing invalid values', () => {
  const input = fixture();
  Object.assign(input.info.actionList[0].setList[0].summary, { finishedCount: 8.9, time: -1, weight: 'bad' });
  const result = normalizeFreeLiftSummary(input, { weightUnit: 'lb' });
  const set = result.exercises[0].sets[0];
  assert.equal(Object.hasOwn(set, 'reps'), false);
  assert.equal(Object.hasOwn(set, 'elapsedSeconds'), false);
  assert.equal(Object.hasOwn(set, 'rawSummaryWeight'), false);
  assert.equal(result.partial, true);
  assert.ok(result.diagnostics.some(({ reason }) => reason === 'invalid-completed-count'));
  assert.ok(result.diagnostics.some(({ reason }) => reason === 'invalid-elapsed-time'));
  assert.ok(result.diagnostics.some(({ reason }) => reason === 'invalid-summary-weight'));
});

test('missing primary quantity is reported, while genuine zero quantities are retained', () => {
  const missing = fixture();
  delete missing.info.actionList[0].setList[0].summary.finishedCount;
  const result = normalizeFreeLiftSummary(missing, { weightUnit: 'lb' });
  assert.equal(result.partial, true);
  assert.ok(result.diagnostics.some(({ reason }) => reason === 'missing-completed-count'));
  for (const method of [0, 2]) {
    const missingTime = fixture({ method });
    delete missingTime.info.actionList[0].setList[0].summary.time;
    const timed = normalizeFreeLiftSummary(missingTime, { weightUnit: 'lb' });
    assert.equal(timed.partial, true);
    assert.equal(Object.hasOwn(timed.exercises[0].sets[0], 'elapsedSeconds'), false);
    assert.ok(timed.diagnostics.some(({ reason }) => reason === 'missing-elapsed-time'));
  }
  for (const invalid of [null, '', false]) {
    const missingCount = fixture();
    missingCount.info.actionList[0].setList[0].summary.finishedCount = invalid;
    const counts = normalizeFreeLiftSummary(missingCount, { weightUnit: 'lb' });
    assert.equal(counts.partial, true);
    assert.ok(counts.diagnostics.some(({ reason }) => reason === 'invalid-completed-count'));
    const missingTime = fixture({ method: 2 });
    missingTime.info.actionList[0].setList[0].summary.time = invalid;
    const timed = normalizeFreeLiftSummary(missingTime, { weightUnit: 'lb' });
    assert.equal(timed.partial, true);
    assert.ok(timed.diagnostics.some(({ reason }) => reason === 'invalid-elapsed-time'));
  }
  const zero = fixture(); Object.assign(zero.info.actionList[0].setList[0].summary, { finishedCount: 0, time: 0 });
  const zeroSet = normalizeFreeLiftSummary(zero, { weightUnit: 'lb' }).exercises[0].sets[0];
  assert.equal(zeroSet.reps, 0);
  assert.equal(zeroSet.elapsedSeconds, 0);
});

test('malformed actions make scale reconciliation incomplete even if another action is usable', () => {
  const input = fixture();
  input.info.actionList.push({ actionLibraryName: 'Invalid' });
  const result = normalizeFreeLiftSummary(input, { weightUnit: 'lb' });
  assert.equal(result.scaleReconciliation.factor, null);
  assert.equal(result.scaleReconciliation.capacityComplete, false);
  assert.equal(result.omittedExerciseCount, 1);
});

test('bounds output while reconciling the complete capacity population first', () => {
  const input = fixture({ total: 201000 });
  input.info.actionList[0].setList = Array.from({ length: 201 }, () => ({ summary: { finishedCount: 10, weight: 100, time: 40, totalCapacity: 1000 } }));
  const result = normalizeFreeLiftSummary(input, { weightUnit: 'lb' });
  assert.equal(result.scaleReconciliation.factor, 1);
  assert.equal(result.exercises[0].sets.length, 200);
  assert.equal(result.omittedSetCount, 1);
  assert.equal(result.partial, true);
});

test('rejects unsupported declared account units', () => {
  assert.throws(() => normalizeFreeLiftSummary(fixture(), { weightUnit: 'g' }), TypeError);
});
