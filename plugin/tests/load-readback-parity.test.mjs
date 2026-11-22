import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPresetPayload } from '../program-serialization.mjs';
import { verifyCreatedTemplateReadback } from '../saved-templates.mjs';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

test('different bilateral set prescriptions retain dose, resistance mode, rest and static load order', () => {
  const exercise = { id: 42, title: 'Verified exercise', loadType: 'fixed-kg', fixedKgAuthorized: true,
    sets: [
      { unit: 'reps', reps: 8, weightKg: 20, rirTarget: 2, mode: 1, rest: 120 },
      { unit: 'reps', reps: 10, weightKg: 18, rirTarget: 3, mode: 2, rest: 90 },
      { unit: 'reps', reps: 12, weightKg: 16, rirTarget: 1, mode: 3, rest: 60 }
    ] };
  const scienceSource = readFileSync(new URL('../training-evidence.mjs', import.meta.url), 'utf8');
  const scienceStart = scienceSource.indexOf('function setDecisionValue(');
  const decide = vm.runInNewContext(`${scienceSource.slice(scienceStart)}; setDecisionValue`);
  for (const category of ['set_work_dose', 'set_load', 'set_effort_rir', 'set_resistance_mode', 'set_rest_interval']) {
    assert.equal(new Set(exercise.sets.map(set => decide(exercise, set, category))).size, 3,
      `${category} must bind each distinct prescribed value`);
  }
  const { payload } = buildPresetPayload({ name: 'Different sets', exercises: [exercise] }, new Map([[42, {
    detail: { isLeftRight: 0, isBarbell: 1 }, batch: { actionLibraryList: [{ id: 142 }] }
  }]]), 1, 'kg');
  const action = payload.actionLibraryList[0];
  assert.equal(action.setsAndReps, '8,10,12');
  assert.equal(action.sportMode, '1,2,3');
  assert.equal(action.breakTime, '120,90,60');
  assert.equal(action.breakTime2, '120,90,60');
  const readback = { ...structuredClone(payload), code: 'mixed-sets-template' };
  readback.actionLibraryList[0].weights = '20,18,16';
  const verify = () => verifyCreatedTemplateReadback({ expectedPayload: payload, readback,
    existingTemplateCodes: [], expectedSetUnits: [['reps', 'reps', 'reps']] });
  assert.equal(verify().status, 'verified');
  for (const field of ['setsAndReps', 'sportMode', 'breakTime', 'breakTime2', 'weights']) {
    const original = readback.actionLibraryList[0][field];
    readback.actionLibraryList[0][field] = original.split(',').reverse().join(',');
    assert.equal(verify().status, 'mismatch', `${field} reordering must reject readback`);
    readback.actionLibraryList[0][field] = original;
  }
});

function fixture(loadType, unit = 'kg') {
  const exercise = { id: 42, title: 'Verified exercise', loadType,
    ...(loadType === 'smart-rm' ? { smartRmPresetId: 1, smartRmPresetName: 'Gain Muscle' } : { fixedKgAuthorized: true }),
    sets: Array.from({ length: 2 }, () => ({ unit: 'reps', reps: 8, mode: 1, rest: 90,
      ...(loadType === 'smart-rm' ? { rmLevel: 13 } : { weightKg: 20 }) })) };
  const { payload } = buildPresetPayload({ name: 'Readback parity', exercises: [exercise] }, new Map([[42, {
    detail: { isLeftRight: 0, isBarbell: 1 }, batch: { actionLibraryList: [{ id: 142 }] }
  }]]), 1, unit);
  const readback = { ...structuredClone(payload), code: 'new-parity-template' };
  if (loadType !== 'smart-rm') readback.actionLibraryList[0].weights = '20,20';
  const verify = () => verifyCreatedTemplateReadback({ expectedPayload: payload, readback, existingTemplateCodes: [], expectedSetUnits: [['reps', 'reps']] });
  return { payload, readback, verify };
}
test('real RM serializer readback supports shared exact markers and counters, rejects marker drift', () => {
  const { readback, verify } = fixture('smart-rm');
  const action = readback.actionLibraryList[0];
  action.weights = 3.5; action.counterweight = 13; action.counterweight2 = '13';
  assert.equal(verify().status, 'verified');
  action.weights = 3.54;
  assert.equal(verify().status, 'mismatch');
  action.weights = 3.5; action.counterweight = 12;
  assert.equal(verify().status, 'mismatch');
});
test('real manual kg serializer permits bounded static GET precision on both account units', () => {
  for (const unit of ['kg', 'lb']) {
    const { readback, verify } = fixture('fixed-kg', unit);
    assert.equal(verify().status, 'verified');
    readback.actionLibraryList[0].weights = '20.04,19.96';
    assert.equal(verify().status, 'verified');
    readback.actionLibraryList[0].weights = '20.06,20';
    assert.equal(verify().status, 'mismatch');
  }
});
