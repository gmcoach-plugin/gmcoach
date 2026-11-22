import {createHash} from 'node:crypto';

const sha=text=>createHash('sha256').update(text,'utf8').digest('hex');
const size=value=>Buffer.byteLength(JSON.stringify(value),'utf8');
const plain=value=>value!==null&&typeof value==='object'&&!Array.isArray(value)&&[Object.prototype,null].includes(Object.getPrototypeOf(value));
const own=(value,key,optional=false)=>{const d=Object.getOwnPropertyDescriptor(value,key);if(!d){if(!optional||key in value)throw Error();return undefined;}if(!Object.hasOwn(d,'value'))throw Error();return d.value;};
const text=(value,max)=>typeof value==='string'&&value.length<=max&&value.isWellFormed()&&!/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value);
const strings=(value,count,max)=>{if(!Array.isArray(value)||value.length>count)throw Error();const result=[];for(let i=0;i<value.length;i++){const v=own(value,String(i));if(!text(v,max)||!v)throw Error();result.push(v);}return result;};
const boundary=(value,offset)=>offset===0||offset===value.length||!(value.charCodeAt(offset-1)>=0xd800&&value.charCodeAt(offset-1)<=0xdbff&&value.charCodeAt(offset)>=0xdc00&&value.charCodeAt(offset)<=0xdfff);
const preview=value=>{let end=Math.min(160,value.length);if(!boundary(value,end))end--;return {titlePreview:value.slice(0,end),titlePreviewTruncated:end<value.length,titleUtf16Length:value.length,titleSha256:sha(value)};};
export const RESEARCH_PROJECTION_ERROR_CODES=Object.freeze(['INVALID_ARGUMENTS','UNKNOWN_OR_EXPIRED_BATCH','INVALID_CANONICAL_BATCH','INVALID_OFFSET','OUTPUT_BUDGET_TOO_SMALL','SOURCE_NOT_IN_BATCH','ABSTRACT_UNAVAILABLE']);
const fail=code=>({ok:false,readOnly:true,scientificApproval:false,executableAllowed:false,error:{code}});

