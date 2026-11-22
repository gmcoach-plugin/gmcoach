import {exportPortablePlan,importPortablePlan} from './portable-plan-codec.mjs';
import {exportWorkoutJson} from './workout-json-interop.mjs';
// Raw prescription adapter only: no normalized reviewed-record reconstruction.
// The codec supplies bounded descriptor-safe cloning and typed archive validation.
export function archiveRawPortableSource(input){
 if(!input||Object.getPrototypeOf(input)!==Object.prototype||Object.getOwnPropertySymbols(input).length)throw Error('Plain raw source input required.');
 const allowed=['prescription','research'];
 for(const key of Object.getOwnPropertyNames(input))if(!allowed.includes(key)||!Object.hasOwn(Object.getOwnPropertyDescriptor(input,key),'value'))throw Error('Only raw prescription and historical research are supported.');
 if(!Object.hasOwn(input,'prescription')||!Object.hasOwn(input,'research'))throw Error('Explicit raw prescription and research required.');
 // First pass validates entire raw source without traversing getters here.
 // All source sets intentionally remain source-only; this is NOT a reference client
 // executable export and does not invent missing RM selectors or unit context.
 const p=input.prescription;
 if(!p||Object.getPrototypeOf(p)!==Object.prototype)throw Error('Plain raw prescription required.');
 const pd=Object.getOwnPropertyDescriptor(p,'exercises'),nd=Object.getOwnPropertyDescriptor(p,'name');
 if(!pd||!Object.hasOwn(pd,'value')||!nd||!Object.hasOwn(nd,'value'))throw Error('Explicit source exercises/name required.');
 const exercises=pd.value;
 if(!Array.isArray(exercises)||Object.getPrototypeOf(exercises)!==Array.prototype||exercises.length<1||exercises.length>30||Object.getOwnPropertySymbols(exercises).length)throw Error('Bounded dense source exercises required.');
 const omissions=[];
 for(let i=0;i<exercises.length;i++){
  const d=Object.getOwnPropertyDescriptor(exercises,String(i));if(!d||!Object.hasOwn(d,'value'))throw Error('Dense data exercises required.');const ex=d.value;
  if(!ex||Object.getPrototypeOf(ex)!==Object.prototype)throw Error('Plain source exercise required.');
  const ed=Object.getOwnPropertyDescriptor(ex,'entryId'),sd=Object.getOwnPropertyDescriptor(ex,'sets');
  if(!ed||!Object.hasOwn(ed,'value')||!sd||!Object.hasOwn(sd,'value'))throw Error('Explicit entry identity/sets required.');
  const sets=sd.value;if(!Array.isArray(sets)||sets.length<1||sets.length>100||omissions.length+sets.length>100)throw Error('Source set bound.');
  for(let j=0;j<sets.length;j++)omissions.push({sourceEntryId:ed.value,sourceSetIndex:j,reason:'not-represented-in-reference-client-json'});
 }
 const referenceClientJson={name:nd.value,exercises:[]};
 const sidecar=exportPortablePlan({referenceClientJson,payload:{prescription:p,research:input.research,mapping:[],sourceOnlyOmissions:omissions,staticSourceContext:{unit:'unknown',protocol:'unknown'}}});
 return {kind:'gm-coach-raw-source-artifact',referenceClientJson,sidecar,referenceClientExecutionCoverage:'none-source-archive-only',...importPortablePlan({referenceClientJson,sidecar})};
}

