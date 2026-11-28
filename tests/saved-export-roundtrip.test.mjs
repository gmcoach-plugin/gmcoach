import test from 'node:test';
import assert from 'node:assert/strict';
import {reconstructSavedPortableSource} from '../plugin/saved-source-reconstruction.mjs';
import {captureRetainedPortableSource,exportRetainedPortableSource} from '../plugin/retained-portable-source.mjs';
import {importPortablePlan} from '../plugin/portable-plan-codec.mjs';

const ev={id:'e12',researchSourceId:'pubmed:34125411',researchBatchIds:['80f8e534-df2a-491d-a3e7-7b51028383f9'],supports:'Parametry hipertrofii.',coveredCategories:['stretching_mobility'],title:'No Time to Lift?',publicationDate:'2021',finding:'Adaptacje oporowe.',population:'Dorośli.',limitations:'Brak identycznego eksperymentu.',url:'https://pubmed.ncbi.nlm.nih.gov/34125411/',pubmed:{sourceId:'pubmed:34125411',year:2021}};
const rm=(reps,rest)=>({unit:'reps',reps,rmLevel:13,rirTarget:5,mode:1,rest});
const sec=(d,side)=>({unit:'sec',durationSeconds:d,mode:1,rest:10,...(side?{side}:{})});
const cust=(reps,w,rest)=>({unit:'reps',reps,weight:w,weightUnit:'kg',rirTarget:3,mode:1,rest});
function w6(){return {name:'HYP GM1 W6 GA DELOAD',rationale:'Deload.',evidence:[ev],decisionEvidence:[],exercises:[
 {entryId:1001,section:'warmup',id:423504428269569,title:'Cross Leg Dynamic Thoracic Rotation',loadType:'bodyweight',actionLibraryId:428365809057793,sets:[sec(30)]},
 {entryId:1002,section:'warmup',id:2267,title:'Dynamic Shoulder Circles',loadType:'bodyweight',actionLibraryId:426190404583425,sets:[sec(30)]},
 {entryId:1003,section:'warmup',id:235,title:'Incline Barbell Bench Press',loadType:'customize-manual',actionLibraryId:424958774411265,sets:[cust(8,23,60)],staticLoadRequested:true},
 {entryId:1004,section:'main',id:235,title:'Incline Barbell Bench Press',loadType:'customize-manual',actionLibraryId:424958774411265,sets:[cust(8,54,150),cust(8,54,150)],staticLoadRequested:true},
 {entryId:1005,section:'main',id:391228942319617,title:'Floor Seated Dual-Handle Row',loadType:'customize-manual',actionLibraryId:424950719250433,sets:[cust(10,50,120),cust(10,50,120)],staticLoadRequested:true},
 {entryId:1007,section:'main',id:420080885039105,title:'Kneeling Dual-Handle Lat Pulldown',loadType:'smart-rm',smartRmPresetName:'Gain Muscle',actionLibraryId:424932291575809,sets:[rm(10,120),rm(10,120)]},
 {entryId:1006,section:'main',id:424915234783233,title:'Kneeling Dual-Handle Low-to-High Chest Fly',loadType:'smart-rm',smartRmPresetName:'Gain Muscle',actionLibraryId:424919462641665,sets:[rm(12,90)]},
 {entryId:1008,section:'main',id:465,title:'Standing Dual-Handle Lateral Raise',loadType:'smart-rm',smartRmPresetName:'Gain Muscle',actionLibraryId:423283430391809,sets:[rm(12,75)]},
 {entryId:1009,section:'main',id:294,title:'Standing Barbell Biceps Curl',loadType:'smart-rm',smartRmPresetName:'Gain Muscle',actionLibraryId:423464521564161,sets:[rm(12,75)]},
 {entryId:1010,section:'main',id:337,title:'Standing Barbell Triceps Push Down',loadType:'smart-rm',smartRmPresetName:'Gain Muscle',actionLibraryId:423879726202881,sets:[rm(12,75)]},
 {entryId:1011,section:'main',id:3460,title:'Straight Arm Barbell Crunch (Floor)',loadType:'smart-rm',smartRmPresetName:'Gain Muscle',actionLibraryId:425464317935617,sets:[rm(12,60)]},
 {entryId:1012,section:'stretching',id:372747822301185,title:'Chest Stretch',loadType:'bodyweight',unilateralPrescription:'explicit-sides',actionLibraryId:424062748786689,sets:[sec(25,1),sec(25,2)]},
 {entryId:1013,section:'stretching',id:372246883991553,title:'Shoulder Stretch',loadType:'bodyweight',actionLibraryId:424060869738497,sets:[sec(25)]}],
 warmup:{status:'included',items:[{executionRef:1001,kind:'dynamic_mobility',activity:'Cross Leg Dynamic Thoracic Rotation',dosage:'30 sekund'}]},
 postWorkoutStretching:{status:'included',items:[{executionRef:1012,target:'Chest Stretch',method:'static',dosage:'25 sekund L/P'}]}};}

