<#
.SYNOPSIS
  GM Coach - aktualizator dla Claude Code (Windows) / updater for Claude Code (Windows).
.EXAMPLE
  powershell -NoProfile -ExecutionPolicy Bypass -File .\update-claude-windows.ps1
  powershell -NoProfile -ExecutionPolicy Bypass -File .\update-claude-windows.ps1 -Language en -CheckOnly
.NOTES
  Podmienia tylko pliki wtyczki w ~\.claude\gm-coach\marketplace\gm-coach. Zostaja: runtime Node, speediance-cli,
  node_modules (keyring), konfiguracja .mcp.json, dane i profil, haslo w Menedzerze poswiadczen.
  Kopia zapasowa + rollback przy bledzie. Nic nie jest pobierane z internetu.
  Replaces only the plugin files under ~\.claude\gm-coach\marketplace\gm-coach. Kept: Node runtime, speediance-cli,
  node_modules (keyring), the .mcp.json config, data and profile, the saved password. Backup + rollback on error.
  Nothing is downloaded.
  Kody wyjscia / exit codes: 0 OK, 1 blad (przywrocono) / error (restored), 2 nic do zrobienia / nothing to do,
  3 pliki zaktualizowane, ale polecenie 'claude plugin update' nie zadzialalo / files updated but 'claude plugin update'
  did not run, 4 zmieniono wymagane skladniki - uzyj pelnego instalatora / required components changed - use the full installer.
#>
param(
  [ValidateSet('pl', 'en', '')][string]$Language = '',
  [switch]$Force,
  [switch]$CheckOnly
)
$ErrorActionPreference = 'Stop'
if (-not $Language) {
  $Language = 'pl'
  if ([Environment]::UserInteractive -and -not $env:GM_COACH_NONINTERACTIVE) {
    $answer = Read-Host 'Jezyk / Language: [1] Polski  [2] English  (Enter = Polski)'
    if ($answer -match '^\s*(2|en|english|e)\s*$') { $Language = 'en' }
  }
}
$script:Lang = $Language
function T([string]$pl, [string]$en) { if ($script:Lang -eq 'en') { $en } else { $pl } }
function Write-Step([string]$t) { Write-Host "==> $t" -ForegroundColor Cyan }

$marketName = 'gm-coach-local'
$pluginId = "gm-coach@$marketName"
$userHome = if ($env:GM_COACH_TEST_HOME) { [IO.Path]::GetFullPath($env:GM_COACH_TEST_HOME) } else { [Environment]::GetFolderPath('UserProfile') }
$installRoot = Join-Path $userHome '.claude\gm-coach'
$marketDir = Join-Path $installRoot 'marketplace'
$pluginDir = Join-Path $marketDir 'gm-coach'
$packagePlugin = Join-Path $PSScriptRoot 'gm-coach'
$verifyScript = Join-Path $PSScriptRoot 'verify-server.mjs'
# Te katalogi i pliki zostaja na miejscu / these stay in place:
$preserve = @('runtime', 'bin', 'node_modules', '.mcp.json')

function Get-SemVer([string]$Version) { if ($Version -match '^(\d+)\.(\d+)\.(\d+)') { return [version]::new([int]$Matches[1], [int]$Matches[2], [int]$Matches[3]) } return $null }
function Read-Json([string]$Path) { if (Test-Path -LiteralPath $Path -PathType Leaf) { return Get-Content -LiteralPath $Path -Raw -Encoding UTF8 | ConvertFrom-Json } return $null }
function Find-ClaudeCli {
  $cmd = Get-Command claude -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($cmd) { return $cmd.Source }
  $roots = @(Join-Path $env:LOCALAPPDATA 'Claude-Data') | Where-Object { $_ -and (Test-Path -LiteralPath $_) }
  $found = foreach ($r in $roots) {
    Get-ChildItem -LiteralPath $r -Directory -ErrorAction SilentlyContinue | ForEach-Object {
      $cc = Join-Path $_.FullName 'claude-code'
      if (Test-Path -LiteralPath $cc) { Get-ChildItem -LiteralPath $cc -Recurse -Filter 'claude.exe' -File -ErrorAction SilentlyContinue }
    }
  }
  $best = $found | Sort-Object LastWriteTime -Descending | Select-Object -First 1
  if ($best) { return $best.FullName }
  $local = Join-Path $userHome '.local\bin\claude.exe'
  if (Test-Path -LiteralPath $local) { return $local }
  return $null
}

