param([switch]$Update, [switch]$RefreshDependencies)

$ErrorActionPreference = 'Stop'
if ($RefreshDependencies -and -not $Update) {
  throw 'Use -RefreshDependencies together with -Update.'
}
$pluginRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$portableManifest = Get-Content -LiteralPath (Join-Path $pluginRoot 'plugin.json') -Raw | ConvertFrom-Json
$codexManifest = Get-Content -LiteralPath (Join-Path $pluginRoot '.codex-plugin/plugin.json') -Raw | ConvertFrom-Json
if ($portableManifest.name -ne $codexManifest.name -or $portableManifest.version -ne $codexManifest.version) {
  throw 'Root plugin.json and .codex-plugin/plugin.json must have the same name and version before installation.'
}
$homeDirectory = if ($env:GM_COACH_TEST_HOME) { [System.IO.Path]::GetFullPath($env:GM_COACH_TEST_HOME) } else { [Environment]::GetFolderPath('UserProfile') }
$codexHome = if ($env:CODEX_HOME) { [System.IO.Path]::GetFullPath($env:CODEX_HOME) } else { Join-Path $homeDirectory '.codex' }
$pluginDirectory = Join-Path $codexHome 'plugins\gm-coach'
$marketplaceDirectory = Join-Path $homeDirectory '.agents\plugins'
$marketplacePath = Join-Path $marketplaceDirectory 'marketplace.json'
$temporaryDirectory = Join-Path ([System.IO.Path]::GetTempPath()) ('gm-coach-install-' + [guid]::NewGuid().ToString('N'))
$pluginParentDirectory = Split-Path -Parent $pluginDirectory
$stagingDirectory = Join-Path $pluginParentDirectory ('.gm-coach-staging-' + [guid]::NewGuid().ToString('N'))
$backupDirectory = Join-Path $pluginParentDirectory ('.gm-coach-backup-' + [guid]::NewGuid().ToString('N'))
$runtimeDirectory = Join-Path $stagingDirectory 'runtime'
$binaryDirectory = Join-Path $stagingDirectory 'bin'
$marketplaceTempPath = $null

