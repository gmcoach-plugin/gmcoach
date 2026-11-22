import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as override from '../user-override.mjs';
import { normalizeCycleEvidenceCoverage } from '../training-evidence.mjs';

const source = readFileSync(new URL('../mcp_server.mjs', import.meta.url), 'utf8');
const slice = (from, to) => { const start = source.indexOf(from), end = source.indexOf(to, start); assert.ok(start >= 0 && end > start, from); return source.slice(start, end); };
const interviewGuard = new Function('overrideAuthorizes', 'recordOverride', slice('function assertTrainingInterviewComplete(audit) {', '\nfunction validateTrainingResearchSources(') + '\nreturn assertTrainingInterviewComplete;')(override.overrideAuthorizes, override.recordOverride);
const wrapperSource = slice('const USER_OVERRIDE_SCIENCE_TOOLS', 'async function dispatch(name, args = {})');

// The fake core mimics plan preview: an interview guard, a science gate and a Speediance API rejection.
function build(core) {
  const names = ['USER_OVERRIDE_TOOLS', 'parseUserOverride', 'userOverrideContext', 'overrideAuthorizes', 'recordOverride', 'classifyGuardError', 'describeGuard', 'guardErrorPayload', 'annotateOverriddenResult', 'dispatch'];
  return new Function(...names, wrapperSource + '\nreturn dispatchWithUserOverride;')(...names.slice(0, -1).map(name => override[name]), core);
}
const incompleteAudit = { canCreatePlan: false, missingSections: [{ label: 'Cel', missingFields: ['goal'] }] };
const preview = build(async (name, args) => {
  if (args.apiFail) throw new Error('API Speediance odrzuciło żądanie (kod 1001).');
  interviewGuard(incompleteAudit);
  if (args.needsScience && args.scienceGate !== 'user_declined') throw new Error('Plan wymaga evidence i decisionEvidence z badań.');
  return { previewId: 'preview-1', researchReviewStatus: args.scienceGate === 'user_declined' ? 'not_reviewed_user_requested' : 'research_gate_completed', scientificApproval: true };
});
const userOverride = codes => ({ authorized: true, reason: 'Wiem, że audyt jest niepełny, rób plan.', codes });


test('public error wrapper retains actual missing cycle categories without authorizing writes', async () => {
  const categories = ['weekly_volume', 'frequency', 'progression_rotation', 'recovery_deload'];
  const values = Object.fromEntries(categories.map(category => [category, 'cyclePrescription=' + 'a'.repeat(64) + ';category=' + category]));
  const core = build(async () => normalizeCycleEvidenceCoverage([], [], values));
  await assert.rejects(core('speediance_preview_training_cycle', {}), error => {
    assert.equal(error.guardCode, 'science_gate');
    const payload = JSON.parse(error.message.slice(error.message.lastIndexOf('\n') + 1));
    assert.deepEqual(payload.scienceDiagnostics.missingCategories, categories);
    assert.equal(payload.scienceDiagnostics.scope, 'cycle');
    assert.equal(payload.scienceDiagnostics.authorizesMutation, false);
    assert.equal(payload.scienceDiagnostics.repair.neverInventEvidence, true);
    return true;
  });
});

test('blocked preview returns guard code and Polish override hint', async () => {
  await assert.rejects(preview('speediance_preview_program', {}), error => {
    assert.equal(error.guardCode, 'interview_incomplete');
    assert.match(error.message, /Możesz to pominąć: powiedz, że świadomie ignorujesz tę blokadę \(kod interview_incomplete\)\./);
    assert.match(error.message, /"overridable":true/);
    return true;
  });
});

test('userOverride for that code continues and records overriddenGuards', async () => {
  const result = await preview('speediance_preview_program', { userOverride: userOverride(['interview_incomplete']) });
  assert.equal(result.previewId, 'preview-1');
  assert.deepEqual(result.overriddenGuards.map(row => row.code), ['interview_incomplete']);
  assert.equal(result.overriddenGuards[0].reason, 'Wiem, że audyt jest niepełny, rób plan.');
  assert.equal(result.userOverridden, true);
  assert.equal(result.scientificApproval, false);
});

test('an override for a different code still blocks and says so', async () => {
  await assert.rejects(preview('speediance_preview_program', { userOverride: userOverride(['time_budget']) }), /kod interview_incomplete\)\. Podany userOverride nie obejmuje tego kodu/);
});

