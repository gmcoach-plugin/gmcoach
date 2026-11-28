<#
.SYNOPSIS
  GM Coach - aktualizator dla Codex (Windows) / updater for Codex (Windows).
.EXAMPLE
  powershell -NoProfile -ExecutionPolicy Bypass -File .\update-windows.ps1
  powershell -NoProfile -ExecutionPolicy Bypass -File .\update-windows.ps1 -Language en
  powershell -NoProfile -ExecutionPolicy Bypass -File .\update-windows.ps1 -CheckOnly
.NOTES
  Podmienia tylko pliki pluginu. Zostaja: runtime Node, speediance-cli, node_modules (keyring), dane i profil,
  haslo w Menedzerze poswiadczen, ustawienia tunelu ChatGPT. Przed zmiana powstaje kopia zapasowa;
  gdy sprawdzenie po aktualizacji sie nie powiedzie, przywracana jest poprzednia wersja.
  Replaces only the plugin files. Kept: Node runtime, speediance-cli, node_modules (keyring), data and profile,
  the saved password, the ChatGPT tunnel settings. A backup is made first; if the post-update check fails,
  the previous version is restored.
  Kody wyjscia / exit codes: 0 OK, 1 blad (przywrocono poprzednia wersje) / error (previous version restored),
  2 nic do zrobienia / nothing to do, 3 pliki zaktualizowane, ale aktywacji w Codex nie potwierdzono /
  files updated but Codex activation not confirmed.
#>
param(
  [ValidateSet('pl', 'en')][string]$Language,
  [switch]$Force,
  [switch]$CheckOnly,
  [string]$TaskName = 'GM Coach ChatGPT Tunnel'
)
$ErrorActionPreference = 'Stop'
$script:Lang = 'pl'
if ($Language) { $script:Lang = $Language }
elseif ([Environment]::UserInteractive -and -not $env:GM_COACH_NONINTERACTIVE) {
  $answer = Read-Host 'Jezyk / Language: [1] Polski  [2] English'
  if ("$answer".Trim() -match '^(2|en|eng|english|angielski)$') { $script:Lang = 'en' }
}
function T([string]$pl, [string]$en) { if ($script:Lang -eq 'en') { $en } else { $pl } }
function Write-Step([string]$Text) { Write-Host "==> $Text" -ForegroundColor Cyan }

$packageRoot = Join-Path $PSScriptRoot 'plugin'
$userHome = if ($env:GM_COACH_TEST_HOME) { [IO.Path]::GetFullPath($env:GM_COACH_TEST_HOME) } else { [Environment]::GetFolderPath('UserProfile') }
$codexHome = if ($env:CODEX_HOME) { [IO.Path]::GetFullPath($env:CODEX_HOME) } else { Join-Path $userHome '.codex' }
$stateDir = if ($env:GM_COACH_STATE_DIR) { [IO.Path]::GetFullPath($env:GM_COACH_STATE_DIR) } elseif ($env:LOCALAPPDATA) { Join-Path $env:LOCALAPPDATA 'GMCoachTunnel' } else { '' }
$pluginParent = Join-Path $codexHome 'plugins'
$pluginDir = Join-Path $pluginParent 'gm-coach'
$verifyScript = Join-Path $PSScriptRoot 'verify-server.mjs'

function Get-SemVer([string]$Version) {
  if ($Version -match '^(\d+)\.(\d+)\.(\d+)') { return [version]::new([int]$Matches[1], [int]$Matches[2], [int]$Matches[3]) }
  return $null
}
function Read-Version([string]$Root) {
  $file = Join-Path $Root 'plugin.json'
  if (-not (Test-Path -LiteralPath $file -PathType Leaf)) { return $null }
  return [string](Get-Content -LiteralPath $file -Raw -Encoding UTF8 | ConvertFrom-Json).version
}