$filesManifestPath = Join-Path $pluginRoot 'scripts/plugin-files.txt'
if (-not (Test-Path -LiteralPath $filesManifestPath -PathType Leaf)) {
  throw "Missing canonical package file list: $filesManifestPath"
}
$relativeFiles = @(
  Get-Content -LiteralPath $filesManifestPath |
    ForEach-Object { $_.Trim() } |
    Where-Object { $_ -and -not $_.StartsWith('#') }
)
if ($relativeFiles.Count -eq 0) { throw 'The canonical package file list is empty.' }
if (@($relativeFiles | Select-Object -Unique).Count -ne $relativeFiles.Count) {
  throw 'The canonical package file list contains duplicate paths.'
}
foreach ($relative in $relativeFiles) {
  if ($relative -notmatch '^[A-Za-z0-9._/-]+$' -or $relative -match '(^|/)\.\.(/|$)' -or
      $relative -match '(^|/)(accounts?|config\.json|\.env|runtime|bin|node_modules|\.git|[^/]*token[^/]*)(/|$)') {
    throw "Unsafe or private path in canonical package file list: $relative"
  }
}
$requiredFiles = @(
  'completed-session-batch.mjs', 'tests/completed-session-batch.test.mjs',
  '.codex-plugin/plugin.json', 'assets/gm-coach-icon.svg', '.mcp.json', 'mcp.json',
  'plugin.json', 'mcp_server.mjs', 'exercise-candidate-index.mjs', 'tests/exercise-candidate-index.test.mjs', 'science-guidance-index.mjs', 'tests/science-guidance-index.test.mjs', 'plugin-data-directory.mjs', 'cli-runtime.mjs', 'auth-diagnostics.mjs', 'equipment-inventory.mjs', 'exercise-library.mjs', 'exercise-statistics.mjs', 'preset-mapping.mjs', 'goal-preset-routing.mjs', 'program-payload.mjs', 'imported-rm-selector-policy.mjs', 'tests/imported-rm-selector-policy.test.mjs', 'program-serialization.mjs', 'superset-serialization.mjs', 'program-calendar.mjs', 'saved-templates.mjs', 'saved-template-list.mjs', 'saved-template-unit-memory.mjs', 'training-evidence.mjs', 'science-decision-groups.mjs', 'training-research.mjs', 'research-batch-projection.mjs', 'tests/research-batch-projection.test.mjs', 'unit-interpretation.mjs', 'workout-data.mjs', 'session-recovery.mjs', 'credential-store.mjs', 'native-login.mjs', 'workout-json-interop.mjs', 'portable-plan-codec.mjs', 'portable-source-schema.mjs', 'tests/portable-plan-codec.test.mjs', 'portable-source-adapter.mjs', 'portable-shared-plan.mjs', 'shared-plan-artifact-store.mjs', 'tests/shared-plan-artifact-store.test.mjs', 'tests/portable-shared-plan.test.mjs', 'retained-portable-source.mjs', 'saved-source-reconstruction.mjs', 'saved-execution-match.mjs', 'tests/saved-execution-match.test.mjs', 'tests/saved-export-roundtrip.test.mjs', 'saved-presentation.mjs', 'saved-response-header-diagnostics.mjs', 'saved-preset-display-page.mjs', 'saved-preset-read-scope.mjs', 'tests/saved-preset-display-page.test.mjs', 'tests/saved-header-fixture.mjs', 'tests/saved-response-header-diagnostics.test.mjs', 'imported-candidate-completion.mjs', 'tests/imported-candidate-completion.test.mjs', 'tests/retained-portable-source.test.mjs', 'tests/portable-source-adapter.test.mjs', 'tests/portable-public-dispatch.test.mjs', 'tests/portable-full-stdio.test.mjs', 'tests/shared-plan-instructions.test.mjs', 'native-workout-reader.mjs', 'completed-calendar-identity.mjs', 'tests/completed-calendar-identity.test.mjs', 'tests/completed-calendar-dispatch.test.mjs', 'tests/athlete-history-coverage.test.mjs', 'tests/session-date-binding.test.mjs', 'tests/saved-edit-disclosure.test.mjs', 'tests/history-range-report.test.mjs', 'tests/today-resilience.test.mjs', 'native-health-reader.mjs', 'bounded-read-batch.mjs', 'tests/bounded-health-batch.test.mjs', 'tests/bounded-health-transport.test.mjs', 'recovery-context.mjs', 'tests/recovery-context.test.mjs', 'tests/recovery-context-integration.test.mjs', 'tests/recovery-fixture.mjs', 'tests/native-health-reader.test.mjs', 'tests/reported-health-dispatch.test.mjs', 'native-workout-summary.mjs', 'profile-secret-storage.mjs', 'account-readiness.mjs', 'coaching-profile.mjs', 'coaching-memory.mjs', 'accessory-requirement-confirmation.mjs', 'coaching-memory-lock.mjs', 'preference-compliance.mjs', 'speediance-throttle.mjs', 'server-log.mjs', 'equipment-order.mjs', 'tests/equipment-order-real.test.mjs', 'tests/server-log.test.mjs', 'tests/speediance-throttle.test.mjs', 'reported-session-summary.mjs', 'tests/reported-session-summary-public.test.mjs', 'period-statistics.mjs', 'tests/period-statistics-public.test.mjs', 'sketch-time.mjs', 'compact-sketch.mjs', 'tests/compact-sketch.test.mjs', 'tests/sketch-time.test.mjs', 'tests/sketch-time-dispatch.test.mjs', 'tests/account-unit-conflict.test.mjs', 'time-budget.mjs', 'tests/time-budget.test.mjs', 'tests/native-detail-conflicts.test.mjs', 'tests/executable-preview-rows.test.mjs', 'tests/native-session-unit.test.mjs', 'tests/native-semantics.test.mjs', 'tests/create-response-code.test.mjs', 'history-channel-load.mjs', 'evidence-pack.mjs', 'tests/evidence-pack.test.mjs', 'tests/history-channel-load.test.mjs', 'tests/history-channel-load-dispatch.test.mjs', 'tests/chat-error-guidance.test.mjs', 'tests/saved-edit-676.test.mjs', 'tests/native-customize-boundaries.test.mjs', 'tests/native-unit-identities.test.mjs', 'tests/native-history-scanner.test.mjs', 'tests/time-app-range-preservation.test.mjs', 'tests/preference-preflight.test.mjs', 'tests/technique-entry-identity.test.mjs', 'tests/dose-diagnostics.test.mjs', 'tests/time-side-rest.test.mjs', 'tests/science-workflow-instructions.test.mjs', 'tests/time-budget-public-preview.test.mjs', 'tests/time-budget-late-transport.test.mjs', 'tests/preference-compliance.test.mjs', 'reviewed-plan-record.mjs', 'tests/reviewed-plan-record.test.mjs', 'reviewed-plan-store.mjs', 'tests/reviewed-plan-store.test.mjs', 'cycle-draft-store.mjs', 'cycle-continuation-identity.mjs', 'tests/cycle-continuation-identity.test.mjs', 'tests/cycle-continuation-process.test.mjs', 'tests/fixtures/continuation-process-worker.mjs', 'scalable-cycle-dispatch.mjs', 'bounded-cycle-json.mjs', 'streaming-cycle-preparation.mjs', 'tests/cycle-draft-store.test.mjs', 'tests/scientific-cycle-fixture.mjs', 'training-cycle-executor.mjs', 'tests/training-cycle-executor.test.mjs', 'training-cycle-prescription.mjs', 'tests/training-cycle-prescription.test.mjs', 'tests/training-cycle-preview.test.mjs', 'tests/model-plan-ledger-instructions.test.mjs', 'tests/fixtures/skill-instructions.mjs', 'training-cycle-audit.mjs', 'cycle-style-compliance.mjs', 'tests/training-cycle-audit.test.mjs', 'training-schedule-pattern.mjs', 'tests/training-schedule-pattern.test.mjs', 'injury-safety.mjs', 'equipment-plan-safety.mjs', 'athlete-context.mjs', 'REFERENCE_CLIENT_PARITY_AUDIT.md', 'README.md', 'SKILL.md', 'instructions-core.md', 'instructions-account.md', 'instructions-history.md', 'instructions-catalog.md', 'instructions-design.md', 'instructions-cycle.md', 'instructions-write.md', 'skills/speediance-coach/instructions-core.md', 'skills/speediance-coach/instructions-account.md', 'skills/speediance-coach/instructions-history.md', 'skills/speediance-coach/instructions-catalog.md', 'skills/speediance-coach/instructions-design.md', 'skills/speediance-coach/instructions-cycle.md', 'skills/speediance-coach/instructions-sharing.md', 'skills/speediance-coach/instructions-write.md', 'skills/training-science/instructions-core.md', 'skills/training-science/instructions-science.md',
  'tests/injury-safety.test.mjs', 'tests/equipment-plan-safety.test.mjs', 'tests/equipment-inventory.test.mjs', 'tests/coaching-profile.test.mjs', 'tests/coaching-memory.test.mjs', 'tests/installer-cleanup.test.mjs', 'tests/auth-diagnostics.test.mjs', 'tests/session-displacement-diagnostics.test.mjs', 'tests/saved-template-unit-memory.test.mjs', 'tests/saved-template-list.test.mjs', 'tests/saved-template-page-observation.test.mjs', 'tests/accessory-confirmation-full-dispatch.test.mjs', 'tests/training-volume.test.mjs', 'tests/goal-preset-routing.test.mjs',
  'skills/speediance-coach/instructions-completed.md', 'skills/speediance-coach/instructions-common.md', 'skills/speediance-coach/instructions-saved.md', 'skills/speediance-coach/instructions-fiction.md', 'skills/speediance-coach/instructions-design-fiction.md', 'skills/speediance-coach/instructions-routing.json', 'skills/speediance-coach/instructions-plan-cycle.generated.md', 'skills/training-science/instructions-plan-cycle.md', 'scripts/plan-cycle-atoms.json', 'scripts/generate-plan-cycle.mjs', 'tests/plan-cycle-projection.test.mjs', 'skills/speediance-coach/instructions-plan-cycle.generated.md', 'skills/training-science/instructions-plan-cycle.md', 'scripts/plan-cycle-atoms.json', 'scripts/generate-plan-cycle.mjs', 'tests/plan-cycle-projection.test.mjs', 'skills/speediance-coach/instructions-quicktest.md', 'tests/task-scoped-instructions.test.mjs', 'skills/speediance-coach/instructions-plan-lean.md', 'skills/speediance-coach/instructions-saved-edit-lean.md', 'scripts/saved-edit-lean-atoms.json', 'skills/training-science/instructions-plan-lean.md', 'skills/training-science/instructions-fiction-lean.md', 'tests/lean-plan-routing.test.mjs', 'tests/preview-shape-fastfail.test.mjs', 'tests/quicktest-legacy-pending.test.mjs',
  'skills/speediance-coach/SKILL.md', 'skills/speediance-coach/instructions-router-exceptions.md', 'skills/speediance-coach/references/gym-monster-equipment-and-modes.md', 'skills/training-science/SKILL.md', 'skills/training-science/instructions-public-research.md', 'skills/training-science/references/resistance-training-evidence.md',
  'scripts/plugin-files.txt', 'scripts/keyring-runtime.json', 'scripts/install-keyring-runtime.mjs', 'scripts/install-codex-desktop.ps1',
  'scripts/install-codex-desktop.bat', 'scripts/install-codex-desktop.sh',
  'scripts/install-codex-desktop.command',
  'training-volume.mjs', 'smart-rm-readiness.mjs', 'tests/smart-rm-readiness.test.mjs',
  'tests/smart-rm-model-contract.test.mjs', 'tests/scientific-saved-edit.test.mjs', 'tests/saved-edit-late-expiry.test.mjs', 'tests/write-approval-replay.test.mjs', 'tests/load-readback-parity.test.mjs', 'tests/fixed-kg-account-units.test.mjs', 'tests/customize-preview-load.test.mjs', 'tests/static-wire-quantization.test.mjs', 'customize-load-step.mjs', 'official-course-reservation.mjs', 'tests/official-course-reservation.test.mjs', 'tests/static-protocol-saved-roundtrip.test.mjs', 'tests/static-protocol-presentation.test.mjs', 'STATIC_PROTOCOL_MCP_AUDIT.md', 'static-load-protocol.mjs', 'static-protocol-context.mjs', 'tests/static-protocol-context.test.mjs', 'tests/workout-cable-display.test.mjs', 'tests/vita-history-semantics.test.mjs', 'tests/saved-vita-readback.test.mjs', 'tests/unilateral-evidence-binding.test.mjs', 'tests/saved-side-presentation.test.mjs', 'tests/unilateral-mcp-roundtrip.test.mjs', 'tests/side-transition.test.mjs', 'tests/side-transition-roundtrip.test.mjs', 'tests/unilateral-prescription.test.mjs', 'unilateral-prescription.mjs', 'tests/static-load-protocol.test.mjs', 'REFERENCE_CLIENT_UPSTREAM_CONFLICTS.md', 'AUTH_CLIENT_IDENTITY_AUDIT.md', 'saved-plan-identity.mjs', 'tests/saved-plan-identity.test.mjs', 'tests/duplicate-unit-memory.test.mjs', 'saved-edit-diff.mjs', 'tests/saved-edit-diff.test.mjs', 'tests/saved-schedule-science.test.mjs', 'executable-plan-sections.mjs', 'tests/executable-plan-sections.test.mjs', 'tests/executable-plan-sections-serialization.test.mjs', 'tests/training-evidence.test.mjs', 'tests/science-decision-groups.test.mjs', 'tests/selected-accessory-preflight.test.mjs', 'tests/superset-serialization.test.mjs', 'tests/duplicate-saved-patches.test.mjs', 'official-courses.mjs', 'tests/official-courses.test.mjs', 'official-programs.mjs', 'tests/official-programs.test.mjs', 'tests/official-program-day-dispatch.test.mjs', 'static-load-wire-units.mjs', 'tests/static-load-wire-units.test.mjs', 'static-load-limits.mjs', 'tests/static-load-limits.test.mjs', 'cable-load-telemetry.mjs', 'tests/cable-load-telemetry.test.mjs', 'load-channel-presentation.mjs', 'tests/load-channel-presentation.test.mjs', 'free-lift-data.mjs', 'tests/free-lift-data.test.mjs', 'completed-session-reader.mjs', 'session-heart-rate.mjs', 'session-rowing-telemetry.mjs', 'tests/session-rowing-telemetry.test.mjs', 'tests/session-rowing-dispatch.test.mjs', 'tests/session-rowing-transport.test.mjs', 'tests/session-heart-rate.test.mjs', 'tests/session-heart-dispatch.test.mjs', 'tests/session-heart-transport.test.mjs', 'completed-history-comparison.mjs', 'completed-history-comparison-reader.mjs', 'tests/completed-history-comparison.test.mjs', 'tests/completed-history-comparison-reader.test.mjs', 'tests/completed-history-comparison-transport.test.mjs', 'skills/speediance-coach/references/completed-history-comparison.md', 'skills/speediance-coach/references/tools-reference.md', 'tests/tools-reference.test.mjs', 'completed-exercise-history.mjs', 'completed-setting-codes.mjs', 'tests/completed-setting-codes.test.mjs', 'tests/completed-session-reader.test.mjs', 'tests/completed-exercise-history.test.mjs',
  'THIRD_PARTY_NOTICES.md', 'skills/speediance-coach/references/reference-client-feature-parity.md', 'skills/speediance-coach/references/speediance-api-knowledge.md'
)
$requiredFiles = @($requiredFiles | Where-Object { $_ -notlike 'tests/*' })
$missingRequired = @($requiredFiles | Where-Object { $relativeFiles -notcontains $_ })
$missingParityModule = @('template-capacity.mjs' | Where-Object { $relativeFiles -notcontains $_ })
$missingDeloadFiles = @(@('deload-load-policy.mjs', 'tests/deload-load-policy.test.mjs') | Where-Object { $relativeFiles -notcontains $_ })
if ($missingParityModule.Count -gt 0) { throw 'Canonical package list is missing template-capacity.mjs.' }
if ($missingDeloadFiles.Count -gt 0) { throw "Canonical package list is missing deload policy files: $($missingDeloadFiles -join ', ')" }
if ($missingRequired.Count -gt 0) {
  throw "Canonical package list is missing required files: $($missingRequired -join ', ')"
}

