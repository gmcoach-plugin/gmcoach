import {createHash} from 'node:crypto';
import {normalizeLiteralTemplatePresetDisplayVariants} from './exercise-library.mjs';

const own=(object,key,optional=false)=>{const d=Object.getOwnPropertyDescriptor(object,key);if(!d){if(key in object||!optional)throw new TypeError('Missing own display argument.');return undefined;}if(!Object.hasOwn(d,'value'))throw new TypeError('Display accessors forbidden.');return d.value;};
const positive=value=>typeof value==='number'&&Number.isSafeInteger(value)&&value>0;
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const digest=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
const selector=value=>positive(value)?value:typeof value==='string'&&/^[1-9]\d{0,15}$/.test(value)&&Number.isSafeInteger(Number(value))?Number(value):null;

// Capture once before any await. This opt-in never accepts local mutation arguments.
export function captureSavedPresetDisplayArguments(args){
 if(!args||typeof args!=='object'||Array.isArray(args))throw new TypeError('Display arguments required.');
 const allowed=new Set(['profile','program_code','output_view','output_scope','metadata_offset','metadata_group_limit','expected_program_digest','expected_account_scope']);
 for(const key of Reflect.ownKeys(args))if(typeof key!=='string'||!allowed.has(key))throw new TypeError('Unsupported enriched saved-read argument.');
 const profile=own(args,'profile',true),programCode=own(args,'program_code'),view=own(args,'output_view'),scope=own(args,'output_scope');
 const rawGroupLimit=own(args,'metadata_group_limit',true),groupLimit=rawGroupLimit===undefined?4:rawGroupLimit;
 if(!Number.isSafeInteger(groupLimit)||groupLimit<1||groupLimit>8)throw new TypeError('Invalid metadata group limit.');
 const rawOffset=own(args,'metadata_offset',true),offset=rawOffset===undefined?0:rawOffset,expectedProgramDigest=own(args,'expected_program_digest',true),expectedAccountScope=own(args,'expected_account_scope',true);
 if(profile!==undefined&&(typeof profile!=='string'||profile.length<1||profile.length>128)||typeof programCode!=='string'||!/^[A-Za-z0-9._-]{1,128}$/.test(programCode)||!['full','presentation'].includes(view)||scope!=='exact-program-with-preset-metadata'||!Number.isSafeInteger(offset)||offset<0||offset>10000)throw new TypeError('Invalid enriched saved-read scope.');
 if((expectedProgramDigest===undefined)!==(expectedAccountScope===undefined)||offset>0&&expectedProgramDigest===undefined||expectedProgramDigest!==undefined&&(!digest(expectedProgramDigest)||!digest(expectedAccountScope)))throw new TypeError('Continuation digest and account scope required together.');
 return Object.freeze({profile,programCode,outputView:view,offset,groupLimit,expectedProgramDigest,expectedAccountScope});
}

// Pure selection from the exact fresh template + its normalized readable rows.
export function collectSavedPresetDisplayGroups(template,readable){
 if(!Array.isArray(template?.actionLibraryList)||!Array.isArray(readable?.exercises)||template.actionLibraryList.length!==readable.exercises.length||template.actionLibraryList.length>100)throw new TypeError('Exact readable/template alignment required.');
 const groups=new Map();let totalSets=0;
 for(let actionIndex=0;actionIndex<template.actionLibraryList.length;actionIndex++){
  const action=template.actionLibraryList[actionIndex],exercise=readable.exercises[actionIndex];
  const groupId=own(action,'groupId'),variantId=own(action,'actionLibraryId');
  if(!positive(groupId)||!positive(variantId)||exercise.exerciseId!==groupId||exercise.actionLibraryId!==variantId||!Array.isArray(exercise.sets)||exercise.sets.length<1||exercise.sets.length>100)throw new TypeError('Fresh saved occurrence identity unavailable.');
  const work=own(action,'setsAndReps');if(typeof work!=='string'||work.length>2000||!work.trim()||work.split(',').length!==exercise.sets.length)throw new TypeError('Saved set cardinality mismatch.');
  totalSets+=exercise.sets.length;if(totalSets>10000)throw new TypeError('Saved occurrence limit exceeded.');
  for(let index=0;index<exercise.sets.length;index++)if(!Object.hasOwn(exercise.sets,index)||exercise.sets[index]?.set!==index+1)throw new TypeError('Unique aligned sequential saved sets required.');
  const cells=['templatePresetId','presetId','preset_id'].map(key=>({key,value:own(action,key,true)})).filter(x=>x.value!==undefined);
  const ids=cells.map(x=>selector(x.value));const selected=ids.length&&ids.every(x=>x!==null)&&new Set(ids).size===1?ids[0]:null;
  for(const set of exercise.sets){
   if(set.loadType!=='preset-load-unknown'||set.recordedPresetName!==undefined)continue;
   if(!Number.isSafeInteger(set.set)||set.set<1||set.set>100)throw new TypeError('Exact set identity required.');
   let group=groups.get(groupId);if(!group){group={groupId,occurrences:[]};groups.set(groupId,group);}
   group.occurrences.push({actionIndex,set:set.set,actionLibraryId:variantId,selector:selected!==null&&selected===set.recordedPresetId?selected:null});
  }
 }
 return [...groups.values()];
}

