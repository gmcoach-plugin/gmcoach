import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPresetPayload } from '../program-serialization.mjs';
import { resolveSavedTemplateSetUnit, resolveSavedTemplateSetUnitWithConfirmation, verifyCreatedTemplateReadback } from '../saved-templates.mjs';

const vitaMetadata = { dataStatTypeStatus: 'available', dataStatType: 6 };
const resolve = (action, metadata) => resolveSavedTemplateSetUnit(action, 0, 1, undefined, false, metadata);

test('saved code5 duration requires confirmed Vita catalog metadata and never raw level/name', () => {
  const action = { completionMethod: 5, setsAndReps: '30', level: '12', name: 'Vita' };
  assert.equal(resolve(action, vitaMetadata).unit, 'seconds');
  for (const metadata of [undefined, {}, { dataStatType: 6 }, { dataStatTypeStatus: 'available', dataStatType: 1 }, { dataStatTypeStatus: 'available', dataStatType: '6' }]) {
    assert.equal(resolve(action, metadata).unit, 'unknown');
  }
  assert.equal(resolve({ ...action, unit: 'reps' }, vitaMetadata).unit, 'unknown');
  assert.equal(resolveSavedTemplateSetUnitWithConfirmation(action, 0, 1, { exerciseMetadata: vitaMetadata }).unit, 'seconds');
  assert.throws(() => resolveSavedTemplateSetUnitWithConfirmation(action, 0, 1, { exerciseMetadata: vitaMetadata, confirmedUnit: 'reps' }));
});

function fixture() {
  const exercise = { id: 49, title: 'Synthetic Vita', loadType: 'vita', dataStatType: 6,
    sets: [{ unit: 'sec', durationSeconds: 30, level: 12, mode: 1, rest: 60 }] };
  const metadata = { batch: { dataStatType: 6, actionLibraryList: [{ id: 149 }] }, detail: { dataStatType: 6, isLeftRight: 0 } };
  const { payload } = buildPresetPayload({ name: 'Synthetic Vita readback', exercises: [exercise] }, new Map([[49, metadata]]), 1, 'kg');
  const readback = { ...structuredClone(payload), code: 'synthetic-vita' };
  readback.actionLibraryList[0].completionMethod = 5;
  readback.actionLibraryList[0].countType = 5;
  return { payload, readback };
}

test('real timed Vita writer2 verifies server-normalized saved readback5 only for catalog-confirmed Vita', () => {
  const { payload, readback } = fixture();
  assert.equal(payload.actionLibraryList[0].completionMethod, '2');
  const options = { expectedPayload: payload, readback, existingTemplateCodes: [], expectedSetUnits: [['seconds']] };
  assert.equal(verifyCreatedTemplateReadback(options).status, 'unavailable');
  const exerciseMetadataByAction = new Map([['49:149', vitaMetadata]]);
  assert.equal(verifyCreatedTemplateReadback({ ...options, exerciseMetadataByAction }).status, 'verified');
  readback.actionLibraryList[0].setsAndReps = '31';
  assert.equal(verifyCreatedTemplateReadback({ ...options, exerciseMetadataByAction }).status, 'mismatch');
});

test('Vita readback5 never verifies a rep prescription or hides changed intensity', () => {
  const { payload, readback } = fixture();
  const exerciseMetadataByAction = new Map([['49:149', vitaMetadata]]);
  const options = { expectedPayload: payload, readback, existingTemplateCodes: [], exerciseMetadataByAction };
  assert.equal(verifyCreatedTemplateReadback({ ...options, expectedSetUnits: [['reps']] }).status, 'mismatch');
  readback.actionLibraryList[0].level = '13';
  assert.equal(verifyCreatedTemplateReadback({ ...options, expectedSetUnits: [['seconds']] }).status, 'mismatch');
});
