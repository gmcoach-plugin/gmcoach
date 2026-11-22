import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPresetPayload } from '../program-serialization.mjs';
import { buildSavedTemplateUpdatePayload, verifyCreatedTemplateReadback, verifyUpdatedTemplateReadback } from '../saved-templates.mjs';
import { diffSavedEditPayloads, assertSavedEditScope, reconcileSavedEditPayload } from '../saved-edit-diff.mjs';

const protocols = ['legacy-reference-client-wire-lb-get-kg', 'account-unit-verbatim'];
const metadata = new Map([[42, { detail: { isLeftRight: 0, isBarbell: 0 }, batch: { actionLibraryList: [{ id: 142 }] } }]]);
function saved(payload, protocol) {
  const result = { ...structuredClone(payload), id: 42, code: 'synthetic-protocol' };
  if (protocol === protocols[0]) for (const action of result.actionLibraryList) {
    if (action.templatePresetId === -1) action.weights = action.weights.split(',').map(value => Number(value) / 2.2).join(',');
  }
  return result;
}
for (const staticLoadProtocol of protocols) for (const accountUnit of ['kg', 'lb']) {
  test(`shared Customize readback matches actual fresh fixed-load serializer: ${staticLoadProtocol}/${accountUnit}`, () => {
    const exercise = { id: 42, title: 'Synthetic', loadType: 'fixed-kg', fixedKgAuthorized: true,
      sets: [8, 8].map(reps => ({ unit: 'reps', reps, weightKg: 50, mode: 1, rest: 90 })) };
    const { payload } = buildPresetPayload({ name: 'Units', exercises: [exercise] }, metadata, 1, accountUnit, { staticLoadProtocol });
    const readback = saved(payload, staticLoadProtocol);
    readback.actionLibraryList[0].weights = readback.actionLibraryList[0].weights.split(',')[0];
    readback.actionLibraryList[0].capacity = 123; readback.totalCapacity = 123;
    const baseline = buildSavedTemplateUpdatePayload(readback, { staticLoadProtocol, displayUnit: accountUnit });
    exercise.sets.forEach(set => { set.rest = 120; });
    const fresh = buildPresetPayload({ name: 'Units', exercises: [exercise] }, metadata, 1, accountUnit, { staticLoadProtocol }).payload;
    const proposed = { ...baseline, ...fresh, id: baseline.id, code: baseline.code };
    const reconciled = reconcileSavedEditPayload(baseline, proposed);
    assert.deepEqual(diffSavedEditPayloads(baseline, reconciled).categories, ['rest']);
    assert.equal(reconciled.totalCapacity, 123);
    assert.equal(assertSavedEditScope(diffSavedEditPayloads(baseline, reconciled), ['rest']).permitted, true);
    assert.equal(verifyUpdatedTemplateReadback({ expectedPayload: reconciled, readback: saved(reconciled, staticLoadProtocol), expectedCode: readback.code, staticLoadProtocol, accountUnit }).verified, true);
    for (const weights of ['110,111', '110,,110', 'NaN', '-1', '110,110,110']) {
      const changed = structuredClone(proposed); changed.actionLibraryList[0].weights = weights;
      assert.throws(() => assertSavedEditScope(diffSavedEditPayloads(baseline, changed), ['rest']), /load/);
    }
  });
  test(`distinct Customize set loads survive rest-only replacement: ${staticLoadProtocol}/${accountUnit}`, () => {
    const exercise = { id: 42, title: 'Synthetic', loadType: 'profile-auto',
      strengthAnchor: { oneRepMax: 100, unit: accountUnit, source: 'local-training-profile' },
      sets: [8, 12, 20].map(reps => ({ unit: 'reps', reps, mode: 1, rest: 90 })) };
    const { payload } = buildPresetPayload({ name: 'Units', exercises: [exercise] }, metadata, 1, accountUnit, { staticLoadProtocol });
    const readback = saved(payload, staticLoadProtocol);
    readback.actionLibraryList[0].capacity = 123;
    readback.totalCapacity = 123;
    const baseline = buildSavedTemplateUpdatePayload(readback, { staticLoadProtocol, displayUnit: accountUnit });
    const changed = structuredClone(readback.actionLibraryList);
    changed[0].breakTime = '120,150,90';
    const result = buildSavedTemplateUpdatePayload(readback, { actionLibraryList: changed, staticLoadProtocol, displayUnit: accountUnit });
    assert.equal(new Set(payload.actionLibraryList[0].weights.split(',')).size, 3);
    assert.equal(result.actionLibraryList[0].weights, payload.actionLibraryList[0].weights);
    assert.equal(result.actionLibraryList[0].templatePresetId, -1);
    assert.equal(result.actionLibraryList[0].counterweight, '');
    assert.equal(result.actionLibraryList[0].counterweight2, '');
    assert.equal(result.totalCapacity, 123);
    assert.equal(assertSavedEditScope(diffSavedEditPayloads(baseline, result), ['rest']).permitted, true);
    assert.equal(verifyUpdatedTemplateReadback({ expectedPayload: result, readback: saved(result, staticLoadProtocol), expectedCode: readback.code, staticLoadProtocol, accountUnit }).verified, true);
    const unauthorized = structuredClone(changed);
    unauthorized[0].weights = '50,50,50';
    assert.throws(() => buildSavedTemplateUpdatePayload(readback, { actionLibraryList: unauthorized, staticLoadProtocol, displayUnit: accountUnit }), /jawnego potwierdzenia/);
  });
  test(`real Customize creation, rename and changed edit readback: ${staticLoadProtocol}/${accountUnit}`, () => {
    const exercise = { id: 42, title: 'Synthetic', loadType: 'profile-auto',
      strengthAnchor: { oneRepMax: 100, unit: accountUnit, source: 'local-training-profile' },
      sets: [{ unit: 'reps', reps: 20, mode: 1, rest: 90 }] };
    const { payload } = buildPresetPayload({ name: 'Units', exercises: [exercise] }, metadata, 1, accountUnit, { staticLoadProtocol });
    const readback = saved(payload, staticLoadProtocol);
    assert.equal(verifyCreatedTemplateReadback({ expectedPayload: payload, readback, existingTemplateCodes: [], staticLoadProtocol, accountUnit }).verified, true);
    const rename = buildSavedTemplateUpdatePayload(readback, { name: 'Renamed', staticLoadProtocol, displayUnit: accountUnit });
    assert.equal(rename.actionLibraryList[0].weights, payload.actionLibraryList[0].weights);
    assert.equal(verifyUpdatedTemplateReadback({ expectedPayload: rename, readback: saved(rename, staticLoadProtocol), expectedCode: readback.code, staticLoadProtocol, accountUnit }).verified, true);
    const action = { ...readback.actionLibraryList[0], weights: '50', staticLoadChanged: true };
    const edited = buildSavedTemplateUpdatePayload(readback, { actionLibraryList: [action], staticLoadProtocol,
      displayUnit: accountUnit, displayUnitVerified: true, staticLoadAuthorization: 'customize',
      staticLoadMetadataByAction: new Map([['42:142', { isUnilateral: false, isBarbell: false }]]) });
    // lb: 50 lb snaps to the 22 kg device step (48.5 lb) like kg values do.
    const expected = staticLoadProtocol === protocols[0] ? accountUnit === 'kg' ? '110.0' : '48.4' : accountUnit === 'lb' ? '48.5' : '50.0';
    assert.equal(edited.actionLibraryList[0].weights, expected);
    assert.equal(verifyUpdatedTemplateReadback({ expectedPayload: edited, readback: saved(edited, staticLoadProtocol), expectedCode: readback.code, staticLoadProtocol, accountUnit }).verified, true);
    const manual = buildSavedTemplateUpdatePayload(readback, { actionLibraryList: [action], staticLoadProtocol, staticLoadIntent: 'canonical-kg',
      displayUnit: accountUnit, displayUnitVerified: true, staticLoadAuthorization: 'fixed-load',
      staticLoadMetadataByAction: new Map([['42:142', { isUnilateral: false, isBarbell: false }]]) });
    assert.equal(manual.actionLibraryList[0].weights, staticLoadProtocol === protocols[0] || accountUnit === 'lb' ? '110.0' : '50.0');
    assert.equal(verifyUpdatedTemplateReadback({ expectedPayload: manual, readback: saved(manual, staticLoadProtocol), expectedCode: readback.code, staticLoadProtocol, accountUnit }).verified, true);
    assert.throws(() => buildSavedTemplateUpdatePayload(readback, { actionLibraryList: [action], staticLoadProtocol, displayUnit: accountUnit }), /jawnego potwierdzenia/);
  });
}
test('verbatim requires explicit account unit; conflicting protocol fails readback verification', () => {
  const payload = { name: 'Units', totalCapacity: 400, actionLibraryList: [{ groupId: 42, actionLibraryId: 142, templatePresetId: -1,
    setsAndReps: '8', completionMethod: '1', countType: '1', selectCompletionMethod: '1', breakTime: '90', sportMode: '1',
    weights: '50.0', counterweight: '', counterweight2: '', capacity: 400 }] };
  const readback = saved(payload, protocols[1]);
  assert.throws(() => buildSavedTemplateUpdatePayload(readback, { staticLoadProtocol: protocols[1] }), /jednostki konta/);
  assert.equal(verifyCreatedTemplateReadback({ expectedPayload: payload, readback, existingTemplateCodes: [], staticLoadProtocol: protocols[1] }).verified, false);
  assert.equal(verifyUpdatedTemplateReadback({ expectedPayload: payload, readback, expectedCode: readback.code, staticLoadProtocol: protocols[0] }).verified, false);
});