// No transport catch: code91/account drift remain fatal through actual MCP error catch.
// io.readTemplate/readable are required integration adapters, not a default API fallback.
export async function readSavedPresetDisplayPage(captured,io){
 for(const key of ['readTemplate','readable','templateDigest','assertCurrent','metadataGet','beforeSend','clock'])if(typeof io[key]!=='function')throw new TypeError('Bound saved-display adapter missing.');
 if(!digest(io.accountScope))throw new TypeError('Server-derived nonsecret account scope required.');
 const startedAt=io.clock();await io.assertCurrent();
 const template=await io.readTemplate(captured.programCode);await io.assertCurrent();
 if(template.code!==captured.programCode)throw new Error('Saved program identity changed.');
 const baseDigest=io.templateDigest(template);if(!digest(baseDigest))throw new TypeError('Fresh template digest required.');
 if(captured.expectedProgramDigest!==undefined&&(captured.expectedProgramDigest!==baseDigest||captured.expectedAccountScope!==io.accountScope))throw new Error('Saved program or account scope changed; discard continuation.');
 const readable=await io.readable(template);await io.assertCurrent();
 const groups=collectSavedPresetDisplayGroups(template,readable),groupListDigest=hash(groups);
 if(captured.offset>groups.length||groups.length>0&&captured.offset===groups.length)throw new TypeError('Offset outside pending group list.');
 const selected=groups.slice(captured.offset,captured.offset+captured.groupLimit);let presetDisplay=[],additionalMetadataGET=0;
 const details=[];
 // Sequential by design: no queued request can start after the first failed GET.
 for(const group of selected){
  await io.assertCurrent();
  details.push(await io.metadataGet(`/app/actionLibraryGroup/${group.groupId}?isDisplay=1`,{beforeSend:io.beforeSend},false));additionalMetadataGET++;
  await io.assertCurrent();
 }
 if(selected.length){
  await io.assertCurrent();
  const query=selected.map(group=>`ids=${group.groupId}`).join('&');
  const batch=await io.metadataGet(`/app/actionLibraryGroup/list?${query}`,{beforeSend:io.beforeSend},false);additionalMetadataGET++;
  await io.assertCurrent();
  for(let groupIndex=0;groupIndex<selected.length;groupIndex++){
  const group=selected[groupIndex],detail=details[groupIndex];
  const variantIds=[...new Set(group.occurrences.map(row=>row.actionLibraryId))];
  const byVariant=new Map(normalizeLiteralTemplatePresetDisplayVariants(detail,batch,{exerciseId:group.groupId,variantIds}).map(row=>[row.variantId,row.result]));
  const safeReasons=new Set(['resource-bound','group-scope-mismatch','batch-scope-ambiguous-or-missing','invalid-batch-row','invalid-input','invalid-scope','cross-source-disagreement']);
  const occurrences=group.occurrences.map(row=>{
   const offer=byVariant.get(row.actionLibraryId),match=offer.status==='concordant-contextual-display-only'&&row.selector!==null?offer.offers.find(x=>x.reportedItemId===row.selector):null;
   const status=match?'contextual-display-match':offer.reason==='resource-bound'?'resource-bound':'unresolved';
   const reason=match?'exact-selector-and-variant-match':row.selector===null?'saved-selector-unqualified':offer.status==='concordant-contextual-display-only'?'selector-not-reported':safeReasons.has(offer.reason)?offer.reason:'metadata-schema-unqualified';
   return {actionIndex:row.actionIndex,set:row.set,actionLibraryId:row.actionLibraryId,status,reason,...(match?{recordedPresetId:row.selector,displayPresetName:match.reportedName,displayLoad:`${match.reportedName} (zapisany preset)`}:{})};
  });
  presetDisplay.push({groupId:group.groupId,status:occurrences.every(x=>x.status==='contextual-display-match')?'contextual-display-match':occurrences.some(x=>x.status==='resource-bound')?'resource-bound':'unresolved',occurrences,source:'same-read-exact-group-metadata',qualification:'display-only-not-writer-authority'});
  }
 }
 const endOffsetExclusive=captured.offset+selected.length,nextOffset=endOffsetExclusive<groups.length?endOffsetExclusive:null;
 const finishedAt=io.clock();
 const metadataPage={offset:captured.offset,endOffsetExclusive,nextOffset,groupsTotal:groups.length,groupsAttemptedThisPage:selected.length,attemptedGroupIds:selected.map(group=>group.groupId),groupListDigest,observedAt:finishedAt,readWindow:{startedAt,finishedAt},additionalMetadataGET,partial:nextOffset!==null||presetDisplay.some(group=>group.status==='resource-bound'),...(nextOffset===null?{}:{next:{metadata_offset:nextOffset,metadata_group_limit:captured.groupLimit,expected_program_digest:baseDigest,expected_account_scope:io.accountScope}})};
 let enrichment={schemaVersion:1,readOnly:true,executableAllowed:false,programCode:captured.programCode,baseDigest,accountScope:io.accountScope,metadataPage,presetDisplay};
 // Whole-group terminal records preserve every attempted identity without silent row truncation.
 while(Buffer.byteLength(JSON.stringify(enrichment),'utf8')>16384){
  let index=-1,largest=-1;
  for(let i=0;i<enrichment.presetDisplay.length;i++){
   const row=enrichment.presetDisplay[i];if(!Array.isArray(row.occurrences))continue;
   const bytes=Buffer.byteLength(JSON.stringify(row),'utf8');if(bytes>largest){largest=bytes;index=i;}
  }
  if(index<0)break;
  const group=selected[index];
  enrichment.presetDisplay[index]={groupId:group.groupId,status:'resource-bound',source:'same-read-exact-group-metadata',qualification:'display-only-not-writer-authority',reason:'output-envelope-bound',occurrencesOmitted:group.occurrences.length};
  enrichment.metadataPage.partial=true;
 }
 if(Buffer.byteLength(JSON.stringify(enrichment),'utf8')>16384)throw new Error('Saved preset display control envelope exceeds budget.');
 await io.assertCurrent();
 return {template,readable,enrichment}; // Integration returns existing complete plan + additive enrichment only.
}
