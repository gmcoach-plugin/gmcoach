<#
.SYNOPSIS
  GM Coach - instalator dla Windows (Codex + opcjonalny tunel ChatGPT).
.EXAMPLE
  powershell -NoProfile -ExecutionPolicy Bypass -File .\install-windows.ps1
  powershell -NoProfile -ExecutionPolicy Bypass -File .\install-windows.ps1 -Tunnel -TunnelId tunnel_xxx
  powershell -NoProfile -ExecutionPolicy Bypass -File .\install-windows.ps1 -Uninstall [-RemoveData]
  powershell -NoProfile -ExecutionPolicy Bypass -File .\install-windows.ps1 -NoTunnel -Language en
.NOTES
  -Language pl|en wybiera jezyk komunikatow; bez niego instalator pyta raz (domyslnie polski).
  Klucz tunelu: ukryty monit albo zmienna srodowiskowa GM_COACH_TUNNEL_KEY.
  Nigdy nie podawaj klucza jako argumentu polecenia.
#>
param(
  [switch]$Tunnel,
  [switch]$NoTunnel,
  [string]$TunnelId,
  [string]$TunnelClientZip,
  [switch]$NoStart,
  [switch]$Uninstall,
  [switch]$RemoveData,
  [switch]$SkipPlugin,
  [string]$TaskName = 'GM Coach ChatGPT Tunnel',
  [ValidateSet('pl', 'en')]
  [string]$Language
)
$ErrorActionPreference = 'Stop'

# Jezyk komunikatow / message language: -Language pl|en, otherwise ask once (interactive) or default pl.
$script:Lang = 'pl'
if ($Language) { $script:Lang = $Language.ToLowerInvariant() }
elseif ([Environment]::UserInteractive -and -not $env:GM_COACH_NONINTERACTIVE) {
  $langAnswer = Read-Host 'Jezyk / Language: [1] Polski  [2] English'
  if ("$langAnswer".Trim() -match '^(2|en|eng|english|angielski)$') { $script:Lang = 'en' }
}
function T([string]$pl, [string]$en) { if ($script:Lang -eq 'en') { $en } else { $pl } }

$TunnelClientVersion = '0.0.19'
$TunnelClientSha256 = @{
  'amd64' = '1d0ecc3a54f2a51e27a635ac155f40fbb95df58c52cdeddf6c75532cc0bbeb25'
  'arm64' = 'a054bfb19d72b446cc9802a7987a17eab517502355d27b18e51814bbb0b32731'
}

$packageRoot = Join-Path $PSScriptRoot 'plugin'
$userHome = if ($env:GM_COACH_TEST_HOME) { [IO.Path]::GetFullPath($env:GM_COACH_TEST_HOME) } else { [Environment]::GetFolderPath('UserProfile') }
$codexHome = if ($env:CODEX_HOME) { [IO.Path]::GetFullPath($env:CODEX_HOME) } else { Join-Path $userHome '.codex' }
$stateDir = if ($env:GM_COACH_STATE_DIR) { [IO.Path]::GetFullPath($env:GM_COACH_STATE_DIR) } else { Join-Path $env:LOCALAPPDATA 'GMCoachTunnel' }
$pluginDir = Join-Path $codexHome 'plugins\gm-coach'
$marketplacePath = Join-Path $userHome '.agents\plugins\marketplace.json'
$keyPath = Join-Path $stateDir 'tunnel-key.protected'
$configPath = Join-Path $stateDir 'tunnel.json'

