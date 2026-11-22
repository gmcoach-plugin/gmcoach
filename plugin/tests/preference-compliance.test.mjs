import { validatePlanRequiredAccessories as actualAccessoryValidator } from '../equipment-plan-safety.mjs';
import { runWithAccessoryFixture, installAccessoryFixture } from './accessory-empty-store-fixture.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { assessPreferenceCompliance, assertPreferenceCompliance, normalizePreferenceReviews } from '../preference-compliance.mjs';
import { snapshotNormalizedPlan } from '../reviewed-plan-record.mjs';
import { deriveTrainingCyclePrescription } from '../training-cycle-prescription.mjs';
const source = readFileSync(new URL('../mcp_server.mjs', import.meta.url), 'utf8');
const existingTemplatePreview = Symbol('internal-existing-template-preview');
const resolverStart=source.indexOf('function resolveImportedRmPolicy('),resolverEnd=source.indexOf('\n',resolverStart);assert.ok(resolverStart>=0&&resolverEnd>resolverStart);
const resolveImportedRmPolicy=new Function('importedRmPolicyTokens','Date',`return (${source.slice(resolverStart,resolverEnd)});`)(new Map(),Date);
const plan = () => ({name:'Synthetic', exercises:[{id:42,title:'Misleading title',actionLibraryId:7,loadType:'bodyweight',sets:[{reps:8,unit:'reps',rest:60,mode:1}]}],evidence:[{id:'e'}],decisionEvidence:[{category:'exercise_selection',value:'x'}]});
function reviewed(p,profile,record={},userConfirmed=false){
 p.preferenceReviews=[...assessPreferenceCompliance(p,profile,new Map([[42,record]])).checks,...assessPreferenceCompliance(p,profile,new Map([[42,record]])).reviews].filter(x=>x.status!=='confirmed-contradiction').map(x=>({field:x.field,scopeDigest:x.scopeDigest,decision:'reviewed-compatible',rationale:'Explicit scoped compatibility review',...(userConfirmed?{userConfirmed:true}:{})}));return p;
}
function validator(profileData, record) {
 const start=source.indexOf('async function validatePlanForProfile('),end=source.indexOf('\nfunction assertRecoveryContextCurrent(',start);
 assert.ok(start>0&&end>start);
 return runWithAccessoryFixture(`(${source.slice(start,end).trim()})`,{
  structuredClone, readProfileConfig:async()=>({config:{},password:''}),profileConfigFingerprint:()=> 'account', recoveryContexts:{resolve:()=>({status:'unavailable',contextDigest:'r'})},
  auditTrainingProfileForPlan:async()=>({profileData,audit:{complete:true,completedSections:[],declinedSections:[]},fingerprint:'intake',preferences:{}}),
  assertTrainingInterviewComplete:()=>{},assertNutritionContextEvidence:()=>{},assertPlanSectionPreferences:()=>{},
  validateTrainingResearchSources:x=>x,validateEvidenceExcerptAnchors:()=>{},assertPilatesResistanceSupported:()=>{},getConfirmedExerciseName:()=> 'Misleading title',normalizedExerciseName:x=>x,
  normalizeEvidenceCoverage:(_e,d)=>d,assertPlanMovementRestrictionsAllowed:()=>{},assertPlanTimeLowerBound:()=>{},assessPreferenceCompliance,assertPreferenceCompliance,normalizePreferenceReviews,
  currentExerciseCatalog:async()=>({exerciseRecordsById:new Map([[42,record]]),exercises:[record]}),readOwnedEquipment:async()=>({}),resolvePlanEquipmentInventory:()=>({source:'api'}),validatePlanRequiredAccessories: ({plan}) => actualAccessoryValidator({plan,catalog:plan.exercises.map(exercise=>({id:exercise.id,equipmentMetadataAvailable:true,equipmentMetadataStatus:'valid-empty',requiredAccessoryIds:[]})),inventory:{ownershipKnown:true,ownershipStatus:'complete',ownedAccessoryIds:[]}}),createHash
 });
}
test('actual public validation rejects catalog-confirmed abdominal exclusion, not title guesses',async()=>{
 const validate=validator({absPreference:'no'},{mainMuscleGroupStatus:'available',mainMuscleGroupName:'Abdominals'});
 await assert.rejects(validate(plan(),'synthetic'),/absPreference=no/);
 const record={mainMuscleGroupStatus:'conflict',mainMuscleGroupName:'Abdominals'};
 await assert.rejects(validator({absPreference:'no'},record)(plan(),'synthetic'),/Scoped preference review required/);
 const unknown=await validator({absPreference:'no'},record)(reviewed(plan(),{absPreference:'no'},record),'synthetic');
 assert.equal(unknown.plan.preferenceCompliance.status,'explicitly-reviewed');
 assert.equal(unknown.plan.preferenceCompliance.preferenceComplianceVerified,false);
});
test('unknown bodyweight and secondary work require visible review; prescription is not catalog proof',()=>{
 const p=plan();p.exercises[0].loadType='smart-rm';
 const result=assessPreferenceCompliance(p,{bodyweightPreference:'no',obliquesPreference:'ask',exerciseRestrictions:'Avoid kneeling',resistanceModePreferences:'Standard only'},new Map([[42,{mainMuscleGroupStatus:'available',mainMuscleGroupName:'Chest'}]]));
 assert.equal(result.checks.length,2);assert.equal(result.reviews.length,2);assert.equal(result.status,'unresolved-review-required');
 assert.throws(()=>assertPreferenceCompliance(result),/Scoped preference review/);
 assert.equal(result.checks[0].metadataScope,'reported-primary-muscle-only');
 assert.equal(result.checks[0].status,'unresolved-review-required');
});
test('normalized scientific snapshots preserve preference disclosure and changed rules/evidence bind distinct digests',()=>{
 const p=plan();p.preferenceCompliance=assessPreferenceCompliance(p,{exercisePreferences:'Standing'},new Map());
 const copy=snapshotNormalizedPlan(p);assert.deepEqual(copy.preferenceCompliance,p.preferenceCompliance);
 const changed=assessPreferenceCompliance(p,{exercisePreferences:'Seated'},new Map());assert.notEqual(changed.assessmentDigest,p.preferenceCompliance.assessmentDigest);
 p.decisionEvidence[0].value='new';assert.notEqual(assessPreferenceCompliance(p,{exercisePreferences:'Standing'},new Map()).assessmentDigest,copy.preferenceCompliance.assessmentDigest);
});
test('actual public create regeneration rejects changed preference assessment before any POST',async()=>{
 const begin=source.indexOf('        const savedTrainingProfile = await readTrainingProfileRecord(profile);',source.indexOf("case 'speediance_create_program':"));
 const end=source.indexOf('        if (refreshedProgram.staticLoadContext',begin);assert.ok(begin>0&&end>begin);
 const p=(await validator({},{})(plan(),'synthetic')).plan;
 const digest=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
 const approval={intakeFingerprint:'intake',digest:digest(p)};
 let posts=0;
 const run=runWithAccessoryFixture(`(async()=>{${source.slice(begin,end)}})`,{
  resolveImportedRmPolicy,profile:'synthetic',fingerprint:'account',args:{},approval,writeApprovals:new Map(),
  readTrainingProfileRecord:async()=>({profileData:{exercisePreferences:'Seated'}}),currentExerciseCatalog:async()=>({exerciseRecordsById:new Map([[42,{}]]),exercises:[]}),normalizePlan:()=>plan(),
  validatePlanForProfile:validator({exercisePreferences:'Seated'},{}),prepareProgramPayload:async()=>({}),planDigest:(_profile,value)=>digest(value),
  speedianceApiRequest:async()=>{posts++;}
 });
 await assert.rejects(run(),/Scoped preference review/);assert.equal(posts,0);
});
test('actual create approval regeneration accepts an unchanged bound assessment',async()=>{
 const begin=source.indexOf('        const savedTrainingProfile = await readTrainingProfileRecord(profile);',source.indexOf("case 'speediance_create_program':"));
 const end=source.indexOf('        if (refreshedProgram.staticLoadContext',begin);
 const p=(await validator({},{})(plan(),'synthetic')).plan;
 const digest=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');let preparations=0;
 const run=runWithAccessoryFixture(`(async()=>{${source.slice(begin,end)}return plan.preferenceCompliance;})`,{
  resolveImportedRmPolicy,profile:'synthetic',fingerprint:'account',args:{},approval:{intakeFingerprint:'intake',digest:digest(p)},writeApprovals:new Map(),
  readTrainingProfileRecord:async()=>({profileData:{}}),currentExerciseCatalog:async()=>({exerciseRecordsById:new Map([[42,{}]]),exercises:[]}),normalizePlan:()=>plan(),
  validatePlanForProfile:validator({},{}),prepareProgramPayload:async()=>{preparations++;return{};},planDigest:(_profile,value)=>digest(value)
 });
 const result=await run();assert.equal(result.assessmentDigest,p.preferenceCompliance.assessmentDigest);assert.equal(preparations,1);
});
test('actual preview dispatch reaches preference exclusion guard before preparation or mutation',async()=>{
 const begin=source.indexOf("    case 'speediance_preview_program': {");
 const end=source.indexOf('      const { plan, intakeFingerprint, intakeAudit, equipmentSafety }',begin);assert.ok(begin>0&&end>begin);
 const record={mainMuscleGroupStatus:'available',mainMuscleGroupName:'Abdominals'};
 const catalog={exerciseRecordsById:new Map([[42,record]]),exercises:[record]};let writes=0;
 const run=runWithAccessoryFixture(`(async args=>{switch('speediance_preview_program'){${source.slice(begin,end)}return validated;});}}})`,{
  resolveImportedRmPolicy,resolveProfile:async()=> 'synthetic',withProfileMutationLock:async(_p,fn)=>fn(),readProfileConfig:async()=>({config:{},password:''}),profileConfigFingerprint:()=> 'account',
  readTrainingProfileRecord:async()=>({profileData:{absPreference:'no'}}),currentExerciseCatalog:async()=>catalog,normalizePlan:()=>plan(),
  validatePlanForProfile:validator({absPreference:'no'},record),prepareProgramPayload:async()=>{writes++;},speedianceApiRequest:async()=>{writes++;},existingTemplatePreview
 });
 await assert.rejects(run({warmup:{status:'omitted_user_preference',omissionReason:'test'},postWorkoutStretching:{status:'omitted_user_preference',omissionReason:'test'}}),/absPreference=no/);assert.equal(writes,0);
});
test('known bodyweight execution exclusion cannot be bypassed by a scoped compatibility note',()=>{
 const p=reviewed(plan(),{bodyweightPreference:'no'});assert.throws(()=>assertPreferenceCompliance(assessPreferenceCompliance(p,{bodyweightPreference:'no'})),/bodyweightPreference=no/);
});
test('ask requires actual scoped user answer and stale or duplicate reviews fail',()=>{
 const p=reviewed(plan(),{obliquesPreference:'ask'});assert.throws(()=>assessPreferenceCompliance(p,{obliquesPreference:'ask'}),/userConfirmed/);
 p.preferenceReviews[0].userConfirmed=true;assert.doesNotThrow(()=>assertPreferenceCompliance(assessPreferenceCompliance(p,{obliquesPreference:'ask'})));
 p.exercises[0].sets[0].reps++;ignoredStale(assessPreferenceCompliance(p,{obliquesPreference:'ask'}));
});
test('warmup or stretching instruction edits invalidate existing scoped reviews',()=>{
 for(const section of ['warmup','postWorkoutStretching']){
  const p=plan();p[section]={status:'included',items:[{instructions:'Before'}]};reviewed(p,{exerciseRestrictions:'Standing only'});
  p[section].items[0].instructions='After';ignoredStale(assessPreferenceCompliance(p,{exerciseRestrictions:'Standing only'}));
 }
});
test('verified source changes do not invalidate prescription-scoped preference reviews',()=>{
 const p=reviewed(plan(),{exercisePreferences:'Standing'});
 const before=assessPreferenceCompliance(p,{exercisePreferences:'Standing'});
 assert.doesNotThrow(()=>assertPreferenceCompliance(before));
 p.evidence[0].pubmed={abstract:'Changed verified abstract'};
 assert.equal(assessPreferenceCompliance(p,{exercisePreferences:'Standing'}).status,'explicitly-reviewed');
 // Fresh review starts without the stale attestation; the gate must reject it
 // until this explicit regeneration, rather than silently replacing it.
 delete p.preferenceReviews;
 const refreshed=reviewed(p,{exercisePreferences:'Standing'});
 assert.notEqual(assessPreferenceCompliance(refreshed,{exercisePreferences:'Standing'}).evidenceDigest,before.evidenceDigest);
});
test('unknown to available primary muscle invalidates user-confirmed ask review',()=>{
 const profile={obliquesPreference:'ask'};
 const p=reviewed(plan(),profile,{mainMuscleGroupStatus:'missing'},true);
 assert.doesNotThrow(()=>assertPreferenceCompliance(assessPreferenceCompliance(p,profile,new Map([[42,{mainMuscleGroupStatus:'missing'}]]))));
 ignoredStale(assessPreferenceCompliance(p,profile,new Map([[42,{mainMuscleGroupStatus:'available',mainMuscleGroupName:'Obliques'}]])));
});
test('exact observed metadata spelling is bound even when interpretation is unchanged',()=>{
 const profile={absPreference:'ask'},record={mainMuscleGroupStatus:'available',mainMuscleGroupName:'Chest'};
 const p=reviewed(plan(),profile,record,true);
 ignoredStale(assessPreferenceCompliance(p,profile,new Map([[42,{...record,mainMuscleGroupName:'CHEST'}]])));
});
test('actual fresh preview returns stale metadata reviews without approval before payload preparation',async()=>{
 const begin=source.indexOf("    case 'speediance_preview_program': {"),end=source.indexOf('      const { payload, displayUnit, staticLoadContext, executionExercises }',begin);
 assert.ok(begin>0&&end>begin);
 for(const type of ['metadata']){
  const profile={obliquesPreference:'ask'},oldRecord={mainMuscleGroupStatus:'missing'};
  const p=reviewed(plan(),profile,oldRecord,true);
  if(type==='source')p.evidence[0].limitations='Changed evidence limitations';
  const record=type==='metadata'?{mainMuscleGroupStatus:'available',mainMuscleGroupName:'Obliques'}:oldRecord;
  let preparations=0;
  const run=runWithAccessoryFixture(`(async args=>{switch('speediance_preview_program'){${source.slice(begin,end)}return validated;});}}})`,{
   resolveImportedRmPolicy,resolveProfile:async()=> 'synthetic',withProfileMutationLock:async(_p,fn)=>fn(),readProfileConfig:async()=>({config:{},password:''}),profileConfigFingerprint:()=> 'account',
   readTrainingProfileRecord:async()=>({profileData:profile}),currentExerciseCatalog:async()=>({exerciseRecordsById:new Map([[42,record]]),exercises:[record]}),normalizePlan:()=>p,
   validatePlanForProfile:validator(profile,record),prepareProgramPayload:async()=>{preparations++;},existingTemplatePreview
  });
  const result=await run({warmup:{status:'omitted_user_preference',omissionReason:'test'},postWorkoutStretching:{status:'omitted_user_preference',omissionReason:'test'}});
  assert.equal(result.operationStatus,'preference-review-preparation');assert.equal(result.readOnly,true);assert.equal(result.writeReady,false);assert.equal(result.approvalIssued,false);assert.equal(result.previewId,undefined);assert.ok(result.requiredPreferenceReviews.some(item=>item.field==='obliquesPreference'));assert.equal(preparations,0);
 }
});
test('blocked diagnostics do not echo unbounded API labels while exact metadata changes digest',()=>{
 const record={mainMuscleGroupStatus:'available',mainMuscleGroupName:'x'.repeat(200000)};
 const p=plan(),profile={bodyweightPreference:'no'};
 const result=assessPreferenceCompliance(p,profile,new Map([[42,record]]));
 assert.throws(()=>assertPreferenceCompliance(result),error=>error.message.length<1000&&!error.message.includes('x'.repeat(100)));
 const changed=assessPreferenceCompliance(p,profile,new Map([[42,{...record,mainMuscleGroupName:record.mainMuscleGroupName+'y'}]]));
 assert.notEqual(result.catalogObservationsDigest,changed.catalogObservationsDigest);
});
test('actual approval HTML renders bound scoped review safely',()=>{
 const begin=source.indexOf('function approvalPage('),end=source.indexOf('\nasync function handleApprovalRequest',begin);
 const render=runWithAccessoryFixture(`(${source.slice(begin,end)})`,{escapeHtml:value=>String(value??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;'),setupPage:(_title,_sub,html)=>html});
 const p=plan();p.rationale='fixture';p.exercises=[];p.decisionEvidence=[];p.evidence=[];p.warmup={status:'omitted_user_preference',items:[],omissionReason:'user'};p.postWorkoutStretching={...p.warmup};
 p.preferenceCompliance=assessPreferenceCompliance(reviewed(p,{exercisePreferences:'<script>never</script>'}),{exercisePreferences:'<script>never</script>'});
 const html=render({profile:'synthetic',payload:{name:'fixture',actionLibraryList:[]},preview:{exercises:[]},plan:p});
 assert.match(html,/Preferencje: zakres kontroli/);assert.match(html,/&lt;script&gt;/);assert.doesNotMatch(html,/<script>never/);assert.match(html,/explicitly-reviewed-compatible/);
});
test('actual cycle prescription snapshot and public cycle presentation retain preference binding',()=>{
 const p=plan();p.preferenceCompliance=assessPreferenceCompliance(p,{});
 const input={startDate:'2026-10-08',totalWeeks:2,occurrences:[{date:'2026-10-08',sessionId:'s',templateCode:'t',executionDigest:'a'.repeat(64),normalizedPlan:p}]};
 const facts=deriveTrainingCyclePrescription(input);assert.equal(facts.occurrences.length,1);
 const begin=source.indexOf('function publicTrainingCycle('),end=source.indexOf('\n}',begin)+2;
 const publicCycle=runWithAccessoryFixture(`(${source.slice(begin,end)})`,{MAX_OUTPUT_BYTES:1e9,cycleJsonClone:value=>JSON.parse(JSON.stringify(value))});
 const result=publicCycle({input:{},facts,sessions:[{sessionId:'s',plan:{...p,recoveryContext:{},resolvedRecoveryContext:{}},payload:{name:'fixture'},executionDigest:'a'.repeat(64),serializedWorkRows:1}],profile:'synthetic'});
 assert.deepEqual(result.sessions[0].preferenceCompliance,p.preferenceCompliance);
});

function ignoredStale(result){assert.ok(result.notices?.some(item=>item.code==='preference-review-ignored'));assert.notEqual(result.status,'explicitly-reviewed');}
