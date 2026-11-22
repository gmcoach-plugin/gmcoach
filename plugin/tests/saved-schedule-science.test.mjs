import { runWithRecoveryFixture } from './recovery-fixture.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { createHash } from 'node:crypto';

const source = await readFile(new URL('../mcp_server.mjs', import.meta.url), 'utf8');
const body = source.slice(source.indexOf("    case 'speediance_schedule_saved_program': {"), source.indexOf("    case 'speediance_get_today': {"));
function harness(overrides = {}) {
  const plan = { name: 'Training' }, payload = { name: 'Training', totalCapacity: 1 };
  const approval = { plan: {evidence: [], decisionEvidence: []}, kind: 'saved-schedule', quickTestScheduleRecovery: false, expiresAt: Date.now() + 100000, profile: 'p', scheduleCode: 'code', scheduleDate: '2030-01-01', scheduleBaseDigest: 'base', profileFingerprint: 'account', intakeFingerprint: 'intake', digest: 'plan', payload, displayUnit: undefined, staticLoadContext: { contextDigest: 'context' }, schedulePlanArgs: plan, scheduleCalendarDigest: createHash('sha256').update('{}').digest('hex') };
  let sends = 0;
  const context = { existingTemplatePreview: Symbol("internal-existing-template"), Date, Set, createHash, validateTrainingResearchSources: x => x, validateEvidenceExcerptAnchors: () => {}, writeApprovals: new Map([['preview', approval]]), resolveProfile: async () => 'p', readProfileConfig: async () => ({ config: { deviceType: 1 }, password: 'secret' }), getSavedCustomTemplates: async () => [{ code: 'code', name: 'Training' }], sameTemplateName: (a, b) => a.name === b, getTemplateCode: x => x.code, normalizeScheduleDate: x => x, withProfileMutationLock: async (_, fn) => fn(), profileConfigFingerprint: () => 'account', getSavedTemplateByCode: async () => ({ code: 'code', name: 'Training' }), savedTemplateDigest: () => 'base', readTrainingProfileRecord: async () => ({}), currentExerciseCatalog: async () => ({}), resolveImportedRmPolicy: () => null, normalizePlan: () => plan, validatePlanForProfile: async () => ({ plan, intakeFingerprint: 'intake' }), prepareProgramPayload: async () => ({ payload, displayUnit: undefined, staticLoadContext: { contextDigest: 'context' } }), planDigest: () => 'plan', verifyCreatedTemplateReadback: () => ({ safeToReportSuccess: true }), speedianceApiRequest: async () => ({ data: {} }), scheduleTemplate: async () => { sends++; return { scheduled: true }; }, ...overrides };
  const run = runWithRecoveryFixture(`(async args => { switch ('speediance_schedule_saved_program') { ${body} } })`, context);
  return { run, context, sends: () => sends };
}
const args = { program_name: 'Training', program_code: 'code', date: '2030-01-01', confirm: true, schedule_preview_id: 'preview' };
test('saved calendar add requires science approval and removal stays independent', async () => {
  const h = harness();
  await assert.rejects(h.run({ ...args, schedule_preview_id: undefined }), /podgląd|schedule_preview_id/);
  assert.equal(h.sends(), 0);
  assert.equal((await h.run({ ...args, add: false })).scheduled, true);
});
test('saved calendar execution revalidates plan and consumes exact approval', async () => {
  const h = harness();
  assert.equal((await h.run(args)).scientificReviewRevalidated, true);
  assert.equal(h.sends(), 1);
  await assert.rejects(h.run(args), /schedule_preview_id/);
  assert.equal(h.sends(), 1);
});
test('changed calendar or failed renewed research prevents reservation', async () => {
  const calendar = harness({ speedianceApiRequest: async () => ({ data: { changed: true } }) });
  await assert.rejects(calendar.run(args), /Kalendarz/);
  assert.equal(calendar.sends(), 0);
  const research = harness({ validatePlanForProfile: async () => { throw new Error('expired research'); } });
  await assert.rejects(research.run(args), /expired research/);
  assert.equal(research.sends(), 0);
});

