import path from 'node:path';
import { createHash } from 'node:crypto';
import { lstatSync, openSync, fstatSync, readSync, closeSync, constants } from 'node:fs';
import { parseTrainingProfileRecord } from './coaching-profile.mjs';
import { expandPlanForSerialization } from './superset-serialization.mjs';
import { MAX_SERIALIZED_API_SETS } from './program-serialization.mjs';
import { expandUnilateralPrescription } from './unilateral-prescription.mjs';
import { normalizeSetWork } from './program-payload.mjs';
import { resolveStaticLoadMetadata } from './static-load-limits.mjs';
// Timing signatures describe object content; key insertion order is not a dose.
// Preserve array order and every field. Disk profile binding below intentionally
// retains its existing exact JSON digest contract.
const exactHash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const ordered=value=>Array.isArray(value)?value.map(ordered):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,ordered(value[key])])):value;
const hash=value=>exactHash(ordered(value));
// The process-local mutation queue cannot lock another MCP process. This final
// synchronous disk check runs inside beforeSend, after awaited transport setup.
export function assertCycleTrainingProfileCurrent(file,expectedDigest){
 let handle;let current=null;
 const same=(a,b)=>a.dev===b.dev&&a.ino===b.ino&&a.size===b.size&&a.mtimeMs===b.mtimeMs&&a.ctimeMs===b.ctimeMs;
 // Require both account directory and its accounts parent to survive the read.
 // Missing file is allowed only inside the same existing nonsymlink directories.
 const parents=[path.dirname(path.dirname(file)),path.dirname(file)];
 let directories;
 try{
  directories=parents.map(name=>{const stat=lstatSync(name);if(!stat.isDirectory()||stat.isSymbolicLink())throw Error('Unsafe training-profile parent.');return stat;});
  const verifyParents=()=>parents.forEach((name,index)=>{const stat=lstatSync(name);if(!stat.isDirectory()||stat.isSymbolicLink()||!same(directories[index],stat))throw Error('Training-profile parent identity changed.');});
  let before;
  try{before=lstatSync(file);}catch(error){if(error?.code!=='ENOENT')throw error;verifyParents();}
  if(before){
   if(!before.isFile()||before.isSymbolicLink()||before.size>512000)throw Error('Unsafe training-profile storage.');
   handle=openSync(file,constants.O_RDONLY|(constants.O_NOFOLLOW??0));const opened=fstatSync(handle);
   if(!same(before,opened))throw Error('Training-profile identity changed.');
   const buffer=Buffer.alloc(512001);let bytes=0,count;
   while(bytes<buffer.length&&(count=readSync(handle,buffer,bytes,buffer.length-bytes,null))>0)bytes+=count;
   if(bytes>512000||bytes!==opened.size||!same(opened,fstatSync(handle))||!same(opened,lstatSync(file)))throw Error('Training-profile changed during final read.');
   current=parseTrainingProfileRecord(JSON.parse(buffer.subarray(0,bytes).toString('utf8')));
  }else{
   // Recheck absence after parent validation; a newly created file invalidates null.
   let stillMissing=false;try{lstatSync(file);}catch(error){if(error?.code==='ENOENT')stillMissing=true;else throw error;}
   if(!stillMissing)throw Error('Training-profile appeared during final read.');
  }
  verifyParents();
 }catch(error){throw Error('Cycle training-profile could not be verified before dispatch.');}
 finally{if(handle!==undefined)closeSync(handle);}
 if(typeof expectedDigest!=='string'||!/^[a-f0-9]{64}$/.test(expectedDigest)||exactHash(current)!==expectedDigest)throw Error('Cycle training-profile changed before dispatch; prepare and review again.');
}
const rangeSchema={type:'object',additionalProperties:false,required:['minSeconds','maxSeconds','rationale','provenance'],properties:{minSeconds:{type:'number',minimum:0,maximum:86400},maxSeconds:{type:'number',minimum:0,maximum:86400},rationale:{type:'string',minLength:1,maxLength:500},provenance:{const:'caller-estimate'}}};
export const timeEstimationSchema={type:'object',additionalProperties:false,required:['version','executionScopeDigest','repDurationRanges','additionalSetupRange'],properties:{version:{const:1},executionScopeDigest:{type:'string',pattern:'^[a-f0-9]{64}$'},repDurationRanges:{type:'array',maxItems:MAX_SERIALIZED_API_SETS,items:{...rangeSchema,required:[...rangeSchema.required,'exerciseIndex','executedSetIndex'],properties:{...rangeSchema.properties,exerciseIndex:{type:'integer',minimum:0,maximum:29},executedSetIndex:{type:'integer',minimum:0,maximum:MAX_SERIALIZED_API_SETS-1}}}},additionalSetupRange:{anyOf:[rangeSchema,{type:'null'}],description:'Total additional preparation/configuration time, excluding all serialized work and rests. Null means unknown, never zero.'}}};
function normalizeRange(value){if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(k=>!['minSeconds','maxSeconds','rationale','provenance','exerciseIndex','executedSetIndex'].includes(k))||!Number.isFinite(value.minSeconds)||!Number.isFinite(value.maxSeconds)||value.minSeconds<0||value.maxSeconds<value.minSeconds||value.maxSeconds>86400||value.provenance!=='caller-estimate'||typeof value.rationale!=='string'||!value.rationale.trim()||value.rationale.length>500)throw Error('Invalid bounded time-estimation range.');return{minSeconds:value.minSeconds,maxSeconds:value.maxSeconds,rationale:value.rationale.trim(),provenance:value.provenance};}
export function normalizeTimeEstimation(value,exerciseCount){
 if(value===undefined)return undefined;
 if(!Number.isSafeInteger(exerciseCount)||exerciseCount<1||exerciseCount>30)throw Error('Invalid bounded exercise count for time estimates.');
 if(!value||value.version!==1||typeof value.executionScopeDigest!=='string'||! /^[a-f0-9]{64}$/.test(value.executionScopeDigest)||Object.keys(value).some(k=>!['version','executionScopeDigest','repDurationRanges','additionalSetupRange'].includes(k))||!Array.isArray(value.repDurationRanges)||value.repDurationRanges.length>MAX_SERIALIZED_API_SETS||!Object.hasOwn(value,'additionalSetupRange'))throw Error('Invalid time-estimation declaration.');
 const seen=new Set();const repDurationRanges=value.repDurationRanges.map(row=>{if(!Number.isSafeInteger(row.exerciseIndex)||row.exerciseIndex<0||row.exerciseIndex>=exerciseCount||!Number.isSafeInteger(row.executedSetIndex)||row.executedSetIndex<0||row.executedSetIndex>=MAX_SERIALIZED_API_SETS||seen.has(row.executedSetIndex))throw Error('Unmatched or duplicate time-estimation occurrence.');seen.add(row.executedSetIndex);return{exerciseIndex:row.exerciseIndex,executedSetIndex:row.executedSetIndex,...normalizeRange(row)};});
 if(value.additionalSetupRange!==null&&(Object.hasOwn(value.additionalSetupRange??{},'exerciseIndex')||Object.hasOwn(value.additionalSetupRange??{},'executedSetIndex')))throw Error('Total setup range cannot address one exercise.');
 return{version:1,executionScopeDigest:value.executionScopeDigest,repDurationRanges,additionalSetupRange:value.additionalSetupRange===null?null:normalizeRange(value.additionalSetupRange)};
}
export function assessPlanTimeBudget(plan,metadataById=new Map(),options={}){
 const assumptions=normalizeTimeEstimation(plan.timeEstimation,plan.exercises.length);const ranges=new Map((assumptions?.repDurationRanges??[]).map(row=>[row.executedSetIndex,row]));const used=new Set(),unresolved=[],defaultsApplied=new Set();let definite=0,min=0,max=0,typ=0;const execution=[];
 // Defaulted (model) parts are kept separately so history calibration scales only them.
 let dMin=0,dTyp=0,dMax=0;
 for(const entry of expandPlanForSerialization(plan)){
  const index=plan.exercises.indexOf(entry.exercise);if(index<0)throw Error('Time-budget execution occurrence is not mapped to the plan.');
  const metadata=resolveStaticLoadMetadata(metadataById.get(entry.exercise.id));
  if(metadata.isUnilateral!==true&&metadata.isUnilateral!==false)defaultsApplied.add('side-metadata-from-prescription');
  const sets=expandUnilateralPrescription(entry.exercise,entry.sets,{isUnilateral:metadata.isUnilateral,superset:entry.superset});
  for(const set of sets)execution.push({index,set});
 }
 if(execution.length>MAX_SERIALIZED_API_SETS)throw Error('Plan przekracza lokalny limit rozmiaru 100 serii po rozwinięciu stron i superserii; nie jest to potwierdzony limit Speediance.');
 const executionScopeDigest=hash({execution:execution.map(({index,set},position)=>({exerciseIndex:index,id:plan.exercises[index].id,entryId:plan.exercises[index].entryId??null,actionLibraryId:plan.exercises[index].actionLibraryId??null,section:plan.exercises[index].section??'main',loadType:plan.exercises[index].loadType,preset:plan.exercises[index].smartRmPresetName??null,exercisePrescription:Object.fromEntries(['smartRmPresetId','smartRmActionLibraryId','unilateralPrescription','sideTransitionSeconds','sideTransitionRationale','strengthAnchor','accessoryIds','accessories','equipment','bands','bandConfiguration','movementKind','dataStatType'].filter(key=>Object.hasOwn(plan.exercises[index],key)).map(key=>[key,plan.exercises[index][key]])),setPrescription:Object.fromEntries(Object.entries(set).filter(([key])=>!['loadEstimate','serializedDisplayWeight','serializedDisplayUnit','apiLoadNormalized','rmLevelValidation'].includes(key))),position,side:set.side??null,work:normalizeSetWork(set,position),rest:set.rest})),supersetBlocks:plan.supersetBlocks??[],warmup:plan.warmup??null,postWorkoutStretching:plan.postWorkoutStretching??null});
 if(assumptions&&assumptions.executionScopeDigest!==executionScopeDigest)throw Error('Time-estimation execution scope changed; regenerate explicit assumptions.');
 for(const[{index,set},position]of execution.map((row,index)=>[row,index])){
  const work=normalizeSetWork(set,position);if(work.unit==='seconds'){definite+=work.amount;min+=work.amount;max+=work.amount;typ+=work.amount;}else{const range=ranges.get(position);if(range){if(range.exerciseIndex!==index)throw Error('Time estimate addresses a different exercise occurrence.');used.add(position);min+=work.amount*range.minSeconds;max+=work.amount*range.maxSeconds;typ+=work.amount*(range.minSeconds+range.maxSeconds)/2;}else{const tempo=repTempoSeconds(plan.exercises[index],set);dMin+=work.amount*tempo[0];dTyp+=work.amount*tempo[1];dMax+=work.amount*tempo[2];defaultsApplied.add('rep-tempo');}}
  if(position<execution.length-1){if(!Number.isSafeInteger(set.rest)||set.rest<0)throw Error('Invalid executed rest for time assessment.');definite+=set.rest;min+=set.rest;max+=set.rest;typ+=set.rest;}
  // Side changes are already represented by expanded set.rest, including
  // explicit Left/Right rows and paired sideTransitionSeconds. Count them once.
  const previous=position>0?execution[position-1]:null;
  if(!assumptions?.additionalSetupRange&&(!previous||previous.index!==index)){const returning=execution.slice(0,position).some(row=>row.index===index);const change=returning?[10,15,20]:exerciseChangeSeconds(plan.exercises[index],!previous);dMin+=change[0];dTyp+=change[1];dMax+=change[2];defaultsApplied.add(returning?'superset-transition':'exercise-change-setup');}
 }
 for(const section of [plan.warmup,plan.postWorkoutStretching]){for(const item of Array.isArray(section?.items)?section.items:[]){if(item?.executionRef!==undefined&&item?.executionRef!==null)continue;const seconds=Number.isFinite(item?.durationSeconds)?item.durationSeconds:null;if(seconds!==null){min+=seconds;max+=seconds;typ+=seconds;}else{dMin+=60;dTyp+=90;dMax+=120;defaultsApplied.add('warmup-stretching-item');}}}
 if([...ranges.keys()].some(index=>!used.has(index)))throw Error('Unneeded repetition-duration assumption.');
 if(assumptions?.additionalSetupRange){min+=assumptions.additionalSetupRange.minSeconds;max+=assumptions.additionalSetupRange.maxSeconds;typ+=(assumptions.additionalSetupRange.minSeconds+assumptions.additionalSetupRange.maxSeconds)/2;}
 const calibration=options?.calibration&&Number.isFinite(options.calibration.factor)&&options.calibration.factor>0&&Number.isSafeInteger(options.calibration.samples)&&options.calibration.samples>0?options.calibration:null;
 const factor=calibration?Math.min(1.8,Math.max(0.6,calibration.factor)):1;
 min+=dMin*factor;typ+=dTyp*factor;max+=dMax*factor;min=Math.round(min);typ=Math.round(typ);max=Math.round(max);
 if(![definite,min,max].every(value=>Number.isFinite(value)&&value>=0&&value<=10_000_000))throw Error('Time-estimation totals exceed bounded arithmetic.');
 const limit=plan.confirmedSessionMinutes,status=plan.confirmedSessionMinutesStatus;if(status!==undefined&&!['unknown','decline','unlimited'].includes(status))throw Error('Invalid confirmed session time status.');if(limit!==undefined&&status!==undefined)throw Error('Contradictory confirmed session time limit and status.');if(limit!==undefined&&(!Number.isSafeInteger(limit)||limit<10||limit>240))throw Error('Invalid confirmed session time limit.');const complete=true;let budgetStatus=status==='unlimited'?'no-session-limit':limit===undefined?'limit-unknown':definite>limit*60?'definite-exceeds':typ>limit*60?'estimated-exceeds':max<=limit*60?'estimated-fits':'overlaps';
 const sessionEstimate={minMinutes:Math.round(min/60),typicalMinutes:Math.round(typ/60),maxMinutes:Math.round(max/60),source:calibration?'kalibrowane z '+calibration.samples+' treningów':'domyślne',calibrationFactor:Number(factor.toFixed(3)),defaultsApplied:[...defaultsApplied]};
 const limitCheck=sessionLimitCheck(limit,status,{min,typ,max,definite},plan);
 return{version:1,executionScopeDigest,definiteLowerBoundSeconds:definite,estimatedMinSeconds:min,estimatedTypicalSeconds:typ,estimatedMaxSeconds:max,coverage:'complete',unresolved,budgetStatus,sessionEstimate,limitCheck,sessionLimitMinutes:limit??null,sessionLimitStatus:limit===undefined?(plan.confirmedSessionMinutesStatus??'unknown'):'known',estimateProvenance:calibration?'default-model-calibrated-from-history':'default-model-and-caller-assumptions',assumptions:assumptions??null,assumptionsDigest:hash(assumptions??null),prescriptionDigest:hash({exercises:plan.exercises,supersetBlocks:plan.supersetBlocks??[]}),profileBudgetDigest:hash({sessionMinutes:limit??null,...(status==='unlimited'?{sessionMinutesStatus:'unlimited'}:{}),weeklyMinutes:plan.confirmedWeeklyMinutes??null})};
}
// Only the definite (time-fixed work + prescribed rests) lower bound blocks; model estimates only warn.
export function assertTimeBudgetAssessment(assessment){if(['definite-exceeds'].includes(assessment.budgetStatus))throw Error('Plan exceeds the confirmed time budget; revise the prescription or obtain a new explicit user availability answer.');}
export function assessWeeklyTimeBudget(occurrences,sessions,weeklyMinutes,{startDate,totalWeeks}={}){
 if(weeklyMinutes!==undefined&&(!Number.isSafeInteger(weeklyMinutes)||weeklyMinutes<0||weeklyMinutes>1680))throw Error('Invalid confirmed weekly time limit.');
 if((startDate===undefined)!==(totalWeeks===undefined))throw Error('Time-budget horizon requires both date and weeks.');
 if(startDate!==undefined&&(typeof startDate!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(startDate)||!Number.isFinite(new Date(startDate+'T12:00:00Z').getTime())||new Date(startDate+'T12:00:00Z').toISOString().slice(0,10)!==startDate||!Number.isSafeInteger(totalWeeks)||totalWeeks<1||totalWeeks>52))throw Error('Invalid exact time-budget horizon.');
 if(!Array.isArray(sessions)||sessions.length>364||!Array.isArray(occurrences)||occurrences.length>364)throw Error('Invalid bounded weekly time scope.');
 const byId=new Map();for(const row of sessions){if(!row||typeof row.sessionId!=='string'||! /^[A-Za-z0-9._-]{1,128}$/.test(row.sessionId))throw Error('Invalid time-budget session identity.');if(byId.has(row.sessionId))throw Error('Duplicate time-budget session definition.');byId.set(row.sessionId,row.timeBudgetAssessment);}const weeks=new Map();
 if(startDate!==undefined&&Number.isSafeInteger(totalWeeks)&&totalWeeks>0&&totalWeeks<=52){for(let week=0;week<totalWeeks;week++){const day=new Date(startDate+'T12:00:00Z');day.setUTCDate(day.getUTCDate()+week*7);weeks.set(day.toISOString().slice(0,10),{weekStarting:day.toISOString().slice(0,10),occurrenceIds:[],lowerBoundSeconds:0,minSeconds:0,maxSeconds:0,complete:true});}}
 const seen=new Set();
 for(const row of occurrences){if(typeof row.sessionId!=='string'||! /^[A-Za-z0-9._-]{1,128}$/.test(row.sessionId)||typeof row.occurrenceId!=='string'||! /^[A-Za-z0-9._-]{1,128}$/.test(row.occurrenceId))throw Error('Invalid time-budget occurrence identity.');if(seen.has(row.occurrenceId))throw Error('Duplicate time-budget occurrence.');seen.add(row.occurrenceId);if(typeof row.date!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(row.date)||!Number.isFinite(new Date(row.date+'T12:00:00Z').getTime())||new Date(row.date+'T12:00:00Z').toISOString().slice(0,10)!==row.date)throw Error('Weekly time budget needs exact occurrence dates.');const day=new Date(row.date+'T12:00:00Z');if(startDate){const week=Math.floor((day.getTime()-new Date(startDate+'T12:00:00Z').getTime())/604800000);if(week<0||week>=totalWeeks)throw Error('Time-budget occurrence outside cycle horizon.');day.setTime(new Date(startDate+'T12:00:00Z').getTime()+week*604800000);}else day.setUTCDate(day.getUTCDate()-((day.getUTCDay()+6)%7));const key=day.toISOString().slice(0,10);const week=weeks.get(key)??{weekStarting:key,occurrenceIds:[],lowerBoundSeconds:0,minSeconds:0,maxSeconds:0,complete:true};const assessment=byId.get(row.sessionId);week.occurrenceIds.push(row.occurrenceId);if(!byId.has(row.sessionId))throw Error('Unmatched time-budget session identity.');if(!assessment){week.complete=false;}else{if(assessment.version!==1||!['complete','partial'].includes(assessment.coverage)||!Number.isFinite(assessment.definiteLowerBoundSeconds)||assessment.definiteLowerBoundSeconds<0||!Number.isFinite(assessment.estimatedMinSeconds)||assessment.estimatedMinSeconds<assessment.definiteLowerBoundSeconds||(assessment.coverage==='complete'&&(!Number.isFinite(assessment.estimatedMaxSeconds)||assessment.estimatedMaxSeconds<assessment.estimatedMinSeconds)))throw Error('Invalid server time assessment for weekly scope.');week.lowerBoundSeconds+=assessment.definiteLowerBoundSeconds;week.minSeconds+=assessment.estimatedMinSeconds;if(assessment.coverage==='complete'){week.maxSeconds+=assessment.estimatedMaxSeconds;}else week.complete=false;}weeks.set(key,week);}
 if([...weeks.values()].some(week=>![week.lowerBoundSeconds,week.minSeconds,week.maxSeconds].every(value=>Number.isFinite(value)&&value>=0&&value<=100_000_000)))throw Error('Weekly time budget exceeds bounded arithmetic.');
 return [...weeks.values()].map(week=>({...week,minSeconds:week.minSeconds,maxSeconds:week.complete?week.maxSeconds:null,weeklyLimitMinutes:weeklyMinutes??null,budgetStatus:weeklyMinutes===undefined?'limit-unknown':week.lowerBoundSeconds>weeklyMinutes*60?'definite-exceeds':week.minSeconds>weeklyMinutes*60?'estimated-exceeds':!week.complete?'unknown':week.maxSeconds<=weeklyMinutes*60?'estimated-fits':'overlaps'}));
}

