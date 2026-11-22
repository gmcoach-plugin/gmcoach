import { normalizePreferenceReviews, preferenceReviewsSchema } from '../preference-compliance.mjs';
import { normalizeRecoveryContextDeclaration } from '../recovery-context.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import * as payloadFunctions from '../program-payload.mjs';
import { buildPresetPayload } from '../program-serialization.mjs';
import { verifyCreatedTemplateReadback } from '../saved-templates.mjs';
import { resolveGoalBoundSmartRmPresetName } from '../goal-preset-routing.mjs';
import { getReferenceClientRmPresetByName } from '../preset-mapping.mjs';
import { normalizeExerciseEntry, validateExecutablePlanSections } from '../executable-plan-sections.mjs';

const source = readFileSync(new URL('../mcp_server.mjs', import.meta.url), 'utf8');
const start = source.indexOf('function normalizePlan(');
const end = source.indexOf('\nfunction assertQuickTestProgramShape', start);
assert.ok(start >= 0 && end > start);
// Exercise the complete real normalizer with scientific/catalog services isolated;
// load selection and its account/wire conversion remain real module functions.
const normalize = vm.runInNewContext(`(${source.slice(start, end).trim()})`, {
  ...payloadFunctions, normalizeRecoveryContextDeclaration, normalizePreferenceReviews,
  resolveGoalBoundSmartRmPresetName,
  getReferenceClientRmPresetByName,
  classifyPrescriptionUnit: unit => ['sec', 'seconds'].includes(unit) ? 'seconds' : 'reps',
  normalizeExerciseEntry, validateExecutablePlanSections,
  normalizeTrainingEvidence: (rationale, evidence) => ({ rationale, evidence }),
  resolveProfileStrengthAnchor: ({ providedAnchor }) => providedAnchor,
  isSupportedCustomizeAnchorSource: source => source === 'speediance-reported',
  isWritableResistanceMode: mode => [1, 2, 3].includes(mode),
  normalizeSupersetBlocks: () => [],
  normalizeEvidencePlanItems: (warmup, postWorkoutStretching) => ({ warmup, postWorkoutStretching }),
  normalizeEvidenceCoverage: () => [],
  assertNoUnserializedTechniqueInstructions: () => {}
});

const scienceSource = readFileSync(new URL('../training-evidence.mjs', import.meta.url), 'utf8');
const scienceStart = scienceSource.indexOf('function setDecisionValue(');
const baseStart = scienceSource.indexOf('function baseSetDecisionValue(', scienceStart);
const scienceEnd = scienceSource.indexOf('\nfunction ', baseStart + 1);
const scientificPrescription = vm.runInNewContext(`${scienceSource.slice(scienceStart, scienceEnd)}; setDecisionValue`, { ...payloadFunctions });
const htmlStart = source.indexOf('function approvalPage(');
const htmlEnd = source.indexOf('\nasync function handleApprovalRequest', htmlStart);
const html = vm.runInNewContext(`(${source.slice(htmlStart, htmlEnd).trim()})`, {
  escapeHtml: value => String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;'),
  RESISTANCE_MODES: { 1: 'Standard', 3: 'Eccentric' }, setupPage: (_title, _message, form) => form,
});
const metadata = new Map([[42, { detail: { isLeftRight: 1, isBarbell: 0 }, batch: { isLeftRight: 1, isBarbell: 0, actionLibraryList: [{ id: 142 }] } }]]);