# ---------------------------------------------------------------- kontrole wstepne
$newManifest = Read-Json (Join-Path $packagePlugin 'plugin.json')
$newClaude = Read-Json (Join-Path $packagePlugin '.claude-plugin\plugin.json')
if (-not $newManifest -or -not $newClaude) { throw (T 'Brak folderu "gm-coach" obok aktualizatora. Rozpakuj cale archiwum ZIP.' 'The "gm-coach" folder is missing next to the updater. Extract the whole ZIP archive.') }
$newVersion = [string]$newClaude.version
$oldClaude = Read-Json (Join-Path $pluginDir '.claude-plugin\plugin.json')
if (-not $oldClaude) {
  Write-Host (T "Nie znaleziono zainstalowanego GM Coach dla Claude w $pluginDir. Aktualizator jest dla osob, ktore juz maja wtyczke. Uzyj instalatora (START-CLAUDE-WINDOWS.cmd). Jesli masz tylko rozszerzenie .mcpb w Claude Desktop, zainstaluj nowe .mcpb z instalatora." "GM Coach for Claude was not found in $pluginDir. The updater is for people who already have the plugin. Use the installer (START-CLAUDE-WINDOWS.cmd). If you only have the .mcpb extension in Claude Desktop, install the new .mcpb from the installer.") -ForegroundColor Yellow
  exit 2
}
$oldVersion = [string]$oldClaude.version
Write-Step (T "Zainstalowana wersja: $oldVersion; wersja w paczce: $newVersion" "Installed version: $oldVersion; version in this package: $newVersion")
$oldSem = Get-SemVer $oldVersion; $newSem = Get-SemVer $newVersion
if (-not $oldSem -or -not $newSem) { throw (T 'Nie mozna odczytac numerow wersji.' 'Could not read the version numbers.') }
if ($oldSem -gt $newSem -and -not $Force) { Write-Host (T 'Zainstalowana wersja jest nowsza niz ta w paczce. Nic nie zmieniam (-Force cofa wersje).' 'The installed version is newer than the one in this package. Nothing changed (-Force downgrades).') -ForegroundColor Yellow; exit 2 }
if ($oldSem -eq $newSem -and -not $Force) { Write-Host (T 'Masz juz te wersje. Nic do zrobienia (-Force wymusza ponowna podmiane).' 'You already have this version. Nothing to do (-Force replaces the files again).') -ForegroundColor Green; exit 2 }

$nodeExe = Join-Path $pluginDir 'runtime\node.exe'
$components = [ordered]@{
  'runtime\node.exe' = (Test-Path -LiteralPath $nodeExe -PathType Leaf)
  'bin\speediance-cli.exe' = (Test-Path -LiteralPath (Join-Path $pluginDir 'bin\speediance-cli.exe') -PathType Leaf)
  'node_modules\@napi-rs' = (Test-Path -LiteralPath (Join-Path $pluginDir 'node_modules\@napi-rs') -PathType Container)
  '.mcp.json' = (Test-Path -LiteralPath (Join-Path $pluginDir '.mcp.json') -PathType Leaf)
}
foreach ($k in $components.Keys) { Write-Host ("  {0,-26} {1}" -f $k, $(if ($components[$k]) { T 'zostaje (bez pobierania)' 'kept (no download)' } else { T 'BRAK' 'MISSING' })) }
if ($components.Values -contains $false) {
  Write-Host (T 'Brakuje skladnikow - ten aktualizator nic nie pobiera. Uruchom pelny instalator (START-CLAUDE-WINDOWS.cmd).' 'Components are missing - this updater downloads nothing. Run the full installer (START-CLAUDE-WINDOWS.cmd).') -ForegroundColor Yellow
  exit 4
}
# Zmiana przypietych skladnikow (keyring, wymagany Node) wymaga pelnego instalatora.
$oldPins = Join-Path $pluginDir 'scripts\keyring-runtime.json'
$newPins = Join-Path $packagePlugin 'scripts\keyring-runtime.json'
if ((Test-Path -LiteralPath $oldPins) -and (Test-Path -LiteralPath $newPins) -and -not $Force -and ((Get-FileHash -LiteralPath $oldPins).Hash -ne (Get-FileHash -LiteralPath $newPins).Hash)) {
  Write-Host (T 'Nowa wersja wymaga innych skladnikow (magazyn hasel). Uruchom pelny instalator (START-CLAUDE-WINDOWS.cmd) - dane i haslo zostana zachowane.' 'The new version needs different components (credential store). Run the full installer (START-CLAUDE-WINDOWS.cmd) - your data and password are kept.') -ForegroundColor Yellow
  exit 4
}
if ($CheckOnly) { Write-Host (T 'Tryb -CheckOnly: nic nie zmieniono.' 'Check-only mode: nothing changed.'); exit 0 }

