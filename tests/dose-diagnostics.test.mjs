import * as overrideFunctions from '../plugin/user-override.mjs';
import { runWithAccessoryFixture, installAccessoryFixture } from './accessory-empty-store-fixture.mjs';
import * as timeBudgetFunctions from '../plugin/time-budget.mjs';
import { normalizePreferenceReviews, preferenceReviewsSchema } from '../plugin/preference-compliance.mjs';
import { normalizeRecoveryContextDeclaration } from '../plugin/recovery-context.mjs';
const syntheticRecoveryContext = { status: 'not_requested', limitations: ['Synthetic fixture uses no reported health data; biological readiness is not inferred.'] };
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import * as payloadFunctions from '../plugin/program-payload.mjs';
import { normalizeExerciseEntry, validateExecutablePlanSections } from '../plugin/executable-plan-sections.mjs';
import { buildPresetPayload, resolveActionLibraryVariantId } from '../plugin/program-serialization.mjs';
import { verifyCreatedTemplateReadback } from '../plugin/saved-templates.mjs';
import { snapshotNormalizedPlan } from '../plugin/reviewed-plan-record.mjs';
import { encodeStaticLoad, decodeStaticLoad } from '../plugin/static-load-protocol.mjs';
import { createHash } from 'node:crypto';
import { buildSavedTemplateUpdatePayload, verifyUpdatedTemplateReadback, resolveSavedTemplateLoadPresentation } from '../plugin/saved-templates.mjs';
import { diffSavedEditPayloads, savedEditExecutionDisclosure, assertSavedEditScope, reconcileSavedEditPayload } from '../plugin/saved-edit-diff.mjs';
import { assertStrengthAnchorMatchesActionVariant } from '../plugin/coaching-profile.mjs';

const source = readFileSync(new URL('../plugin/mcp_server.mjs', import.meta.url), 'utf8');
function extract(startText, endText) {
  const start = source.indexOf(startText), end = source.indexOf(endText, start);
  assert.ok(start >= 0 && end > start);
  return source.slice(start, end).trim();
}
const evidenceSource = readFileSync(new URL('../plugin/training-evidence.mjs', import.meta.url), 'utf8');
const baseSetDecisionValue = runWithAccessoryFixture(`(${evidenceSource.slice(evidenceSource.indexOf('function baseSetDecisionValue(')).trim()})`);
const normalize = runWithAccessoryFixture(`(${extract('function normalizePlan(', '\nfunction assertQuickTestProgramShape')})`, {
  Error, ...timeBudgetFunctions, ...payloadFunctions, normalizeRecoveryContextDeclaration, normalizePreferenceReviews, normalizeExerciseEntry, validateExecutablePlanSections,
  resolveProfileStrengthAnchor: ({ providedAnchor }) => providedAnchor,
  isSupportedCustomizeAnchorSource: value => value === 'speediance-reported',
  classifyPrescriptionUnit: unit => ['sec', 'seconds'].includes(unit) ? 'seconds' : 'reps',
  normalizeTrainingEvidence: (rationale, evidence) => ({ rationale, evidence }),
  normalizeSupersetBlocks: () => [],
  normalizeEvidencePlanItems: (warmup, postWorkoutStretching) => ({ warmup, postWorkoutStretching }),
  normalizeEvidenceCoverage: (_evidence, _coverage, exercises) => exercises.flatMap(exercise => exercise.sets.map((set, index) => ({ category: 'set_load', target: `set:${exercise.entryId}:${index + 1}`, status: 'applied', relationship: 'direct', reasoning: 'Synthetic load binding fixture; research services isolated.', evidenceIds: [], supportingExcerpts: [], sourceAssessments: [], value: baseSetDecisionValue(exercise, set, 'set_load') }))),
  assertNoUnserializedTechniqueInstructions: () => {}
});
const metadata = { batch: { actionLibraryList: [{ id: 142 }] }, detail: { isLeftRight: 0, isBarbell: 0 } };
function input(unit) {
  return { name: 'Manual Customize', recoveryContext: syntheticRecoveryContext, rationale: 'Synthetic regression', evidence: [], scienceGate: 'user_declined',
    warmup: { status: 'omitted_user_preference', items: [] }, postWorkoutStretching: { status: 'omitted_user_preference', items: [] },
    exercises: [{ id: 42, actionLibraryId: 142, title: 'Confirmed resisted movement', loadType: 'customize-manual', staticLoadRequested: true,
      sets: (unit === 'kg' ? [8, 12, 20] : [15, 18, 21]).map((weight, index) => ({ unit: 'reps', reps: 8 + index, weight, weightUnit: unit, rirTarget: 2, mode: index + 1, restSeconds: 60 + index })) }]
  };
}
function prepare(unit, protocol, { unitSource = 'speediance-account-userinfo', exerciseMetadata = metadata } = {}) {
  return runWithAccessoryFixture(`(${extract('async function prepareProgramPayload(', '\nasync function validateChangedTemplateExercises')})`, {
    assertExerciseMetadataGroupScope: runWithAccessoryFixture(`(${source.slice(source.indexOf('function assertExerciseMetadataGroupScope('), source.indexOf('\nasync function getExerciseApiMetadata(', source.indexOf('function assertExerciseMetadataGroupScope('))).trim()})`),
    ...timeBudgetFunctions, ...payloadFunctions, buildPresetPayload, resolveActionLibraryVariantId, encodeStaticLoad, decodeStaticLoad, assertStrengthAnchorMatchesActionVariant,
    readProfileConfig: async () => ({ config: { deviceType: 1 }, password: '' }),
    getAccountWeightUnitDetails: async () => ({ unit, source: unitSource }),
    getExerciseApiMetadata: async () => exerciseMetadata,
    resolveProfileStaticProtocolContext: async () => ({ staticLoadProtocol: protocol }),
    resolveStaticProtocolReadContext: () => { throw new Error('Manual static writes must use write protocol context.'); }
  });
}

