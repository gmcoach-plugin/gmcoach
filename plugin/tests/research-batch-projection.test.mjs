import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {AsyncLocalStorage} from 'node:async_hooks';
import {createTrainingResearchRegistry,withTrainingResearchRequestScope} from '../training-research.mjs';
import {TRAINING_EVIDENCE_CATEGORIES} from '../training-evidence.mjs';
import {createResearchBatchProjectionReader,RESEARCH_PROJECTION_ERROR_CODES} from '../research-batch-projection.mjs';

const server=readFileSync(new URL('../mcp_server.mjs',import.meta.url),'utf8');
const sha=s=>createHash('sha256').update(s,'utf8').digest('hex');
const slice=(start,end)=>{const a=server.indexOf(start),b=server.indexOf(end,a);assert.ok(a>=0&&b>a);return server.slice(a,b);};
const xmlEscape=s=>s.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');
function fixture(){
 let clock=1793000000000,gets=0,privateCalls=0;
 const title='😀 Long canonical title '+('quoted bibliography 漢字 '.repeat(60));
 const abstract='😀 Exact retained abstract with "quotes" and \\ escaping. '.repeat(150);
 const registry=createTrainingResearchRegistry({now:()=>clock,minRequestIntervalMs:0,fetchImpl:async url=>{
  gets++;
  if(String(url).includes('esearch.fcgi'))return new Response(JSON.stringify({esearchresult:{idlist:['12345678']}}),{status:200,headers:{'content-type':'application/json'}});
  assert.ok(String(url).includes('efetch.fcgi'));
  return new Response(`<PubmedArticleSet><PubmedArticle><MedlineCitation><PMID>12345678</PMID><Article><Journal><Title>Canonical Journal 漢字</Title><JournalIssue><PubDate><Year>2024</Year></PubDate></JournalIssue></Journal><ArticleTitle>${xmlEscape(title)}</ArticleTitle><Abstract><AbstractText>${xmlEscape(abstract)}</AbstractText></Abstract><PublicationTypeList><PublicationType>Randomized Controlled Trial</PublicationType></PublicationTypeList></Article></MedlineCitation></PubmedArticle></PubmedArticleSet>`,{status:200,headers:{'content-type':'text/xml'}});
 }});
 const readTrainingResearchBatchProjection=createResearchBatchProjectionReader({getBatch:registry.getBatch,now:()=>clock});
 const unexpected=()=>{privateCalls++;throw Error('Unexpected account/private capability');};
 // Actual full dispatch and normal context wrapper, not a reconstructed switch.
 const context={accessoryConfirmationContext:new AsyncLocalStorage(),coachingMemoryContext:new AsyncLocalStorage(),withTrainingResearchRequestScope,scalableCycleToolNames:new Set(),trainingResearch:registry,TRAINING_EVIDENCE_CATEGORIES,readTrainingResearchBatchProjection,RESEARCH_PROJECTION_ERROR_CODES,cycleExactKeys:(value,allowed,label)=>{if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(key=>!allowed.includes(key)))throw Error(`Unexpected ${label} fields.`);},resolveProfile:unexpected,observeCoachingMemory:unexpected,observeAccessoryConfirmations:unexpected};
 const dispatch=new Function(...Object.keys(context),`${slice('async function dispatch(name,','\nfunction send(message)')};return dispatch;`)(...Object.values(context));
 const schemaStart=server.indexOf("    name: 'gm_coach_read_training_research_batch',");assert.ok(schemaStart>0);
 const schemaEnd=server.indexOf('\n  {',schemaStart);
 const toolLiteral=server.slice(server.lastIndexOf('  {',schemaStart),schemaEnd).trim().replace(/,$/,'');
 const tool=new Function(`return (${toolLiteral});`)();
 const selectedStart=server.indexOf("    name: 'gm_coach_read_selected_research_abstracts',");assert.ok(selectedStart>0);
 const selectedEnd=server.indexOf('\n  {',selectedStart);
 const selectedTool=new Function(`return (${server.slice(server.lastIndexOf('  {',selectedStart),selectedEnd).trim().replace(/,$/,'')});`)();
 const sent=[];
 const handle=new Function('dispatch','send','tools','PLUGIN_VERSION','COACH_INITIALIZE_INSTRUCTIONS',`${slice('async function handleMessage(message)','\nlet buffer =')};return handleMessage;`)(dispatch,message=>sent.push(message),[tool,selectedTool],'fixture','fixture');
 const call=async(name,args)=>{const count=sent.length;await handle({jsonrpc:'2.0',id:count+1,method:'tools/call',params:{name,arguments:args}});assert.equal(sent.length,count+1);return sent.at(-1);};
 return {registry,call,handle,sent,tool,selectedTool,expire:()=>{clock+=90*60*1000+1;},get gets(){return gets;},get privateCalls(){return privateCalls;}};
}
// Error-first consumer fixture: never JSON.parse a failed MCP envelope.
function value(message){assert.equal(message.jsonrpc,'2.0');if(message.error)throw Error('JSONRPC failure');if(message.result?.isError)throw Error(message.result.content[0].text);assert.equal(message.result?.isError,false);return JSON.parse(message.result.content[0].text);}
async function batch(f){const result=value(await f.call('gm_coach_search_training_research',{queries:[{category:'weekly_volume',query:'trained adults'}],maxResultsPerQuery:1}));assert.equal(f.gets,2);return result;}
async function reconstruct(f,batchId,sourceId,mode){let offset=0,whole='',pages=0,expectedHash,total;do{
 const message=await f.call('gm_coach_read_training_research_batch',{batchId,sourceId,mode,offset,maxOutputBytes:1024});
 assert.equal(message.result.isError,false);assert.ok(Buffer.byteLength(message.result.content[0].text,'utf8')<=1024);
 const out=value(message);assert.equal(out.start,offset);assert.ok(out.end>offset);assert.equal(out.byteBudgetScope,'compact-tool-content-text-utf8');assert.equal(out.scientificApproval,false);assert.equal(out.executableAllowed,false);assert.equal(out.readOnly,true);
 if(pages===0){expectedHash=out.contentSha256;total=out.totalUtf16Length;}assert.equal(out.contentSha256,expectedHash);assert.equal(out.totalUtf16Length,total);
 assert.ok(!/^[\udc00-\udfff]/.test(out.text));assert.ok(!/[\ud800-\udbff]$/.test(out.text));whole+=out.text;offset=out.nextOffset;pages++;
 }while(offset!==null);assert.equal(whole.length,total);assert.equal(sha(whole),expectedHash);assert.ok(pages>1);return whole;}