# ---------------------------------------------------------------- kopia zapasowa i podmiana plikow wtyczki
$stamp = (Get-Date).ToString('yyyyMMdd-HHmmss')
$backupDir = Join-Path $installRoot ("backup-$($oldSem)-$stamp")
$backupPlugin = Join-Path $backupDir 'gm-coach'
$marketJson = Join-Path $marketDir '.claude-plugin\marketplace.json'
$moved = New-Object System.Collections.Generic.List[string]
function Invoke-Rollback([string]$Reason) {
  Write-Host (T "BLAD: $Reason" "ERROR: $Reason") -ForegroundColor Red
  if (-not (Test-Path -LiteralPath $backupPlugin)) { Write-Host (T 'Poprzednia wersja nie zostala zmieniona.' 'The previous version was not changed.') -ForegroundColor Yellow; return }
  Write-Step (T 'Przywracanie poprzedniej wersji' 'Restoring the previous version')
  # Usun wszystko, co nie jest skladnikiem zachowywanym, potem przywroc stare pliki.
  Get-ChildItem -LiteralPath $pluginDir -Force | Where-Object { $preserve -notcontains $_.Name } | ForEach-Object { Remove-Item -LiteralPath $_.FullName -Recurse -Force }
  Get-ChildItem -LiteralPath $backupPlugin -Force | ForEach-Object { Move-Item -LiteralPath $_.FullName -Destination (Join-Path $pluginDir $_.Name) -Force }
  $backupMarket = Join-Path $backupDir 'marketplace.json'
  if (Test-Path -LiteralPath $backupMarket) { Copy-Item -LiteralPath $backupMarket -Destination $marketJson -Force }
  Remove-Item -LiteralPath $backupDir -Recurse -Force -ErrorAction SilentlyContinue
  Write-Host (T "Przywrocono wersje $oldVersion. Dane i ustawienia nie byly ruszane." "Restored version $oldVersion. Your data and settings were never touched.") -ForegroundColor Green
}
Write-Step (T "Aktualizacja do $newVersion (kopia poprzedniej wersji: $backupDir)" "Updating to $newVersion (backup of the previous version: $backupDir)")
try {
  New-Item -ItemType Directory -Force -Path $backupPlugin | Out-Null
  Copy-Item -LiteralPath $marketJson -Destination (Join-Path $backupDir 'marketplace.json') -Force
  Get-ChildItem -LiteralPath $pluginDir -Force | Where-Object { $preserve -notcontains $_.Name } | ForEach-Object {
    Move-Item -LiteralPath $_.FullName -Destination (Join-Path $backupPlugin $_.Name)
  }
  Get-ChildItem -LiteralPath $packagePlugin -Force | Where-Object { $preserve -notcontains $_.Name } | ForEach-Object {
    Copy-Item -LiteralPath $_.FullName -Destination (Join-Path $pluginDir $_.Name) -Recurse -Force
  }
  # Wersja w marketplace.json (reszta wpisu bez zmian).
  $market = Get-Content -LiteralPath $marketJson -Raw -Encoding UTF8 | ConvertFrom-Json
  foreach ($entry in @($market.plugins | Where-Object { $_.name -eq 'gm-coach' })) { $entry.version = $newVersion }
  [IO.File]::WriteAllText($marketJson, ($market | ConvertTo-Json -Depth 20), [Text.UTF8Encoding]::new($false))
} catch {
  Invoke-Rollback (T "Podmiana plikow nie powiodla sie ($($_.Exception.Message)). Zamknij Claude i uruchom aktualizator ponownie." "Replacing the files failed ($($_.Exception.Message)). Close Claude and run the updater again.")
  exit 1
}

