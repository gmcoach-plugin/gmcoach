import test from 'node:test';
import assert from 'node:assert/strict';
import { assessPlanTimeBudget, normalizeTimeEstimation, assessWeeklyTimeBudget } from '../time-budget.mjs';
import { assertCycleTrainingProfileCurrent, timeEstimationSchema } from '../time-budget.mjs';
import { MAX_SERIALIZED_LOGICAL_STEPS } from '../superset-serialization.mjs';
import { MAX_SERIALIZED_API_SETS } from '../program-serialization.mjs';
import { parseTrainingProfileRecord } from '../coaching-profile.mjs';
import { createHash } from 'node:crypto';
import { mkdtemp, writeFile, rename, rm, mkdir, symlink } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
const metadata=new Map([[1,{detail:{isLeftRight:0}}]]);
const plan=()=>({exercises:[{id:1,actionLibraryId:101,section:'main',sets:[{unit:'reps',reps:8,rest:90}]}],confirmedSessionMinutes:30});
test('unknown duration does not claim fit and exact scope rejects changed reps',()=>{const p=plan(),first=assessPlanTimeBudget(p,metadata);assert.equal(first.coverage,'complete');assert.notEqual(first.budgetStatus,'unknown');p.timeEstimation={version:1,executionScopeDigest:first.executionScopeDigest,repDurationRanges:[{exerciseIndex:0,executedSetIndex:0,minSeconds:2,maxSeconds:4,rationale:'Caller estimate',provenance:'caller-estimate'}],additionalSetupRange:{minSeconds:0,maxSeconds:60,rationale:'Additional setup only',provenance:'caller-estimate'}};const next=assessPlanTimeBudget(p,metadata);assert.equal(next.estimatedMaxSeconds,92);assert.equal(next.budgetStatus,'estimated-fits');p.exercises[0].sets[0].reps++;assert.throws(()=>assessPlanTimeBudget(p,metadata),/scope changed/);});
test('weekly budget rejects invalid dates duplicate identities and includes zero-work product weeks',()=>{const a=assessPlanTimeBudget(plan(),metadata),sessions=[{sessionId:'s',timeBudgetAssessment:a}],rows=[{sessionId:'s',occurrenceId:'o',date:'2026-10-05'}];const result=assessWeeklyTimeBudget(rows,sessions,60,{startDate:'2026-10-05',totalWeeks:2});assert.equal(result.length,2);assert.equal(result[1].lowerBoundSeconds,0);assert.equal(result[1].budgetStatus,'estimated-fits');assert.throws(()=>assessWeeklyTimeBudget([{...rows[0],date:'2026-02-31'}],sessions,60),/exact occurrence/);assert.throws(()=>assessWeeklyTimeBudget([...rows,...rows],sessions,60),/Duplicate/);assert.throws(()=>assessWeeklyTimeBudget(rows,[...sessions,...sessions],60),/Duplicate/);assert.throws(()=>assessWeeklyTimeBudget(rows,sessions,NaN),/Invalid/);});
test('unknown side metadata remains partial and assumptions reject duplicate occurrence',()=>{assert.equal(assessPlanTimeBudget(plan()).coverage,'complete');assert.throws(()=>normalizeTimeEstimation({version:1,executionScopeDigest:'a'.repeat(64),repDurationRanges:[{exerciseIndex:0,executedSetIndex:0,minSeconds:1,maxSeconds:2,rationale:'estimate',provenance:'caller-estimate'},{exerciseIndex:0,executedSetIndex:0,minSeconds:1,maxSeconds:2,rationale:'estimate',provenance:'caller-estimate'}],additionalSetupRange:null},1),/duplicate/);});

test('partial upper coverage still rejects known minimum above session or weekly limit',()=>{const p=plan();p.exercises[0].sets[0].reps=100;const scope=assessPlanTimeBudget(p,metadata).executionScopeDigest;p.timeEstimation={version:1,executionScopeDigest:scope,repDurationRanges:[{exerciseIndex:0,executedSetIndex:0,minSeconds:20,maxSeconds:30,rationale:'Synthetic estimate',provenance:'caller-estimate'}],additionalSetupRange:null};const a=assessPlanTimeBudget(p,metadata);assert.equal(a.coverage,'complete');assert.equal(a.budgetStatus,'estimated-exceeds');const weeks=assessWeeklyTimeBudget([{sessionId:'s',occurrenceId:'o',date:'2026-10-05'}],[{sessionId:'s',timeBudgetAssessment:a}],30,{startDate:'2026-10-05',totalWeeks:1});assert.equal(weeks[0].budgetStatus,'estimated-exceeds');assert.throws(()=>assessWeeklyTimeBudget([],[],60,{startDate:'2026-02-31',totalWeeks:2}),/horizon/);});

