<#
.SYNOPSIS
  GM Coach - instalator dla Claude (Windows) / installer for Claude (Windows).
  1) Claude Code (zakladka Code w aplikacji Claude i CLI `claude`): wtyczka z lokalnego marketplace.
     Wtyczka jest widoczna w calej aplikacji Claude (panel wtyczek).
  2) Claude Desktop bez Claude Code (-BezCode): plik rozszerzenia .mcpb do instalacji w Ustawieniach.
.EXAMPLE
  powershell -NoProfile -ExecutionPolicy Bypass -File .\install-claude-windows.ps1
  powershell -NoProfile -ExecutionPolicy Bypass -File .\install-claude-windows.ps1 -Language en
  powershell -NoProfile -ExecutionPolicy Bypass -File .\install-claude-windows.ps1 -BezCode
  powershell -NoProfile -ExecutionPolicy Bypass -File .\install-claude-windows.ps1 -Uninstall
.NOTES
  Dane konta Speediance (profil, sesja, haslo w Menedzerze poswiadczen) nie sa ruszane ani usuwane.
  Speediance account data (profile, session, password in Credential Manager) is never touched or removed.
#>
param(
  [ValidateSet('pl', 'en', '')][string]$Language = '',
  [switch]$BezCode,
  [switch]$BezDesktop,
  [switch]$Uninstall
)
$ErrorActionPreference = 'Stop'

# ------------------------------------------------------------------ jezyk / language
if (-not $Language) {
  $Language = 'pl'
  if ([Environment]::UserInteractive -and -not $env:GM_COACH_NONINTERACTIVE) {
    $answer = Read-Host 'Jezyk / Language: [1] Polski  [2] English  (Enter = Polski)'
    if ($answer -match '^\s*(2|en|english|e)\s*$') { $Language = 'en' }
  }
}
$script:Lang = $Language
function T([string]$pl, [string]$en) { if ($script:Lang -eq 'en') { $en } else { $pl } }

$marketName = 'gm-coach-local'
$pluginId = "gm-coach@$marketName"
$userHome = [Environment]::GetFolderPath('UserProfile')
$installRoot = Join-Path $userHome '.claude\gm-coach'
$marketTarget = Join-Path $installRoot 'marketplace'
function Write-Step([string]$t) { Write-Host "==> $t" -ForegroundColor Cyan }

