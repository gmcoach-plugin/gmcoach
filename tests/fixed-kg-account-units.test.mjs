import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPresetPayload } from '../plugin/program-serialization.mjs';

function serialize(weightKg, { unilateral = false, barbell = true, unit = 'kg' } = {}) {
  const exercise = { id: 42, title: 'Verified manual kg', loadType: 'fixed-kg', fixedKgAuthorized: true,
    sets: [{ unit: 'reps', reps: 8, weightKg, mode: 1, rest: 90 }] };
  const flags = { isLeftRight: Number(unilateral), isBarbell: Number(barbell) };
  return buildPresetPayload({ name: 'Manual kg', exercises: [exercise] }, new Map([[42, {
    detail: flags, batch: { ...flags, actionLibraryList: [{ id: 142 }] }
  }]]), 1, unit).payload;
}

test('manual 7 kg bilateral has identical wire on kg and lb accounts', () => {
  assert.deepEqual(serialize(7), serialize(7, { unit: 'lb' }));
  assert.equal(serialize(7, { unit: 'lb' }).actionLibraryList[0].weights, '15.4');
});
test('manual 3.5 kg unilateral has identical wire and side expansion on either account', () => {
  const kg = serialize(3.5, { unilateral: true, barbell: false });
  const lb = serialize(3.5, { unilateral: true, barbell: false, unit: 'lb' });
  assert.deepEqual(kg, lb);
  assert.equal(lb.actionLibraryList[0].weights, '7.7,7.7');
  assert.equal(lb.actionLibraryList[0].leftRight, '1,2');
});
test('manual kg limits and half-kg steps remain canonical on imperial accounts', () => {
  for (const unit of ['kg', 'lb']) {
    assert.throws(() => serialize(3.5, { unit }), /7–100/);
    assert.throws(() => serialize(100.5, { unit }), /7–100/);
    assert.throws(() => serialize(7.1, { unit }), /step 0.5/);
    assert.throws(() => serialize(50.5, { unit, unilateral: true }), /3.5–50/);
    assert.equal(serialize(3.5, { unit, barbell: false }).actionLibraryList[0].weights, '7.7');
    assert.equal(serialize(50, { unit, unilateral: true }).actionLibraryList[0].weights, '110.0,110.0');
  }
});
