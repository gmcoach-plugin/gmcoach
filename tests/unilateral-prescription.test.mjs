import test from 'node:test';
import assert from 'node:assert/strict';
import { expandUnilateralPrescription, validateExplicitSidePairs } from '../plugin/unilateral-prescription.mjs';
import { buildPresetPayload } from '../plugin/program-serialization.mjs';

const metadata = new Map([[1, { batch: { isLeftRight: 1, actionLibraryList: [{ id: 11 }] }, detail: { isLeftRight: 1 } }]]);
const sets = [
  { side: 1, unit: 'reps', reps: 12, weightKg: 35, mode: 1, rest: 15 },
  { side: 2, unit: 'reps', reps: 10, weightKg: 30, mode: 3, rest: 60 }
];
const exercise = { id: 1, title: 'Unilateral', unilateralPrescription: 'explicit-sides', loadType: 'fixed-kg', fixedKgAuthorized: true, sets };

test('explicit sides preserve individual doses, modes, rests and loads without duplication', () => {
  const before = structuredClone(sets);
  const action = buildPresetPayload({ name: 'Sides', exercises: [exercise] }, metadata, 1, 'kg').payload.actionLibraryList[0];
  assert.equal(action.leftRight, '1,2');
  assert.equal(action.setsAndReps, '12,10');
  assert.equal(action.weights, '77.0,66.0');
  assert.equal(action.breakTime, '15,60');
  assert.equal(action.sportMode, '1,3');
  assert.deepEqual(sets, before);
});

test('explicit named RM preserves side selectors while static protocol remains independent', () => {
  const rm = { ...exercise, loadType: 'smart-rm', fixedKgAuthorized: false, smartRmPresetName: 'Gain Muscle', smartRmPresetId: 1,
    sets: sets.map((set, index) => ({ ...set, weightKg: undefined, rmLevel: index === 0 ? 12 : 13 })) };
  const action = buildPresetPayload({ name: 'RM sides', exercises: [rm] }, metadata, 1, 'kg').payload.actionLibraryList[0];
  assert.equal(action.weights, '3.5,3.5');
  assert.equal(action.counterweight, '12,13');
  assert.equal(action.leftRight, '1,2');
  const verbatim = buildPresetPayload({ name: 'Sides', exercises: [exercise] }, metadata, 1, 'kg', { staticLoadProtocol: 'account-unit-verbatim' }).payload.actionLibraryList[0];
  assert.equal(verbatim.weights, '35.0,30.0');
});

test('incomplete, reversed, unverified and superset side prescriptions reject', () => {
  for (const invalid of [sets.slice(0, 1), [...sets, sets[0]], [...sets].reverse(), sets.map(set => ({ ...set, side: String(set.side) }))]) {
    assert.throws(() => validateExplicitSidePairs(invalid));
  }
  for (const isUnilateral of [undefined, false]) assert.throws(() => expandUnilateralPrescription(exercise, sets, { isUnilateral }));
  assert.throws(() => expandUnilateralPrescription(exercise, sets, { isUnilateral: true, superset: true }));
  assert.throws(() => expandUnilateralPrescription({}, sets, { isUnilateral: true }));
});

test('symmetric default unchanged and API limit counts both sides', () => {
  const set = { unit: 'reps', reps: 8, mode: 1, rest: 60 };
  assert.deepEqual(expandUnilateralPrescription({}, [set], { isUnilateral: true }), [{ ...set, side: 1, rest: 1 }, { ...set, side: 2 }]);
  const many = { id: 1, title: 'Many', loadType: 'smart-rm', smartRmPresetName: 'Gain Muscle', smartRmPresetId: 1, sets: Array.from({ length: 51 }, () => ({ ...set, rmLevel: 13 })) };
  assert.throws(() => buildPresetPayload({ name: 'Overflow', exercises: [many] }, metadata, 1, 'kg'), /100/);
});
