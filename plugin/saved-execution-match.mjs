import {resolveSavedTemplateSetUnit} from './saved-templates.mjs';
import {archiveRawPortableSource,exportRepresentablePortableSource} from './portable-source-adapter.mjs';
import {quantizeCustomizeLoad} from './customize-load-step.mjs';
import {validateReferenceClientRmLevel} from './program-payload.mjs';

// Speediance normalizes saved templates on write/read: completionMethod 2→0 for
// timed sets, countType is rewritten, breakTime is echoed as breakTime2, and the
// GET adds ~100 catalog display fields (videos, voices, coaches) that change
// independently of the user's template. Compare only the executed dose.
const LB=0.45359237;
const list=(action,field,count)=>{const v=action?.[field];if(v===undefined||v===null||v==='')return Array(count).fill(null);const t=String(v).split(',').map(x=>x.trim());return t.length===1&&count>1?Array(count).fill(t[0]):t;};
const num=x=>x===null||x===undefined||x===''?null:Number(x);
function setUnit(action,index,count){
 let unit='unknown';try{unit=resolveSavedTemplateSetUnit(action,index,count).unit;}catch{}
 if(unit==='reps'||unit==='seconds')return unit;
 const code=list(action,'completionMethod',count)[index];
 return code==='1'?'reps':code==='0'||code==='2'?'seconds':'unknown';
}
export function projectSavedExecution(wire){
 const actions=wire?.actionLibraryList;
 if(!Array.isArray(actions)||!actions.length||actions.length>100)throw Error('Execution projection requires 1–100 actions.');
 return actions.map(action=>{
  const count=String(action?.setsAndReps??'').split(',').filter(x=>x.trim()!=='').length;
  if(!count||count>100)throw Error('Execution projection requires sets.');
  const amounts=list(action,'setsAndReps',count),rest=list(action,action.breakTime2!==undefined&&action.breakTime2!==''?'breakTime2':'breakTime',count),side=list(action,'leftRight',count),mode=list(action,'sportMode',count),level=list(action,'level',count),w=list(action,'weights',count),cw=list(action,'counterweight',count),cw2=list(action,'counterweight2',count);
  const presetId=Number(action.templatePresetId??-1);
  return {groupId:Number(action.groupId),actionLibraryId:Number(action.actionLibraryId),templatePresetId:presetId,tabId:action.tabId,title:typeof action.title==='string'?action.title:undefined,
   sets:amounts.map((a,i)=>({amount:num(a),unit:setUnit(action,i,count),rest:num(rest[i])??0,side:num(side[i])??0,mode:num(mode[i])??1,level:num(level[i])??0,
    ...(presetId>0?{}:{weight:num(w[i])??0,counterweight:num(cw[i]),counterweight2:num(cw2[i])})}))};
 });
}
const sameLoad=(a,b)=>{if(a===null||b===null)return a===b||(a??0)===(b??0);if(Math.abs(a-b)<=0.05)return true;return Math.abs(a*LB-b)<=0.15||Math.abs(b*LB-a)<=0.15;};
export function compareSavedExecution(referenceWire,currentWire){
 const ref=projectSavedExecution(referenceWire),cur=projectSavedExecution(currentWire),differences=[];
 if(ref.length!==cur.length)differences.push({path:'actions',expected:ref.length,actual:cur.length});
 for(let i=0;i<Math.min(ref.length,cur.length);i++){
  const r=ref[i],c=cur[i],p='actions['+i+']';
  for(const k of ['groupId','actionLibraryId','templatePresetId'])if(r[k]!==c[k])differences.push({path:p+'.'+k,expected:r[k],actual:c[k]});
  if(r.sets.length!==c.sets.length){differences.push({path:p+'.sets',expected:r.sets.length,actual:c.sets.length});continue;}
  r.sets.forEach((s,j)=>{const t=c.sets[j];for(const k of ['amount','unit','rest','side','mode','level'])if(s[k]!==t[k])differences.push({path:p+'.sets['+j+'].'+k,expected:s[k],actual:t[k]});
   if(r.templatePresetId<=0)for(const k of ['weight','counterweight','counterweight2'])if(!sameLoad(s[k],t[k]))differences.push({path:p+'.sets['+j+'].'+k,expected:s[k],actual:t[k]});});
 }
 return {status:differences.length?'stale':'matched',differences:differences.slice(0,50)};
}
// Reference wire of a reviewed record: the approved final wire (edit) or the sent payload.
export function reviewedRecordReferenceWire(record){return record?.savedEdit?.finalWirePayload??record?.expectedPayload??null;}

// identityStatus comes from the exact digest. When it is stale only because of
// server normalization/catalog display fields, the execution projection decides.
export function reconcileSavedSourceRecord({record,identityStatus,currentWire,accountFingerprint}){
 if(identityStatus==='matched')return {status:'matched',via:'identity-digest'};
 const reference=reviewedRecordReferenceWire(record);
 if(!record||!reference)return {status:identityStatus??'missing',via:'none'};
 if(record.accountFingerprint!==accountFingerprint)return {status:'stale',via:'account-fingerprint'};
 try{const cmp=compareSavedExecution(reference,currentWire);return {status:cmp.status,via:'execution-projection',differences:cmp.differences};}
 catch(error){return {status:'invalid',via:'execution-projection',detail:String(error?.message??error).slice(0,200)};}
}

