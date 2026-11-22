import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

// Extract the actual gate functions; no test-only replacement of decision logic.
const source = readFileSync(new URL('../training-evidence.mjs', import.meta.url), 'utf8');
const start = source.indexOf('function setDecisionValue(');
const decide = vm.runInNewContext(`${source.slice(start)}; setDecisionValue`);
const categories = ['set_work_dose', 'set_load', 'set_effort_rir', 'set_resistance_mode', 'set_rest_interval'];
const set = { unit: 'reps', reps: 8, weightKg: 20, rirTarget: 2, mode: 1, rest: 90 };
const exercise = { id: 42, loadType: 'fixed-kg' };

test('every per-set scientific value binds explicit side, even when doses match', () => {
  for (const category of categories) {
    const original = decide(exercise, set, category);
    const unilateral = { ...exercise, unilateralPrescription: 'explicit-sides' };
    const left = decide(unilateral, { ...set, side: 1 }, category);
    const right = decide(unilateral, { ...set, side: 2 }, category);
    assert.equal(left, `${original};unilateralPrescription=explicit-sides;side=1`);
    assert.equal(right, `${original};unilateralPrescription=explicit-sides;side=2`);
    assert.notEqual(left, right);
  }
});

test('ordinary scientific decision values retain their exact historical contract', () => {
  assert.equal(decide(exercise, set, 'set_work_dose'), 'unit=reps;reps=8');
  assert.equal(decide(exercise, set, 'set_load'), 'loadType=fixed-kg;weightKg=20');
  assert.equal(decide(exercise, set, 'set_effort_rir'), 'rirTarget=2');
  assert.equal(decide(exercise, set, 'set_resistance_mode'), 'mode=1');
  assert.equal(decide(exercise, set, 'set_rest_interval'), 'restSeconds=90');
});

test('missing, coerced or stray side markers cannot enter scientific decisions', () => {
  for (const side of [undefined, 0, 3, '1', NaN]) {
    assert.throws(() => decide({ ...exercise, unilateralPrescription: 'explicit-sides' }, { ...set, side }, 'set_rest_interval'));
  }
  assert.throws(() => decide(exercise, { ...set, side: 1 }, 'set_rest_interval'));
});
