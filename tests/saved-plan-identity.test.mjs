import test from 'node:test';
import assert from 'node:assert/strict';
import { createSavedPlanIdentity, reconcileSavedPlanIdentity, createSavedEditOccurrenceMapping } from '../plugin/saved-plan-identity.mjs';
import { reconcileSavedEditPayload, diffSavedEditPayloads, assertSavedEditScope } from '../plugin/saved-edit-diff.mjs';
import { createHash } from 'node:crypto';
import { buildSavedTemplateUpdatePayload } from '../plugin/saved-templates.mjs';
import { validateExecutablePlanSections } from '../plugin/executable-plan-sections.mjs';
const fingerprint = 'a'.repeat(64);
const exercises = [{ id: 42, entryId: 101, section: 'warmup' }, { id: 42, entryId: 102, section: 'main' }, { id: 43, entryId: 103, section: 'stretching' }];
const plan = { exercises, warmup: { status: 'included', items: [{ executionRef: 101 }] }, postWorkoutStretching: { status: 'included', items: [{ executionRef: 103 }] } };
const entries = exercises.map(exercise => ({ exercise, sets: [] }));
const wire = { name: 'Synthetic', actionLibraryList: exercises.map(exercise => ({ groupId: exercise.id, actionLibraryId: 7, setsAndReps: '30', completionMethod: '2', weights: '0', breakTime: '30', sportMode: '1', capacity: 0 })) };

test('nonfinite undefined sparse and deeply nested metadata fail closed', () => {
  let deep = 'leaf';
  for (let index = 0; index < 15; index++) deep = { nested: deep };
  for (const value of [NaN, Infinity, undefined, Array(2), deep]) {
    const invalidWire = { ...wire, actionLibraryList: [{ ...wire.actionLibraryList[0], extra: value }, ...wire.actionLibraryList.slice(1)] };
    assert.throws(() => createSavedPlanIdentity(plan, entries, invalidWire, fingerprint), /metadata/);
  }
});
test('nested unknown metadata retains exact types despite execution-like key names', () => {
  const before = { ...wire, actionLibraryList: wire.actionLibraryList.map(action => ({ ...action, extra: { weights: '8.0' } })) };
  const identity = createSavedPlanIdentity(plan, entries, before, fingerprint);
  const after = { ...wire, actionLibraryList: wire.actionLibraryList.map(action => ({ ...action, extra: { weights: 8 } })) };
  assert.equal(reconcileSavedPlanIdentity(identity, after, fingerprint).status, 'stale');
});
test('fingerprint objects and stringified stored mapping IDs are invalid', () => {
  assert.throws(() => createSavedPlanIdentity(plan, entries, wire, new String(fingerprint)), /fingerprint/);
  const identity = createSavedPlanIdentity(plan, entries, wire, fingerprint);
  identity.mappings[0].groupId = '42';
  assert.equal(reconcileSavedPlanIdentity(identity, wire, fingerprint).status, 'invalid');
});
test('round-trip preserves repeated catalog identities and sections', () => {
  const identity = createSavedPlanIdentity(plan, entries, wire, fingerprint);
  const result = reconcileSavedPlanIdentity(JSON.parse(JSON.stringify(identity)), wire, fingerprint);
  assert.equal(result.status, 'matched');
  assert.deepEqual(result.mappings.map(mapping => mapping.entryId), [101, 102, 103]);
  assert.deepEqual(result.mappings.map(mapping => mapping.groupId), [42, 42, 43]);
});
test('name and derived capacity are harmless while scalar CSV numerics normalize', () => {
  const identity = createSavedPlanIdentity(plan, entries, wire, fingerprint);
  const changed = { ...wire, name: 'Renamed', actionLibraryList: wire.actionLibraryList.map(action => ({ ...action, capacity: 900, weights: '0.0' })) };
  assert.equal(reconcileSavedPlanIdentity(identity, changed, fingerprint).status, 'matched');
});
test('external execution change, account change and unknown metadata invalidate links', () => {
  const identity = createSavedPlanIdentity(plan, entries, wire, fingerprint);
  for (const patch of [{ weights: '10' }, { completionMethod: '1' }, { setsAndReps: '30,30' }, { unknownTechnique: 1 }]) {
    const changed = { ...wire, actionLibraryList: [{ ...wire.actionLibraryList[0], ...patch }, ...wire.actionLibraryList.slice(1)] };
    assert.deepEqual(reconcileSavedPlanIdentity(identity, changed, fingerprint), { status: 'stale' });
  }
  assert.deepEqual(reconcileSavedPlanIdentity(identity, wire, 'b'.repeat(64)), { status: 'stale' });
});
test('missing invalid and mismatched identities never return mappings', () => {
  assert.deepEqual(reconcileSavedPlanIdentity(null, wire, fingerprint), { status: 'missing' });
  assert.deepEqual(reconcileSavedPlanIdentity({}, wire, fingerprint), { status: 'invalid' });
  assert.throws(() => createSavedPlanIdentity(plan, entries.slice(1), wire, fingerprint), /alignment/);
  assert.throws(() => createSavedPlanIdentity(plan, entries, wire, 'bad'), /fingerprint/);
});
test('repeated main entry permits superset rows with consistent actual variants', () => {
  const main = { id: 42, entryId: 101 };
  const mainPlan = { exercises: [main], warmup: { status: 'omitted_user_preference', items: [] }, postWorkoutStretching: { status: 'omitted_user_preference', items: [] } };
  const rows = [{ exercise: main, sets: [] }, { exercise: main, sets: [] }];
  const mainWire = { actionLibraryList: [wire.actionLibraryList[0], wire.actionLibraryList[0]] };
  assert.equal(createSavedPlanIdentity(mainPlan, rows, mainWire, fingerprint).mappings.length, 2);
  assert.throws(() => createSavedPlanIdentity(mainPlan, rows, { actionLibraryList: [wire.actionLibraryList[0], { ...wire.actionLibraryList[0], actionLibraryId: 8 }] }, fingerprint), /Inconsistent/);
});