# ---------------------------------------------------------------- kontrole wstepne
$newVersion = Read-Version $packageRoot
if (-not $newVersion -or -not (Test-Path -LiteralPath (Join-Path $packageRoot 'scripts\install-codex-desktop.ps1') -PathType Leaf)) {
  throw (T 'Brak folderu "plugin" obok aktualizatora. Rozpakuj cale archiwum ZIP.' 'The "plugin" folder is missing next to the updater. Extract the whole ZIP archive.')
}
$oldVersion = Read-Version $pluginDir
if (-not $oldVersion) {
  Write-Host (T "Nie znaleziono zainstalowanego GM Coach w $pluginDir. Aktualizator jest dla osob, ktore juz maja plugin. Uzyj instalatora (START-WINDOWS.cmd z paczki instalacyjnej)." "GM Coach is not installed in $pluginDir. The updater is for people who already have the plugin. Use the installer (START-WINDOWS.cmd from the installer package).") -ForegroundColor Yellow
  exit 2
}
Write-Step (T "Zainstalowana wersja: $oldVersion; wersja w paczce: $newVersion" "Installed version: $oldVersion; version in this package: $newVersion")
$oldSem = Get-SemVer $oldVersion; $newSem = Get-SemVer $newVersion
if (-not $oldSem -or -not $newSem) { throw (T 'Nie mozna odczytac numerow wersji.' 'Could not read the version numbers.') }
if ($oldSem -gt $newSem -and -not $Force) {
  Write-Host (T 'Zainstalowana wersja jest nowsza niz ta w paczce. Nic nie zmieniam (uzyj -Force, aby cofnac wersje).' 'The installed version is newer than the one in this package. Nothing changed (use -Force to downgrade).') -ForegroundColor Yellow
  exit 2
}
if ($oldVersion -eq $newVersion -and -not $Force) {
  Write-Host (T 'Masz juz te wersje. Nic do zrobienia (-Force wymusza ponowna podmiane plikow).' 'You already have this version. Nothing to do (-Force replaces the files again).') -ForegroundColor Green
  exit 2
}
$nodeExe = Join-Path $pluginDir 'runtime\node.exe'
$present = [ordered]@{
  'runtime\node.exe' = (Test-Path -LiteralPath $nodeExe -PathType Leaf)
  'bin\speediance-cli.exe' = (Test-Path -LiteralPath (Join-Path $pluginDir 'bin\speediance-cli.exe') -PathType Leaf)
  'node_modules\@napi-rs' = (Test-Path -LiteralPath (Join-Path $pluginDir 'node_modules\@napi-rs') -PathType Container)
}
foreach ($k in $present.Keys) { Write-Host ("  {0,-26} {1}" -f $k, $(if ($present[$k]) { T 'zostaje (bez pobierania)' 'kept (no download)' } else { T 'BRAK - zostanie pobrany i zweryfikowany (SHA-256)' 'MISSING - will be downloaded and verified (SHA-256)' })) }
if ($CheckOnly) { Write-Host (T 'Tryb -CheckOnly: nic nie zmieniono.' 'Check-only mode: nothing changed.'); exit 0 }