# ---------------------------------------------------------------- sprawdzenie serwera
Write-Step (T 'Sprawdzanie serwera MCP (initialize + tools/list)' 'Checking the MCP server (initialize + tools/list)')
$verifyJson = (& $nodeExe $verifyScript $pluginDir $newSem.ToString() 2>&1 | Out-String).Trim()
if ($LASTEXITCODE -ne 0 -or $verifyJson -notmatch '"ok":true') {
  Invoke-Rollback (T "Serwer MCP nie przeszedl sprawdzenia: $verifyJson" "The MCP server did not pass the check: $verifyJson")
  exit 1
}
Write-Host (T "Serwer MCP dziala: $verifyJson" "MCP server works: $verifyJson") -ForegroundColor Green

# ---------------------------------------------------------------- Claude Code: odswiezenie marketplace i wtyczki
$cli = Find-ClaudeCli
$exitCode = 0
$registered = $false
if ($cli) {
  $listed = & $cli plugin marketplace list 2>&1 | Out-String
  $registered = ($LASTEXITCODE -eq 0 -and $listed -match [regex]::Escape($marketName))
}
if ($cli -and $registered) {
  Write-Step (T 'Claude Code: odswiezanie wtyczki' 'Claude Code: refreshing the plugin')
  $out = & $cli plugin marketplace update $marketName 2>&1 | Out-String
  $ok = ($LASTEXITCODE -eq 0)
  if ($ok) { $out += & $cli plugin update $pluginId 2>&1 | Out-String; $ok = ($LASTEXITCODE -eq 0) }
  if (-not $ok) {
    Invoke-Rollback (T "Polecenie 'claude plugin update' nie powiodlo sie: $out" "'claude plugin update' failed: $out")
    try { & $cli plugin marketplace update $marketName 2>&1 | Out-Null } catch { }
    exit 1
  }
} elseif ($cli) {
  Write-Warning (T 'Claude Code nie zna marketplace gm-coach-local (wtyczka nie byla instalowana przez instalator?). Pliki sa zaktualizowane; uruchom pelny instalator, aby zarejestrowac wtyczke.' 'Claude Code does not know the gm-coach-local marketplace (was the plugin installed by the installer?). The files are updated; run the full installer to register the plugin.')
  $exitCode = 3
} else {
  Write-Warning (T 'Nie znaleziono Claude Code CLI. Pliki sa zaktualizowane; w aplikacji Claude otworz panel wtyczek i wybierz aktualizacje GM Coach (albo uruchom: claude plugin update gm-coach@gm-coach-local).' 'Claude Code CLI not found. The files are updated; in the Claude app open the plugins panel and update GM Coach (or run: claude plugin update gm-coach@gm-coach-local).')
  $exitCode = 3
}
# Zachowaj dwie ostatnie kopie.
Get-ChildItem -LiteralPath $installRoot -Directory -Force -Filter 'backup-*' -ErrorAction SilentlyContinue | Sort-Object Name -Descending | Select-Object -Skip 2 | ForEach-Object { Remove-Item -LiteralPath $_.FullName -Recurse -Force -ErrorAction SilentlyContinue }
Write-Host ''
Write-Host (T "Kopia poprzedniej wersji ($oldVersion): $backupDir" "Backup of the previous version ($oldVersion): $backupDir")
Write-Host (T 'Dane, profil i haslo nie byly ruszane - ponowne logowanie nie jest potrzebne.' 'Data, profile and password were not touched - no new sign-in is needed.') -ForegroundColor Green
if ($exitCode -eq 0) { Write-Host (T 'Gotowe. Otworz nowa sesje Claude Code lub nowy czat.' 'Done. Open a new Claude Code session or a new chat.') -ForegroundColor Green }
exit $exitCode
