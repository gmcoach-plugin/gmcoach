import {createHash} from 'node:crypto';
import {inspectWorkoutJson} from './workout-json-interop.mjs';
import {archiveRawPortableSource} from './portable-source-adapter.mjs';
import {resolveActionLibraryVariantId} from './program-serialization.mjs';
import {resolveStaticLoadMetadata} from './static-load-limits.mjs';
import {validateReferenceClientRmLevel} from './program-payload.mjs';
import {normalizeEvidencePlanItems} from './training-evidence.mjs';

function data(value,depth=0,state={nodes:0}) {
 if(++state.nodes>20000||depth>16)throw Error('Candidate facts exceed bounds.');
 if(value===null||typeof value==='boolean'||typeof value==='number'&&Number.isFinite(value))return value;
 if(typeof value==='string'&&value.length<=20000)return value;
 if(!value||typeof value!=='object'||![Object.prototype,Array.prototype,null].includes(Object.getPrototypeOf(value)))throw Error('Plain candidate facts required.');
 const out=Array.isArray(value)?[]:{};const names=Reflect.ownKeys(value).filter(k=>!(Array.isArray(value)&&k==='length'));
 if(Array.isArray(value)&&(names.length!==value.length||names.some((k,i)=>k!==String(i))))throw Error('Dense candidate facts required.');
 for(const k of names){const d=Object.getOwnPropertyDescriptor(value,k);if(typeof k!=='string'||['__proto__','constructor','prototype'].includes(k)||!d.enumerable||!Object.hasOwn(d,'value'))throw Error('Unsafe candidate facts descriptor.');out[k]=data(d.value,depth+1,state);}
 return out;
}
function keys(v,allowed,required=allowed){if(!v||typeof v!=='object'||Array.isArray(v)||Object.keys(v).some(k=>!allowed.includes(k))||required.some(k=>!Object.hasOwn(v,k)))throw Error('Exact candidate fact fields required.');}
const integer=(v,a,b)=>Number.isSafeInteger(v)&&v>=a&&v<=b;
export function importedCandidateSourceDigest(workoutJson){const observed=inspectWorkoutJson({workoutJson});return createHash('sha256').update(JSON.stringify(observed.originalWorkout)).digest('hex');}
export function validateImportedCandidateRequest(input){input=data(input);keys(input,['profile','workoutJson','sourceDigest','facts','staticWeightUnit'],['profile','workoutJson','sourceDigest','facts']);if(typeof input.profile!=='string'||!input.profile.trim())throw Error('Explicit candidate profile required.');if(input.sourceDigest!==importedCandidateSourceDigest(input.workoutJson))throw Error('reference client source digest changed.');return input;}

