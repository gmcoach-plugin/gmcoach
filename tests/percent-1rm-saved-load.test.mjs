import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveSavedTemplateLoadPresentation } from '../plugin/saved-templates.mjs';

test('%1RM set in app (preset id + positive weights + counterweight2, no counterweight) shows kg without inventing percent', () => {
  for (const [weights, cw2] of [['25', '17'], ['9.0', '8'], ['22', '20'], ['10', '4'], ['32', '11']]) {
    const action = { templatePresetId: 1, level: '0', weights, counterweight2: cw2, setsAndReps: '12' };
    const d = resolveSavedTemplateLoadPresentation(action, 0, 1, 'kg', 'reps');
    assert.equal(d.loadType, 'percent-1rm-kg');
    assert.equal(d.loadUnit, 'kg');
    assert.equal(d.loadKg, Number(weights));
    assert.match(d.displayLoad, /^[\d.]+ kg \(%1RM, procent liczy aplikacja\)$/);
  }
  assert.equal(resolveSavedTemplateLoadPresentation({ templatePresetId: 1, level: '0', weights: '25', counterweight2: '17', setsAndReps: '12' }, 0, 1, 'kg', 'reps').displayLoad, '25 kg (%1RM, procent liczy aplikacja)');
});

test('preset without positive weights, seconds sets or counterweight stay unconfirmed', () => {
  const base = { templatePresetId: 1, level: '0', counterweight2: '17', setsAndReps: '12' };
  assert.equal(resolveSavedTemplateLoadPresentation({ ...base, weights: '0' }, 0, 1, 'kg', 'reps').loadType, 'preset-load-unknown');
  assert.equal(resolveSavedTemplateLoadPresentation({ ...base, weights: '25' }, 0, 1, 'kg', 'seconds').loadType, 'preset-load-unknown');
  assert.equal(resolveSavedTemplateLoadPresentation({ ...base, weights: '25', counterweight: '17' }, 0, 1, 'kg', 'reps').loadType, 'preset-load-unknown');
});