test('time declaration uses actual logical serialization ceiling and maximum pair expansion',()=>{
 assert.equal(MAX_SERIALIZED_LOGICAL_STEPS,100);
 assert.equal(MAX_SERIALIZED_API_SETS,100);
 assert.equal(timeEstimationSchema.properties.repDurationRanges.maxItems,100);
 assert.equal(timeEstimationSchema.properties.repDurationRanges.items.properties.executedSetIndex.maximum,99);
 const rows=Array.from({length:100},(_,executedSetIndex)=>({exerciseIndex:0,executedSetIndex,minSeconds:1,maxSeconds:1,rationale:'Synthetic estimate',provenance:'caller-estimate'}));
 const declaration={version:1,executionScopeDigest:'a'.repeat(64),repDurationRanges:rows,additionalSetupRange:null};
 assert.equal(normalizeTimeEstimation(declaration,1).repDurationRanges.length,100);
 assert.throws(()=>normalizeTimeEstimation({...declaration,repDurationRanges:[...rows,{...rows[0],executedSetIndex:100}]},1),/Invalid time-estimation/);
 assert.throws(()=>normalizeTimeEstimation({...declaration,repDurationRanges:[{...rows[0],executedSetIndex:100}]},1),/occurrence/);
});

test('real bounded synchronous final profile reader rejects replacement, malformed, oversized and missing records',async()=>{
 const directory=await mkdtemp(path.join(os.tmpdir(),'gm-time-profile-'));
 try{
  // Both guarded parents belong to this fixture; shared os.tmpdir may change
  // during concurrent test creation and correctly fails the production guard.
  const accounts=path.join(directory,'accounts'),account=path.join(accounts,'synthetic');
  await mkdir(account,{recursive:true});
  const file=path.join(account,'training-profile.json'),record={schemaVersion:1,updatedAt:'2026-10-08T10:00:00Z',profileData:{sessionMinutes:30,weeklyMinutes:60}};
  const digest=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
  const expected=digest(parseTrainingProfileRecord(record));
  await writeFile(file,JSON.stringify(record));assert.doesNotThrow(()=>assertCycleTrainingProfileCurrent(file,expected));
  await writeFile(file+'.next',JSON.stringify({...record,profileData:{...record.profileData,sessionMinutes:20}}));await rename(file+'.next',file);
  assert.throws(()=>assertCycleTrainingProfileCurrent(file,expected),/changed before dispatch/);
  await writeFile(file,'{');assert.throws(()=>assertCycleTrainingProfileCurrent(file,expected),/could not be verified/);
  await writeFile(file,'x'.repeat(512001));assert.throws(()=>assertCycleTrainingProfileCurrent(file,expected),/could not be verified/);
  await rm(file);assert.throws(()=>assertCycleTrainingProfileCurrent(file,expected),/changed before dispatch/);
  assert.doesNotThrow(()=>assertCycleTrainingProfileCurrent(file,digest(null)));
  assert.throws(()=>assertCycleTrainingProfileCurrent(path.join(accounts,'missing-account','training-profile.json'),digest(null)),/could not be verified/);
 }finally{await rm(directory,{recursive:true,force:true});}
});

for(const level of ['account','accounts','file'])test(`final profile reader rejects ${level} symlink/junction`,async t=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'gm-profile-parent-'));
 try{
  const target=path.join(root,'target'),accounts=path.join(root,'accounts');
  await mkdir(target);await mkdir(accounts);
  const record={schemaVersion:1,updatedAt:'2026-10-08T10:00:00Z',profileData:{sessionMinutes:30}};
  await writeFile(path.join(target,'training-profile.json'),JSON.stringify(record));
  let file;
  try{
   if(level==='account'){const account=path.join(accounts,'profile');await symlink(target,account,'junction');file=path.join(account,'training-profile.json');}
   else if(level==='accounts'){const linked=path.join(root,'linked-accounts');await symlink(accounts,linked,'junction');const account=path.join(accounts,'profile');await mkdir(account);await writeFile(path.join(account,'training-profile.json'),JSON.stringify(record));file=path.join(linked,'profile','training-profile.json');}
   else{file=path.join(accounts,'training-profile.json');await symlink(path.join(target,'training-profile.json'),file,'file');}
  }catch(error){if(['EPERM','EACCES','ENOTSUP'].includes(error.code)){t.skip(`Platform cannot create test link: ${error.code}`);return;}throw error;}
  const expected=createHash('sha256').update(JSON.stringify(parseTrainingProfileRecord(record))).digest('hex');
  assert.throws(()=>assertCycleTrainingProfileCurrent(file,expected),/could not be verified/);
 }finally{await rm(root,{recursive:true,force:true});}
});
test('timing scope binds exercise accessories and every nonpresentation set setting',()=>{
 const p=plan(),first=assessPlanTimeBudget(p,metadata);
 p.timeEstimation={version:1,executionScopeDigest:first.executionScopeDigest,repDurationRanges:[],additionalSetupRange:null};
 p.exercises[0].accessories=[7];assert.throws(()=>assessPlanTimeBudget(p,metadata),/scope changed/);
 delete p.exercises[0].accessories;p.exercises[0].sets[0].bandConfiguration={count:2};assert.throws(()=>assessPlanTimeBudget(p,metadata),/scope changed/);
});
test('weekly helper rejects invalid definition identities and unmatched occurrences',()=>{
 assert.throws(()=>assessWeeklyTimeBudget([], [{sessionId:null}],60),/session identity/);
 assert.throws(()=>assessWeeklyTimeBudget([{sessionId:'missing',occurrenceId:'o',date:'2026-10-05'}],[],60),/Unmatched/);
});

