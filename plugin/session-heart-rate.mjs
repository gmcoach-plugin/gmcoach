// Public consumer evidence, not an official or universally verified watch schema.
// pookey/speediance-cli c7fbc4e910b9065958406522b9a8f1f169394c02
const endpoint = '/app/watchMsg/getHeartRateGraph';
function record(value) {
  if (!value || typeof value !== 'object' || ![Object.prototype, null].includes(Object.getPrototypeOf(value)) || Object.getOwnPropertySymbols(value).length) throw new Error('Unsupported session heart-rate record.');
  const keys = Object.getOwnPropertyNames(value);
  if (keys.length > 256 || keys.some(key => !Object.hasOwn(Object.getOwnPropertyDescriptor(value,key),'value'))) throw new Error('Unsupported session heart-rate descriptors.');
  return value;
}
function rows(value, maximum) {
  if (!Array.isArray(value) || value.length > maximum || Object.getOwnPropertySymbols(value).length) throw new Error('Unsupported session heart-rate array.');
  const keys=Object.getOwnPropertyNames(value);
  if (keys.length !== value.length+1 || keys.some(key => !Object.hasOwn(Object.getOwnPropertyDescriptor(value,key),'value'))) throw new Error('Unsupported session heart-rate array descriptors.');
  for(let i=0;i<value.length;i++) if(!Object.hasOwn(value,i)) throw new Error('Sparse session heart-rate array.');
  return value;
}
export function extractSessionHeartUuid(payload, type) {
  record(payload);
  const found=new Set();
  const add=value=>{
    if(value===undefined || value===null || value==='') return;
    if(typeof value!=='string' || !/^[A-Za-z0-9._:-]{1,128}$/.test(value)) throw new Error('Unsupported session heart-rate identity.');
    found.add(value);
  };
  if(type==='free' && payload.info!==undefined && payload.info!==null) add(record(payload.info).uuid);
  if(payload.detail!==undefined && payload.detail!==null) {
    for(const movement of rows(payload.detail,364)) {
      record(movement);
      if(movement.finishedReps===undefined || movement.finishedReps===null) continue;
      for(const set of rows(movement.finishedReps,256)) {
        record(set);
        if(set.trainingInfoDetail!==undefined && set.trainingInfoDetail!==null) add(record(set.trainingInfoDetail).uuid);
      }
    }
  }
  if(found.size>1) throw new Error('Conflicting session heart-rate identities.');
  return [...found][0]??null;
}
export function normalizeSessionHeartGraph(graph) {
  record(graph);
  const missing=[];
  const bpm=key=>{
    const value=graph[key];
    if(value===undefined || value===null || value===0) { missing.push(key);return null; }
    if(typeof value!=='number' || !Number.isFinite(value) || value<=0 || value>300) throw new Error('Unsupported session heart-rate measurement.');
    return value;
  };
  const min=bpm('minHeartRate'),avg=bpm('avgHeartRate'),max=bpm('maxHeartRate');
  if(min!==null && max!==null && min>max || avg!==null && (min!==null && avg<min || max!==null && avg>max)) throw new Error('Conflicting session heart-rate measurements.');
  let count=null;
  if(graph.heartRates!==undefined && graph.heartRates!==null) count=rows(graph.heartRates,100000).length;
  else missing.push('heartRates');
  return {status:min===null && avg===null && max===null?'unavailable':'reported',reportedMinBpm:min,reportedAvgBpm:avg,reportedMaxBpm:max,reportedSampleCount:count,missingFields:missing};
}
export async function readSessionHeartSummary({payload,type,trainingId,date,apiRead,assertCurrent}={}) {
  const base={requested:true,sourceEndpoint:endpoint,session:{trainingId,date,namespace:type},measurementTiming:'session-linked-cadence-unverified',biologicalReadinessCalculated:false};
  if(typeof trainingId!=='string' || !/^[A-Za-z0-9._-]{1,128}$/.test(trainingId) || !['program','free','course','ai'].includes(type) || typeof date!=='string' || !/^\d{4}-\d{2}-\d{2}$/.test(date) || typeof apiRead!=='function' || typeof assertCurrent!=='function') throw new Error('Bound session heart-rate reader requires identity and guards.');
  await assertCurrent();
  let uuid;
  try {uuid=extractSessionHeartUuid(payload,type);} catch {return {...base,status:'unsupported-schema',diagnostic:'session-heart-identity-unrecognized'};}
  if(!uuid) return {...base,status:'unavailable',diagnostic:'session-heart-uuid-missing'};
  let response;
  try {response=await apiRead(`${endpoint}?uuid=${encodeURIComponent(uuid)}`);} catch {await assertCurrent();return {...base,status:'unavailable',diagnostic:'session-heart-read-failed'};}
  await assertCurrent();
  try {
    record(response);
    if(response.code!==0) return {...base,status:'unavailable',diagnostic:'session-heart-api-rejected'};
    return {...base,...normalizeSessionHeartGraph(response.data)};
  } catch {return {...base,status:'unsupported-schema',diagnostic:'session-heart-graph-unrecognized'};}
}
