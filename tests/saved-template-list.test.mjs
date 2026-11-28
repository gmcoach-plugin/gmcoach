import {installSavedHeaderFixture} from './saved-header-fixture.mjs';
function savedHeaderVm(code,context={},options){return vm.runInNewContext(code,installSavedHeaderFixture(context),options);}
function savedHeaderContext(context={}){return vm.createContext(installSavedHeaderFixture(context));}
import test from 'node:test';
import assert from 'node:assert/strict';
import { getSavedCustomTemplates, getSavedCustomTemplatesForRead, getVerifiedSavedCustomTemplates } from '../plugin/saved-template-list.mjs';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { getSavedTemplateId } from '../plugin/saved-templates.mjs';

const rows = [{ code: 'one', name: 'A' }, { code: 'two', name: 'B' }];

test('root total=0 is reconciled only by matching bounded first page and empty second page', async () => {
  const calls = [];
  const api = async (_profile, path) => {
    calls.push(path);
    return { data: path.includes('pageNo=2') ? [] : structuredClone(rows), total: path.includes('pageSize=50') ? rows.length : 0 };
  };
  const result = await getVerifiedSavedCustomTemplates('synthetic', 1, api);
  assert.equal(result.completeness.status, 'complete');
  assert.equal(result.completeness.verification, 'bounded-pages-until-empty');
  assert.deepEqual(result.templates, rows);
  assert.equal(calls.length, 3);
  assert.deepEqual(await getSavedCustomTemplates('synthetic', 1, api), rows);
  const repeated = await getVerifiedSavedCustomTemplates('synthetic', 1, async () => ({ data: rows, total: 0 }));
  assert.equal(repeated.completeness.status, 'partial');
  const mismatched = await getVerifiedSavedCustomTemplates('synthetic', 1, async (_profile, path) => ({ data: path.includes('pageNo=2') ? [] : rows, total: path.includes('pageSize=50') ? rows.length + 1 : 0 }));
  assert.equal(mismatched.completeness.status, 'partial');
});

test('root total=0 with 51 templates: pages are read until an empty page (unbounded list truncated at 50)', async () => {
  const all = Array.from({ length: 51 }, (_, i) => ({ code: 'c' + i, name: 'T' + i }));
  const api = async (_profile, path) => {
    if (path.includes('pageSize=-1')) return { data: all.slice(0, 50), total: 0 };
    const page = Number(/pageNo=(\d+)/.exec(path)[1]);
    return { data: all.slice((page - 1) * 50, page * 50), total: 0 };
  };
  const result = await getVerifiedSavedCustomTemplates('synthetic', 1, api);
  assert.equal(result.completeness.status, 'complete');
  assert.equal(result.templates.length, 51);
  assert.equal(result.completeness.verifiedPages, 3);
  const noEmpty = await getVerifiedSavedCustomTemplates('synthetic', 1, async (_p, path) => ({ data: path.includes('pageSize=-1') ? all.slice(0, 50) : all.slice(0, 50), total: 0 }));
  assert.equal(noEmpty.completeness.status, 'partial');
  const missing = await getVerifiedSavedCustomTemplates('synthetic', 1, async (_p, path) => path.includes('pageSize=-1') ? { data: [...all.slice(0, 50), { code: 'ghost' }], total: 0 } : { data: path.includes('pageNo=1') ? all.slice(0, 50) : [], total: 0 });
  assert.equal(missing.completeness.status, 'partial');
});