test('MCP notes reconciliation hides stale refs and private fingerprints', async () => {
  const { readFileSync } = await import('node:fs');
  const vm = await import('node:vm');
  const source = readFileSync(new URL('../plugin/mcp_server.mjs', import.meta.url), 'utf8');
  const start = source.indexOf('function reconciledProgramCoachNotes(');
  const end = source.indexOf('async function savedEditOccurrenceContext', start);
  let status = 'stale';
  const helper = vm.runInNewContext(`(${source.slice(start, end).trim()})`, {
    reconcileSavedPlanIdentity: () => ({ status, mappings: [{ actionIndex: 0, entryId: 101, section: 'main', groupId: 42, actionLibraryId: 7 }] }),
    buildSavedTemplateUpdatePayload: template => template,
    validateExecutablePlanSections: () => ({ executableSectionsValidated: true })
  });
  const note = { savedPlanIdentity: { accountFingerprint: fingerprint }, warmup: { items: [{ executionRef: 101 }] }, postWorkoutStretching: { items: [] } };
  assert.equal(helper(note, wire, fingerprint).coachNotesIdentityStatus, 'stale');
  assert.equal(JSON.stringify(helper(note, wire, fingerprint)).includes('executionRef'), false);
  status = 'matched';
  const result = helper(note, wire, fingerprint);
  assert.equal(result.identityMappings[0].entryId, 101);
  assert.equal(JSON.stringify(result).includes('accountFingerprint'), false);
  assert.equal(JSON.stringify(result).includes(fingerprint), false);
  assert.match(source, /verifiedReadback: readback/);
  assert.match(source, /buildSavedTemplateUpdatePayload\(verifiedReadback, refreshedProgram\.staticLoadContext\)/);
  assert.match(source, /buildSavedTemplateUpdatePayload\(verified, staticLoadContext\), approvalEditFingerprint/);
});