test('timing signatures ignore recursive object insertion order but retain array order and all meaningful settings',()=>{
 const original=plan();original.exercises[0].sets[0].rirTarget=2;
 original.exercises[0].accessories=[{id:7,configuration:{position:'low',angle:30}}];
 const reverse=value=>Array.isArray(value)?value.map(reverse):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).reverse().map(([key,item])=>[key,reverse(item)])):value;
 const reordered=reverse(structuredClone(original));
 const a=assessPlanTimeBudget(original,metadata),b=assessPlanTimeBudget(reordered,metadata);
 assert.equal(a.executionScopeDigest,b.executionScopeDigest);assert.equal(a.prescriptionDigest,b.prescriptionDigest);
 reordered.timeEstimation={version:1,executionScopeDigest:a.executionScopeDigest,repDurationRanges:[],additionalSetupRange:null};
 assert.doesNotThrow(()=>assessPlanTimeBudget(reordered,metadata));
 reordered.exercises[0].accessories[0].configuration.angle=31;
 assert.throws(()=>assessPlanTimeBudget(reordered,metadata),/scope changed/);
 const pair=plan();pair.exercises[0].sets.push({...pair.exercises[0].sets[0],reps:10});
 const first=assessPlanTimeBudget(pair,metadata);pair.exercises[0].sets.reverse();
 assert.notEqual(first.executionScopeDigest,assessPlanTimeBudget(pair,metadata).executionScopeDigest);
});

test('unlimited session is explicit no-cap with estimates retained and weekly limit still enforced',()=>{
 const p=plan();delete p.confirmedSessionMinutes;p.confirmedSessionMinutesStatus='unlimited';p.confirmedWeeklyMinutes=10;
 const partial=assessPlanTimeBudget(p,metadata);assert.equal(partial.sessionLimitStatus,'unlimited');assert.equal(partial.sessionLimitMinutes,null);assert.equal(partial.budgetStatus,'no-session-limit');assert.equal(partial.coverage,'complete');assert.ok(partial.estimatedMaxSeconds>0);
 p.timeEstimation={version:1,executionScopeDigest:partial.executionScopeDigest,repDurationRanges:[{exerciseIndex:0,executedSetIndex:0,minSeconds:100,maxSeconds:120,rationale:'Synthetic logistical estimate',provenance:'caller-estimate'}],additionalSetupRange:{minSeconds:0,maxSeconds:60,rationale:'Additional setup only',provenance:'caller-estimate'}};
 const complete=assessPlanTimeBudget(p,metadata);assert.equal(complete.coverage,'complete');assert.equal(complete.estimatedMinSeconds,800);assert.equal(complete.estimatedMaxSeconds,1020);assert.equal(complete.budgetStatus,'no-session-limit');
 const unknown={...p,confirmedSessionMinutesStatus:'unknown'};assert.equal(assessPlanTimeBudget(unknown,metadata).budgetStatus,'limit-unknown');assert.notEqual(complete.profileBudgetDigest,assessPlanTimeBudget(unknown,metadata).profileBudgetDigest);
 const weekly=assessWeeklyTimeBudget([{sessionId:'s',occurrenceId:'o',date:'2026-10-05'}],[{sessionId:'s',timeBudgetAssessment:complete}],10);assert.equal(weekly[0].budgetStatus,'estimated-exceeds');assert.equal(weekly[0].weeklyLimitMinutes,10);
 for(const status of ['invalid',null,0])assert.throws(()=>assessPlanTimeBudget({...p,confirmedSessionMinutesStatus:status},metadata),/session time status/);
 assert.throws(()=>assessPlanTimeBudget({...p,confirmedSessionMinutes:30},metadata),/Contradictory/);
 assert.equal(JSON.parse(JSON.stringify(complete)).sessionLimitMinutes,null);
});