test('W6 GA DELOAD without retained source: export -> import -> field-by-field equality',()=>{
 const plan=w6();assert.equal(plan.exercises.length,13);
 const out=reconstructSavedPortableSource({record:{plan,retainedPortableSource:{version:1,status:'unavailable',reason:'source-not-losslessly-representable-by-portable-v1'}},identityStatus:'matched',templateCode:'T1'});
 assert.equal(out.status,'exported-reconstructed-source',JSON.stringify(out));
 assert.equal(out.origin,'reconstructed-from-saved-template');assert.equal(out.originVerified,false);assert.equal(out.requiresFreshScientificReview,true);assert.equal(out.writeReady,false);
 const imported=importPortablePlan({referenceClientJson:out.referenceClientJson,sidecar:out.sidecar});
 assert.equal(imported.status,'unapproved-source-candidate');
 const got=imported.sourceArchive.prescription;
 assert.equal(got.name,plan.name);assert.equal(got.exercises.length,13);
 plan.exercises.forEach((ex,i)=>{const g=got.exercises[i];
  for(const k of ['entryId','id','actionLibraryId','title','section','loadType','smartRmPresetName','unilateralPrescription'])assert.equal(g[k],ex[k],ex.title+' '+k);
  assert.equal(g.sets.length,ex.sets.length,ex.title+' sets');
  ex.sets.forEach((s,j)=>{const o=g.sets[j];assert.equal(o.unit,s.unit==='sec'?'seconds':'reps');assert.equal(o.reps,s.reps);assert.equal(o.durationSeconds,s.durationSeconds);assert.equal(o.weight,s.weight);assert.equal(o.weightUnit,s.weightUnit);assert.equal(o.restSeconds,s.rest);assert.equal(o.mode,s.mode);assert.equal(o.side,s.side);assert.equal(o.sourceRmSelector,ex.loadType==='smart-rm'?s.rmLevel:undefined);});
 });
 assert.deepEqual(got.postWorkoutStretching.instructions,['Chest Stretch: 25 sekund L/P']);
 assert.equal(imported.sourceArchive.research.evidence[0].pubmed.year,2021);
});

test('large Speediance catalog ids are captured (previous v1 cause)',()=>{const plan=w6();const metadata=new Map(plan.exercises.map(ex=>[ex.id,{batch:{id:ex.id,actionLibraryList:[{id:ex.actionLibraryId}]}}]));const c=captureRetainedPortableSource(plan,plan,metadata);assert.equal(c.status,undefined,c.detail);});

test('unavailable reasons always carry concrete detail',()=>{
 const missing=reconstructSavedPortableSource({record:null,identityStatus:'missing',templateCode:'T1'});assert.equal(missing.reason,'source-not-captured');assert.match(missing.detail,/T1/);
 const changed=reconstructSavedPortableSource({record:{plan:w6()},identityStatus:'mismatch',templateCode:'T1'});assert.equal(changed.reason,'saved-template-changed-since-review');assert.match(changed.detail,/mismatch/);
 const bad=w6();bad.exercises[1].section='cooldown';const rejected=reconstructSavedPortableSource({record:{plan:bad},identityStatus:'matched',templateCode:'T1'});assert.equal(rejected.status,'unavailable');assert.match(rejected.detail,/section in entry 1002/);
 const old=exportRetainedPortableSource({record:{version:1,status:'unavailable',reason:'x',detail:'field y'},accountFingerprint:'a',templateCode:'T1',wireDigest:'b'});assert.equal(old.detail,'field y');
});