function input(loadType, unit = 'kg') {
  return { name: 'Synthetic side audit', recoveryContext: {status:'not_requested',limitations:['Synthetic unilateral fixture does not read reported health data.']}, rationale: 'Synthetic regression only', evidence: [], scienceGate: 'user_declined', showCalculatedLoads: true,
    warmup: { status: 'omitted_user_preference', items: [] }, postWorkoutStretching: { status: 'omitted_user_preference', items: [] },
    exercises: [{ id: 42, title: 'Confirmed unilateral movement', unilateralPrescription: 'explicit-sides', loadType,
      ...(loadType === 'fixed-kg' ? { userRequestedFixedKg: true } : {}),
      ...(loadType === 'profile-auto' ? { userRequestedReferenceClientCustomize: true, strengthAnchor: { oneRepMax: 50, unit, source: 'speediance-reported' } } : {}),
      ...(loadType === 'smart-rm' ? { smartRmPresetName: 'Gain Muscle', smartRmPresetId: 1 } : {}),
      sets: [
        { side: 1, unit: 'reps', reps: 12, rirTarget: 2, mode: 1, restSeconds: 15, ...(loadType === 'fixed-kg' ? { weightKg: 35 } : {}) },
        { side: 2, unit: 'reps', reps: 10, rirTarget: 2, mode: 3, restSeconds: 60, ...(loadType === 'fixed-kg' ? { weightKg: 30 } : {}) },
      ] }],
  };
}
test('actual approval copy matches normalized executable warmup/main/stretch serializer order', () => {
  const raw = input('fixed-kg');
  raw.warmup = { status: 'included', items: [{ activity: 'Synthetic warmup', dosage: '30 s', executionRef: 41 }] };
  raw.postWorkoutStretching = { status: 'included', items: [{ target: 'Synthetic stretch', method: 'static', dosage: '30 s', instructions: 'Synthetic only', executionRef: 43 }] };
  const timed = (id, section) => ({ id, entryId: id, section, title: `Synthetic ${section}`, loadType: 'bodyweight', sets: [{ unit: 'sec', durationSeconds: 30, mode: 1, restSeconds: 15 }] });
  raw.exercises = [timed(41, 'warmup'), raw.exercises[0], timed(43, 'stretching')];
  const normalized = normalize(raw);
  const catalog = new Map(metadata);
  for (const id of [41, 43]) catalog.set(id, { detail: { isLeftRight: 0, isBarbell: 0 }, batch: { isLeftRight: 0, isBarbell: 0, actionLibraryList: [{ id: id + 100 }] } });
  const { payload } = buildPresetPayload(normalized, catalog, 1, 'kg');
  assert.deepEqual(payload.actionLibraryList.map(action => action.groupId), [41, 42, 43]);
  assert.equal(payload.actionLibraryList[0].completionMethod, '2');
  assert.equal(payload.actionLibraryList[2].setsAndReps, '30');
  const rendered = html({ plan: normalized, preview: {}, profile: 'synthetic', payload });
  assert.match(rendered, /rozgrzewka i rozciąganie są zapisywane jako ćwiczenia w szablonie Speediance/);
  assert.doesNotMatch(rendered, /tylko ćwiczenia głównej listy|te sekcje nie trafiają/);
  assert.match(rendered, /API nie zwraca osobnego ID grupy superserii/);
  assert.match(rendered, /Speediance nie otrzymuje osobnego pola intensywności per seria/);
});
for (const loadType of ['fixed-kg', 'profile-auto', 'smart-rm']) for (const accountUnit of ['kg', 'lb']) {
  test(`actual side normalizer, scientific prescription, approval, serializer and saved verifier: ${loadType}/${accountUnit}`, () => {
    const normalized = normalize(input(loadType, accountUnit));
    const exercise = normalized.exercises[0];
    assert.equal(exercise.unilateralPrescription, 'explicit-sides');
    assert.deepEqual(Array.from(exercise.sets, set => set.side), [1, 2]);
    for (const [index, set] of exercise.sets.entries()) for (const category of ['set_work_dose', 'set_load', 'set_effort_rir', 'set_resistance_mode', 'set_rest_interval']) {
      const decision = scientificPrescription(exercise, set, category);
      assert.ok(decision.includes(`unilateralPrescription=explicit-sides;side=${index + 1}`));
      assert.throws(() => scientificPrescription(exercise, { ...set, side: 0 }, category), /side/);
    }
    const rendered = html({ plan: normalized, preview: { showCalculatedLoads: true }, profile: 'synthetic', payload: { name: normalized.name } });
    assert.match(rendered, /Lewa · 12 powt/); assert.match(rendered, /Prawa · 10 powt/);
    if (loadType === 'fixed-kg') { assert.match(rendered, /35 kg/); assert.match(rendered, /30 kg/); }
    for (const staticLoadProtocol of ['legacy-reference-client-wire-lb-get-kg', 'account-unit-verbatim']) {
      const { payload } = buildPresetPayload(normalized, metadata, 1, accountUnit, { staticLoadProtocol });
      const action = payload.actionLibraryList[0];
      assert.equal(action.leftRight, '1,2'); assert.equal(action.setsAndReps, '12,10');
      assert.equal(action.breakTime, '15,60'); assert.equal(action.sportMode, '1,3');
      assert.equal(action.weights.split(',').length, 2);
      const readback = { ...structuredClone(payload), id: 42, code: 'synthetic-side' };
      if (staticLoadProtocol === 'legacy-reference-client-wire-lb-get-kg' && loadType !== 'smart-rm') readback.actionLibraryList[0].weights = action.weights.split(',').map(value => Number(value) / 2.2).join(',');
      assert.equal(verifyCreatedTemplateReadback({ expectedPayload: payload, readback, existingTemplateCodes: [], staticLoadProtocol, accountUnit }).verified, true);
      const altered = structuredClone(readback); altered.actionLibraryList[0].leftRight = '2,1';
      assert.equal(verifyCreatedTemplateReadback({ expectedPayload: payload, readback: altered, existingTemplateCodes: [], staticLoadProtocol, accountUnit }).verified, false);
    }
  });
}