function Copy-PluginFiles {
  foreach ($relative in $relativeFiles) {
    $source = Join-Path $pluginRoot $relative
    if (-not (Test-Path -LiteralPath $source -PathType Leaf)) { throw "Missing GM Coach file: $relative" }
    $target = Join-Path $stagingDirectory $relative
    New-Item -ItemType Directory -Path (Split-Path -Parent $target) -Force | Out-Null
    Copy-Item -LiteralPath $source -Destination $target -Force
  }
}

function Test-PluginCacheCurrent {
  param([Parameter(Mandatory)][string]$CacheDirectory)

  if (-not (Test-Path -LiteralPath $CacheDirectory -PathType Container)) { return $false }
  $cachedManifestPath = Join-Path $CacheDirectory 'plugin.json'
  if (-not (Test-Path -LiteralPath $cachedManifestPath -PathType Leaf)) { return $false }
  try { $cachedManifest = Get-Content -LiteralPath $cachedManifestPath -Raw | ConvertFrom-Json }
  catch { return $false }
  if ($cachedManifest.name -ne 'gm-coach' -or $cachedManifest.version -ne $installedVersion) { return $false }
  if (-not (Test-Path -LiteralPath (Join-Path $CacheDirectory 'runtime\node.exe') -PathType Leaf) -or
      -not (Test-Path -LiteralPath (Join-Path $CacheDirectory 'node_modules\@napi-rs\keyring') -PathType Container)) {
    return $false
  }
  foreach ($relative in $relativeFiles) {
    $installedFile = Join-Path $pluginDirectory $relative
    $cachedFile = Join-Path $CacheDirectory $relative
    if (-not (Test-Path -LiteralPath $installedFile -PathType Leaf) -or
        -not (Test-Path -LiteralPath $cachedFile -PathType Leaf)) { return $false }
    if ((Get-FileHash -LiteralPath $installedFile -Algorithm SHA256).Hash -ne
        (Get-FileHash -LiteralPath $cachedFile -Algorithm SHA256).Hash) { return $false }
  }
  return $true
}

