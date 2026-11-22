param(
  [string]$OutputPath = (Join-Path (Split-Path -Parent (Split-Path -Parent (Split-Path -Parent $PSScriptRoot))) 'gm-coach-share-cross-platform.zip'),
  [switch]$Overwrite
)

$ErrorActionPreference = 'Stop'
$pluginRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$outputFull = [System.IO.Path]::GetFullPath($OutputPath)
$outputParent = Split-Path -Parent $outputFull
$temporaryArchivePath = Join-Path $outputParent ('.gm-coach-package-' + [guid]::NewGuid().ToString('N') + '.tmp')
$pluginPrefix = $pluginRoot.TrimEnd([System.IO.Path]::DirectorySeparatorChar, [System.IO.Path]::AltDirectorySeparatorChar) + [System.IO.Path]::DirectorySeparatorChar
if ($outputFull.StartsWith($pluginPrefix, [System.StringComparison]::OrdinalIgnoreCase)) {
  throw 'Output ZIP must be outside the plugin source folder.'
}
if ([System.IO.Path]::GetExtension($outputFull) -ine '.zip') {
  throw 'OutputPath must use the .zip extension.'
}
if ((Test-Path -LiteralPath $outputFull) -and -not $Overwrite) {
  throw "Output ZIP already exists: $outputFull. Pass -Overwrite to replace this generated package."
}

Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem
$filesManifestPath = Join-Path $pluginRoot 'scripts/plugin-files.txt'
if (-not (Test-Path -LiteralPath $filesManifestPath -PathType Leaf)) {
  throw "Missing canonical package file list: $filesManifestPath"
}
$relativeFiles = @(
  Get-Content -LiteralPath $filesManifestPath |
    ForEach-Object { $_.Trim() } |
    Where-Object { $_ -and -not $_.StartsWith('#') }
)
if ($relativeFiles -cnotcontains 'skills/speediance-coach/instructions-completed.md') { throw 'Missing mandatory completed-session routing module.' }
if ($relativeFiles.Count -eq 0) { throw 'The canonical package file list is empty.' }
if (@($relativeFiles | Select-Object -Unique).Count -ne $relativeFiles.Count) {
  throw 'The canonical package file list contains duplicate paths.'
}
foreach ($relative in $relativeFiles) {
  if ($relative -notmatch '^[A-Za-z0-9._/-]+$' -or $relative -match '(^|/)\.\.(/|$)' -or
      $relative -match '(^|/)(accounts?|config\.json|\.env|runtime|bin|node_modules|\.git|[^/]*token[^/]*)(/|$)') {
    throw "Unsafe or private path in canonical package file list: $relative"
  }
  $sourcePath = [System.IO.Path]::GetFullPath((Join-Path $pluginRoot $relative))
  if (-not $sourcePath.StartsWith($pluginPrefix, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "Package path escapes the plugin folder: $relative"
  }
}
$requiredFiles = @(
  'completed-session-batch.mjs', 'tests/completed-session-batch.test.mjs',
  '.codex-plugin/plugin.json', 'assets/gm-coach-icon.svg', '.mcp.json', 'mcp.json',
  'plugin.json', 'mcp_server.mjs', 'exercise-candidate-index.mjs', 'tests/exercise-candidate-index.test.mjs', 'science-guidance-index.mjs', 'tests/science-guidance-index.test.mjs', 'plugin-data-directory.mjs', 'cli-runtime.mjs', 'auth-diagnostics.mjs', 'equipment-inventory.mjs', 'exercise-library.mjs', 'exercise-statistics.mjs', 'preset-mapping.mjs', 'goal-preset-routing.mjs', 'program-payload.mjs', 'program-serialization.mjs', 'superset-serialization.mjs', 'program-calendar.mjs', 'saved-templates.mjs', 'saved-template-list.mjs', 'saved-template-unit-memory.mjs', 'training-evidence.mjs', 'training-research.mjs', 'research-batch-projection.mjs', 'tests/research-batch-projection.test.mjs', 'unit-interpretation.mjs', 'workout-data.mjs', 'session-recovery.mjs', 'credential-store.mjs', 'native-login.mjs', 'workout-json-interop.mjs', 'imported-rm-selector-policy.mjs', 'tests/imported-rm-selector-policy.test.mjs', 'portable-plan-codec.mjs', 'portable-source-schema.mjs', 'tests/portable-plan-codec.test.mjs', 'portable-source-adapter.mjs', 'portable-shared-plan.mjs', 'shared-plan-artifact-store.mjs', 'tests/shared-plan-artifact-store.test.mjs', 'tests/portable-shared-plan.test.mjs', 'retained-portable-source.mjs', 'saved-source-reconstruction.mjs', 'saved-execution-match.mjs', 'tests/saved-execution-match.test.mjs', 'tests/saved-export-roundtrip.test.mjs', 'saved-presentation.mjs', 'saved-response-header-diagnostics.mjs', 'saved-preset-display-page.mjs', 'saved-preset-read-scope.mjs', 'tests/saved-preset-display-page.test.mjs', 'tests/saved-header-fixture.mjs', 'tests/saved-response-header-diagnostics.test.mjs', 'imported-candidate-completion.mjs', 'tests/imported-candidate-completion.test.mjs', 'tests/retained-portable-source.test.mjs', 'tests/portable-source-adapter.test.mjs', 'tests/portable-public-dispatch.test.mjs', 'tests/portable-full-stdio.test.mjs', 'tests/shared-plan-instructions.test.mjs', 'native-workout-reader.mjs', 'completed-calendar-identity.mjs', 'tests/completed-calendar-identity.test.mjs', 'tests/completed-calendar-dispatch.test.mjs', 'tests/athlete-history-coverage.test.mjs', 'tests/session-date-binding.test.mjs', 'tests/saved-edit-disclosure.test.mjs', 'tests/history-range-report.test.mjs', 'tests/today-resilience.test.mjs', 'native-health-reader.mjs', 'bounded-read-batch.mjs', 'tests/bounded-health-batch.test.mjs', 'tests/bounded-health-transport.test.mjs', 'recovery-context.mjs', 'tests/recovery-context.test.mjs', 'tests/recovery-context-integration.test.mjs', 'tests/recovery-fixture.mjs', 'tests/native-health-reader.test.mjs', 'tests/reported-health-dispatch.test.mjs', 'native-workout-summary.mjs', 'profile-secret-storage.mjs', 'account-readiness.mjs', 'coaching-profile.mjs', 'coaching-memory.mjs', 'accessory-requirement-confirmation.mjs', 'coaching-memory-lock.mjs', 'preference-compliance.mjs', 'speediance-throttle.mjs', 'server-log.mjs', 'equipment-order.mjs', 'tests/equipment-order-real.test.mjs', 'tests/server-log.test.mjs', 'tests/speediance-throttle.test.mjs', 'reported-session-summary.mjs', 'tests/reported-session-summary-public.test.mjs', 'period-statistics.mjs', 'tests/period-statistics-public.test.mjs', 'sketch-time.mjs', 'compact-sketch.mjs', 'tests/compact-sketch.test.mjs', 'tests/sketch-time.test.mjs', 'tests/sketch-time-dispatch.test.mjs', 'tests/account-unit-conflict.test.mjs', 'time-budget.mjs', 'tests/time-budget.test.mjs', 'tests/time-budget-public-preview.test.mjs', 'tests/time-budget-late-transport.test.mjs', 'tests/preference-compliance.test.mjs', 'reviewed-plan-record.mjs', 'tests/reviewed-plan-record.test.mjs', 'reviewed-plan-store.mjs', 'tests/reviewed-plan-store.test.mjs', 'cycle-draft-store.mjs', 'cycle-continuation-identity.mjs', 'tests/cycle-continuation-identity.test.mjs', 'tests/cycle-continuation-process.test.mjs', 'tests/fixtures/continuation-process-worker.mjs', 'scalable-cycle-dispatch.mjs', 'bounded-cycle-json.mjs', 'streaming-cycle-preparation.mjs', 'tests/cycle-draft-store.test.mjs', 'tests/scientific-cycle-fixture.mjs', 'training-cycle-executor.mjs', 'tests/training-cycle-executor.test.mjs', 'training-cycle-prescription.mjs', 'tests/training-cycle-prescription.test.mjs', 'tests/training-cycle-preview.test.mjs', 'tests/model-plan-ledger-instructions.test.mjs', 'tests/fixtures/skill-instructions.mjs', 'training-cycle-audit.mjs', 'cycle-style-compliance.mjs', 'tests/training-cycle-audit.test.mjs', 'training-schedule-pattern.mjs', 'tests/training-schedule-pattern.test.mjs', 'injury-safety.mjs', 'equipment-plan-safety.mjs', 'athlete-context.mjs', 'REFERENCE_CLIENT_PARITY_AUDIT.md', 'README.md', 'SKILL.md', 'instructions-core.md', 'instructions-account.md', 'instructions-history.md', 'instructions-catalog.md', 'instructions-design.md', 'instructions-cycle.md', 'instructions-write.md', 'skills/speediance-coach/instructions-core.md', 'skills/speediance-coach/instructions-account.md', 'skills/speediance-coach/instructions-history.md', 'skills/speediance-coach/instructions-catalog.md', 'skills/speediance-coach/instructions-design.md', 'skills/speediance-coach/instructions-cycle.md', 'skills/speediance-coach/instructions-sharing.md', 'skills/speediance-coach/instructions-write.md', 'skills/training-science/instructions-core.md', 'skills/training-science/instructions-science.md',
  'tests/injury-safety.test.mjs', 'tests/equipment-plan-safety.test.mjs', 'tests/equipment-inventory.test.mjs', 'tests/coaching-profile.test.mjs', 'tests/coaching-memory.test.mjs', 'tests/installer-cleanup.test.mjs', 'tests/auth-diagnostics.test.mjs', 'tests/session-displacement-diagnostics.test.mjs', 'tests/saved-template-unit-memory.test.mjs', 'tests/saved-template-list.test.mjs', 'tests/saved-template-page-observation.test.mjs', 'tests/accessory-confirmation-full-dispatch.test.mjs', 'tests/training-volume.test.mjs', 'tests/goal-preset-routing.test.mjs', 'tests/load-type-movement-kind.test.mjs',
  'scripts/plugin-files.txt', 'scripts/keyring-runtime.json', 'scripts/install-keyring-runtime.mjs', 'scripts/install-codex-desktop.ps1',
  'scripts/install-codex-desktop.bat', 'scripts/install-codex-desktop.sh',
  'scripts/install-codex-desktop.command',
  'training-volume.mjs', 'smart-rm-readiness.mjs', 'tests/smart-rm-readiness.test.mjs',
  'tests/smart-rm-model-contract.test.mjs', 'tests/scientific-saved-edit.test.mjs', 'tests/saved-edit-late-expiry.test.mjs', 'tests/write-approval-replay.test.mjs', 'tests/load-readback-parity.test.mjs', 'tests/fixed-kg-account-units.test.mjs', 'tests/customize-preview-load.test.mjs', 'official-course-reservation.mjs', 'tests/official-course-reservation.test.mjs', 'tests/static-protocol-saved-roundtrip.test.mjs', 'tests/static-protocol-presentation.test.mjs', 'STATIC_PROTOCOL_MCP_AUDIT.md', 'static-load-protocol.mjs', 'static-protocol-context.mjs', 'tests/static-protocol-context.test.mjs', 'tests/workout-cable-display.test.mjs', 'tests/vita-history-semantics.test.mjs', 'tests/saved-vita-readback.test.mjs', 'tests/unilateral-evidence-binding.test.mjs', 'tests/saved-side-presentation.test.mjs', 'tests/unilateral-mcp-roundtrip.test.mjs', 'tests/unilateral-prescription.test.mjs', 'unilateral-prescription.mjs', 'tests/static-load-protocol.test.mjs', 'REFERENCE_CLIENT_UPSTREAM_CONFLICTS.md', 'AUTH_CLIENT_IDENTITY_AUDIT.md', 'saved-plan-identity.mjs', 'tests/saved-plan-identity.test.mjs', 'tests/duplicate-unit-memory.test.mjs', 'saved-edit-diff.mjs', 'tests/saved-edit-diff.test.mjs', 'tests/saved-schedule-science.test.mjs', 'executable-plan-sections.mjs', 'tests/executable-plan-sections.test.mjs', 'tests/executable-plan-sections-serialization.test.mjs', 'tests/training-evidence.test.mjs', 'tests/superset-serialization.test.mjs', 'tests/duplicate-saved-patches.test.mjs', 'official-courses.mjs', 'tests/official-courses.test.mjs', 'official-programs.mjs', 'tests/official-programs.test.mjs', 'tests/official-program-day-dispatch.test.mjs', 'static-load-wire-units.mjs', 'tests/static-load-wire-units.test.mjs', 'static-load-limits.mjs', 'tests/static-load-limits.test.mjs', 'cable-load-telemetry.mjs', 'tests/cable-load-telemetry.test.mjs', 'load-channel-presentation.mjs', 'tests/load-channel-presentation.test.mjs', 'free-lift-data.mjs', 'tests/free-lift-data.test.mjs', 'completed-session-reader.mjs', 'session-heart-rate.mjs', 'session-rowing-telemetry.mjs', 'tests/session-rowing-telemetry.test.mjs', 'tests/session-rowing-dispatch.test.mjs', 'tests/session-rowing-transport.test.mjs', 'tests/session-heart-rate.test.mjs', 'tests/session-heart-dispatch.test.mjs', 'tests/session-heart-transport.test.mjs', 'completed-history-comparison.mjs', 'completed-history-comparison-reader.mjs', 'tests/completed-history-comparison.test.mjs', 'tests/completed-history-comparison-reader.test.mjs', 'tests/completed-history-comparison-transport.test.mjs', 'skills/speediance-coach/references/completed-history-comparison.md', 'skills/speediance-coach/references/tools-reference.md', 'tests/tools-reference.test.mjs', 'completed-exercise-history.mjs', 'completed-setting-codes.mjs', 'tests/completed-setting-codes.test.mjs', 'tests/completed-session-reader.test.mjs', 'tests/completed-exercise-history.test.mjs',
  'skills/speediance-coach/instructions-plan-cycle.generated.md', 'skills/training-science/instructions-plan-cycle.md', 'scripts/plan-cycle-atoms.json', 'scripts/generate-plan-cycle.mjs', 'tests/plan-cycle-projection.test.mjs',
  'THIRD_PARTY_NOTICES.md', 'skills/speediance-coach/references/reference-client-feature-parity.md', 'skills/speediance-coach/references/speediance-api-knowledge.md'
)
$missingRequired = @($requiredFiles | Where-Object { $relativeFiles -notcontains $_ })
$missingParityModule = @('template-capacity.mjs' | Where-Object { $relativeFiles -notcontains $_ })
$missingDeloadFiles = @(@('deload-load-policy.mjs', 'tests/deload-load-policy.test.mjs') | Where-Object { $relativeFiles -notcontains $_ })
if ($missingParityModule.Count -gt 0) { throw 'Canonical package list is missing template-capacity.mjs.' }
if ($missingDeloadFiles.Count -gt 0) { throw "Canonical package list is missing deload policy files: $($missingDeloadFiles -join ', ')" }
if ($missingRequired.Count -gt 0) {
  throw "Canonical package list is missing required files: $($missingRequired -join ', ')"
}
$missingFiles = @($relativeFiles | Where-Object { -not (Test-Path -LiteralPath (Join-Path $pluginRoot $_) -PathType Leaf) })
if ($missingFiles.Count -gt 0) {
  throw "Missing required plugin files: $($missingFiles -join ', ')"
}

$portableManifest = Get-Content -LiteralPath (Join-Path $pluginRoot 'plugin.json') -Raw | ConvertFrom-Json
foreach ($relative in $relativeFiles) {
  if ($relative.EndsWith('.sh') -or $relative.EndsWith('.command')) {
    $shellBytes = [System.IO.File]::ReadAllBytes((Join-Path $pluginRoot $relative))
    if ($shellBytes -contains 13) {
      throw "Unix installer must use LF line endings before packaging: $relative"
    }
  }
}
$codexManifest = Get-Content -LiteralPath (Join-Path $pluginRoot '.codex-plugin/plugin.json') -Raw | ConvertFrom-Json
if ($portableManifest.name -ne $codexManifest.name -or $portableManifest.version -ne $codexManifest.version) {
  throw 'Root plugin.json and .codex-plugin/plugin.json must have the same name and version.'
}
if ($portableManifest.extensions.'com.openai'.interface.defaultPrompt.Length -gt 128 -or
    $codexManifest.interface.defaultPrompt.Length -gt 128) {
  throw 'GM Coach defaultPrompt must be 128 characters or fewer.'
}
if ($portableManifest.extensions.'com.openai'.interface.composerIcon -ne './assets/gm-coach-icon.svg' -or
    $codexManifest.interface.composerIcon -ne './assets/gm-coach-icon.svg') {
  throw 'Both plugin manifests must reference the packaged GM Coach icon.'
}

foreach ($mcpFile in @('.mcp.json', 'mcp.json')) {
  $mcpConfig = Get-Content -LiteralPath (Join-Path $pluginRoot $mcpFile) -Raw | ConvertFrom-Json
  $mcpServer = $mcpConfig.mcpServers.'gm-coach'
  if (-not $mcpServer -or $mcpServer.command -notmatch '^(node|\.\/[^\\/]+(?:\/[^\\/]+)*)$' -or
      @($mcpServer.args).Count -ne 1 -or $mcpServer.args[0] -cne './mcp_server.mjs' -or
      $mcpServer.cwd -notin @('.', '${PLUGIN_ROOT}') -or
      ($mcpServer.env -and $mcpServer.env.PSObject.Properties.Name -contains 'PLUGIN_DATA')) {
    throw "${mcpFile} must launch GM Coach with a bare Node command, a plugin-relative server path, and plugin-relative cwd."
  }
}

New-Item -ItemType Directory -Path $outputParent -Force | Out-Null
$archive = $null
try {
  $archive = [System.IO.Compression.ZipFile]::Open($temporaryArchivePath, [System.IO.Compression.ZipArchiveMode]::Create)
  foreach ($relative in $relativeFiles) {
    $sourcePath = Join-Path $pluginRoot $relative
    $entryName = "gm-coach/$($relative.Replace([char]92, [char]47))"
    $entry = [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile(
      $archive,
      $sourcePath,
      $entryName,
      [System.IO.Compression.CompressionLevel]::Optimal
    )
    if ($relative.EndsWith('.sh', [System.StringComparison]::OrdinalIgnoreCase) -or $relative.EndsWith('.command', [System.StringComparison]::OrdinalIgnoreCase)) {
      $entry.ExternalAttributes = -2115174400
    }
  }
}
finally {
  if ($archive) { $archive.Dispose() }
}
try {
  $archiveCheck = [System.IO.Compression.ZipFile]::OpenRead($temporaryArchivePath)
  try {
    $expectedEntries = @($relativeFiles | ForEach-Object { "gm-coach/$($_.Replace([char]92, [char]47))" })
    $actualEntries = @($archiveCheck.Entries | ForEach-Object { $_.FullName })
    if ($actualEntries.Count -ne $expectedEntries.Count) {
      throw 'The generated ZIP does not contain exactly the canonical package file list.'
    }
    for ($index = 0; $index -lt $expectedEntries.Count; $index++) {
      if ($actualEntries[$index] -cne $expectedEntries[$index]) {
        throw "Unexpected ZIP entry at position $index`: $($actualEntries[$index])"
      }
      $entry = $archiveCheck.Entries[$index]
      $entryStream = $entry.Open()
      $sha = [System.Security.Cryptography.SHA256]::Create()
      try {
        $entryHash = [BitConverter]::ToString($sha.ComputeHash($entryStream)).Replace('-', '')
      } finally {
        $sha.Dispose()
        $entryStream.Dispose()
      }
      $sourceHash = (Get-FileHash -LiteralPath (Join-Path $pluginRoot $relativeFiles[$index]) -Algorithm SHA256).Hash
      if ($entryHash -ine $sourceHash) {
        throw "ZIP content verification failed for $($relativeFiles[$index])."
      }
    }
  } finally {
    if ($archiveCheck) { $archiveCheck.Dispose() }
  }
  Move-Item -LiteralPath $temporaryArchivePath -Destination $outputFull -Force
} finally {
  if (Test-Path -LiteralPath $temporaryArchivePath) { Remove-Item -LiteralPath $temporaryArchivePath -Force }
}
Write-Output "Created package: $outputFull"












