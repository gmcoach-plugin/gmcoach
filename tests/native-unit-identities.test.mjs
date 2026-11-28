import test from 'node:test';
import assert from 'node:assert/strict';
import {annotateTimedWorkoutOutput} from '../plugin/workout-data.mjs';
import {projectSessionPlanningView} from '../plugin/session-planning-view.mjs';

test('common unit path is independent of every synthetic exercise identity across cable shapes and units',()=>{
 let cases=0;
 for(let group=1;group<=300;group++)for(const unit of ['kg','lb','unknown'])for(const shape of ['aggregate','left','right','dual']){
 const detail={actionLibraryId:100000+group,weights:[28,28]};
 if(['left','dual'].includes(shape))detail.leftWeights=[28,28];
 if(['right','dual'].includes(shape))detail.rightWeights=[28,28];
 const input={detail:[{actionLibraryGroupId:group,title:'Exercise '+group,completionMethod:1,finishedReps:[{finishedCount:2,targetCount:2,leftRight:shape==='left'?1:shape==='right'?2:0,trainingInfoDetail:detail}]}]};
 const full=JSON.parse(annotateTimedWorkoutOutput(JSON.stringify(input),{displayUnit:unit}));
 const row=projectSessionPlanningView(full).exercises[0].sets[0].nativeExecutionEvidence;
 assert.equal(row.nativeReportedLoad.unit,unit);assert.equal(row.nativeReportedLoad.lower,28);assert.equal(row.nativeReportedLoad.upper,28);
 assert.equal(row.variantIdentity.id,100000+group);assert.equal(row.nativeReportedLoad.fixedCustomizeSettingVerified,false);cases++;
 }
 assert.equal(cases,3600);
});

test('paired sum never zips unrelated samples by equal length alone',()=>{
 const source={detail:[{finishedReps:[{trainingInfoDetail:{leftWeights:[10,20],rightWeights:[20,10]}}]}],gmCoachSessionSummary:{weightUnit:'kg',exercises:[{exercise:'Anything',path:'$.detail[0]',sets:[{set:1,reps:2,unit:'reps',weightUnit:'kg',side:0}]}]}};
 const get=()=>projectSessionPlanningView(source).exercises[0].sets[0].reportedCableSum;
 assert.equal(get().status,'bounded-cable-sum-envelope');assert.deepEqual([get().lower,get().upper],[20,40]);
 const raw=source.detail[0].finishedReps[0].trainingInfoDetail;
 raw.leftTimestamps=[100,200];raw.rightTimestamps=[100,201];assert.equal(get().status,'bounded-cable-sum-envelope');
 raw.rightTimestamps=[100,200];assert.equal(get().status,'derived-from-paired-reported-samples');assert.deepEqual([get().lower,get().upper],[30,30]);
 raw.leftTimestamps=[100,100];raw.rightTimestamps=[100,100];assert.equal(get().status,'bounded-cable-sum-envelope');
});

test('explicit unknown and conflicting reported units never become guessed kg',()=>{
 const base={detail:[{finishedReps:[{trainingInfoDetail:{weights:[28,28]}}]}],gmCoachSessionSummary:{weightUnit:'kg',weightUnitSource:'profile',exercises:[{exercise:'Any',path:'$.detail[0]',sets:[{set:1,reps:2,unit:'reps',weightUnit:'unknown',side:0}]}]}};
 let n=projectSessionPlanningView(base).exercises[0].sets[0].nativeExecutionEvidence.nativeReportedLoad;
 assert.equal(n.unit,'unknown');assert.equal(n.historicalUnitIndependentlyVerified,false);
 const raw={weightUnit:'kg',info:{weightUnit:'lb'},detail:[{actionLibraryGroupId:1,title:'Any',completionMethod:1,finishedReps:[{finishedCount:2,trainingInfoDetail:{weights:[28,28],leftWeights:[28,28],rightWeights:[28,28]}}]}]};
 const full=JSON.parse(annotateTimedWorkoutOutput(JSON.stringify(raw)));
 n=projectSessionPlanningView(full).exercises[0].sets[0].nativeExecutionEvidence.nativeReportedLoad;
 assert.equal(n.unit,'unknown');assert.equal(n.fixedCustomizeSettingVerified,false);
});

test('malformed side samples cannot turn into numerical anchors or paired sums',()=>{
 for(const samples of [[true,true],[null,null],['28junk','28'],Array(2)]){
 const input={detail:[{finishedReps:[{trainingInfoDetail:{leftWeights:samples,rightWeights:[28,28],leftTimestamps:[100,200],rightTimestamps:[100,200]}}]}],gmCoachSessionSummary:{weightUnit:'kg',exercises:[{exercise:'Any',path:'$.detail[0]',sets:[{set:1,reps:2,unit:'reps',weightUnit:'kg',side:0}]}]}};
 const set=projectSessionPlanningView(input).exercises[0].sets[0];
 assert.equal(set.reportedCableSum,undefined);
 assert.ok(!set.observedRepLoadEvidence.some(row=>row.channel==='left-cable'));
 }
});