export function exportRepresentablePortableSource(input){
 if(!input||Object.getPrototypeOf(input)!==Object.prototype||Object.getOwnPropertySymbols(input).length)throw Error('Plain export input required.');
 for(const k of Object.getOwnPropertyNames(input))if(!['source','staticWeightUnit','staticLoadProtocol','exerciseMetadata'].includes(k)||!Object.hasOwn(Object.getOwnPropertyDescriptor(input,k),'value'))throw Error('Unsupported export input.');
 const {source,staticWeightUnit,staticLoadProtocol,exerciseMetadata}=input;
 const archived=archiveRawPortableSource(source),payload=archived.sourceArchive;
 if(!Array.isArray(exerciseMetadata)||Object.getPrototypeOf(exerciseMetadata)!==Array.prototype||exerciseMetadata.length>30||Object.getOwnPropertySymbols(exerciseMetadata).length)throw Error('Explicit bounded source export metadata required.');
 const metadata=new Map();
 for(let i=0;i<exerciseMetadata.length;i++){
  const d=Object.getOwnPropertyDescriptor(exerciseMetadata,String(i));if(!d||!Object.hasOwn(d,'value'))throw Error('Dense metadata required.');const m=d.value;
  if(!m||Object.getPrototypeOf(m)!==Object.prototype||Object.getOwnPropertySymbols(m).length)throw Error('Plain metadata required.');
  for(const k of Object.getOwnPropertyNames(m))if(!['entryId','exportIsUnilateral','exportIsBarbell'].includes(k)||!Object.hasOwn(Object.getOwnPropertyDescriptor(m,k),'value'))throw Error('Unsupported metadata field.');
  if(!Number.isSafeInteger(m.entryId)||metadata.has(m.entryId)||typeof m.exportIsUnilateral!=='boolean'||m.exportIsBarbell!==undefined&&typeof m.exportIsBarbell!=='boolean')throw Error('Explicit export metadata required.');metadata.set(m.entryId,m);
 }
 const selected=[],mapping=[],omissions=[];
 for(const ex of payload.prescription.exercises){
  const representable=ex.section==='main'&&['smart-rm','customize-manual'].includes(ex.loadType)&&ex.sets.every(set=>set.unit==='reps');
  if(!representable){ex.sets.forEach((_,sourceSetIndex)=>omissions.push({sourceEntryId:ex.entryId,sourceSetIndex,reason:'not-represented-in-reference-client-json'}));continue;}
  const m=metadata.get(ex.entryId);if(!m)throw Error('Missing exact entry export metadata.');
  if(ex.unilateralPrescription==='paired-symmetric')throw Error('Paired-symmetric source requires explicit expansion; bilateral export forbidden.');
  const referenceClientExerciseIndex=selected.length;
  selected.push({...ex,...m,...(ex.loadType==='smart-rm'?{smartRmPresetId:{'Gain Muscle':1,Strength:5,Stamina:3}[ex.smartRmPresetName]}:{}),staticLoadRequested:ex.loadType==='customize-manual',sets:ex.sets.map((set,sourceSetIndex)=>{
   mapping.push({referenceClientExerciseIndex,referenceClientSetIndex:sourceSetIndex,sourceEntryId:ex.entryId,sourceSetIndex});
   if(ex.loadType==='smart-rm'&&set.sourceRmSelector===undefined)throw Error('Explicit source selector required; no default invented.');
   return {...set,rest:set.restSeconds,...(ex.loadType==='smart-rm'?{rmLevel:set.sourceRmSelector}:{})};
  })});
 }
 if(!selected.length)throw Error('No representable reference client source rows.');
 const exported=exportWorkoutJson({normalizedPlan:{name:payload.prescription.name,exercises:selected},staticWeightUnit,staticLoadProtocol});
 const pairedPayload={...payload,mapping,sourceOnlyOmissions:omissions,staticSourceContext:{unit:staticWeightUnit,protocol:staticLoadProtocol}};
 const sidecar=exportPortablePlan({referenceClientJson:exported.workoutJson,payload:pairedPayload});
 return {referenceClientJson:exported.workoutJson,sidecar,exportDiagnostics:exported,organisationOmissions:payload.prescription.supersetBlocks?.length?[{kind:'superset-interleaving-not-represented-in-reference-client-json',sourceBlockCount:payload.prescription.supersetBlocks.length,sourcePreservedInSidecar:true}]:[],...importPortablePlan({referenceClientJson:exported.workoutJson,sidecar})};
}