# ---------------------------------------------------------------- tunel ChatGPT: zatrzymaj na czas podmiany
$tunnelStopped = $false
$tunnelConfig = if ($stateDir) { Join-Path $stateDir 'tunnel.json' } else { '' }
if ($tunnelConfig -and (Test-Path -LiteralPath $tunnelConfig)) {
  try {
    $cfg = Get-Content -LiteralPath $tunnelConfig -Raw | ConvertFrom-Json
    # Dotykamy tylko tunelu wskazujacego TEN katalog pluginu.
    if ($cfg.pluginDir -and ([IO.Path]::GetFullPath([string]$cfg.pluginDir).TrimEnd('\') -ieq $pluginDir.TrimEnd('\'))) {
      try {
        $task = Get-ScheduledTask -TaskName $TaskName -ErrorAction Stop
        if ($task.State -eq 'Running') { Stop-ScheduledTask -TaskName $TaskName -ErrorAction Stop; $tunnelStopped = $true }
      } catch { Write-Verbose 'Scheduled task not available.' }
      $clientRoot = Join-Path $stateDir 'tunnel-client'
      Get-Process tunnel-client -ErrorAction SilentlyContinue | Where-Object { $_.Path -and $_.Path.StartsWith($clientRoot, [StringComparison]::OrdinalIgnoreCase) } | Stop-Process -Force -ErrorAction SilentlyContinue
      Get-Process node -ErrorAction SilentlyContinue | Where-Object { $_.Path -and $_.Path.StartsWith((Join-Path $pluginDir 'runtime'), [StringComparison]::OrdinalIgnoreCase) } | Stop-Process -Force -ErrorAction SilentlyContinue
      if ($tunnelStopped) { Write-Host (T 'Tunel ChatGPT zatrzymany na czas aktualizacji; ustawienia zostaja.' 'ChatGPT tunnel paused during the update; its settings are kept.') }
    }
  } catch { Write-Warning (T 'Nie udalo sie sprawdzic tunelu ChatGPT; kontynuuje.' 'Could not check the ChatGPT tunnel; continuing.') }
}
function Restart-Tunnel { if ($tunnelStopped) { try { Start-ScheduledTask -TaskName $TaskName; Write-Host (T 'Tunel ChatGPT uruchomiony ponownie.' 'ChatGPT tunnel restarted.') } catch { Write-Warning (T 'Nie udalo sie uruchomic tunelu; uruchom go recznie.' 'Could not restart the tunnel; start it manually.') } } }

# ---------------------------------------------------------------- aktualizacja (kopia zapasowa + podmiana plikow pluginu)
$before = @(Get-ChildItem -LiteralPath $pluginParent -Directory -Force -Filter '.gm-coach-backup-*' -ErrorAction SilentlyContinue | ForEach-Object FullName)
Write-Step (T "Aktualizacja do $newVersion (kopia zapasowa poprzedniej wersji powstaje automatycznie)" "Updating to $newVersion (a backup of the previous version is made automatically)")
$inner = Join-Path $packageRoot 'scripts\install-codex-desktop.ps1'
$powershellExe = (Get-Process -Id $PID).Path
& $powershellExe -NoProfile -ExecutionPolicy Bypass -File $inner -Update
$innerExit = $LASTEXITCODE
$after = @(Get-ChildItem -LiteralPath $pluginParent -Directory -Force -Filter '.gm-coach-backup-*' -ErrorAction SilentlyContinue | Where-Object { $before -notcontains $_.FullName } | Sort-Object LastWriteTime -Descending)
$backup = if ($after.Count) { $after[0].FullName } else { $null }

# ---------------------------------------------------------------- sprawdzenie i ewentualny rollback
function Invoke-Rollback([string]$Reason) {
  Write-Host (T "BLAD: $Reason" "ERROR: $Reason") -ForegroundColor Red
  if (-not $backup -or -not (Test-Path -LiteralPath $backup)) {
    Write-Host (T 'Poprzednia wersja nie zostala zmieniona (aktualizacja nie doszla do podmiany plikow).' 'The previous version was not changed (the update stopped before replacing files).') -ForegroundColor Yellow
    return
  }
  Write-Step (T 'Przywracanie poprzedniej wersji' 'Restoring the previous version')
  $failed = Join-Path $pluginParent ('.gm-coach-failed-' + [guid]::NewGuid().ToString('N'))
  Get-Process node -ErrorAction SilentlyContinue | Where-Object { $_.Path -and $_.Path.StartsWith((Join-Path $pluginDir 'runtime'), [StringComparison]::OrdinalIgnoreCase) } | Stop-Process -Force -ErrorAction SilentlyContinue
  if (Test-Path -LiteralPath $pluginDir) { Move-Item -LiteralPath $pluginDir -Destination $failed }
  Move-Item -LiteralPath $backup -Destination $pluginDir
  Remove-Item -LiteralPath $failed -Recurse -Force -ErrorAction SilentlyContinue
  Write-Host (T "Przywrocono wersje $oldVersion. Dane i ustawienia nie byly ruszane." "Restored version $oldVersion. Your data and settings were never touched.") -ForegroundColor Green
}

$installedNow = Read-Version $pluginDir
if ($installedNow -ne $newVersion) {
  Invoke-Rollback (T "Po aktualizacji wersja to '$installedNow', oczekiwano '$newVersion' (kod instalatora: $innerExit)." "After the update the version is '$installedNow', expected '$newVersion' (installer code: $innerExit).")
  Restart-Tunnel
  exit 1
}
Write-Step (T 'Sprawdzanie serwera MCP (initialize + tools/list)' 'Checking the MCP server (initialize + tools/list)')
$verifyJson = ''
$newNode = Join-Path $pluginDir 'runtime\node.exe'
if (Test-Path -LiteralPath $newNode) { $verifyJson = (& $newNode $verifyScript $pluginDir ((Get-SemVer $newVersion).ToString()) 2>&1 | Out-String).Trim() }
$verified = $LASTEXITCODE -eq 0 -and $verifyJson -match '"ok":true'
if (-not $verified) {
  Invoke-Rollback (T "Serwer MCP nie przeszedl sprawdzenia: $verifyJson" "The MCP server did not pass the check: $verifyJson")
  Restart-Tunnel
  exit 1
}
Write-Host (T "Serwer MCP dziala: $verifyJson" "MCP server works: $verifyJson") -ForegroundColor Green
Restart-Tunnel
# Zachowaj dwie ostatnie kopie zapasowe (nowa + jedna starsza) / keep the two latest backups.
Get-ChildItem -LiteralPath $pluginParent -Directory -Force -Filter '.gm-coach-backup-*' -ErrorAction SilentlyContinue | Sort-Object LastWriteTime -Descending | Select-Object -Skip 2 | ForEach-Object { Remove-Item -LiteralPath $_.FullName -Recurse -Force -ErrorAction SilentlyContinue }
Write-Host ''
if ($backup) { Write-Host (T "Kopia poprzedniej wersji ($oldVersion): $backup" "Backup of the previous version ($oldVersion): $backup") }
Write-Host (T 'Dane, profil, haslo i ustawienia tunelu nie byly ruszane - ponowne logowanie nie jest potrzebne.' 'Data, profile, password and tunnel settings were not touched - no new sign-in is needed.') -ForegroundColor Green
if ($innerExit -ne 0) {
  Write-Warning (T 'Pliki sa zaktualizowane, ale Codex CLI nie potwierdzil aktywacji (np. brak polecenia codex w PATH). Uruchom ponownie Codex i otworz nowy czat; w razie braku narzedzi GM Coach uruchom pelny instalator.' 'The files are updated, but the Codex CLI did not confirm activation (for example, no codex command in PATH). Restart Codex and open a new chat; if GM Coach tools are missing, run the full installer.')
  exit 3
}
Write-Host (T 'Gotowe. Zrestartuj Codex i otworz nowy czat.' 'Done. Restart Codex and open a new chat.') -ForegroundColor Green
exit 0
