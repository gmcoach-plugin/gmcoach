import test from 'node:test';
import assert from 'node:assert/strict';
import { expandUnilateralPrescription } from '../plugin/unilateral-prescription.mjs';

test('operational side transition preserves independent recovery and legacy absent behavior', () => {
  const sets = [{ unit: 'reps', reps: 8, rest: 120 }, { unit: 'reps', reps: 10, rest: 90 }];
  for (const seconds of [2, 7, 20]) {
    const exercise = { sideTransitionSeconds: seconds, sideTransitionRationale: 'Confirmed variant requires position change.' };
    assert.deepEqual(expandUnilateralPrescription(exercise, sets, { isUnilateral: true }).map(set => set.rest), [seconds, 120, seconds, 90]);
    for (const isUnilateral of [false, undefined]) assert.throws(() => expandUnilateralPrescription(exercise, sets, { isUnilateral }));
  }
  assert.deepEqual(expandUnilateralPrescription({}, sets, { isUnilateral: true }).map(set => set.rest), [1, 120, 1, 90]);
  assert.deepEqual(expandUnilateralPrescription({}, sets, { isUnilateral: false }).map(set => set.rest), [120, 90]);
  assert.throws(() => expandUnilateralPrescription({ unilateralPrescription: 'explicit-sides', sideTransitionSeconds: 5, sideTransitionRationale: 'Position change.' }, [{ ...sets[0], side: 1 }, { ...sets[0], side: 2 }], { isUnilateral: true }));
  for (const seconds of [0, 31, null, '5']) assert.throws(() => expandUnilateralPrescription({ sideTransitionSeconds: seconds, sideTransitionRationale: 'Position change.' }, sets, { isUnilateral: true }));
});

import { createHash } from 'node:crypto';
import { snapshotNormalizedPlan } from '../plugin/reviewed-plan-record.mjs';
import { compareWeeklyPrescriptions } from '../plugin/training-cycle-prescription.mjs';
test('actual snapshot digest binds transition while cycle comparison keeps recovery separate', () => {
 const plan={name:'Synthetic',exercises:[{id:42,title:'Side movement',loadType:'bodyweight',sideTransitionSeconds:2,sideTransitionRationale:'Simple switch',sets:[{unit:'reps',reps:8,mode:1,rest:90}]}]};
 const digest=plan=>createHash('sha256').update(JSON.stringify(snapshotNormalizedPlan(plan))).digest('hex');
 const before=digest(plan);plan.exercises[0].sideTransitionSeconds=7;assert.notEqual(digest(plan),before);
 const ex={catalogId:42,entryId:42,section:'main',actionLibraryId:142,loadType:'bodyweight',unilateralPrescription:'paired-symmetric',localPrescribedSets:1,sets:[{unit:'reps',amount:8,side:'unknown',mode:1,restSeconds:90}]};
 const rows=seconds=>[{date:'2026-10-07',occurrenceId:'one',exercisePrescriptions:[{...ex,sideTransitionSeconds:seconds}]}];
 const result=compareWeeklyPrescriptions(rows(2),rows(7)).exercises[0];
 assert.equal(result.sets[0].deltaRestSeconds,0);
 assert.deepEqual(result.operationalSideTransition,{from:2,to:7,interpretation:'setup-time-not-recovery-or-progression'});
});
