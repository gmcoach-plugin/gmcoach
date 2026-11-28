// GM Coach updater: sprawdza, czy zainstalowany serwer MCP startuje (initialize + tools/list).
// Uzycie / Usage: node verify-server.mjs <plugin-dir> [expected-semver]
// Kod wyjscia 0 = OK, 1 = blad. Nie loguje sie do Speediance i nie czyta hasel.
import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const pluginDir = resolve(process.argv[2] || '.');
const expected = process.argv[3] || '';
const fail = message => { process.stdout.write(JSON.stringify({ ok: false, error: message }) + '\n'); process.exit(1); };
const serverPath = join(pluginDir, 'mcp_server.mjs');
if (!existsSync(serverPath)) fail('mcp_server.mjs not found');
if (process.env.GM_COACH_UPDATER_SIMULATE_FAILURE === 'verify') fail('simulated verification failure');
const cliName = process.platform === 'win32' ? 'speediance-cli.exe' : 'speediance-cli';
const env = { ...process.env };
if (!env.SPEEDIANCE_CLI && existsSync(join(pluginDir, 'bin', cliName))) env.SPEEDIANCE_CLI = join(pluginDir, 'bin', cliName);
const child = spawn(process.execPath, [serverPath], { cwd: pluginDir, env, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
let buffer = '';
let stderr = '';
let nextId = 0;
const pending = new Map();
child.stderr.on('data', chunk => { stderr = (stderr + chunk).slice(-1000); });
child.stdout.setEncoding('utf8');
child.stdout.on('data', chunk => {
  buffer += chunk;
  let index;
  while ((index = buffer.indexOf('\n')) >= 0) {
    const line = buffer.slice(0, index);
    buffer = buffer.slice(index + 1);
    if (!line.trim()) continue;
    let message;
    try { message = JSON.parse(line); } catch { continue; }
    const waiter = pending.get(message.id);
    if (waiter) { pending.delete(message.id); waiter(message); }
  }
});
child.on('exit', code => { for (const waiter of pending.values()) waiter({ error: { message: 'server exited with code ' + code + ': ' + stderr } }); pending.clear(); });
function request(method, params) {
  const id = ++nextId;
  return new Promise((resolveRequest, reject) => {
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(method + ' timed out: ' + stderr)); }, 20000);
    pending.set(id, result => { clearTimeout(timer); resolveRequest(result); });
    child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
  });
}
try {
  const initialized = await request('initialize', { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'gm-coach-updater', version: '1' } });
  if (initialized.error) throw new Error(initialized.error.message);
  child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');
  const listed = await request('tools/list');
  const tools = listed.result && listed.result.tools;
  if (!Array.isArray(tools) || tools.length === 0) throw new Error('tools/list returned no tools');
  const names = new Set(tools.map(tool => tool.name));
  for (const required of ['speediance_check_connection', 'gm_coach_prepare_plan_inputs']) {
    if (!names.has(required)) throw new Error('missing tool ' + required);
  }
  const manifest = JSON.parse(readFileSync(join(pluginDir, 'plugin.json'), 'utf8').replace(/^\uFEFF/, ''));
  const serverVersion = (initialized.result && initialized.result.serverInfo && initialized.result.serverInfo.version) || '';
  if (expected && !String(manifest.version).startsWith(expected)) throw new Error('plugin.json version ' + manifest.version + ' does not match ' + expected);
  let keyring = 'missing';
  try { await import(pathToFileURL(join(pluginDir, 'node_modules', '@napi-rs', 'keyring', 'index.js')).href); keyring = 'ok'; }
  catch { keyring = existsSync(join(pluginDir, 'node_modules', '@napi-rs')) ? 'present' : 'missing'; }
  process.stdout.write(JSON.stringify({ ok: true, version: manifest.version, serverVersion, toolCount: tools.length, keyring }) + '\n');
  child.kill();
  process.exit(0);
} catch (error) {
  child.kill();
  fail(String((error && error.message) || error));
}