/** Default seconds per repetition [min, typical, max]: eccentric mode slower. */
export function repTempoSeconds(exercise,set){
 const mode=Number(set?.mode??exercise?.mode);
 if(mode===3)return [4,5,6];
 if(exercise?.section==='warmup'||exercise?.section==='stretching')return [2.5,3,4];
 return [3,3.5,4];
}
/** Exercise or setting change before an exercise [min, typical, max]; accessories take longer; first exercise is initial setup. */
export function exerciseChangeSeconds(exercise,first=false){
 const accessories=[exercise?.accessoryIds,exercise?.accessories,exercise?.bands].some(value=>Array.isArray(value)&&value.length>0);
 if(first)return accessories?[45,75,105]:[30,45,60];
 return accessories?[90,120,150]:[60,75,90];
}
/** Compare with the session limit: fits / risk / exceeds; exceeding the typical value is a warning with concrete shortening suggestions, never a block. */
export function sessionLimitCheck(limit,status,{min,typ,max,definite},plan={}){
 if(status==='unlimited')return{status:'bez limitu',code:'no-limit'};
 if(!Number.isSafeInteger(limit))return{status:'limit nieznany',code:'limit-unknown'};
 const cap=limit*60;
 if(typ<=cap&&max<=cap)return{status:'mieści się',code:'fits',limitMinutes:limit};
 if(typ<=cap)return{status:'ryzyko',code:'risk',limitMinutes:limit,warning:'Górna granica szacunku ('+Math.round(max/60)+' min) przekracza limit '+limit+' min; typowo '+Math.round(typ/60)+' min.'};
 const over=Math.ceil((typ-cap)/60);
 const rests=(plan.exercises??[]).flatMap(exercise=>exercise.sets??[]).filter(set=>Number.isFinite(set.rest)&&set.rest>90).length;
 const suggestions=[];
 if(rests)suggestions.push('skróć przerwy powyżej 90 s ('+rests+' serii) o 15–30 s');
 suggestions.push('usuń 1 serię z ćwiczeń akcesoryjnych lub izolowanych');
 suggestions.push('połącz 2 ćwiczenia akcesoryjne w superserię');
 suggestions.push('skróć rozgrzewkę lub rozciąganie o 1–2 pozycje');
 return{status:'przekracza',code:'exceeds',limitMinutes:limit,overByMinutes:over,warning:'Typowy szacunek '+Math.round(typ/60)+' min przekracza limit '+limit+' min o ok. '+over+' min. To ostrzeżenie, nie blokada zapisu.',suggestions,blocking:definite>cap};
}
/** Same default model for a completed session (calibration): sets [{unit:'reps'|'seconds',amount,rest,mode,exerciseKey}]. */
export function estimateCompletedSessionSeconds(sets){
 let total=0,prev=null;
 for(const [index,set] of sets.entries()){
  total+=set.unit==='seconds'?set.amount:set.amount*(Number(set.mode)===3?5:3.5);
  if(index<sets.length-1&&Number.isFinite(set.rest))total+=set.rest;
  if(set.exerciseKey!==prev)total+=prev===null?45:75;
  prev=set.exerciseKey;
 }
 return Math.round(total);
}
/** Extract duration and sets from a completed-session detail of unknown shape. Returns null when unusable. */
export function extractCompletedSessionForCalibration(detail){
 let actual=null;const sets=[];const seen=new WeakSet();
 const walk=(node,exerciseKey)=>{
  if(!node||typeof node!=='object'||seen.has(node))return;seen.add(node);
  if(Array.isArray(node)){for(const child of node)walk(child,exerciseKey);return;}
  for(const key of ['trainingTimeSeconds','duration_secs','durationSeconds','trainingTime'])if(actual===null&&Number.isFinite(node[key])&&node[key]>=300&&node[key]<=6*3600)actual=node[key];
  const reps=[node.reps,node.actualReps,node.count].find(value=>Number.isFinite(value)&&value>0&&value<=100);
  const seconds=[node.seconds,node.durationSeconds,node.time].find(value=>Number.isFinite(value)&&value>0&&value<=900);
  const key=node.actionLibraryId??node.exerciseId??node.groupId??node.id??exerciseKey;
  if(reps!==undefined&&(node.setIndex!==undefined||node.weight!==undefined||node.rest!==undefined||node.restSeconds!==undefined))sets.push({unit:'reps',amount:reps,rest:Number.isFinite(node.restSeconds)?node.restSeconds:Number.isFinite(node.rest)?node.rest:90,mode:node.mode,exerciseKey:exerciseKey??key});
  else if(seconds!==undefined&&reps===undefined&&node.setIndex!==undefined)sets.push({unit:'seconds',amount:seconds,rest:Number.isFinite(node.restSeconds)?node.restSeconds:60,mode:node.mode,exerciseKey:exerciseKey??key});
  for(const [childKey,child] of Object.entries(node))if(child&&typeof child==='object')walk(child,Array.isArray(child)&&/sets|setList|records/i.test(childKey)?key:exerciseKey);
 };
 walk(detail,null);
 if(actual===null||sets.length<3)return null;
 const estimated=estimateCompletedSessionSeconds(sets);
 return estimated>0?{actualSeconds:actual,estimatedSeconds:estimated}:null;
}
/** Update stored samples (max 20, dedupe by key) and derive the median actual/estimate factor. */
export function updateTimeCalibration(stored,sample){
 const samples=[...(Array.isArray(stored?.samples)?stored.samples:[]).filter(row=>row.key!==sample.key),sample].slice(-20);
 const ratios=samples.map(row=>row.actualSeconds/row.estimatedSeconds).filter(value=>Number.isFinite(value)&&value>0).sort((a,b)=>a-b);
 const factor=ratios.length?ratios[Math.floor(ratios.length/2)]:1;
 return{version:1,samples,factor:Number(Math.min(1.8,Math.max(0.6,factor)).toFixed(3)),sampleCount:samples.length};
}

