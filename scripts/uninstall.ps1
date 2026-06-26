#Requires -Version 5.1
$ErrorActionPreference = 'SilentlyContinue'

function Write-Info { Write-Host "==> $args" -ForegroundColor Blue }
function Write-Ok   { Write-Host "✓  $args" -ForegroundColor Green }
function Write-Warn { Write-Host "⚠  $args" -ForegroundColor Yellow }

function Stop-DadumiProcesses {
    $names = @("Dadumi", "tauri-app", "dadumi")
    foreach ($name in $names) {
        $procs = Get-Process -Name $name -ErrorAction SilentlyContinue
        if ($procs) {
            Write-Info "Stopping $name..."
            $procs | Stop-Process -Force -ErrorAction SilentlyContinue
        }
    }
    Start-Sleep -Seconds 2
}

function Remove-IfExists($path) {
    if (Test-Path $path) {
        Remove-Item $path -Recurse -Force -ErrorAction SilentlyContinue
        if (-not (Test-Path $path)) {
            Write-Ok "Removed $path"
        } else {
            Write-Warn "Could not fully remove $path (may need reboot)"
        }
    }
}

Write-Info "Uninstalling Dadumi..."

Stop-DadumiProcesses

$regPaths = @(
    "HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\*",
    "HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\*"
)
$uninstallStr = $null
foreach ($rp in $regPaths) {
    $entry = Get-ItemProperty $rp -ErrorAction SilentlyContinue |
             Where-Object { $_.DisplayName -like "Dadumi*" } |
             Select-Object -First 1
    if ($entry) { $uninstallStr = $entry.UninstallString; break }
}

if ($uninstallStr) {
    Write-Info "Running uninstaller: $uninstallStr"
    if ($uninstallStr -match '(?i)\{([^}]+)\}') {
        $guid = $Matches[1]
        $p = Start-Process "msiexec.exe" -ArgumentList "/x {$guid} /qn /norestart" -Wait -PassThru -ErrorAction SilentlyContinue
        if ($p -and $p.ExitCode -ne 0 -and $p.ExitCode -ne 3010 -and $p.ExitCode -ne 1605) {
            Write-Warn "Uninstaller exited with code $($p.ExitCode)"
        }
    } else {
        $exePath = ($uninstallStr -replace '"', '').Trim()
        if (Test-Path $exePath) {
            Start-Process $exePath -ArgumentList "/S" -Wait -ErrorAction SilentlyContinue
        }
    }
    Write-Ok "Dadumi uninstalled"
} else {
    Remove-IfExists "$env:LOCALAPPDATA\Programs\dadumi"
    Remove-IfExists "$env:LOCALAPPDATA\Programs\Dadumi"
}

Stop-DadumiProcesses

$dataPaths = @(
    "$env:LOCALAPPDATA\com.gayeonlee.dadumi\EBWebView",
    "$env:LOCALAPPDATA\com.gayeonlee.dadumi",
    "$env:APPDATA\com.gayeonlee.dadumi",
    "$env:APPDATA\dadumi",
    "$env:APPDATA\Dadumi",
    "$env:LOCALAPPDATA\dadumi",
    "$env:LOCALAPPDATA\Dadumi"
)
foreach ($path in $dataPaths) {
    Remove-IfExists $path
}

Get-Item "$env:TEMP\dadumi*" -ErrorAction SilentlyContinue | ForEach-Object {
    Remove-Item $_.FullName -Recurse -Force -ErrorAction SilentlyContinue
}

Write-Ok "Dadumi fully removed"