function Test-NodeProcessUsesDirectory {
  param(
    [Parameter(Mandatory)][object]$Process,
    [Parameter(Mandatory)][string]$Directory
  )

  $normalizedDirectory = [System.IO.Path]::GetFullPath($Directory).TrimEnd([char[]]@(
    [System.IO.Path]::DirectorySeparatorChar,
    [System.IO.Path]::AltDirectorySeparatorChar
  ))
  $directoryPrefix = $normalizedDirectory + [System.IO.Path]::DirectorySeparatorChar
  $executablePath = $null
  try {
    $reportedPath = [string]$Process.ExecutablePath
    if ($reportedPath -and [System.IO.Path]::IsPathRooted($reportedPath)) {
      $executablePath = [System.IO.Path]::GetFullPath($reportedPath)
    }
  } catch { }
  if ($executablePath -and $executablePath.StartsWith($directoryPrefix, [StringComparison]::OrdinalIgnoreCase)) {
    return $true
  }

  $commandLine = [string]$Process.CommandLine
  if ($commandLine -and $commandLine.IndexOf($directoryPrefix, [StringComparison]::OrdinalIgnoreCase) -ge 0) {
    return $true
  }
  return $false
}

function Get-ChecksumLine([string]$Path, [string]$FileName) {
  $escaped = [regex]::Escape($FileName)
  $line = Get-Content -LiteralPath $Path | Where-Object { $_ -match "^([A-Fa-f0-9]{64})\s+\*?$escaped\s*$" } | Select-Object -First 1
  if (-not $line) { throw "No SHA-256 checksum was published for $FileName." }
  return [regex]::Match($line, '^[A-Fa-f0-9]{64}').Value.ToUpperInvariant()
}

function Assert-Checksum([string]$Path, [string]$Expected) {
  $actual = (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToUpperInvariant()
  if ($actual -ne $Expected) { throw "SHA-256 verification failed for $(Split-Path -Leaf $Path)." }
}

function Set-McpRuntime([string]$Path, [string]$CliCommand) {
  if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) { return }
  $config = Get-Content -LiteralPath $Path -Raw | ConvertFrom-Json
  if (-not $config.mcpServers.'gm-coach') { throw "GM Coach MCP entry is missing in $Path." }
  $server = $config.mcpServers.'gm-coach'
  # Agent Plugins accepts only a bare executable name or a path contained in the plugin.
  # Keep these paths relative to the plugin root; absolute executable paths are rejected.
  $server.command = './runtime/node.exe'
  $server.args = @('./mcp_server.mjs')
  $server.cwd = '${PLUGIN_ROOT}'
  if (-not $server.env) { $server | Add-Member -NotePropertyName env -NotePropertyValue ([PSCustomObject]@{}) }
  if ($server.env.PSObject.Properties.Name -contains 'SPEEDIANCE_CLI') {
    $server.env.SPEEDIANCE_CLI = $CliCommand
  } else {
    $server.env | Add-Member -NotePropertyName SPEEDIANCE_CLI -NotePropertyValue $CliCommand
  }
  if ($server.env.PSObject.Properties.Name -contains 'PLUGIN_DATA') {
    $server.env.PSObject.Properties.Remove('PLUGIN_DATA')
  }
  $json = $config | ConvertTo-Json -Depth 100
  [System.IO.File]::WriteAllText($Path, $json, [System.Text.UTF8Encoding]::new($false))
}