test('version2 actual notes reconciliation survives only independently valid named RM shared markers', async () => {
  const { readFileSync } = await import('node:fs');
  const vm = await import('node:vm');
  const source = readFileSync(new URL('../plugin/mcp_server.mjs', import.meta.url), 'utf8');
  const start = source.indexOf('function reconciledProgramCoachNotes(');
  const end = source.indexOf('async function savedEditOccurrenceContext', start);
  const helper = vm.runInNewContext(`(${source.slice(start, end).trim()})`, { reconcileSavedPlanIdentity, buildSavedTemplateUpdatePayload, validateExecutablePlanSections });
  const localPlan = { exercises: [{ id: 42, actionLibraryId: 7, entryId: 101, section: 'main' }, { id: 42, actionLibraryId: 7, entryId: 102, section: 'main' }],
    warmup: { status: 'omitted_user_preference', items: [] }, postWorkoutStretching: { status: 'omitted_user_preference', items: [] } };
  const action = { groupId: 42, actionLibraryId: 7, templatePresetId: 1, weights: '3.5,3.5', counterweight: '12,12', counterweight2: '12,12', setsAndReps: '8,8', completionMethod: '1,1', countType: '1,1', sportMode: '1,1', leftRight: '0,0', breakTime: '60,60', breakTime2: '60,60', capacity: 100 };
  const template = { id: 8, code: 'identity-compression', name: 'Synthetic', deviceType: 1, totalCapacity: 200, actionLibraryList: [action, { ...action, counterweight: '11,11', counterweight2: '11,11' }] };
  const baseline = buildSavedTemplateUpdatePayload(template);
  const identity = createSavedPlanIdentity(localPlan, localPlan.exercises.map(exercise => ({ exercise })), baseline, fingerprint);
  assert.equal(identity.version, 4);
  // This all-RM fixture has the same v2 digest; keep explicit legacy coverage.
  identity.version = 2;
  const note = { savedPlanIdentity: identity, warmup: localPlan.warmup, postWorkoutStretching: localPlan.postWorkoutStretching };
  const compressed = structuredClone(template);
  for (const row of compressed.actionLibraryList) { row.weights = 3.5; row.counterweight = Number(row.counterweight.split(',')[0]); row.counterweight2 = row.counterweight; }
  assert.equal(helper(note, compressed, fingerprint).coachNotesIdentityStatus, 'matched');
  for (const patch of [{ presetName: 'Strength' }, { presetName: true }, { weights: '4' }, { counterweight2: '10' }, { counterweight: '10', counterweight2: '10' }, { completionMethod: '2,2', countType: '2,2' }]) {
    const changed = structuredClone(compressed);
    Object.assign(changed.actionLibraryList[0], patch);
    assert.notEqual(helper(note, changed, fingerprint).coachNotesIdentityStatus, 'matched', JSON.stringify(patch));
  }
  const strictDigest = payload => createHash('sha256').update(JSON.stringify(payload.actionLibraryList.map(row => Object.fromEntries(Object.keys(row).filter(key => !['name', 'title', 'image', 'imageUrl', 'thumbnail', 'capacity'].includes(key)).sort().map(key => [key, String(row[key]).split(',').map(Number)]))))).digest('hex');
  const legacy = { ...identity, version: 1, executionDigest: strictDigest(baseline) };
  const preservedLegacy = JSON.stringify(legacy);
  assert.equal(reconcileSavedPlanIdentity(legacy, baseline, fingerprint).status, 'matched');
  assert.equal(helper({ ...note, savedPlanIdentity: legacy }, compressed, fingerprint).coachNotesIdentityStatus, 'stale');
  assert.equal(JSON.stringify(legacy), preservedLegacy);
});

