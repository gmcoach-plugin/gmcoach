import test from 'node:test';
import assert from 'node:assert/strict';
import { indexRememberedSavedTemplateUnits, savedTemplateUnitSignalFingerprint } from '../plugin/saved-template-unit-memory.mjs';
import { indexSavedTemplateUnitConfirmations, resolveSavedTemplateSetUnitWithConfirmation } from '../plugin/saved-templates.mjs';

const unknown = { groupId: 10, actionLibraryId: 101, setsAndReps: '8' };
const memory = {
  version: 1, updatedAt: '2026-10-03T12:00:00Z', confirmations: [{
    programCode: 'test-template', groupId: 10, actionLibraryId: 101, set: 1,
    rawWorkValue: '8', unit: 'reps',
    signalFingerprint: savedTemplateUnitSignalFingerprint(unknown, 0, 1),
    confirmedAt: '2026-10-03T12:00:00Z'
  }]
};

test('legacy unit memory cannot transfer to identical repeated catalog occurrences', () => {
  const index = indexRememberedSavedTemplateUnits([unknown, { ...unknown }], 'test-template', memory);
  assert.equal(index.size, 0);
  assert.equal(resolveSavedTemplateSetUnitWithConfirmation(unknown, 0, 1, {
    confirmedUnit: index.get('10:101')?.get(0)
  }).unit, 'unknown');
});

test('duplicate unit-memory suppression preserves known completionMethod on each occurrence', () => {
  const actions = [{ ...unknown, completionMethod: '2' }, { ...unknown, completionMethod: '1' }];
  const index = indexRememberedSavedTemplateUnits(actions, 'test-template', memory);
  assert.equal(index.size, 0);
  assert.deepEqual(actions.map(action => resolveSavedTemplateSetUnitWithConfirmation(action, 0, 1).unit), ['seconds', 'reps']);
});

test('current-chat legacy unit confirmation rejects duplicate group and variant keys', () => {
  assert.throws(() => indexSavedTemplateUnitConfirmations([unknown, { ...unknown }], [{
    groupId: 10, actionLibraryId: 101, sets: [{ set: 1, unit: 'reps' }]
  }]), /nie występuje dokładnie raz/);
});

test('unit memory remains available for unique group-variant despite another variant occurrence', () => {
  const index = indexRememberedSavedTemplateUnits([unknown, { ...unknown, actionLibraryId: 102 }], 'test-template', memory);
  assert.equal(index.get('10:101')?.get(0), 'reps');
});