# GM_COACH_MCP_ENTRY_CLASSIFIER_START
function Get-NormalizedMcpPath([string]$Path) {
  if (-not $Path -or $Path -notmatch '^(?:[A-Za-z]:[\\/]|\\\\[^\\]+\\[^\\]+[\\/])') { return '' }
  try { return [System.IO.Path]::GetFullPath($Path).TrimEnd('\', '/').ToUpperInvariant() }
  catch { return '' }
}

function Get-GmCoachMcpEntryState($Entry, [string]$PluginRoot, [string]$NodeCommand, [string]$CliCommand, [string]$PluginData) {
  if (-not $Entry.transport -or $Entry.transport.type -ne 'stdio') { return 'name-conflict' }
  $serverPath = Get-NormalizedMcpPath (Join-Path $PluginRoot 'mcp_server.mjs')
  $serverArgs = @($Entry.transport.args | ForEach-Object { [string]$_ })
  $knownServerPath = @($serverArgs | Where-Object { (Get-NormalizedMcpPath $_) -eq $serverPath }).Count -gt 0
  if (-not $knownServerPath) { return 'name-conflict' }

  # The exact installed server path is the ownership proof. A generic mcp_server.mjs
  # filename or a speediance-cli basename alone is not enough to replace another MCP.
  $transport = $Entry.transport
  $env = $transport.env
  $envVars = @($transport.env_vars)
  $envNames = @($env.PSObject.Properties.Name)
  $exactMatch =
    ((Get-NormalizedMcpPath ([string]$transport.command)) -eq (Get-NormalizedMcpPath $NodeCommand)) -and
    ($serverArgs.Count -eq 1) -and
    ((Get-NormalizedMcpPath $serverArgs[0]) -eq $serverPath) -and
    ((Get-NormalizedMcpPath ([string]$env.PLUGIN_DATA)) -eq (Get-NormalizedMcpPath $PluginData)) -and
    ((Get-NormalizedMcpPath ([string]$env.SPEEDIANCE_CLI)) -eq (Get-NormalizedMcpPath $CliCommand)) -and
    ($envNames.Count -eq 2) -and
    ($envNames -contains 'PLUGIN_DATA') -and
    ($envNames -contains 'SPEEDIANCE_CLI') -and
    ($envVars.Count -eq 0) -and
    ($null -eq $transport.cwd)
  if ($exactMatch) { return 'exact-match' }
  return 'stale-gm-coach'
}
# GM_COACH_MCP_ENTRY_CLASSIFIER_END

function Register-GlobalGmCoachMcp($CodexCommand, [string]$CodexHome, [string]$PluginRoot, [string]$NodeCommand, [string]$CliCommand, [string]$PluginData) {
  if (-not $CodexCommand) { return 'cli-missing' }
  $previousCodexHome = $env:CODEX_HOME
  try {
    $env:CODEX_HOME = $CodexHome
    $listOutput = & $CodexCommand.Source mcp list --json 2>$null
    if ($LASTEXITCODE -ne 0) { return 'inspect-failed' }
    try { $servers = @($listOutput -join "`n" | ConvertFrom-Json -ErrorAction Stop) }
    catch { return 'inspect-failed' }

    $existing = @($servers | Where-Object { $_.name -eq 'gm_coach_local' } | Select-Object -First 1)
    $resultStatus = 'registered'
    if ($existing.Count -gt 0) {
      $entryState = Get-GmCoachMcpEntryState $existing[0] $PluginRoot $NodeCommand $CliCommand $PluginData
      if ($entryState -eq 'exact-match') {
        return 'exact-match'
      }
      if ($entryState -eq 'name-conflict') { return 'name-conflict' }
      $resultStatus = 'updated'
    }

    $registerArgs = @(
      'mcp', 'add', 'gm_coach_local',
      '--env', "PLUGIN_DATA=$PluginData",
      '--env', "SPEEDIANCE_CLI=$CliCommand",
      '--', $NodeCommand, (Join-Path $PluginRoot 'mcp_server.mjs')
    )
    & $CodexCommand.Source @registerArgs 2>$null | Out-Null
    if ($LASTEXITCODE -ne 0) { return 'registration-failed' }

    # codex mcp add upserts this one name. Verify the resulting record before
    # claiming that registration or repair succeeded.
    $verificationOutput = & $CodexCommand.Source mcp list --json 2>$null
    if ($LASTEXITCODE -ne 0) { return 'registration-failed' }
    try { $verifiedServers = @($verificationOutput -join "`n" | ConvertFrom-Json -ErrorAction Stop) }
    catch { return 'registration-failed' }
    $verified = @($verifiedServers | Where-Object { $_.name -eq 'gm_coach_local' } | Select-Object -First 1)
    if ($verified.Count -eq 0) { return 'registration-failed' }
    if ((Get-GmCoachMcpEntryState $verified[0] $PluginRoot $NodeCommand $CliCommand $PluginData) -ne 'exact-match') {
      return 'registration-failed'
    }
    return $resultStatus
  }
  catch { return 'registration-failed' }
  finally {
    if ($null -eq $previousCodexHome) { Remove-Item Env:\CODEX_HOME -ErrorAction SilentlyContinue }
    else { $env:CODEX_HOME = $previousCodexHome }
  }
}

function Get-PluginDataDirectory([string]$CodexHome) {
  $legacyRoot = Join-Path $CodexHome 'plugins\data\agent-plugins'
  $existing = @()
  if (Test-Path -LiteralPath $legacyRoot -PathType Container) {
    $legacyRootItem = Get-Item -LiteralPath $legacyRoot -Force
    if (($legacyRootItem.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0) {
      throw 'GM Coach legacy data root is a symbolic link or junction. Update stopped to protect local data.'
    }
    foreach ($candidate in Get-ChildItem -LiteralPath $legacyRoot -Directory -Force) {
      if (($candidate.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0) {
        throw 'GM Coach legacy data directory contains a symbolic link or junction. Update stopped to protect local data.'
      }
      $accountsPath = Join-Path $candidate.FullName 'accounts'
      if (-not (Test-Path -LiteralPath $accountsPath -PathType Container)) { continue }
      $markers = @(Get-ChildItem -LiteralPath $accountsPath -Recurse -File -ErrorAction SilentlyContinue |
        Where-Object { $_.Name -in @('speediance-config.json', 'training-profile.json') } |
        Select-Object -First 1)
      if ($markers.Count -gt 0) { $existing += $candidate.FullName }
    }
  }
  if ($existing.Count -gt 1) {
    throw 'Found more than one existing GM Coach data directory. Update stopped to protect account data.'
  }
  $dataDirectory = if ($existing.Count -eq 1) { $existing[0] } else { Join-Path $CodexHome 'plugins\data\gm-coach' }
  $homeFullPath = [System.IO.Path]::GetFullPath($CodexHome).TrimEnd('\', '/')
  $scanPath = [System.IO.Path]::GetFullPath($dataDirectory)
  while ($scanPath.StartsWith($homeFullPath, [System.StringComparison]::OrdinalIgnoreCase)) {
    if (Test-Path -LiteralPath $scanPath) {
      $dataItem = Get-Item -LiteralPath $scanPath -Force
      if (($dataItem.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0) {
        throw 'GM Coach data path contains a symbolic link or junction. Update stopped to protect local data.'
      }
    }
    if ($scanPath.Equals($homeFullPath, [System.StringComparison]::OrdinalIgnoreCase)) { break }
    $parentPath = Split-Path -Parent $scanPath
    if (-not $parentPath -or $parentPath.Equals($scanPath, [System.StringComparison]::OrdinalIgnoreCase)) { break }
    $scanPath = $parentPath
  }
  if (-not $scanPath.Equals($homeFullPath, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw 'GM Coach data directory resolves outside CODEX_HOME.'
  }
  New-Item -ItemType Directory -Path $dataDirectory -Force | Out-Null
  return [System.IO.Path]::GetFullPath($dataDirectory)
}

if ((Test-Path -LiteralPath $pluginDirectory) -and -not $Update) {
  throw "GM Coach is already installed at $pluginDirectory. Rerun with -Update to refresh it."
}

$homeUri = [Uri]::new($homeDirectory.TrimEnd('\') + '\')
$pluginUri = [Uri]::new($pluginDirectory.TrimEnd('\') + '\')
$relativePluginPath = [Uri]::UnescapeDataString($homeUri.MakeRelativeUri($pluginUri).ToString())
if ($relativePluginPath.StartsWith('../', [System.StringComparison]::Ordinal)) {
  throw 'CODEX_HOME points outside your home folder. Set it to a location under your home folder, then rerun setup.'
}
$relativePluginPath = './' + $relativePluginPath

$homeFullPath = [System.IO.Path]::GetFullPath($homeDirectory).TrimEnd('\', '/')
$scanPath = [System.IO.Path]::GetFullPath($pluginParentDirectory)
while ($true) {
  if (Test-Path -LiteralPath $scanPath) {
    $item = Get-Item -LiteralPath $scanPath -Force
    if (($item.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0) {
      throw "Plugin install path crosses a symbolic link or junction: $scanPath. Choose a normal directory under your home folder."
    }
  }
  if ($scanPath.Equals($homeFullPath, [System.StringComparison]::OrdinalIgnoreCase)) { break }
  $parentPath = Split-Path -Parent $scanPath
  if (-not $parentPath -or $parentPath.Equals($scanPath, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw 'Could not verify the plugin install path under your home folder.'
  }
  $scanPath = $parentPath
}
if (Test-Path -LiteralPath $pluginDirectory) {
  $existingPlugin = Get-Item -LiteralPath $pluginDirectory -Force
  if (($existingPlugin.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0) {
    throw "GM Coach install path is a symbolic link or junction: $pluginDirectory. Move it aside and rerun setup."
  }
}

$missing = @($relativeFiles | Where-Object { -not (Test-Path -LiteralPath (Join-Path $pluginRoot $_) -PathType Leaf) })
if ($missing.Count) { throw "Missing required files: $($missing -join ', ')" }
try {
  New-Item -ItemType Directory -Path $pluginParentDirectory -Force | Out-Null
  New-Item -ItemType Directory -Path $stagingDirectory -Force | Out-Null
  New-Item -ItemType Directory -Path $temporaryDirectory -Force | Out-Null
  Copy-PluginFiles
  foreach ($dependencyDirectory in @((Join-Path $stagingDirectory 'runtime'), (Join-Path $stagingDirectory 'bin'))) {
    if (Test-Path -LiteralPath $dependencyDirectory) { throw "Package source unexpectedly includes generated runtime data: $dependencyDirectory" }
  }

  [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12
  $headers = @{ 'User-Agent' = 'GM-Coach-Installer'; 'Accept' = 'application/vnd.github+json' }
  $architecture = if ($env:PROCESSOR_ARCHITEW6432) { $env:PROCESSOR_ARCHITEW6432 } else { $env:PROCESSOR_ARCHITECTURE }
  $releaseArchitecture = if ($architecture -match 'ARM64') { 'arm64' } elseif ($architecture -match 'AMD64|x86_64') { 'x86_64' } else { throw "Unsupported Windows architecture: $architecture. GM Coach supports x64 and ARM64." }
  $nodeArchitecture = if ($releaseArchitecture -eq 'arm64') { 'arm64' } else { 'x64' }

  $nodeExecutable = Join-Path $runtimeDirectory 'node.exe'
  $nodeReady = $false
  $cliExecutable = Join-Path $binaryDirectory 'speediance-cli.exe'
  $cliReady = $false
  if ($Update -and -not $RefreshDependencies) {
    $existingNode = Join-Path $pluginDirectory 'runtime\node.exe'
    if (Test-Path -LiteralPath $existingNode -PathType Leaf) {
      $existingNodeVersion = (& $existingNode --version 2>$null | Select-Object -First 1)
      if ($existingNodeVersion -match '^v24\.\d+\.\d+$') {
        New-Item -ItemType Directory -Path $runtimeDirectory -Force | Out-Null
        Get-ChildItem -LiteralPath (Join-Path $pluginDirectory 'runtime') -Force |
          ForEach-Object { Copy-Item -LiteralPath $_.FullName -Destination $runtimeDirectory -Recurse -Force }
        $nodeReady = Test-Path -LiteralPath $nodeExecutable -PathType Leaf
        if ($nodeReady) { Write-Output "Reusing the installed Node.js 24 runtime ($existingNodeVersion)." }
      }
    }
    $existingCli = Join-Path $pluginDirectory 'bin\speediance-cli.exe'
    if (Test-Path -LiteralPath $existingCli -PathType Leaf) {
      New-Item -ItemType Directory -Path $binaryDirectory -Force | Out-Null
      Copy-Item -LiteralPath $existingCli -Destination $cliExecutable -Force
      $cliReady = Test-Path -LiteralPath $cliExecutable -PathType Leaf
      if ($cliReady) { Write-Output 'Reusing the installed Speediance CLI.' }
    }
    $existingNodeModules = Join-Path $pluginDirectory 'node_modules'
    if (Test-Path -LiteralPath $existingNodeModules -PathType Container) {
      Copy-Item -LiteralPath $existingNodeModules -Destination (Join-Path $stagingDirectory 'node_modules') -Recurse -Force
    }
  }
  if (-not $nodeReady) {
    Write-Output 'Downloading a private Node.js 24 LTS runtime and verifying its SHA-256...'
    $checksumsPath = Join-Path $temporaryDirectory 'node-SHA256SUMS.txt'
    Invoke-WebRequest -UseBasicParsing -Uri 'https://nodejs.org/dist/latest-v24.x/SHASUMS256.txt' -OutFile $checksumsPath
    $nodeLine = Get-Content -LiteralPath $checksumsPath | Where-Object { $_ -match "^([A-Fa-f0-9]{64})\s+\*?(node-v24\.\d+\.\d+-win-$nodeArchitecture\.zip)\s*$" } | Select-Object -First 1
    if (-not $nodeLine) { throw "Node.js 24 LTS does not publish a Windows $nodeArchitecture archive." }
    $nodeArchiveName = [regex]::Match($nodeLine, 'node-v24\.\d+\.\d+-win-[^\s]+\.zip').Value
    $nodeArchivePath = Join-Path $temporaryDirectory $nodeArchiveName
    Invoke-WebRequest -UseBasicParsing -Uri "https://nodejs.org/dist/latest-v24.x/$nodeArchiveName" -OutFile $nodeArchivePath
    Assert-Checksum $nodeArchivePath (Get-ChecksumLine $checksumsPath $nodeArchiveName)
    $nodeExtract = Join-Path $temporaryDirectory 'node-extracted'
    Expand-Archive -LiteralPath $nodeArchivePath -DestinationPath $nodeExtract -Force
    $nodeFolder = Get-ChildItem -LiteralPath $nodeExtract -Directory | Select-Object -First 1
    if (-not $nodeFolder -or -not (Test-Path -LiteralPath (Join-Path $nodeFolder.FullName 'node.exe'))) { throw 'The verified Node.js archive does not contain node.exe.' }
    New-Item -ItemType Directory -Path $runtimeDirectory -Force | Out-Null
    Get-ChildItem -LiteralPath $nodeFolder.FullName -Force | ForEach-Object { Copy-Item -LiteralPath $_.FullName -Destination $runtimeDirectory -Recurse -Force }
    if (-not (Test-Path -LiteralPath $nodeExecutable -PathType Leaf)) { throw 'Could not install the private Node.js runtime.' }
  }

  if (-not $cliReady) {
    Write-Output 'Downloading Speediance CLI and verifying the release SHA-256...'
    $release = Invoke-RestMethod -UseBasicParsing -Uri 'https://api.github.com/repos/stozo04/speediance-cli/releases/latest' -Headers $headers
    $archiveName = "speediance-cli_Windows_$releaseArchitecture.zip"
    $archiveAsset = $release.assets | Where-Object { $_.name -ieq $archiveName } | Select-Object -First 1
    $checksumAsset = $release.assets | Where-Object { $_.name -ieq 'checksums.txt' } | Select-Object -First 1
    if (-not $archiveAsset -or -not $checksumAsset) { throw "The latest speediance-cli release did not include $archiveName and checksums.txt." }
    $archivePath = Join-Path $temporaryDirectory $archiveName
    $cliChecksumsPath = Join-Path $temporaryDirectory 'cli-checksums.txt'
    Invoke-WebRequest -UseBasicParsing -Uri $archiveAsset.browser_download_url -OutFile $archivePath
    Invoke-WebRequest -UseBasicParsing -Uri $checksumAsset.browser_download_url -OutFile $cliChecksumsPath
    Assert-Checksum $archivePath (Get-ChecksumLine $cliChecksumsPath $archiveName)
    $cliExtract = Join-Path $temporaryDirectory 'cli-extracted'
    Expand-Archive -LiteralPath $archivePath -DestinationPath $cliExtract -Force
    $cliFile = Get-ChildItem -LiteralPath $cliExtract -Recurse -File -Filter 'speediance-cli.exe' | Select-Object -First 1
    if (-not $cliFile) { throw 'The verified Speediance CLI archive does not contain speediance-cli.exe.' }
    New-Item -ItemType Directory -Path $binaryDirectory -Force | Out-Null
    Copy-Item -LiteralPath $cliFile.FullName -Destination $cliExecutable -Force
  }

  $keyringArgs = @(
    (Join-Path $stagingDirectory 'scripts\install-keyring-runtime.mjs'),
    '--root', $stagingDirectory,
    '--platform', 'win32',
    '--arch', $nodeArchitecture
  )
  if ($RefreshDependencies) { $keyringArgs += '--force' }
  & $nodeExecutable @keyringArgs
  if ($LASTEXITCODE -ne 0) { throw 'Could not install the pinned Windows credential-store runtime.' }

  $installedNodeCommand = Join-Path $pluginDirectory 'runtime\node.exe'
  $installedCliCommand = Join-Path $pluginDirectory 'bin\speediance-cli.exe'
  $pluginDataDirectory = Get-PluginDataDirectory $codexHome
  Set-McpRuntime (Join-Path $stagingDirectory '.mcp.json') $installedCliCommand
  Set-McpRuntime (Join-Path $stagingDirectory 'mcp.json') $installedCliCommand

  New-Item -ItemType Directory -Path $marketplaceDirectory -Force | Out-Null
  if (Test-Path -LiteralPath $marketplacePath) {
    $marketplace = Get-Content -LiteralPath $marketplacePath -Raw | ConvertFrom-Json
  } else {
    $marketplace = [PSCustomObject]@{ name = 'personal'; interface = [PSCustomObject]@{ displayName = 'Personal' }; plugins = @() }
  }
  if (-not $marketplace.name) { $marketplace | Add-Member -NotePropertyName name -NotePropertyValue 'personal' }
  if (-not $marketplace.interface) { $marketplace | Add-Member -NotePropertyName interface -NotePropertyValue ([PSCustomObject]@{ displayName = 'Personal' }) }
  if (-not $marketplace.plugins) { $marketplace | Add-Member -NotePropertyName plugins -NotePropertyValue @() -Force }
  $entry = [PSCustomObject]@{
    name = 'gm-coach'
    source = [PSCustomObject]@{ source = 'local'; path = $relativePluginPath }
    policy = [PSCustomObject]@{ installation = 'AVAILABLE'; authentication = 'ON_INSTALL' }
    category = 'Health & Fitness'
  }
  $marketplace.plugins = @(@($marketplace.plugins | Where-Object { $_.name -ne 'gm-coach' }) + $entry)
  $marketplaceTempPath = Join-Path $marketplaceDirectory ('.marketplace.gm-coach-' + [guid]::NewGuid().ToString('N') + '.tmp')
  [System.IO.File]::WriteAllText($marketplaceTempPath, ($marketplace | ConvertTo-Json -Depth 100), [System.Text.UTF8Encoding]::new($false))

  $hadExistingPlugin = Test-Path -LiteralPath $pluginDirectory
  if ($hadExistingPlugin) { Move-Item -LiteralPath $pluginDirectory -Destination $backupDirectory }
  $promoted = $false
  try {
    Move-Item -LiteralPath $stagingDirectory -Destination $pluginDirectory
    $promoted = $true
    Move-Item -LiteralPath $marketplaceTempPath -Destination $marketplacePath -Force
  } catch {
    if ($promoted -and (Test-Path -LiteralPath $pluginDirectory)) { Remove-Item -LiteralPath $pluginDirectory -Recurse -Force }
    if ($hadExistingPlugin -and (Test-Path -LiteralPath $backupDirectory)) { Move-Item -LiteralPath $backupDirectory -Destination $pluginDirectory }
    throw
  }
  if ($hadExistingPlugin -and (Test-Path -LiteralPath $backupDirectory)) {
    # Recursive removal can delete unlocked JS before failing on a mapped native
    # module. A running MCP may still dynamically load files from this renamed
    # installation; process command lines alone do not establish non-use.
    # Keep this transaction's recovery copy until a separate verified orphan
    # sweep establishes safety. Retention alone does not solve disk accumulation.
    Write-Warning "The updated plugin is installed. Keeping the previous GM Coach files at $backupDirectory because file-use safety was not positively verified. Codex and MCP were not stopped or restarted."
  }
}
finally {
  foreach ($cleanupTarget in @(
    @{ Path = $temporaryDirectory; Recurse = $true },
    @{ Path = $stagingDirectory; Recurse = $true },
    @{ Path = $marketplaceTempPath; Recurse = $false }
  )) {
    if (-not $cleanupTarget.Path -or -not (Test-Path -LiteralPath $cleanupTarget.Path)) { continue }
    try {
      if ($cleanupTarget.Recurse) {
        Remove-Item -LiteralPath $cleanupTarget.Path -Recurse -Force -ErrorAction Stop
      } else {
        Remove-Item -LiteralPath $cleanupTarget.Path -Force -ErrorAction Stop
      }
    } catch {
      Write-Warning "Could not remove GM Coach installer temporary path: $($cleanupTarget.Path)"
    }
  }
}

Write-Output 'GM Coach local plugin files were installed. Tool availability in the requested chat has not been verified. Any dependencies downloaded in this run passed SHA-256 verification.'
Write-Output "Plugin folder: $pluginDirectory"
Write-Output "Marketplace file: $marketplacePath"
$codexCommand = Get-Command codex -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1
$globalMcpStatus = Register-GlobalGmCoachMcp $codexCommand $codexHome $pluginDirectory $installedNodeCommand $installedCliCommand $pluginDataDirectory
$pluginAdded = $false
$cacheAlreadyCurrent = $false
$installedVersion = (Get-Content -LiteralPath (Join-Path $pluginDirectory 'plugin.json') -Raw | ConvertFrom-Json).version
if ($installedVersion -match '^[A-Za-z0-9.+-]+$') {
  $cacheDirectory = Join-Path $codexHome "plugins\cache\personal\gm-coach\$installedVersion"
  $cacheAlreadyCurrent = Test-PluginCacheCurrent -CacheDirectory $cacheDirectory
}
if ($cacheAlreadyCurrent) {
  $pluginAdded = $true
  Write-Output "The versioned Codex plugin cache already matches all packaged files ($installedVersion); activation was skipped."
} elseif ($codexCommand) {
  $previousCodexHome = $env:CODEX_HOME
  try {
    $env:CODEX_HOME = $codexHome
    & $codexCommand.Source plugin add gm-coach@personal --json
    $pluginAdded = ($LASTEXITCODE -eq 0)
    if ($pluginAdded) {
      $pluginAdded = Test-PluginCacheCurrent -CacheDirectory $cacheDirectory
      if (-not $pluginAdded) {
        Write-Warning "Codex returned success, but versioned cache $installedVersion is missing or differs from the installed package."
      }
    }
  } catch {
    Write-Warning 'Codex CLI did not complete automatic plugin activation.'
  } finally {
    if ($null -eq $previousCodexHome) { Remove-Item Env:\CODEX_HOME -ErrorAction SilentlyContinue }
    else { $env:CODEX_HOME = $previousCodexHome }
  }
}
switch ($globalMcpStatus) {
  'registered' { Write-Output 'Registered the user-level MCP server gm_coach_local. Registration is local configuration only; tool availability in the requested chat has not been verified.' }
  'exact-match' { Write-Output 'The existing user-level gm_coach_local MCP configuration matches the installed GM Coach server, CLI, and data directory.' }
  'updated' { Write-Output 'Updated the recognized stale GM Coach entry gm_coach_local and verified its server, CLI, and data directory.' }
  'name-conflict' { Write-Warning 'An MCP entry named gm_coach_local already exists. Its server identity could not be verified, so it was left unchanged; the GM Coach plugin package was installed separately.' }
  'cli-missing' { Write-Warning 'Codex CLI was not found. Plugin files and the Personal marketplace entry are ready, but automatic plugin activation and the global gm_coach_local MCP registration were skipped.' }
  'inspect-failed' { Write-Warning 'Codex CLI could not list MCP servers, so the installer did not risk creating a duplicate gm_coach_local entry.' }
  default { Write-Warning 'Codex CLI could not register gm_coach_local. The plugin installation remains available; global MCP registration did not complete.' }
}
if ($pluginAdded) {
  Write-Output 'The Codex plugin cache is current. Attachment of its coaching instructions and bundled gm-coach MCP to the requested chat has not been verified; global gm_coach_local is a separate local connection.'
} else {
  Write-Output "ERROR: GM Coach plugin files and Personal marketplace entry were installed, but activation of versioned cache $installedVersion could not be confirmed. The update is incomplete; the previous plugin files were preserved. Retry with the supported Codex plugin manager after resolving the access error."
  exit 1
}
Write-Output 'If GM Coach tools are missing, first verify the tool catalogue and supported controls in that specific chat and application. Only when that application exposes a restart control for the observed GM Coach server, restart that exact server (bundled gm-coach or global gm_coach_local) and open a new chat. This installer does not verify attachment to any chat and does not restart Codex Desktop.'













# Sprzatanie po udanej instalacji: jedna kopia zapasowa i dwie wersje w cache (biezaca i poprzednia).
# Katalogi, z ktorych dzialaja procesy node (MCP, tunel), nigdy nie sa usuwane.
if ($pluginAdded) {
  try {
    $inUse = @(Get-CimInstance Win32_Process -Filter "Name='node.exe'" -ErrorAction Stop | ForEach-Object {
      [pscustomobject]@{ ExecutablePath = [string]$_.ExecutablePath; CommandLine = [string]$_.CommandLine }
    })
    $isInUse = { param($dir) foreach ($process in $inUse) { if (Test-NodeProcessUsesDirectory -Process $process -Directory $dir) { return $true } }; return $false }
    $backups = @(Get-ChildItem -LiteralPath $pluginParentDirectory -Directory -Force -Filter '.gm-coach-backup-*' -ErrorAction SilentlyContinue | Sort-Object LastWriteTime -Descending)
    foreach ($old in ($backups | Select-Object -Skip 1)) {
      if (& $isInUse $old.FullName) { Write-Warning "Kopia $($old.FullName) jest uzywana przez proces node; pozostawiona."; continue }
      try { Remove-Item -LiteralPath $old.FullName -Recurse -Force -ErrorAction Stop } catch { Write-Warning "Nie usunieto kopii $($old.FullName)." }
    }
    $cacheRoot = Join-Path $codexHome 'plugins\cache\personal\gm-coach'
    if (Test-Path -LiteralPath $cacheRoot) {
      $versions = @(Get-ChildItem -LiteralPath $cacheRoot -Directory | Sort-Object LastWriteTime -Descending)
      $keep = @($versions | Where-Object { $_.Name -eq $installedVersion } | Select-Object -First 1) + @($versions | Where-Object { $_.Name -ne $installedVersion } | Select-Object -First 1)
      foreach ($old in $versions) {
        if ($keep.FullName -contains $old.FullName) { continue }
        if (& $isInUse $old.FullName) { Write-Warning "Wersja $($old.Name) jest uzywana przez proces node; pozostawiona."; continue }
        try { Remove-Item -LiteralPath $old.FullName -Recurse -Force -ErrorAction Stop } catch { Write-Warning "Nie usunieto wersji $($old.Name) z cache." }
      }
    }
  } catch { Write-Warning 'Sprzatanie starych kopii GM Coach pominiete: nie udalo sie sprawdzic procesow node.' }
}
