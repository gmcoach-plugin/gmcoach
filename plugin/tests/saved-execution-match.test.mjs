import test from 'node:test';
import assert from 'node:assert/strict';
import {compareSavedExecution,reconcileSavedSourceRecord,reconstructPortableSourceFromAccountTemplate} from '../saved-execution-match.mjs';
import {importPortablePlan} from '../portable-plan-codec.mjs';

// Sent wire (record.expectedPayload) of live W1 GA 6aef9501…, 4 representative rows.
const sent=()=>({id:1423071,code:'6aef9501e4b04f0c79a5780e',name:'HYP GM1 W1 DA',actionLibraryList:[
 {groupId:426056816001025,actionLibraryId:426057105408001,templatePresetId:-1,setsAndReps:'45,45',breakTime:'1,10',breakTime2:'1,10',sportMode:'1,1',leftRight:'1,2',completionMethod:'2,2',countType:'2,2',weights:'0,0',counterweight:'',counterweight2:'',level:'0,0'},
 {groupId:57,actionLibraryId:427629910687745,templatePresetId:-1,setsAndReps:'8,8',breakTime:'60,60',breakTime2:'60,60',sportMode:'1,1',leftRight:'0,0',completionMethod:'1,1',countType:'1,1',weights:'79.2,79.2',counterweight:'',counterweight2:'',level:'0,0'},
 {groupId:448,actionLibraryId:426008469897217,templatePresetId:1,setsAndReps:'10,10,10',breakTime:'120,120,120',breakTime2:'120,120,120',sportMode:'1,1,1',leftRight:'0,0,0',completionMethod:'1,1,1',countType:'1,1,1',weights:'3.5,3.5,3.5',counterweight:'13,13,13',counterweight2:'13,13,13',level:'0,0,0'},
 {groupId:372776194670593,actionLibraryId:424226731393025,templatePresetId:-1,setsAndReps:'30,30',breakTime:'1,10',breakTime2:'1,10',sportMode:'1,1',leftRight:'1,2',completionMethod:'2,2',countType:'2,2',weights:'0,0',counterweight:'',counterweight2:'',level:'0,0',tabId:5}]});
// Unchanged template as Speediance returns it: completionMethod 2→0, countType 1→2,
// breakTime only as breakTime2, RM preset encoding rewritten, catalog display fields added.
const live=()=>{const w=sent();w.actionLibraryList=w.actionLibraryList.map((a,i)=>{const b={...a,completionMethod:a.completionMethod.replaceAll('2','0'),countType:a.countType.replaceAll('1','2'),
 ...(a.templatePresetId>0?{weights:'0,0,0',counterweight:'',counterweight2:''}:{}),title:'Row '+i,coach:{id:32,name:'Daniel'},completionTimeVoice:'https://us-image.speediance.com/1769587623150.mp3'};delete b.breakTime;return b;});return w;};
const fp='a'.repeat(64);

test('W1: server normalization and display fields do not make the record stale',()=>{
 assert.deepEqual(compareSavedExecution(sent(),live()),{status:'matched',differences:[]});
 const r=reconcileSavedSourceRecord({record:{accountFingerprint:fp,expectedPayload:sent()},identityStatus:'stale',currentWire:live(),accountFingerprint:fp});
 assert.equal(r.status,'matched');assert.equal(r.via,'execution-projection');
});
test('static load echoed in kg for lb wire still matches',()=>{const l=live();l.actionLibraryList[1].weights='35.9,35.9';assert.equal(compareSavedExecution(sent(),l).status,'matched');});
for(const [label,mutate,path] of [
 ['exercise swap',w=>{w.actionLibraryList[1].actionLibraryId=1;},'actionLibraryId'],
 ['set count',w=>{w.actionLibraryList[2].setsAndReps='10,10';},'sets'],
 ['reps',w=>{w.actionLibraryList[1].setsAndReps='8,10';},'amount'],
 ['duration',w=>{w.actionLibraryList[0].setsAndReps='45,60';},'amount'],
 ['load',w=>{w.actionLibraryList[1].weights='90,90';},'weight'],
 ['rest',w=>{w.actionLibraryList[2].breakTime2='90,120,120';},'rest'],
 ['RM preset (W6 Customize)',w=>{w.actionLibraryList[2].templatePresetId=-1;},'templatePresetId'],
 ['order',w=>{w.actionLibraryList.reverse();},'groupId']]){
 test('real change is detected: '+label,()=>{const l=live();mutate(l);const r=compareSavedExecution(sent(),l);assert.equal(r.status,'stale');assert.ok(r.differences.some(d=>d.path.includes(path)),JSON.stringify(r.differences));});
}
test('foreign account record is stale',()=>{assert.equal(reconcileSavedSourceRecord({record:{accountFingerprint:'b'.repeat(64),expectedPayload:sent()},identityStatus:'stale',currentWire:live(),accountFingerprint:fp}).status,'stale');});
test('edited record uses approved final wire as reference',()=>{const fin=sent();fin.actionLibraryList[1].breakTime2='90,90';const l=live();l.actionLibraryList[1].breakTime2='90,90';
 assert.equal(reconcileSavedSourceRecord({record:{accountFingerprint:fp,expectedPayload:sent(),savedEdit:{finalWirePayload:fin}},identityStatus:'stale',currentWire:l,accountFingerprint:fp}).status,'matched');});