const SECTION={3:'warmup',5:'stretching'};
// Last-resort export: rebuild a source-only archive from the current account template.
const PRESET={1:'Gain Muscle',3:'Stamina',5:'Strength'};
// staticWeightUnit: unit of weights in the built update wire (legacy protocol sends lb).
// accountUnit: verified account display unit; a kg account with lb wire gets kg (÷2.2, device Customize step).
export function reconstructPortableSourceFromAccountTemplate({currentWire,templateCode,name,reason,staticWeightUnit='lb',accountUnit,staticLoadProtocol='legacy-reference-client-wire-lb-get-kg'}){
 const flags={writeReady:false,scientificApproval:false,requiresFreshScientificReview:true,originVerified:false};
 let projection;try{projection=projectSavedExecution(currentWire);}catch(error){return {...flags,status:'unavailable',reason:'account-template-unreadable',detail:String(error?.message??error).slice(0,300)};}
 if(projection.length>30)return {...flags,status:'unavailable',reason:'account-template-too-large',detail:'Szablon ma ponad 30 ćwiczeń.'};
 const omissions=['rirTarget','sourceRmSelector','evidence','decisionEvidence','rationale','trainingGoal','supersetBlocks','warmup/stretching instructions'].map(field=>({field,reason:'not-recoverable-from-account-template'}));
 if(projection.some(ex=>ex.templatePresetId>0&&!PRESET[ex.templatePresetId]))return {...flags,status:'unavailable',reason:'account-template-not-representable',detail:'Nieznany preset Smart RM w szablonie konta.'};
 const toKg=staticWeightUnit==='lb'&&accountUnit==='kg',weightUnit=toKg?'kg':staticWeightUnit;
 const load=w=>!(w>0)?w:toKg?quantizeCustomizeLoad(w/2.2,'kg','nearest'):accountUnit==='lb'&&weightUnit==='lb'?quantizeCustomizeLoad(w,'lb','nearest'):w;
 let rmDefaulted=false;
 const rm=(ex,s)=>{if(ex.templatePresetId<=0||s.unit!=='reps')return {};try{return {sourceRmSelector:validateReferenceClientRmLevel({reps:s.amount,presetName:PRESET[ex.templatePresetId]}).rmLevel};}catch{return {};}finally{rmDefaulted=true;}};
 const exercises=projection.map((ex,i)=>{const sided=ex.sets.some(s=>s.side>0),manual=ex.templatePresetId<=0&&ex.sets.some(s=>s.weight>0);return {entryId:i+1,id:ex.groupId,actionLibraryId:ex.actionLibraryId,title:ex.title?.trim()?ex.title.trim().slice(0,200):'Ćwiczenie '+ex.groupId,section:SECTION[ex.tabId]??'main',...(sided?{unilateralPrescription:'explicit-sides'}:{}),
  loadType:ex.templatePresetId>0?'smart-rm':manual?'customize-manual':'bodyweight',...(ex.templatePresetId>0?{smartRmPresetName:PRESET[ex.templatePresetId]}:{}),
  sets:ex.sets.map(s=>({...(sided?{side:s.side}:{}),unit:s.unit,...(s.unit==='seconds'?{durationSeconds:s.amount}:{reps:s.amount}),restSeconds:s.rest,mode:s.mode,...(manual?{weight:load(s.weight),weightUnit}:{}),...rm(ex,s)}))};});
 if(exercises.some(ex=>ex.loadType==='customize-manual'))omissions.push({field:'static weight unit',reason:toKg?'converted-from-lb-wire-to-account-kg':'inferred-from-static-load-protocol-unverified'});
 if(rmDefaulted)omissions[1]={field:'sourceRmSelector',reason:'not-recoverable-from-account-template-preset-default-applied'};
 const source={prescription:{name:(String(name??currentWire?.name??'').trim()||String(templateCode)).slice(0,80),exercises},research:{evidence:[],decisionEvidence:[]}};
 try{
  // Barbell flag only selects reference client export load limits; inferred from the catalog title.
  const meta=exercises.map(ex=>({entryId:ex.entryId,exportIsUnilateral:ex.unilateralPrescription==='explicit-sides',exportIsBarbell:/barbell|sztang/i.test(ex.title)}));
  let exported=null,referenceClientExportError;try{exported=exportRepresentablePortableSource({source,staticWeightUnit:weightUnit,staticLoadProtocol,exerciseMetadata:meta});}catch(error){referenceClientExportError=String(error?.message??error).slice(0,300);}
  const base=exported??{...archiveRawPortableSource(source),referenceClientExecutionCoverage:'none-source-archive-only'};
  return {...base,...(exported?{referenceClientExecutionCoverage:'reps-rows-from-account-template'}:{referenceClientExportError}),...flags,status:'exported-reconstructed-source',origin:'reconstructed-from-account-template',sourceProvenance:'reconstructed-from-account-template',fallbackReason:reason??'record-missing-or-mismatched',omissions};
 }catch(error){return {...flags,status:'unavailable',reason:'account-template-not-representable',detail:String(error?.message??error).slice(0,300)};}
}
