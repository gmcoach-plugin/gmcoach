import test from 'node:test';
import assert from 'node:assert/strict';
// Dose-unit aliases are normalized only with the same evidence as saved readback.
import { diffSavedEditPayloads, assertSavedEditScope, reconcileSavedEditPayload } from '../plugin/saved-edit-diff.mjs';
import { applySmartRmConversions, buildSavedTemplateUpdatePayload } from '../plugin/saved-templates.mjs';
const action = { groupId: 1, actionLibraryId: 2, setsAndReps: '8,8', breakTime: '60,60', sportMode: '1,1', weights: '3.5,3.5', templatePresetId: 1 };
const payload = actions => ({ name: 'Synthetic', actionLibraryList: actions });

test('real saved-template baseline tolerates absent optional preset aliases without widening rest scope', () => {
  const old = { ...action, presetId: null, templatePresetName: null, presetName: null, templatePreset: null, preset: null,
    counterweight: '13,13', counterweight2: '13,13', completionMethod: '1,1', selectCompletionMethod: '1,1', countType: '1,1', capacity: 457.6 };
  const current = { id: 1, code: 'synthetic-null-alias', name: 'Synthetic', deviceType: 1, totalCapacity: 457.6, actionLibraryList: [old] };
  const baseline = buildSavedTemplateUpdatePayload(current);
  const resulting = buildSavedTemplateUpdatePayload(current, { actionLibraryList: [{ ...old, breakTime: '90,90' }] });
  const diff = diffSavedEditPayloads(baseline, resulting);
  assert.deepEqual(diff.categories, ['rest']);
  assert.equal(assertSavedEditScope(diff, ['rest']).permitted, true);
  assert.equal(diffSavedEditPayloads(baseline, baseline).changed, false);
  for (const value of [{ bad: true }, ['Gain Muscle']]) {
    assert.throws(() => diffSavedEditPayloads(payload([{ ...old, presetName: value }]), payload([old])), /scalar/);
  }
  assert.throws(() => diffSavedEditPayloads(payload([{ ...old, weights: null }]), payload([old])), /scalar/);
});

test('real preset conversions retain load-only scope including recognized old preset aliases', () => {
  const old = { ...action, groupId: 10, actionLibraryId: 101, templatePresetId: 5, presetId: 5, templatePresetName: 'Strength', presetName: 'Strength', templatePreset: 'Strength', preset: 'Strength',
    counterweight: '8,8', counterweight2: '8,8', completionMethod: '1,1', selectCompletionMethod: '1,1', countType: '1,1', capacity: 100 };
  const current = { id: 1, code: 'synthetic-alias-scope', name: 'Synthetic', deviceType: 1, totalCapacity: 100, actionLibraryList: [old] };
  const baseline = buildSavedTemplateUpdatePayload(current);
  const converted = applySmartRmConversions(current.actionLibraryList, [{ groupId: 10, actionLibraryId: 101, smartRmPresetName: 'Gain Muscle', sets: [{ unit: 'reps', reps: 8, rmLevel: 9 }, { unit: 'reps', reps: 8, rmLevel: 13 }] }], { primaryGoal: 'hipertrofia' });
  const smart = buildSavedTemplateUpdatePayload(current, { actionLibraryList: converted });
  const staticResult = buildSavedTemplateUpdatePayload(current, { actionLibraryList: [{ ...old, templatePresetId: -1, weights: '40,45', counterweight: '', counterweight2: '', staticLoadChanged: true }],
    staticLoadAuthorization: 'customize', displayUnit: 'kg', displayUnitVerified: true, staticLoadMetadataByAction: new Map([['10:101', { isUnilateral: false, isBarbell: true }]]) });
  for (const resulting of [smart, staticResult]) {
    const diff = diffSavedEditPayloads(baseline, resulting);
    assert.deepEqual(diff.categories, ['load']);
    assert.equal(assertSavedEditScope(diff, ['load']).permitted, true);
    assert.throws(() => assertSavedEditScope(diff, ['rest']), /load/);
    const unrelated = structuredClone(resulting); unrelated.actionLibraryList[0].unknownTechnique = 'changed';
    assert.throws(() => assertSavedEditScope(diffSavedEditPayloads(baseline, unrelated), ['load']), /unknown_metadata/);
  }
});