function Write-Step([string]$Text) { Write-Host "==> $Text" -ForegroundColor Cyan }
function Invoke-Codex([string[]]$Arguments) {
  $codex = Get-Command codex -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1
  if (-not $codex) { return $false }
  $prior = $env:CODEX_HOME
  try { $env:CODEX_HOME = $codexHome; & $codex.Source @Arguments 2>$null | Out-Null; return ($LASTEXITCODE -eq 0) }
  catch { return $false }
  finally { if ($null -eq $prior) { Remove-Item Env:\CODEX_HOME -ErrorAction SilentlyContinue } else { $env:CODEX_HOME = $prior } }
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

function Remove-TunnelTask {
  if (Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue) {
    try { Stop-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue } catch { }
    Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
    Write-Host (T "Usunieto zadanie harmonogramu '$TaskName'." "Removed scheduled task '$TaskName'.")
  }
  $clientRoot = Join-Path $stateDir 'tunnel-client'
  Get-Process tunnel-client -ErrorAction SilentlyContinue |
    Where-Object { $_.Path -and $_.Path.StartsWith($clientRoot, [StringComparison]::OrdinalIgnoreCase) } |
    Stop-Process -Force -ErrorAction SilentlyContinue
}

# ---------------------------------------------------------------- odinstalowanie
if ($Uninstall) {
  Write-Step (T 'Odinstalowywanie GM Coach' 'Uninstalling GM Coach')
  Remove-TunnelTask
  if (Test-Path -LiteralPath $stateDir) { Remove-Item -LiteralPath $stateDir -Recurse -Force; Write-Host (T 'Usunieto klucz i pliki tunelu.' 'Removed the tunnel key and files.') }
  [void](Invoke-Codex @('mcp', 'remove', 'gm_coach_local'))
  [void](Invoke-Codex @('plugin', 'remove', 'gm-coach@personal'))
  if (Test-Path -LiteralPath $pluginDir) { Remove-Item -LiteralPath $pluginDir -Recurse -Force; Write-Host (T "Usunieto $pluginDir" "Removed $pluginDir") }
  Get-ChildItem -LiteralPath (Split-Path -Parent $pluginDir) -Directory -Force -ErrorAction SilentlyContinue |
    Where-Object { $_.Name -like '.gm-coach-backup-*' -or $_.Name -like '.gm-coach-staging-*' } |
    ForEach-Object { Remove-Item -LiteralPath $_.FullName -Recurse -Force -ErrorAction SilentlyContinue }
  $cache = Join-Path $codexHome 'plugins\cache\personal\gm-coach'
  if (Test-Path -LiteralPath $cache) { Remove-Item -LiteralPath $cache -Recurse -Force -ErrorAction SilentlyContinue }
  if (Test-Path -LiteralPath $marketplacePath) {
    $m = Get-Content -LiteralPath $marketplacePath -Raw | ConvertFrom-Json
    if ($m.plugins) {
      $m.plugins = @($m.plugins | Where-Object { $_.name -ne 'gm-coach' })
      [IO.File]::WriteAllText($marketplacePath, ($m | ConvertTo-Json -Depth 100), [Text.UTF8Encoding]::new($false))
      Write-Host (T 'Usunieto wpis gm-coach z marketplace Personal.' 'Removed the gm-coach entry from the Personal marketplace.')
    }
  }
  $data = Join-Path $codexHome 'plugins\data\gm-coach'
  if ($RemoveData) {
    if (Test-Path -LiteralPath $data) { Remove-Item -LiteralPath $data -Recurse -Force; Write-Host (T 'Usunieto lokalne dane GM Coach (profil, ustawienia konta).' 'Removed local GM Coach data (profile, account settings).') }
    Write-Host (T 'Zapisane haslo Speediance usun w Menedzerze poswiadczen Windows (wpisy GM Coach / Speediance), jesli istnieja.' 'Remove the saved Speediance password in Windows Credential Manager (GM Coach / Speediance entries), if present.')
  } elseif (Test-Path -LiteralPath $data) {
    Write-Host (T "Dane konta zostawiono w $data. Uzyj -RemoveData, aby je usunac." "Account data was kept in $data. Use -RemoveData to delete it.")
  }
  Write-Host (T 'GM Coach odinstalowany. Zrestartuj Codex.' 'GM Coach uninstalled. Restart Codex.') -ForegroundColor Green
  exit 0
}

# ---------------------------------------------------------------- plugin
if (-not $SkipPlugin) {
  $innerInstaller = Join-Path $packageRoot 'scripts\install-codex-desktop.ps1'
  if (-not (Test-Path -LiteralPath $innerInstaller -PathType Leaf)) { throw (T 'Brak folderu "plugin" obok instalatora. Rozpakuj cale archiwum ZIP.' 'The "plugin" folder is missing next to the installer. Extract the whole ZIP archive.') }
  $version = (Get-Content -LiteralPath (Join-Path $packageRoot 'plugin.json') -Raw | ConvertFrom-Json).version
  Write-Step (T "Instalacja pluginu GM Coach $version dla Codex ($codexHome)" "Installing GM Coach plugin $version for Codex ($codexHome)")
  $innerArgs = @{}
  if (Test-Path -LiteralPath $pluginDir) { $innerArgs['Update'] = $true; Write-Host (T 'Znaleziono poprzednia instalacje - aktualizacja.' 'Found a previous installation - updating.') }
  & $innerInstaller @innerArgs
  if (-not $?) { throw (T 'Instalacja pluginu nie powiodla sie.' 'Plugin installation failed.') }
}

# ---------------------------------------------------------------- tunel (opcjonalny)
$wantTunnel = $Tunnel.IsPresent
if (-not $Tunnel -and -not $NoTunnel -and (Test-Path -LiteralPath $configPath)) {
  Write-Host (T 'Tunel ChatGPT jest juz skonfigurowany i zostaje bez zmian. Zmienisz go poleceniem: install-windows.ps1 -SkipPlugin -Tunnel' 'The ChatGPT tunnel is already configured and stays unchanged. To change it: install-windows.ps1 -SkipPlugin -Tunnel') -ForegroundColor Green
  exit 0
}
if (-not $Tunnel -and -not $NoTunnel -and [Environment]::UserInteractive -and -not $env:GM_COACH_NONINTERACTIVE) {
  $answer = Read-Host (T 'Czy uzywac GM Coach takze w ChatGPT? Potrzebne beda ID tunelu i klucz z platform.openai.com. Enter = nie [t/N]' 'Use GM Coach in ChatGPT too? You will need a tunnel ID and key from platform.openai.com. Enter = no [y/N]')
  $wantTunnel = "$answer".Trim() -match '^(t|tak|y|yes)$'
}
if (-not $wantTunnel) {
  Write-Host (T 'Pominieto tunel ChatGPT. Mozesz go dodac pozniej: install-windows.ps1 -SkipPlugin -Tunnel' 'Skipped the ChatGPT tunnel. You can add it later: install-windows.ps1 -SkipPlugin -Tunnel') -ForegroundColor Green
  exit 0
}

Write-Step (T 'Konfiguracja tunelu ChatGPT' 'Configuring the ChatGPT tunnel')
$nodeExe = Join-Path $pluginDir 'runtime\node.exe'
if (-not (Test-Path -LiteralPath (Join-Path $pluginDir 'mcp_server.mjs')) -or -not (Test-Path -LiteralPath $nodeExe)) {
  throw (T 'Plugin GM Coach nie jest zainstalowany. Uruchom instalator bez -SkipPlugin.' 'The GM Coach plugin is not installed. Run the installer without -SkipPlugin.')
}
if (-not $TunnelId) { $TunnelId = (Read-Host (T 'Wklej ID tunelu (tunnel_...)' 'Paste the tunnel ID (tunnel_...)')).Trim() }
if ($TunnelId -notmatch '^tunnel_[A-Za-z0-9]+$') { throw (T 'Niepoprawne ID tunelu (oczekiwano tunnel_...).' 'Invalid tunnel ID (expected tunnel_...).') }

New-Item -ItemType Directory -Path $stateDir -Force | Out-Null
try {
  $acl = New-Object Security.AccessControl.DirectorySecurity
  $acl.SetAccessRuleProtection($true, $false)
  $me = [Security.Principal.WindowsIdentity]::GetCurrent().User
  $acl.AddAccessRule((New-Object Security.AccessControl.FileSystemAccessRule($me, 'FullControl', 'ContainerInherit,ObjectInherit', 'None', 'Allow')))
  Set-Acl -LiteralPath $stateDir -AclObject $acl
} catch { Write-Warning (T 'Nie udalo sie zawezic uprawnien katalogu tunelu; klucz i tak jest szyfrowany DPAPI.' 'Could not restrict permissions of the tunnel directory; the key is still encrypted with DPAPI.') }

$arch = if ("$env:PROCESSOR_ARCHITEW6432 $env:PROCESSOR_ARCHITECTURE" -match 'ARM64') { 'arm64' } else { 'amd64' }
$zipName = "tunnel-client-v$TunnelClientVersion-windows-$arch.zip"
$clientDir = Join-Path $stateDir 'tunnel-client'
$tmp = Join-Path ([IO.Path]::GetTempPath()) ('gm-coach-tunnel-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $tmp -Force | Out-Null
try {
  $zipPath = Join-Path $tmp $zipName
  if ($TunnelClientZip) { Copy-Item -LiteralPath $TunnelClientZip -Destination $zipPath }
  else {
    [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12
    Write-Host (T "Pobieranie $zipName ..." "Downloading $zipName ...")
    Invoke-WebRequest -UseBasicParsing -Uri "https://github.com/openai/tunnel-client/releases/download/v$TunnelClientVersion/$zipName" -OutFile $zipPath
  }
  $hash = (Get-FileHash -LiteralPath $zipPath -Algorithm SHA256).Hash.ToLowerInvariant()
  if ($hash -ne $TunnelClientSha256[$arch]) { throw (T "Weryfikacja SHA-256 tunnel-client nie powiodla sie ($zipName)." "tunnel-client SHA-256 verification failed ($zipName).") }
  Write-Host 'SHA-256 tunnel-client: OK'
  Remove-TunnelTask
  if (Test-Path -LiteralPath $clientDir) { Remove-Item -LiteralPath $clientDir -Recurse -Force }
  Expand-Archive -LiteralPath $zipPath -DestinationPath $clientDir -Force
} finally { Remove-Item -LiteralPath $tmp -Recurse -Force -ErrorAction SilentlyContinue }
$clientExe = Get-ChildItem -LiteralPath $clientDir -Recurse -Filter 'tunnel-client.exe' | Select-Object -First 1
if (-not $clientExe) { throw (T 'Archiwum tunnel-client nie zawiera tunnel-client.exe.' 'The tunnel-client archive does not contain tunnel-client.exe.') }

if ($env:GM_COACH_TUNNEL_KEY) {
  $secure = ConvertTo-SecureString $env:GM_COACH_TUNNEL_KEY -AsPlainText -Force
  Remove-Item Env:\GM_COACH_TUNNEL_KEY -ErrorAction SilentlyContinue
} else {
  $secure = Read-Host (T 'Wklej klucz tunelu (nie bedzie widoczny)' 'Paste the tunnel key (it will not be shown)') -AsSecureString
}
if ($secure.Length -lt 8) { throw (T 'Klucz tunelu jest pusty lub za krotki.' 'The tunnel key is empty or too short.') }
[IO.File]::WriteAllText($keyPath, (ConvertFrom-SecureString $secure), [Text.UTF8Encoding]::new($false))
$secure.Dispose()

$config = [ordered]@{
  tunnelId = $TunnelId
  pluginDir = $pluginDir
  dataDir = (Get-PluginDataDirectory $codexHome)
  client = $clientExe.FullName
}
[IO.File]::WriteAllText($configPath, ($config | ConvertTo-Json), [Text.UTF8Encoding]::new($false))

$runner = Join-Path $stateDir 'run-tunnel.ps1'
$runnerText = @'
# GM Coach - petla tunelu ChatGPT (uruchamiana w tle przez harmonogram zadan).
$ErrorActionPreference = 'Stop'
$stateDir = $PSScriptRoot
$mutex = [Threading.Mutex]::new($false, 'Local\GMCoachTunnelRunner')
if (-not $mutex.WaitOne(0)) { exit 0 }
$delay = 15
try {
  while ($true) {
    $started = [DateTime]::UtcNow
    try {
      $cfg = Get-Content -LiteralPath (Join-Path $stateDir 'tunnel.json') -Raw | ConvertFrom-Json
      $secure = ConvertTo-SecureString ((Get-Content -LiteralPath (Join-Path $stateDir 'tunnel-key.protected') -Raw).Trim())
      $env:CONTROL_PLANE_API_KEY = [Net.NetworkCredential]::new('', $secure).Password
      $secure.Dispose()
      $env:CONTROL_PLANE_TUNNEL_ID = $cfg.tunnelId
      $env:PLUGIN_DATA = $cfg.dataDir
      $cli = Join-Path $cfg.pluginDir 'bin\speediance-cli.exe'
      if (Test-Path -LiteralPath $cli) { $env:SPEEDIANCE_CLI = $cli }
      $env:PATH = (Join-Path $cfg.pluginDir 'runtime') + ';' + $env:PATH
      Set-Location -LiteralPath $cfg.pluginDir
      & $cfg.client run --mcp.command 'node ./mcp_server.mjs' --health.listen-addr '127.0.0.1:0' --health.url-file (Join-Path $stateDir 'health-url.txt') --log.level=warn
    } catch {
      # Bez szczegolow wyjatku: moga zawierac dane uwierzytelniajace.
    } finally {
      Remove-Item Env:\CONTROL_PLANE_API_KEY -ErrorAction SilentlyContinue
    }
    if (([DateTime]::UtcNow - $started).TotalSeconds -ge 60) { $delay = 15 }
    Start-Sleep -Seconds $delay
    $delay = [Math]::Min($delay * 2, 120)
  }
} finally { $mutex.ReleaseMutex(); $mutex.Dispose() }
'@
[IO.File]::WriteAllText($runner, $runnerText, [Text.UTF8Encoding]::new($true))
$vbs = Join-Path $stateDir 'run-tunnel-hidden.vbs'
$vbsText = "Set shell = CreateObject(""WScript.Shell"")" + "`r`n" +
  "shell.Run ""conhost.exe --headless powershell.exe -NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File """"$runner"""""", 0, True" + "`r`n"
[IO.File]::WriteAllText($vbs, $vbsText, [Text.Encoding]::Default)

$identity = [Security.Principal.WindowsIdentity]::GetCurrent().Name
$action = New-ScheduledTaskAction -Execute (Join-Path $env:WINDIR 'System32\wscript.exe') -Argument ('//B //NoLogo "' + $vbs + '"') -WorkingDirectory $stateDir
$trigger = New-ScheduledTaskTrigger -AtLogOn -User $identity
$settings = New-ScheduledTaskSettingsSet -ExecutionTimeLimit (New-TimeSpan -Seconds 0) -MultipleInstances IgnoreNew -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1)
$principal = New-ScheduledTaskPrincipal -UserId $identity -LogonType Interactive -RunLevel Limited
Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Settings $settings -Principal $principal -Force | Out-Null
Write-Host (T "Zarejestrowano zadanie '$TaskName' (start przy logowaniu, bez okna)." "Registered task '$TaskName' (starts at logon, no window).")
if (-not $NoStart) { Start-ScheduledTask -TaskName $TaskName; Write-Host (T 'Tunel uruchomiony w tle.' 'Tunnel started in the background.') }
Write-Host "$(T 'Kontrola' 'Check'): &'$($clientExe.FullName)' health --url-file '$(Join-Path $stateDir 'health-url.txt')' --require-control-plane-poll" -ForegroundColor Green

