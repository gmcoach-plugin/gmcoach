import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const pluginRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'plugin');

async function readProjectFile(relativePath) {
  return readFile(relativePath.startsWith('tests/') ? new URL('./' + relativePath.slice(6), import.meta.url) : path.join(pluginRoot, relativePath), 'utf8');
}

test('source plugin, bundled plugin, and MCP server share one release version', async () => {
  const portable = JSON.parse(await readProjectFile('plugin.json'));
  const bundled = JSON.parse(await readProjectFile('.codex-plugin/plugin.json'));
  const server = await readProjectFile('mcp_server.mjs');

  assert.equal(bundled.name, portable.name);
  assert.equal(bundled.version, portable.version);
  assert.match(server, /const PLUGIN_VERSION = JSON\.parse\(await readFile\(path\.join\(PLUGIN_ROOT, 'plugin\.json'\), 'utf8'\)\)\.version/);
  assert.match(server, /serverInfo: \{ name: 'gm-coach', version: PLUGIN_VERSION \}/);
});

test('packager and runtime diagnostics refuse to hide stale plugin or MCP versions', {skip:'source-tree only: needs unsanitized core hash, AGENTS.md, dev atoms or tests in package manifest'}, async () => {
  const packager = await readProjectFile('scripts/package.ps1');
  const installer = await readProjectFile('scripts/install-codex-desktop.ps1');
  const diagnosticsTest = await readProjectFile('tests/mcp-instance-diagnostics.test.mjs');
  const developerRules = await readProjectFile('AGENTS.md');

  assert.match(packager, /portableManifest\.version -ne \$codexManifest\.version/);
  assert.match(installer, /portableManifest\.version -ne \$codexManifest\.version/);
  assert.match(diagnosticsTest, /restartRequired, true/);
  assert.match(developerRules, /Test only the newest release present in this source tree/);
  assert.match(developerRules, /testing only the newest GM Coach plugin and MCP release/i);
  assert.match(developerRules, /installed plugin manifest and running server both equal that source version/);
  assert.match(developerRules, /do not test features through that process/i);
  assert.match(developerRules, /serverDiagnostics\.pluginVersion/);
  assert.match(developerRules, /installedPluginVersion[\s\S]*both equal the expected release/);
  assert.match(developerRules, /`restartRequired` to be `false`/);
});

test('development lessons retain current block policy and reviewed UTF8 literals', {skip:'source-tree only: needs unsanitized core hash, AGENTS.md, dev atoms or tests in package manifest'}, async () => {
  const rules = await readProjectFile('AGENTS.md');
  assert.match(rules, /default two-week blocks apply to every horizon/);
  assert.match(rules, /shorter final remainder is a residual block/);
  assert.match(rules, /individualized, scientifically justified final deload belongs inside the agreed horizon/);
  assert.match(rules, /Blocks must have real executable progression/);
  assert.doesNotMatch(rules, /default six-week blocks/);
  assert.ok(rules.includes('reps × RM selector × 2.2'));
  assert.ok(rules.includes('sił must not match wysiłku/wysiłkowa'));
  assert.ok(rules.includes('real siłowy goals'));
  assert.ok(rules.includes('Profile-auto actual-science fixtures'));
  for (const broken of ['Ă—', 'siĹ‚', '`nProfile-auto']) assert.ok(!rules.includes(broken), 'Known damaged literal: '+broken);
});
