import test from 'node:test';
import assert from 'node:assert/strict';
import { createSmartRmReadinessRegistry, savedSmartRmRequiresAccountObservation } from '../smart-rm-readiness.mjs';
import { extractExplicitOneRepMaxCandidates } from '../exercise-statistics.mjs';

test('shared Smart RM markers cannot bypass account readiness and rest/mode-only edits preserve readiness', () => {
  const current = { templatePresetId: 1, setsAndReps: '8,8', weights: '3.5', counterweight: '13,13', counterweight2: '13,13', breakTime: '60,60', sportMode: '1,1' };
  assert.equal(savedSmartRmRequiresAccountObservation(null, current), true);
  assert.equal(savedSmartRmRequiresAccountObservation({ ...current, templatePresetId: -1 }, current), true);
  assert.equal(savedSmartRmRequiresAccountObservation(current, { ...current, setsAndReps: '10,10' }), true);
  assert.equal(savedSmartRmRequiresAccountObservation(current, { ...current, counterweight: '14,14' }), true);
  assert.equal(savedSmartRmRequiresAccountObservation(current, { ...current, templatePresetId: 5 }), true);
  assert.equal(savedSmartRmRequiresAccountObservation(current, { ...current, breakTime: '90,90', sportMode: '3,3' }), false);
  assert.equal(savedSmartRmRequiresAccountObservation(current, { ...current, weights: '3.5,3.5', counterweight: '13', counterweight2: '13' }), false,
    'API readback compression does not change the logical RM dose');
  assert.equal(savedSmartRmRequiresAccountObservation(current, { ...current, templatePresetId: -1 }), false);
});

test('raw Speediance account response establishes preset readiness without a load conversion or unit prompt', () => {
  const registry = createSmartRmReadinessRegistry();
  const candidates = extractExplicitOneRepMaxCandidates({ data: { groupId: 12, actionLibraryId: 120, oneRepMax: 80 } }, 12, 'unknown', { allowUnknownUnit: true });
  assert.equal(candidates[0].unit, 'unknown');
  registry.observe('one', 'A', 12, candidates);
  const result = registry.check('one', 'A', 12, 120, [120, 121]);
  assert.equal(result.ready, true);
  assert.equal(result.deviceLoadVerified, false);
  assert.equal(Object.hasOwn(result, 'weight'), false);
  registry.observe('one', 'A', 12, extractExplicitOneRepMaxCandidates({ data: { groupId: 13, actionLibraryId: 120, oneRepMax: 80 } }, 12, 'unknown', { allowUnknownUnit: true }));
  assert.equal(registry.check('one', 'A', 12, 120, [120, 121]).ready, false);
});

test('Smart RM readiness is isolated by account, credentials, exercise and variant', () => {
  const registry = createSmartRmReadinessRegistry();
  registry.observe('one', 'session-A', 12, [{ groupId: 12, actionLibraryId: 120, kind: 'reported', value: 80 }]);
  assert.equal(registry.check('one', 'session-A', 12, 120, [120, 121]).ready, true);
  for (const args of [['two', 'session-A', 12, 120], ['one', 'session-B', 12, 120], ['one', 'session-A', 13, 120], ['one', 'session-A', 12, 121]]) {
    assert.equal(registry.check(...args, [120, 121]).ready, false);
  }
});

test('reference client group-scoped statistics apply to independently confirmed variants and never invent account units', () => {
  const registry = createSmartRmReadinessRegistry();
  registry.observe('one', 'A', 12, [{ groupId: 12, kind: 'reported', value: 80, unit: 'unknown' }]);
  assert.equal(registry.check('one', 'A', 12, 120, [120]).ready, true);
  assert.equal(registry.check('one', 'A', 12, 120, [120, 121]).ready, true);
  assert.equal(registry.check('one', 'A', 12, 121, [120, 121]).scope, 'exercise-group');
  assert.equal(registry.check('one', 'A', 12, 122, [120]).ready, false);
});

test('estimated, other-exercise, zero and invalid statistics never establish device account 1RM', () => {
  const registry = createSmartRmReadinessRegistry();
  registry.observe('one', 'A', 12, [
    { groupId: 12, kind: 'estimated', value: 90 },
    { groupId: 13, kind: 'reported', value: 80 },
    { groupId: 12, kind: 'reported', value: 0 },
    { groupId: 12, kind: 'reported', value: 80, actionLibraryId: '120' }
  ]);
  assert.equal(registry.check('one', 'A', 12, 120, [120]).ready, false);
});

test('account observations expire and a new missing response invalidates prior readiness', () => {
  let clock = 0;
  const registry = createSmartRmReadinessRegistry({ now: () => clock, ttlMs: 50 });
  const observe = () => registry.observe('one', 'A', 12, [{ groupId: 12, kind: 'reported', value: 80 }]);
  observe();
  assert.equal(registry.check('one', 'A', 12, 120, [120]).ready, true);
  clock = 50;
  assert.equal(registry.check('one', 'A', 12, 120, [120]).ready, false);
  observe();
  registry.observe('one', 'A', 12, []);
  assert.equal(registry.check('one', 'A', 12, 120, [120]).ready, false);
});