const previewBody = source.slice(source.indexOf("    case 'speediance_preview_saved_program_schedule': {"), source.indexOf("    case 'speediance_schedule_saved_program': {"));
function previewHarness(overrides = {}) {
  const h = harness();
  h.context.writeApprovals.get('preview').payload = { name: 'Training', totalCapacity: 1 };
  Object.assign(h.context, { dispatch: async () => ({ previewId: 'preview' }), inspectTemplateReservationReadback: () => ({ verified: false, status: 'reservation_missing' }), classifyCalendarTemplateEntry: x => x, speedianceApiRequest: async () => ({ data: [{ date: '2030-01-01', trainingPlanList: [] }] }), ...overrides });
  const run = runWithRecoveryFixture(`(async args => { switch ('speediance_preview_saved_program_schedule') { ${previewBody} } })`, h.context);
  return { ...h, run };
}
const previewArgs = { name: 'Training', program_code: 'code', base_digest: 'a'.repeat(64), date: '2030-01-01' };
test('saved schedule preview rejects missing approval, stale GET and changed prescription', async () => {
  const missing = previewHarness({ dispatch: async () => ({ previewId: 'missing' }) });
  await assert.rejects(missing.run(previewArgs), /wygasł|istnieje/);
  const stale = previewHarness();
  await assert.rejects(stale.run(previewArgs), /Szablon/);
  const mismatch = previewHarness({ savedTemplateDigest: () => 'a'.repeat(64), verifyCreatedTemplateReadback: () => ({ safeToReportSuccess: false }) });
  await assert.rejects(mismatch.run(previewArgs), /identyczny/);
});
test('saved schedule preview checks expiry after awaited calendar and rejects foreign/incomplete calendars', async () => {
  const expired = previewHarness({ savedTemplateDigest: () => 'a'.repeat(64) });
  expired.context.speedianceApiRequest = async () => { expired.context.writeApprovals.get('preview').expiresAt = 0; return { data: [{ date: '2030-01-01', trainingPlanList: [] }] }; };
  await assert.rejects(expired.run(previewArgs), /wygasł/);
  const incomplete = previewHarness({ savedTemplateDigest: () => 'a'.repeat(64), inspectTemplateReservationReadback: () => ({ verified: false, status: 'incomplete_month', reason: 'partial' }) });
  await assert.rejects(incomplete.run(previewArgs), /Niepełny/);
  const foreign = previewHarness({ savedTemplateDigest: () => 'a'.repeat(64), speedianceApiRequest: async () => ({ data: [{ date: '2030-01-01', trainingPlanList: [{ kind: 'official-or-suggested', code: null }] }] }) });
  await assert.rejects(foreign.run(previewArgs), /inny/);
});
test('saved schedule preview exposes target action and keeps original public input', async () => {
  const h = previewHarness({ savedTemplateDigest: () => 'a'.repeat(64) });
  const result = await h.run(previewArgs);
  assert.equal(result.calendarTarget.action, 'add');
  assert.equal(h.context.writeApprovals.get('preview').kind, 'saved-schedule');
  assert.equal(h.context.writeApprovals.get('preview').schedulePlanArgs.name, 'Training');
});
test('saved schedule approval page shows existing code/date and no creation promise', () => {
  const pageSource = source.slice(source.indexOf('function approvalPage('), source.indexOf('async function handleApprovalRequest('));
  const page = runWithRecoveryFixture(`${pageSource}; approvalPage`, { escapeHtml: x => String(x ?? ''), setupPage: (title, note, form) => form, RESISTANCE_MODES: {}, normalizeExcerptForMatch: x => x });
  const html = page({ kind: 'saved-schedule', profile: 'p', scheduleCode: 'code', scheduleDate: '2030-01-01', payload: { name: 'Training' }, preview: {}, plan: { exercises: [], evidence: [], decisionEvidence: [], rationale: 'review', warmup: { status: 'omitted', omissionReason: 'user' }, postWorkoutStretching: { status: 'omitted', omissionReason: 'user' } } });
  assert.match(html, /code/);
  assert.match(html, /2030-01-01/);
  assert.match(html, /Nie powstanie nowy szablon/);
  assert.doesNotMatch(html, /GM Coach zapisze program/);
});

