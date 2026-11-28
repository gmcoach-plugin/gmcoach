import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolveSavedTemplateLoadPresentation } from '../plugin/saved-templates.mjs';
import { assertNoUnserializedTechniqueInstructions } from '../plugin/training-evidence.mjs';

const action = JSON.parse(readFileSync(new URL('./fixtures/real/saved-percent-dropset-action.json', import.meta.url), 'utf8'));

test('real saved action with percent1rmStr shows percent and kg per set, never the bare preset id', () => {
  const shown = [0, 1, 2].map((index) => resolveSavedTemplateLoadPresentation(action, index, 3, 'kg', 'reps'));
  assert.deepEqual(shown.map((item) => item.displayLoad), ['Gain Muscle · 70% 1RM · 30 kg', 'Gain Muscle · 65% 1RM · 28 kg', 'Gain Muscle · 55% 1RM · 24 kg']);
  assert.deepEqual(shown.map((item) => item.loadType), ['percent-1rm-kg', 'percent-1rm-kg', 'percent-1rm-kg']);
  assert.ok(shown.every((item) => !/Preset ID|niepotwierdzone/.test(item.displayLoad)));
});

test('drop-set wording in the plan name is allowed when the plan serializes dropSet sets and still blocked otherwise', () => {
  const base = { planName: 'GM Coach test drop set', rationale: 'Test zapisu drop set.', warmup: { status: 'omitted_user_preference', items: [] }, postWorkoutStretching: { status: 'omitted_user_preference', items: [] }, decisionEvidence: [], requireDecisionEvidence: false };
  const set = (extra = {}) => ({ unit: 'reps', reps: 8, mode: 1, rest: 0, ...extra });
  assert.doesNotThrow(() => assertNoUnserializedTechniqueInstructions({ ...base, exercises: [{ title: 'Press', sets: [set(), set({ dropSet: true })] }] }));
  assert.throws(() => assertNoUnserializedTechniqueInstructions({ ...base, exercises: [{ title: 'Press', sets: [set(), set()] }] }), /drop-set/);
});
