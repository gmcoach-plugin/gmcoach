import test from 'node:test';
import assert from 'node:assert/strict';
import { exportPortablePlan, importPortablePlan } from '../plugin/portable-plan-codec.mjs';
import { resolvePercent1RMSet } from '../plugin/percent-1rm.mjs';

const source = (sets) => ({
  referenceClientJson: { name: 'Source', exercises: [{ id: 1, title: 'Press', preset: 1, isUnilateralExpanded: false, sets: sets.map(() => ({ reps: 10, weight: 11, mode: 1, rest: 60 })) }] },
  payload: { prescription: { name: 'Source', exercises: [{ entryId: 7, id: 1, actionLibraryId: 101, title: 'Press', section: 'main', loadType: 'smart-rm', smartRmPresetName: 'Gain Muscle', sets }] },
    research: { evidence: [], decisionEvidence: [] }, mapping: sets.map((_, i) => ({ referenceClientExerciseIndex: 0, referenceClientSetIndex: i, sourceEntryId: 7, sourceSetIndex: i })), sourceOnlyOmissions: [], staticSourceContext: { unit: 'kg', protocol: 'account-unit-verbatim' } }
});
const set = (extra = {}) => ({ unit: 'reps', reps: 10, mode: 1, restSeconds: 60, rirTarget: 2, sourceRmSelector: 11, ...extra });

test('export -> import carries percent1RM and percentReason per set', () => {
  const input = source([set({ percent1RM: 50, percentReason: 'seria wprowadzająca' }), set(), set({ percent1RM: 80, percentReason: 'top set' })]);
  const result = importPortablePlan({ referenceClientJson: input.referenceClientJson, sidecar: exportPortablePlan(input) });
  const sets = result.sourceArchive.prescription.exercises[0].sets;
  assert.deepEqual(sets.map((s) => s.percent1RM), [50, undefined, 80]);
  assert.deepEqual(sets.map((s) => s.percentReason), ['seria wprowadzająca', undefined, 'top set']);
  assert.equal(JSON.stringify(result.sourceArchive), JSON.stringify(input.payload));
});
test('invalid percent fields are rejected on export', () => {
  assert.throws(() => exportPortablePlan(source([set({ percent1RM: 40 })])), /percent1RM/);
  assert.throws(() => exportPortablePlan(source([set({ percentReason: 'x' })])), /percentReason/);
});
test('a set without percent keeps the automatic choice (selector-free import resolves like a new plan)', () => {
  const auto = resolvePercent1RMSet({ reps: 10, rirTarget: 2, presetName: 'Gain Muscle' });
  assert.equal(auto.percent1RM, 70);
  const input = source([set()]);
  const result = importPortablePlan({ referenceClientJson: input.referenceClientJson, sidecar: exportPortablePlan(input) });
  assert.equal(result.sourceArchive.prescription.exercises[0].sets[0].percent1RM, undefined);
});

test('export -> import carries dropSet per set and rejects it on non-load sets', () => {
  const input = source([set({ percent1RM: 70 }), set({ percent1RM: 65, percentReason: 'drop set', dropSet: true }), set({ percent1RM: 55, percentReason: 'drop set', dropSet: true })]);
  const result = importPortablePlan({ referenceClientJson: input.referenceClientJson, sidecar: exportPortablePlan(input) });
  assert.deepEqual(result.sourceArchive.prescription.exercises[0].sets.map((s) => s.dropSet === true), [false, true, true]);
  assert.equal(JSON.stringify(result.sourceArchive), JSON.stringify(input.payload));
  assert.throws(() => exportPortablePlan(source([set({ dropSet: false })])), /dropSet/);
});

