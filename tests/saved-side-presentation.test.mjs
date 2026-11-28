import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveSavedTemplateSetSide } from '../plugin/saved-templates.mjs';

test('saved side presentation reads singleton and aligned CSV without using repetition parity', () => {
  for (const code of [0, 1, 2]) {
    const expected = { side: code, sideLabel: ['obustronnie', 'lewa', 'prawa'][code] };
    for (const raw of [code, String(code), ` ${code} `]) {
      assert.deepEqual(resolveSavedTemplateSetSide({ leftRight: raw }, 1, 2), expected);
    }
  }
  const action = { leftRight: '2,1,2,0' };
  assert.deepEqual([0, 1, 2, 3].map(index => resolveSavedTemplateSetSide(action, index, 4).side), [2, 1, 2, 0]);
});

test('missing or malformed side evidence remains unknown rather than inferred from titles or parity', () => {
  for (const raw of [undefined, '', '1,2', '1,,2', '3', -1, NaN, Infinity, 'left', '01', false]) {
    assert.deepEqual(resolveSavedTemplateSetSide({ leftRight: raw, title: 'Left unilateral' }, 0, 3),
      { side: 'unknown', sideLabel: 'strona nierozpoznana' });
  }
});

test('side presentation rejects invalid set coordinates', () => {
  for (const [index, count] of [[-1, 1], [1, 1], [0, 0], [0.5, 2]]) {
    assert.throws(() => resolveSavedTemplateSetSide({ leftRight: 1 }, index, count));
  }
});