test('actual saved detail path reads a found template from partial list while mutation stays strict', async () => {
  const source = readFileSync(new URL('../plugin/mcp_server.mjs', import.meta.url), 'utf8');
  const start = source.indexOf('async function getSavedTemplateByCode(');
  const end = source.indexOf('\nasync function getAccountWeightUnit(', start);
  const template = { id: 1, code: 'one', name: 'A', actionLibraryList: [] };
  const envelope = { data: [template], total: 0 };
  const calls = [];
  const api = async (_, path) => { calls.push(path); return envelope; };
  const run = savedHeaderVm(`${source.slice(start,end)}; getSavedTemplateByCode`, {
    readSavedCustomTemplatesForRead: getSavedCustomTemplatesForRead,
    getSavedCustomTemplates: (profile,type) => getSavedCustomTemplates(profile,type,api),
    speedianceApiRequest: api, getTemplateCode: value => value.code,
    readProfileConfig: async () => ({config:{}}), findTemplateDetailRecord: value => value,
    extractActionLibraryList: value => value.actionLibraryList,
    getSavedTemplateId: value => value.id, createSavedTemplateSnapshot: () => ({})
  });
  const diagnostics = {};
  const result = await run('synthetic',1,'one',{readOnly:true,diagnostics});
  assert.equal(result.code,'one'); assert.equal(diagnostics.status,'partial');
  assert.equal(diagnostics.issues[0].code,'total_below_rows');
  // 1.0.656: a code absent from a partial/capped list is read exactly through detailByCode; a detail for another code is rejected.
  await assert.rejects(run('synthetic',1,'missing',{readOnly:true,diagnostics:{}}));
  assert.ok(calls.some(path=>path.includes('detailByCode?code=missing')));
  // Strict callers fall back to the exact detail read too; this synthetic detail endpoint echoes the list envelope, so its identity check must block.
  await assert.rejects(run('synthetic',1,'one'),/sprzeczne identyfikatory|nie zgadza/);
});

test('actual saved list branch discloses partial counts and never reports actual occupied slots', async () => {
  const source = readFileSync(new URL('../plugin/mcp_server.mjs', import.meta.url), 'utf8');
  const start=source.indexOf("    case 'speediance_list_saved_programs': {");
  const end=source.indexOf("    case 'speediance_get_saved_program': {",start);
  const run=savedHeaderVm(`(async args=>{switch('speediance_list_saved_programs'){${source.slice(start,end)}}})`,{
    resolveProfile: async()=> 'synthetic', readProfileConfig: async()=>({config:{deviceType:1}}),
    getVerifiedSavedCustomTemplates,
    speedianceApiRequest:async()=>({data:rows,total:0}), readProgramCoachNotes:async()=>({programs:{}}),
    markReadOnlyProgramResult:value=>value, templateSummary:value=>value, getTemplateCode:value=>value?.code ?? value?.templateCode,
    reconciledProgramCoachNotes:()=>({}),savedIdentityAccountFingerprint:()=> 'synthetic',resolveStaticProtocolReadContext:()=>({}),
    summarizeTemplateDemand:()=>{throw new Error('Partial list must not enter capacity inference');}
  });
  const result=await run({});
  assert.equal(result.programs.length,2); assert.equal(result.listCompleteness.status,'partial');
  assert.equal(result.templateSlots.used,null); assert.equal(result.templateSlots.observedCount,2);
  assert.equal(result.canUseListForMutation,false);
});
test('read-only listing preserves observed templates with count diagnostics while mutation reader rejects', async () => {
  for (const [total, code] of [[1, 'total_below_rows'], [3, 'total_exceeds_rows']]) {
    const envelope = { data: rows.map(row => ({ ...row, name: 'private-template' })), total, errorDetail: 'private-token' };
    const result = await getSavedCustomTemplatesForRead('profile', 1, async () => envelope);
    assert.deepEqual(result.templates, envelope.data);
    assert.equal(result.usableForMutation, false);
    assert.deepEqual(result.completeness, { status: 'partial', issues: [{ code, declaredCount: total, returnedCount: 2 }] });
    assert.equal(JSON.stringify(result.completeness).includes('private'), false);
    await assert.rejects(getSavedCustomTemplates('profile', 1, async () => envelope));
  }
});
test('read-only listing marks explicit pagination incomplete without allowing mutations', async () => {
  for (const meta of [{ hasMore: true }, { totalPages: 2 }, { pagination: { totalCount: 3 }, total: 2 }]) {
    const result = await getSavedCustomTemplatesForRead('profile', 1, async () => ({ data: rows, ...meta }));
    assert.equal(result.completeness.status, 'partial'); assert.equal(result.usableForMutation, false);
    assert.deepEqual(result.templates, rows);
    await assert.rejects(getSavedCustomTemplates('profile', 1, async () => ({ data: rows, ...meta })));
  }
});
test('read-only extraction still rejects malformed metadata and competing template arrays', async () => {
  for (const envelope of [{ data: rows, total: 'unknown' }, { data: rows, hasMore: 1 }, { data: rows, list: [{ code: 'different' }] }]) await assert.rejects(getSavedCustomTemplatesForRead('profile', 1, async () => envelope));
  const result = await getSavedCustomTemplatesForRead('profile', 1, async () => ({ data: rows, total: 2, hasMore: false }));
  assert.deepEqual(result.completeness, { status: 'complete', issues: [] });
  assert.equal(result.usableForMutation, false);
});

