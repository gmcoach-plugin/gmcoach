// Local sketch arithmetic only. Deliberately independent of executable-plan
// expansion, timeEstimation digests, scientific approval and account state.
const MAX_ROWS=100,MAX_SECONDS=86400;
function record(value,allowed,required=[]){
 if(!value||typeof value!=='object'||Array.isArray(value)||![Object.prototype,null].includes(Object.getPrototypeOf(value))||Object.getOwnPropertySymbols(value).length)throw new TypeError('Expected plain sketch record.');
 const keys=Object.getOwnPropertyNames(value);
 if(keys.length>allowed.length||keys.some(key=>!allowed.includes(key)||!Object.hasOwn(Object.getOwnPropertyDescriptor(value,key),'value'))||required.some(key=>!Object.hasOwn(value,key)))throw new TypeError('Unknown sketch field or descriptor.');
 return value;
}
function sequence(value){
 if(!Array.isArray(value)||Object.getPrototypeOf(value)!==Array.prototype||value.length<1||value.length>MAX_ROWS||Object.getOwnPropertySymbols(value).length)throw new TypeError('Sketch needs 1–100 expanded rows.');
 const names=Object.getOwnPropertyNames(value);if(names.length!==value.length+1||names.some(key=>!Object.hasOwn(Object.getOwnPropertyDescriptor(value,key),'value')))throw new TypeError('Unsupported sketch array descriptors.');
 for(let i=0;i<value.length;i++)if(!Object.hasOwn(value,i))throw new TypeError('Sparse sketch rows.');return value;
}
const seconds=value=>typeof value==='number'&&Number.isFinite(value)&&value>=0&&value<=MAX_SECONDS;
function range(value,scope,unknown){
 if(value===null){unknown.push(scope);return {minSeconds:0,maxSeconds:null};}
 record(value,['minSeconds','maxSeconds'],['minSeconds','maxSeconds']);
 if(!seconds(value.minSeconds)||value.maxSeconds!==null&&(!seconds(value.maxSeconds)||value.maxSeconds<value.minSeconds))throw new TypeError('Invalid seconds range.');
 if(value.maxSeconds===null)unknown.push(scope);
 return {minSeconds:value.minSeconds,maxSeconds:value.maxSeconds};
}
const add=(a,b)=>({minSeconds:a.minSeconds+b.minSeconds,maxSeconds:a.maxSeconds===null||b.maxSeconds===null?null:a.maxSeconds+b.maxSeconds});
function sum(values){return values.reduce(add,{minSeconds:0,maxSeconds:0});}
const rangeSchema={anyOf:[{type:'null'},{type:'object',required:['minSeconds','maxSeconds'],properties:{minSeconds:{type:'number',minimum:0,maximum:MAX_SECONDS},maxSeconds:{type:['number','null'],minimum:0,maximum:MAX_SECONDS}},additionalProperties:false}]};
export const sketchTimeInputSchema={type:'object',required:['rows','additionalSetupRange'],properties:{
 rows:{type:'array',minItems:1,maxItems:MAX_ROWS,items:{type:'object',required:['label','section','side','work','restAfterRange','transitionAfterRange','overlapAfterSeconds'],properties:{
  label:{type:'string',minLength:1,maxLength:80,pattern:'^[A-Za-z0-9._-]+$'},section:{type:'string',enum:['warmup','main','cooldown']},side:{type:'string',enum:['left','right','bilateral','not-applicable','unknown']},
  work:{oneOf:[{type:'object',required:['unit','reps','secondsPerRepRange'],properties:{unit:{const:'reps'},reps:{type:'integer',minimum:1,maximum:1000},secondsPerRepRange:rangeSchema},additionalProperties:false},{type:'object',required:['unit','durationSeconds'],properties:{unit:{const:'seconds'},durationSeconds:{type:'number',exclusiveMinimum:0,maximum:MAX_SECONDS}},additionalProperties:false}]},
  restAfterRange:rangeSchema,transitionAfterRange:rangeSchema,overlapAfterSeconds:{type:['number','null'],minimum:0,maximum:MAX_SECONDS}
 },additionalProperties:false}},additionalSetupRange:rangeSchema,sessionLimitMinutes:{type:'number',exclusiveMinimum:0,maximum:1440}},additionalProperties:false};

