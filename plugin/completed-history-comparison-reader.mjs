import {createNativeWorkoutReader} from './native-workout-reader.mjs';
import {scanCompletedExerciseHistory} from './completed-exercise-history.mjs';
import {inspectAccountWeightUnit} from './workout-data.mjs';
import {compareCompletedHistoryRows} from './completed-history-comparison.mjs';

export function validateComparisonSelection(value) {
 if(!value || typeof value!=='object' || Array.isArray(value)) throw new TypeError('Exact session selection required.');
 const {training_id:id,type,date}=value;
 if(typeof id!=='string'||!/^[1-9]\d{0,18}$/.test(id)||BigInt(id)>9223372036854775807n||!['program','free','course','ai'].includes(type)||typeof date!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(Date.parse(date+'T00:00:00Z'))||new Date(date+'T00:00:00Z').toISOString().slice(0,10)!==date)throw new TypeError('Exact positive int64 session ID, namespace and calendar date required.');
 return {training_id:id,type,date};
}

/** Caller holds the profile lock. Every read must use its initial fingerprint
 * beforeSend check and assertCurrent postresponse check. No caller-provided rows.
 */
export async function readCompletedHistoryComparison({sessionA,sessionB,groupId,actionLibraryId,apiRead,assertCurrent,deviceType,now=new Date()}={}) {
 const selections=[validateComparisonSelection(sessionA),validateComparisonSelection(sessionB)];
 if(selections[0].training_id===selections[1].training_id&&selections[0].type===selections[1].type&&selections[0].date===selections[1].date)throw new TypeError('Two distinct exact sessions required.');
 if(!Number.isSafeInteger(groupId)||groupId<1||!Number.isSafeInteger(actionLibraryId)||actionLibraryId<1||typeof apiRead!=='function'||typeof assertCurrent!=='function'||!(now instanceof Date)||!Number.isFinite(now.getTime()))throw new TypeError('Exact exercise group and variant plus bound reader required.');
 const calendarMonths=new Map();
 const checkedRead=async path=>{
  await assertCurrent();
  if(calendarMonths.has(path)){await assertCurrent();return calendarMonths.get(path);}
  const response=await apiRead(path);
  await assertCurrent();
  if(path.startsWith('/app/v5/trainingCalendar/monthNew?'))calendarMonths.set(path,response);
  return response;
 };
 const reader=createNativeWorkoutReader({apiRead:checkedRead,deviceType,now:()=>now});
 const unitResponse=await checkedRead('/app/userinfo/info');
 const accountUnitInspection=unitResponse?.code===0?inspectAccountWeightUnit(unitResponse.data):{unit:'unknown',status:'api-unavailable',candidates:[]};
 const displayUnit=accountUnitInspection.unit;
 const rows=[],coverage=[];let partial=false;
 const started=Date.now();
 // This is the existing scanner's resource window, not a training recommendation.
 const localDay=`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
 const cutoff=Date.parse(localDay+'T00:00:00Z')-364*86400000;
 for(const selected of selections) {
  if(Date.now()-started>=40000){coverage.push({sessionType:selected.type,date:selected.date,status:'comparison-wall-resource-bound'});partial=true;continue;}
  if(Date.parse(selected.date+'T00:00:00Z')<cutoff||selected.date>localDay) {
   coverage.push({sessionType:selected.type,date:selected.date,status:'outside-existing-365-day-scan-window'});partial=true;continue;
  }
  const calendar=['course','ai'].includes(selected.type);
  const candidates=calendar?await reader.calendarIdentities(selected.date.slice(0,7)):await reader.summariesForDate(selected.date);
  const exact=candidates.filter(row=>String(row.training_id)===selected.training_id&&row.kind===selected.type&&row.date===selected.date);
  if(exact.length!==1){coverage.push({sessionType:selected.type,date:selected.date,status:exact.length?'ambiguous-exact-session':'exact-session-not-in-returned-source'});partial=true;continue;}
  const remaining=40000-(Date.now()-started);
  if(remaining<=0){coverage.push({sessionType:selected.type,date:selected.date,status:'comparison-wall-resource-bound'});partial=true;continue;}
  const scan=await scanCompletedExerciseHistory({summaries:exact,groupId,actionLibraryId,maxSessions:1,days:365,displayUnit,now,maxScanWallMs:Math.min(20000,remaining),maxTotalSets:1000,calendarCompletedOnly:calendar,
   fetchSession:async({trainingId:id,type})=>{await assertCurrent();const payload=calendar?await reader.calendarSession(id,type,selected.date):await reader.session(id,type);await assertCurrent();return {payload,source:calendar?'completed-calendar-detail':'native-session-detail'};}});
  await assertCurrent();partial ||= scan.partial;
  const accepted=scan.matches.filter(row=>row.sets.length<=200);
  const excluded=scan.matches.filter(row=>row.sets.length>200);
  if(excluded.length){partial=true;coverage.push({sessionType:selected.type,date:selected.date,status:'comparison-occurrence-set-resource-bound',excludedExerciseOccurrences:excluded.length,excludedReturnedSets:excluded.reduce((sum,row)=>sum+row.sets.length,0),maximumSetsPerOccurrence:200});}
  if(rows.length+accepted.length>64){coverage.push({sessionType:selected.type,date:selected.date,status:'comparison-row-resource-bound'});partial=true;continue;}
  rows.push(...accepted);coverage.push({sessionType:selected.type,date:selected.date,status:'scanned',matchedExerciseOccurrences:scan.matches.length,acceptedComparisonOccurrences:accepted.length,partial:scan.partial||excluded.length>0,scannerOmittedSetCount:scan.omittedSetCount});
 }
 await assertCurrent();
 const result=compareCompletedHistoryRows({rows,sessionA:{sessionId:selections[0].training_id,sessionType:selections[0].type,date:selections[0].date},sessionB:{sessionId:selections[1].training_id,sessionType:selections[1].type,date:selections[1].date},partial});
 for(const row of result.changes)if(['summaryWeight','reportedCablePeakLoad'].includes(row.metric)){
  row.historicalUnitStatus='unverified-current-account-unit-applied';
  row.historicalUnitQualification='Conditional on the current reported account unit applying to both historical sessions; historic unit stability is unverified.';
 }
 return {...result,coverage,loadUnitEvidence:{currentAccountUnit:displayUnit,inspection:accountUnitInspection,source:displayUnit==='unknown'?'unconfirmed':'bound-current-userinfo',historicUnitVerified:false},loadComparisonQualification:'Any load delta is conditional on the current reported account unit applying to both historical sessions. Historical unit stability is not proven. Unknown units are incomparable.',resourcePolicy:{maximumSelectedSessions:2,maximumSetsPerSession:1000,maximumTotalSets:2000,maximumScanWallMsPerSession:20000,maximumCombinedScanWallMs:40000,maximumComparisonRows:64},operationStatus:'read-only'};
}