test('version3 actual notes and baseline preserve static compression while legacy digests stay strict', async () => {
  const { readFileSync } = await import('node:fs');
  const vm = await import('node:vm');
  const source = readFileSync(new URL('../plugin/mcp_server.mjs', import.meta.url), 'utf8');
  const start = source.indexOf('function reconciledProgramCoachNotes('), end = source.indexOf('async function savedEditOccurrenceContext', start);
  const helper = vm.runInNewContext(`(${source.slice(start, end).trim()})`, { reconcileSavedPlanIdentity, buildSavedTemplateUpdatePayload, validateExecutablePlanSections });
  const localPlan = { exercises: [{ id: 42, actionLibraryId: 7, entryId: 101, section: 'main' }], warmup: { status: 'omitted_user_preference', items: [] }, postWorkoutStretching: { status: 'omitted_user_preference', items: [] } };
  const action = { groupId: 42, actionLibraryId: 7, templatePresetId: -1, weights: '8,8', counterweight: '', counterweight2: '', setsAndReps: '8,8', completionMethod: '1,1', countType: '1,1', sportMode: '1,1', breakTime: '60,60', capacity: 123 };
  const template = { id: 8, code: 'static-identity', name: 'Static', totalCapacity: 123, actionLibraryList: [action] };
  const context = { staticLoadProtocol: 'account-unit-verbatim', displayUnit: 'kg' };
  const baseline = buildSavedTemplateUpdatePayload(template, context);
  const identity = createSavedPlanIdentity(localPlan, [{ exercise: localPlan.exercises[0] }], baseline, fingerprint);
  assert.equal(identity.version, 4);
  identity.version = 3;
  const note = { savedPlanIdentity: identity, warmup: localPlan.warmup, postWorkoutStretching: localPlan.postWorkoutStretching };
  for (const weights of [8, '8', '8.0,8.00']) {
    const compressed = { ...template, actionLibraryList: [{ ...action, weights }] };
    assert.equal(helper(note, compressed, fingerprint, context).coachNotesIdentityStatus, 'matched');
    for (const patch of [{ weights: '8,9' }, { weights: '8,,8' }, { weights: '2201' }, { counterweight: '1' }, { presetId: 1 }, { presetName: 'Strength' }, { presetName: true }, { completionMethod: undefined, countType: undefined }]) {
      const changed = { ...compressed, actionLibraryList: [{ ...compressed.actionLibraryList[0], ...patch }] };
      assert.notEqual(helper(note, changed, fingerprint, context).coachNotesIdentityStatus, 'matched');
    }
  }
  const strict = createHash('sha256').update(JSON.stringify(baseline.actionLibraryList.map(row => Object.fromEntries(Object.keys(row).filter(key => !['name', 'title', 'image', 'imageUrl', 'thumbnail', 'capacity'].includes(key)).sort().map(key => [key, typeof row[key] === 'string' && row[key] === '' ? '' : String(row[key]).split(',').map(Number)]))))).digest('hex');
  for (const version of [1, 2]) {
    const legacy = { ...identity, version, executionDigest: strict };
    assert.equal(reconcileSavedPlanIdentity(legacy, baseline, fingerprint).status, 'matched');
    assert.equal(reconcileSavedPlanIdentity(legacy, { ...baseline, actionLibraryList: [{ ...baseline.actionLibraryList[0], weights: 8 }] }, fingerprint).status, 'stale');
  }
});

