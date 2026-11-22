import test from 'node:test';
import assert from 'node:assert/strict';
import { getStaticLoadRules, resolveStaticLoadMetadata, validateStaticLoad } from '../static-load-limits.mjs';

for (const [displayUnit, isUnilateral, isBarbell, min, max, step] of [
  ['kg', true, false, 3.5, 50, 0.5],
  ['kg', false, true, 7, 100, 0.5],
  ['kg', false, false, 3.5, 100, 0.5],
  ['lb', true, false, 7.7, 110, 0.1],
  ['lb', false, true, 14.3, 220, 0.1],
  ['lb', false, false, 14.3, 220, 0.1]
]) {
  test(`static limits ${displayUnit} unilateral=${isUnilateral} barbell=${isBarbell}`, () => {
    const context = { displayUnit, isUnilateral, isBarbell };
    assert.deepEqual(getStaticLoadRules(context), { min, max, step });
    for (const value of [min, min + step, max]) assert.equal(validateStaticLoad(value, context), value);
    for (const value of [min - step, max + step, min + step / 2, NaN, Infinity, '20', null]) {
      assert.throws(() => validateStaticLoad(value, context));
    }
  });
}

test('unknown metadata and units never become guessed static limits', () => {
  for (const context of [
    { displayUnit: 'unknown', isUnilateral: false, isBarbell: false },
    { displayUnit: 'kg', isBarbell: false },
    { displayUnit: 'kg', isUnilateral: false }
  ]) assert.throws(() => validateStaticLoad(20, context));
});

test('metadata uses explicit API flags and rejects conflicting sources', () => {
  assert.deepEqual(resolveStaticLoadMetadata({ batch: { isLeftRight: 1, isBarbell: 0 } }),
    { isUnilateral: true, isBarbell: false });
  assert.deepEqual(resolveStaticLoadMetadata({ detail: { isLeftRight: 1 }, batch: { isLeftRight: 0 } }),
    { isUnilateral: undefined, isBarbell: undefined });
  assert.deepEqual(resolveStaticLoadMetadata({ detail: { isLeftRight: '1', isBarbell: null } }),
    { isUnilateral: undefined, isBarbell: undefined });
  assert.equal(validateStaticLoad(15, { displayUnit: 'lb', isUnilateral: false }), 15);
});
