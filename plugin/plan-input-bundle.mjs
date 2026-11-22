import {readCompletedSessionBatch} from './completed-session-batch.mjs';

const supportedSessionTypes=new Set(['program','free','course','ai']);
const validCompletedDate=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&!Number.isNaN(Date.parse(`${value}T12:00:00Z`))&&new Date(`${value}T12:00:00Z`).toISOString().slice(0,10)===value;
const defaultModeInterpretation='performed-sportMode-code-unmapped-to-physical-behavior';
const defaultPhaseLoadStatus='concentric-and-eccentric-loads-not-separated-by-reported-samples';
const compactPlanningDetail=detail=>{
  if(detail?.planningView!==true||!Array.isArray(detail.exercises))return detail;
  return {...detail,bundleCompact:true,perSetModeInterpretation:defaultModeInterpretation,perSetPhaseLoadStatus:defaultPhaseLoadStatus,emptyEvidenceArraysOmitted:true,exercises:detail.exercises.map(exercise=>({...exercise,sets:exercise.sets.map(set=>{
    const {reportedModeInterpretation,phaseLoadStatus,observedRepLoadEvidence,reportedLoadChannels,...rest}=set;
    return {...rest,...(reportedModeInterpretation!==defaultModeInterpretation?{reportedModeInterpretation}:{}),...(phaseLoadStatus!==defaultPhaseLoadStatus?{phaseLoadStatus}:{}),...(observedRepLoadEvidence?.length?{observedRepLoadEvidence}:{}),...(reportedLoadChannels?.length?{reportedLoadChannels}:{})};
  })}))};
};

export async function collectPlanInputs(args,{resolveProfile,readProfileConfig,accountFingerprint,readTrainingProfile,readCalendar,readBaselines,readAthlete,readDetail}){
  const startedAt=performance.now();
  const phaseTimingsMs={};
  if(!args||typeof args!=='object'||Array.isArray(args)||Object.keys(args).some(key=>!['profile','month','program_codes','days','consent_to_read_history','include_recent_session_details'].includes(key)))throw new Error('Unexpected plan input fields.');
  if(args.consent_to_read_history!==true)throw new Error('Plan inputs require explicit history read consent.');
  if(args.include_recent_session_details!==undefined&&typeof args.include_recent_session_details!=='boolean')throw new Error('Invalid recent detail flag.');
  if(typeof args.profile!=='string'||!args.profile.trim()||typeof args.month!=='string'||!/^\d{4}-(0[1-9]|1[0-2])$/.test(args.month)||!Number.isSafeInteger(args.days)||args.days<1||args.days>90||!Array.isArray(args.program_codes)||args.program_codes.length>4||new Set(args.program_codes).size!==args.program_codes.length||args.program_codes.some(code=>typeof code!=='string'||!/^[A-Za-z0-9._-]{1,128}$/.test(code)))throw new Error('Invalid bounded plan inputs request.');
  const profile=await resolveProfile(args.profile);
  const before=await readProfileConfig(profile),fingerprint=accountFingerprint(before);
  const assertSameAccount=async()=>{if(accountFingerprint(await readProfileConfig(profile))!==fingerprint)throw new Error('Account changed during plan input reads.');};
  const timed=async(name,read)=>{const start=performance.now();try{return await read();}finally{phaseTimingsMs[name]=Math.round(performance.now()-start);}};
  const sections=await Promise.allSettled([
    timed('trainingProfile',()=>readTrainingProfile(profile)),
    timed('calendar',()=>readCalendar(profile,args.month)),
    timed('baselines',()=>args.program_codes.length ? readBaselines(profile,args.program_codes) : Promise.resolve({programSummary:[],programs:[],status:'deferred-until-codes-known',readOnly:true})),
    timed('history',()=>readAthlete(profile,args.days))
  ]);
  await assertSameAccount();
  const failed=sections.find(section=>section.status==='rejected');
  if(failed)throw failed.reason;
  const [trainingProfile,calendar,baselines,athlete]=sections.map(section=>section.value);
  const completedSessionDetailKeys=[];
  for(const [sourceCollection,rows] of [['mobileSessions',athlete?.history?.mobileSessions],['calendarCompletedSessions',athlete?.history?.calendarCompletedSessions]]){
    if(!Array.isArray(rows))continue;
    for(const row of rows){
      const id=String(row?.training_id??''),type=supportedSessionTypes.has(row?.kind)?row.kind:row?.type,date=row?.date;
      if(!/^[1-9][0-9]{0,18}$/.test(id)||!supportedSessionTypes.has(type)||!validCompletedDate(date))continue;
      completedSessionDetailKeys.push({sourceCollection,training_id:id,type,date,title:typeof row.title==='string'?row.title:null});
    }
  }
  let recentSessionDetails=null;
  if(args.include_recent_session_details===true){
    if(typeof readDetail!=='function')throw new Error('Recent detail reader unavailable.');
    const selected=completedSessionDetailKeys.filter(key=>key.sourceCollection==='mobileSessions').sort((a,b)=>b.date.localeCompare(a.date)).slice(0,4).map(({training_id,type,date})=>({training_id,type,date}));
    recentSessionDetails=selected.length?await timed('recentSessionDetails',()=>readCompletedSessionBatch({profile,sessions:selected,consent_to_read_history:true},{resolveProfile,readProfileConfig,accountFingerprint,readDetail})): {profile,results:[],requestedCount:0,completeCount:0,partial:false,readOnly:true,status:'no-supported-recent-sessions'};
    recentSessionDetails={...recentSessionDetails,results:recentSessionDetails.results.map(row=>row.status==='complete'?{...row,detail:compactPlanningDetail(row.detail)}:row)};
    await assertSameAccount();
  }
  return {profile,month:args.month,days:args.days,trainingProfile,calendar,baselines,athlete,completedSessionDetailKeys,recentSessionDetails,phaseTimingsMs:{...phaseTimingsMs,total:Math.round(performance.now()-startedAt)},readOnly:true,healthRead:false,importedActivitiesRead:false,scientificApproval:false,writeAuthorized:false,note:'One bounded read of each section. Optional recentSessionDetails reads at most four newest supported mobile sessions; inspect partial and exact keys. Selected variant/accessory and science gates remain.'};
}