test('actual deletion reports cleanup failure separately from verified remote absence', async () => {
  const source = readFileSync(new URL('../plugin/mcp_server.mjs', import.meta.url), 'utf8');
  const start = source.indexOf("    case 'speediance_delete_saved_program': {");
  const end = source.indexOf("    case 'speediance_preview_saved_program_schedule':", start);
  assert.ok(start >= 0 && end > start);
  const branch = source.slice(start, end).replace("    case 'speediance_delete_saved_program':", '');
  let deletes = 0;
  const run = savedHeaderVm(`(async function(){${branch}})`, {
    args: { confirm: true, base_digest: 'a'.repeat(64), program_name: 'A', program_code: 'one' },
    resolveProfile: async () => 'synthetic', withProfileMutationLock: async (_, fn) => fn(),
    readProfileConfig: async () => ({ config: { deviceType: 1 } }), assertWritableDeviceType: () => {},
    getSavedTemplateByCode: async () => rows[0], savedTemplateDigest: () => 'a'.repeat(64),
    getSavedTemplateId: () => 1, getTemplateCode: row => row.code,
    speedianceApiRequest: async () => { deletes++; return { code: 0 }; },
    getVerifiedSavedCustomTemplates: async () => ({ templates: [], completeness: { status: 'complete', issues: [] } }),
    deleteProgramCoachNote: async () => { throw new Error('synthetic cleanup failure'); }
  });
  const result = await run();
  assert.equal(deletes, 1);
  assert.equal(result.deleted, true);
  assert.equal(result.verified, true);
  assert.equal(result.coachNotesRemoved, false);
  assert.match(result.note, /Nie potwierdzono usunięcia lokalnych notatek/);
  assert.doesNotMatch(result.note, /GM Coach usunął/);
});

test('keeps the public reference client request path and accepts bare arrays or ordinary envelopes', async () => {
  const calls = [];
  const bare = await getSavedCustomTemplates('profile', 1, async (...args) => { calls.push(args); return rows; });
  const wrapped = await getSavedCustomTemplates('profile', 1, async (...args) => { calls.push(args); return { code: 0, hasNext: false, total: rows.length, data: rows }; });
  assert.deepEqual(bare, rows);
  assert.deepEqual(wrapped, rows);
  assert.deepEqual(calls.map(([profile, path]) => [profile, path]), [
    ['profile', '/app/v4/customTrainingTemplate/appPage?pageNo=1&pageSize=-1&deviceTypes=1'],
    ['profile', '/app/v4/customTrainingTemplate/appPage?pageNo=1&pageSize=-1&deviceTypes=1']
  ]);
});

test('rejects explicit partial metadata at the API envelope and inside response.data', async () => {
  await assert.rejects(getSavedCustomTemplates('profile', 1, async () => ({ code: 0, hasNext: true, data: rows })), /oznaczyło listę.*niekompletną/);
  await assert.rejects(getSavedCustomTemplates('profile', 1, async () => ({ code: 0, data: { list: rows, pagination: { hasNextPage: true } } })), /oznaczyło listę.*niekompletną/);
  await assert.rejects(getSavedCustomTemplates('profile', 1, async () => ({ data: rows, paginationExhaustive: false })), /oznaczyło listę.*niekompletną/);
});

