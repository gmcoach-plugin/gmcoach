import {AsyncLocalStorage} from 'node:async_hooks';

// Private operation state: never a client-issued token or write authorization.
const storage=new AsyncLocalStorage();
const sha=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
export function savedPresetReadActive(profile){const s=storage.getStore();return !!s&&(profile===undefined||s.binding.profile===profile);}
export function assertSavedPresetReadHealthy(){const s=storage.getStore();if(s?.failure)throw s.failure;}
export function rememberSavedPresetReadFailure(error){const s=storage.getStore();if(s&&!s.failure)s.failure=error;}
export function withSavedPresetReadScope(input,callback){
 if(!input||typeof input.profile!=='string'||!input.profile||!sha(input.accountScope)||!['EU','Global'].includes(input.region)||typeof input.loginClientType!=='string'||!Number.isSafeInteger(input.deviceType)||input.deviceType<1||typeof input.programCode!=='string'||!/^[A-Za-z0-9._-]{1,128}$/.test(input.programCode)||typeof callback!=='function')throw TypeError('Invalid enriched read binding.');
 if(storage.getStore())throw Error('Nested enriched read forbidden.');
 const binding=Object.freeze({profile:input.profile,accountScope:input.accountScope,region:input.region,loginClientType:input.loginClientType,deviceType:input.deviceType,programCode:input.programCode});
 const state={binding,groups:new Set(),failure:null,requests:0,catalogDepth:0,catalogRequests:0,catalogPaths:new Set()};
 const permitTemplateGroups=template=>{
  const rows=Object.getOwnPropertyDescriptor(template,'actionLibraryList')?.value;
  if(!Array.isArray(rows)||rows.length>100)throw TypeError('Invalid enriched template rows.');
  const groups=new Set();for(let i=0;i<rows.length;i++){const row=Object.getOwnPropertyDescriptor(rows,String(i))?.value;const id=row&&Object.getOwnPropertyDescriptor(row,'groupId')?.value;if(!Number.isSafeInteger(id)||id<=0)throw TypeError('Invalid enriched group.');groups.add(id);}state.groups=groups;
 };
 // Metrics expose counts only; no URL, account identity, credential or cache token.
 const readMetrics=()=>{assertSavedPresetReadHealthy();return Object.freeze({guardedGETRequests:state.requests,catalogGETRequests:state.catalogRequests,nonCatalogGETRequests:state.requests-state.catalogRequests,uniqueCatalogGETPaths:state.catalogPaths.size,counterProvenance:'synchronous-private-before-fetch-guard; not an independent HTTP trace'});};
 return storage.run(state,async()=>{const result=await callback(permitTemplateGroups,readMetrics);assertSavedPresetReadHealthy();return result;});
}
export async function withSavedPresetCatalogRead(callback){
 const s=storage.getStore();if(!s)return callback();assertSavedPresetReadHealthy();if(s.catalogDepth)throw Error('Nested saved catalog phase forbidden.');s.catalogDepth=1;try{const result=await callback();assertSavedPresetReadHealthy();return result;}finally{s.catalogDepth=0;}
}
export function assertSavedPresetReadRequest(current,path,method){
 const s=storage.getStore();if(!s)return;assertSavedPresetReadHealthy();
 const b=s.binding;
 if(!current||Object.keys(b).filter(k=>k!=='programCode').some(k=>current[k]!==b[k]))throw Error('Enriched saved read identity changed.');
 if(method!=='GET'||typeof path!=='string'||++s.requests>361)throw Error('Enriched saved read request denied.');
 // Explicit compatibility phase: only the existing semantic catalog loader, never account history.
 if(s.catalogDepth){
  if(++s.catalogRequests>256)throw Error('Bounded saved catalog read exhausted.');
  const tabList=`/app/actionLibraryTab/list?deviceType=${encodeURIComponent(b.deviceType)}`;
  const category=/^\/app\/actionLibraryGroup\/trainingPartGroup\?tabId=([1-9]\d{0,15})&deviceTypeList=([1-9]\d{0,3})$/.exec(path);
  const batch=path.startsWith('/app/actionLibraryGroup/list?')?path.slice('/app/actionLibraryGroup/list?'.length).split('&'):null;
  const validBatch=batch&&batch.length>=1&&batch.length<=50&&new Set(batch).size===batch.length&&batch.every(cell=>/^ids=[1-9]\d{0,15}$/.test(cell)&&Number.isSafeInteger(Number(cell.slice(4))));
  if(path!==tabList&&!(category&&Number(category[2])===b.deviceType&&Number.isSafeInteger(Number(category[1])))&&!validBatch)throw Error('Saved catalog endpoint denied.');
  s.catalogPaths.add(path);return;
 }
 const list=`/app/v4/customTrainingTemplate/appPage?pageNo=1&pageSize=-1&deviceTypes=${encodeURIComponent(b.deviceType)}`;
 const detail=`/app/v3/customTrainingTemplate/detailByCode?code=${encodeURIComponent(b.programCode)}`;
 if(path===list||path===detail||path==='/app/userinfo/info')return;
 const match=/^\/app\/actionLibraryGroup\/([1-9]\d*)\?isDisplay=1$/.exec(path);
 if(match&&Number.isSafeInteger(Number(match[1]))&&s.groups.has(Number(match[1])))return;
 if(path.startsWith('/app/actionLibraryGroup/list?')){
  const query=path.slice('/app/actionLibraryGroup/list?'.length).split('&');
  if(query.length<1||query.length>50)throw Error('Enriched saved group batch denied.');
  const ids=query.map(cell=>/^ids=([1-9]\d*)$/.exec(cell)?.[1]);
  if(ids.every(id=>id!==undefined&&Number.isSafeInteger(Number(id))&&s.groups.has(Number(id)))&&new Set(ids).size===ids.length)return;
 }
 throw Error('Enriched saved read endpoint denied.');
}