test('confirmed timed Vita aliases allow rest-only and load-only saved edits without widened scope', () => {
  const before = { ...action, templatePresetId: -1, weights: '0,0', setsAndReps: '30,8', completionMethod: '5,1', countType: '5,1', level: '12,27' };
  const wire = { ...before, completionMethod: '2,1', countType: '2,1' };
  const options = { exerciseMetadataByAction: new Map([['1:2', { dataStatTypeStatus: 'available', dataStatType: 6 }]]) };
  const original = structuredClone(before);
  const rest = diffSavedEditPayloads(payload([before]), payload([{ ...wire, breakTime: '45,90' }]), options);
  assert.deepEqual(rest.categories, ['rest']); assert.equal(assertSavedEditScope(rest, ['rest']).permitted, true);
  const load = diffSavedEditPayloads(payload([before]), payload([{ ...wire, level: '13,27' }]), options);
  assert.deepEqual(load.categories, ['load']); assert.equal(assertSavedEditScope(load, ['load']).permitted, true);
  assert.deepEqual(before, original);
  for (const changed of [{ ...wire, setsAndReps: '31,8' }, { ...wire, completionMethod: '1,1', countType: '1,1' }]) {
    assert.throws(() => assertSavedEditScope(diffSavedEditPayloads(payload([before]), payload([changed]), options), ['rest']), /dose/);
  }
  assert.throws(() => assertSavedEditScope(diffSavedEditPayloads(payload([before]), payload([{ ...wire, breakTime: '45,90' }])), ['rest']), /dose/);
});

test('bodyweight seconds aliases are equivalent but unrelated count metadata remains strict', () => {
  const before = { ...action, templatePresetId: -1, weights: '0,0', setsAndReps: '30,30', completionMethod: '0,0', countType: '0,0' };
  const after = { ...before, completionMethod: '2,2', countType: '2,2', breakTime: '45,90' };
  assert.deepEqual(diffSavedEditPayloads(payload([before]), payload([after])).categories, ['rest']);
  const repBefore = { ...before, setsAndReps: '8,8', completionMethod: '1,1', countType: '2,2' };
  const repAfter = { ...repBefore, countType: '1,1', breakTime: '45,90' };
  assert.throws(() => assertSavedEditScope(diffSavedEditPayloads(payload([repBefore]), payload([repAfter])), ['rest']), /dose/);
});
test('numeric CSV normalization does not broadcast or change shape', () => {
  assert.equal(diffSavedEditPayloads(payload([action]), payload([{ ...action, setsAndReps: '8.0, 8' }])).changed, false);
  assert.deepEqual(diffSavedEditPayloads(payload([action]), payload([{ ...action, setsAndReps: '8' }])).categories, ['dose']);
});
test('rest-only scope rejects unintended preset change', () => {
  const diff = diffSavedEditPayloads(payload([action]), payload([{ ...action, breakTime: '90,90', templatePresetId: 5 }]));
  assert.throws(() => assertSavedEditScope(diff, ['rest']), /load/);
  assert.equal(assertSavedEditScope(diff, ['rest', 'load']).permitted, true);
});