test('actual producer private registry dispatch and MCP wrapper deliver complete bibliography/abstract with exact UTF8 budget and no further GET',async()=>{
 const f=fixture(),b=await batch(f),s=b.sources[0];
 assert.equal(f.tool.name,'gm_coach_read_training_research_batch');assert.deepEqual(f.tool.inputSchema.properties.mode.enum,['index','bibliography','abstract']);assert.equal(f.tool.inputSchema.additionalProperties,false);
 const index=value(await f.call(f.tool.name,{batchId:b.batchId,mode:'index',maxOutputBytes:16000}));assert.equal(index.totalSources,1);assert.equal(index.entries[0].sourceId,s.id);assert.equal(index.entries[0].titlePreviewTruncated,true);assert.match(index.coverageMeaning,/no abstract reading/);
 const bibliography=JSON.parse(await reconstruct(f,b.batchId,s.id,'bibliography'));
 assert.deepEqual(bibliography,{id:s.id,pmid:s.pmid,title:s.title,year:s.year,publicationDate:s.publicationDate,journal:s.journal,publicationTypes:s.publicationTypes,url:s.url,matchedCategories:s.matchedCategories,doi:null,doiCanonicalUrl:null,doiStatus:'not-retained-by-current-registry'});
 assert.equal(await reconstruct(f,b.batchId,s.id,'abstract'),s.abstract);assert.equal(f.gets,2);assert.equal(f.privateCalls,0);assert.equal(f.registry.getBatch(b.batchId).expiresAt,b.expiresAt);
});
test('selected abstract batch returns full retained texts in one call without a new GET',async()=>{
 const f=fixture(),b=await batch(f),source=b.sources[0];
 const output=value(await f.call(f.selectedTool.name,{sources:[{batchId:b.batchId,sourceId:source.id}]}));
 assert.equal(output.sourceCount,1);
 assert.equal(output.sources[0].abstract,source.abstract);
 assert.equal(output.sources[0].abstractSha256,sha(source.abstract));
 assert.equal(output.scientificApproval,false);
 assert.equal(f.gets,2);
 assert.equal(f.privateCalls,0);
});
test('compact search omits abstract while retained selected and projection reads remain complete',async()=>{
 const f=fixture();
 const compact=value(await f.call('gm_coach_search_training_research',{queries:[{category:'weekly_volume',query:'trained adults'}],maxResultsPerQuery:1,output_view:'compact'}));
 const source=compact.sources[0],retained=f.registry.getBatch(compact.batchId).sources[0];
 assert.equal(compact.batchId.length>0,true);
 assert.equal(Object.hasOwn(source,'abstract'),false);
 assert.equal(source.hasAbstract,true);
 for(const field of ['id','pmid','title','year','publicationDate','journal','publicationTypes','url','matchedCategories','hasAbstract'])assert.deepEqual(source[field],retained[field],field);
 assert.ok(retained.abstract.length>1000);
 const selected=value(await f.call(f.selectedTool.name,{sources:[{batchId:compact.batchId,sourceId:source.id}]}));
 assert.equal(selected.sources[0].abstract,retained.abstract);
 assert.equal(await reconstruct(f,compact.batchId,source.id,'abstract'),retained.abstract);
 assert.equal(f.gets,2);
 const full=value(await f.call('gm_coach_search_training_research',{queries:[{category:'weekly_volume',query:'trained adults'}],maxResultsPerQuery:1}));
 assert.equal(full.sources[0].abstract,retained.abstract);
 assert.ok(Buffer.byteLength(JSON.stringify(compact),'utf8') < Buffer.byteLength(JSON.stringify(full),'utf8') / 3);
 assert.equal(f.privateCalls,0);
});
test('actual MCP wrapper marks invalid/forged/missing/expired read errors isError true without renewal GET or private calls',async()=>{
 const f=fixture(),b=await batch(f);
 for(const args of [{batchId:'unknown',mode:'index'},{batchId:b.batchId,mode:'index',sources:b.sources},{batchId:b.batchId,mode:'abstract',sourceId:'pubmed:999'},{batchId:b.batchId,mode:'abstract',sourceId:b.sources[0].id,offset:-1},{batchId:b.batchId,mode:'abstract',sourceId:b.sources[0].id,offset:1},{batchId:b.batchId,mode:'bibliography',sourceId:b.sources[0].id,maxOutputBytes:12}]){
  const out=await f.call(f.tool.name,args);assert.equal(out.result.isError,true,JSON.stringify(args));assert.throws(()=>value(out),/Research batch read failed:/);assert.ok(out.result.content[0].text.length<120);
 }
 f.expire();const expired=await f.call(f.tool.name,{batchId:b.batchId,mode:'index'});assert.equal(expired.result.isError,true);assert.match(expired.result.content[0].text,/UNKNOWN_OR_EXPIRED_BATCH/);assert.equal(f.gets,2);assert.equal(f.privateCalls,0);assert.equal(f.registry.getBatch(b.batchId),null);
});
test('component rejects accessors sparse/duplicate metadata and malformed Unicode without invoking getters',()=>{
 let invoked=0;const source={id:'pubmed:1',pmid:'1',title:'Canonical',year:null,publicationDate:null,journal:null,publicationTypes:[],url:'https://pubmed.ncbi.nlm.nih.gov/1/',matchedCategories:[],abstract:'A',hasAbstract:true};
 const b={batchId:'owned',expiresAt:200,sources:[source]},read=createResearchBatchProjectionReader({getBatch:()=>b,now:()=>100});
 const args={mode:'index'};Object.defineProperty(args,'batchId',{get(){invoked++;throw Error('PRIVATE');}});assert.equal(read(args).error.code,'INVALID_ARGUMENTS');
 const sparse=[];sparse.length=1;source.publicationTypes=sparse;assert.equal(read({batchId:'owned',mode:'index'}).error.code,'INVALID_CANONICAL_BATCH');
 source.publicationTypes=[];source.title='bad\ud800';assert.equal(read({batchId:'owned',mode:'index'}).error.code,'INVALID_CANONICAL_BATCH');source.title='Canonical';b.sources.push(source);assert.equal(read({batchId:'owned',mode:'index'}).error.code,'INVALID_CANONICAL_BATCH');assert.equal(invoked,0);
});