for (const presetId of [-1, 1]) test(`v4 actual notes and duplicate reorder recognize homogeneous completion compression preset ${presetId}`, async () => {
  const { readFileSync } = await import('node:fs');
  const vm = await import('node:vm');
  const source = readFileSync(new URL('../plugin/mcp_server.mjs', import.meta.url), 'utf8');
  const start = source.indexOf('function reconciledProgramCoachNotes('), end = source.indexOf('async function savedEditOccurrenceContext', start);
  const notes = vm.runInNewContext(`(${source.slice(start, end).trim()})`, { reconcileSavedPlanIdentity, buildSavedTemplateUpdatePayload, validateExecutablePlanSections });
  const omitted = { status: 'omitted_user_preference', items: [] };
  const localPlan = { exercises: [101, 102].map(entryId => ({ id: 42, actionLibraryId: 7, entryId, section: 'main' })), warmup: omitted, postWorkoutStretching: omitted };
  const actions = localPlan.exercises.map((_, index) => ({ groupId: 42, actionLibraryId: 7, templatePresetId: presetId, weights: presetId === -1 ? `${8 + index},${8 + index}` : '3.5,3.5', counterweight: presetId === -1 ? '' : `${12 - index},${12 - index}`, counterweight2: presetId === -1 ? '' : `${12 - index},${12 - index}`, setsAndReps: '8,8', completionMethod: '1,1', countType: '1,1', sportMode: '1,1', breakTime: '60,60', capacity: 123 + index }));
  const context = { staticLoadProtocol: 'account-unit-verbatim', displayUnit: 'kg' };
  const template = { id: 8, code: 'completion-identity', name: 'Completion', totalCapacity: 247, actionLibraryList: actions };
  const baseline = buildSavedTemplateUpdatePayload(template, context);
  const entries = value => value.exercises.map(exercise => ({ exercise }));
  const identity = createSavedPlanIdentity(localPlan, entries(localPlan), baseline, fingerprint);
  assert.equal(identity.version, 4);
  const note = { savedPlanIdentity: identity, warmup: omitted, postWorkoutStretching: omitted };
  for (const completionMethod of [1, '1']) {
    const compressed = { ...template, actionLibraryList: actions.map(action => ({ ...action, completionMethod })) };
    assert.equal(notes(note, compressed, fingerprint, context).coachNotesIdentityStatus, 'matched');
    const compressedBaseline = buildSavedTemplateUpdatePayload(compressed, context);
    for (const version of [1, 2, 3]) {
      const legacy = { ...identity, version };
      assert.equal(reconcileSavedPlanIdentity(legacy, baseline, fingerprint).status, 'matched');
      assert.equal(reconcileSavedPlanIdentity(legacy, compressedBaseline, fingerprint).status, 'stale');
    }
    const nextPlan = { ...localPlan, exercises: [...localPlan.exercises].reverse() };
    const proposed = { ...baseline, actionLibraryList: [...actions].reverse().map(action => ({ ...action, capacity: 999 })) };
    const mapping = createSavedEditOccurrenceMapping(identity, compressedBaseline, nextPlan, entries(nextPlan), proposed, fingerprint);
    const mapped = { ...context, savedEditOccurrenceMapping: mapping };
    const result = reconcileSavedEditPayload(compressedBaseline, proposed, mapped, { allowedChanges: ['exercise_order'], generatedPresetDefaults: true });
    assert.deepEqual(result.actionLibraryList.map(action => action.capacity), [124, 123]);
    assert.equal(assertSavedEditScope(diffSavedEditPayloads(compressedBaseline, result, mapped), ['exercise_order']).permitted, true);
    for (const patch of [{ completionMethod: '1,2' }, { completionMethod: '2' }, { completionMethod: '1,1,1' }, { unit: 'seconds' }, { presetId: presetId === -1 ? 1 : 5 }, { presetName: true }]) {
      const changed = { ...compressed, actionLibraryList: [{ ...compressed.actionLibraryList[0], ...patch }, compressed.actionLibraryList[1]] };
      assert.notEqual(notes(note, changed, fingerprint, context).coachNotesIdentityStatus, 'matched', JSON.stringify(patch));
    }
  }
  if (presetId === -1) {
    const mixed = { ...baseline, actionLibraryList: baseline.actionLibraryList.map(action => ({ ...action, completionMethod: '1,2' })) };
    const mixedIdentity = createSavedPlanIdentity(localPlan, entries(localPlan), mixed, fingerprint);
    const homogeneous = { ...mixed, actionLibraryList: mixed.actionLibraryList.map(action => ({ ...action, completionMethod: 1 })) };
    assert.equal(reconcileSavedPlanIdentity(mixedIdentity, homogeneous, fingerprint).status, 'stale');
  }
});

test('version2 does not broadcast RM markers without independently confirmed rep units', () => {
  const localPlan = { exercises: [{ id: 42, actionLibraryId: 7, entryId: 101, section: 'main' }], warmup: { status: 'omitted_user_preference', items: [] }, postWorkoutStretching: { status: 'omitted_user_preference', items: [] } };
  const action = { groupId: 42, actionLibraryId: 7, templatePresetId: 1, weights: '3.5,3.5', counterweight: '12,12', counterweight2: '12,12', setsAndReps: '8,8', completionMethod: '2,2' };
  const expanded = { actionLibraryList: [action] };
  const identity = createSavedPlanIdentity(localPlan, [{ exercise: localPlan.exercises[0] }], expanded, fingerprint);
  const compressed = { actionLibraryList: [{ ...action, weights: '3.5', counterweight: '12', counterweight2: '12' }] };
  assert.equal(reconcileSavedPlanIdentity(identity, compressed, fingerprint).status, 'stale');
});