test('combined dose scopes preserve valid stored RM selectors without permitting changed execution identity', () => {
  const old = { ...action, completionMethod: '1,1', countType: '1,1', leftRight: '0,0',
    counterweight: '12,11', counterweight2: '12,11', capacity: 77 };
  const before = { ...payload([old]), totalCapacity: 77 };
  const next = { ...old, setsAndReps: '9,8', breakTime: '90,60',
    counterweight: '13,13', counterweight2: '13,13', capacity: 486.2 };
  const proposed = { ...payload([next]), totalCapacity: 486.2 };
  const options = { generatedPresetDefaults: true, allowedChanges: ['dose', 'rest'] };
  const original = structuredClone(proposed);
  const wire = reconcileSavedEditPayload(before, proposed, {}, options);
  assert.equal(wire.actionLibraryList[0].counterweight, '12,11');
  assert.equal(wire.actionLibraryList[0].counterweight2, '12,11');
  assert.equal(wire.actionLibraryList[0].capacity, 431.2);
  assert.equal(wire.totalCapacity, 431.2);
  assert.deepEqual(diffSavedEditPayloads(before, wire).categories, ['dose', 'rest']);
  assertSavedEditScope(diffSavedEditPayloads(before, wire), options.allowedChanges);
  assert.deepEqual(proposed, original, 'Scientific generated payload remains unchanged.');
  for (const changed of [
    { templatePresetId: 5, counterweight: '7,7', counterweight2: '7,7' },
    { actionLibraryId: 999 }, { groupId: 999 },
    { completionMethod: '2,2', countType: '2,2' },
    { leftRight: '1,2' },
    { setsAndReps: '9,8,8', completionMethod: '1,1,1', countType: '1,1,1', leftRight: '0,0,0', counterweight: '13,13,13', counterweight2: '13,13,13', weights: '3.5,3.5,3.5', breakTime: '90,60,60', sportMode: '1,1,1' },
  ]) {
    const altered = { ...proposed, actionLibraryList: [{ ...next, ...changed }] };
    const rejected = reconcileSavedEditPayload(before, altered, {}, options);
    assert.notEqual(rejected.actionLibraryList[0].counterweight, '12,11', 'No selector preservation for changed preset/variant/unit/side/count.');
    assert.throws(() => assertSavedEditScope(diffSavedEditPayloads(before, rejected), options.allowedChanges), /load|exercise_selection/);
  }
});
test('all executable removals are visible without guessed warmup classifiers', () => {
  const diff = diffSavedEditPayloads(payload([action, { ...action, groupId: 3 }]), payload([action]));
  assert.equal(diff.actions[0].differences[0].change, 'removed');
  assert.equal(diff.actions[0].old.groupId, 3);
  assert.deepEqual(diff.categories, ['exercise_selection']);
});
test('pure unique reorder is distinct from actual selection replacement', () => {
  const second = { ...action, groupId: 3 };
  const diff = diffSavedEditPayloads(payload([action, second]), payload([second, action]));
  assert.deepEqual(diff.categories, ['exercise_order']);
  assertSavedEditScope(diff, ['exercise_order']);
  const replacement = diffSavedEditPayloads(payload([action, second]), payload([second, { ...action, groupId: 999 }]));
  assert.ok(replacement.categories.includes('exercise_selection'));
  assert.throws(() => assertSavedEditScope(replacement, ['exercise_order']), /exercise_selection/);
});
test('unknown metadata requires explicit scope without leaking values', () => {
  const diff = diffSavedEditPayloads(payload([{ ...action, password: 'SECRET-A' }]), payload([{ ...action, password: 'SECRET-B' }]));
  assert.throws(() => assertSavedEditScope(diff, ['rest']), /unknown_metadata/);
  assert.equal(JSON.stringify(diff).includes('SECRET'), false);
  assert.equal(JSON.stringify(diff).includes('password'), false);
});
test('scope requires unique nonempty known categories', () => {
  const diff = diffSavedEditPayloads(payload([action]), payload([action]));
  for (const scope of [[], ['rest', 'rest'], ['full_replacement']]) assert.throws(() => assertSavedEditScope(diff, scope));
});
test('oversized and complex known fields fail without omission', () => {
  assert.throws(() => diffSavedEditPayloads(payload(Array(501).fill(action)), payload([])), /bounded/);
  assert.throws(() => diffSavedEditPayloads(payload([{ ...action, weights: { token: 'SECRET' } }]), payload([])), /scalar/);
});
