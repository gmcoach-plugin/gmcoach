import test from 'node:test';
import assert from 'node:assert/strict';
import { applyReferenceClientResistanceModeUpdates, applySmartRmConversions } from '../plugin/saved-templates.mjs';

const action = (groupId = 10, actionLibraryId = 101) => ({
  groupId, actionLibraryId, setsAndReps: '8', sportMode: '1',
  completionMethod: '1', weights: '20', templatePresetId: -1
});
const conversion = { groupId: 10, actionLibraryId: 101,
  smartRmPresetName: 'Gain Muscle', smartRmPresetId: 1,
  sets: [{ unit: 'reps', reps: 8 }] };

test('Smart RM conversion accepts numeric singleton reps without broadcasting or weakening unit checks', () => {
  const convert = record => applySmartRmConversions([record], [conversion], { primaryGoal: 'hipertrofia' });
  assert.deepEqual(convert({ ...action(), setsAndReps: 8 }), convert(action()));
  assert.throws(() => applySmartRmConversions([{ ...action(), setsAndReps: 8 }],
    [{ ...conversion, sets: [conversion.sets[0], conversion.sets[0]] }], { primaryGoal: 'hipertrofia' }), /liczba serii/);
  for (const value of [NaN, Infinity, -Infinity, 8.5, 0, -8]) {
    assert.throws(() => convert({ ...action(), setsAndReps: value }));
  }
  assert.throws(() => convert({ ...action(), setsAndReps: 8, completionMethod: 2 }), /seconds/);
});

test('Smart RM rejects duplicate selected occurrences before reading timed-dose fields', () => {
  const actions = [action(), { ...action(), setsAndReps: '30', completionMethod: '2' }];
  const before = structuredClone(actions);
  assert.throws(() => applySmartRmConversions(actions, [conversion], { primaryGoal: 'hipertrofia' }), /występuje 2 razy.*pełny wynikowy plan i podgląd naukowy/);
  assert.deepEqual(actions, before);
});

test('resistance mode patch rejects duplicate selected occurrences without mutation', () => {
  const actions = [action(), { ...action(), groupId: '10', actionLibraryId: '101' }];
  const before = structuredClone(actions);
  assert.throws(() => applyReferenceClientResistanceModeUpdates(actions, [{ groupId: 10, actionLibraryId: 101, modes: [3] }]), /występuje 2 razy.*pełny wynikowy plan i podgląd naukowy/);
  assert.deepEqual(actions, before);
});

test('duplicate unselected occurrences do not prevent an exact distinct variant patch', () => {
  const actions = [action(), action(), action(10, 102)];
  const updated = applyReferenceClientResistanceModeUpdates(actions, [{ groupId: 10, actionLibraryId: 102, modes: [3] }]);
  assert.strictEqual(updated[0], actions[0]);
  assert.strictEqual(updated[1], actions[1]);
  assert.equal(updated[2].sportMode, '3');
  assert.equal(actions[2].sportMode, '1');
});

test('ambiguity in a later selected key rejects the whole mode patch unchanged', () => {
  const actions = [action(20, 201), action(), action()];
  const before = structuredClone(actions);
  assert.throws(() => applyReferenceClientResistanceModeUpdates(actions, [
    { groupId: 20, actionLibraryId: 201, modes: [2] },
    { groupId: 10, actionLibraryId: 101, modes: [3] }
  ]), /występuje 2 razy/);
  assert.deepEqual(actions, before);
});
