import { AsyncLocalStorage } from 'node:async_hooks';

// Private side channels: never attach metadata to API JSON or templates.
const scopes = new AsyncLocalStorage();
const envelopes = new WeakMap();
const templates = new WeakMap();
const ENDPOINT = '/app/v3/customTrainingTemplate/detailByCode';
const SOURCE_SHA = '9e194c4d24cc7a076675e0e9d0a1ad9ac3f92974128ee1f1d39f25a8b3e26339';
const same = (a,b) => a && b && a.profile === b.profile && a.accountFingerprint === b.accountFingerprint && a.region === b.region && a.code === b.code && a.loginClientType === b.loginClientType && a.deviceType === b.deviceType;
function binding(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).length !== 6) throw new TypeError('Invalid header diagnostic binding.');
  const out = {};
  for (const key of ['profile','accountFingerprint','region','code','loginClientType']) {
    const d=Object.getOwnPropertyDescriptor(value,key);
    if (!d || !Object.hasOwn(d,'value') || typeof d.value !== 'string') throw new TypeError('Invalid header diagnostic binding.');
    out[key]=d.value;
  }
  const device = Object.getOwnPropertyDescriptor(value,'deviceType');
  if (!device || !Object.hasOwn(device,'value') || !Number.isSafeInteger(device.value) || device.value<1 || device.value>3) throw new TypeError('Invalid header diagnostic device binding.');
  out.deviceType=device.value;
  if (!out.loginClientType || out.loginClientType.length>32 || !/^[a-zA-Z0-9_-]+$/.test(out.loginClientType)) throw new TypeError('Invalid header diagnostic client binding.');
  if (!out.profile || out.profile.length>128 || !/^[a-f0-9]{64}$/.test(out.accountFingerprint) || !['EU','Global'].includes(out.region) || !/^[A-Za-z0-9._-]{1,128}$/.test(out.code)) throw new TypeError('Invalid header diagnostic binding.');
  return Object.freeze(out);
}
export function withSavedHeaderDiagnosticScope(value, callback) {
  const captured=binding(value);
  if (typeof callback !== 'function') throw new TypeError('Header diagnostic callback required.');
  return scopes.run(captured,callback);
}
export function savedHeaderRecoveryDisabled(profile) { return scopes.getStore()?.profile === profile; }
export function assertSavedHeaderRequestScope(currentProvider, apiPath, method) {
  const scope=scopes.getStore();
  if (!scope) return;
  if (typeof currentProvider !== 'function') throw new TypeError('Synchronous header identity provider required.');
  const current=currentProvider();
  const captured=binding({...current,code:scope.code});
  if (!same(scope,captured)) throw new Error('Header diagnostic scope changed before dispatch.');
  if (method !== 'GET') throw new Error('Header diagnostic permits readonly GET only.');
  if (typeof apiPath !== 'string' || (apiPath.startsWith(ENDPOINT) && apiPath !== `${ENDPOINT}?code=${encodeURIComponent(scope.code)}`)) throw new Error('Header diagnostic program code changed before dispatch.');
}
export function captureSavedResponseHeader(envelope, response, { profile, accountFingerprint, region, loginClientType, deviceType, apiPath, method, observedAt }) {
  const scope=scopes.getStore();
  if (!scope || scope.profile !== profile) return;
  if (method !== 'GET' || apiPath !== `${ENDPOINT}?code=${encodeURIComponent(scope.code)}`) return;
  const current={profile,accountFingerprint,region,loginClientType,deviceType,code:scope.code};
  if (!same(scope,current)) throw new Error('Header diagnostic account binding changed.');
  const code=Object.getOwnPropertyDescriptor(envelope??{},'code');
  if (!envelope || typeof envelope !== 'object' || Array.isArray(envelope) || !code || !Object.hasOwn(code,'value') || Number(code.value) !== 0) throw new Error('Header diagnostic requires successful envelope.');
  let status='not-reported',raw;
  try {
    const value=response.headers.get('weightunit');
    if (value !== null && value !== undefined) {
      if (typeof value !== 'string' || value.length>16 || !/^[\x20-\x7e]*$/.test(value)) status='malformed';
      else {raw=value;status=value==='1'?'recognized-reference-header':'unrecognized';}
    }
  } catch { status='header-unavailable'; }
  if (typeof observedAt !== 'string' || observedAt.length>40 || !Number.isFinite(Date.parse(observedAt))) throw new TypeError('Invalid header observation time.');
  const diagnostic=Object.freeze({schemaVersion:1,endpoint:ENDPOINT,status,...(raw===undefined?{}:{rawWeightunit:raw}),referenceInterpretation:raw==='1'?'kg':'unknown',interpretationSource:'official-share-page-consumer-only',sourceHtmlSha256:SOURCE_SHA,observedAt,usedForLoadInterpretation:false,apiAccountUnitConfirmed:false});
  envelopes.set(envelope,{binding:scope,diagnostic});
}
export function retainSavedResponseHeader(envelope, template, current) {
  const captured=binding(current),scope=scopes.getStore(),record=envelopes.get(envelope);
  if (!same(scope,captured)) throw new Error('Header diagnostic current account changed.');
  if (!record || !same(record.binding,captured)) throw new Error('Exact successful response header binding unavailable.');
  const templateCode=Object.getOwnPropertyDescriptor(template??{},'code');
  if (!template || typeof template !== 'object' || Array.isArray(template) || !templateCode || !Object.hasOwn(templateCode,'value') || templateCode.value !== captured.code) throw new Error('Header diagnostic template identity changed.');
  const id=Object.getOwnPropertyDescriptor(template,'id');
  if (!id || !Object.hasOwn(id,'value') || !Number.isSafeInteger(id.value) || id.value<1) throw new Error('Header diagnostic numeric template identity unavailable.');
  templates.set(template,{...record,templateId:id.value});
}
export function projectSavedResponseHeader(template,current) {
  const captured=binding(current),scope=scopes.getStore(),record=templates.get(template);
  const templateCode=Object.getOwnPropertyDescriptor(template??{},'code');
  if (!same(scope,captured) || !record || !same(record.binding,captured) || !templateCode || !Object.hasOwn(templateCode,'value') || templateCode.value !== captured.code) throw new Error('Header diagnostic final binding changed.');
  const id=Object.getOwnPropertyDescriptor(template,'id');
  if (!id || !Object.hasOwn(id,'value') || id.value!==record.templateId) throw new Error('Header diagnostic numeric template identity changed.');
  const result={...record.diagnostic};
  if (Buffer.byteLength(JSON.stringify(result),'utf8')>2048) throw new Error('Header diagnostic envelope exceeds budget.');
  return result;
}


