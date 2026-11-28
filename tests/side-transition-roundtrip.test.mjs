import { normalizePreferenceReviews, preferenceReviewsSchema } from '../plugin/preference-compliance.mjs';
import { normalizeRecoveryContextDeclaration } from '../plugin/recovery-context.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import * as payloadFunctions from '../plugin/program-payload.mjs';
import { snapshotNormalizedPlan } from '../plugin/reviewed-plan-record.mjs';
import { assertPlanTimeLowerBound } from '../plugin/program-serialization.mjs';
import { buildPresetPayload } from '../plugin/program-serialization.mjs';
import { verifyCreatedTemplateReadback } from '../plugin/saved-templates.mjs';
import { resolveGoalBoundSmartRmPresetName } from '../plugin/goal-preset-routing.mjs';
import { getReferenceClientRmPresetByName } from '../plugin/preset-mapping.mjs';
import { normalizeExerciseEntry, validateExecutablePlanSections } from '../plugin/executable-plan-sections.mjs';

const source = readFileSync(new URL('../plugin/mcp_server.mjs', import.meta.url), 'utf8');
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

const scienceSource = readFileSync(new URL('../plugin/training-evidence.mjs', import.meta.url), 'utf8');
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

for (const seconds of [2, 7, 20]) test(`real normalize/snapshot/approval/serializer/readback side transition ${seconds}`, () => {
  const raw = input('smart-rm');
  const exercise = raw.exercises[0];
  delete exercise.unilateralPrescription;
  exercise.sets = exercise.sets.map(({side, ...set}) => ({...set, reps: 12, restSeconds: 90}));
  exercise.sideTransitionSeconds = seconds;
  exercise.sideTransitionRationale = 'Position change on the confirmed variant.';
  const plan = structuredClone(normalize(raw));
  assert.equal(snapshotNormalizedPlan(plan).exercises[0].sideTransitionSeconds, seconds);
  assert.equal(snapshotNormalizedPlan(plan).exercises[0].sideTransitionRationale, exercise.sideTransitionRationale);
  const {payload} = buildPresetPayload(plan, metadata, 1, 'kg');
  assert.equal(payload.actionLibraryList[0].leftRight, '1,2,1,2');
  assert.equal(payload.actionLibraryList[0].breakTime, `${seconds},90,${seconds},90`);
  const rendered = html({plan,preview:{},profile:'synthetic',payload});
  assert.match(rendered, new RegExp(`Zmiana strony: ${seconds} s`));
  const context = {expectedPayload:payload,readback:{...structuredClone(payload),code:'side-transition'},existingTemplateCodes:[]};
  assert.equal(verifyCreatedTemplateReadback(context).verified,true);
  context.readback.actionLibraryList[0].breakTime = '1,90,1,90'; context.readback.actionLibraryList[0].breakTime2 = '1,90,1,90';
  if (seconds !== 1) assert.equal(verifyCreatedTemplateReadback(context).verified,false);
  for (const isLeftRight of [0, undefined]) {
    const absent = isLeftRight === undefined ? {} : {isLeftRight};
    const invalid = new Map([[42,{detail:absent,batch:{...absent,actionLibraryList:[{id:142}]}}]]);
    assert.throws(() => buildPresetPayload(plan, invalid, 1, 'kg'));
  }
});
test('real normalizer rejects invalid transition public shape and leaves legacy unchanged', () => {
  for (const seconds of [0,31,null,false,'5']) {
    const raw=input('smart-rm'); delete raw.exercises[0].unilateralPrescription;
    raw.exercises[0].sets=raw.exercises[0].sets.map(({side,...set})=>set);
    Object.assign(raw.exercises[0],{sideTransitionSeconds:seconds,sideTransitionRationale:'Setup'});
    assert.throws(()=>normalize(raw));
  }
  const raw=input('smart-rm'); raw.exercises[0].sideTransitionSeconds=5;raw.exercises[0].sideTransitionRationale='Setup';
  assert.throws(()=>normalize(raw));
  delete raw.exercises[0].unilateralPrescription;
  raw.exercises[0].sets=raw.exercises[0].sets.map(({side,...set})=>set);
  delete raw.exercises[0].sideTransitionSeconds;delete raw.exercises[0].sideTransitionRationale;
  const plan=structuredClone(normalize(raw));const {payload}=buildPresetPayload(plan,metadata,1,'kg');
  assert.equal(payload.actionLibraryList[0].breakTime,'1,15,1,60');
  assert.match(html({plan,preview:{},profile:'synthetic',payload}),/Starszy zapis/);
  assert.equal(Object.hasOwn(snapshotNormalizedPlan(plan).exercises[0],'sideTransitionSeconds'),false);
});
test('real timed lower bound counts side transition independently of paired recovery', () => {
  const plan={exercises:[{id:42,title:'Timed unilateral',loadType:'bodyweight',sideTransitionSeconds:20,sideTransitionRationale:'Position change',sets:[{unit:'sec',durationSeconds:291,mode:1,rest:90}]}]};
  assert.throws(()=>assertPlanTimeLowerBound(plan,10,metadata),/602 s/);
  plan.exercises[0].sideTransitionSeconds=2;
  assert.doesNotThrow(()=>assertPlanTimeLowerBound(plan,10,metadata));
});