// Catalog and metadata are server-service arguments, never public caller fields.
export function completeImportedCandidate(input,catalog,metadataById){
 input=validateImportedCandidateRequest(input);
 const observed=inspectWorkoutJson({workoutJson:input.workoutJson,...(input.staticWeightUnit===undefined?{}:{staticWeightUnit:input.staticWeightUnit})});
 const sourceDigest=importedCandidateSourceDigest(input.workoutJson);if(input.sourceDigest!==sourceDigest)throw Error('reference client source digest changed.');
 keys(observed.originalWorkout,['name','exercises']);
 if(observed.exercises.length>30||observed.exercises.reduce((n,e)=>n+e.sets.length,0)>100)throw Error('Portable candidate exceeds 30 exercises/100 sets.');
 const facts=input.facts;keys(facts,['goal','warmup','postWorkoutStretching','supersetBlocks','exercises']);
 if(typeof facts.goal!=='string'||!facts.goal.trim()||facts.goal.length>300)throw Error('Explicit goal required.');
 if(!Array.isArray(facts.exercises)||facts.exercises.length!==observed.exercises.length)throw Error('Exhaustive exercise facts required.');
 const sections=normalizeEvidencePlanItems(facts.warmup,facts.postWorkoutStretching);
 const archivedSections=Object.fromEntries(Object.entries(sections).map(([key,s])=>[key,{status:s.status==='included'?'included':'omitted',instructions:s.items.map(item=>key==='warmup'?`${item.activity}: ${item.dosage}`:`${item.target}: ${item.method}; ${item.dosage}; ${item.instructions}`)}]));
 const prescription={name:observed.name,...archivedSections,supersetBlocks:facts.supersetBlocks,exercises:observed.exercises.map((ex,i)=>{
  keys(observed.originalWorkout.exercises[i],['id','title','preset','isUnilateralExpanded','sets'],['id','title','preset','sets']);
  const f=facts.exercises[i];keys(f,['importedExerciseIndex','actionLibraryId','section','sets']);
  if(f.importedExerciseIndex!==i||!integer(f.actionLibraryId,1,1000000000)||!['warmup','main','stretching'].includes(f.section)||!Array.isArray(f.sets)||f.sets.length!==ex.sets.length)throw Error('Exact exhaustive exercise identity required.');
  const matches=catalog.exercises.filter(r=>r.id===ex.catalogGroupId);if(matches.length!==1||typeof matches[0].title!=='string')throw Error('Unique confirmed catalog group required.');
  const metadata=metadataById.get(ex.catalogGroupId),variant=resolveActionLibraryVariantId({id:ex.catalogGroupId,title:matches[0].title,actionLibraryId:f.actionLibraryId},metadata),geometry=resolveStaticLoadMetadata(metadata);
  if(typeof geometry.isUnilateral!=='boolean')throw Error('Confirmed catalog side geometry required.');
  if(ex.importedExpansionFlag!==null&&ex.importedExpansionFlag!==geometry.isUnilateral)throw Error('Source expansion flag contradicts confirmed catalog geometry; propose an explicit source correction first.');
  const manual=ex.presetId===-1;if(!manual&&!['Gain Muscle','Strength','Stamina'].includes(ex.sets[0].load.presetName))throw Error('Explicit known source preset required.');
  const sets=ex.sets.map((s,j)=>{
   keys(observed.originalWorkout.exercises[i].sets[j],['reps','weight','mode','rest']);
   const sf=f.sets[j];keys(sf,['importedSetIndex','unit','side','rirTarget'],['importedSetIndex','unit']);
   if(sf.importedSetIndex!==j||!['reps','seconds'].includes(sf.unit)||!integer(s.importedAmount,1,sf.unit==='seconds'?86400:100)||![1,2,3].includes(s.mode)||!integer(s.restSeconds,0,600))throw Error('Exact valid set dose facts required.');
   if(geometry.isUnilateral){if(sf.side!==(j%2?2:1)||f.sets.length%2)throw Error('Explicit ordered left/right source rows required; no automatic duplication.');}else if(sf.side!==undefined)throw Error('Bilateral row cannot declare sides.');
   if(sf.unit==='reps'&&!integer(sf.rirTarget,0,5)||sf.unit==='seconds'&&sf.rirTarget!==undefined)throw Error('Explicit repetition RIR or timed no-RIR required.');
   const row={unit:sf.unit,...(sf.unit==='reps'?{reps:s.importedAmount,rirTarget:sf.rirTarget}:{durationSeconds:s.importedAmount}),...(sf.side===undefined?{}:{side:sf.side}),mode:s.mode,restSeconds:s.restSeconds};
   if(manual){if(!['kg','lb'].includes(input.staticWeightUnit)||!Number.isFinite(s.load.value)||s.load.value<=0)throw Error('Explicit source Customize unit and load required.');Object.assign(row,{weight:s.load.value,weightUnit:input.staticWeightUnit});}
   else{if(sf.unit!=='reps'||!integer(s.load.selector,1,20))throw Error('Named RM requires exact repetition selector.');validateReferenceClientRmLevel({rmLevel:s.load.selector,reps:s.importedAmount,presetName:s.load.presetName});Object.assign(row,{sourceRmSelector:s.load.selector});}
   return row;
  });
  return {entryId:i+1,id:ex.catalogGroupId,actionLibraryId:variant,title:matches[0].title,section:f.section,loadType:manual?'customize-manual':'smart-rm',...(manual?{}:{smartRmPresetName:ex.sets[0].load.presetName}),...(geometry.isUnilateral?{unilateralPrescription:'explicit-sides'}:{}),sets};
 })};
 const archive=archiveRawPortableSource({prescription,research:{evidence:[],decisionEvidence:[]}});
 const planArguments={name:prescription.name,...sections,supersetBlocks:prescription.supersetBlocks,exercises:prescription.exercises.map(ex=>({...ex,...(ex.loadType==='customize-manual'?{staticLoadRequested:true}:{}),sets:ex.sets.map(({sourceRmSelector,...row})=>row)})),evidence:[],decisionEvidence:[]};
 return {...archive,status:'completed-unapproved-reference-client-candidate',sourceDigest,originalWorkout:observed.originalWorkout,confirmedFacts:facts,goalConfirmation:facts.goal,planArguments,sourceSelectors:prescription.exercises.flatMap(ex=>ex.sets.flatMap((s,j)=>s.sourceRmSelector===undefined?[]:[{entryId:ex.entryId,setIndex:j,selector:s.sourceRmSelector}])),catalogRead:true,scientificApproval:false,writeReady:false,mutationSent:false,requiresFreshScientificPreview:true,requiresFreshResearch:true,originVerified:false};
}
