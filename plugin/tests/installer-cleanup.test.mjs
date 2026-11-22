import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

async function readInstaller(name) {
  return readFile(path.join(projectRoot, 'scripts', name), 'utf8');
}

test('Unix first manifest entry avoids empty-array expansion under Bash 3.2 nounset', async () => {
  const source = await readInstaller('install-codex-desktop.sh');
  const loop = source.slice(source.indexOf('files=()'), source.indexOf('required_files=('));
  assert.match(source, /^set -euo pipefail$/m);
  assert.doesNotMatch(loop, /"\$\{files\[@\]\}"/);
  assert.match(loop, /for \(\( existing_index=0; existing_index<\$\{#files\[@\]\}; existing_index\+\+ \)\)/);
  assert.match(loop, /"\$\{files\[\$existing_index\]\}" != "\$relative"/);
  // Remaining full-array expansions occur only after this mandatory nonempty
  // gate; required_files and keyring_args have nonempty initial declarations.
  const nonempty = source.indexOf('(( ${#files[@]} > 0 ))');
  assert.ok(nonempty > source.indexOf('files=()'));
  for (const match of source.matchAll(/"\$\{files\[@\]\}"/g)) assert.ok(match.index > nonempty);
  assert.match(source, /keyring_args=\("\$staging_dir\/scripts\/install-keyring-runtime\.mjs"/);
});

test('actual installer manifest loop accepts first entries and rejects duplicates in Bash 3.2 when available', async t => {
  const shell = process.env.GM_COACH_BASH32 || (process.platform === 'darwin' ? '/bin/bash' : null);
  if (!shell) return t.skip('Bash 3.2 unavailable on this host; source regression is not native macOS installation proof.');
  const version = spawnSync(shell, ['--version'], { encoding: 'utf8' });
  if (version.status !== 0 || !/version 3\.2\./.test(version.stdout)) return t.skip('Selected shell is not verified Bash 3.2; no native macOS installation claim.');
  const source = await readInstaller('install-codex-desktop.sh');
  const start = source.indexOf('files=()'), end = source.indexOf('required_files=(');
  assert.ok(start > 0 && end > start);
  const script = `set -euo pipefail\nfiles_manifest="$1"\n${source.slice(start, end)}\nprintf '%s\\n' "\${files[@]}"\n`;
  const directory = await mkdtemp(path.join(tmpdir(), 'gm-coach-bash32-manifest-'));
  try {
    const manifest = path.join(directory, 'manifest.txt');
    for (const entries of [['plugin.json'], ['plugin.json', 'mcp_server.mjs']]) {
      await writeFile(manifest, `${entries.join('\n')}\n`);
      const result = spawnSync(shell, ['-c', script, 'manifest-fixture', manifest], { encoding: 'utf8' });
      assert.equal(result.status, 0, result.stderr); assert.deepEqual(result.stdout.trim().split('\n'), entries);
    }
    await writeFile(manifest, 'plugin.json\nplugin.json\n');
    const duplicate = spawnSync(shell, ['-c', script, 'manifest-fixture', manifest], { encoding: 'utf8' });
    assert.equal(duplicate.status, 1); assert.match(duplicate.stderr, /Duplicate path/);
    assert.doesNotMatch(duplicate.stderr, /unbound variable/);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('Unix runtime reuse checks actual Node platform and architecture before native dependency selection', async () => {
  const source = await readInstaller('install-codex-desktop.sh');
  const helper = source.match(/runtime_target_matches\(\) \{([\s\S]*?)\n\}/)?.[1];
  assert.ok(helper);
  assert.match(helper, /process\.platform \+ "-" \+ process\.arch/);
  assert.match(helper, /actual_target.*node_os-\$node_arch/);
  const reuse = source.slice(source.indexOf('existing_node_version='), source.indexOf('node_major=0'));
  assert.match(reuse, /runtime_target_matches "\$plugin_dir\/runtime\/bin\/node"; then/);
  assert.match(reuse, /node_runtime_reused=1/);
  const validation = source.indexOf('runtime_target_matches "$node_bin" ||');
  assert.ok(validation > source.indexOf('tar -xJf'));
  assert.ok(validation < source.indexOf('keyring_args='));
  assert.match(source, /refresh_dependencies == 0 && node_runtime_reused == 1.*\$plugin_dir\/bin\/speediance-cli/);
});

test('every Unix required_files shell token exists in the canonical package manifest', async () => {
  const source = await readInstaller('install-codex-desktop.sh');
  const body = source.match(/^required_files=\(\n([\s\S]*?)^\)/m)?.[1];
  assert.ok(body, 'required_files array must be present');
  // Parse the actual whitespace-delimited single-quoted shell words, retaining
  // adjoining punctuation: quoted-file followed by comma is a different path.
  const words = body.match(/'[^']*'[^\s']*/g) ?? [];
  assert.ok(words.length > 0);
  const residue = body.replace(/'[^']*'[^\s']*/g, '').trim();
  assert.equal(residue, '', 'unsupported required_files shell syntax');
  const required = words.map(word => word.replace(/^'([^']*)'(.*)$/, '$1$2'));
  const manifest = new Set((await readFile(path.join(projectRoot, 'scripts/plugin-files.txt'), 'utf8')).split(/\r?\n/).map(line => line.trim()).filter(line => line && !line.startsWith('#')));
  for (const relative of required) assert.ok(manifest.has(relative), `required shell token is missing from canonical manifest: ${relative}`);
});

test('Mac launchers and Unix installer contain no carriage returns, and packager enforces LF', async () => {
  for (const name of ['install-codex-desktop.sh', 'install-codex-desktop.command']) {
    const source = await readInstaller(name);
    assert.equal(source.includes('\r'), false, name);
  }
  const packager = await readFile(path.join(projectRoot, 'scripts/package.ps1'), 'utf8');
  assert.match(packager, /\$shellBytes -contains 13/);
  assert.match(packager, /Unix installer must use LF line endings/);
});

test('macOS/Linux release metadata parser quotes the private Node executable path', async () => {
  const source = await readInstaller('install-codex-desktop.sh');
  // HOME/CODEX_HOME may contain spaces. An unquoted command expansion splits
  // the staged executable path before Node can parse the release metadata.
  assert.ok(source.includes('checksum_url="$("$node_bin" - "$release_json" "$archive_name"'));
  assert.ok(!source.includes('$($node_bin '));
});

test('Unix promotion retains the previous installation without positive file-use proof', async () => {
  const source = await readInstaller('install-codex-desktop.sh');
  const promoted = source.indexOf("marketplace_tmp=''", source.indexOf('had_existing_plugin=0'));
  const ready = source.indexOf("echo 'GM Coach local package installation completed.", promoted);
  assert.ok(promoted > 0 && ready > promoted);
  const afterPromotion = source.slice(promoted, ready);
  assert.doesNotMatch(afterPromotion, /rm\s+-rf[^\n]*backup_dir/);
  assert.match(afterPromotion, /if \(\( had_existing_plugin \)\); then/);
  assert.match(afterPromotion, /Keeping the previous GM Coach files at \$backup_dir/);
  assert.match(afterPromotion, /file-use safety was not positively verified/);
  assert.match(afterPromotion, /Codex and MCP were not stopped or restarted/);
  assert.match(afterPromotion, /command line may retain the original plugin path/);
  // Failure recovery still restores the exact backup before the retention point.
  const transaction = source.slice(source.indexOf('had_existing_plugin=0'), promoted);
  assert.equal((transaction.match(/mv "\$backup_dir" "\$plugin_dir"/g) ?? []).length, 2);
  assert.doesNotMatch(source.slice(source.indexOf('cleanup_install() {'), source.indexOf('trap cleanup_install EXIT')), /rm\s+-rf[^\n]*backup_dir/);
});

test('Windows installer cleanup covers staging creation and initial file copy', async () => {
  const source = await readInstaller('install-codex-desktop.ps1');
  const validation = source.indexOf('$missing = @(');
  const cleanupScopeStart = source.indexOf('\ntry {', validation);
  const firstStagingWrite = source.indexOf("New-Item -ItemType Directory -Path $stagingDirectory", validation);
  const firstCopy = source.indexOf('Copy-PluginFiles', validation);
  const cleanupFinally = source.indexOf('\nfinally {', cleanupScopeStart);

  assert.notEqual(validation, -1, 'preflight validation is present');
  assert.notEqual(cleanupScopeStart, -1, 'installer cleanup try/finally begins');
  assert.ok(firstStagingWrite > cleanupScopeStart, 'staging directory is created inside try/finally');
  assert.ok(firstCopy > cleanupScopeStart, 'canonical files are copied inside try/finally');
  assert.ok(cleanupFinally > firstCopy, 'cleanup finally follows staging work');
  assert.match(source.slice(cleanupFinally), /Remove-Item -LiteralPath \$cleanupTarget\.Path -Recurse -Force -ErrorAction Stop/);
  assert.match(source.slice(cleanupFinally), /Remove-Item -LiteralPath \$cleanupTarget\.Path -Force -ErrorAction Stop/);
  assert.match(source.slice(cleanupFinally), /foreach \(\$cleanupTarget in @\([\s\S]*?catch \{\s*Write-Warning/);
  assert.match(source.slice(cleanupFinally), /\$marketplaceTempPath; Recurse = \$false/);
});

test('Windows promotion retains its recovery copy without partially deleting live files', async () => {
  const source = await readInstaller('install-codex-desktop.ps1');
  const retentionStart = source.indexOf('\n  if ($hadExistingPlugin -and (Test-Path -LiteralPath $backupDirectory)) {');
  const cleanupStart = source.indexOf('\nfinally {', retentionStart);
  assert.ok(retentionStart > 0 && cleanupStart > retentionStart);
  const retention = source.slice(retentionStart, cleanupStart);
  assert.doesNotMatch(retention, /Remove-Item/);
  assert.match(retention, /Keeping the previous GM Coach files at \$backupDirectory/);
  assert.match(retention, /file-use safety was not positively verified/);
  assert.match(retention, /Codex and MCP were not stopped or restarted/);
  assert.match(retention, /Retention alone does not solve disk accumulation/);
  const transaction = source.slice(source.indexOf('$hadExistingPlugin = Test-Path'), retentionStart);
  assert.match(transaction, /Move-Item -LiteralPath \$backupDirectory -Destination \$pluginDirectory/);
  assert.match(transaction, /if \(\$promoted.*Remove-Item -LiteralPath \$pluginDirectory -Recurse -Force/);
  const temporaryCleanup = source.slice(cleanupStart, source.indexOf("Write-Output 'GM Coach local package installation completed", cleanupStart));
  assert.doesNotMatch(temporaryCleanup, /Path = \$backupDirectory/);
});

test('Windows cleanup protects a live Node cache detected by executable path, with command-line fallback', async t => {
  const source = await readInstaller('install-codex-desktop.ps1');
  assert.match(source, /function Test-NodeProcessUsesDirectory/);
  assert.match(source, /GetFullPath\(\$Directory\)/);
  assert.match(source, /\$Process\.ExecutablePath/);
  assert.match(source, /\$Process\.CommandLine/);
  assert.match(source, /Test-NodeProcessUsesDirectory -Process \$process -Directory \$dir/);

  if (process.platform !== 'win32') return t.skip('PowerShell process-path matching is Windows-only.');
  const installerPath = path.join(projectRoot, 'scripts', 'install-codex-desktop.ps1');
  const escapedInstallerPath = installerPath.replace(/'/g, "''");
  const script = `$source = [IO.File]::ReadAllText('${escapedInstallerPath}'); $tokens=$null; $errors=$null; $ast=[Management.Automation.Language.Parser]::ParseInput($source,[ref]$tokens,[ref]$errors); if($errors.Count){throw ($errors|Out-String)}; $function=$ast.Find({param($a) $a -is [Management.Automation.Language.FunctionDefinitionAst] -and $a.Name -eq 'Test-NodeProcessUsesDirectory'},$true); if(-not $function){throw 'Missing process path helper'}; Invoke-Expression $function.Extent.Text; $root='C:\\gm-coach-cache\\1.0.667'; $live=[pscustomobject]@{ExecutablePath=(Join-Path $root 'runtime\\node.exe');CommandLine='node ./mcp_server.mjs'}; if(-not (Test-NodeProcessUsesDirectory -Process $live -Directory ($root+'\\.'))){throw 'ExecutablePath match failed'}; $sibling=[pscustomobject]@{ExecutablePath=(Join-Path ($root+'-sibling') 'runtime\\node.exe');CommandLine='node ./mcp_server.mjs'}; if(Test-NodeProcessUsesDirectory -Process $sibling -Directory $root){throw 'Sibling directory matched'}; $fallback=[pscustomobject]@{ExecutablePath='C:\\Program Files\\nodejs\\node.exe';CommandLine=('node "'+$root+'\\mcp_server.mjs"')}; if(-not (Test-NodeProcessUsesDirectory -Process $fallback -Directory $root)){throw 'Command-line fallback failed'}; exit 0`;
  const result = spawnSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', script], { encoding: 'utf8' });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
});

test('macOS/Linux installer installs cleanup trap before its first staging operation', async () => {
  const source = await readInstaller('install-codex-desktop.sh');
  const cleanup = source.indexOf('cleanup_install() {');
  const trap = source.indexOf('trap cleanup_install EXIT', cleanup);
  const createStaging = source.indexOf('staging_dir="$(mktemp -d', cleanup);
  const copyCanonicalFiles = source.indexOf('cp -f "$plugin_root/$relative" "$destination"', createStaging);

  assert.notEqual(cleanup, -1, 'cleanup handler is defined');
  assert.notEqual(trap, -1, 'cleanup handler is registered');
  assert.ok(trap < createStaging, 'EXIT trap covers staging-directory creation');
  assert.ok(copyCanonicalFiles > createStaging, 'canonical copy happens after trap registration');
  assert.match(source, /tmp_dir=''[\s\S]*?cleanup_install\(\)/);
  assert.match(source.slice(cleanup), /if \[\[ -n "\$tmp_dir" && -d "\$tmp_dir" \]\]; then\s+if ! rm -rf -- "\$tmp_dir"; then/);
  assert.match(source.slice(cleanup), /if \[\[ -n "\$staging_dir" && -d "\$staging_dir" \]\]; then\s+if ! rm -rf -- "\$staging_dir"; then/);
  assert.match(source.slice(cleanup), /if \[\[ -n "\$marketplace_tmp" && -f "\$marketplace_tmp" \]\]; then\s+if ! rm -f -- "\$marketplace_tmp"; then/);
  assert.match(source.slice(cleanup), /if ! rm -rf -- "\$tmp_dir"; then/);
  assert.match(source.slice(cleanup), /if ! rm -rf -- "\$staging_dir"; then/);
  assert.match(source.slice(cleanup), /if ! rm -f -- "\$marketplace_tmp"; then/);
  assert.match(source.slice(cleanup), /return "\$exit_status"/);
});

test('restart guidance distinguishes the bundled and global GM Coach MCP servers', async () => {
  const windows = await readInstaller('install-codex-desktop.ps1');
  const unix = await readInstaller('install-codex-desktop.sh');
  const recovery = await readFile(path.join(projectRoot, 'auth-diagnostics.mjs'), 'utf8');

  for (const source of [windows, unix, recovery]) {
    assert.match(source, /gm-coach[^\n]{0,120}gm_coach_local|gm_coach_local[^\n]{0,120}gm-coach/);
    assert.match(source, /new chat|nowy czat/i);
  }
  assert.match(recovery, /nie restartuj Codex Desktop/);
});


test('installer success is local-only and recovery requires confirmed host controls', async () => {
  for (const name of ['install-codex-desktop.ps1', 'install-codex-desktop.sh']) {
    const source = await readInstaller(name);
    if (name.endsWith('.ps1')) {
      assert.match(source, /GM Coach local plugin files were installed\. Tool availability in the requested chat has not been verified\./);
    } else {
      assert.match(source, /GM Coach local package installation completed\. Tool availability in the requested chat has not been verified\./);
    }
    assert.match(source, /Only when that application exposes a restart control for the observed GM Coach server/);
    assert.match(source, /Registration is local configuration only; tool availability in the requested chat has not been verified/);
    assert.doesNotMatch(source, /GM Coach is ready|In Codex Settings > MCP servers|install it from Plugins Directory > Personal/);
    assert.match(source, /Attachment of its coaching instructions and bundled gm-coach MCP to the requested chat has not been verified/);
  }
  const recovery = await readFile(path.join(projectRoot, 'auth-diagnostics.mjs'), 'utf8');
  assert.ok(recovery.includes('Restart proponuj tylko, gdy aplikacja udostępnia potwierdzoną kontrolę restartu'));
  assert.ok(recovery.includes('Działająca lokalna instalacja ani inny czat nie potwierdzają dostępności narzędzi tutaj.'));
  assert.doesNotMatch(recovery, /Settings → MCP servers/);
});

test('Windows installer fails explicitly when Codex cannot verify the versioned plugin cache', async t => {
  const source = (await readInstaller('install-codex-desktop.ps1')).replace(/\r\n/g, '\n');
  const activationStart = source.indexOf("if ($pluginAdded) {\n  Write-Output 'The Codex plugin cache is current.");
  const failStart = source.indexOf('} else {', activationStart);
  const failEnd = source.indexOf('\n}', failStart);
  assert.ok(activationStart >= 0 && failStart > activationStart && failEnd > failStart);
  const failureBranch = source.slice(failStart + '} else {'.length, failEnd);
  assert.match(failureBranch, /activation of versioned cache \$installedVersion could not be confirmed/);
  assert.match(failureBranch, /previous plugin files were preserved/);
  assert.match(failureBranch, /exit 1/);
  assert.doesNotMatch(failureBranch, /Write-Output 'The local GM Coach plugin files.*ready/);

  if (process.platform !== 'win32') return t.skip('Raw PowerShell exit-code check is Windows-only.');
  const script = `$pluginAdded = $false; $installedVersion = 'fixture'; ${failureBranch}`;
  const result = spawnSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', script], { encoding: 'utf8' });
  assert.equal(result.status, 1, `${result.stdout}\n${result.stderr}`);
  assert.match(result.stdout, /activation of versioned cache fixture could not be confirmed/);
});

test('portable and compatibility manifests both declare the local executor requirement', async () => {
  const portable = JSON.parse(await readFile(path.join(projectRoot, 'plugin.json'), 'utf8'));
  const compatibility = JSON.parse(await readFile(path.join(projectRoot, '.codex-plugin', 'plugin.json'), 'utf8'));
  assert.equal(portable.extensions['com.openai'].requires_local_executor, true);
  assert.equal(compatibility.requires_local_executor, true);
  assert.equal(compatibility.name, portable.name);
  assert.equal(compatibility.version, portable.version);
});


test('runtime and local diagnostic router require observed restart controls and literal version evidence', async () => {
 const runtime=await readFile(path.join(projectRoot,'mcp_server.mjs'),'utf8');
 const initialize=await readFile(path.join(projectRoot,'initialize-instructions.mjs'),'utf8');
 const router=await readFile(path.join(projectRoot,'skills','speediance-coach','SKILL.md'),'utf8');
 const rootRouter=await readFile(path.join(projectRoot,'SKILL.md'),'utf8');
 const exceptions=await readFile(path.join(projectRoot,'skills','speediance-coach','instructions-router-exceptions.md'),'utf8');
 const diagnosticParagraph=text=>{
  const paragraph=text.replace(/\r\n/g,'\n').split('## Wyjątek: tylko lokalna wersja MCP\n\n')[1]?.split('\n\n')[0];
  assert.ok(paragraph,'The narrow diagnostic route paragraph exists in this router');
  return paragraph;
 };
 assert.equal(diagnosticParagraph(rootRouter),diagnosticParagraph(exceptions),'Root and nested diagnostic routing remain exact mirrors');
 assert.doesNotMatch(runtime,/Settings → MCP servers|running MCP process is older|zrestartuj wyłącznie gm_coach_local/);
 assert.ok(runtime.includes('installedPluginVersion !== PLUGIN_VERSION'),'Existing fail-closed version comparison remains unchanged');
 assert.ok(exceptions.includes('installedPluginVersion=null oznacza niepotwierdzoną wersję na dysku'));
 assert.ok(initialize.includes('potwierdzoną kontrolę dla dokładnej instancji'));
 assert.ok(initialize.includes('wynik nowego czatu nie potwierdza odświeżenia starego'));
 assert.ok(router.includes('instructions-router-exceptions.md'));
 assert.ok(exceptions.includes('aplikacja udostępnia potwierdzoną kontrolę'));
 assert.ok(exceptions.includes('Wynik nowej instancji nie potwierdza odświeżenia starego czatu'));
 assert.ok(exceptions.includes('Nie wykonuj testów funkcji'));
});


test('all active account and README recovery guidance rejects guessed menus and cold-start configuration', async () => {
 for(const rel of ['instructions-account.md','skills/speediance-coach/instructions-account.md','README.md']){
  const text=await readFile(path.join(projectRoot,rel),'utf8');
  assert.doesNotMatch(text,/Settings[^\n]{0,50}MCP|mcp_optional_startup_grace_ms|preferuj globalny|domyślne okno|serwer jest starszy/);
  assert.match(text,/potwierdzoną kontrolę/);
 }
});


test('both account modules retain precise mismatch and history boundaries', async () => {
 for(const rel of ['instructions-account.md','skills/speediance-coach/instructions-account.md']){
 const text=await readFile(path.join(projectRoot,rel),'utf8');
 assert.ok(text.includes('installedPluginVersion=null oznacza brak potwierdzenia wersji na dysku'));
 assert.ok(text.includes('nierówne potwierdzone wartości nie ustalają kolejności'));
 assert.ok(text.includes('Wstrzymaj testy funkcji'));
 assert.ok(text.includes('workoutHistoryAccess'));
 assert.ok(text.includes('credentialStatus'));
 }
});