// Additive official-share DISPLAY only. The private same-read header remains the authority.
// Never consumed by writers, account-unit decoders, RM conversion or scientific approval.
export function projectSavedNativeStaticDisplay(template,readable,current){
 const header=projectSavedResponseHeader(template,current);
 const base={readOnly:true,displayOnly:true,scientificApproval:false,executableAllowed:false,qualification:'official-share-consumer-display',physicalResistanceConfirmed:false,apiAccountUnitConfirmed:false,endpoint:header.endpoint,sourceHtmlSha256:header.sourceHtmlSha256,observedAt:header.observedAt};
 const unavailable=reason=>({...base,status:'unavailable',reason,rows:[]});
 if(header.status!=='recognized-reference-header'||header.rawWeightunit!=='1')return unavailable('exact-response-header-unit-unqualified');
 const own=(o,k)=>{if(!o||typeof o!=='object'||Array.isArray(o)&&k==='__proto__')throw Error();const d=Object.getOwnPropertyDescriptor(o,k);if(!d){if(k in o)throw Error();return undefined;}if(!Object.hasOwn(d,'value'))throw Error();return d.value;};
 const plain=o=>o!==null&&typeof o==='object'&&!Array.isArray(o)&&[Object.prototype,null].includes(Object.getPrototypeOf(o));
 const dense=(a,max)=>{if(!Array.isArray(a)||Object.getPrototypeOf(a)!==Array.prototype||a.length>max)throw Error();const rows=[];for(let i=0;i<a.length;i++){const d=Object.getOwnPropertyDescriptor(a,String(i));if(!d||!Object.hasOwn(d,'value'))throw Error();rows.push(d.value);}return rows;};
 const csv=x=>{if(typeof x!=='string'||x.length>4000)throw Error();return x.split(',');};
 const empty=x=>x===undefined||x===null||x==='';
 const positiveId=x=>typeof x==='number'&&Number.isSafeInteger(x)&&x>0;
 try{
  const actions=dense(own(template,'actionLibraryList'),100),exercises=dense(own(readable,'exercises'),100);if(actions.length!==exercises.length)return unavailable('readable-template-alignment-unqualified');
  const rows=[];
  for(let actionIndex=0;actionIndex<actions.length;actionIndex++){
   const action=actions[actionIndex],exercise=exercises[actionIndex];
   try{
    if(!plain(action)||!plain(exercise))continue;
    const id=own(action,'groupId'),variant=own(action,'actionLibraryId'),sets=dense(own(exercise,'sets'),100);
    if(!positiveId(id)||!positiveId(variant)||own(exercise,'exerciseId')!==id||own(exercise,'actionLibraryId')!==variant||!sets.length)continue;
    if(own(action,'templatePresetId')!==-1||!['presetId','preset_id'].every(k=>own(action,k)===undefined||own(action,k)===-1))continue;
    if(!empty(own(action,'counterweight'))||!empty(own(action,'counterweight2'))||!empty(own(action,'springGroupList')))continue;
    const method=own(action,'completionMethod');if(typeof method!=='string'&&typeof method!=='number')continue;
    if(typeof method==='number'&&method!==1)continue;
    const methods=typeof method==='number'?['1']:csv(method),weights=csv(own(action,'weights')),work=csv(own(action,'setsAndReps'));
    if(weights.length!==sets.length||work.length!==sets.length||![1,sets.length].includes(methods.length)||methods.some(x=>x!=='1'))continue;
    if(weights.some(x=>!/^\d+(?:\.\d+)?$/.test(x)||!Number.isFinite(Number(x))||Number(x)<=0)||work.some(x=>!/^\d+$/.test(x)||!Number.isSafeInteger(Number(x))||Number(x)<=0))continue;
    let valid=true;
    for(let index=0;index<sets.length;index++){const set=sets[index];if(!plain(set)||own(set,'set')!==index+1||own(set,'unit')!=='reps'||own(set,'loadType')!=='static-account-load'){valid=false;break;}}
    if(!valid)continue;
    for(let index=0;index<sets.length;index++)rows.push({actionIndex,exerciseId:id,actionLibraryId:variant,set:index+1,reportedWeight:Number(weights[index]),displayUnit:'kg',displayLoad:`${Number(weights[index])} kg (widok producenta)`});
   }catch{ /* malformed individual action/set never invokes accessors or hides other rows */ }
  }
  const out={...base,status:rows.length?'qualified-display-rows':'unavailable',reason:rows.length?'exact-customize-reps-same-response-header':'no-qualified-customize-rows',rows};
  return Buffer.byteLength(JSON.stringify(out),'utf8')<=16000?out:{...base,status:'resource-bound',reason:'display-envelope-bound',rows:[]};
 }catch{return unavailable('descriptor-or-alignment-unqualified');}
}