test('rejects declared totals that prove the returned list is partial or inconsistent', async () => {
  await assert.rejects(getSavedCustomTemplates('profile', 1, async () => ({ data: rows, total: 3 })), /więcej szablonów niż zwrócona lista/);
  await assert.rejects(getSavedCustomTemplates('profile', 1, async () => ({ data: rows, total: 1 })), /nie zgadzają się z listą/);
});
test('count mismatch exposes only validated counts, not template data, and remains blocked', async () => {
  for (const total of [1, 3]) {
    const privateRows = rows.map(row => ({ ...row, name: 'private-template', accessToken: 'private-token' }));
    await assert.rejects(getSavedCustomTemplates('profile', 1, async () => ({ data: privateRows, total })), error => {
      assert.match(error.message, new RegExp(`Zgłoszona liczba: ${total}; zwrócone pozycje: ${rows.length}`));
      assert.equal(error.message.includes('private-template'), false);
      assert.equal(error.message.includes('private-token'), false);
      return true;
    });
  }
});

test('accepts repeated identical arrays but rejects competing array aliases', async () => {
  const identical = await getSavedCustomTemplates('profile', 1, async () => ({ data: { list: rows, records: structuredClone(rows) } }));
  assert.deepEqual(identical, rows);
  await assert.rejects(getSavedCustomTemplates('profile', 1, async () => ({ data: { list: rows, records: [rows[0]] } })), /sprzeczne tablice/);
  await assert.rejects(getSavedCustomTemplates('profile', 1, async () => ({ data: { list: [], records: rows } })), /sprzeczne tablice/);
});

test('recognizes camel-case template aliases and does not treat application code as pagination metadata', async () => {
  const fromTemplateList = await getSavedCustomTemplates('profile', 1, async () => ({ data: { templateList: rows } }));
  const fromCustomTemplateList = await getSavedCustomTemplates('profile', 1, async () => ({ data: { customTrainingTemplateList: rows } }));
  const result = await getSavedCustomTemplates('profile', 1, async () => ({ code: 0, data: rows }));
  assert.deepEqual(fromTemplateList, rows);
  assert.deepEqual(fromCustomTemplateList, rows);
  assert.deepEqual(result, rows);
});

test('rejects explicit multiple pages while preserving complete one-page and bare contracts', async () => {
  for (const response of [{ data: rows, pageCount: 2 }, { data: rows, pageInfo: { totalPages: '2' } }, { data: { list: rows, pagination: { totalPage: 2 } } }]) {
    await assert.rejects(getSavedCustomTemplates('profile', 1, async () => response), /wiele stron.*niekompletny/);
  }
  assert.deepEqual(await getSavedCustomTemplates('profile', 1, async () => ({ data: rows, pageCount: 1 })), rows);
  assert.deepEqual(await getSavedCustomTemplates('profile', 1, async () => ({ data: [], pageCount: 0 })), []);
  await assert.rejects(getSavedCustomTemplates('profile', 1, async () => ({ data: rows, pageCount: 0 })), /zerowej liczby stron/);
  await assert.rejects(getSavedCustomTemplates('profile', 1, async () => ({ data: rows, pageCount: 1, pageInfo: { totalPages: 2 } })), /liczby stron.*sprzeczne/);
  for (const pageCount of [true, {}, -1, 1.5]) await assert.rejects(getSavedCustomTemplates('profile', 1, async () => ({ data: rows, pageCount })), /nieznany format/);
});