export function calculateSketchTime(input){
 record(input,['rows','additionalSetupRange','sessionLimitMinutes'],['rows','additionalSetupRange']);
 if(input.sessionLimitMinutes!==undefined&&(!seconds(input.sessionLimitMinutes)||input.sessionLimitMinutes===0||input.sessionLimitMinutes>1440))throw new TypeError('Invalid local session limit.');
 const rows=sequence(input.rows),unknown=[],seen=new Set(),ledger=[];
 for(const [index,row] of rows.entries()){
  record(row,['label','section','side','work','restAfterRange','transitionAfterRange','overlapAfterSeconds'],['label','section','side','work','restAfterRange','transitionAfterRange','overlapAfterSeconds']);
  if(typeof row.label!=='string'||!/^[A-Za-z0-9._-]{1,80}$/.test(row.label))throw new TypeError(`Sketch row ${index+1}: label must be a local ASCII identifier of 1-80 characters using [A-Za-z0-9._-]; spaces and exercise titles are not accepted.`);
  if(seen.has(row.label))throw new TypeError(`Sketch row ${index+1}: duplicate label; each expanded row needs a unique local ASCII identifier using [A-Za-z0-9._-].`);
  if(!['warmup','main','cooldown'].includes(row.section))throw new TypeError(`Sketch row ${index+1}: section must be warmup, main, or cooldown.`);
  if(!['left','right','bilateral','not-applicable','unknown'].includes(row.side))throw new TypeError(`Sketch row ${index+1}: side must be left, right, bilateral, not-applicable, or unknown.`);
  seen.add(row.label);
  record(row.work,['unit','reps','secondsPerRepRange','durationSeconds'],['unit']);
  let work;
  if(row.work.unit==='reps'){
   record(row.work,['unit','reps','secondsPerRepRange'],['unit','reps','secondsPerRepRange']);
   if(!Number.isSafeInteger(row.work.reps)||row.work.reps<1||row.work.reps>1000)throw new TypeError('Invalid repetitions.');
   const tempo=range(row.work.secondsPerRepRange,`${row.label}:rep-tempo`,unknown);
   work={minSeconds:row.work.reps*tempo.minSeconds,maxSeconds:tempo.maxSeconds===null?null:row.work.reps*tempo.maxSeconds};
  }else if(row.work.unit==='seconds'){
   record(row.work,['unit','durationSeconds'],['unit','durationSeconds']);if(!seconds(row.work.durationSeconds)||row.work.durationSeconds===0)throw new TypeError('Invalid exact work seconds.');
   work={minSeconds:row.work.durationSeconds,maxSeconds:row.work.durationSeconds};
  }else throw new TypeError('Work must explicitly be reps or seconds.');
  const rest=range(row.restAfterRange,`${row.label}:rest`,unknown),transition=range(row.transitionAfterRange,`${row.label}:transition`,unknown);
  if(index===rows.length-1&&(rest.minSeconds!==0||rest.maxSeconds!==0||transition.minSeconds!==0||transition.maxSeconds!==0||row.overlapAfterSeconds!==0))throw new TypeError('Final row has no after-gap: declare zero rest, transition and overlap.');
  const overlap=row.overlapAfterSeconds;
  if(overlap!==null&&(!seconds(overlap)||overlap>Math.min(rest.minSeconds,transition.minSeconds)))throw new TypeError('Overlap must fit both guaranteed gap minima.');
  let gap;
  if(overlap===null){unknown.push(`${row.label}:overlap`);gap={minSeconds:Math.max(rest.minSeconds,transition.minSeconds),maxSeconds:null};}
  else {const combined=add(rest,transition);gap={minSeconds:combined.minSeconds-overlap,maxSeconds:combined.maxSeconds===null?null:combined.maxSeconds-overlap};}
  if(row.side==='unknown')unknown.push(`${row.label}:side-declaration`);
  ledger.push({label:row.label,section:row.section,side:row.side,declaredWork:row.work,workSeconds:work,restSeconds:rest,transitionSeconds:transition,overlapSeconds:overlap,gapSeconds:gap,totalSeconds:add(work,gap)});
 }
 const setup=range(input.additionalSetupRange,'additional-setup-exclusive-of-row-gaps',unknown);
 const work=sum(ledger.map(row=>row.workSeconds)),rest=sum(ledger.map(row=>row.restSeconds)),transition=sum(ledger.map(row=>row.transitionSeconds)),gaps=sum(ledger.map(row=>row.gapSeconds));
 const total=add(add(work,gaps),setup);
 if(total.minSeconds>10000000||total.maxSeconds!==null&&total.maxSeconds>10000000)throw new TypeError('Sketch arithmetic exceeds resource bound.');
 // Each after-gap belongs to its originating validated row, including a
 // boundary crossing to another section. Exclusive global setup stays separate.
 const bySection=Object.fromEntries(['warmup','main','cooldown'].map(section=>{
  const selected=ledger.filter(row=>row.section===section);
  const workSeconds=sum(selected.map(row=>row.workSeconds)),restSeconds=sum(selected.map(row=>row.restSeconds)),transitionSeconds=sum(selected.map(row=>row.transitionSeconds)),netGapsSeconds=sum(selected.map(row=>row.gapSeconds));
  const overlapSeconds={minSeconds:selected.reduce((n,row)=>n+(row.overlapSeconds??0),0),maxSeconds:selected.some(row=>row.overlapSeconds===null)?null:selected.reduce((n,row)=>n+row.overlapSeconds,0)};
  const totalSeconds=sum(selected.map(row=>row.totalSeconds));
  const sectionUnknown=unknown.filter(scope=>selected.some(row=>scope.startsWith(`${row.label}:`)));
  return [section,{rowCount:selected.length,components:{workSeconds,restSeconds,transitionSeconds,overlapSeconds,netGapsSeconds},totalSeconds,coverage:sectionUnknown.length?'partial':'complete',unknown:sectionUnknown}];
 }));
 const complete=unknown.length===0,limit=input.sessionLimitMinutes;
 return {source:'caller-declared-sketch',executionVerified:false,scientificApproval:false,writeReady:false,coverage:complete?'complete':'partial',coverageMeaning:'arithmetic-assumptions-only-not-plan-validity',sideCoverage:'caller-declared-expanded-rows-not-independently-verified',rows:ledger,bySection,sectionGapContract:'after-gap assigned to originating row section; global additional setup unallocated',components:{workSeconds:work,restSeconds:rest,transitionSeconds:transition,netGapsSeconds:gaps,additionalSetupSeconds:setup},totalSeconds:total,displayMinutes:{min:Math.floor(total.minSeconds/60),max:total.maxSeconds===null?null:Math.ceil(total.maxSeconds/60)},unknown,finalRestExcluded:true,sessionLimitMinutes:limit??null,budgetStatus:limit===undefined?'limit-unknown':total.minSeconds>limit*60?'estimated-exceeds':!complete?'unknown':total.maxSeconds<=limit*60?'estimated-fits':'overlaps',additionalSetupContract:'exclusive of work, rest, transitions and overlap already in rows',resourceLimits:{expandedRows:MAX_ROWS,totalSeconds:10000000}};
}
