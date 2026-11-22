import {createHash} from 'node:crypto';
import {archiveRawPortableSource, exportRepresentablePortableSource} from './portable-source-adapter.mjs';
import {resolveStaticLoadMetadata} from './static-load-limits.mjs';
import {resolveActionLibraryVariantId} from './program-serialization.mjs';

const hash=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
const digest=x=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x);
function snapshot(value){let nodes=0;const active=new Set();function visit(x,depth){if(++nodes>50000||depth>20)throw Error('Retained source bounds exceeded.');if(x===null||typeof x==='boolean'||typeof x==='string'){if(typeof x==='string'&&x.length>20000)throw Error('Retained source string bound.');return x;}if(typeof x==='number'&&Number.isFinite(x))return x;if(!x||typeof x!=='object'||active.has(x)||(Array.isArray(x)?Object.getPrototypeOf(x)!==Array.prototype:![Object.prototype,null].includes(Object.getPrototypeOf(x))))throw Error('Retained source requires plain JSON.');active.add(x);const array=Array.isArray(x),out=array?[]:{},names=Reflect.ownKeys(x).filter(k=>!(array&&k==='length'));if(array&&(names.length!==x.length||names.some((k,i)=>k!==String(i))))throw Error('Retained source requires dense arrays.');for(const k of names){const d=Object.getOwnPropertyDescriptor(x,k);if(typeof k!=='string'||['__proto__','prototype','constructor'].includes(k)||!d.enumerable||!Object.hasOwn(d,'value'))throw Error('Retained source rejects unsafe descriptors.');Object.defineProperty(out,k,{value:visit(d.value,depth+1),enumerable:true,writable:true,configurable:true});}active.delete(x);return out;}const out=visit(value,0);if(Buffer.byteLength(JSON.stringify(out))>1000000)throw Error('Retained source byte bound.');return out;}
function pick(value,keys){const out={};for(const key of keys){const d=Object.getOwnPropertyDescriptor(value,key);if(d){if(!d.enumerable||!Object.hasOwn(d,'value'))throw Error('Retained source rejects accessors.');if(d.value!==undefined)out[key]=snapshot(d.value);}}return out;}
function freeze(x){if(x&&typeof x==='object'){Object.values(x).forEach(freeze);Object.freeze(x);}return x;}
const planKeys=['name','rationale','supersetBlocks'];
const sectionKeys=['status','instructions','omissionReason'];
const sectionItemKeys=['kind','activity','target','method','instructions','dosage','targetExerciseIds','executionRef'];
function sections(plan){const out={};for(const key of ['warmup','postWorkoutStretching']){const declared=pick(plan,[key])[key];if(declared!==undefined){out[key]=pick(declared,sectionKeys);const items=pick(declared,['items']).items;if(items!==undefined)out[key].items=items.map(item=>pick(item,sectionItemKeys));}}return out;}
const exerciseKeys=['trainingGoal','entryId','id','actionLibraryId','title','section','loadType','smartRmPresetName','unilateralPrescription','sideTransitionSeconds','sideTransitionRationale'];
const setKeys=['side','unit','reps','durationSeconds','rirTarget','intensity','weight','weightUnit','weightKg','mode','restSeconds','rest'];

// Called only by server-owned preparation with its actual public input and
// normalized, unexpanded prescription. Never accepts historical API rows.
export function captureRetainedPortableSource(raw,expandedPlan,metadataById){
 try {
  const rawExercises=pick(raw,['exercises']).exercises;
  const original={...pick(raw,planKeys),...sections(raw),exercises:rawExercises.map(ex=>({...pick(ex,exerciseKeys),sets:ex.sets.map(set=>pick(set,setKeys))}))};
  const prescription={...pick(expandedPlan,planKeys),...sections(expandedPlan),exercises:expandedPlan.exercises.map(ex=>({...pick(ex,exerciseKeys),actionLibraryId:resolveActionLibraryVariantId(ex,metadataById.get(ex.id)),section:ex.section??'main',entryId:ex.entryId??ex.id,sets:ex.sets.map(set=>{const row=pick(set,['side','reps','durationSeconds','rirTarget','weight','weightUnit','weightKg','mode']);row.unit=set.unit==='sec'?'seconds':set.unit;row.restSeconds=set.rest;if(ex.loadType==='smart-rm')row.sourceRmSelector=set.rmLevel;return row;})}))};
  for(const key of ['warmup','postWorkoutStretching'])if(prescription[key]){const section=prescription[key];prescription[key]=pick(section,['status','instructions']);if(prescription[key].instructions===undefined)prescription[key].instructions=(pick(expandedPlan[key],['items']).items??[]).map(item=>`${item.activity??item.target}: ${item.dosage}`);if(typeof prescription[key].status==='string'&&prescription[key].status.startsWith('omitted'))prescription[key].status='omitted';}
  if(original.supersetBlocks!==undefined)prescription.supersetBlocks=original.supersetBlocks;
  const source={prescription,research:pick(raw,['evidence','decisionEvidence'])};
  archiveRawPortableSource(source);
  const body=snapshot({version:1,origin:'captured-public-input-and-server-normalization',original,source});
  return freeze({...body,sourceDigest:hash(body)});
 } catch(error) {return Object.freeze({version:1,status:'unavailable',reason:'source-not-losslessly-representable-by-portable-v1',detail:String(error?.message??error).slice(0,500)});}
}