/** Speediance displayed session duration (calendar durationMinute), reproduced from 24 real templates (MAE 0.21 min, 19/24 exact):
 * ceil((2.7 s x reps + timed seconds + rest after every set + 10 s x sets + 10 s x exercises) / 60). Uses the wire payload. */
export function speedianceDisplayMinutes(payload) {
 const list=Array.isArray(payload?.actionLibraryList)?payload.actionLibraryList:null;if(!list)return null;
 const csv=value=>String(value??'').split(',').filter(cell=>cell!=='').map(Number);
 let seconds=0;
 for(const action of list){const work=csv(action.setsAndReps),rest=csv(action.breakTime2||action.breakTime),method=csv(action.completionMethod);
  work.forEach((value,index)=>{const timed=(method[index]??method[0])===2;seconds+=timed?value:value*2.7;seconds+=(rest[index]??rest[0]??0)+10;});seconds+=10;}
 return Math.ceil(seconds/60);
}
/** Align the session estimate with Speediance's own displayed duration; the model range is kept around it. */
export function applySpeedianceDuration(assessment,payload,plan={}){
 const minutes=speedianceDisplayMinutes(payload);if(!assessment||!Number.isFinite(minutes))return assessment;
 const typ=minutes*60,definite=assessment.definiteLowerBoundSeconds??0,min=Math.max(0,definite,Math.min(assessment.estimatedMinSeconds??typ,typ-60)),max=Math.max(assessment.estimatedMaxSeconds??0,definite,typ+120,Math.round(typ*1.08));
 const limitCheck=sessionLimitCheck(assessment.sessionLimitMinutes,assessment.sessionLimitStatus==='unlimited'?'unlimited':undefined,{min,typ,max,definite:assessment.definiteLowerBoundSeconds??0},plan);
 return{...assessment,estimatedMinSeconds:min,estimatedTypicalSeconds:typ,estimatedMaxSeconds:max,sessionEstimate:{...(assessment.sessionEstimate??{}),minMinutes:Math.round(min/60),typicalMinutes:minutes,maxMinutes:Math.round(max/60),source:'wzór Speediance (czas pokazywany w aplikacji)',speedianceMinutes:minutes},limitCheck};
}