test('template changed during awaited scientific/calendar checks cannot be scheduled', async () => {
  let reads = 0;
  const h = harness({
    getSavedTemplateByCode: async () => ({code: 'code', name: 'Training', digest: ++reads === 1 ? 'base' : 'changed'}),
    savedTemplateDigest: template => template.digest
  });
  await assert.rejects(h.run(args), /Zapisany trening zmienił się od podglądu|Trening zmienił się podczas/);
  assert.equal(reads, 2);
  assert.equal(h.sends(), 0);
  assert.equal(h.context.writeApprovals.has('preview'), true);
});


// Targeted actual verifier/callsite boundary; surrounding science services use existing harness.
// Full public imported scientific qualification remains the separate192-case lifecycle matrix.
for(const phase of ['preview','commit'])for(const sample of [
 {name:'known-reference-kg',contextUnit:'kg',displayUnit:undefined,allowed:true},
 {name:'known-reference-lb',contextUnit:'lb',displayUnit:undefined,allowed:true},
 {name:'unknown-reference-does-not-use-known-display',contextUnit:'unknown',displayUnit:'kg',allowed:false},
 {name:'missing-both',contextUnit:undefined,displayUnit:undefined,allowed:false},
 {name:'missing-reference-known-display',contextUnit:undefined,displayUnit:'lb',allowed:true}
])test(`actual saved schedule ${phase} verifier unit context ${sample.name}`,async()=>{
 const {verifyCreatedTemplateReadback:actualVerifier}=await import('../saved-templates.mjs');
 const action={groupId:1,actionLibraryId:102,templatePresetId:1,setsAndReps:'8',completionMethod:'1',countType:'1',selectCompletionMethod:'1',sportMode:'1',breakTime:'90',breakTime2:'90',leftRight:'0',level:'0',weights:'3.5',counterweight:'11',counterweight2:'11',capacity:193.6};
 const expected={name:'Training',deviceType:1,bgColor:0,totalCapacity:193.6,actionLibraryList:[action]},current={...structuredClone(expected),id:1001,code:'code'};
 const staticLoadContext={contextDigest:'context',staticLoadProtocol:'account-unit-verbatim',...(sample.contextUnit===undefined?{}:{accountUnit:sample.contextUnit})};
 let checked=0;
 const verification=input=>{checked++;assert.equal(input.accountUnit,sample.contextUnit??sample.displayUnit);return actualVerifier(input);};
 const overrides={getSavedTemplateByCode:async()=>structuredClone(current),verifyCreatedTemplateReadback:verification,
  savedTemplateDigest:()=>phase==='preview'?'a'.repeat(64):'base',prepareProgramPayload:async()=>({payload:expected,displayUnit:sample.displayUnit,staticLoadContext}),
  inspectTemplateReservationReadback:()=>({verified:false,status:'reservation_missing'})};
 const h=phase==='preview'?previewHarness(overrides):harness(overrides);
 const approval=h.context.writeApprovals.get('preview');Object.assign(approval,{payload:expected,displayUnit:sample.displayUnit,staticLoadContext});
 if(sample.allowed){await h.run(phase==='preview'?previewArgs:args);assert.equal(checked,1);assert.equal(h.sends(),phase==='commit'?1:0);}
 else{await assert.rejects(h.run(phase==='preview'?previewArgs:args),phase==='preview'?/identyczny/:/odpowiada/);assert.equal(checked,1);assert.equal(h.sends(),0);}
});
