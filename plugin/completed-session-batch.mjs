const validDate=value=>{
  if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;
  const parsed=new Date(`${value}T12:00:00Z`);
  return Number.isFinite(parsed.getTime())&&parsed.toISOString().slice(0,10)===value;
};

export async function readCompletedSessionBatch(args,{resolveProfile,readProfileConfig,accountFingerprint,readDetail}){
  if(!args||typeof args!=='object'||Array.isArray(args)||Object.keys(args).some(key=>!['profile','sessions','consent_to_read_history'].includes(key))||args.consent_to_read_history!==true)throw new Error('Explicit completed-history consent and exact batch fields required.');
  if(!Array.isArray(args.sessions)||args.sessions.length<1||args.sessions.length>4)throw new Error('Select 1–4 exact completed sessions.');
  const seen=new Set();
  for(const row of args.sessions){
    if(!row||typeof row!=='object'||Array.isArray(row)||Object.keys(row).some(key=>!['training_id','type','date'].includes(key))||typeof row.training_id!=='string'||!/^[1-9][0-9]{0,18}$/.test(row.training_id)||!['program','free','course','ai'].includes(row.type)||!validDate(row.date))throw new Error('Invalid exact completed session key.');
    const key=JSON.stringify([row.training_id,row.type,row.date]);
    if(seen.has(key))throw new Error('Duplicate completed session key.');
    seen.add(key);
  }
  const profile=await resolveProfile(args.profile);
  const initial=await readProfileConfig(profile);
  const fingerprint=accountFingerprint(initial);
  const started=performance.now();
  const settled=await Promise.allSettled(args.sessions.map(async row=>{
    const began=performance.now();
    try{return {status:'complete',key:row,detail:await readDetail({...row,profile,output_view:'planning'}),durationMs:Math.round(performance.now()-began)};}
    catch(error){return {status:'error',key:row,error:typeof error?.code==='string'?error.code:'DETAIL_READ_FAILED',durationMs:Math.round(performance.now()-began)};}
  }));
  const current=await readProfileConfig(profile);
  if(accountFingerprint(current)!==fingerprint)throw new Error('Account changed during completed-session batch.');
  const results=settled.map((item,index)=>item.status==='fulfilled'?item.value:{status:'error',key:args.sessions[index],error:'DETAIL_READ_FAILED',durationMs:null});
  return {profile,results,requestedCount:results.length,completeCount:results.filter(item=>item.status==='complete').length,partial:results.some(item=>item.status!=='complete'),durationMs:Math.round(performance.now()-started),readOnly:true,healthRead:false,scientificApproval:false,writeAuthorized:false,note:'Only exact completed-session keys were read. Partial results are not empty training history; inspect each error before using the draft.'};
}