test('actual side normalizer rejects incomplete/reversed/implicit side prescriptions', () => {
  const partial = input('fixed-kg'); partial.exercises[0].sets.pop(); assert.throws(() => normalize(partial), /pełnych par/);
  const reversed = input('fixed-kg'); reversed.exercises[0].sets.reverse(); assert.throws(() => normalize(reversed), /pełnych par/);
  const implicit = input('fixed-kg'); delete implicit.exercises[0].unilateralPrescription; assert.throws(() => normalize(implicit), /explicit-sides/);
});

test('actual normalizer resolves omitted global preset IDs before real scientific load binding', () => {
  for (const [presetName, presetId, reps] of [['Gain Muscle', 1, 10], ['Strength', 5, 5], ['Stamina', 3, 15]]) {
    for (const includeId of [false, true]) {
      const raw = input('smart-rm'); const exercise = raw.exercises[0];
      exercise.smartRmPresetName = presetName;
      if (includeId) exercise.smartRmPresetId = presetId; else delete exercise.smartRmPresetId;
      exercise.sets.forEach(set => set.reps = reps);
      const normalized = normalize(raw).exercises[0];
      assert.equal(normalized.smartRmPresetId, presetId);
      const value = scientificPrescription(normalized, normalized.sets[0], 'set_load');
      assert.ok(value.includes(`presetId=${presetId};presetName=${presetName}`));
      exercise.smartRmPresetId = presetId === 1 ? 5 : 1;
      assert.throws(() => normalize(raw), /ID presetu/);
    }
  }
});

test('actual Vita normalizer, science value, HTML, serializer and normalized readback preserve per-set levels and dose', () => {
  const vitaInput = input('fixed-kg');
  vitaInput.exercises = [{ id: 49, title: 'Synthetic Vita', loadType: 'vita', sets: [
    { unit: 'sec', durationSeconds: 30, level: 12, mode: 1, restSeconds: 45 },
    { unit: 'reps', reps: 8, level: 27, rirTarget: 2, mode: 1, restSeconds: 90 },
  ] }];
  const catalog = { exerciseRecordsById: new Map([[49, { dataStatTypeStatus: 'available', dataStatType: 6 }]]) };
  const plan = normalize(vitaInput, undefined, catalog);
  const exercise = plan.exercises[0];
  const decisions = exercise.sets.map(set => scientificPrescription(exercise, set, 'set_load'));
  assert.equal(decisions[0], 'loadType=vita;dataStatType=6;level=12;unit=sec;durationSeconds=30');
  assert.equal(decisions[1], 'loadType=vita;dataStatType=6;level=27;unit=reps;reps=8');
  assert.notEqual(scientificPrescription(exercise, { ...exercise.sets[0], level: 13 }, 'set_load'), decisions[0]);
  for (const mutation of [{ level: 0 }, { level: 1000 }, { weightKg: 5 }, { rmLevel: 12 }, { targetPercent1RM: .5 }]) {
    assert.throws(() => scientificPrescription(exercise, { ...exercise.sets[0], ...mutation }, 'set_load'));
  }
  assert.throws(() => scientificPrescription({ ...exercise, dataStatType: 1 }, exercise.sets[0], 'set_load'));
  const rendered = html({ plan, preview: {}, profile: 'synthetic', payload: { name: plan.name } });
  assert.match(rendered, /30 s · Vita level 12/); assert.match(rendered, /8 powt\. · Vita level 27/);
  const metadataById = new Map([[49, { detail: { dataStatType: 6, isLeftRight: 0 }, batch: { dataStatType: 6, actionLibraryList: [{ id: 149 }] } }]]);
  const { payload } = buildPresetPayload(plan, metadataById, 1, 'kg');
  assert.equal(payload.actionLibraryList[0].level, '12,27');
  assert.equal(payload.actionLibraryList[0].setsAndReps, '30,8');
  assert.equal(payload.actionLibraryList[0].completionMethod, '2,1');
  const readback = { ...structuredClone(payload), code: 'synthetic-vita-science' };
  readback.actionLibraryList[0].completionMethod = '5,1'; readback.actionLibraryList[0].countType = '5,1';
  const context = { expectedPayload: payload, readback, existingTemplateCodes: [], exerciseMetadataByAction: new Map([['49:149', { dataStatTypeStatus: 'available', dataStatType: 6 }]]) };
  assert.equal(verifyCreatedTemplateReadback(context).verified, true);
  readback.actionLibraryList[0].level = '13,27';
  assert.equal(verifyCreatedTemplateReadback(context).verified, false);
});