// Server composition only: bind the existing private registry.getBatch closure.
// No fetch/search/profile/storage capability or client-supplied records accepted.
export function createResearchBatchProjectionReader({getBatch,now=Date.now}={}){
 if(typeof getBatch!=='function'||typeof now!=='function')throw TypeError('Private registry callbacks required.');
 return args=>{
  let input;
  try{
   if(!plain(args)||Reflect.ownKeys(args).some(k=>typeof k!=='string'||!['batchId','mode','sourceId','offset','maxOutputBytes'].includes(k)))return fail('INVALID_ARGUMENTS');
   const batchId=own(args,'batchId'),mode=own(args,'mode'),sourceId=own(args,'sourceId',true),cursor=own(args,'offset',true),limit=own(args,'maxOutputBytes',true);
   const offset=cursor===undefined?0:cursor,maxOutputBytes=limit===undefined?6000:limit;
   if(!text(batchId,128)||!batchId||!['index','bibliography','abstract'].includes(mode)||!Number.isSafeInteger(offset)||offset<0||!Number.isSafeInteger(maxOutputBytes)||maxOutputBytes<1024||maxOutputBytes>16000||mode==='index'&&sourceId!==undefined||mode!=='index'&&(typeof sourceId!=='string'||!/^pubmed:\d{1,12}$/.test(sourceId)))return fail('INVALID_ARGUMENTS');
   input={batchId,mode,sourceId,offset,maxOutputBytes};
  }catch{return fail('INVALID_ARGUMENTS');}
  try{
   const batch=getBatch(input.batchId),timestamp=now();
   if(!plain(batch)||own(batch,'batchId')!==input.batchId)return fail('UNKNOWN_OR_EXPIRED_BATCH');
   const expiresAt=own(batch,'expiresAt');
   if(!Number.isFinite(timestamp)||!Number.isFinite(expiresAt)||expiresAt<=timestamp)return fail('UNKNOWN_OR_EXPIRED_BATCH');
   const sources=own(batch,'sources');if(!Array.isArray(sources)||sources.length>40)return fail('INVALID_CANONICAL_BATCH');
   const rows=[],ids=new Set();
   for(let i=0;i<sources.length;i++){
    const s=own(sources,String(i));if(!plain(s))return fail('INVALID_CANONICAL_BATCH');
    const id=own(s,'id'),pmid=own(s,'pmid'),title=own(s,'title'),year=own(s,'year'),publicationDate=own(s,'publicationDate'),journal=own(s,'journal'),url=own(s,'url'),abstract=own(s,'abstract'),hasAbstract=own(s,'hasAbstract');
    if(typeof id!=='string'||!/^pubmed:\d{1,12}$/.test(id)||ids.has(id)||pmid!==id.slice(7)||!text(title,12000)||!title.trim()||year!==null&&(!Number.isSafeInteger(year)||year<1||year>9999)||publicationDate!==null&&!text(publicationDate,100)||journal!==null&&!text(journal,12000)||url!==`https://pubmed.ncbi.nlm.nih.gov/${pmid}/`||abstract!==null&&(!text(abstract,12000)||!abstract)||hasAbstract!==(abstract!==null))return fail('INVALID_CANONICAL_BATCH');
    const publicationTypes=strings(own(s,'publicationTypes'),20,4096),matchedCategories=strings(own(s,'matchedCategories'),32,128);
    const bibliography={id,pmid,title,year,publicationDate,journal,publicationTypes,url,matchedCategories,doi:null,doiCanonicalUrl:null,doiStatus:'not-retained-by-current-registry'};
    const bibliographyText=JSON.stringify(bibliography);if(Buffer.byteLength(bibliographyText,'utf8')>150000)return fail('INVALID_CANONICAL_BATCH');
    ids.add(id);rows.push({id,title,abstract,hasAbstract,bibliographyText});
   }
   const common={ok:true,schemaVersion:2,readOnly:true,scientificApproval:false,executableAllowed:false,batchId:input.batchId,expiresAt,mode:input.mode,byteBudgetScope:'compact-tool-content-text-utf8'};
   if(input.mode==='index'){
    if(input.offset>rows.length||rows.length>0&&input.offset===rows.length)return fail('INVALID_OFFSET');
    const entries=[];let end=input.offset;
    const build=()=>({...common,offset:input.offset,endOffsetExclusive:end,totalSources:rows.length,nextOffset:end<rows.length?end:null,coverageMeaning:'index-page-only; no abstract reading or semantic support approval',entries});
    while(end<rows.length){const r=rows[end];entries.push({sourceId:r.id,...preview(r.title),hasAbstract:r.hasAbstract,abstractUtf16Length:r.abstract?.length??0,abstractSha256:r.hasAbstract?sha(r.abstract):null,bibliographyUtf16Length:r.bibliographyText.length,bibliographySha256:sha(r.bibliographyText)});end++;if(size(build())>input.maxOutputBytes){entries.pop();end--;break;}}
    if(end===input.offset&&end<rows.length)return fail('OUTPUT_BUDGET_TOO_SMALL');
    const result=build();return size(result)<=input.maxOutputBytes?result:fail('OUTPUT_BUDGET_TOO_SMALL');
   }
   const r=rows.find(row=>row.id===input.sourceId);if(!r)return fail('SOURCE_NOT_IN_BATCH');
   if(input.mode==='abstract'&&!r.hasAbstract)return fail('ABSTRACT_UNAVAILABLE');
   const value=input.mode==='abstract'?r.abstract:r.bibliographyText;
   if(input.offset>=value.length||!boundary(value,input.offset))return fail('INVALID_OFFSET');
   const build=end=>({...common,sourceId:r.id,contentFormat:input.mode==='abstract'?'retained-abstract-text':'canonical-bibliography-json-text',offsetUnit:'utf16-code-units',start:input.offset,end,totalUtf16Length:value.length,contentSha256:sha(value),nextOffset:end<value.length?end:null,coverageMeaning:'this-fragment-only; gapless coverage and semantic assessment remain caller responsibilities',text:value.slice(input.offset,end)});
   const ends=[input.offset];let position=input.offset;for(const point of value.slice(input.offset)){position+=point.length;ends.push(position);}
   let low=0,high=ends.length-1;while(low<high){const mid=Math.ceil((low+high)/2);if(size(build(ends[mid]))<=input.maxOutputBytes)low=mid;else high=mid-1;}
   if(low===0)return fail('OUTPUT_BUDGET_TOO_SMALL');const result=build(ends[low]);return size(result)<=input.maxOutputBytes?result:fail('OUTPUT_BUDGET_TOO_SMALL');
  }catch{return fail('INVALID_CANONICAL_BATCH');}
 };
}