test('actual normalizer qualifies valid baseline then reports failing fields', () => {
 assert.equal(normalize(input('kg')).exercises[0].sets.length,3);
 const cases=[
 [s=>{delete s.rirTarget},['rirTarget'],['restSeconds:','mode:']],
 [s=>{delete s.restSeconds},['restSeconds:'],['rirTarget:','mode:']],
 [s=>{delete s.mode},['mode:'],['rirTarget:','restSeconds:']],
 [s=>{delete s.weight},['Customize:'],['rirTarget:','restSeconds:']],
 [s=>{s.reps=0;s.restSeconds=601},['reps:','restSeconds:'],['mode:']]
 ];
 for(const [mutate,expected,absent] of cases){const args=input('kg');mutate(args.exercises[0].sets[0]);assert.throws(()=>normalize(args),e=>{assert.equal(e.code,'GM_COACH_INVALID_SET_DOSE');for(const v of expected)assert.ok(e.message.includes(v),e.message);for(const v of absent)assert.ok(!e.message.includes(v),e.message);return true})}
});
test('actual normalizer preserves earlier precise timed RIR rejection',()=>{
 const args=input('kg');args.exercises[0].sets=[{unit:'sec',durationSeconds:20,weight:5,weightUnit:'kg',mode:1,restSeconds:20}];
 const catalog={exerciseRecordsById:new Map([[42,{kind:'strength'}]])}; assert.equal(normalize(args,undefined,catalog).exercises[0].sets[0].durationSeconds,20);
 args.exercises[0].sets[0].rirTarget=2;assert.throws(()=>normalize(args,undefined,catalog),/RIR oznacza zapas/);
});

test('actual bodyweight rep and timed baselines qualify strict field boundaries',()=>{
 const make=(timed=false)=>{const a=input('kg');const e=a.exercises[0];e.loadType='bodyweight';delete e.staticLoadRequested;e.sets=[timed?{unit:'sec',durationSeconds:20,mode:1,restSeconds:0}:{unit:'reps',reps:8,rirTarget:2,mode:1,restSeconds:600}];return a};
 assert.equal(normalize(make()).exercises[0].sets[0].reps,8);
 assert.equal(normalize(make(true)).exercises[0].sets[0].durationSeconds,20);
 for(const [timed,key,values,field] of [[true,'durationSeconds',[0,86401,1.5],'durationSeconds:'],[false,'rirTarget',[-1,6,1.5],'rirTarget:'],[false,'mode',[0,999,1.5],'mode:'],[false,'restSeconds',[-1,601,1.5],'restSeconds:']]){
  for(const value of values){const a=make(timed);a.exercises[0].sets[0][key]=value;assert.throws(()=>normalize(a),e=>{assert.equal(e.code,'GM_COACH_INVALID_SET_DOSE');assert.ok(e.message.includes(field),e.message);return true})}
 }
 for(const value of [undefined,null,2]){const a=make(true);a.exercises[0].sets[0].rirTarget=value;assert.throws(()=>normalize(a),/RIR oznacza zapas/)}
 const a=make();a.exercises[0].sets[0].readbackOnly=1;assert.throws(()=>normalize(a),/nieobsługiwane pole serii/);
});

test('actual override wrapper retains dose token with wildcard or science override and never retries malformed input',async()=>{
 const start=source.indexOf('const USER_OVERRIDE_SCIENCE_TOOLS');const end=source.indexOf('async function dispatch(name, args = {})',start);assert.ok(start>=0&&end>start);
 for(const codes of [undefined,['*'],['science_gate']]){
  let calls=0;const names=['USER_OVERRIDE_TOOLS','parseUserOverride','userOverrideContext','overrideAuthorizes','recordOverride','classifyGuardError','describeGuard','guardErrorPayload','annotateOverriddenResult','dispatch'];
  const dispatch=async(_name,args)=>{calls++;return normalize(args)};
  const wrapper=new Function(...names,source.slice(start,end)+';return dispatchWithUserOverride;')(...names.slice(0,-1).map(k=>overrideFunctions[k]),dispatch);
  const a=input('kg');delete a.exercises[0].sets[0].restSeconds;if(codes)a.userOverride={authorized:true,reason:'Synthetic explicit override test',codes};
  await assert.rejects(wrapper('speediance_preview_program',a),e=>{assert.ok(e.message.includes('[GM_COACH_INVALID_SET_DOSE]'));assert.ok(e.message.includes('restSeconds:'));assert.equal(e.guardCode,null);assert.equal(e.cause.code,'GM_COACH_INVALID_SET_DOSE');const payload=JSON.parse(e.message.slice(e.message.lastIndexOf('\n')+1));assert.deepEqual(payload.guard,{code:null,overridable:false});return true});
  assert.equal(calls,1);
 }
});