export function retainedSourceExportMetadata(plan,metadataById){
 return plan.exercises.map(ex=>{const m=resolveStaticLoadMetadata(metadataById.get(ex.id));if(typeof m.isUnilateral!=='boolean')throw Error('Confirmed export side metadata missing.');return {entryId:ex.entryId??ex.id,exportIsUnilateral:m.isUnilateral,...(typeof m.isBarbell==='boolean'?{exportIsBarbell:m.isBarbell}:{})};});
}

export function bindRetainedPortableSource({candidate,accountFingerprint,templateCode,wireDigest,staticWeightUnit,staticLoadProtocol,exerciseMetadata}){
 if(!candidate||candidate.status==='unavailable')return candidate??{version:1,status:'unavailable',reason:'source-not-captured'};
 if(!digest(accountFingerprint)||!digest(wireDigest)||typeof templateCode!=='string'||!/^[A-Za-z0-9._-]{1,128}$/.test(templateCode))throw Error('Invalid retained source binding.');
 const clean=snapshot(candidate),{sourceDigest,...body}=clean;if(hash(body)!==sourceDigest)throw Error('Retained source digest mismatch.');archiveRawPortableSource(body.source);
 const bound=snapshot({version:1,status:'retained',candidate:clean,accountFingerprint,templateCode,wireDigest,staticWeightUnit,staticLoadProtocol,exerciseMetadata});
 return freeze({...bound,bindingDigest:hash(bound)});
}

export function exportRetainedPortableSource({record,accountFingerprint,templateCode,wireDigest}){
 const flags={writeReady:false,scientificApproval:false,requiresFreshScientificReview:true,originVerified:false};
 if(!record||record.status!=='retained')return {...flags,status:'unavailable',reason:record?.reason??'source-not-captured',detail:record?.detail??(record?'Zachowane źródło nie zawiera szczegółu odrzucenia.':'Szablon nie ma zachowanego źródła.')};
 const clean=snapshot(record),{bindingDigest,...bound}=clean;if(hash(bound)!==bindingDigest||bound.accountFingerprint!==accountFingerprint||bound.templateCode!==templateCode||bound.wireDigest!==wireDigest)throw Error('Retained source binding changed.');
 const {sourceDigest,...body}=bound.candidate;if(hash(body)!==sourceDigest)throw Error('Retained source digest mismatch.');
 let result;
 if(!['kg','lb'].includes(bound.staticWeightUnit)||body.source.prescription.exercises.some(ex=>ex.unilateralPrescription==='paired-symmetric'))result={...archiveRawPortableSource(body.source),referenceClientExecutionCoverage:'none-source-archive-only'};
 else {try{result=exportRepresentablePortableSource({source:body.source,staticWeightUnit:bound.staticWeightUnit,staticLoadProtocol:bound.staticLoadProtocol,exerciseMetadata:bound.exerciseMetadata});}catch(error){result={...archiveRawPortableSource(body.source),referenceClientExecutionCoverage:'none-source-archive-only',referenceClientExportUnavailableReason:'source-dose-not-representable-without-mutation',referenceClientExportUnavailableDetail:String(error?.message??error).slice(0,500)};}}
 return {...result,...flags,status:'exported-retained-source',sourceDigest,sourceProvenance:body.origin,originalPublicPrescription:body.original};
}