function Find-ClaudeCli {
  $cmd = Get-Command claude -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($cmd) { return $cmd.Source }
  $roots = @(Join-Path $env:LOCALAPPDATA 'Claude-Data') | Where-Object { Test-Path -LiteralPath $_ }
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
function Invoke-Claude([string]$cli, [string[]]$arguments, [switch]$AllowFail) {
  $output = & $cli @arguments 2>&1 | Out-String
  if ($LASTEXITCODE -ne 0 -and -not $AllowFail) { throw ((T 'Polecenie nie powiodlo sie' 'Command failed') + ": claude $($arguments -join ' ')`n$output") }
  return [pscustomobject]@{ Ok = ($LASTEXITCODE -eq 0); Text = $output }
}

# ------------------------------------------------------------------ odinstalowanie / uninstall
if ($Uninstall) {
  Write-Step (T 'Odinstalowywanie GM Coach z Claude Code' 'Uninstalling GM Coach from Claude Code')
  $cli = Find-ClaudeCli
  if ($cli) {
    [void](Invoke-Claude $cli @('plugin', 'uninstall', $pluginId) -AllowFail)
    [void](Invoke-Claude $cli @('plugin', 'marketplace', 'remove', $marketName) -AllowFail)
  } else { Write-Warning (T 'Nie znaleziono CLI Claude Code; usun wtyczke w panelu wtyczek, jesli byla zainstalowana.' 'Claude Code CLI not found; remove the plugin in the plugins panel if it was installed.') }
  if (Test-Path -LiteralPath $installRoot) {
    Remove-Item -LiteralPath $installRoot -Recurse -Force -ErrorAction SilentlyContinue
    if (Test-Path -LiteralPath $installRoot) { Write-Warning (T "Czesc plikow w $installRoot jest w uzyciu. Zamknij Claude i uruchom odinstalowanie ponownie." "Some files in $installRoot are in use. Close Claude and run uninstall again.") }
    else { Write-Host ((T 'Usunieto' 'Removed') + " $installRoot") }
  }
  Write-Host (T 'Rozszerzenie Claude Desktop (jesli bylo instalowane z .mcpb) usun w Claude: Settings > Extensions > GM Coach > Uninstall.' 'If you installed the .mcpb extension, remove it in Claude: Settings > Extensions > GM Coach > Uninstall.')
  Write-Host (T 'Dane konta Speediance zostaly na komputerze (wspolne z Codex/ChatGPT).' 'Your Speediance account data stays on this computer (shared with Codex/ChatGPT).') -ForegroundColor Green
  exit 0
}

$packageMarket = Join-Path $PSScriptRoot 'marketplace'
$mcpb = Get-ChildItem -LiteralPath $PSScriptRoot -Filter 'GM-Coach-*.mcpb' -File | Select-Object -First 1
if (-not (Test-Path -LiteralPath (Join-Path $packageMarket '.claude-plugin\marketplace.json'))) { throw (T 'Brak folderu "marketplace" obok instalatora. Rozpakuj cale archiwum ZIP.' 'The "marketplace" folder is missing next to the installer. Extract the whole ZIP archive.') }
$version = (Get-Content -LiteralPath (Join-Path $packageMarket 'gm-coach\.claude-plugin\plugin.json') -Raw -Encoding UTF8 | ConvertFrom-Json).version

# ------------------------------------------------------------------ Claude Code
if (-not $BezCode) {
  Write-Step "Claude Code: GM Coach $version"
  $cli = Find-ClaudeCli
  if (-not $cli) { throw (T 'Nie znaleziono Claude Code. Otworz raz zakladke Code w aplikacji Claude albo zainstaluj CLI `claude`, potem uruchom instalator ponownie (albo uzyj -BezCode).' 'Claude Code not found. Open the Code tab in the Claude app once or install the `claude` CLI, then run the installer again (or use -BezCode).') }
  Write-Host "CLI: $cli"
  # Synchronizacja (robocopy /MIR) zamiast usuwania: dzialajacy serwer MCP blokuje runtime\node.exe,
  # a identyczne pliki sa pomijane. Sync instead of delete: a running MCP server locks node.exe.
  New-Item -ItemType Directory -Force -Path $marketTarget | Out-Null
  $known = (Invoke-Claude $cli @('plugin', 'marketplace', 'list') -AllowFail).Text -match [regex]::Escape($marketName)
  # Binaria (.exe/.node/.dll) moga byc zablokowane przez dzialajacy serwer GM Coach. Porownujemy je po
  # zawartosci (SHA-256) i podmieniamy tylko gdy sie roznia. Binaries may be locked by a running server:
  # compare by content and replace only when they differ.
  & robocopy.exe $packageMarket $marketTarget /MIR /XF *.exe *.node *.dll /R:2 /W:2 /NFL /NDL /NJH /NJS /NP | Out-Null
  if ($LASTEXITCODE -ge 8) { throw (T "Kopiowanie wtyczki do $marketTarget nie powiodlo sie (robocopy $LASTEXITCODE). Zamknij Claude i sprobuj ponownie." "Copying the plugin to $marketTarget failed (robocopy $LASTEXITCODE). Close Claude and try again.") }
  $global:LASTEXITCODE = 0
  $lockedDiffer = @()
  Get-ChildItem -LiteralPath $packageMarket -Recurse -File -Include *.exe, *.node, *.dll | ForEach-Object {
    $target = Join-Path $marketTarget $_.FullName.Substring($packageMarket.Length + 1)
    if ((Test-Path -LiteralPath $target) -and (Get-FileHash -LiteralPath $_.FullName).Hash -eq (Get-FileHash -LiteralPath $target).Hash) { return }
    New-Item -ItemType Directory -Force -Path (Split-Path -Parent $target) | Out-Null
    try { Copy-Item -LiteralPath $_.FullName -Destination $target -Force -ErrorAction Stop } catch { $lockedDiffer += $target }
  }
  if ($lockedDiffer.Count) { throw ((T 'Te pliki sa w uzyciu i roznia sie od nowej wersji. Zamknij aplikacje Claude i uruchom instalator ponownie:' 'These files are in use and differ from the new version. Close the Claude app and run the installer again:') + "`n" + ($lockedDiffer -join "`n")) }
  if ($known) {
    [void](Invoke-Claude $cli @('plugin', 'marketplace', 'update', $marketName))
    $installed = (Invoke-Claude $cli @('plugin', 'list') -AllowFail).Text -match [regex]::Escape($pluginId)
    if ($installed) { [void](Invoke-Claude $cli @('plugin', 'update', $pluginId)); Write-Host (T 'Zaktualizowano wtyczke.' 'Plugin updated.') }
    else { [void](Invoke-Claude $cli @('plugin', 'install', $pluginId)); Write-Host (T 'Zainstalowano wtyczke.' 'Plugin installed.') }
  } else {
    [void](Invoke-Claude $cli @('plugin', 'marketplace', 'add', $marketTarget))
    [void](Invoke-Claude $cli @('plugin', 'install', $pluginId))
    Write-Host (T 'Dodano marketplace i zainstalowano wtyczke.' 'Marketplace added and plugin installed.')
  }
  Write-Host (T 'Gotowe. GM Coach jest w panelu wtyczek aplikacji Claude ("Gm coach - Installed locally").' 'Done. GM Coach is in the Claude app plugins panel ("Gm coach - Installed locally").') -ForegroundColor Green
  Write-Host (T 'Niczego wiecej nie trzeba instalowac. Otworz nowy czat lub nowa sesje Code.' 'Nothing else needs to be installed. Open a new chat or a new Code session.') -ForegroundColor Green
}

# ------------------------------------------------------------------ Claude Desktop bez Claude Code / without Claude Code
if ($BezCode -and -not $BezDesktop) {
  if (-not $mcpb) { throw (T 'Brak pliku GM-Coach-*.mcpb obok instalatora.' 'GM-Coach-*.mcpb file missing next to the installer.') }
  Write-Step (T 'Claude Desktop: rozszerzenie GM Coach (.mcpb)' 'Claude Desktop: GM Coach extension (.mcpb)')
  $desktopTarget = Join-Path $installRoot $mcpb.Name
  New-Item -ItemType Directory -Force -Path $installRoot | Out-Null
  Copy-Item -LiteralPath $mcpb.FullName -Destination $desktopTarget -Force
  Start-Process -FilePath explorer.exe -ArgumentList "/select,`"$desktopTarget`""
  Write-Host ((T 'Plik rozszerzenia' 'Extension file') + ": $desktopTarget") -ForegroundColor Green
  Write-Host (T 'Dokoncz w aplikacji Claude (instalacji rozszerzenia nie da sie potwierdzic skryptem):' 'Finish in the Claude app (a script cannot confirm extension installation):')
  Write-Host '  1. Settings > Extensions > Advanced settings > Install Extension...'
  Write-Host (T "  2. Wskaz plik $($mcpb.Name) z otwartego folderu i potwierdz Install." "  2. Select $($mcpb.Name) in the opened folder and confirm Install.")
  Write-Host (T '  3. W nowym czacie wlacz GM Coach w menu narzedzi.' '  3. In a new chat, enable GM Coach in the tools menu.')
}

Write-Host ''
Write-Host (T 'Pierwsze uzycie: napisz w nowym czacie "GM Coach, sprawdz polaczenie z Speediance".' 'First use: in a new chat write "GM Coach, check my Speediance connection".')
Write-Host (T 'Jesli konto nie bylo jeszcze laczone na tym komputerze, GM Coach otworzy formularz logowania (PL/EN).' 'If the account has not been connected on this computer yet, GM Coach opens a sign-in form (PL/EN).')