test('actual single and cycle slot preflights stop before mutation for multi-page template evidence', async () => {
  const source = readFileSync(new URL('../plugin/mcp_server.mjs', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  const singleStart = source.indexOf('        const templatesBefore = quickTestFastPath || directCodeRequired ? null : await getSavedCustomTemplates(');
  const singleEnd = source.indexOf('        const paths = profilePaths(profile);', singleStart);
  const cycleStart = source.indexOf('            const templates = await getSavedCustomTemplates(', source.indexOf('const checkCalendar = async record =>'));
  const cycleEnd = source.indexOf('            const months = new Map();', cycleStart);
  assert.ok(singleStart >= 0 && singleEnd > singleStart && cycleStart >= 0 && cycleEnd > cycleStart);
  let mutations = 0;
  for (const fragment of [source.slice(singleStart, singleEnd), source.slice(cycleStart, cycleEnd)]) {
    const preflight = savedHeaderVm(`(async function(){${fragment}; await mutate();})`, {
      profile: 'synthetic', profileConfig: { deviceType: 1 }, config: { deviceType: 1 }, quickTestFastPath: false, directCodeRequired: false, plan: {},
      record: { sessions: { one: { state: 'new' } } },
      getSavedCustomTemplates: (profile, type) => getSavedCustomTemplates(profile, type, async () => ({ data: rows, pageInfo: { totalPages: 2 } })),
      getTemplateCode: row => row.code, assertTemplateSlotAvailable: () => {}, summarizeTemplateCapacity: () => ({ left: 48 }),
      mutate: async () => { mutations++; }
    });
    await assert.rejects(preflight(), /wiele stron.*niekompletny/);
  }
  assert.equal(mutations, 0);
});

test('rejects contradictory pagination flags and nested totals', async () => {
  await assert.rejects(getSavedCustomTemplates('profile', 1, async () => ({
    data: { list: rows, hasMore: false, pagination: { hasNext: true } }
  })), /Metadane stronicowania.*sprzeczne/);
  await assert.rejects(getSavedCustomTemplates('profile', 1, async () => ({
    data: { list: rows, total: 2, pagination: { totalCount: 3 } }
  })), /Metadane liczby szablonów.*sprzeczne/);
});

test('invalid rows and conflicting code aliases fail both readers; duplicate/missing identities remain partial only for reads', async () => {
  for (const row of [null, 7, [], {code:'A',templateCode:'B'}, {code:'bad code'}]) {
    for (const reader of [getSavedCustomTemplates,getSavedCustomTemplatesForRead]) await assert.rejects(reader('synthetic',1,async()=>({data:[row],total:1})));
  }
  for (const [data,issue] of [[[{code:'A'},{templateCode:'A'}],'duplicate_template_code'],[[{id:1}],'missing_template_code']]) {
    const result=await getSavedCustomTemplatesForRead('synthetic',1,async()=>({data,total:data.length}));
    assert.equal(result.completeness.status,'partial'); assert.equal(result.completeness.issues[0].code,issue);
    await assert.rejects(getSavedCustomTemplates('synthetic',1,async()=>({data,total:data.length})));
  }
});

test('actual detail boundary rejects mismatched, ambiguous and identity-less remote details', async () => {
  const source=readFileSync(new URL('../plugin/mcp_server.mjs',import.meta.url),'utf8');
  const start=source.indexOf('async function getSavedTemplateByCode('), end=source.indexOf('\nasync function getAccountWeightUnit(',start);
  const listed={id:1,code:'A',name:'A'};
  for (const detail of [{id:2,code:'B',actionLibraryList:[]},{actionLibraryList:[]},{code:'A',templateCode:'B',actionLibraryList:[]},{id:1,templateId:2,code:'A',actionLibraryList:[]},[{id:1,code:'A',actionLibraryList:[]},{id:1,code:'A',actionLibraryList:[]}]]) {
    const run=savedHeaderVm(`${source.slice(start,end)};getSavedTemplateByCode`,{
      getSavedCustomTemplates:async()=>[listed],readProfileConfig:async()=>({config:{}}),
      speedianceApiRequest:async()=>({data:detail}),getTemplateCode:v=>v?.code??v?.templateCode,
      getSavedTemplateId:v=>{for(const key of ['id','templateId','customTrainingTemplateId']) if(v[key]!=null) return Number(v[key]);return null;},
      createSavedTemplateSnapshot:()=>{throw new Error('Invalid identity reached snapshot');}
    });
    await assert.rejects(run('synthetic',1,'A'),/tożsamości|sprzeczne identyfikatory/);
  }
  for(const detail of [{id:'1',actionLibraryList:[]},{code:'A',id:1,actionLibraryList:[]}]) {
    const run=savedHeaderVm(`${source.slice(start,end)};getSavedTemplateByCode`,{
      getSavedCustomTemplates:async()=>[listed],readProfileConfig:async()=>({config:{}}),speedianceApiRequest:async()=>({data:detail}),
      getTemplateCode:v=>v?.code,getSavedTemplateId:v=>v.id==null?null:Number(v.id),createSavedTemplateSnapshot:()=>({})
    });
    assert.equal((await run('synthetic',1,'A')).code,'A');
  }
});

test('actual list dispatch includes templateCode alias and binds coach notes to that alias', async()=>{
  const source=readFileSync(new URL('../plugin/mcp_server.mjs',import.meta.url),'utf8');
  const start=source.indexOf("    case 'speediance_list_saved_programs': {"),end=source.indexOf("    case 'speediance_get_saved_program': {",start);
  const run=savedHeaderVm(`(async args=>{switch('speediance_list_saved_programs'){${source.slice(start,end)}}})`,{
    resolveProfile:async()=> 'synthetic',readProfileConfig:async()=>({config:{deviceType:1}}),
    getVerifiedSavedCustomTemplates,speedianceApiRequest:async()=>({data:[{templateCode:'alias',name:'A'}]}),
    readProgramCoachNotes:async()=>({programs:{alias:{marker:true}}}),getTemplateCode:v=>v?.code??v?.templateCode,
    templateSummary:v=>({code:v.templateCode}),reconciledProgramCoachNotes:note=>({matched:note?.marker===true}),
    markReadOnlyProgramResult:v=>v,savedIdentityAccountFingerprint:()=> 'synthetic',resolveStaticProtocolReadContext:()=>({}),summarizeTemplateDemand:()=>({used:1})
  });
  const result=await run({}); assert.equal(result.programs[0].code,'alias'); assert.equal(result.programs[0].matched,true);
  assert.equal(result.programs[0].listActionStatus,'absent');
  assert.equal(result.programs[0].listActionCount,null);
});

test('actual detail guard validates known wrappers and siblings using real saved ID parsing', async()=>{
  const source=readFileSync(new URL('../plugin/mcp_server.mjs',import.meta.url),'utf8');
  const start=source.indexOf('async function getSavedTemplateByCode('),end=source.indexOf('\nasync function getAccountWeightUnit(',start);
  const listed={id:1,code:'A',name:'A'};
  const valid={id:1,code:'A',actionLibraryList:[]};
  const make=detail=>savedHeaderVm(`${source.slice(start,end)};getSavedTemplateByCode`,{
    getSavedCustomTemplates:async()=>[listed],readProfileConfig:async()=>({config:{}}),speedianceApiRequest:async()=>({code:0,data:detail}),
    getTemplateCode:v=>v?.code??v?.templateCode,getSavedTemplateId,createSavedTemplateSnapshot:()=>({})
  });
  for(const detail of [
    {code:'B',data:valid},{id:2,detail:valid},
    {...valid,detail:{code:'B'}},{...valid,result:{templateId:2}},
    {id:'invalid',detail:valid},{id:0,detail:valid},
    {id:1,templateId:2,detail:valid},{id:1,customTrainingTemplateId:'invalid',detail:valid},
    {data:valid,result:{code:'B'}}
  ]) await assert.rejects(make(detail)('synthetic',1,'A'),/sprzeczne identyfikatory/);
  const detail={id:'1',templateId:1,customTrainingTemplateId:'1',code:'A',detail:{...valid,templateId:'1',actionLibraryList:[{id:999,code:'exercise-code'}]}};
  const result=await make(detail)('synthetic',1,'A');
  assert.equal(result.id,1); assert.equal(result.actionLibraryList[0].id,999);
});