test('fallback reconstructs an importable source from the account template',()=>{
 const out=reconstructPortableSourceFromAccountTemplate({currentWire:live(),templateCode:'6aef9501e4b04f0c79a5780e',name:'HYP GM1 W1 DA',reason:'saved-template-changed-since-review'});
 assert.equal(out.status,'exported-reconstructed-source');assert.equal(out.origin,'reconstructed-from-account-template');
 assert.equal(out.originVerified,false);assert.equal(out.requiresFreshScientificReview,true);assert.equal(out.writeReady,false);
 for(const f of ['rirTarget','sourceRmSelector','evidence','static weight unit'])assert.ok(out.omissions.some(o=>o.field===f),f);
 const imported=importPortablePlan({referenceClientJson:out.referenceClientJson,sidecar:out.sidecar});
 const ex=imported.sourceArchive.prescription.exercises;
 assert.equal(ex.length,4);assert.equal(ex[0].unilateralPrescription,'explicit-sides');assert.equal(ex[0].sets[0].durationSeconds,45);
 assert.equal(ex[1].loadType,'customize-manual');assert.equal(ex[1].sets[0].weight,79.2);
 assert.equal(ex[2].smartRmPresetName,'Gain Muscle');assert.equal(ex[3].section,'stretching');
});
test('fallback refuses unknown RM preset',()=>{const l=live();l.actionLibraryList[2].templatePresetId=9;assert.equal(reconstructPortableSourceFromAccountTemplate({currentWire:l,templateCode:'X'}).status,'unavailable');});
test('W6: kg account gets kg Customize loads and an importable non-empty referenceClientJson',()=>{
 const l=live();l.actionLibraryList[1].weights='118.8,110';l.actionLibraryList[1].title='Incline Barbell Bench Press';l.actionLibraryList[2].templatePresetId=-1;l.actionLibraryList[2].weights='85.8,85.8,85.8';
 const out=reconstructPortableSourceFromAccountTemplate({currentWire:l,templateCode:'W6',name:'HYP GM1 W6',reason:'record-missing',staticWeightUnit:'lb',accountUnit:'kg'});
 assert.equal(out.status,'exported-reconstructed-source');
 const ex=out.sourceArchive.prescription.exercises;
 assert.deepEqual(ex[1].sets.map(s=>[s.weight,s.weightUnit]),[[54,'kg'],[50,'kg']]);assert.equal(ex[2].sets[0].weight,39);
 assert.ok(out.referenceClientJson.exercises.length>=2);assert.equal(out.referenceClientExecutionCoverage,'reps-rows-from-account-template');
 assert.ok(out.mapping?.length??out.sidecar);
 const imported=importPortablePlan({referenceClientJson:out.referenceClientJson,sidecar:out.sidecar});
 assert.equal(imported.sourceArchive.prescription.exercises[1].sets[0].weight,54);
});
test('lb account: lb loads on the kg device step and an importable referenceClientJson',()=>{const l=live();l.actionLibraryList[1].weights='120,79.2';l.actionLibraryList[1].title='Incline Barbell Bench Press';
 const out=reconstructPortableSourceFromAccountTemplate({currentWire:l,templateCode:'X',staticWeightUnit:'lb',accountUnit:'lb'});const s=out.sourceArchive.prescription.exercises[1].sets;
 assert.deepEqual(s.map(x=>[x.weight,x.weightUnit]),[[119,'lb'],[79.4,'lb']]);assert.ok(out.referenceClientJson.exercises.length>=1,out.referenceClientExportError);
 assert.equal(importPortablePlan({referenceClientJson:out.referenceClientJson,sidecar:out.sidecar}).sourceArchive.prescription.exercises[1].sets[0].weight,119);});
