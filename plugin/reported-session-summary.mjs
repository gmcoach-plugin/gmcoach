const object = v => v !== null && typeof v === 'object' && !Array.isArray(v);
export const SESSION_SUMMARY_SOURCE = 'https://github.com/hbui3/UnofficialSpeedianceWorkoutManager/blob/4e12bc6108f43c2705e935aa3d5db563cb8a3c06/api_client.py#L678';
export async function readReportedSessionSummary({apiRead, trainingId} = {}) {
  if (!Number.isSafeInteger(trainingId) || trainingId < 1) throw new TypeError('training_id must be a positive safe integer.');
  if (typeof apiRead !== 'function') throw new TypeError('apiRead required.');
  const endpoint = `/app/trainingInfo/courseTrainingInfo/${trainingId}`;
  const out = {operationStatus:'read-only',mutationSent:false,source:SESSION_SUMMARY_SOURCE,sourceEndpoint:endpoint,
    endpointNamespace:'courseTrainingInfo',requestedTrainingId:trainingId,reportedIdentityStatus:'unreported',reportedIdentities:[],
    identitySemantics:'scalar-equality-only-not-a-cross-namespace-association',joinedToOtherTraining:false,
    completenessScope:'bounded-returned-container-only',endpointCoverage:'unknown',complete:false,
    scientificApproval:false,recoveryReadinessInferred:false,reportedData:null,reportedMetrics:{},observedFields:[],diagnostics:[],
    note:'Standalone reported session summary. No custom/course/AI/calendar association is inferred. Duration and calorie units follow the pinned reference client renderer, not firmware validation. Capacity units are unknown; this is not per-set weight or tonnage.'};
  const issue = code => {if(!out.diagnostics.includes(code)&&out.diagnostics.length<10)out.diagnostics.push(code);};
  let nodes=0;
  function bounded(value,path,depth) {
    if(++nodes>1000||depth>6){issue('bounded-data-truncated');return null;}
    if(value===null||typeof value==='boolean'||typeof value==='number'&&Number.isFinite(value))return value;
    // Unknown text can contain personal identity or credentials even under innocent keys.
    if(typeof value==='string'){issue('unverified-text-omitted');return null;}
    if(Array.isArray(value)){if(value.length>100)issue('bounded-data-truncated');return value.slice(0,100).map((v,i)=>bounded(v,`${path}[${i}]`,depth+1));}
    if(!object(value)){issue('unsupported-json-value');return null;}
    const result={},keys=Object.keys(value);if(keys.length>100)issue('bounded-data-truncated');
    for(const key of keys.slice(0,100)){
      if(!/^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(key)||/token|password|secret|credential|authorization|cookie|email|phone|address|identity|user.?id/i.test(key)){issue('sensitive-or-unsupported-field-omitted');continue;}
      const childPath=`${path}.${key}`;
      if(out.observedFields.length<100)out.observedFields.push({path:childPath,semantics:'unknown',unit:'unknown'});else issue('observed-field-metadata-truncated');
      Object.defineProperty(result,key,{value:bounded(value[key],childPath,depth+1),enumerable:true});
    }
    return result;
  }
  try {
    const response=await apiRead(endpoint);
    if(!object(response)||response.code!==0||!Object.hasOwn(response,'data')){issue('unconfirmed-response-envelope');return out;}
    if(!object(response.data)){issue('unsupported-session-container');return out;}
    const data=response.data;
    // These are raw candidate identifiers, not proof that either field identifies the requested endpoint namespace.
    for(const field of ['id','trainingId'])if(Object.hasOwn(data,field)){
      const value=data[field],valid=Number.isSafeInteger(value)&&value>=1;
      out.reportedIdentities.push({sourcePath:`$.data.${field}`,valid,value:valid?value:null,namespace:'unverified'});
    }
    if(out.reportedIdentities.length)out.reportedIdentityStatus=out.reportedIdentities.every(row=>row.valid&&row.value===trainingId)?'matched':'conflicting';
    if(out.reportedIdentityStatus==='conflicting')issue('reported-identity-conflict');
    out.reportedData=bounded(data,'$.data',0);
    for(const [field,unit] of [['trainingTime','seconds'],['calorie','kcal'],['totalCapacity','unknown']]){
      if(!Object.hasOwn(data,field))continue;
      const value=data[field];if(typeof value!=='number'||!Number.isFinite(value)||value<0){issue('invalid-known-metric');continue;}
      out.reportedMetrics[field]={value,unit,sourcePath:`$.data.${field}`,scope:'returned-container-only',semantics:field==='totalCapacity'?'reported-capacity-not-tonnage':'reference-client-renderer-labelled',source:'https://github.com/hbui3/UnofficialSpeedianceWorkoutManager/blob/4e12bc6108f43c2705e935aa3d5db563cb8a3c06/templates/history.html#L265'};
    }
    out.complete=out.diagnostics.length===0;
  }catch{issue('session-summary-read-failed');}
  return out;
}
