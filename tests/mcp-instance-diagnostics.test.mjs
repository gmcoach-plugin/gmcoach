import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { copyFile, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { createInterface } from 'node:readline';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'plugin');
const serverPath = path.join(projectRoot, 'mcp_server.mjs');
const pluginManifest = JSON.parse(await readFile(path.join(projectRoot, 'plugin.json'), 'utf8'));

// Retain both fixture directories if direct-child closure cannot be confirmed.
// Descendant containment belongs to the reviewed outer runner's owned Job;
// direct-child close alone is not a process-tree termination guarantee.
const retainedPluginData = new Set();
async function waitForChildClose(closed, milliseconds) {
  let timer;
  try {
    return await Promise.race([
      closed,
      new Promise(resolve => { timer = setTimeout(() => resolve(false), milliseconds); })
    ]);
  } finally {
    clearTimeout(timer);
  }
}

async function readServerDiagnostics(pluginData, {
  afterInitialize,
  expectedInstalledPluginVersion = pluginManifest.version
} = {}) {
  const serverRoot = await mkdtemp(path.join(os.tmpdir(), 'gm-coach-mcp-server-fixture-'));
  const entries = await readdir(projectRoot, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isFile() && (entry.name.endsWith('.mjs') || entry.name === 'plugin.json')) {
      await copyFile(path.join(projectRoot, entry.name), path.join(serverRoot, entry.name));
    }
  }
  const child = spawn(process.execPath, [path.join(serverRoot, 'mcp_server.mjs')], {
    env: { ...process.env, PLUGIN_DATA: pluginData },
    stdio: ['pipe', 'pipe', 'pipe']
  });
  retainedPluginData.add(pluginData);
  // Register immediately, before sending input or awaiting any server response.
  // Error is observed without creating a separately unhandled rejecting promise.
  child.on('error', () => {});
  const closed = new Promise(resolve => child.once('close', () => resolve(true)));
  child.stderr.resume();
  const lines = createInterface({ input: child.stdout });
  const iterator = lines[Symbol.asyncIterator]();
  try {
    child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2024-11-05' } })}\n`);
    const initializeLine = await iterator.next();
    assert.equal(initializeLine.done, false);
    const initialize = JSON.parse(initializeLine.value);
    assert.equal(initialize.result?.serverInfo?.version, pluginManifest.version);
    await afterInitialize?.(serverRoot);

    child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} })}\n`);
    const toolsLine = await iterator.next();
    assert.equal(toolsLine.done, false);
    const listed = JSON.parse(toolsLine.value);
    assert.equal(listed.jsonrpc, '2.0');
    assert.equal(listed.id, 2);
    assert.equal(listed.error, undefined);
    assert.ok(Array.isArray(listed.result?.tools));
    const exactTool = name => {
      const matches = listed.result.tools.filter(tool => tool.name === name);
      assert.equal(matches.length, 1, `Exactly one advertised ${name}`);
      return matches[0].inputSchema;
    };
    const batchSchema = exactTool('speediance_read_training_cycle_pages');
    assert.equal(batchSchema.type, 'object');
    assert.equal(batchSchema.additionalProperties, false);
    assert.deepEqual(batchSchema.required ?? [], []);
    assert.equal(batchSchema.properties.indexes.maxItems, 16);
    assert.deepEqual(batchSchema.properties.maxOutputBytes, {type:'integer',minimum:1024,maximum:1000000,default:64000});
    const researchSchema = exactTool('gm_coach_read_training_research_batch');
    assert.equal(researchSchema.type, 'object');
    assert.equal(researchSchema.additionalProperties, false);
    assert.deepEqual(researchSchema.required, ['batchId', 'mode']);
    assert.deepEqual(researchSchema.properties.mode, {type:'string',enum:['index','bibliography','abstract']});
    assert.deepEqual(researchSchema.properties.maxOutputBytes, {type:'integer',minimum:1024,maximum:16000,default:6000});
    const toolNames = new Set(listed.result?.tools?.map((tool) => tool.name));
    assert.deepEqual(exactTool('gm_coach_get_local_diagnostics'), { type: 'object', additionalProperties: false, properties: {} });
    for (const requiredName of ['speediance_check_connection', 'speediance_list_workouts', 'speediance_create_program']) {
      assert.ok(toolNames.has(requiredName), `MCP catalog includes ${requiredName}`);
    }

    child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id: 30, method: 'tools/call', params: { name: 'gm_coach_get_local_diagnostics', arguments: {} } })}\n`);
    const diagnosticsLine = await iterator.next();
    assert.equal(diagnosticsLine.done, false);
    const diagnosticsCall = JSON.parse(diagnosticsLine.value);
    assert.equal(diagnosticsCall.result?.isError, false);
    const diagnosticsOnly = JSON.parse(diagnosticsCall.result.content[0].text);
    assert.deepEqual(Object.keys(diagnosticsOnly).sort(), ['planningInputContract','serverDiagnostics']);
    assert.equal(diagnosticsOnly.serverDiagnostics.pluginVersion, pluginManifest.version);
    const contract=diagnosticsOnly.planningInputContract;
    assert.equal(contract.version,1);
    for(const token of ['gm_coach_resolve_recovery_context','recoveryDecisionBinding.value','resolvedRecoveryContext','undefined'])assert.ok(contract.recoveryContextBinding.includes(token),token);
    assert.match(contract.evidenceAndDecisionScope,/wszystkie categories/);
    assert.match(contract.evidenceAndDecisionScope,/researchCategories obejmuje tylko potrzebne wyszukiwania/);
    for(const token of ['requiredStatus=not_used','requiredStatus=not_applicable','skopiuj dokładnie requiredStatus do status','relationship=not_applicable','evidenceIds=[]','supportingExcerpts=[]','sourceAssessments=[]','bez PubMed']) assert.ok(contract.evidenceAndDecisionScope.includes(token),token);
    assert.match(contract.categoryMapping,/same searched category/);
    assert.match(contract.categoryMapping,/resisted set_load requires set_load/);
    assert.match(contract.preferenceReview,/writeReady=false, approvalIssued=false/);
    child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'speediance_list_accounts', arguments: {} } })}\n`);
    const accountLine = await iterator.next();
    assert.equal(accountLine.done, false);
    const call = JSON.parse(accountLine.value);
    assert.equal(call.result?.isError, false);
    const payload = JSON.parse(call.result.content[0].text);
    assert.equal(payload.serverDiagnostics.pluginVersion, pluginManifest.version);
    assert.equal(payload.serverDiagnostics.installedPluginVersion, expectedInstalledPluginVersion);
    assert.equal(payload.serverDiagnostics.restartRequired, expectedInstalledPluginVersion !== pluginManifest.version);
    assert.match(payload.serverDiagnostics.mcpInstanceId, /^[a-f0-9]{24}$/);
    assert.deepEqual(payload.accounts, []);
    assert.deepEqual(diagnosticsOnly.serverDiagnostics, payload.serverDiagnostics);
    assert.deepEqual(diagnosticsOnly.planningInputContract,payload.planningInputContract);
    return payload.serverDiagnostics;
  } finally {
    lines.close();
    child.stdin.destroy();
    // Signal only this exact owned ChildProcess handle. No PID search or shell.
    try { child.kill('SIGTERM'); } catch { /* still require confirmed close */ }
    let didClose = await waitForChildClose(closed, 5000);
    if (!didClose) {
      try { child.kill('SIGKILL'); } catch { /* retain directories if unconfirmed */ }
      didClose = await waitForChildClose(closed, 5000);
    }
    if (!didClose) {
      throw new Error(`MCP fixture child close unconfirmed after bounded cleanup; retained serverRoot=${serverRoot}; pluginData=${pluginData}`);
    }
    retainedPluginData.delete(pluginData);
    await rm(serverRoot, { recursive: true, force: true });
  }
}

test('reports a stable process identity within one MCP process and a new identity after restart', async (t) => {
  const pluginData = await mkdtemp(path.join(os.tmpdir(), 'gm-coach-mcp-diagnostics-'));
  t.after(() => retainedPluginData.has(pluginData) ? undefined : rm(pluginData, { recursive: true, force: true }));

  const first = await readServerDiagnostics(pluginData);
  const restarted = await readServerDiagnostics(pluginData);

  assert.equal(first.pluginVersion, restarted.pluginVersion);
  assert.notEqual(first.mcpInstanceId, restarted.mcpInstanceId);
});

test('detects a newer on-disk plugin version without exposing local paths', async (t) => {
  const pluginData = await mkdtemp(path.join(os.tmpdir(), 'gm-coach-mcp-diagnostics-'));
  t.after(() => retainedPluginData.has(pluginData) ? undefined : rm(pluginData, { recursive: true, force: true }));

  const installedPluginVersion = `${pluginManifest.version}-disk`;
  const diagnostics = await readServerDiagnostics(pluginData, {
    expectedInstalledPluginVersion: installedPluginVersion,
    afterInitialize: async (serverRoot) => {
      const manifestPath = path.join(serverRoot, 'plugin.json');
      const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
      manifest.version = installedPluginVersion;
      await writeFile(manifestPath, `${JSON.stringify(manifest)}\n`, 'utf8');
    }
  });

  assert.equal(diagnostics.pluginVersion, pluginManifest.version);
  assert.equal(diagnostics.installedPluginVersion, installedPluginVersion);
  assert.equal(diagnostics.restartRequired, true);
  assert.doesNotMatch(JSON.stringify(diagnostics), /[A-Z]:\\|\/tmp\//i);
});

test('both account and connection tools use the shared version diagnostics', async () => {
  const source = await readFile(serverPath, 'utf8');
  assert.match(source, /async function listAccounts\(\)[\s\S]*?serverDiagnostics: await getServerDiagnostics\(\)/);
  assert.match(source, /case 'speediance_check_connection':[\s\S]*?serverDiagnostics: await getServerDiagnostics\(\)/);
});
