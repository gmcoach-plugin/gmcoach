import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveSetUnit, interpretSpeedianceUnitCode } from '../unit-interpretation.mjs';
import { annotateTimedWorkoutOutput } from '../workout-data.mjs';

test('method5 is timed only in confirmed Vita finished-history, never a global code', () => {
  assert.equal(interpretSpeedianceUnitCode(5), null);
  const records = [{ dataStatType: 6, completionMethod: 5 }];
  assert.equal(resolveSetUnit({ records }).unit, 'unknown');
  assert.equal(resolveSetUnit({ records, endpoint: 'finished-history' }).unit, 'seconds');
  for (const conflicting of [{ dataStatType: 1 }, { dataStatType: '6' }, { unit: 'reps' }, { completionMethod: 1 }]) {
    assert.equal(resolveSetUnit({ records: [...records, conflicting], endpoint: 'finished-history' }).unit, 'unknown');
  }
  assert.equal(resolveSetUnit({ records: [{ completionMethod: 5 }], endpoint: 'finished-history' }).unit, 'unknown');
});

test('Vita completed history preserves achieved reps, target seconds and actual elapsed separately', () => {
  const raw = { detail: [{ title: 'Vita', dataStatType: 6, completionMethod: 5,
    finishedReps: [
      { finishedCount: 15, targetCount: 20, time: 18, capacity: 150, trainingInfoDetail: { weights: Array(15).fill(10) } },
      { finishedCount: 0, targetCount: 20, time: 0 }
    ] }] };
  const result = JSON.parse(annotateTimedWorkoutOutput(JSON.stringify(raw), { displayUnit: 'kg' }));
  assert.deepEqual(result.detail, raw.detail);
  for (const sets of [result.gmCoachTimeInterpretation.series[0].sets, result.gmCoachSessionSummary.exercises[0].sets]) {
    const [done, skipped] = sets;
    assert.equal(done.unit, 'seconds');
    assert.equal(done.achievedReps, 15);
    assert.equal(done.targetDurationSeconds, 20);
    assert.equal(done.elapsedSeconds, 18);
    assert.equal(done.durationSeconds, undefined);
    assert.equal(done.reps, undefined);
    assert.equal(done.liftedVolume, undefined);
    assert.equal(skipped.executionStatus, 'skipped');
    assert.equal(skipped.elapsedSeconds, 0);
    assert.equal(skipped.achievedReps, 0);
    assert.equal(skipped.targetDurationSeconds, 20);
  }
  assert.equal(result.gmCoachSessionSummary.totalLiftedVolume, undefined);
});

test('unconfirmed or conflicting Vita history never exposes achieved-rep or duration semantics', () => {
  for (const metadata of [{ completionMethod: 5 }, { dataStatType: 1, completionMethod: 5 }, { dataStatType: 6, completionMethod: 5, unit: 'reps' }]) {
    const raw = { detail: [{ ...metadata, finishedReps: [{ finishedCount: 15, targetCount: 20, time: 20 }] }] };
    const result = JSON.parse(annotateTimedWorkoutOutput(JSON.stringify(raw)));
    const set = result.gmCoachSessionSummary.exercises[0].sets[0];
    assert.equal(set.unit, 'unknown');
    assert.equal(set.achievedReps, undefined);
    assert.equal(set.targetDurationSeconds, undefined);
  }
});
