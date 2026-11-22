// Deterministic comparisons of already server-normalized completed-history rows.
// Not a validator of user-supplied claims, prescription or physiological progress.
const MAX_ROWS=64, MAX_SETS=200, MAX_OUTPUT=64, MAX_DIAGNOSTICS=128;
function plain(v) {
 if(!v||typeof v!=='object'||![Object.prototype,null].includes(Object.getPrototypeOf(v))||Object.getOwnPropertySymbols(v).length)throw new TypeError('Unsupported comparison record.');
 const keys=Object.getOwnPropertyNames(v);
 if(keys.length>256||keys.some(k=>!Object.hasOwn(Object.getOwnPropertyDescriptor(v,k),'value')))throw new TypeError('Unsupported comparison descriptors.');
 return v;
}
function list(v,max) {
 if(!Array.isArray(v)||v.length>max||Object.getOwnPropertySymbols(v).length)throw new TypeError('Unsupported comparison array.');
 const names=Object.getOwnPropertyNames(v);if(names.length!==v.length+1||names.some(k=>!Object.hasOwn(Object.getOwnPropertyDescriptor(v,k),'value')))throw new TypeError('Unsupported comparison array descriptors.');
 for(let i=0;i<v.length;i++)if(!Object.hasOwn(v,i))throw new TypeError('Sparse comparison array.');return v;
}
const finite=v=>typeof v==='number'&&Number.isFinite(v)&&v>=0&&v<=1e12;
const positive=v=>Number.isSafeInteger(v)&&v>0;
function identity(v) {
 plain(v);if(typeof v.sessionId!=='string'||!/^[A-Za-z0-9._-]{1,128}$/.test(v.sessionId)||!['program','free','course','ai'].includes(v.sessionType)||typeof v.date!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(v.date)||new Date(v.date+'T00:00:00Z').toISOString().slice(0,10)!==v.date)throw new TypeError('Explicit session namespace/id/date required.');
 return {sessionId:v.sessionId,sessionType:v.sessionType,date:v.date};
}
const sameIdentity=(a,b)=>a.sessionId===b.sessionId&&a.sessionType===b.sessionType&&a.date===b.date;
function scalarSignature(v,keys) {
 if(!v||typeof v!=='object')return null;plain(v);const out={};
 for(const key of keys){const x=v[key];if(x!==undefined){if(!(typeof x==='string'&&x.length<=500||typeof x==='boolean'||typeof x==='number'&&Number.isFinite(x)))return null;out[key]=x;}}
 return Object.keys(out).length?JSON.stringify(out):null;
}
function codes(set) {
 if(set.reportedSettingCodes===undefined)return null;
 const result=[];for(const row of list(set.reportedSettingCodes,2)){plain(row);if(!['sportMode','templatePresetId'].includes(row.field)||row.status!=='reported-code'||!Number.isSafeInteger(row.code)||result.some(x=>x[0]===row.field))return null;result.push([row.field,row.code]);}
 return result.length===2?JSON.stringify(result.sort()):null;
}
function loadSignature(set,metric) {
 if(![0,1,2].includes(set.side))return null;
 const settings=codes(set),unit=metric==='reportedCablePeakLoad'?set.reportedCablePeakLoadUnit:set.weightUnit;
 if(!settings||!['kg','lb'].includes(unit)||metric==='reportedCablePeakLoad'&&['kg','lb'].includes(set.weightUnit)&&set.weightUnit!==unit)return null;
 let source;
 if(metric==='summaryWeight') {
  const classification=['source','method','status','warning','scale','factor','field','scaleSource','divisor','scaleFactor','semantics','reconciliation','reconciliationStatus'];
  const provenance=scalarSignature(set.summaryWeightProvenance,classification);
  const direct=typeof set.summaryWeightSource==='string'&&set.summaryWeightSource.length<=1000?set.summaryWeightSource:scalarSignature(set.summaryWeightSource,classification);
  if(!provenance&&!direct)return null;
  source=JSON.stringify([direct,provenance,scalarSignature(set.scaleReconciliation,classification),finite(set.scaleFactor)?set.scaleFactor:null]);
 }else {
  if(set.reportedCablePeakLoadStatus!=='reported-telemetry-peak')return null;
  source=scalarSignature(set.reportedCablePeakLoadEvidence,['source','interpretation','algorithm','side','perRepTelemetry','assessedOneRepMax']);
  if(!source)return null;
  const fields=set.reportedCablePeakLoadEvidence.sourceFields;
  if(fields!==undefined){list(fields,8);if(fields.some(x=>typeof x!=='string'||x.length>120))return null;source=JSON.stringify([source,fields]);}
 }
 return JSON.stringify([metric,unit,settings,source]);
}
/** Inputs must be existing normalized scan rows under one bound account read. */
export function compareCompletedHistoryRows({rows,sessionA,sessionB,partial=false}={}) {
 const a=identity(sessionA),b=identity(sessionB);if(sameIdentity(a,b))throw new TypeError('Two distinct explicit sessions required.');
 if(typeof partial!=='boolean')throw new TypeError('partial must be boolean.');
 const source=list(rows,MAX_ROWS),diagnostics=[],changes=[];let diagnosticCount=0,omittedChanges=0;
 const diag=(reason,scope={})=>{diagnosticCount++;if(diagnostics.length<MAX_DIAGNOSTICS)diagnostics.push({reason,...scope});};
 const selected=[[],[]];
 for(const row of source){plain(row);const id=identity(row);const n=sameIdentity(id,a)?0:sameIdentity(id,b)?1:-1;if(n<0)continue;
  if(row.datePrecision!=='day'||!positive(row.groupId)||!positive(row.actionLibraryId)){diag('variant-or-date-scope-unconfirmed',{session:n?'B':'A'});continue;}
  list(row.sets,MAX_SETS).forEach(plain);selected[n].push(row);
 }
 const grouping=rs=>{const m=new Map();for(const row of rs){const key=`${row.groupId}:${row.actionLibraryId}`;m.set(key,[...(m.get(key)||[]),row]);}return m;};
 const groups=selected.map(grouping),keys=new Set([...groups[0].keys(),...groups[1].keys()]);
 const emit=value=>{if(changes.length<MAX_OUTPUT)changes.push(value);else omittedChanges++;};
 for(const key of keys){const aa=groups[0].get(key)||[],bb=groups[1].get(key)||[];const scope={groupId:Number(key.split(':')[0]),actionLibraryId:Number(key.split(':')[1])};
  if(aa.length!==1||bb.length!==1){diag(aa.length>1||bb.length>1?'ambiguous-exercise-occurrence':'unmatched-exercise',scope);continue;}
  const map=sets=>{const m=new Map();for(const s of sets){if(!positive(s.set)||!['reps','seconds'].includes(s.unit)||s.side!==undefined&&![0,1,2].includes(s.side)){diag('unconfirmed-set-identity',scope);continue;}if(s.completedNumericDiagnostics!==undefined){for(const d of list(s.completedNumericDiagnostics,3))plain(d);}const k=`${s.set}:${s.side??'unspecified'}`;m.set(k,[...(m.get(k)||[]),s]);}return m;};
  const ma=map(aa[0].sets),mb=map(bb[0].sets);
  emit({...scope,metric:'returnedSetCount',a:aa[0].sets.length,b:bb[0].sets.length,deltaBMinusA:bb[0].sets.length-aa[0].sets.length,interpretation:'count-of-returned-normalized-sets-not-complete-session-dose'});
  for(const k of new Set([...ma.keys(),...mb.keys()])){const sa=ma.get(k)||[],sb=mb.get(k)||[];
   if(sa.length!==1||sb.length!==1){diag(sa.length>1||sb.length>1?'ambiguous-set-occurrence':'unmatched-set',{...scope,setKey:k});continue;}
   const x=sa[0],y=sb[0],setScope={...scope,set:x.set,side:x.side??null};
   if(x.unit!==y.unit){diag('dose-unit-mismatch',setScope);continue;}
   if(x.completedCountStatus==='invalid-or-unavailable'||y.completedCountStatus==='invalid-or-unavailable'||x.completedNumericDiagnostics?.length||y.completedNumericDiagnostics?.length){diag('completed-numeric-fields-unconfirmed',setScope);continue;}
   const metric=x.unit==='reps'?'reps':'elapsedSeconds';
   if(finite(x[metric])&&finite(y[metric]))emit({...setScope,metric,a:x[metric],b:y[metric],deltaBMinusA:y[metric]-x[metric],unit:x.unit,interpretation:metric==='elapsedSeconds'?'reported-elapsed-time-not-confirmed-work-dose':'observed-reported-repetition-change-only'});
   else diag('completed-dose-unavailable',setScope);
   for(const field of ['summaryWeight','reportedCablePeakLoad']){if(x[field]===undefined&&y[field]===undefined)continue;const sigA=loadSignature(x,field),sigB=loadSignature(y,field);
    if(!finite(x[field])||!finite(y[field])||!sigA||sigA!==sigB){diag('load-source-unit-settings-or-provenance-incomparable',{...setScope,metric:field});continue;}
    emit({...setScope,metric:field,a:x[field],b:y[field],deltaBMinusA:y[field]-x[field],unit:field==='reportedCablePeakLoad'?x.reportedCablePeakLoadUnit:x.weightUnit,interpretation:field==='summaryWeight'?'reported-set-summary-scalar-change':'reported-independent-cable-peak-change-not-per-repetition-load'});
   }
  }
 }
 return {sessionA:a,sessionB:b,chronology:a.date===b.date?'same-day-order-unverified':a.date<b.date?'A-before-B':'B-before-A',observedChangesOnly:true,physiologicalProgressionConfirmed:false,assessedOneRepMaxCalculated:false,volumeCalculated:false,partial,changes,omittedChangeCount:omittedChanges,diagnostics,diagnosticCount,diagnosticsTruncated:diagnosticCount>diagnostics.length,resourceLimits:{inputRows:MAX_ROWS,setsPerRow:MAX_SETS,outputChanges:MAX_OUTPUT,outputDiagnostics:MAX_DIAGNOSTICS},inputTrust:'server-normalized-history-under-one-account-binding-required'};
}
