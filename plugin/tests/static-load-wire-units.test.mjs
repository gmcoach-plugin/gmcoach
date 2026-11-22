import test from 'node:test';
import assert from 'node:assert/strict';
import { formatAccountLoadForWire, formatWireDecimal } from '../static-load-wire-units.mjs';
import { formatDisplayWeightForApi, formatFixedKgForApi, buildExerciseLoadPayload } from '../program-payload.mjs';
import { buildPresetPayload } from '../program-serialization.mjs';
import { buildSavedTemplateUpdatePayload } from '../saved-templates.mjs';
import { quantizeCustomizeLoad } from '../customize-load-step.mjs';

function editedWire(lb) {
  const action = { groupId: 42, actionLibraryId: 142, templatePresetId: -1,
    setsAndReps: '20', completionMethod: '1', weights: '20', counterweight: '', counterweight2: '', sportMode: '1' };
  const template = { id: 42, code: 'synthetic', name: 'Units', deviceType: 1, totalCapacity: 400, actionLibraryList: [action] };
  return buildSavedTemplateUpdatePayload(template, {
    actionLibraryList: [{ ...action, weights: String(lb), staticLoadChanged: true }],
    staticLoadAuthorization: 'customize', displayUnit: 'lb', displayUnitVerified: true,
    staticLoadMetadataByAction: new Map([['42:142', { isUnilateral: lb <= 110, isBarbell: false }]])
  }).actionLibraryList[0].weights;
}
test('wire formatting matches independently captured Python f-string boundary outputs', () => {
  const captured = [[1.25,'2.8'],[3.75,'8.2'],[6.25,'13.8'],[8.75,'19.2'],[11.25,'24.8'],[13.75,'30.3'],[16.25,'35.8'],[18.75,'41.2']];
  for (const [kg, token] of captured) {
    assert.equal(formatWireDecimal(kg * 2.2), token);
    assert.equal(formatFixedKgForApi(kg, 'kg'), token);
    assert.equal(formatAccountLoadForWire(kg, 'kg'), token);
  }
});

test('all integer imperial inputs 8–220 use reference client half-kg normalization', () => {
  for (let lb = 8; lb <= 220; lb++) {
    const expected = (Math.round((Math.round(lb / 2.2 * 2) / 2) * 2.2 * 10) / 10).toFixed(1);
    assert.equal(formatAccountLoadForWire(lb, 'lb'), expected);
    assert.equal(formatDisplayWeightForApi(lb, 'lb'), expected);
    // Explicit edits snap to the device kg step first (lb mirrors kg), then use the same wire normalization.
    assert.equal(editedWire(lb), formatAccountLoadForWire(quantizeCustomizeLoad(lb, 'lb', 'floor'), 'lb'));
  }
  assert.equal(formatDisplayWeightForApi(50, 'lb'), '49.5');
  assert.equal(formatDisplayWeightForApi(50, 'kg'), '110.0');
  assert.equal(formatFixedKgForApi(50, 'lb'), '110.0');
  assert.equal(formatAccountLoadForWire(0, 'lb'), '0.0');
  for (const invalid of [NaN, Infinity, -1, '50']) assert.throws(() => formatAccountLoadForWire(invalid, 'lb'));
  assert.throws(() => formatAccountLoadForWire(50, 'unknown'));
});

test('real Customize serializer and explicit edit agree for suggested 50 lb', () => {
  const exercise = { id: 42, title: 'Synthetic', loadType: 'profile-auto',
    strengthAnchor: { oneRepMax: 100, unit: 'lb', source: 'local-training-profile' },
    sets: [{ unit: 'reps', reps: 20, mode: 1, rest: 90 }] };
  const metadata = new Map([[42, { detail: { isLeftRight: 0, isBarbell: 0 }, batch: { actionLibraryList: [{ id: 142 }] } }]]);
  const wire = buildPresetPayload({ name: 'Units', exercises: [exercise] }, metadata, 1, 'lb').payload.actionLibraryList[0].weights;
  assert.equal(wire, '50.6'); // reference client 50 lb -> nearest device step 23 kg = 50.7 lb
  assert.equal(wire, editedWire(50.7));
});

test('fractional fixed load creation and edit use unrounded reference client capacity', () => {
  const metadata = new Map([[42, { detail: { isLeftRight: 0, isBarbell: 0 }, batch: { actionLibraryList: [{ id: 142 }] } }]]);
  const plan = { name: 'Fractional', exercises: [{ id: 42, title: 'Synthetic', loadType: 'fixed-kg', fixedKgAuthorized: true, sets: [{ unit: 'reps', reps: 8, weightKg: 3.75, mode: 1, rest: 90 }] }] };
  // Fractional API readback is valid for preservation; new presets still enforce reference client 0.5kg steps.
  assert.throws(() => buildPresetPayload(plan, metadata, 1, 'kg'), /step 0.5/);
  const created = buildExerciseLoadPayload('fixed-kg', plan.exercises[0].sets, { fixedKgAuthorized: true, displayUnit: 'kg' });
  assert.equal(created.weights, '8.2');
  assert.equal(created.capacity, 66);
  const action = { groupId: 42, actionLibraryId: 142, templatePresetId: -1, setsAndReps: '8', completionMethod: '1', weights: '3.75', counterweight: '', counterweight2: '', sportMode: '1', capacity: 123456 };
  const template = { id: 42, code: 'fractional', name: 'Fractional', deviceType: 1, totalCapacity: 66, actionLibraryList: [action] };
  const renamed = buildSavedTemplateUpdatePayload(template, { name: 'Renamed' });
  assert.equal(renamed.actionLibraryList[0].weights, '8.2');
  const edited = buildSavedTemplateUpdatePayload(template, { actionLibraryList: [action] });
  assert.equal(edited.actionLibraryList[0].capacity, 66);
  assert.equal(edited.totalCapacity, 66);
});

test('unrounded capacity adapter rejects RM and preserves protocol-specific units', async () => {
  const { staticLoadBeforeWireRounding } = await import('../static-load-protocol.mjs');
  for (const accountUnit of ['kg', 'lb']) {
    assert.equal(staticLoadBeforeWireRounding({ protocol: 'legacy-reference-client-wire-lb-get-kg', load: 3.75, loadUnit: 'kg', accountUnit, loadIntent: 'canonical-kg' }), 8.25);
  }
  assert.ok(Math.abs(staticLoadBeforeWireRounding({ protocol: 'legacy-reference-client-wire-lb-get-kg', load: 50, loadUnit: 'lb', accountUnit: 'lb', loadIntent: 'account-customize' }) - 49.5) < 1e-12);
  assert.equal(staticLoadBeforeWireRounding({ protocol: 'account-unit-verbatim', load: 3.75, loadUnit: 'kg', accountUnit: 'kg', loadIntent: 'canonical-kg' }), 3.75);
  assert.equal(staticLoadBeforeWireRounding({ protocol: 'account-unit-verbatim', load: 3.75, loadUnit: 'kg', accountUnit: 'lb', loadIntent: 'canonical-kg' }), 8.25);
  assert.throws(() => staticLoadBeforeWireRounding({ protocol: 'legacy-reference-client-wire-lb-get-kg', load: 3.5, loadUnit: 'kg', accountUnit: 'kg', loadIntent: 'canonical-kg', presetId: 1 }), /Smart RM/);
});