test('"*" overrides every overridable guard, including the science gate', async () => {
  const result = await preview('speediance_preview_program', { needsScience: true, userOverride: userOverride(['*']) });
  assert.deepEqual(result.overriddenGuards.map(row => row.code).sort(), ['interview_incomplete', 'science_gate']);
  assert.equal(result.researchReviewStatus, 'not_reviewed_user_requested');
  assert.equal(result.scientificApproval, false);
});

test('Speediance API rejection cannot be overridden and explains what to do', async () => {
  await assert.rejects(preview('speediance_preview_program', { apiFail: true, userOverride: userOverride(['*']) }), error => {
    assert.equal(error.guardCode, 'speediance_api_rejected');
    assert.match(error.message, /nie do pominięcia\)\. Co możesz zrobić: To odpowiedź serwera Speediance/);
    assert.match(error.message, /"overridable":false/);
    return true;
  });
});

test('pending write override requires explicit confirmation text even with "*"', async () => {
  const core = build(async () => { override.guardBlock('pending_write_unknown', 'Ten sam plan ma nierozstrzygnięty stary zapis; nie ponawiaj POST.'); return { saved: true }; });
  await assert.rejects(core('speediance_create_program', { userOverride: userOverride(['*']) }), /gm_coach_reconcile_pending_program_write/);
  const result = await core('speediance_create_program', { userOverride: { ...userOverride(['pending_write_unknown']), confirmPendingWriteDidNotHappen: 'Sprawdziłem aplikację, tego planu tam nie ma.' } });
  assert.equal(result.saved, true);
  assert.equal(result.overriddenGuards[0].userConfirmation, 'Sprawdziłem aplikację, tego planu tam nie ma.');
});

test('invalid or unauthorized userOverride is rejected', () => {
  assert.throws(() => override.parseUserOverride({ authorized: false, reason: 'x', codes: ['*'] }), /authorized=true/);
  assert.throws(() => override.parseUserOverride({ authorized: true, reason: '', codes: ['*'] }), /reason/);
  assert.throws(() => override.parseUserOverride({ authorized: true, reason: 'x', codes: [] }), /codes/);
});

test('real server lists userOverride and stops a disconnected account with an explanation', { timeout: 30000 }, async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'gm-user-override-'));
  const child = spawn(process.execPath, [fileURLToPath(new URL('../mcp_server.mjs', import.meta.url))], { env: { ...process.env, PLUGIN_DATA: path.join(root, 'data'), CODEX_HOME: path.join(root, 'codex') }, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
  const pending = new Map(); let buffer = '', id = 0;
  child.stdout.setEncoding('utf8');
  child.stdout.on('data', chunk => { buffer += chunk; let n; while ((n = buffer.indexOf('\n')) >= 0) { const line = buffer.slice(0, n); buffer = buffer.slice(n + 1); if (!line.trim()) continue; const message = JSON.parse(line); pending.get(message.id)?.(message); pending.delete(message.id); } });
  const request = (method, params) => new Promise(resolve => { const key = ++id; pending.set(key, resolve); child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: key, method, params }) + '\n'); });
  try {
    await request('initialize', { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'user-override-test', version: '1' } });
    const listed = (await request('tools/list')).result.tools;
    for (const name of ['speediance_preview_program', 'speediance_create_program', 'speediance_preview_training_cycle', 'speediance_schedule_saved_program', 'gm_coach_audit_training_interview']) {
      assert.deepEqual(listed.find(tool => tool.name === name).inputSchema.properties.userOverride, override.userOverrideSchema, name);
    }
    const blocked = await request('tools/call', { name: 'speediance_preview_program', arguments: { profile: 'nieistniejacy', userOverride: userOverride(['*']) } });
    assert.equal(blocked.result.isError, true);
    assert.match(blocked.result.content[0].text, /\[GM Coach/);
    const unsupported = await request('tools/call', { name: 'speediance_list_accounts', arguments: { userOverride: userOverride(['*']) } });
    assert.match(unsupported.result.content[0].text, /userOverride nie dotyczy speediance_list_accounts/);
  } finally {
    child.kill();
    await rm(root, { recursive: true, force: true });
  }
});

