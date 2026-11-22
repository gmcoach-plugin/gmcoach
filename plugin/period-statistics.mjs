const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
export const PERIOD_STATISTICS_SOURCE = 'https://github.com/hbui3/UnofficialSpeedianceWorkoutManager/blob/4e12bc6108f43c2705e935aa3d5db563cb8a3c06/api_client.py#L643';
function date(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new TypeError('Date must be YYYY-MM-DD.');
  const day = new Date(`${value}T00:00:00Z`);
  if (!Number.isFinite(day.getTime()) || day.toISOString().slice(0,10) !== value) throw new TypeError('Invalid calendar date.');
  return day;
}
// Endpoint schema is unverified. Retain bounded reported JSON, suppress potential
// secret/private identity fields and never interpret unnamed scalars as metrics.
export async function readPeriodStatistics({ apiRead, startDate, endDate } = {}) {
  const start = date(startDate), end = date(endDate);
  if (end < start || end-start > 3650*86400000) throw new TypeError('Date range must be ordered and at most 3650 days.');
  if (typeof apiRead !== 'function') throw new TypeError('apiRead required.');
  const endpoint = `/mobile/v2/report/userTrainingDataStat?startDate=${startDate}&endDate=${endDate}`;
  const out = { operationStatus:'read-only', mutationSent:false, source:PERIOD_STATISTICS_SOURCE,
    sourceEndpoint:endpoint, requestedStartDate:startDate, requestedEndDate:endDate,
    dateBoundarySemantics:'unverified-endpoint-inclusivity', deviceScope:'not-specified-by-source',
    semanticStatus:'renderer-labelled-known-metrics-and-uninterpreted-other-fields',
    completenessScope:'bounded-returned-container-only', endpointPeriodCoverage:'unknown', scientificApproval:false, recoveryReadinessInferred:false,
    complete:false, reportedData:null, observedFields:[], diagnostics:[],
    note:'trainingTime/calorie labels follow the pinned reference client renderer (seconds/kcal), not device validation. Other values and capacity units remain unknown. Container completeness does not prove period coverage. No fatigue/recovery estimate is derived.' };
  const issue = code => { if (!out.diagnostics.includes(code) && out.diagnostics.length < 10) out.diagnostics.push(code); };
  let nodes = 0;
  function bounded(value,path,depth) {
    if (++nodes > 1000 || depth > 6) { issue('bounded-data-truncated'); return null; }
    if (value === null || typeof value === 'boolean' || typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string') { if (value.length > 300) issue('bounded-data-truncated'); return value.slice(0,300).replace(/[\u0000-\u001f\u007f]/g,''); }
    if (Array.isArray(value)) { if(value.length>100)issue('bounded-data-truncated'); return value.slice(0,100).map((row,i)=>bounded(row,`${path}[${i}]`,depth+1)); }
    if (!object(value)) { issue('unsupported-json-value'); return null; }
    const result = {};
    const keys = Object.keys(value); if(keys.length>100)issue('bounded-data-truncated');
    for(const key of keys.slice(0,100)) {
      if (!/^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(key) || /token|password|secret|credential|authorization|cookie|email|phone|address|identity|user.?id/i.test(key)) { issue('sensitive-or-unsupported-field-omitted'); continue; }
      const childPath = `${path}.${key}`;
      if(out.observedFields.length<100)out.observedFields.push({path:childPath,type:value[key]===null?'null':Array.isArray(value[key])?'array':typeof value[key],semantics:'unknown',unit:'unknown'});
      else issue('observed-field-metadata-truncated');
      Object.defineProperty(result,key,{value:bounded(value[key],childPath,depth+1),enumerable:true,writable:true,configurable:true});
    }
    return result;
  }
  try {
    const response = await apiRead(endpoint);
    if(!object(response)||response.code!==0||!Object.hasOwn(response,'data')) { issue('unconfirmed-response-envelope'); return out; }
    if(!object(response.data)&&!Array.isArray(response.data)) { issue('unsupported-statistics-container'); return out; }
    out.reportedData=bounded(response.data,'$.data',0);
    out.reportedMetrics = {};
    for (const [field, unit] of [['trainingTime','seconds'],['calorie','kcal'],['totalCapacity','unknown']]) {
      if (!object(response.data) || !Object.hasOwn(response.data,field)) continue;
      const value=response.data[field];
      if(typeof value!=='number'||!Number.isFinite(value)||value<0) { issue('invalid-known-metric'); continue; }
      out.reportedMetrics[field]={value,unit,sourcePath:`$.data.${field}`,semantics:field==='totalCapacity'?'reported-capacity-not-tonnage':'reference-client-renderer-labelled',source:'https://github.com/hbui3/UnofficialSpeedianceWorkoutManager/blob/4e12bc6108f43c2705e935aa3d5db563cb8a3c06/templates/history.html#L181'};
    }
    out.complete=out.diagnostics.length===0;
  } catch { issue('period-statistics-read-failed'); }
  return out;
}
